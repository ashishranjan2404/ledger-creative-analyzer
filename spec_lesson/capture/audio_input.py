"""Mic + loopback audio capture with numpy-based PCM mixing.

``AudioCapture`` opens up to two ``sounddevice.RawInputStream`` handles (mic
and optional BlackHole loopback), mixes them by averaging the int16 samples,
and emits 16 kHz mono int16 PCM frames to a caller-supplied sink.  All stream
management runs on a background daemon thread; call ``stop()`` to tear down.
"""
import threading
from typing import Callable, Optional

import numpy as np

PcmSink = Callable[[bytes], None]

class AudioCapture:
    """Capture mic + (optional) loopback, mix by averaging, emit 16kHz mono int16 PCM frames."""

    def __init__(
        self,
        sink: PcmSink,
        sample_rate: int = 16000,
        frame_size: int = 160,  # 10ms @ 16kHz
        mic_index: Optional[int] = None,
        loopback_index: Optional[int] = None,
    ):
        self._sink = sink
        self._sample_rate = sample_rate
        self._frame_size = frame_size
        self._mic_index = mic_index
        self._loopback_index = loopback_index
        self._stop = threading.Event()
        self._thread: Optional[threading.Thread] = None

    def _mix_and_emit(self, mic_frame: bytes, loop_frame: Optional[bytes]) -> None:
        mic = np.frombuffer(mic_frame, dtype=np.int16).astype(np.int32)
        if loop_frame is not None:
            loop = np.frombuffer(loop_frame, dtype=np.int16).astype(np.int32)
            # TEST-1 / data-integrity fix: pad the shorter stream with zeros so
            # that all mic samples are emitted.  The original min() truncation
            # silently discarded the tail of the mic stream when the loopback
            # frame was shorter (e.g. a hardware under-run), causing data loss
            # to Deepgram at 16 kHz.
            n = max(len(mic), len(loop))
            mic_p = np.pad(mic, (0, n - len(mic)))
            loop_p = np.pad(loop, (0, n - len(loop)))
            mixed = ((mic_p + loop_p) // 2).astype(np.int16)
        else:
            mixed = mic.astype(np.int16)
        self._sink(mixed.tobytes())

    def start(self) -> None:
        self._thread = threading.Thread(target=self._run, daemon=True)
        self._thread.start()

    def stop(self) -> None:
        self._stop.set()
        if self._thread is not None:
            self._thread.join(timeout=2.0)

    def _run(self) -> None:
        # RES-4 / Fix 9: construct and start all streams INSIDE the try block
        # so the finally clause can close any handle that was successfully
        # opened, even if a later start() call raises.
        import sounddevice
        mic_stream = None
        loop_stream = None
        try:
            mic_stream = sounddevice.RawInputStream(
                samplerate=self._sample_rate,
                channels=1,
                dtype="int16",
                blocksize=self._frame_size,
                device=self._mic_index,
            )
            mic_stream.start()

            if self._loopback_index is not None:
                loop_stream = sounddevice.RawInputStream(
                    samplerate=self._sample_rate,
                    channels=1,
                    dtype="int16",
                    blocksize=self._frame_size,
                    device=self._loopback_index,
                )
                loop_stream.start()

            while not self._stop.is_set():
                mic_buf, _ = mic_stream.read(self._frame_size)
                loop_buf = None
                if loop_stream is not None:
                    loop_buf, _ = loop_stream.read(self._frame_size)
                self._mix_and_emit(bytes(mic_buf), bytes(loop_buf) if loop_buf is not None else None)
        finally:
            for s in (mic_stream, loop_stream):
                if s is not None:
                    try:
                        s.stop()
                    except Exception:
                        pass
                    try:
                        s.close()
                    except Exception:
                        pass
