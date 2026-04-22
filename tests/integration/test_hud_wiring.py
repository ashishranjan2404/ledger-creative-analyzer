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
    assert snap.trigger_fired_at == 1.0


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
