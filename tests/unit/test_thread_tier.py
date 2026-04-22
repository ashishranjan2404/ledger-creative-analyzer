import pytest
from unittest.mock import AsyncMock
from spec_lesson.transcript.buffer import RollingTranscript
from spec_lesson.transcript.utterance import Utterance
from spec_lesson.tiers.thread import ThreadTier, DriftState


def _u(t, text):
    return Utterance(timestamp=t, speaker="user", text=text, is_final=True)


@pytest.mark.asyncio
async def test_detects_on_topic():
    buf = RollingTranscript()
    buf.append(_u(1.0, "still talking about API design"))
    client = AsyncMock()
    client.complete = AsyncMock(
        return_value='{"current_topic":"API design","drift":"on","drift_from":""}'
    )
    tier = ThreadTier(client=client, buffer=buf)
    state = await tier.run(baseline_topic="API design", audio_ts=2.0)
    assert state.drift == "on"
    assert state.current_topic == "API design"
    assert state.drift_from == ""
    # Thread tier must use Haiku and skip caching (block too small for cache threshold)
    call = client.complete.await_args.kwargs
    assert call["model"] == "claude-haiku-4-5", f"ThreadTier must use claude-haiku-4-5, got {call['model']!r}"
    assert call.get("use_cache", True) is False, "ThreadTier must pass use_cache=False"


@pytest.mark.asyncio
async def test_detects_drifting():
    buf = RollingTranscript()
    buf.append(_u(1.0, "what's for dinner tonight"))
    client = AsyncMock()
    client.complete = AsyncMock(
        return_value='{"current_topic":"dinner plans","drift":"drifting","drift_from":"API design"}'
    )
    tier = ThreadTier(client=client, buffer=buf)
    state = await tier.run(baseline_topic="API design", audio_ts=2.0)
    assert state.drift == "drifting"
    assert state.drift_from == "API design"


@pytest.mark.asyncio
async def test_malformed_json_returns_unknown_state():
    buf = RollingTranscript()
    buf.append(_u(1.0, "..."))
    client = AsyncMock()
    client.complete = AsyncMock(return_value="not json")
    tier = ThreadTier(client=client, buffer=buf)
    state = await tier.run(baseline_topic="X", audio_ts=2.0)
    assert state.drift == "unknown"
