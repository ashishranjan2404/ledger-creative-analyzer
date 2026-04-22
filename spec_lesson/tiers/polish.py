from .base import Distillation
from .client import AnthropicClient
from .prompts import POLISH_SYSTEM

# Anthropic Sonnet input window is ~200k tokens.  At ~4 chars/token a 100k-char
# transcript is ~25k tokens — well inside the safe margin even after adding the
# system prompt and cached context.  Anything over this limit is truncated to
# the *tail* of the transcript so the most-recent context is preserved.
_MAX_TRANSCRIPT_CHARS = 100_000


class PolishTier:
    name = "polish"
    model = "claude-sonnet-4-6"
    max_tokens = 2000

    def __init__(self, client: AnthropicClient):
        self._client = client

    async def run(self, final_distillation: Distillation, full_transcript: str) -> str:
        # Truncate to the tail so the most recent conversation is retained.
        if len(full_transcript) > _MAX_TRANSCRIPT_CHARS:
            full_transcript = full_transcript[-_MAX_TRANSCRIPT_CHARS:]

        cached = f"FINAL DISTILLATION:\n{final_distillation.to_json()}"
        fresh = f"FULL TRANSCRIPT:\n{full_transcript}"
        return await self._client.complete(
            model=self.model,
            system=POLISH_SYSTEM,
            cached_context=cached,
            fresh_input=fresh,
            max_tokens=self.max_tokens,
        )
