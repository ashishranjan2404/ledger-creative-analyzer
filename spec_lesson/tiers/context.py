import json
from datetime import datetime, timezone
from typing import Optional
from .base import Distillation
from .client import AnthropicClient
from .prompts import CONTEXT_SYSTEM
from ..transcript.buffer import RollingTranscript


class ContextTier:
    name = "context"
    model = "claude-sonnet-4-6"
    max_tokens = 1500

    def __init__(self, client: AnthropicClient, buffer: RollingTranscript):
        self._client = client
        self._buffer = buffer
        self._last: Distillation = Distillation.empty()
        self._last_timestamp_processed: float = 0.0

    @property
    def last(self) -> Distillation:
        return self._last

    async def run(self, now: float) -> Distillation:
        new_utterances = self._buffer.since(self._last_timestamp_processed)
        new_transcript = "\n".join(
            f"[{u.timestamp:.1f}] {u.speaker}: {u.text}" for u in new_utterances
        )
        cached = self._render_cached(self._last)
        fresh = (
            f"NEW TRANSCRIPT SINCE LAST DISTILLATION:\n{new_transcript}"
            if new_transcript
            else "(no new transcript)"
        )
        raw = await self._client.complete(
            model=self.model,
            system=CONTEXT_SYSTEM,
            cached_context=cached,
            fresh_input=fresh,
            max_tokens=self.max_tokens,
        )
        try:
            parsed = Distillation.from_json(raw)
        except (json.JSONDecodeError, KeyError, ValueError):
            # malformed output — keep previous distillation unchanged
            return self._last
        merged = self._last.merge_append_only(parsed)
        merged.updated_at_iso = datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%S")
        self._last = merged
        latest_ts = self._buffer.latest_timestamp()
        if latest_ts is not None:
            self._last_timestamp_processed = latest_ts
        return merged

    def _render_cached(self, prev: Distillation) -> str:
        if (
            not prev.decisions
            and not prev.requirements
            and not prev.open_questions
            and prev.topic == "(session just started)"
        ):
            return "PREVIOUS DISTILLATION: (no previous distillation — this is the first run)"
        return f"PREVIOUS DISTILLATION:\n{prev.to_json()}"
