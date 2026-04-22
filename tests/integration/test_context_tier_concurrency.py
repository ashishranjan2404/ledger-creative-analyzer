"""Integration test: concurrent calls to ContextTier.run() must serialize."""
import asyncio
import pytest
from unittest.mock import AsyncMock
from spec_lesson.transcript.buffer import RollingTranscript
from spec_lesson.transcript.utterance import Utterance
from spec_lesson.tiers.context import ContextTier


def _u(t, text):
    return Utterance(timestamp=t, speaker="user", text=text, is_final=True)


@pytest.mark.asyncio
async def test_concurrent_run_serializes():
    """SHUTDOWN-1: two concurrent run() calls must not interleave API calls."""
    client = AsyncMock()
    call_log = []

    async def slow_complete(**kw):
        call_log.append("start")
        await asyncio.sleep(0.05)  # simulate an in-flight API call
        call_log.append("end")
        return '{"topic":"t","decisions":[],"requirements":[],"open_questions":[],"recent_verbatim":""}'

    client.complete = slow_complete

    buf = RollingTranscript()
    buf.append(_u(1.0, "first utterance"))

    tier = ContextTier(client=client, buffer=buf)

    # Fire two concurrent runs — without the lock these would interleave
    await asyncio.gather(tier.run(audio_ts=1.0), tier.run(audio_ts=1.0))

    # Must be strictly sequential: start, end, start, end — never start, start, end, end
    assert call_log == ["start", "end", "start", "end"], (
        f"Concurrent runs interleaved API calls — SHUTDOWN-1 not fixed. Log: {call_log}"
    )
