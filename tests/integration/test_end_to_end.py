import asyncio
import json
import pytest
from pathlib import Path
from unittest.mock import AsyncMock
from spec_lesson.orchestrator import Orchestrator, OrchestratorConfig
from spec_lesson.session import Session
from spec_lesson.tiers.client import AnthropicClient

FIXTURE = Path(__file__).parent / "fixtures" / "meeting_transcript.jsonl"

@pytest.mark.asyncio
async def test_end_to_end_fixture_run(tmp_path: Path):
    # arrange: mock client returns a valid distillation JSON each call
    def _mk_response(*, model, system, cached_context, fresh_input, max_tokens, use_cache=True):
        if "thread" in system.lower():
            return '{"current_topic":"voice tool","drift":"on","drift_from":""}'
        # context
        return json.dumps({
            "topic": "ADHD voice assistant",
            "decisions": ["1.5h hard cap"],
            "requirements": ["drift detection", "response suggestions"],
            "open_questions": [],
            "recent_verbatim": "OK Claude, build that",
        })

    client = AsyncMock(spec=AnthropicClient)
    client.complete = AsyncMock(side_effect=lambda **kw: _mk_response(**kw))

    project_dir = tmp_path / "proj"
    project_dir.mkdir()
    session = Session.new(project_dir=project_dir)

    cfg = OrchestratorConfig(
        thread_interval=999.0,   # effectively disabled
        context_interval=999.0,  # only fires from trigger
        max_seconds=0.5,
    )
    orch = Orchestrator(session=session, client=client, config=cfg)

    # feed utterances from fixture
    lines = FIXTURE.read_text().strip().splitlines()

    async def feed():
        await asyncio.sleep(0.05)
        for line in lines:
            orch.ingest(json.loads(line))
            await asyncio.sleep(0.02)

    await asyncio.gather(orch.run(), feed())

    # assert CLAUDE.md has the managed section
    claude_md = (project_dir / "CLAUDE.md").read_text()
    assert "<!-- spec-lesson:start -->" in claude_md
    assert "ADHD voice assistant" in claude_md
    assert "1.5h hard cap" in claude_md

    # assert trigger was logged
    triggers = (session.state_dir / "triggers.log").read_text()
    assert "build that" in triggers.lower()

    # assert JSONL transcript persisted all finals
    jsonl = session.transcript_jsonl.read_text().strip().splitlines()
    assert len(jsonl) == 5
