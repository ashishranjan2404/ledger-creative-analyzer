"""Command-line entry point for spec-lesson.

Defines four Typer commands — ``start``, ``status``, ``stop``, ``rollup`` —
and the helper functions that wire together the audio source, Anthropic client,
and Orchestrator before handing off to ``asyncio.run``.
"""
import asyncio
import json
import logging
import os
import sys
import time
from pathlib import Path
from unittest.mock import AsyncMock

import typer

from .orchestrator import Orchestrator, OrchestratorConfig
from .session import Session, SessionSetupError
from .tiers.client import AnthropicClient

# Configure logging so log.warning() appears as "spec-lesson: <msg>" instead of
# the raw Python module path prefix.  This must run before any logger is created.
logging.basicConfig(level=logging.WARNING, format="spec-lesson: %(message)s")

app = typer.Typer(help="spec-lesson: ADHD live meeting assistant", no_args_is_help=True)


def _version_callback(show: bool) -> None:
    if show:
        from spec_lesson import __version__
        typer.echo(f"spec-lesson {__version__}")
        raise typer.Exit(0)


@app.callback()
def _global(
    version: bool = typer.Option(
        False,
        "--version",
        "-V",
        callback=_version_callback,
        is_eager=True,
        help="Show version and exit.",
    ),
) -> None:
    pass


def _canned_response(*, model, system, cached_context, fresh_input, max_tokens, use_cache=True) -> str:
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


def _build_audio_source(observer=None):
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
        typer.secho(
            f"BlackHole not found — capturing mic only (system audio will be missed).\n"
            f"To enable full loopback: brew install blackhole-2ch\n"
            f"Then restart the session.",
            fg=typer.colors.YELLOW,
            err=True,
        )

    stream = DeepgramStream(api_key=dg_key)
    cap = AudioCapture(sink=lambda pcm: None, loopback_index=loopback_idx)

    class _LiveSource:
        def on_utterance(self, cb):
            stream.on_utterance(cb)

        def on_stream_error(self, cb):
            stream.on_error(cb)

        def start(self):
            stream.start()
            cap._sink = stream.send_audio  # rewire after stream is up
            cap.start()

        def stop(self):
            cap.stop()
            stream.stop()

    src = _LiveSource()

    # Wire the audio-disconnect callback to the HUD observer if available.
    if observer is not None:
        import time as _time

        def _on_audio_error(reason: str) -> None:
            elapsed = _time.monotonic()
            observer.on_audio_disconnect(at=elapsed, reason=reason)

        stream.on_error(_on_audio_error)

    return src


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
            "spec-lesson start: choose an input source.\n"
            "  --audio              capture mic + BlackHole (requires DEEPGRAM_API_KEY)\n"
            "  --transcript-stdin   read JSONL utterances from stdin\n\n"
            "macOS users: for --audio, install BlackHole first:\n"
            "  brew install blackhole-2ch && restart",
            fg=typer.colors.RED,
            err=True,
        )
        raise typer.Exit(2)
    if hud not in ("off", "stdout", "tk"):
        typer.secho("--hud must be one of: off, stdout, tk", fg=typer.colors.RED)
        raise typer.Exit(2)

    # SEC-5: audio is transcribed and stored verbatim in JSONL.  Warn the user
    # before any recording begins so they can avoid speaking secrets aloud.
    typer.secho(
        "spec-lesson: audio is recorded and persisted verbatim — avoid speaking passwords or secrets.",
        fg=typer.colors.YELLOW,
        err=True,
    )

    project_dir = Path.cwd()
    try:
        session = Session.new(project_dir=project_dir)
    except SessionSetupError as e:
        typer.secho(f"spec-lesson: {e}", fg=typer.colors.RED)
        raise typer.Exit(1)
    client = _build_client()
    cfg = _build_cfg()

    # Build observer + renderer based on --hud flag (before audio source so we can wire disconnect)
    observer = None
    renderer = None
    if hud != "off":
        from .hud.observer import HudObserver
        observer = HudObserver(max_seconds=cfg.max_seconds)
    if hud == "stdout":
        from .hud.renderer import HudRenderer, StdoutHudRenderer
        renderer: HudRenderer | None = StdoutHudRenderer()
    elif hud == "tk":
        from .hud.renderer import HudRenderer, TkinterHudRenderer
        renderer: HudRenderer | None = TkinterHudRenderer(observer=observer)

    audio_source = _build_audio_source(observer=observer) if audio else None

    orch = Orchestrator(session=session, client=client, config=cfg, audio_source=audio_source, observer=observer)

    start_mono = time.monotonic()

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
            try:
                asyncio.run(main_stdout())
            except KeyboardInterrupt:
                typer.secho("spec-lesson: interrupted by user", fg=typer.colors.YELLOW)
                raise typer.Exit(130)
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
            try:
                asyncio.run(main_no_stdin())
            except KeyboardInterrupt:
                typer.secho("spec-lesson: interrupted by user", fg=typer.colors.YELLOW)
                raise typer.Exit(130)

    # Session-end summary (printed after asyncio.run returns normally or after Ctrl+C)
    elapsed_min = (time.monotonic() - start_mono) / 60.0
    typer.secho(
        f"spec-lesson: session ended after {elapsed_min:.1f} min. "
        f"{len(orch.buffer.all())} utterances. {orch.trigger.fire_count} trigger fire(s). "
        f"Output: {session.distillation_md}",
        fg=typer.colors.GREEN,
    )


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
    """Show whether a spec-lesson session is running in the current directory.

    Reads .spec-lesson/daemon.pid and checks whether the recorded PID is alive.
    Exits 0 in all non-error cases (including 'not running').
    """
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
    if since_hours <= 0:
        typer.secho(
            f"--since-hours must be > 0 (got {since_hours})",
            fg=typer.colors.RED,
            err=True,
        )
        raise typer.Exit(2)
    # SEC-6: reject --out paths outside the user's home directory to prevent
    # accidental writes to system paths.  Absolute paths under /tmp and the
    # current working directory are also permitted (tests and CI use /tmp).
    if out is not None:
        resolved = Path(out).resolve()
        home = Path.home().resolve()
        cwd = Path.cwd().resolve()
        import tempfile
        tmp_dir = Path(tempfile.gettempdir()).resolve()
        try:
            resolved.relative_to(home)
        except ValueError:
            try:
                resolved.relative_to(cwd)
            except ValueError:
                try:
                    resolved.relative_to(tmp_dir)
                except ValueError:
                    typer.secho(
                        f"--out path '{out}' is outside your home directory. "
                        f"Use a path under {home} to prevent accidental writes.",
                        fg=typer.colors.RED,
                        err=True,
                    )
                    raise typer.Exit(2)
    from .rollup.collector import find_session_files, parse_session
    from .rollup.aggregator import render_rollup, filter_by_window
    files = find_session_files(root)
    notes = [n for n in (parse_session(f) for f in files) if n is not None]
    notes = filter_by_window(notes, hours=since_hours)
    md = render_rollup(notes, window_label=f"last {since_hours:g}h", since_hours=since_hours, root=root)
    if out:
        out.parent.mkdir(parents=True, exist_ok=True)
        out.write_text(md, encoding="utf-8")
        typer.echo(f"Wrote rollup to {out}")
    else:
        typer.echo(md)


@app.command()
def stop():
    """Send SIGTERM to the running spec-lesson session in the current directory.

    Reads .spec-lesson/daemon.pid, validates the spec-lesson header (SEC-3),
    then signals the process.  Exits 1 if not running, 2 if the PID file was
    not written by spec-lesson.
    """
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
