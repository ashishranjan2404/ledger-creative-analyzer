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

def test_utterance_to_jsonl_line():
    u = Utterance(timestamp=1.0, speaker="user", text="hi", is_final=True)
    assert u.to_jsonl() == '{"timestamp": 1.0, "speaker": "user", "text": "hi", "is_final": true}'
