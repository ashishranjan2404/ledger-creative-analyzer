"""SEC-7: XML wrapping of transcript content in fresh_input.

Verifies that all four tiers wrap user-supplied spoken content in
<transcript>...</transcript> tags, making the boundary between model
instructions and user content unambiguous.
"""
import pytest
from unittest.mock import AsyncMock
from spec_lesson.transcript.buffer import RollingTranscript
from spec_lesson.transcript.utterance import Utterance
from spec_lesson.tiers.base import Distillation
from spec_lesson.tiers.context import ContextTier
from spec_lesson.tiers.immediate import ImmediateTier
from spec_lesson.tiers.thread import ThreadTier
from spec_lesson.tiers.polish import PolishTier


def _u(t, text):
    return Utterance(timestamp=t, speaker="user", text=text, is_final=True)


@pytest.mark.asyncio
async def test_context_tier_wraps_transcript_in_xml():
    """SEC-7: ContextTier must wrap new transcript text in <transcript> tags."""
    buf = RollingTranscript()
    buf.append(_u(1.0, "we need a voice tool"))
    client = AsyncMock()
    client.complete = AsyncMock(
        return_value='{"topic":"t","decisions":[],"requirements":[],"open_questions":[],"recent_verbatim":""}'
    )
    tier = ContextTier(client=client, buffer=buf)
    await tier.run(audio_ts=2.0)
    call = client.complete.await_args.kwargs
    assert "<transcript>" in call["fresh_input"], (
        "SEC-7: ContextTier.fresh_input must contain <transcript> opening tag"
    )
    assert "</transcript>" in call["fresh_input"], (
        "SEC-7: ContextTier.fresh_input must contain </transcript> closing tag"
    )
    # Transcript content must be INSIDE the tags, not outside
    fi = call["fresh_input"]
    open_idx = fi.index("<transcript>")
    close_idx = fi.index("</transcript>")
    assert open_idx < close_idx, "Opening tag must precede closing tag"
    inner = fi[open_idx:close_idx]
    assert "we need a voice tool" in inner, (
        "Utterance text must appear inside <transcript> tags, not outside"
    )


@pytest.mark.asyncio
async def test_immediate_tier_wraps_transcript_in_xml():
    """SEC-7: ImmediateTier must wrap tail transcript in <transcript> tags."""
    buf = RollingTranscript()
    buf.append(_u(1.0, "should we ship HUD?"))
    client = AsyncMock()
    client.complete = AsyncMock(return_value='{"candidates":["yes","no","maybe"]}')
    tier = ImmediateTier(client=client, buffer=buf)
    await tier.run(audio_ts=10.0)
    call = client.complete.await_args.kwargs
    fi = call["fresh_input"]
    assert "<transcript>" in fi and "</transcript>" in fi, (
        "SEC-7: ImmediateTier.fresh_input must be wrapped in <transcript> tags"
    )
    open_idx = fi.index("<transcript>")
    close_idx = fi.index("</transcript>")
    inner = fi[open_idx:close_idx]
    assert "should we ship HUD?" in inner, "Utterance must be inside the XML tags"


@pytest.mark.asyncio
async def test_thread_tier_wraps_transcript_in_xml():
    """SEC-7: ThreadTier must wrap tail transcript in <transcript> tags."""
    buf = RollingTranscript()
    buf.append(_u(1.0, "let us talk about deployment"))
    client = AsyncMock()
    client.complete = AsyncMock(
        return_value='{"current_topic":"deployment","drift":"on","drift_from":""}'
    )
    tier = ThreadTier(client=client, buffer=buf)
    await tier.run(baseline_topic="engineering", audio_ts=10.0)
    call = client.complete.await_args.kwargs
    fi = call["fresh_input"]
    assert "<transcript>" in fi and "</transcript>" in fi, (
        "SEC-7: ThreadTier.fresh_input must be wrapped in <transcript> tags"
    )
    open_idx = fi.index("<transcript>")
    close_idx = fi.index("</transcript>")
    inner = fi[open_idx:close_idx]
    assert "deployment" in inner, "Utterance must be inside the XML tags"


@pytest.mark.asyncio
async def test_polish_tier_wraps_transcript_in_xml():
    """SEC-7: PolishTier must wrap full transcript in <transcript> tags."""
    client = AsyncMock()
    client.complete = AsyncMock(return_value="---\ntitle: test\n---\n# Notes\n")
    tier = PolishTier(client=client)
    final = Distillation(
        topic="test", decisions=[], requirements=[], open_questions=[],
        recent_verbatim="", updated_at_iso="",
    )
    await tier.run(final_distillation=final, full_transcript="speaker: hello world")
    call = client.complete.await_args.kwargs
    fi = call["fresh_input"]
    assert "<transcript>" in fi and "</transcript>" in fi, (
        "SEC-7: PolishTier.fresh_input must be wrapped in <transcript> tags"
    )
    open_idx = fi.index("<transcript>")
    close_idx = fi.index("</transcript>")
    inner = fi[open_idx:close_idx]
    assert "hello world" in inner, "Transcript content must be inside the XML tags"


@pytest.mark.asyncio
async def test_immediate_tier_empty_buffer_uses_silence_tag():
    """SEC-7: ImmediateTier with empty tail must still emit <transcript> wrapper."""
    buf = RollingTranscript()
    # No utterances added; now=0.0 so tail is empty
    client = AsyncMock()
    client.complete = AsyncMock(return_value='{"candidates":[]}')
    tier = ImmediateTier(client=client, buffer=buf)
    await tier.run(audio_ts=0.0)
    call = client.complete.await_args.kwargs
    fi = call["fresh_input"]
    assert "<transcript>" in fi, "Empty tail must still use <transcript> wrapper"
    assert "(silence)" in fi, "Empty tail must include (silence) inside the wrapper"
