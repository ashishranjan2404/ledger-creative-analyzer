"""Durable JSONL transcript writer with per-write fsync.

``TranscriptWriter`` appends one JSON line per utterance and calls
``os.fsync`` after every write so that a crash mid-session does not silently
truncate the on-disk transcript.  The file handle is held open for the session
lifetime; call ``close()`` (or use as a context manager) on shutdown.
"""
import logging
import os
from pathlib import Path
from .utterance import Utterance

log = logging.getLogger(__name__)


class TranscriptWriter:
    def __init__(self, path: Path):
        self.path = Path(path)
        self.path.parent.mkdir(parents=True, exist_ok=True)
        self._fh = self.path.open("a", encoding="utf-8")
        self._degraded = False
        self._degradation_reason = ""

    @property
    def degraded(self) -> bool:
        return self._degraded

    @property
    def degradation_reason(self) -> str:
        return self._degradation_reason

    def append(self, utterance: Utterance) -> None:
        try:
            self._fh.write(utterance.to_jsonl() + "\n")
            self._fh.flush()
            os.fsync(self._fh.fileno())
            # why: fsync guarantees the OS page cache is flushed to storage before
            # we return.  Without it, a crash mid-session silently truncates the
            # transcript at the last OS-buffered position.  The performance cost
            # (~1 ms per utterance on SSD) is acceptable given the low utterance
            # rate (~2–5 Hz) and the value of the data.
        except OSError as e:
            if not self._degraded:
                log.warning("transcript writer degraded: %s", e)
                self._degraded = True
                self._degradation_reason = str(e)

    def close(self) -> None:
        self._fh.close()

    def __enter__(self) -> "TranscriptWriter":
        return self

    def __exit__(self, *args) -> None:
        self.close()
