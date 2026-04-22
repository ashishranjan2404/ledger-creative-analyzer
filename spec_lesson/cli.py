import asyncio
import json
import os
import sys
from pathlib import Path
from unittest.mock import AsyncMock

import typer

from .orchestrator import Orchestrator, OrchestratorConfig
from .session import Session
from .tiers.client import AnthropicClient

app = typer.Typer(help="spec-lesson: ADHD live meeting assistant", no_args_is_help=True)


def _canned_response(*, model, system, cached_context, fresh_input, max_tokens) -> str:
    if "thread" in system.lower():
        return '{"current_topic":"fake","drift":"on","drift_from":""}'
    if "respond in real time" in system.lower():
        return '{"candidates":["ok","understood","can you clarify?"]}'
    return json.dumps({
        "topic": "(fake) captured session",
        "decisions": ["decision from fake api"],
        "requirements": ["req from fake api"],
        "open_questions": [],
        "recent_verbatim": fresh_input[-200:],
    })


def _build_client() -> AnthropicClient:
    if os.environ.get("SPEC_LESSON_FAKE_API") == "1":
        sdk = AsyncMock()
        client = AnthropicClient(sdk=sdk)
        client.complete = AsyncMock(side_effect=lambda **kw: _canned_response(**kw))
        return client
    return AnthropicClient(sdk=None, api_key=os.environ.get("ANTHROPIC_API_KEY"))


def _build_cfg() -> OrchestratorConfig:
    cfg = OrchestratorConfig()
    override = os.environ.get("SPEC_LESSON_MAX_SECONDS")
    if override:
        cfg.max_seconds = float(override)
    return cfg


def _build_audio_source():
    from .capture.devices import find_blackhole_device, DeviceError
    from .capture.deepgram_stream import DeepgramStream
    from .capture.audio_input import AudioCapture

    dg_key = os.environ.get("DEEPGRAM_API_KEY")
    if not dg_key:
        typer.secho("DEEPGRAM_API_KEY is not set. Get one at https://deepgram.com", fg=typer.colors.RED)
        raise typer.Exit(1)

    loopback_idx = None
    try:
        loopback_idx = find_blackhole_device()
    except DeviceError as e:
        typer.secho(f"Warning: {e}\nProceeding with mic-only capture.", fg=typer.colors.YELLOW)

    stream = DeepgramStream(api_key=dg_key)
    cap = AudioCapture(sink=lambda pcm: None, loopback_index=loopback_idx)

    class _LiveSource:
        def on_utterance(self, cb):
            stream.on_utterance(cb)
        def start(self):
            stream.start()
            cap._sink = stream.send_audio  # rewire after stream is up
            cap.start()
        def stop(self):
            cap.stop()
            stream.stop()

    return _LiveSource()


@app.command()
def start(
    transcript_stdin: bool = typer.Option(False, "--transcript-stdin", help="Read JSONL utterances from stdin"),
    audio: bool = typer.Option(False, "--audio", help="Capture mic + BlackHole loopback, transcribe via Deepgram"),
    hud: str = typer.Option("off", "--hud", help="HUD mode: off | stdout | tk"),
):
    """Start a spec-lesson session in the current directory."""
    if transcript_stdin and audio:
        typer.secho("--transcript-stdin and --audio are mutually exclusive", fg=typer.colors.RED)
        raise typer.Exit(2)
    if not (transcript_stdin or audio):
        typer.secho(
            "Choose a source: --audio (live) or --transcript-stdin (Plan 1 stdin).",
            fg=typer.colors.YELLOW,
        )
        raise typer.Exit(2)
    if hud not in ("off", "stdout", "tk"):
        typer.secho("--hud must be one of: off, stdout, tk", fg=typer.colors.RED)
        raise typer.Exit(2)

    project_dir = Path.cwd()
    session = Session.new(project_dir=project_dir)
    client = _build_client()
    cfg = _build_cfg()

    audio_source = _build_audio_source() if audio else None

    # Build observer + renderer based on --hud flag
    observer = None
    renderer = None
    if hud != "off":
        from .hud.observer import HudObserver
        observer = HudObserver(max_seconds=cfg.max_seconds)
    if hud == "stdout":
        from .hud.renderer import StdoutHudRenderer
        renderer = StdoutHudRenderer()
    elif hud == "tk":
        from .hud.renderer import TkinterHudRenderer
        renderer = TkinterHudRenderer(observer=observer)

    orch = Orchestrator(session=session, client=client, config=cfg, audio_source=audio_source, observer=observer)

    if transcript_stdin:
        async def feed_stdin():
            loop = asyncio.get_running_loop()
            reader = asyncio.StreamReader()
            protocol = asyncio.StreamReaderProtocol(reader)
            await loop.connect_read_pipe(lambda: protocol, sys.stdin)
            while True:
                line = await reader.readline()
                if not line:
                    break
                line_s = line.decode("utf-8").strip()
                if not line_s:
                    continue
                try:
                    payload = json.loads(line_s)
                except json.JSONDecodeError:
                    continue
                orch.ingest(payload)

        if hud == "tk":
            import threading
            async def main():
                await asyncio.gather(orch.run(), feed_stdin())
            t = threading.Thread(target=lambda: asyncio.run(main()), daemon=True)
            t.start()
            renderer.mainloop()
        else:
            async def main_stdout():
                async def poll_renderer():
                    while True:
                        await asyncio.sleep(2.0)
                        if renderer is not None and observer is not None:
                            renderer.render(observer.snapshot())
                tasks = [orch.run(), feed_stdin()]
                if renderer is not None:
                    tasks.append(poll_renderer())
                await asyncio.gather(*tasks)
            asyncio.run(main_stdout())
    else:
        if hud == "tk":
            import threading
            t = threading.Thread(target=lambda: asyncio.run(orch.run()), daemon=True)
            t.start()
            renderer.mainloop()
        else:
            async def main_no_stdin():
                async def poll_renderer():
                    while True:
                        await asyncio.sleep(2.0)
                        if renderer is not None and observer is not None:
                            renderer.render(observer.snapshot())
                tasks = [orch.run()]
                if renderer is not None:
                    tasks.append(poll_renderer())
                await asyncio.gather(*tasks)
            asyncio.run(main_no_stdin())


