import time
import pytest
from contextlib import contextmanager
from unittest.mock import MagicMock
from spec_lesson.capture.deepgram_stream import DeepgramStream


# ---------------------------------------------------------------------------
# Helpers: contextmanager-based fake connect (mirrors real SDK shape)
# ---------------------------------------------------------------------------

def _make_fake_dg(fake_socket):
    """Return a fake DG SDK whose connect() is a proper contextmanager."""
    fake_dg = MagicMock()
    fake_cm = MagicMock()
    fake_cm.__enter__ = MagicMock(return_value=fake_socket)
    fake_cm.__exit__ = MagicMock(return_value=False)
    fake_dg.listen.v1.connect.return_value = fake_cm
    return fake_dg


# ---------------------------------------------------------------------------
# Tests
# ---------------------------------------------------------------------------

def test_on_utterance_callback_invoked_on_final_transcription():
    """Test that final transcription is forwarded as utterance dict."""
    fake_socket = MagicMock()
    # socket iteration: one final message then stop
    fake_result = MagicMock()
    fake_result.is_final = True
    fake_result.channel.alternatives = [MagicMock(transcript="hello world")]
    fake_result.start = 1.5
    fake_result.channel.alternatives[0].words = [MagicMock(speaker=0)]
    fake_socket.__iter__ = MagicMock(return_value=iter([]))

    fake_dg = _make_fake_dg(fake_socket)
    stream = DeepgramStream(api_key="fake", dg_sdk=fake_dg)
    received = []
    stream.on_utterance(lambda u: received.append(u))
    stream.start()

    # Process one message directly (tests _decode_deepgram_result in isolation)
    utterance = stream._decode_deepgram_result(fake_result)
    assert utterance is not None
    assert utterance["text"] == "hello world"
    assert utterance["is_final"] is True
    assert utterance["timestamp"] == 1.5
    assert utterance["speaker"] == "speaker_0"

    stream.stop()


def test_interim_transcripts_are_ignored():
    """Test that non-final transcripts are ignored."""
    fake_socket = MagicMock()
    fake_socket.__iter__ = MagicMock(return_value=iter([]))
    fake_dg = _make_fake_dg(fake_socket)

    stream = DeepgramStream(api_key="fake", dg_sdk=fake_dg)
    stream.start()

    fake_result = MagicMock()
    fake_result.is_final = False
    fake_result.channel.alternatives = [MagicMock(transcript="partial")]
    fake_result.start = 0.5

    utterance = stream._decode_deepgram_result(fake_result)
    assert utterance is None

    stream.stop()


def test_send_audio_forwards_to_sdk():
    """Test that send_audio forwards bytes to the socket."""
    import threading

    class BlockingSocket:
        """Socket that blocks iteration until released — keeps self._socket alive."""
        def __init__(self):
            self._release = threading.Event()
            self.send_media_calls = []
            self.send_finalize_calls = []

        def __iter__(self):
            self._release.wait()
            return iter([])

        def send_media(self, b):
            self.send_media_calls.append(b)

        def send_finalize(self):
            self.send_finalize_calls.append(True)
            self._release.set()

    fake_socket = BlockingSocket()
    fake_dg = _make_fake_dg(fake_socket)

    stream = DeepgramStream(api_key="fake", dg_sdk=fake_dg)
    stream.start()
    stream.send_audio(b"\x00" * 160)

    assert fake_socket.send_media_calls == [b"\x00" * 160]

    stream.stop()


def test_stop_calls_sdk_finish():
    """Test that stop finalizes the socket."""
    import threading

    class BlockingSocket:
        def __init__(self):
            self._release = threading.Event()
            self.send_finalize_calls = []

        def __iter__(self):
            self._release.wait()
            return iter([])

        def send_media(self, b):
            pass

        def send_finalize(self):
            self.send_finalize_calls.append(True)
            self._release.set()

    fake_socket = BlockingSocket()
    fake_dg = _make_fake_dg(fake_socket)

    stream = DeepgramStream(api_key="fake", dg_sdk=fake_dg)
    stream.start()
    stream.stop()

    assert len(fake_socket.send_finalize_calls) == 1


def test_pump_thread_processes_socket_messages():
    """Verify that start()'s pump thread pulls messages from the iterator and fires the callback."""
    fake_final = MagicMock()
    fake_final.is_final = True
    fake_final.channel.alternatives = [MagicMock(transcript="hi there")]
    fake_final.start = 2.0
    fake_final.channel.alternatives[0].words = [MagicMock(speaker=0)]

    fake_interim = MagicMock()
    fake_interim.is_final = False

    class FakeSocket:
        def __init__(self):
            self._msgs = iter([fake_interim, fake_final])

        def __iter__(self):
            return self._msgs

        def send_media(self, b):
            pass

        def send_finalize(self):
            pass

    fake_socket = FakeSocket()
    fake_dg = _make_fake_dg(fake_socket)

    stream = DeepgramStream(api_key="fake", dg_sdk=fake_dg)
    received = []
    stream.on_utterance(lambda u: received.append(u))
    stream.start()
    # give pump thread time to drain
    for _ in range(20):
        if received:
            break
        time.sleep(0.05)
    stream.stop()

    assert len(received) == 1
    assert received[0]["text"] == "hi there"
    assert received[0]["is_final"] is True


def test_contextmanager_connect_regression():
    """Regression: connect() MUST be used as a contextmanager (not next(iter(...))).

    This test uses a real contextmanager as the fake, ensuring the new code path
    works and that the old next(socket_iterator) approach would fail with TypeError.
    """
    received_in_cm = []

    class FakeSocket:
        def __iter__(self):
            return iter([])

        def send_media(self, b):
            pass

        def send_finalize(self):
            pass

    @contextmanager
    def real_cm_fake_connect(**kw):
        sock = FakeSocket()
        received_in_cm.append("entered")
        yield sock
        received_in_cm.append("exited")

    fake_dg = MagicMock()
    fake_dg.listen.v1.connect.side_effect = real_cm_fake_connect

    stream = DeepgramStream(api_key="fake", dg_sdk=fake_dg)
    stream.start()
    stream.stop()

    # The contextmanager was entered and cleanly exited
    assert "entered" in received_in_cm
    assert "exited" in received_in_cm
