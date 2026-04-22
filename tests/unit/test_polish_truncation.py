"""
Fix 3 — ISSUE-E-4 / EDGE-4:

1. PolishTier.run() passes unbounded full_transcript to the Anthropic API.
   A 90-min session can easily exceed the 200k-token input window, causing
   a 400 error and an empty session.md for the user.

2. Orchestrator._on_shutdown() has no try/except around polish_tier.run().
   Any API failure there prevents the distillation_md write, leaving the
   user with no polished output — even though a valid context distillation
   was already computed.

Tests verify:
  A. PolishTier truncates full_transcript to <=200_000 chars before passing
     it as fresh_input.
  B. _on_shutdown writes the intermediate distillation.md even when
     polish_tier.run() raises.
"""
import asyncio
import json
import pytest
from pathlib import Path
from unittest.mock import AsyncMock, patch

from spec_lesson.tiers.base import Distillation
from spec_lesson.tiers.polish import PolishTier
from spec_lesson.orchestrator import Orchestrator, OrchestratorConfig
from spec_lesson.session import Session
from spec_lesson.tiers.client import AnthropicClient


# ---------------------------------------------------------------------------
# A. PolishTier truncates oversized transcript
# ---------------------------------------------------------------------------

@pytest.mark.asyncio
async def test_polish_truncates_oversize_transcript():
    """fresh_input must be <= 200_000 chars even when transcript is 1 MB."""
    client = AsyncMock()
    client.complete = AsyncMock(return_value="final md")
    tier = PolishTier(client=client)

    huge = "x" * 1_000_000  # 1 MB — far exceeds safe token limit
    await tier.run(final_distillation=Distillation.empty(), full_transcript=huge)

    fresh = client.complete.await_args.kwargs["fresh_input"]
    assert len(fresh) <= 200_000, (
        f"fresh_input was {len(fresh)} chars — must be <=200_000 after truncation"
    )


@pytest.mark.asyncio
async def test_polish_does_not_truncate_short_transcript():
    """Transcripts under the limit must be passed verbatim."""
    client = AsyncMock()
    client.complete = AsyncMock(return_value="ok")
    tier = PolishTier(client=client)

    short = "user: hello\nuser: world"
    await tier.run(final_distillation=Distillation.empty(), full_transcript=short)

    fresh = client.complete.await_args.kwargs["fresh_input"]
    assert short in fresh, "Short transcript must appear verbatim in fresh_input"


@pytest.mark.asyncio
async def test_polish_head_tail_truncation_preserves_both_ends():
    """BUG-D-8: head+tail truncation must preserve the session opening AND
    the most-recent context.  Pure tail truncation dropped the session brief."""
    client = AsyncMock()
    client.complete = AsyncMock(return_value="ok")
    tier = PolishTier(client=client)

    # Build a 1 MB transcript with a unique head sentinel and tail sentinel.
    head_sentinel = "SESSION_OPENING_UNIQUE_MARKER"
    tail_sentinel = "SESSION_ENDING_UNIQUE_MARKER"
    # 1 MB total — well over the 100k-char limit
    filler = "x" * 1_000_000
    huge = head_sentinel + filler + tail_sentinel

    await tier.run(final_distillation=Distillation.empty(), full_transcript=huge)

    fresh = client.complete.await_args.kwargs["fresh_input"]
    assert head_sentinel in fresh, (
        "Head of transcript missing — session brief was dropped by tail-only truncation"
    )
    assert tail_sentinel in fresh, (
        "Tail of transcript missing — most-recent context was lost"
    )
    assert "truncated" in fresh.lower(), (
        "Truncation marker not found — middle was not replaced with ellipsis"
    )


# ---------------------------------------------------------------------------
# B. _on_shutdown writes distillation.md even when PolishTier raises
# ---------------------------------------------------------------------------

@pytest.mark.asyncio
async def test_shutdown_writes_distillation_even_when_polish_fails(tmp_path: Path):
    """
    When polish_tier.run() raises (e.g. API 400 context_length_exceeded),
    _on_shutdown must still write the last context distillation to
    session.distillation_md so the user has *something*.
    """
    project_dir = tmp_path / "p"
    project_dir.mkdir()
    session = Session.new(project_dir=project_dir)

    context_response = json.dumps({
        "topic": "test session",
        "decisions": ["use React"],
        "requirements": ["fast"],
        "open_questions": [],
        "recent_verbatim": "OK Claude build that",
    })

    call_count = 0

    async def _complete_side_effect(**kwargs):
        nonlocal call_count
        call_count += 1
        # All context tier calls return valid distillation JSON.
        # The polish tier call is identified by the POLISH_SYSTEM prompt
        # containing "Obsidian-style note".
        system_text = kwargs.get("system", "")
        if "obsidian" in system_text.lower():
            raise RuntimeError("400 context_length_exceeded")
        return context_response

    client = AsyncMock(spec=AnthropicClient)
    client.complete = AsyncMock(side_effect=_complete_side_effect)

    cfg = OrchestratorConfig(thread_interval=999, context_interval=999, max_seconds=0.3)
    orch = Orchestrator(session=session, client=client, config=cfg)

    async def feed():
        await asyncio.sleep(0.05)
        orch.ingest({
            "timestamp": 1.0,
            "speaker": "user",
            "text": "OK Claude build that",
            "is_final": True,
        })

    await asyncio.gather(orch.run(), feed())

    # distillation_md must exist despite the polish failure
    assert session.distillation_md.exists(), (
        "distillation_md was not written even though context tier succeeded — "
        "polish failure must not prevent the fallback write"
    )
    content = session.distillation_md.read_text()
    assert len(content) > 0, "distillation_md is empty"
