import sys
from unittest.mock import patch
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

def test_mix_pads_shorter_loop_with_zeros():
    """TEST-1: when loop_frame is shorter than mic_frame, output must be mic-length."""
    captured = []

    def sink(pcm):
        captured.append(pcm)

    mic = (np.ones(160, dtype=np.int16) * 100).tobytes()
    loop = (np.ones(80, dtype=np.int16) * 200).tobytes()  # half length
    cap = AudioCapture(sink=sink, sample_rate=16000, frame_size=160, mic_index=0, loopback_index=1)
    cap._mix_and_emit(mic, loop)

    mixed = np.frombuffer(captured[0], dtype=np.int16)
    assert len(mixed) == 160, f"Expected 160 samples (mic length), got {len(mixed)}"
    # first 80 samples: avg(100, 200) = 150
    assert np.all(mixed[:80] == 150), "First half should average mic+loop"
    # last 80 samples: avg(100, 0) = 50  (loop padded with zeros)
    assert np.all(mixed[80:] == 50), "Second half should average mic+zero-pad"


def test_mix_pads_shorter_mic_with_zeros():
    """TEST-1: when mic_frame is shorter than loop_frame, output must be loop-length."""
    captured = []

    def sink(pcm):
        captured.append(pcm)

    mic = (np.ones(80, dtype=np.int16) * 100).tobytes()   # half length
    loop = (np.ones(160, dtype=np.int16) * 200).tobytes()
    cap = AudioCapture(sink=sink, sample_rate=16000, frame_size=160, mic_index=0, loopback_index=1)
    cap._mix_and_emit(mic, loop)

    mixed = np.frombuffer(captured[0], dtype=np.int16)
    assert len(mixed) == 160, f"Expected 160 samples (loop length), got {len(mixed)}"
    assert np.all(mixed[:80] == 150), "First half should average mic+loop"
    assert np.all(mixed[80:] == 100), "Second half should average zero-pad+loop"


def test_missing_loopback_falls_back_to_mic_only():
    captured = []
    def sink(pcm): captured.append(pcm)
    mic_frame = (np.ones(160, dtype=np.int16) * 50).tobytes()
    cap = AudioCapture(sink=sink, sample_rate=16000, frame_size=160, mic_index=0, loopback_index=None)
    cap._mix_and_emit(mic_frame, None)
    mixed = np.frombuffer(captured[0], dtype=np.int16)
    assert np.all(mixed == 50)


def test_missing_sounddevice_logs_error_and_returns(caplog):
    """FAULT-9: _run() must log a helpful error and return (not raise) when sounddevice is absent."""
    import logging
    cap = AudioCapture(sink=lambda _: None)
    # Simulate sounddevice missing by patching the import
    with patch.dict(sys.modules, {"sounddevice": None}):
        import spec_lesson.capture.audio_input as _m
        with caplog.at_level(logging.ERROR, logger="spec_lesson.capture.audio_input"):
            cap._run()
    assert any("sounddevice" in r.message.lower() for r in caplog.records), (
        "FAULT-9: expected a log.error about missing sounddevice, got: "
        + str([r.message for r in caplog.records])
    )
