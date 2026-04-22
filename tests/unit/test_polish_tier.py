import pytest
from unittest.mock import AsyncMock
from spec_lesson.tiers.base import Distillation
from spec_lesson.tiers.polish import PolishTier


@pytest.mark.asyncio
async def test_polish_returns_markdown_from_client():
    client = AsyncMock()
    client.complete = AsyncMock(return_value="---\ndate: 2026-04-22\n---\n# Meeting\n\n## Summary\nok")
    tier = PolishTier(client=client)
    final = Distillation(
        topic="t", decisions=["d1"], requirements=["r1"], open_questions=[],
        recent_verbatim="", updated_at_iso="",
    )
    md = await tier.run(final_distillation=final, full_transcript="user: hi")
    assert md.startswith("---")
    assert "# Meeting" in md
    # PolishTier must use Sonnet and skip caching (one-shot call)
    call = client.complete.await_args.kwargs
    assert call["model"] == "claude-sonnet-4-6", f"PolishTier must use claude-sonnet-4-6, got {call['model']!r}"
    assert call.get("use_cache", True) is False, "PolishTier must pass use_cache=False"


@pytest.mark.asyncio
async def test_polish_passes_final_distillation_as_cached():
    client = AsyncMock()
    client.complete = AsyncMock(return_value="")
    tier = PolishTier(client=client)
    final = Distillation(
        topic="T", decisions=["D"], requirements=[], open_questions=[],
        recent_verbatim="", updated_at_iso="",
    )
    await tier.run(final_distillation=final, full_transcript="transcript body")
    call = client.complete.await_args.kwargs
    assert "T" in call["cached_context"]
    assert "D" in call["cached_context"]
    assert "transcript body" in call["fresh_input"]
