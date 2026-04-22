import threading
from typing import Any, Callable, Optional

UtteranceCallback = Callable[[dict], None]


class DeepgramStream:
    """Thin wrapper over deepgram-sdk v6 live WebSocket client.

    Emits dict payloads ready for Orchestrator.ingest():
      {"timestamp": float, "speaker": str, "text": str, "is_final": bool}

    Only final (is_final=True) transcripts are forwarded. Messages are
    read on a background daemon thread started by start().
    """

    def __init__(self, api_key: str, dg_sdk: Optional[Any] = None, model: str = "nova-3"):
        if dg_sdk is None:
            from deepgram import DeepgramClient
            dg_sdk = DeepgramClient(api_key=api_key)
        self._sdk = dg_sdk
        self._model = model
        self._socket = None
        self._callback: Optional[UtteranceCallback] = None
        self._pump_thread: Optional[threading.Thread] = None
        self._stop = threading.Event()

    def on_utterance(self, callback: UtteranceCallback) -> None:
        self._callback = callback

    def start(self) -> None:
        socket_iterator = self._sdk.listen.v1.connect(
            model=self._model,
            smart_format=True,
            interim_results=False,
            diarize=True,
            punctuate=True,
            encoding="linear16",
            sample_rate=16000,
            channels=1,
        )
        self._socket = next(socket_iterator)
        self._stop.clear()
        self._pump_thread = threading.Thread(target=self._pump, daemon=True)
        self._pump_thread.start()

    def process_message(self, result: Any) -> Optional[dict]:
        """Convert a Deepgram result into an utterance dict (or None) and fire the callback."""
        if not hasattr(result, "is_final"):
            return None
        if not getattr(result, "is_final", False):
            return None
        alts = getattr(result, "channel", None)
        if alts is None:
            return None
        alts = getattr(alts, "alternatives", [])
        if not alts:
            return None
        text = alts[0].transcript.strip()
        if not text:
            return None
        speaker_label = "user"
        words = getattr(alts[0], "words", None)
        if words:
            speaker_id = getattr(words[0], "speaker", None)
            if speaker_id is not None:
                speaker_label = f"speaker_{int(speaker_id)}"
        utterance = {
            "timestamp": float(result.start),
            "speaker": speaker_label,
            "text": text,
            "is_final": True,
        }
        if self._callback:
            self._callback(utterance)
        return utterance

    def _pump(self) -> None:
        """Read messages from socket in a loop, fire callbacks via process_message."""
        if self._socket is None:
            return
        try:
            for msg in self._socket:
                if self._stop.is_set():
                    break
                try:
                    self.process_message(msg)
                except Exception:
                    # one bad message shouldn't kill the pump
                    continue
        except Exception:
            # socket closed or errored — pump exits
            pass

    def send_audio(self, pcm: bytes) -> None:
        if self._socket is None:
            raise RuntimeError("DeepgramStream not started")
        self._socket.send_media(pcm)

    def stop(self) -> None:
        self._stop.set()
        if self._socket is not None:
            try:
                self._socket.send_finalize()
            except Exception:
                pass
            self._socket = None
        if self._pump_thread is not None:
            self._pump_thread.join(timeout=2.0)
            self._pump_thread = None
