import asyncio
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
        # SHUTDOWN-1: serialize concurrent run() calls so that a periodic
        # callback already in-flight and a final shutdown call don't race.
        self._run_lock = asyncio.Lock()

    @property
    def last(self) -> Distillation:
        return self._last

    async def run(self, now: float) -> Distillation:
        async with self._run_lock:
            return await self._run_locked(now)

    async def _run_locked(self, now: float) -> Distillation:
        # BUG-D-1: snapshot the cursor BEFORE the await so that any utterances
        # that arrive while the LLM call is in-flight are NOT silently skipped.
        # We advance _last_timestamp_processed only to this snapshot; the next
        # run will pick up everything newer.
        boundary_ts = self._buffer.latest_timestamp()
        if boundary_ts is None:
            return self._last  # nothing in buffer yet

        new_utterances = self._buffer.since(self._last_timestamp_processed)
        new_transcript = "\n".join(
            f"[{u.timestamp:.1f}] {u.speaker}: {u.text}" for u in new_utterances
        )
        # COST-1: use to_json_stable() (excludes recent_verbatim) in the cached
        # block so the byte sequence is stable across calls where only the
        # verbatim excerpt changed.  The volatile verbatim is included in
        # fresh_input so the LLM still sees it — it just isn't in the cached key.
        cached = self._render_cached(self._last)
        verbatim_prefix = (
            f"PREVIOUS VERBATIM:\n{self._last.recent_verbatim}\n\n"
            if self._last.recent_verbatim
            else ""
        )
        fresh = verbatim_prefix + (
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
            use_cache=True,  # Context tier grows large enough to hit the 1024-token threshold
        )
        try:
            parsed = Distillation.from_json(raw)
        except (json.JSONDecodeError, KeyError, ValueError):
            # malformed output — keep previous distillation unchanged
            return self._last
        merged = self._last.merge_append_only(parsed)
        merged.updated_at_iso = datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%S")
        self._last = merged
        # Advance to the pre-await snapshot, not the current latest_timestamp().
        # Utterances that arrived during the LLM call will be picked up next run.
        self._last_timestamp_processed = boundary_ts
        return merged

    def _render_cached(self, prev: Distillation) -> str:
        if (
            not prev.decisions
            and not prev.requirements
            and not prev.open_questions
            and prev.topic == "(session just started)"
        ):
            return "PREVIOUS DISTILLATION: (no previous distillation — this is the first run)"
        # COST-1: use to_json_stable() to exclude recent_verbatim from the
        # cached block — volatile verbatim changes every call and breaks cache hits.
        return f"PREVIOUS DISTILLATION:\n{prev.to_json_stable()}"
