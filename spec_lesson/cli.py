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


@app.command()
def start(
    transcript_stdin: bool = typer.Option(False, "--transcript-stdin", help="Read JSONL utterances from stdin (Plan 1)"),
):
    """Start a spec-lesson session in the current directory."""
    if not transcript_stdin:
        typer.secho(
            "Plan 1 has no audio capture. Run with --transcript-stdin and pipe utterances.\n"
            "Live audio ships in Plan 2.",
            fg=typer.colors.YELLOW,
        )
        raise typer.Exit(2)

    project_dir = Path.cwd()
    session = Session.new(project_dir=project_dir)
    client = _build_client()
    cfg = _build_cfg()
    orch = Orchestrator(session=session, client=client, config=cfg)

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


@app.command()
def status():
    """Report whether a spec-lesson daemon is running in the current directory."""
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
    """Request graceful shutdown of the running daemon."""
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
