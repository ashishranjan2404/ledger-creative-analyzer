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

    project_dir = Path.cwd()
    session = Session.new(project_dir=project_dir)
    client = _build_client()
    cfg = _build_cfg()

    audio_source = _build_audio_source() if audio else None
    orch = Orchestrator(session=session, client=client, config=cfg, audio_source=audio_source)

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

        async def main():
            await asyncio.gather(orch.run(), feed_stdin())

        asyncio.run(main())
    else:
        asyncio.run(orch.run())


@app.command()
def status():
    pid_file = Path.cwd() / ".spec-lesson" / "daemon.pid"
    if not pid_file.exists():
        typer.echo("spec-lesson: not running")
        return
    pid = int(pid_file.read_text().strip())
    try:
        os.kill(pid, 0)
    except ProcessLookupError:
        typer.echo(f"spec-lesson: stale pid file (pid {pid} gone) — run again to recover")
        return
    typer.echo(f"spec-lesson: running (pid {pid})")


@app.command()
def stop():
    pid_file = Path.cwd() / ".spec-lesson" / "daemon.pid"
    if not pid_file.exists():
        typer.echo("spec-lesson: not running")
        raise typer.Exit(1)
    pid = int(pid_file.read_text().strip())
    import signal
    os.kill(pid, signal.SIGTERM)
    typer.echo(f"spec-lesson: sent SIGTERM to pid {pid}")


if __name__ == "__main__":
    app()
