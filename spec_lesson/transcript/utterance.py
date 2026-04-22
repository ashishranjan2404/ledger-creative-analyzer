"""Utterance dataclass: the atomic unit of transcript data.

A frozen ``Utterance`` carries timestamp, speaker label, text, and an
``is_final`` flag that mirrors Deepgram's transcript finality.  Use
``safe_from_dict()`` for untrusted input — it returns ``None`` on malformed
payloads and enforces the 8 000-character text cap (SEC-4).
"""
import json
import logging
from dataclasses import dataclass, asdict
from typing import Optional

log = logging.getLogger(__name__)

# SEC-4: cap per-utterance text to prevent a single huge frame from consuming
# unbounded RAM in RollingTranscript, blocking the event loop on os.fsync, and
# sending a 100 MB context to the Anthropic API.
MAX_UTTERANCE_TEXT_CHARS = 8_000


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

        SEC-4: truncates text longer than MAX_UTTERANCE_TEXT_CHARS to prevent
        DoS via huge utterances (memory, fsync block, API context explosion).
        """
        try:
            text = str(data["text"])
            if len(text) > MAX_UTTERANCE_TEXT_CHARS:
                log.warning(
                    "truncating utterance text from %d to %d chars",
                    len(text),
                    MAX_UTTERANCE_TEXT_CHARS,
                )
                text = text[:MAX_UTTERANCE_TEXT_CHARS]
            return cls(
                timestamp=float(data["timestamp"]),
                speaker=str(data["speaker"]),
                text=text,
                is_final=bool(data["is_final"]),
            )
        except (KeyError, TypeError, ValueError) as exc:
            log.warning("Dropped malformed utterance (%s): %r", exc, data)
            return None

    def to_dict(self) -> dict:
        return asdict(self)

    def to_jsonl(self) -> str:
        return json.dumps(self.to_dict())
