"""Unit tests for _PauseWatcherState — all branches of should_fire()."""
import time
import pytest
from spec_lesson.orchestrator import _PauseWatcherState


def _make_state(**kwargs) -> _PauseWatcherState:
    defaults = dict(
        check_interval=0.5,
        pause_threshold=1.2,
        min_utterances=3,
        min_interval=10.0,
    )
    defaults.update(kwargs)
    return _PauseWatcherState(**defaults)


# ---------------------------------------------------------------------------
# should_fire — no latest_ts (empty buffer)
# ---------------------------------------------------------------------------

def test_should_fire_returns_false_when_no_latest_ts():
    pw = _make_state()
    now = time.monotonic()
    # last_utterance_mono far in the past so pause would otherwise pass
    assert pw.should_fire(
        latest_ts=None, utterance_count=5, now_mono=now,
        last_utterance_mono=now - 9999.0,
    ) is False


# ---------------------------------------------------------------------------
# should_fire — utterance_count below min_utterances gate
# ---------------------------------------------------------------------------

def test_should_fire_returns_false_below_min_utterances():
    pw = _make_state(min_utterances=3)
    now = time.monotonic()
    assert pw.should_fire(
        latest_ts=1.0, utterance_count=2, now_mono=now,
        last_utterance_mono=now - 9999.0,
    ) is False


# ---------------------------------------------------------------------------
# should_fire — same timestamp as last fire (dedupe gate)
# ---------------------------------------------------------------------------

def test_should_fire_returns_false_same_timestamp():
    pw = _make_state(min_utterances=1, min_interval=0.0)
    now = time.monotonic()
    last_speech = now - 9999.0
    # First fire should succeed.
    assert pw.should_fire(latest_ts=1.0, utterance_count=1, now_mono=now, last_utterance_mono=last_speech) is True
    pw.mark_fired(latest_ts=1.0, now_mono=now)
    # Same timestamp: must not fire again.
    assert pw.should_fire(latest_ts=1.0, utterance_count=2, now_mono=now + 5.0, last_utterance_mono=last_speech) is False


# ---------------------------------------------------------------------------
# should_fire — within min_interval since last fire
# ---------------------------------------------------------------------------

def test_should_fire_returns_false_within_min_interval():
    pw = _make_state(min_utterances=1, min_interval=30.0)
    now = time.monotonic()
    last_speech = now - 9999.0
    pw.mark_fired(latest_ts=1.0, now_mono=now)
    # Different timestamp but only 5 seconds later — within the 30 s interval.
    assert pw.should_fire(latest_ts=2.0, utterance_count=2, now_mono=now + 5.0, last_utterance_mono=last_speech) is False


# ---------------------------------------------------------------------------
# should_fire — speech too recent (pause hasn't elapsed yet)
# ---------------------------------------------------------------------------

def test_should_fire_returns_false_when_speech_too_recent():
    pw = _make_state(pause_threshold=1.2, min_utterances=1, min_interval=0.0)
    now = time.monotonic()
    # Simulate utterance just 0.2 s ago — pause_threshold is 1.2 s.
    last_utterance_mono = now - 0.2
    assert pw.should_fire(latest_ts=1.0, utterance_count=1, now_mono=now, last_utterance_mono=last_utterance_mono) is False


# ---------------------------------------------------------------------------
# should_fire — happy path (all gates pass)
# ---------------------------------------------------------------------------

def test_should_fire_returns_true_on_happy_path():
    pw = _make_state(pause_threshold=1.2, min_utterances=3, min_interval=10.0)
    now = time.monotonic()
    # Speech far in the past, enough utterances, different ts, enough time since last fire.
    assert pw.should_fire(
        latest_ts=5.0, utterance_count=3, now_mono=now,
        last_utterance_mono=now - 9999.0,
    ) is True


# ---------------------------------------------------------------------------
# mark_fired updates state correctly
# ---------------------------------------------------------------------------

def test_mark_fired_updates_state():
    pw = _make_state(min_utterances=1, min_interval=0.0)
    now = time.monotonic()
    pw.mark_fired(latest_ts=7.0, now_mono=now)
    assert pw.last_fired_for_ts == 7.0
    assert pw.last_fired_monotonic == now
