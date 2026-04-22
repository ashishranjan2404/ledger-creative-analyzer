import pytest
from unittest.mock import AsyncMock, MagicMock, patch
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

    # system is a single merged block (system + cached_context combined)
    system = call_kwargs["system"]
    assert isinstance(system, list)
    assert len(system) == 1, f"Expected exactly 1 system block, got {len(system)}"

    block = system[0]
    assert block["type"] == "text"
    # Both the system prompt and cached context appear in the merged text
    assert "You are a helpful summarizer." in block["text"]
    assert "long rolling transcript here" in block["text"]
    # The block carries cache control
    assert block.get("cache_control", {}).get("type") == "ephemeral"


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


@pytest.mark.asyncio
async def test_complete_returns_text_when_thinking_block_is_first():
    """BUG-A-3: content[0] might be a ThinkingBlock; must skip to first TextBlock."""
    mock_sdk = AsyncMock()
    fake_response = MagicMock()

    # ThinkingBlock has no 'text' attribute (or has thinking, not text)
    thinking_block = MagicMock(spec=[])  # no attributes at all
    text_block = MagicMock()
    text_block.text = "actual answer"

    fake_response.content = [thinking_block, text_block]
    mock_sdk.messages.create = AsyncMock(return_value=fake_response)

    client = AnthropicClient(sdk=mock_sdk)
    out = await client.complete(
        model="claude-sonnet-4-6",
        system="sys",
        cached_context="ctx",
        fresh_input="q",
        max_tokens=100,
    )
    assert out == "actual answer"


@pytest.mark.asyncio
async def test_complete_returns_empty_string_when_content_is_empty():
    """BUG-A-3: empty content list must not raise IndexError."""
    mock_sdk = AsyncMock()
    fake_response = MagicMock()
    fake_response.content = []
    mock_sdk.messages.create = AsyncMock(return_value=fake_response)

    client = AnthropicClient(sdk=mock_sdk)
    out = await client.complete(
        model="claude-sonnet-4-6",
        system="sys",
        cached_context="ctx",
        fresh_input="q",
        max_tokens=100,
    )
    assert out == ""


def test_async_anthropic_receives_30s_timeout():
    """BUG-A-4: AsyncAnthropic must be created with timeout=30.0."""
    with patch("spec_lesson.tiers.client.AnthropicClient.__init__.__module__"):
        pass  # just confirm the import path is right

    captured_kwargs = {}

    class FakeAsyncAnthropic:
        def __init__(self, **kwargs):
            captured_kwargs.update(kwargs)

    with patch("anthropic.AsyncAnthropic", FakeAsyncAnthropic):
        client = AnthropicClient(api_key="test-key")

    assert "timeout" in captured_kwargs, "timeout kwarg must be passed to AsyncAnthropic"
    assert captured_kwargs["timeout"] == 30.0, f"Expected 30.0, got {captured_kwargs['timeout']}"
    assert captured_kwargs["api_key"] == "test-key"
