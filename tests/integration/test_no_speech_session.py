"""FAULT-6: when no utterances arrive, _on_shutdown must write a stub session.md."""
import asyncio
import pytest
from pathlib import Path
from unittest.mock import AsyncMock

from spec_lesson.orchestrator import Orchestrator, OrchestratorConfig
from spec_lesson.session import Session
from spec_lesson.tiers.client import AnthropicClient


@pytest.mark.asyncio
async def test_no_speech_session_writes_stub(tmp_path: Path):
    proj = tmp_path / "p"
    proj.mkdir()
    session = Session.new(project_dir=proj)
    client = AsyncMock(spec=AnthropicClient)
    client.complete = AsyncMock(return_value="")
    cfg = OrchestratorConfig(thread_interval=999, context_interval=999, max_seconds=0.15)
    orch = Orchestrator(session=session, client=client, config=cfg)

    await orch.run()  # no feed — buffer stays empty

    assert session.distillation_md.exists(), "stub session.md was not written"
    md = session.distillation_md.read_text()
    assert "no speech detected" in md.lower()


@pytest.mark.asyncio
async def test_no_speech_session_does_not_call_llm(tmp_path: Path):
    """LLM client must NOT be called when there is nothing to distil."""
    proj = tmp_path / "p"
    proj.mkdir()
    session = Session.new(project_dir=proj)
    client = AsyncMock(spec=AnthropicClient)
    client.complete = AsyncMock(return_value="")
    cfg = OrchestratorConfig(thread_interval=999, context_interval=999, max_seconds=0.15)
    orch = Orchestrator(session=session, client=client, config=cfg)

    await orch.run()

    # Context/Polish tiers must not fire on empty buffer
    assert client.complete.call_count == 0
