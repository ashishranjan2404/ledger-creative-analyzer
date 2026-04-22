# tests/integration/test_e2e_audio_disconnect.py
# E2E-3: "WiFi hiccup" — Deepgram pump fires on_error, HUD records audio_error event
import asyncio
import json
import pytest
from pathlib import Path
from unittest.mock import AsyncMock
from spec_lesson.orchestrator import Orchestrator, OrchestratorConfig, AudioSource
from spec_lesson.session import Session
from spec_lesson.tiers.client import AnthropicClient
from spec_lesson.hud.observer import HudObserver


class _DisconnectingSource:
    """Emits two utterances then fires the error callback to simulate Deepgram drop."""

    def __init__(self, on_disconnect_phrase: str = "WebSocket closed by remote"):
        self._cb = None
        self._err_cb = None
        self._phrase = on_disconnect_phrase

    def on_utterance(self, cb):
        self._cb = cb

    def on_stream_error(self, cb):
        self._err_cb = cb

    def start(self):
        import threading, time

        def _run():
            time.sleep(0.05)
            for u in [
                {"timestamp": 1.0, "speaker": "user", "text": "Planning session start", "is_final": True},
                {"timestamp": 5.0, "speaker": "user", "text": "OK Claude, build that", "is_final": True},
            ]:
                if self._cb:
                    self._cb(u)
                time.sleep(0.02)
            # Simulate surprise disconnect
            if self._err_cb:
                self._err_cb(self._phrase)

        threading.Thread(target=_run, daemon=True).start()

    def stop(self):
        pass


@pytest.mark.asyncio
async def test_audio_disconnect_recorded_in_observer_and_session_still_written(tmp_path: Path):
    def _mk_response(*, model, system, cached_context, fresh_input, max_tokens, use_cache=True):
        if "thread" in system.lower():
            return '{"current_topic":"planning","drift":"on","drift_from":""}'
        if "adhd" in system.lower() or "candidates" in system.lower():
            return '{"candidates":["Sure","Go on","What next?"]}'
        if "writing the final" in system.lower() or "obsidian" in system.lower():
            return (
                "---\ndate: 2026-04-21\nsession: spec-lesson\ntopics: [voice]\n---\n"
                "# Planning\n\n## Summary\nShort.\n\n## Decisions\n- use Deepgram\n\n"
                "## Requirements\n\n## Open questions\n\n## Action items\n"
            )
        return json.dumps({
            "topic": "planning session",
            "decisions": ["use Deepgram"],
            "requirements": [],
            "open_questions": [],
            "recent_verbatim": "OK Claude, build that",
        })

    client = AsyncMock(spec=AnthropicClient)
    client.complete = AsyncMock(side_effect=lambda **kw: _mk_response(**kw))

    observer = HudObserver(max_seconds=300.0)
    source = _DisconnectingSource()
    project_dir = tmp_path / "proj"
    project_dir.mkdir()
    session = Session.new(project_dir=project_dir)

    cfg = OrchestratorConfig(
        thread_interval=999.0,
        context_interval=999.0,
        max_seconds=0.5,
        pause_threshold=999.0,
    )
    # Wire the error callback manually (mirrors cli._LiveSource.on_stream_error)
    orch = Orchestrator(session=session, client=client, config=cfg,
                        audio_source=source, observer=observer)

    def _wire_disconnect(reason: str):
        import time
        elapsed = time.monotonic() - orch._session_start
        observer.on_audio_disconnect(at=elapsed, reason=reason)

    source.on_stream_error(_wire_disconnect)

    await orch.run()

    snap = observer.snapshot()
    assert snap.audio_disconnected is True, "HUD must record the disconnect"
    kinds = [e.kind for e in snap.timeline]
    assert "audio_error" in kinds

    # Session must still have produced a distillation file
    assert session.distillation_md.exists(), "session.md must be written despite disconnect"
