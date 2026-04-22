# tests/integration/test_e2e_consecutive_sessions.py
# E2E-8: Consecutive sessions — second run accumulates trigger log, both session.md files present
import asyncio
import json
import pytest
from pathlib import Path
from unittest.mock import AsyncMock
from spec_lesson.orchestrator import Orchestrator, OrchestratorConfig
from spec_lesson.session import Session
from spec_lesson.tiers.client import AnthropicClient


async def _run_one_session(project_dir: Path, utterances: list[dict], client) -> Session:
    session = Session.new(project_dir=project_dir)
    cfg = OrchestratorConfig(
        thread_interval=999.0,
        context_interval=999.0,
        max_seconds=0.4,
        pause_threshold=999.0,
    )
    orch = Orchestrator(session=session, client=client, config=cfg)

    async def feed():
        await asyncio.sleep(0.05)
        for u in utterances:
            orch.ingest(u)
            await asyncio.sleep(0.02)

    await asyncio.gather(orch.run(), feed())
    return session


@pytest.mark.asyncio
async def test_consecutive_sessions_accumulate(tmp_path: Path):
    """Second session creates a new session-*.md; triggers.log accumulates both fires."""

    def _mk_response(*, model, system, cached_context, fresh_input, max_tokens, use_cache=True):
        if "thread" in system.lower():
            return '{"current_topic":"voice tool","drift":"on","drift_from":""}'
        if "writing the final" in system.lower() or "obsidian" in system.lower():
            return (
                "---\ndate: 2026-04-21\nsession: spec-lesson\ntopics: [voice]\n---\n"
                "# Session\n\n## Summary\nShort.\n\n## Decisions\n- decided\n\n"
                "## Requirements\n\n## Open questions\n\n## Action items\n"
            )
        return json.dumps({
            "topic": "voice tool", "decisions": ["decided"],
            "requirements": [], "open_questions": [], "recent_verbatim": "OK Claude, build that",
        })

    client = AsyncMock(spec=AnthropicClient)
    client.complete = AsyncMock(side_effect=lambda **kw: _mk_response(**kw))

    project_dir = tmp_path / "proj"
    project_dir.mkdir()

    utterances_a = [
        {"timestamp": 1.0, "speaker": "user", "text": "First session topic", "is_final": True},
        {"timestamp": 5.0, "speaker": "user", "text": "OK Claude, build that", "is_final": True},
    ]
    utterances_b = [
        {"timestamp": 1.0, "speaker": "user", "text": "Second session topic", "is_final": True},
        {"timestamp": 5.0, "speaker": "user", "text": "OK Claude, build it", "is_final": True},
    ]

    session_a = await _run_one_session(project_dir, utterances_a, client)
    # Small gap so IDs differ (they're timestamp-derived)
    await asyncio.sleep(1.1)
    session_b = await _run_one_session(project_dir, utterances_b, client)

    # Both session files must exist and be distinct
    assert session_a.distillation_md.exists(), "session A distillation must exist"
    assert session_b.distillation_md.exists(), "session B distillation must exist"
    assert session_a.distillation_md != session_b.distillation_md, (
        "consecutive sessions must produce distinct session-*.md files"
    )

    # triggers.log accumulates entries from both sessions
    triggers_text = session_b.triggers_log.read_text()  # same file for the project
    entries = [ln for ln in triggers_text.splitlines() if ln.strip()]
    assert len(entries) >= 2, (
        f"triggers.log must have entries from both sessions, found: {entries}"
    )

    # CLAUDE.md is overwritten by the second session — it must contain the managed section
    claude_md = project_dir / "CLAUDE.md"
    assert claude_md.exists()
    assert "<!-- spec-lesson:start -->" in claude_md.read_text()
