# tests/integration/test_e2e_live_audio_style.py
# E2E-1: Live AudioSource wiring — mocked AudioSource triggers context refresh
import asyncio
import json
import threading
import pytest
from pathlib import Path
from unittest.mock import AsyncMock
from spec_lesson.orchestrator import Orchestrator, OrchestratorConfig, AudioSource
from spec_lesson.session import Session
from spec_lesson.tiers.client import AnthropicClient


class _FakeAudioSource:
    """Mimics a real AudioSource: registers a callback, then emits utterances from a thread."""

    def __init__(self, utterances: list[dict], delay_per_item: float = 0.02):
        self._utterances = utterances
        self._delay = delay_per_item
        self._cb = None
        self._thread: threading.Thread | None = None

    def on_utterance(self, cb):
        self._cb = cb

    def start(self):
        self._thread = threading.Thread(target=self._pump, daemon=True)
        self._thread.start()

    def stop(self):
        if self._thread is not None:
            self._thread.join(timeout=2.0)

    def _pump(self):
        import time
        time.sleep(0.05)  # let the event loop start
        for u in self._utterances:
            if self._cb:
                self._cb(u)
            time.sleep(self._delay)


UTTERANCES = [
    {"timestamp": 1.0, "speaker": "user", "text": "We are designing a voice assistant", "is_final": True},
    {"timestamp": 10.0, "speaker": "user", "text": "It needs drift detection", "is_final": True},
    {"timestamp": 20.0, "speaker": "user", "text": "OK Claude, build that", "is_final": True},
]


@pytest.mark.asyncio
async def test_live_audio_source_triggers_context_refresh(tmp_path: Path):
    """AudioSource callback thread → call_soon_threadsafe → context tier fires."""

    def _mk_response(*, model, system, cached_context, fresh_input, max_tokens, use_cache=True):
        if "thread" in system.lower():
            return '{"current_topic":"voice tool","drift":"on","drift_from":""}'
        return json.dumps({
            "topic": "voice assistant",
            "decisions": ["drift detection required"],
            "requirements": [],
            "open_questions": [],
            "recent_verbatim": "OK Claude, build that",
        })

    client = AsyncMock(spec=AnthropicClient)
    client.complete = AsyncMock(side_effect=lambda **kw: _mk_response(**kw))

    source = _FakeAudioSource(UTTERANCES)
    project_dir = tmp_path / "proj"
    project_dir.mkdir()
    session = Session.new(project_dir=project_dir)

    cfg = OrchestratorConfig(
        thread_interval=999.0,
        context_interval=999.0,  # only fires via trigger
        max_seconds=0.6,
        pause_threshold=999.0,   # suppress ImmediateTier
    )
    orch = Orchestrator(session=session, client=client, config=cfg, audio_source=source)
    await orch.run()

    # The trigger phrase must have been picked up from the audio thread callback
    triggers_text = session.triggers_log.read_text()
    assert "build that" in triggers_text.lower()

    # CLAUDE.md must contain the managed section written by the context tier
    claude_md = session.claude_md.read_text()
    assert "<!-- spec-lesson:start -->" in claude_md
