import asyncio
import json
import pytest
from pathlib import Path
from unittest.mock import AsyncMock
from spec_lesson.orchestrator import Orchestrator, OrchestratorConfig
from spec_lesson.session import Session
from spec_lesson.tiers.client import AnthropicClient


@pytest.mark.asyncio
async def test_observer_exception_does_not_kill_orchestrator(tmp_path: Path):
    project = tmp_path / "p"
    project.mkdir()
    session = Session.new(project_dir=project)
    client = AsyncMock(spec=AnthropicClient)
    client.complete = AsyncMock(
        return_value=json.dumps({
            "topic": "t",
            "decisions": [],
            "requirements": [],
            "open_questions": [],
            "recent_verbatim": "",
        })
    )

    class AngryObserver:
        def on_context(self, **kw): raise RuntimeError("boom")
        def on_thread(self, **kw): raise RuntimeError("boom")
        def on_immediate(self, **kw): raise RuntimeError("boom")
        def on_trigger(self, **kw): raise RuntimeError("boom")
        def on_polish(self, **kw): raise RuntimeError("boom")
        def tick(self, **kw): raise RuntimeError("boom")
        def snapshot(self): return None

    cfg = OrchestratorConfig(thread_interval=999, context_interval=999, max_seconds=0.3)
    orch = Orchestrator(
        session=session, client=client, config=cfg, observer=AngryObserver()
    )

    async def feed():
        await asyncio.sleep(0.02)
        orch.ingest({
            "timestamp": 1.0,
            "speaker": "user",
            "text": "OK Claude build that",
            "is_final": True,
        })

    # should NOT raise
    await asyncio.gather(orch.run(), feed())
    # CLAUDE.md still written despite observer exceptions
    claude_md = (project / "CLAUDE.md").read_text()
    assert "<!-- spec-lesson:start -->" in claude_md
