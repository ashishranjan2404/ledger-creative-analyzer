"""Wake-word trigger detector for 'OK Claude build this/that/it'.

``TriggerDetector.check()`` normalises incoming text, tests it against a
compiled regex, and enforces a 30-second monotonic cooldown so a single
spoken phrase doesn't fire the context tier multiple times during rapid
Deepgram re-transcriptions.
"""
import re
import time
from datetime import datetime, timezone
from pathlib import Path
from typing import Optional

_TRIGGER_PATTERN = re.compile(
    r"\bok(?:ay)?\s+claude\b.*?\bbuild\s+(?:this|that|it)\b",
    re.IGNORECASE,
)

def normalize(text: str) -> str:
    # collapse whitespace, keep lowercase letters + digits + spaces
    lowered = text.lower()
    cleaned = re.sub(r"[^a-z0-9\s]", " ", lowered)
    collapsed = re.sub(r"\s+", " ", cleaned).strip()
    return collapsed

class TriggerDetector:
    def __init__(self, cooldown_seconds: float = 30.0):
        self.cooldown_seconds = cooldown_seconds
        # BUG-D-6: use wall-clock monotonic time for cooldown, NOT audio
        # timestamps.  After a Deepgram reconnect, audio timestamps reset to ~0,
        # which would make (now - last_fire_at) hugely negative and either fire
        # immediately or lock indefinitely depending on sign conventions.
        self._last_fire_monotonic: Optional[float] = None
        self._fire_count: int = 0

    @property
    def fire_count(self) -> int:
        """Number of times check() has returned True (trigger matched + cooldown passed)."""
        return self._fire_count

    def check(self, text: str, now: float) -> bool:
        """Return True if *text* matches the trigger pattern and the cooldown has elapsed.

        *now* is kept for API compatibility but is no longer used for cooldown
        calculations; wall-clock ``time.monotonic()`` is used instead.
        """
        normalized = normalize(text)
        if not _TRIGGER_PATTERN.search(normalized):
            return False
        mono_now = time.monotonic()
        if (
            self._last_fire_monotonic is not None
            and mono_now - self._last_fire_monotonic < self.cooldown_seconds
        ):
            return False
        self._last_fire_monotonic = mono_now
        self._fire_count += 1
        return True

    def log_fire(self, log_path: Path, phrase: str) -> None:
        """Append a trigger fire to the given log file with UTC timestamp."""
        line = f"{datetime.now(timezone.utc).isoformat()} | {phrase}\n"
        log_path.parent.mkdir(parents=True, exist_ok=True)
        with log_path.open("a", encoding="utf-8") as fh:
            fh.write(line)
