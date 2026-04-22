import pytest
from unittest.mock import AsyncMock, MagicMock
from spec_lesson.tiers.client import AnthropicClient

@pytest.mark.asyncio
async def test_complete_calls_sdk_with_caching_on_transcript():
    mock_sdk = AsyncMock()
    fake_response = MagicMock()
    fake_response.content = [MagicMock(text="distilled")]
    mock_sdk.messages.create = AsyncMock(return_value=fake_response)

    client = AnthropicClient(sdk=mock_sdk)
    out = await client.complete(
        model="claude-haiku-4-5",
        system="You are a helpful summarizer.",
        cached_context="long rolling transcript here" * 100,
        fresh_input="new 30 seconds",
        max_tokens=200,
    )
    assert out == "distilled"
    call_kwargs = mock_sdk.messages.create.await_args.kwargs
    assert call_kwargs["model"] == "claude-haiku-4-5"
    assert call_kwargs["max_tokens"] == 200
    # system is structured with cache control on the cached block
    system = call_kwargs["system"]
    assert isinstance(system, list)
    types = [b["type"] for b in system]
    assert "text" in types
    # at least one block has cache_control = ephemeral
    assert any(b.get("cache_control", {}).get("type") == "ephemeral" for b in system)

@pytest.mark.asyncio
async def test_complete_passes_fresh_input_as_user_message():
    mock_sdk = AsyncMock()
    fake_response = MagicMock()
    fake_response.content = [MagicMock(text="ok")]
    mock_sdk.messages.create = AsyncMock(return_value=fake_response)
    client = AnthropicClient(sdk=mock_sdk)
    await client.complete(
        model="claude-haiku-4-5",
        system="sys",
        cached_context="ctx",
        fresh_input="hello",
        max_tokens=50,
    )
    messages = mock_sdk.messages.create.await_args.kwargs["messages"]
    assert messages == [{"role": "user", "content": "hello"}]
