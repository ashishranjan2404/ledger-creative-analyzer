import pytest
from unittest.mock import AsyncMock
from spec_lesson.transcript.buffer import RollingTranscript
from spec_lesson.transcript.utterance import Utterance
from spec_lesson.tiers.base import Distillation
from spec_lesson.tiers.context import ContextTier

def _u(t, text): return Utterance(timestamp=t, speaker="user", text=text, is_final=True)

@pytest.mark.asyncio
async def test_first_run_uses_empty_previous_distillation():
    buf = RollingTranscript()
    buf.append(_u(1.0, "we want X"))
    buf.append(_u(2.0, "and Y"))

    fake_json = '{"topic":"X/Y","decisions":["X"],"requirements":["Y"],"open_questions":[],"recent_verbatim":"we want X and Y"}'
    client = AsyncMock()
    client.complete = AsyncMock(return_value=fake_json)

    tier = ContextTier(client=client, buffer=buf)
    out = await tier.run(now=3.0)
    assert out.topic == "X/Y"
    assert "X" in out.decisions
    assert "Y" in out.requirements
    # first call: cached context should indicate no previous distillation
    call = client.complete.await_args.kwargs
    assert "no previous distillation" in call["cached_context"].lower()

@pytest.mark.asyncio
async def test_second_run_passes_previous_distillation_as_cached_context():
    buf = RollingTranscript()
    buf.append(_u(1.0, "intro"))
    fake_json_1 = '{"topic":"t1","decisions":["d1"],"requirements":[],"open_questions":[],"recent_verbatim":""}'
    fake_json_2 = '{"topic":"t2","decisions":["d2"],"requirements":[],"open_questions":[],"recent_verbatim":""}'
    client = AsyncMock()
    client.complete = AsyncMock(side_effect=[fake_json_1, fake_json_2])
    tier = ContextTier(client=client, buffer=buf)
    await tier.run(now=2.0)
    buf.append(_u(3.0, "more"))
    merged = await tier.run(now=4.0)
    # append-only merge: d1 from first run preserved even if LLM "forgot" it
    assert "d1" in merged.decisions
    assert "d2" in merged.decisions
    # second call cached_context contains prior distillation topic
    second_call = client.complete.await_args_list[1].kwargs
    assert "t1" in second_call["cached_context"]

@pytest.mark.asyncio
async def test_run_tolerates_malformed_json_and_returns_previous():
    buf = RollingTranscript()
    buf.append(_u(1.0, "x"))
    client = AsyncMock()
    client.complete = AsyncMock(return_value="this is not json")
    tier = ContextTier(client=client, buffer=buf)
    out = await tier.run(now=2.0)
    assert out.topic == "(session just started)"
