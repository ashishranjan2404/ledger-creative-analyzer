# tests/integration/test_e2e_sigterm_polish.py
# E2E-6: "No observer" path — observer=None does not crash at any tier callback site
import asyncio
import json
import pytest
from pathlib import Path
from unittest.mock import AsyncMock
from spec_lesson.orchestrator import Orchestrator, OrchestratorConfig
from spec_lesson.session import Session
from spec_lesson.tiers.client import AnthropicClient


@pytest.mark.asyncio
async def test_session_runs_without_observer(tmp_path: Path):
    """observer=None (production default with --hud=off) must not raise at any callback site."""

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
            "decisions": ["one decision"],
            "requirements": [],
            "open_questions": [],
            "recent_verbatim": "OK Claude, build that",
        })

    client = AsyncMock(spec=AnthropicClient)
    client.complete = AsyncMock(side_effect=lambda **kw: _mk_response(**kw))

    project_dir = tmp_path / "proj"
    project_dir.mkdir()
    session = Session.new(project_dir=project_dir)

    cfg = OrchestratorConfig(
        thread_interval=999.0,
        context_interval=999.0,
        max_seconds=0.5,
        pause_threshold=999.0,
    )
    # observer explicitly None — this is the production --hud=off path
    orch = Orchestrator(session=session, client=client, config=cfg, observer=None)

    async def feed():
        await asyncio.sleep(0.05)
        for i, text in enumerate([
            "We need a voice assistant",
            "With drift detection",
            "OK Claude, build that",
        ]):
            orch.ingest({"timestamp": float(i * 10), "speaker": "user", "text": text, "is_final": True})
            await asyncio.sleep(0.02)

    # Must not raise
    await asyncio.gather(orch.run(), feed())

    assert session.distillation_md.exists()
    assert session.triggers_log.exists()
