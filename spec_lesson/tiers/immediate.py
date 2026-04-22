"""Immediate tier: real-time response suggestions fired on speech pause.

Calls Claude Haiku with the last 90 seconds of transcript after the user stops
speaking (detected by ``Orchestrator._pause_watcher``).  Returns three short
response candidates — one neutral/buying-time, one substantive, one question —
to help an ADHD user stay engaged without losing the thread.
"""
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

    async def run(self, audio_ts: float) -> ResponseSuggestions:
        tail = self._buffer.tail(seconds=self.TAIL_SECONDS, reference_ts=audio_ts)
        tail_text = "\n".join(f"[{u.timestamp:.1f}] {u.speaker}: {u.text}" for u in tail)
        cached = "LAST 90 SECONDS:"
        # SEC-7: wrap transcript content in XML tags to delimit user-supplied
        # spoken content from model instructions, reducing injection surface.
        fresh = f"<transcript>\n{tail_text}\n</transcript>" if tail_text else "<transcript>(silence)</transcript>"
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
