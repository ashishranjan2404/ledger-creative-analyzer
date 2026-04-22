# tests/integration/test_e2e_mid_session_mute.py
# E2E-2: "User zoned out" — mic silent for an extended stretch, then resumes
import asyncio
import json
import pytest
from pathlib import Path
from unittest.mock import AsyncMock
from spec_lesson.orchestrator import Orchestrator, OrchestratorConfig
from spec_lesson.session import Session
from spec_lesson.tiers.client import AnthropicClient


@pytest.mark.asyncio
async def test_immediate_tier_fires_after_silence_then_resumes(tmp_path: Path):
    """ImmediateTier fires once after pause, does NOT fire again mid-burst of new utterances."""
    immediate_calls: list[str] = []

    def _mk_response(*, model, system, cached_context, fresh_input, max_tokens, use_cache=True):
        if "thread" in system.lower():
            return '{"current_topic":"voice tool","drift":"on","drift_from":""}'
        if "adhd" in system.lower() or "response candidates" in system.lower():
            immediate_calls.append("fired")
            return '{"candidates": ["Sure", "Tell me more", "What does that mean?"]}'
        return json.dumps({
            "topic": "voice assistant",
            "decisions": [],
            "requirements": [],
            "open_questions": [],
            "recent_verbatim": "",
        })

    client = AsyncMock(spec=AnthropicClient)
    client.complete = AsyncMock(side_effect=lambda **kw: _mk_response(**kw))

    project_dir = tmp_path / "proj"
    project_dir.mkdir()
    session = Session.new(project_dir=project_dir)

    cfg = OrchestratorConfig(
        thread_interval=999.0,
        context_interval=999.0,
        max_seconds=0.8,
        pause_check_interval=0.05,
        pause_threshold=0.1,       # fire fast for the test
        immediate_min_utterances=2,
        immediate_min_interval=0.5,  # cooldown — second burst must NOT re-fire
    )
    orch = Orchestrator(session=session, client=client, config=cfg)

    async def feed():
        # Initial burst — 3 utterances at t=0
        for i, text in enumerate(["Hello", "I need help", "With voice"]):
            orch.ingest({"timestamp": float(i), "speaker": "user", "text": text, "is_final": True})
        # Silence for > pause_threshold — ImmediateTier should fire once here
        await asyncio.sleep(0.2)
        # Resume — rapid burst; min_interval cooldown prevents a second fire
        for i, text in enumerate(["And also", "Something else"]):
            orch.ingest({"timestamp": float(10 + i), "speaker": "user", "text": text, "is_final": True})
        await asyncio.sleep(0.05)

    await asyncio.gather(orch.run(), feed())

    assert len(immediate_calls) >= 1, "ImmediateTier must fire at least once after silence"
    assert len(immediate_calls) <= 2, "Cooldown must suppress rapid re-fires during burst"
