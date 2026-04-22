"""FAULT-8: context tier failure at shutdown must fall back to last distillation."""
import asyncio
import json
import pytest
from pathlib import Path
from unittest.mock import AsyncMock

from spec_lesson.orchestrator import Orchestrator, OrchestratorConfig
from spec_lesson.session import Session
from spec_lesson.tiers.client import AnthropicClient


_GOOD_CONTEXT = json.dumps({
    "topic": "test topic",
    "decisions": ["decision one"],
    "requirements": [],
    "open_questions": [],
    "recent_verbatim": "",
})


@pytest.mark.asyncio
async def test_shutdown_when_final_context_raises_still_writes(tmp_path: Path):
    """When context tier raises at shutdown, session.md is written using cached distillation."""
    proj = tmp_path / "p"
    proj.mkdir()
    session = Session.new(project_dir=proj)
    client = AsyncMock(spec=AnthropicClient)

    call_count = [0]

    async def fake_complete(**kw):
        call_count[0] += 1
        system = kw.get("system", "")
        # Thread tier response
        if "drift" in system.lower():
            return '{"current_topic":"t","drift":"on","drift_from":""}'
        # Polish tier: always succeed with minimal output
        if "obsidian" in system.lower() or "polish" in system.lower():
            return "# polished note\n\nSummary here."
        # Context tier: first call succeeds, subsequent calls (at shutdown) raise
        if call_count[0] == 1:
            return _GOOD_CONTEXT
        raise RuntimeError("Anthropic 500 at shutdown")

    client.complete = AsyncMock(side_effect=fake_complete)

    cfg = OrchestratorConfig(
        thread_interval=999,
        context_interval=0.05,  # fires quickly so we get one successful context run
        max_seconds=0.3,
    )
    orch = Orchestrator(session=session, client=client, config=cfg)

    async def feed():
        await asyncio.sleep(0.02)
        orch.ingest({"timestamp": 1.0, "speaker": "u", "text": "first utterance", "is_final": True})

    await asyncio.gather(orch.run(), feed())

    # CLAUDE.md must have the managed section from the first successful context run
    claude_md = (proj / "CLAUDE.md").read_text()
    assert "<!-- spec-lesson:start -->" in claude_md

    # session.md must exist — either polished or fallback distillation
    assert session.distillation_md.exists(), "session.md was not written despite context fallback"


@pytest.mark.asyncio
async def test_shutdown_context_never_ran_writes_stub(tmp_path: Path):
    """If context tier never ran (first call raises), session.md still gets something."""
    proj = tmp_path / "p"
    proj.mkdir()
    session = Session.new(project_dir=proj)
    client = AsyncMock(spec=AnthropicClient)

    async def always_fail(**kw):
        raise RuntimeError("always down")

    client.complete = AsyncMock(side_effect=always_fail)

    cfg = OrchestratorConfig(
        thread_interval=999,
        context_interval=999,
        max_seconds=0.2,
    )
    orch = Orchestrator(session=session, client=client, config=cfg)

    async def feed():
        await asyncio.sleep(0.02)
        orch.ingest({"timestamp": 1.0, "speaker": "u", "text": "hello", "is_final": True})

    await asyncio.gather(orch.run(), feed())

    # Daemon must not crash; distillation_md should exist (either polished or fallback)
    # With always-failing context, the fallback is the empty Distillation.render_markdown()
    assert session.distillation_md.exists()
