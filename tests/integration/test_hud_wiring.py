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
async def test_observer_captures_context_events(tmp_path: Path):
    project = tmp_path / "p"; project.mkdir()
    session = Session.new(project_dir=project)
    client = AsyncMock(spec=AnthropicClient)
    client.complete = AsyncMock(return_value=json.dumps({
        "topic": "design work", "decisions": ["cap 1.5h"],
        "requirements": [], "open_questions": [], "recent_verbatim": ""
    }))
    observer = HudObserver(max_seconds=0.3)
    cfg = OrchestratorConfig(thread_interval=999, context_interval=999, max_seconds=0.3)
    orch = Orchestrator(session=session, client=client, config=cfg, observer=observer)

    async def feed():
        await asyncio.sleep(0.02)
        orch.ingest({"timestamp": 1.0, "speaker": "user", "text": "OK Claude build that", "is_final": True})

    await asyncio.gather(orch.run(), feed())
    snap = observer.snapshot()
    assert snap.topic == "design work"
    assert any(e.kind == "context" for e in snap.timeline)
    # trigger_fired_at is now elapsed wall-clock seconds (not audio timestamp)
    assert snap.trigger_fired_at is not None


@pytest.mark.asyncio
async def test_trigger_event_elapsed_seconds_matches_session_age(tmp_path: Path):
    """Fix 3: on_trigger must pass elapsed (monotonic - session_start), not audio timestamp."""
    import time
    project = tmp_path / "p2"; project.mkdir()
    session = Session.new(project_dir=project)
    client = AsyncMock(spec=AnthropicClient)
    client.complete = AsyncMock(return_value=json.dumps({
        "topic": "t", "decisions": [], "requirements": [], "open_questions": [], "recent_verbatim": ""
    }))
    observer = HudObserver(max_seconds=0.5)
    cfg = OrchestratorConfig(thread_interval=999, context_interval=999, max_seconds=0.5)
    orch = Orchestrator(session=session, client=client, config=cfg, observer=observer)

    ingest_delay = 0.05  # seconds before we fire the trigger utterance

    async def feed():
        await asyncio.sleep(ingest_delay)
        # Audio timestamp (1000.0) is completely different from elapsed wall-clock
        orch.ingest({"timestamp": 1000.0, "speaker": "user", "text": "OK Claude build that", "is_final": True})

    t_before = time.monotonic()
    await asyncio.gather(orch.run(), feed())
    t_after = time.monotonic()

    snap = observer.snapshot()
    assert snap.trigger_fired_at is not None, "trigger_fired_at must be set"
    # elapsed_seconds must be in the range of actual session age, NOT audio timestamp (1000.0)
    session_duration = t_after - t_before
    assert snap.trigger_fired_at < session_duration + 0.5, (
        f"trigger_fired_at={snap.trigger_fired_at} looks like an audio timestamp, not elapsed"
    )
    assert snap.trigger_fired_at != 1000.0, "trigger_fired_at must not be the audio timestamp"
    # Verify the timeline event also uses elapsed_seconds
    trigger_events = [e for e in snap.timeline if e.kind == "trigger"]
    assert len(trigger_events) == 1
    assert trigger_events[0].elapsed_seconds < session_duration + 0.5
    assert trigger_events[0].elapsed_seconds != 1000.0


@pytest.mark.asyncio
async def test_observer_receives_polish_event_at_shutdown(tmp_path: Path):
    project = tmp_path / "p"
    project.mkdir()
    session = Session.new(project_dir=project)
    client = AsyncMock(spec=AnthropicClient)
    client.complete = AsyncMock(return_value=json.dumps({
        "topic": "design work", "decisions": ["cap 1.5h"],
        "requirements": [], "open_questions": [], "recent_verbatim": "",
    }))
    observer = HudObserver(max_seconds=0.3)
    cfg = OrchestratorConfig(thread_interval=999, context_interval=999, max_seconds=0.3)
    orch = Orchestrator(session=session, client=client, config=cfg, observer=observer)

    async def feed():
        await asyncio.sleep(0.02)
        orch.ingest({"timestamp": 1.0, "speaker": "user", "text": "OK Claude build that", "is_final": True})

    await asyncio.gather(orch.run(), feed())
    snap = observer.snapshot()
    assert any(e.kind == "polish" for e in snap.timeline), (
        f"Expected a 'polish' event in timeline, got: {[e.kind for e in snap.timeline]}"
    )
