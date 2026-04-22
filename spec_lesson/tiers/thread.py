import json
from dataclasses import dataclass
from .base import DriftLabel
from .client import AnthropicClient
from .prompts import THREAD_SYSTEM
from ..transcript.buffer import RollingTranscript


@dataclass
class DriftState:
    current_topic: str
    drift: DriftLabel
    drift_from: str


class ThreadTier:
    name = "thread"
    model = "claude-haiku-4-5"
    max_tokens = 200
    TAIL_SECONDS = 120.0  # last 2 minutes

    def __init__(self, client: AnthropicClient, buffer: RollingTranscript):
        self._client = client
        self._buffer = buffer

    async def run(self, baseline_topic: str, now: float) -> DriftState:
        tail = self._buffer.tail(seconds=self.TAIL_SECONDS, now=now)
        tail_text = "\n".join(
            f"[{u.timestamp:.1f}] {u.speaker}: {u.text}" for u in tail
        )
        cached = f"BASELINE TOPIC: {baseline_topic}"
        fresh = f"LAST 2 MIN OF TRANSCRIPT:\n{tail_text or '(silence)'}"
        raw = await self._client.complete(
            model=self.model,
            system=THREAD_SYSTEM,
            cached_context=cached,
            fresh_input=fresh,
            max_tokens=self.max_tokens,
        )
        try:
            data = json.loads(raw)
            drift = data.get("drift", "unknown")
            if drift not in ("on", "drifting"):
                drift = "unknown"
            return DriftState(
                current_topic=data.get("current_topic", ""),
                drift=drift,
                drift_from=data.get("drift_from", ""),
            )
        except (json.JSONDecodeError, ValueError):
            return DriftState(current_topic="", drift="unknown", drift_from="")
