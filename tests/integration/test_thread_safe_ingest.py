"""
Fix 1 — BUG-C-1 / BUG-E-2:  asyncio.create_task called from a non-loop
thread inside Orchestrator.ingest() raises RuntimeError and silently drops
context-tier trigger fires when the audio source callback runs in a
background thread (DeepgramStream pump pattern).
"""
import asyncio
import json
import threading
import pytest
from pathlib import Path
from unittest.mock import AsyncMock

from spec_lesson.orchestrator import Orchestrator, OrchestratorConfig
from spec_lesson.session import Session
from spec_lesson.tiers.client import AnthropicClient


class FakeThreadedAudio:
    """Simulates an audio source whose callback fires from a worker thread."""

    def __init__(self):
        self._cb = None

    def on_utterance(self, cb):
        self._cb = cb

    def start(self):
        pass

    def stop(self):
        pass

    def push_from_thread(self, payload: dict):
        """Calls the registered callback from a *new* non-loop thread."""
        exc_holder = []

        def _run():
            try:
                self._cb(payload)
            except Exception as e:
                exc_holder.append(e)

        t = threading.Thread(target=_run)
        t.start()
        t.join(timeout=2.0)
        if exc_holder:
            raise exc_holder[0]


@pytest.mark.asyncio
async def test_ingest_from_background_thread_fires_trigger(tmp_path: Path):
    """
    When ingest() is called from a worker thread (audio pump pattern),
    the trigger must still schedule the context runner on the event loop
    and write triggers.log.  Before the fix this raises RuntimeError inside
    the thread (silently swallowed) and triggers.log is never created.
    """
    project_dir = tmp_path / "p"
    project_dir.mkdir()
    session = Session.new(project_dir=project_dir)

    client = AsyncMock(spec=AnthropicClient)
    client.complete = AsyncMock(return_value=json.dumps({
        "topic": "voice tool",
        "decisions": [],
        "requirements": [],
        "open_questions": [],
        "recent_verbatim": "",
    }))

    cfg = OrchestratorConfig(
        thread_interval=999,
        context_interval=999,
        max_seconds=0.4,
    )

    src = FakeThreadedAudio()
    orch = Orchestrator(session=session, client=client, config=cfg, audio_source=src)

    trigger_utterance = {
        "timestamp": 1.0,
        "speaker": "user",
        "text": "OK Claude build that",
        "is_final": True,
    }

    async def feed():
        # Let the event loop start before pushing from thread
        await asyncio.sleep(0.05)
        src.push_from_thread(trigger_utterance)
        # Allow scheduled task to execute
        await asyncio.sleep(0.1)

    await asyncio.gather(orch.run(), feed())

    # The trigger must have fired — triggers.log must exist and contain the text
    triggers_log = session.state_dir / "triggers.log"
    assert triggers_log.exists(), (
        "triggers.log was not created — trigger failed to fire from background thread"
    )
    content = triggers_log.read_text()
    assert "build that" in content.lower(), (
        f"Expected 'build that' in triggers.log, got: {content!r}"
    )
