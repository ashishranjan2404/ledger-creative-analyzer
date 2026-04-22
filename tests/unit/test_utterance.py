from spec_lesson.transcript.utterance import Utterance

def test_utterance_from_dict_roundtrip():
    data = {
        "timestamp": 1714000000.5,
        "speaker": "user",
        "text": "OK Claude, build that",
        "is_final": True,
    }
    u = Utterance.from_dict(data)
    assert u.timestamp == 1714000000.5
    assert u.speaker == "user"
    assert u.text == "OK Claude, build that"
    assert u.is_final is True
    assert u.to_dict() == data

def test_safe_from_dict_truncates_huge_text():
    """SEC-4: text longer than MAX_UTTERANCE_TEXT_CHARS must be truncated, not rejected."""
    huge = {"timestamp": 1.0, "speaker": "u", "text": "x" * 100_000, "is_final": True}
    u = Utterance.safe_from_dict(huge)
    assert u is not None, "safe_from_dict must return an Utterance, not None"
    assert len(u.text) <= 8_000, f"text was not capped: len={len(u.text)}"


def test_safe_from_dict_accepts_normal_text():
    """SEC-4: normal-length text must pass through unchanged."""
    data = {"timestamp": 2.0, "speaker": "u", "text": "short text", "is_final": True}
    u = Utterance.safe_from_dict(data)
    assert u is not None
    assert u.text == "short text"


def test_utterance_to_jsonl_line():
    u = Utterance(timestamp=1.0, speaker="user", text="hi", is_final=True)
    assert u.to_jsonl() == '{"timestamp": 1.0, "speaker": "user", "text": "hi", "is_final": true}'
