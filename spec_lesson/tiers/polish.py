from .base import Distillation
from .client import AnthropicClient
from .prompts import POLISH_SYSTEM


class PolishTier:
    name = "polish"
    model = "claude-sonnet-4-6"
    max_tokens = 2000

    def __init__(self, client: AnthropicClient):
        self._client = client

    async def run(self, final_distillation: Distillation, full_transcript: str) -> str:
        cached = f"FINAL DISTILLATION:\n{final_distillation.to_json()}"
        fresh = f"FULL TRANSCRIPT:\n{full_transcript}"
        return await self._client.complete(
            model=self.model,
            system=POLISH_SYSTEM,
            cached_context=cached,
            fresh_input=fresh,
            max_tokens=self.max_tokens,
        )
