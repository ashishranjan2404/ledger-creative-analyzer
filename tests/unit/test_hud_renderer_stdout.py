from io import StringIO
from spec_lesson.hud.renderer import StdoutHudRenderer
from spec_lesson.hud.state import HudState, TierEvent

def test_renders_state_line():
    buf = StringIO()
    r = StdoutHudRenderer(stream=buf)
    s = HudState.initial(max_seconds=100.0)
    s.topic = "API design"
    s.drift = "on"
    s.elapsed_seconds = 30.0
    s.suggestions = ["a", "b", "c"]
    r.render(s)
    out = buf.getvalue()
    assert "API design" in out
    assert "70.0s left" in out or "01:10 left" in out
    assert "🟢" in out or "on" in out

def test_drift_shows_amber():
    buf = StringIO()
    r = StdoutHudRenderer(stream=buf)
    s = HudState.initial(max_seconds=100.0)
    s.drift = "drifting"
    s.drift_from = "API design"
    s.topic = "dinner plans"
    r.render(s)
    out = buf.getvalue()
    assert "🟡" in out or "drifting" in out
    assert "API design" in out
