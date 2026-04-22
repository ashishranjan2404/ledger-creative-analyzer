import pytest
from unittest.mock import MagicMock
from spec_lesson.capture.deepgram_stream import DeepgramStream


def test_on_utterance_callback_invoked_on_final_transcription():
    """Test that final transcription is forwarded as utterance dict."""
    fake_dg = MagicMock()
    fake_socket = MagicMock()
    fake_dg.listen.v1.connect.return_value = iter([fake_socket])

    stream = DeepgramStream(api_key="fake", dg_sdk=fake_dg)
    received = []
    stream.on_utterance(lambda u: received.append(u))
    stream.start()

    # Simulate receiving a final transcript from Deepgram
    fake_result = MagicMock()
    fake_result.is_final = True
    fake_result.channel.alternatives = [MagicMock(transcript="hello world")]
    fake_result.start = 1.5
    fake_result.channel.alternatives[0].words = [MagicMock(speaker=0)]
    fake_socket.recv.return_value = fake_result

    # Process one message
    utterance = stream.process_message(fake_result)
    assert utterance is not None
    assert utterance["text"] == "hello world"
    assert utterance["is_final"] is True
    assert utterance["timestamp"] == 1.5
    assert utterance["speaker"] == "speaker_0"


def test_interim_transcripts_are_ignored():
    """Test that non-final transcripts are ignored."""
    fake_dg = MagicMock()
    fake_socket = MagicMock()
    fake_dg.listen.v1.connect.return_value = iter([fake_socket])

    stream = DeepgramStream(api_key="fake", dg_sdk=fake_dg)

    # Simulate receiving an interim transcript
    fake_result = MagicMock()
    fake_result.is_final = False
    fake_result.channel.alternatives = [MagicMock(transcript="partial")]
    fake_result.start = 0.5

    utterance = stream.process_message(fake_result)
    assert utterance is None


def test_send_audio_forwards_to_sdk():
    """Test that send_audio forwards bytes to the socket."""
    fake_dg = MagicMock()
    fake_socket = MagicMock()
    fake_dg.listen.v1.connect.return_value = iter([fake_socket])

    stream = DeepgramStream(api_key="fake", dg_sdk=fake_dg)
    stream.start()
    stream.send_audio(b"\x00" * 160)

    fake_socket.send_media.assert_called_once_with(b"\x00" * 160)


def test_stop_calls_sdk_finish():
    """Test that stop finalizes the socket."""
    fake_dg = MagicMock()
    fake_socket = MagicMock()
    fake_dg.listen.v1.connect.return_value = iter([fake_socket])

    stream = DeepgramStream(api_key="fake", dg_sdk=fake_dg)
    stream.start()
    stream.stop()

    fake_socket.send_finalize.assert_called_once()


def test_pump_thread_processes_socket_messages():
    """Verify that start()'s pump thread pulls messages from the iterator and fires the callback."""
    import time
    fake_dg = MagicMock()

    # socket is an iterator; provide 2 fake results then StopIteration
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
        def send_media(self, b): pass
        def send_finalize(self): pass

    fake_socket = FakeSocket()
    fake_dg.listen.v1.connect.return_value = iter([fake_socket])

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
