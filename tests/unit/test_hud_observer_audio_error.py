# tests/unit/test_hud_observer_audio_error.py
"""Tests for HudObserver.on_audio_disconnect and HudState.audio_disconnected field."""
import pytest
from spec_lesson.hud.observer import HudObserver
from spec_lesson.hud.state import HudState


def test_hud_state_initial_audio_disconnected_is_false():
    """HudState.initial() must have audio_disconnected=False by default."""
    state = HudState.initial(max_seconds=5400.0)
    assert state.audio_disconnected is False
    assert state.audio_disconnect_at is None


def test_on_audio_disconnect_sets_flag_and_timeline():
    """on_audio_disconnect must set audio_disconnected=True and add audio_error timeline entry."""
    obs = HudObserver(max_seconds=5400.0)
    obs.on_audio_disconnect(at=10.0, reason="WebSocket closed by remote")

    snap = obs.snapshot()
    assert snap.audio_disconnected is True
    assert snap.audio_disconnect_at == pytest.approx(10.0)
    kinds = [e.kind for e in snap.timeline]
    assert "audio_error" in kinds


def test_on_audio_disconnect_summary_contains_reason():
    """The timeline entry summary must include the disconnect reason."""
    obs = HudObserver(max_seconds=5400.0)
    obs.on_audio_disconnect(at=5.0, reason="auth failure")

    snap = obs.snapshot()
    audio_ev = next(e for e in snap.timeline if e.kind == "audio_error")
    assert "auth failure" in audio_ev.summary


def test_on_audio_disconnect_is_thread_safe():
    """Multiple threads calling on_audio_disconnect must not corrupt state."""
    import threading
    obs = HudObserver(max_seconds=5400.0)
    errors = []

    def disconnect():
        try:
            obs.on_audio_disconnect(at=1.0, reason="test reason")
        except Exception as e:
            errors.append(e)

    threads = [threading.Thread(target=disconnect) for _ in range(5)]
    for t in threads:
        t.start()
    for t in threads:
        t.join(timeout=2.0)

    assert errors == [], f"Thread safety violation: {errors}"
    snap = obs.snapshot()
    assert snap.audio_disconnected is True
