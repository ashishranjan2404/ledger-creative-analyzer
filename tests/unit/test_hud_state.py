from spec_lesson.hud.state import HudState, TierEvent

def test_initial_state():
    s = HudState.initial(max_seconds=5400.0)
    assert s.topic == "(session just starting)"
    assert s.drift == "unknown"
    assert s.suggestions == []
    assert s.timeline == []
    assert s.max_seconds == 5400.0
    assert s.elapsed_seconds == 0.0
    assert s.remaining_seconds() == 5400.0

def test_append_event_caps_at_50():
    s = HudState.initial()
    for i in range(60):
        s.append_event(TierEvent(at=float(i), kind="thread", summary=f"e{i}"))
    assert len(s.timeline) == 50
    assert s.timeline[0].summary == "e10"  # oldest events dropped
    assert s.timeline[-1].summary == "e59"

def test_remaining_seconds_clamped_to_zero():
    s = HudState.initial(max_seconds=10.0)
    s.elapsed_seconds = 20.0
    assert s.remaining_seconds() == 0.0

def test_set_drift_on_topic():
    s = HudState.initial()
    s.set_drift("on", "API design", "API design")
    assert s.drift == "on"
    assert s.topic == "API design"
    assert s.drift_from == "API design"
