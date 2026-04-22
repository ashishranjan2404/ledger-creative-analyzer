"""Anthropic API client wrapper with two-block prompt-cache structure.

``AnthropicClient`` serialises every LLM call into a (system + cached context)
block and a user message, keeping the stable context in the cacheable block to
exploit Anthropic's 90% prompt-cache discount on subsequent calls.
"""
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
            sdk = AsyncAnthropic(api_key=api_key, timeout=30.0)
        self._sdk = sdk

    async def complete(
        self,
        *,
        model: str,
        system: str,
        cached_context: str,
        fresh_input: str,
        max_tokens: int,
        use_cache: bool = True,
    ) -> str:
        # Merge system prompt and cached context into a single block so that
        # the combined token count is large enough to meet Anthropic's minimum
        # cache threshold (1024 tokens for Sonnet, 2048 for Haiku).  A single
        # cached block also means one fewer read of the cache header per call.
        #
        # COST-1: use_cache=False skips the cache_control annotation entirely
        # so tiers whose cached block is below Anthropic's minimum threshold
        # (Thread ~111 tok < 2048; Immediate ~111 tok < 2048; Polish one-shot)
        # do not pay the 25% write-premium with zero compensating reads.
        block: dict = {
            "type": "text",
            "text": f"{system}\n\n---\n\n{cached_context}",
        }
        if use_cache:
            block["cache_control"] = {"type": "ephemeral"}
        system_blocks = [block]
        response = await self._sdk.messages.create(
            model=model,
            max_tokens=max_tokens,
            system=system_blocks,
            messages=[{"role": "user", "content": fresh_input}],
        )
        for block in response.content:
            if hasattr(block, "text") and block.text:
                return block.text
        return ""
