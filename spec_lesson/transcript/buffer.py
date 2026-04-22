from typing import Optional
from .utterance import Utterance


class RollingTranscript:
    def __init__(self) -> None:
        self._utterances: list[Utterance] = []

    def append(self, utterance: Utterance) -> None:
        if not utterance.is_final:
            return
        self._utterances.append(utterance)

    def all(self) -> list[Utterance]:
        return list(self._utterances)

    def since(self, timestamp: float) -> list[Utterance]:
        return [u for u in self._utterances if u.timestamp > timestamp]

    def tail(self, seconds: float, now: float) -> list[Utterance]:
        cutoff = now - seconds
        return [u for u in self._utterances if u.timestamp >= cutoff]

    def latest_timestamp(self) -> Optional[float]:
        if not self._utterances:
            return None
        return self._utterances[-1].timestamp

    def as_text(self, utterances: Optional[list[Utterance]] = None) -> str:
        src = utterances if utterances is not None else self._utterances
        return "\n".join(f"[{u.timestamp:.1f}] {u.speaker}: {u.text}" for u in src)
