"""In-memory rolling transcript: append-only, query by time window.

``RollingTranscript`` stores only final (``is_final=True``) utterances.
It tracks the running maximum timestamp explicitly so out-of-order Deepgram
finals never roll the cursor backward.  All reads return copies or filtered
views — no mutation outside ``append()``.
"""
from typing import Optional
from .utterance import Utterance


class RollingTranscript:
    def __init__(self) -> None:
        self._utterances: list[Utterance] = []
        # BUG-D-3: track the running maximum explicitly so that out-of-order
        # Deepgram finals (a late t=5 arriving after t=6) never roll the cursor
        # backward.
        self._max_ts: Optional[float] = None

    def append(self, utterance: Utterance) -> None:
        if not utterance.is_final:
            return
        self._utterances.append(utterance)
        if self._max_ts is None or utterance.timestamp > self._max_ts:
            self._max_ts = utterance.timestamp

    def all(self) -> list[Utterance]:
        return list(self._utterances)

    def since(self, timestamp: float) -> list[Utterance]:
        return [u for u in self._utterances if u.timestamp > timestamp]

    def tail(self, seconds: float, now: float) -> list[Utterance]:
        cutoff = now - seconds
        return [u for u in self._utterances if u.timestamp >= cutoff]

    def latest_timestamp(self) -> Optional[float]:
        return self._max_ts

    def as_text(self, utterances: Optional[list[Utterance]] = None) -> str:
        src = utterances if utterances is not None else self._utterances
        return "\n".join(f"[{u.timestamp:.1f}] {u.speaker}: {u.text}" for u in src)
