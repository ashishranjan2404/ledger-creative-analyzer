from .base import Distillation
from .client import AnthropicClient
from .prompts import POLISH_SYSTEM

# Anthropic Sonnet input window is ~200k tokens.  At ~4 chars/token a 100k-char
# transcript is ~25k tokens — well inside the safe margin even after adding the
# system prompt and cached context.
#
# BUG-D-8 FIX: tail-only truncation dropped the session opening, which is
# exactly what the LLM needs to write a coherent summary.  Use head+tail so
# both the session brief and the most-recent context are preserved.
_MAX_TRANSCRIPT_CHARS = 100_000
_HEAD_CHARS = 20_000
_TAIL_CHARS = 80_000
_TRUNCATION_MARKER = "\n\n[... middle truncated ...]\n\n"


class PolishTier:
    name = "polish"
    model = "claude-sonnet-4-6"
    max_tokens = 2000

    def __init__(self, client: AnthropicClient):
        self._client = client

    async def run(self, final_distillation: Distillation, full_transcript: str) -> str:
        # Head + tail truncation: preserve the session opening (what was this
        # about?) AND the most recent context, dropping only the middle.
        if len(full_transcript) > _MAX_TRANSCRIPT_CHARS:
            head = full_transcript[:_HEAD_CHARS]
            tail = full_transcript[-_TAIL_CHARS:]
            full_transcript = head + _TRUNCATION_MARKER + tail

        cached = f"FINAL DISTILLATION:\n{final_distillation.to_json()}"
        fresh = f"FULL TRANSCRIPT:\n{full_transcript}"
        return await self._client.complete(
            model=self.model,
            system=POLISH_SYSTEM,
            cached_context=cached,
            fresh_input=fresh,
            max_tokens=self.max_tokens,
        )
