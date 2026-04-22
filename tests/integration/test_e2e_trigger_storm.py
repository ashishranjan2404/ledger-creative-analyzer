# tests/integration/test_e2e_trigger_storm.py
# E2E-4: "Trigger storm" — five trigger phrases in 30 s, cooldown suppresses all but first
import asyncio
import json
import pytest
from pathlib import Path
from unittest.mock import AsyncMock
from spec_lesson.orchestrator import Orchestrator, OrchestratorConfig
from spec_lesson.session import Session
from spec_lesson.tiers.client import AnthropicClient


@pytest.mark.asyncio
async def test_trigger_storm_only_first_fires(tmp_path: Path):
    """Five identical trigger phrases within cooldown window → only one triggers context refresh."""
    context_calls: list[str] = []

    def _mk_response(*, model, system, cached_context, fresh_input, max_tokens, use_cache=True):
        if "thread" in system.lower():
            return '{"current_topic":"voice tool","drift":"on","drift_from":""}'
        if "writing the final" in system.lower() or "obsidian" in system.lower():
            # polish tier — not a context call
            return (
                "---\ndate: 2026-04-21\nsession: spec-lesson\ntopics: [voice]\n---\n"
                "# Voice assistant\n\n## Summary\nShort.\n\n## Decisions\n- use Deepgram\n\n"
                "## Requirements\n\n## Open questions\n\n## Action items\n"
            )
        context_calls.append("context")
        return json.dumps({
            "topic": "voice assistant",
            "decisions": ["use Deepgram"],
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
        context_interval=999.0,  # only fires via trigger
        max_seconds=0.6,
        pause_threshold=999.0,
    )
    orch = Orchestrator(session=session, client=client, config=cfg)
    # Shrink cooldown so we can test suppression without waiting 30 s
    orch.trigger.cooldown_seconds = 60.0  # wider than the test window

    async def feed():
        await asyncio.sleep(0.05)
        # Five trigger phrases 10ms apart — all inside the 60s cooldown window
        for i in range(5):
            orch.ingest({
                "timestamp": float(i),
                "speaker": "user",
                "text": "OK Claude, build that",
                "is_final": True,
            })
            await asyncio.sleep(0.01)

    await asyncio.gather(orch.run(), feed())

    # Trigger log must have exactly one entry
    trigger_lines = [
        ln for ln in session.triggers_log.read_text().splitlines() if ln.strip()
    ]
    assert len(trigger_lines) == 1, (
        f"Expected 1 trigger log entry, got {len(trigger_lines)}: {trigger_lines}"
    )

    # Context tier must have been called exactly once (from trigger) + once at shutdown
    # Upper bound is 2; strictly 1 if shutdown fires before the trigger context call completes
    assert len(context_calls) <= 2
    assert orch.trigger.fire_count == 1
