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
    out = await tier.run(audio_ts=3.0)
    assert out.topic == "X/Y"
    assert "X" in out.decisions
    assert "Y" in out.requirements
    # first call: cached context should indicate no previous distillation
    call = client.complete.await_args.kwargs
    assert "no previous distillation" in call["cached_context"].lower()
    # Context tier must use Sonnet and enable caching
    assert call["model"] == "claude-sonnet-4-6", f"ContextTier must use claude-sonnet-4-6, got {call['model']!r}"
    assert call.get("use_cache", True) is True, "ContextTier must pass use_cache=True"

@pytest.mark.asyncio
async def test_second_run_passes_previous_distillation_as_cached_context():
    buf = RollingTranscript()
    buf.append(_u(1.0, "intro"))
    fake_json_1 = '{"topic":"t1","decisions":["d1"],"requirements":[],"open_questions":[],"recent_verbatim":""}'
    fake_json_2 = '{"topic":"t2","decisions":["d2"],"requirements":[],"open_questions":[],"recent_verbatim":""}'
    client = AsyncMock()
    client.complete = AsyncMock(side_effect=[fake_json_1, fake_json_2])
    tier = ContextTier(client=client, buffer=buf)
    await tier.run(audio_ts=2.0)
    buf.append(_u(3.0, "more"))
    merged = await tier.run(audio_ts=4.0)
    # append-only merge: d1 from first run preserved even if LLM "forgot" it
    assert "d1" in merged.decisions
    assert "d2" in merged.decisions
    # second call cached_context contains prior distillation topic
    second_call = client.complete.await_args_list[1].kwargs
    assert "t1" in second_call["cached_context"]

@pytest.mark.asyncio
async def test_utterances_arriving_during_llm_call_are_not_skipped():
    """BUG-D-1: utterances appended to the buffer while the LLM await is in-flight
    must be included in the NEXT run, not permanently skipped."""
    buf = RollingTranscript()
    buf.append(_u(1.0, "first"))

    fake_json_1 = '{"topic":"t1","decisions":[],"requirements":[],"open_questions":[],"recent_verbatim":""}'
    fake_json_2 = '{"topic":"t2","decisions":["late"],"requirements":[],"open_questions":[],"recent_verbatim":""}'

    client_calls = []

    async def side_effect(**kwargs):
        # On the FIRST LLM call, simulate an utterance arriving mid-await.
        if len(client_calls) == 0:
            buf.append(_u(5.0, "arrived during LLM call"))
        client_calls.append(kwargs)
        return fake_json_1 if len(client_calls) == 1 else fake_json_2

    client = AsyncMock()
    client.complete = AsyncMock(side_effect=side_effect)

    tier = ContextTier(client=client, buffer=buf)
    await tier.run(audio_ts=2.0)

    # After run 1, boundary_ts was snapshotted at 1.0 (before the late utterance).
    # _last_timestamp_processed must be 1.0, not 5.0.
    assert tier._last_timestamp_processed == 1.0, (
        f"Expected cursor at 1.0 (pre-await snapshot), got {tier._last_timestamp_processed}"
    )

    # Run 2: the late utterance at t=5.0 must appear in the new_utterances.
    buf.append(_u(6.0, "third"))
    merged = await tier.run(audio_ts=7.0)

    # The second LLM call's fresh_input must contain the "arrived during LLM call" text.
    second_call_kwargs = client_calls[1]
    assert "arrived during LLM call" in second_call_kwargs["fresh_input"], (
        "Utterance that arrived during the first LLM call was permanently skipped — BUG-D-1 not fixed"
    )


@pytest.mark.asyncio
async def test_context_cached_context_excludes_recent_verbatim():
    """COST-1: recent_verbatim must NOT appear in the cached_context argument."""
    buf = RollingTranscript()
    buf.append(_u(1.0, "x"))
    client = AsyncMock()
    volatile_verbatim = "volatile text here that should not be cached"
    fake_json_1 = (
        f'{{"topic":"t","decisions":["d"],"requirements":[],"open_questions":[],'
        f'"recent_verbatim":"{volatile_verbatim}"}}'
    )
    fake_json_2 = '{"topic":"t2","decisions":["d"],"requirements":[],"open_questions":[],"recent_verbatim":""}'
    client.complete = AsyncMock(side_effect=[fake_json_1, fake_json_2])

    tier = ContextTier(client=client, buffer=buf)
    await tier.run(audio_ts=1.0)  # first run: sets last.recent_verbatim to volatile_verbatim
    buf.append(_u(2.0, "y"))
    await tier.run(audio_ts=2.0)  # second run

    second_call = client.complete.await_args_list[1].kwargs
    assert volatile_verbatim not in second_call["cached_context"], (
        "recent_verbatim must not appear in cached_context — it breaks cache hit rate"
    )
    # but the stable topic should still be there
    assert "t" in second_call["cached_context"]


@pytest.mark.asyncio
async def test_run_tolerates_malformed_json_and_returns_previous():
    buf = RollingTranscript()
    buf.append(_u(1.0, "x"))
    client = AsyncMock()
    client.complete = AsyncMock(return_value="this is not json")
    tier = ContextTier(client=client, buffer=buf)
    out = await tier.run(audio_ts=2.0)
    assert out.topic == "(session just started)"
