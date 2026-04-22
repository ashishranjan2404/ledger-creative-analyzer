# tests/unit/test_deepgram_disconnect.py
"""Tests for FAULT-3 + FAULT-10: Deepgram fail-loud error callback.

Covers the _clean_exit contract in _pump and the new HudObserver.on_audio_disconnect surface.
"""
import threading
from unittest.mock import MagicMock
import pytest
from spec_lesson.capture.deepgram_stream import DeepgramStream


def _make_socket_that_closes_after(n_messages: int):
    """Returns a context-manager mock whose iterator yields n messages then stops."""
    msgs = [MagicMock(is_final=False) for _ in range(n_messages)]
    socket = MagicMock()
    socket.__iter__ = MagicMock(return_value=iter(msgs))
    socket.send_finalize = MagicMock()
    cm = MagicMock()
    cm.__enter__ = MagicMock(return_value=socket)
    cm.__exit__ = MagicMock(return_value=False)
    return cm, socket


def test_on_error_fired_when_socket_closes_unexpectedly():
    """Pump fires on_error callback when remote closes the socket (not via stop())."""
    errors = []
    cm, _socket = _make_socket_that_closes_after(2)

    sdk = MagicMock()
    sdk.listen.v1.connect.return_value = cm

    stream = DeepgramStream(api_key="fake", dg_sdk=sdk)
    stream.on_error(lambda reason: errors.append(reason))
    stream.start()

    # Give pump thread time to drain the two messages and exit the for-loop.
    stream._pump_thread.join(timeout=2.0)

    assert len(errors) == 1, "on_error must fire exactly once on unexpected close"
    assert errors[0]  # non-empty reason string


def test_on_error_not_fired_on_clean_stop():
    """Pump must NOT fire on_error when stop() is called via the orderly shutdown path."""
    errors = []
    stop_event = threading.Event()

    class BlockingSocket:
        """Blocks iteration until send_finalize is called."""
        def __iter__(self):
            stop_event.wait(timeout=5.0)
            return iter([])

        def send_media(self, b):
            pass

        def send_finalize(self):
            stop_event.set()

    socket = BlockingSocket()
    cm = MagicMock()
    cm.__enter__ = MagicMock(return_value=socket)
    cm.__exit__ = MagicMock(return_value=False)

    sdk = MagicMock()
    sdk.listen.v1.connect.return_value = cm

    stream = DeepgramStream(api_key="fake", dg_sdk=sdk)
    stream.on_error(lambda reason: errors.append(reason))
    stream.start()
    stream.stop()  # sets _stop, calls send_finalize which unblocks the iterator
    # stop() already joins the pump thread; check results directly.

    assert errors == [], "on_error must NOT fire on stop()-initiated shutdown"


def test_observer_receives_audio_disconnect_event():
    """HudObserver.on_audio_disconnect sets audio_disconnected and adds a timeline entry."""
    from spec_lesson.hud.observer import HudObserver

    obs = HudObserver(max_seconds=5400.0)
    obs.on_audio_disconnect(at=42.5, reason="WebSocket closed by remote")

    snap = obs.snapshot()
    assert snap.audio_disconnected is True
    assert snap.audio_disconnect_at == pytest.approx(42.5)
    kinds = [e.kind for e in snap.timeline]
    assert "audio_error" in kinds
    audio_ev = next(e for e in snap.timeline if e.kind == "audio_error")
    assert "disconnected" in audio_ev.summary.lower()
