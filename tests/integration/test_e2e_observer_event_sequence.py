# tests/integration/test_e2e_observer_event_sequence.py
# E2E-7: HUD observer event sequence — snapshot contains all expected kinds in order
import asyncio
import json
import pytest
from pathlib import Path
from unittest.mock import AsyncMock
from spec_lesson.orchestrator import Orchestrator, OrchestratorConfig
from spec_lesson.session import Session
from spec_lesson.tiers.client import AnthropicClient
from spec_lesson.hud.observer import HudObserver


@pytest.mark.asyncio
async def test_observer_timeline_contains_trigger_and_polish_in_order(tmp_path: Path):
    """snapshot().timeline must have a 'trigger' event followed eventually by a 'polish' event."""

    def _mk_response(*, model, system, cached_context, fresh_input, max_tokens, use_cache=True):
        if "thread" in system.lower():
            return '{"current_topic":"voice tool","drift":"on","drift_from":""}'
        if "writing the final" in system.lower() or "obsidian" in system.lower():
            return (
                "---\ndate: 2026-04-21\nsession: spec-lesson\ntopics: [voice]\n---\n"
                "# Voice tool\n\n## Summary\nShort.\n\n## Decisions\n- one\n\n"
                "## Requirements\n\n## Open questions\n\n## Action items\n"
            )
        return json.dumps({
            "topic": "voice tool",
            "decisions": ["one"],
            "requirements": [],
            "open_questions": [],
            "recent_verbatim": "OK Claude, build that",
        })

    client = AsyncMock(spec=AnthropicClient)
    client.complete = AsyncMock(side_effect=lambda **kw: _mk_response(**kw))

    observer = HudObserver(max_seconds=300.0)
    project_dir = tmp_path / "proj"
    project_dir.mkdir()
    session = Session.new(project_dir=project_dir)

    cfg = OrchestratorConfig(
        thread_interval=999.0,
        context_interval=999.0,  # fires only via trigger
        max_seconds=0.6,
        pause_threshold=999.0,
    )
    orch = Orchestrator(session=session, client=client, config=cfg, observer=observer)

    async def feed():
        await asyncio.sleep(0.05)
        for i, text in enumerate([
            "Let's design the voice assistant",
            "It needs drift detection",
            "OK Claude, build that",   # fires trigger → context → observer.on_trigger + on_context
        ]):
            orch.ingest({"timestamp": float(i * 10), "speaker": "user", "text": text, "is_final": True})
            await asyncio.sleep(0.02)

    await asyncio.gather(orch.run(), feed())

    snap = observer.snapshot()
    kinds = [e.kind for e in snap.timeline]

    assert "trigger" in kinds, f"'trigger' event missing from timeline: {kinds}"
    assert "polish" in kinds, f"'polish' event missing from timeline: {kinds}"

    trigger_idx = next(i for i, k in enumerate(kinds) if k == "trigger")
    polish_idx = next(i for i, k in enumerate(kinds) if k == "polish")
    assert trigger_idx < polish_idx, (
        f"'trigger' (idx {trigger_idx}) must precede 'polish' (idx {polish_idx}) in timeline"
    )

    # Polish is always the last substantive event
    assert kinds[-1] == "polish", f"'polish' must be the final timeline event, got: {kinds[-1]}"
