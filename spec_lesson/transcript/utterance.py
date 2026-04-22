import json
import logging
from dataclasses import dataclass, asdict
from typing import Optional

log = logging.getLogger(__name__)


@dataclass(frozen=True)
class Utterance:
    timestamp: float
    speaker: str
    text: str
    is_final: bool

    @classmethod
    def from_dict(cls, data: dict) -> "Utterance":
        return cls(
            timestamp=data["timestamp"],
            speaker=data["speaker"],
            text=data["text"],
            is_final=data["is_final"],
        )

    @classmethod
    def safe_from_dict(cls, data: dict) -> "Optional[Utterance]":
        """Return an Utterance or None if ``data`` is malformed.

        Logs a warning and returns None on any KeyError or TypeError so
        callers (e.g. Orchestrator.ingest) can skip bad frames without
        crashing the event loop.
        """
        try:
            return cls(
                timestamp=float(data["timestamp"]),
                speaker=str(data["speaker"]),
                text=str(data["text"]),
                is_final=bool(data["is_final"]),
            )
        except (KeyError, TypeError, ValueError) as exc:
            log.warning("Dropped malformed utterance (%s): %r", exc, data)
            return None

    def to_dict(self) -> dict:
        return asdict(self)

    def to_jsonl(self) -> str:
        return json.dumps(self.to_dict())
