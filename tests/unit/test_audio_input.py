import numpy as np
from spec_lesson.capture.audio_input import AudioCapture

def test_mixes_two_streams_by_averaging():
    captured_sinks = []

    def sink(pcm: bytes):
        captured_sinks.append(pcm)

    mic_frame = (np.ones(160, dtype=np.int16) * 100).tobytes()
    loop_frame = (np.ones(160, dtype=np.int16) * 200).tobytes()

    cap = AudioCapture(sink=sink, sample_rate=16000, frame_size=160, mic_index=0, loopback_index=1)
    cap._mix_and_emit(mic_frame, loop_frame)

    assert len(captured_sinks) == 1
    mixed = np.frombuffer(captured_sinks[0], dtype=np.int16)
    assert np.all(mixed == 150)

def test_missing_loopback_falls_back_to_mic_only():
    captured = []
    def sink(pcm): captured.append(pcm)
    mic_frame = (np.ones(160, dtype=np.int16) * 50).tobytes()
    cap = AudioCapture(sink=sink, sample_rate=16000, frame_size=160, mic_index=0, loopback_index=None)
    cap._mix_and_emit(mic_frame, None)
    mixed = np.frombuffer(captured[0], dtype=np.int16)
    assert np.all(mixed == 50)
