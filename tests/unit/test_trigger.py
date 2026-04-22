import pytest
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
    assert det.check("ok claude build that", now=100.0) is True
    # within cooldown
    assert det.check("ok claude build this", now=120.0) is False
    # after cooldown
    assert det.check("ok claude build it", now=131.0) is True
