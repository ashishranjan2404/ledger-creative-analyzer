from spec_lesson.transcript.utterance import Utterance
from spec_lesson.transcript.buffer import RollingTranscript


def _u(t, text):
    return Utterance(timestamp=t, speaker="user", text=text, is_final=True)


def test_append_and_all():
    buf = RollingTranscript()
    buf.append(_u(1.0, "a"))
    buf.append(_u(2.0, "b"))
    assert [u.text for u in buf.all()] == ["a", "b"]


def test_since_returns_utterances_after_timestamp():
    buf = RollingTranscript()
    buf.append(_u(1.0, "a"))
    buf.append(_u(2.0, "b"))
    buf.append(_u(3.0, "c"))
    assert [u.text for u in buf.since(1.5)] == ["b", "c"]


def test_tail_returns_utterances_within_window():
    buf = RollingTranscript()
    buf.append(_u(10.0, "a"))
    buf.append(_u(100.0, "b"))
    buf.append(_u(110.0, "c"))
    # reference_ts=120, window=30 → include utterances >= 90
    assert [u.text for u in buf.tail(seconds=30.0, reference_ts=120.0)] == ["b", "c"]


def test_latest_timestamp():
    buf = RollingTranscript()
    assert buf.latest_timestamp() is None
    buf.append(_u(1.0, "a"))
    buf.append(_u(5.0, "b"))
    assert buf.latest_timestamp() == 5.0


def test_latest_timestamp_is_max_not_last_appended():
    """BUG-D-3: out-of-order finals must not roll latest_timestamp backward."""
    buf = RollingTranscript()
    buf.append(_u(6.0, "in-order"))
    buf.append(_u(5.0, "late arrival"))  # out-of-order: t=5 appended after t=6
    assert buf.latest_timestamp() == 6.0, (
        f"Expected 6.0 (max), got {buf.latest_timestamp()} — out-of-order utterance rolled cursor back"
    )


def test_only_final_utterances_stored():
    buf = RollingTranscript()
    buf.append(Utterance(1.0, "user", "partial", False))
    buf.append(Utterance(2.0, "user", "done", True))
    assert [u.text for u in buf.all()] == ["done"]