def _read_pid_file(pid_file: Path) -> tuple[int | None, str]:
    """Parse a spec-lesson PID file.

    Returns ``(pid, error_message)``.  On success ``error_message`` is ``""``.
    SEC-3: the file must start with the ``spec-lesson`` header line so we can
    distinguish our own PID files from arbitrary integers written by other tools
    or a recycled-PID attack.
    """
    from spec_lesson.lifecycle import PID_FILE_HEADER  # avoid circular at module level
    if not pid_file.exists():
        return None, "not_found"
    content = pid_file.read_text()
    lines = content.splitlines()
    if not lines or lines[0] != PID_FILE_HEADER or len(lines) < 2:
        return None, "bad_header"
    try:
        return int(lines[1]), ""
    except ValueError:
        return None, "corrupt"


@app.command()
def status():
    pid_file = Path.cwd() / ".spec-lesson" / "daemon.pid"
    pid, err = _read_pid_file(pid_file)
    if err == "not_found":
        typer.echo("spec-lesson: not running")
        return
    if err in ("bad_header", "corrupt"):
        typer.secho(
            "spec-lesson: PID file not written by spec-lesson; ignoring",
            fg=typer.colors.YELLOW,
        )
        return
    try:
        os.kill(pid, 0)
    except ProcessLookupError:
        typer.echo(f"spec-lesson: stale pid file (pid {pid} gone) — run again to recover")
        return
    typer.echo(f"spec-lesson: running (pid {pid})")


@app.command()
def rollup(
    since_hours: float = typer.Option(24.0, "--since-hours", help="Window in hours"),
    root: Path = typer.Option(Path.home(), "--root", help="Directory to scan for .spec-lesson/ session files"),
    out: Path = typer.Option(None, "--out", help="Output path; default stdout"),
):
    """Aggregate recent spec-lesson sessions into a rollup markdown."""
    from .rollup.collector import find_session_files, parse_session
    from .rollup.aggregator import render_rollup, filter_by_window
    files = find_session_files(root)
    notes = [n for n in (parse_session(f) for f in files) if n is not None]
    notes = filter_by_window(notes, hours=since_hours)
    md = render_rollup(notes, window_label=f"last {since_hours:g}h")
    if out:
        out.parent.mkdir(parents=True, exist_ok=True)
        out.write_text(md, encoding="utf-8")
        typer.echo(f"Wrote rollup to {out}")
    else:
        typer.echo(md)


@app.command()
def stop():
    pid_file = Path.cwd() / ".spec-lesson" / "daemon.pid"
    pid, err = _read_pid_file(pid_file)
    if err == "not_found":
        typer.echo("spec-lesson: not running")
        raise typer.Exit(1)
    if err in ("bad_header", "corrupt"):
        # SEC-3: refuse to send SIGTERM to an unvalidated PID — could kill an
        # unrelated process if the OS recycled the PID or another tool wrote
        # the file.
        typer.secho(
            "spec-lesson: PID file not written by spec-lesson; refusing to signal",
            fg=typer.colors.RED,
        )
        raise typer.Exit(2)
    import signal
    os.kill(pid, signal.SIGTERM)
    typer.echo(f"spec-lesson: sent SIGTERM to pid {pid}")


if __name__ == "__main__":
    app()
