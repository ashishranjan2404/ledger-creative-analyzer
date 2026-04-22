"""Audio ingress pipeline: adapts audio source events → utterance events.

Responsibilities:
- Own the ``AudioSource`` lifecycle (start/stop).
- Ingest incoming utterance dicts from the audio thread.
- Write each utterance to the transcript JSONL file (with fsync).
- Detect the "OK Claude, build that" trigger phrase and log fires.
- Expose the ``RollingTranscript`` buffer, ``TriggerDetector``, and
  ``TranscriptWriter`` for use by tiers and the shutdown path.

Does NOT own: tier scheduling, HUD updates, lifecycle, polish.
Those stay on ``Orchestrator``.
"""

import logging
import time
from pathlib import Path
from typing import Callable, Optional, Protocol

from .transcript.buffer import RollingTranscript
from .transcript.persist import TranscriptWriter
from .transcript.utterance import Utterance
from .trigger.detector import TriggerDetector

log = logging.getLogger(__name__)

OnTriggerFired = Callable[[Utterance], None]


class AudioSource(Protocol):
    """Structural interface for any audio input source.

    Implementors must support ``on_utterance(cb)`` to register a callback,
    ``start()`` to begin capture, and ``stop()`` to tear down cleanly.
    ``cli._LiveSource`` and test mocks satisfy this protocol.
    """

    def on_utterance(self, cb: Callable[[dict], None]) -> None: ...
    def start(self) -> None: ...
    def stop(self) -> None: ...


class AudioIngress:
    """Owns audio source + transcript persistence + trigger detection.

    The ``buffer``, ``transcript_writer``, and ``trigger`` attributes are
    public so ``Orchestrator`` (and tests) can read them directly.  All
    mutation goes through ``ingest()`` / ``on_utterance_from_audio()``.
    """

    def __init__(
        self,
        transcript_path: Path,
        triggers_log_path: Path,
        audio_source: Optional[AudioSource] = None,
        on_trigger_fired: Optional[OnTriggerFired] = None,
    ) -> None:
        self.audio_source = audio_source
        self.buffer = RollingTranscript()
        self.transcript_writer = TranscriptWriter(transcript_path)
        self.trigger = TriggerDetector()
        self._triggers_log_path = triggers_log_path
        self._on_trigger_fired = on_trigger_fired
        self._utterance_received_monotonic: float = time.monotonic()

    @property
    def last_utterance_monotonic(self) -> float:
        """Monotonic timestamp of the most recent utterance arrival."""
        return self._utterance_received_monotonic

    def ingest(self, utterance_dict: dict) -> None:
        """Parse *utterance_dict*, append to buffer + transcript, check trigger.

        Call order is preserved from the original Orchestrator.ingest():
        buffer.append first, then transcript_writer.append.
        """
        u = Utterance.safe_from_dict(utterance_dict)
        if u is None:
            return  # malformed frame — warning already logged in safe_from_dict
        self.buffer.append(u)
        self.transcript_writer.append(u)
        if u.is_final and self.trigger.check(u.text, now=u.timestamp):
            self.trigger.log_fire(self._triggers_log_path, u.text)
            if self._on_trigger_fired is not None:
                try:
                    self._on_trigger_fired(u)
                except Exception as e:
                    log.warning("on_trigger_fired callback failed: %s", e)

    def on_utterance_from_audio(self, utterance_dict: dict) -> None:
        """Bridge callback from audio thread; updates wall-clock marker before ingesting."""
        self._utterance_received_monotonic = time.monotonic()
        self.ingest(utterance_dict)

    def start(self) -> None:
        """Register callback and start the audio source if one is configured."""
        if self.audio_source is not None:
            self.audio_source.on_utterance(self.on_utterance_from_audio)
            self.audio_source.start()

    def stop(self) -> None:
        """Stop the audio source, swallowing errors to allow clean shutdown."""
        if self.audio_source is not None:
            try:
                self.audio_source.stop()
            except Exception as e:
                log.warning("audio_source.stop failed: %s", e)

    def close(self) -> None:
        """Close the transcript file handle. Call at session shutdown."""
        self.transcript_writer.close()
