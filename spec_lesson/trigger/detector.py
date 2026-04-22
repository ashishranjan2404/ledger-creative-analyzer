import re
import time
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
        return True
