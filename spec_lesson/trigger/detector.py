import re
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
        self._last_fire_at: Optional[float] = None

    def check(self, text: str, now: float) -> bool:
        normalized = normalize(text)
        if not _TRIGGER_PATTERN.search(normalized):
            return False
        if self._last_fire_at is not None and now - self._last_fire_at < self.cooldown_seconds:
            return False
        self._last_fire_at = now
        return True
