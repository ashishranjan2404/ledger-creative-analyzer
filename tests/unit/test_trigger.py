import time
import pytest
from unittest.mock import patch
from spec_lesson.trigger.detector import TriggerDetector

@pytest.mark.parametrize("text", [
    "OK Claude, build that",
    "okay claude build this",
    "Ok, Claude. Build it.",
    "OK Claude build that",
    "  ok   claude,,build  that  ",
    "Okay Claude, please... build this.",
])
def test_detects_valid_trigger_variants(text):
    det = TriggerDetector()
    assert det.check(text, now=1.0) is True

@pytest.mark.parametrize("text", [
    "okay claude",
    "build that",
    "claude build",
    "ok clod build that",
    "let's just plan it",
])
def test_rejects_non_triggers(text):
    det = TriggerDetector()
    assert det.check(text, now=1.0) is False

def test_cooldown_suppresses_refire():
    det = TriggerDetector(cooldown_seconds=30.0)
    with patch("spec_lesson.trigger.detector.time") as mock_time:
        mock_time.monotonic.return_value = 100.0
        assert det.check("ok claude build that", now=100.0) is True
        # within cooldown (wall=120, only 20s elapsed)
        mock_time.monotonic.return_value = 120.0
        assert det.check("ok claude build this", now=120.0) is False
        # after cooldown (wall=131, 31s elapsed > 30s)
        mock_time.monotonic.return_value = 131.0
        assert det.check("ok claude build it", now=131.0) is True


def test_cooldown_uses_wall_clock_not_audio_timestamp():
    """BUG-D-6 / EDGE-5: after a Deepgram reconnect audio timestamps reset to
    ~0.  Cooldown must use wall-clock monotonic time so the trigger fires
    (or suppresses) correctly regardless of audio timestamp discontinuities."""
    det = TriggerDetector(cooldown_seconds=30.0)

    # Simulate: fire at wall=100, audio=1000 (pre-reconnect)
    with patch("spec_lesson.trigger.detector.time") as mock_time:
        mock_time.monotonic.return_value = 100.0
        fired = det.check("ok claude build that", now=1000.0)
    assert fired is True

    # Deepgram reconnect: audio timestamp resets to 2 (way below 1000).
    # Wall clock has advanced 130s — cooldown (30s) has elapsed → must fire.
    with patch("spec_lesson.trigger.detector.time") as mock_time:
        mock_time.monotonic.return_value = 230.0
        fired_after_reconnect = det.check("ok claude build this", now=2.0)
    assert fired_after_reconnect is True, (
        "Trigger should fire after wall-clock cooldown even if audio timestamp reset"
    )

    # Immediately after (wall=231) — still within cooldown → must NOT fire.
    with patch("spec_lesson.trigger.detector.time") as mock_time:
        mock_time.monotonic.return_value = 231.0
        suppressed = det.check("ok claude build it", now=3.0)
    assert suppressed is False, "Trigger fired inside wall-clock cooldown window"
