import pytest
from unittest.mock import AsyncMock
from spec_lesson.transcript.buffer import RollingTranscript
from spec_lesson.transcript.utterance import Utterance
from spec_lesson.tiers.immediate import ImmediateTier, ResponseSuggestions

def _u(t, text): return Utterance(timestamp=t, speaker="user", text=text, is_final=True)

@pytest.mark.asyncio
async def test_returns_three_suggestions():
    buf = RollingTranscript()
    buf.append(_u(1.0, "we're debating whether to use Deepgram or Whisper"))
    client = AsyncMock()
    client.complete = AsyncMock(return_value='{"candidates":["Deepgram is faster","Whisper is local","What are the latency needs?"]}')
    tier = ImmediateTier(client=client, buffer=buf)
    out = await tier.run(now=10.0)
    assert isinstance(out, ResponseSuggestions)
    assert out.candidates == [
        "Deepgram is faster",
        "Whisper is local",
        "What are the latency needs?",
    ]

@pytest.mark.asyncio
async def test_malformed_json_returns_empty():
    buf = RollingTranscript()
    buf.append(_u(1.0, "x"))
    client = AsyncMock()
    client.complete = AsyncMock(return_value="not json")
    tier = ImmediateTier(client=client, buffer=buf)
    out = await tier.run(now=2.0)
    assert out.candidates == []

@pytest.mark.asyncio
async def test_trims_candidates_to_three_if_more_returned():
    buf = RollingTranscript()
    buf.append(_u(1.0, "x"))
    client = AsyncMock()
    client.complete = AsyncMock(return_value='{"candidates":["a","b","c","d","e"]}')
    tier = ImmediateTier(client=client, buffer=buf)
    out = await tier.run(now=2.0)
    assert out.candidates == ["a", "b", "c"]
