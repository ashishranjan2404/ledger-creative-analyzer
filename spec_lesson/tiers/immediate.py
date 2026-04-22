import json
from dataclasses import dataclass, field
from .client import AnthropicClient
from .prompts import IMMEDIATE_SYSTEM
from ..transcript.buffer import RollingTranscript

@dataclass
class ResponseSuggestions:
    candidates: list[str] = field(default_factory=list)

class ImmediateTier:
    name = "immediate"
    model = "claude-haiku-4-5"
    max_tokens = 200
    TAIL_SECONDS = 90.0

    def __init__(self, client: AnthropicClient, buffer: RollingTranscript):
        self._client = client
        self._buffer = buffer

    async def run(self, now: float) -> ResponseSuggestions:
        tail = self._buffer.tail(seconds=self.TAIL_SECONDS, now=now)
        tail_text = "\n".join(f"[{u.timestamp:.1f}] {u.speaker}: {u.text}" for u in tail)
        cached = "LAST 90 SECONDS:"
        fresh = tail_text or "(silence)"
        raw = await self._client.complete(
            model=self.model,
            system=IMMEDIATE_SYSTEM,
            cached_context=cached,
            fresh_input=fresh,
            max_tokens=self.max_tokens,
            use_cache=False,  # COST-1: ~111 tokens — 18× below Haiku 2048-token threshold
        )
        try:
            data = json.loads(raw)
            cands = list(data.get("candidates", []))[:3]
            return ResponseSuggestions(candidates=cands)
        except (json.JSONDecodeError, ValueError):
            return ResponseSuggestions(candidates=[])
