from typing import Any, Optional


class AnthropicClient:
    """Thin wrapper over anthropic.AsyncAnthropic that structures the prompt
    so the rolling transcript is cached (90% discount on subsequent calls).

    The `system` field is sent as a list of two blocks:
      [ {system prompt}, {cached context with cache_control=ephemeral} ]
    The fresh_input is sent as the user message.
    """

    def __init__(self, sdk: Any = None, api_key: Optional[str] = None):
        if sdk is None:
            from anthropic import AsyncAnthropic
            sdk = AsyncAnthropic(api_key=api_key)
        self._sdk = sdk

    async def complete(
        self,
        *,
        model: str,
        system: str,
        cached_context: str,
        fresh_input: str,
        max_tokens: int,
    ) -> str:
        system_blocks = [
            {"type": "text", "text": system},
            {
                "type": "text",
                "text": cached_context,
                "cache_control": {"type": "ephemeral"},
            },
        ]
        response = await self._sdk.messages.create(
            model=model,
            max_tokens=max_tokens,
            system=system_blocks,
            messages=[{"role": "user", "content": fresh_input}],
        )
        return response.content[0].text
