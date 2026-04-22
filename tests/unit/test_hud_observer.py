from spec_lesson.hud.observer import HudObserver
from spec_lesson.hud.state import TierEvent

def test_on_context_updates_topic():
    o = HudObserver(max_seconds=100.0)
    o.on_context(at=5.0, topic="API design", decisions_count=3)
    snap = o.snapshot()
    assert snap.topic == "API design"
    assert snap.timeline[-1].kind == "context"
    assert "3 decisions" in snap.timeline[-1].summary

def test_on_thread_sets_drift_and_appends_event():
    o = HudObserver(max_seconds=100.0)
    o.on_context(at=0.0, topic="API design", decisions_count=0)
    o.on_thread(at=10.0, drift="drifting", current_topic="dinner", drift_from="API design")
    snap = o.snapshot()
    assert snap.drift == "drifting"
    assert snap.drift_from == "API design"
    assert snap.topic == "dinner"  # current_topic wins
    assert any(e.kind == "thread" for e in snap.timeline)

def test_on_immediate_sets_suggestions():
    o = HudObserver(max_seconds=100.0)
    o.on_immediate(at=3.0, candidates=["a", "b", "c", "d"])
    snap = o.snapshot()
    assert snap.suggestions == ["a", "b", "c"]

def test_on_trigger_records_timestamp():
    o = HudObserver(max_seconds=100.0)
    o.on_trigger(at=42.0, phrase="OK Claude build that")
    snap = o.snapshot()
    assert snap.trigger_fired_at == 42.0
    assert any(e.kind == "trigger" for e in snap.timeline)

def test_tick_updates_elapsed():
    o = HudObserver(max_seconds=100.0)
    o.tick(elapsed=37.5)
    snap = o.snapshot()
    assert snap.elapsed_seconds == 37.5
    assert snap.remaining_seconds() == 62.5

def test_snapshot_is_independent_copy():
    o = HudObserver(max_seconds=100.0)
    o.on_context(at=1.0, topic="t", decisions_count=0)
    s1 = o.snapshot()
    o.on_context(at=2.0, topic="t2", decisions_count=0)
    assert s1.topic == "t"  # not mutated by subsequent calls
