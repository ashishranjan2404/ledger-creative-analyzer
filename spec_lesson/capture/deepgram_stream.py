"""Deepgram WebSocket live transcription client (SDK v6).

``DeepgramStream`` runs a background pump thread that streams PCM audio frames
to Deepgram's Nova-3 model and emits final-transcript dicts ready for
``Orchestrator.ingest()``.  Audio is sent via ``send_audio(pcm)``; the pump
thread signals readiness via a ``threading.Event`` so ``start()`` blocks only
until the socket is established (or raises after 10 s timeout).
"""
import logging
import threading
from typing import Any, Callable, Optional

log = logging.getLogger(__name__)

UtteranceCallback = Callable[[dict], None]
ErrorCallback = Callable[[str], None]  # reason string, e.g. "WebSocket closed by remote"


class DeepgramStream:
    """Thin wrapper over deepgram-sdk v6 live WebSocket client.

    Emits dict payloads ready for Orchestrator.ingest():
      {"timestamp": float, "speaker": str, "text": str, "is_final": bool}

    Only final (is_final=True) transcripts are forwarded. Messages are
    read on a background daemon thread started by start().

    The deepgram-sdk v6 connect() method is a @contextmanager, so the socket
    must be entered and exited in a scope that lives for the entire stream
    lifetime.  We enter the contextmanager inside the pump thread and signal
    readiness via a threading.Event so that start() can safely return only
    after the socket is established (or fail fast if connect fails within 10s).

    Implicit keepalive: AudioCapture._run delivers silence frames (all-zero bytes)
    at 10ms intervals even when the mic is muted.  These frames keep the Deepgram
    WebSocket alive without a separate ping loop.  In --transcript-stdin mode
    DeepgramStream is never started, so no keepalive is needed.
    """

    def __init__(self, api_key: str, dg_sdk: Optional[Any] = None, model: str = "nova-3"):
        if dg_sdk is None:
            from deepgram import DeepgramClient
            dg_sdk = DeepgramClient(api_key=api_key)
        self._sdk = dg_sdk
        self._model = model
        self._socket = None
        self._callback: Optional[UtteranceCallback] = None
        self._error_callback: Optional[ErrorCallback] = None
        self._pump_thread: Optional[threading.Thread] = None
        self._stop = threading.Event()
        self._ready: Optional[threading.Event] = None
        # Set True inside the with-block to indicate the connect() succeeded.
        # Stays True even after finally clears _socket so start() can distinguish
        # a fast-exiting-but-valid connection from an auth failure.
        self._connected_ok: bool = False

    def on_utterance(self, callback: UtteranceCallback) -> None:
        self._callback = callback

    def on_error(self, callback: ErrorCallback) -> None:
        """Register a callback fired when the pump exits unexpectedly (not via stop())."""
        self._error_callback = callback

    def start(self) -> None:
        self._stop.clear()
        self._connected_ok = False
        self._ready = threading.Event()
        self._pump_thread = threading.Thread(target=self._pump, daemon=True)
        self._pump_thread.start()
        # Wait for the pump thread to enter the contextmanager and set self._socket.
        if not self._ready.wait(timeout=10.0):
            raise RuntimeError("Deepgram stream failed to connect within 10s")
        if not self._connected_ok:
            # Pump set _ready via the finally branch — connection failed (e.g. 401 auth error).
            raise RuntimeError(
                "Deepgram stream failed to connect (check DEEPGRAM_API_KEY and network)"
            )

    def _pump(self) -> None:
        """Enter the Deepgram contextmanager, signal readiness, then drain messages."""
        _clean_exit = False
        _reason = "WebSocket closed by remote"
        try:
            with self._sdk.listen.v1.connect(
                model=self._model,
                smart_format=True,
                interim_results=False,
                diarize=True,
                punctuate=True,
                encoding="linear16",
                sample_rate=16000,
                channels=1,
            ) as socket:
                self._socket = socket
                self._connected_ok = True
                if self._ready is not None:
                    self._ready.set()
                for msg in socket:
                    if self._stop.is_set():
                        _clean_exit = True
                        break
                    try:
                        self.process_message(msg)
                    except Exception:
                        # one bad message shouldn't kill the pump
                        continue
                # for-loop ended; determine whether this was a clean (stop()-initiated)
                # exit or an unexpected remote close.
                if self._stop.is_set():
                    _clean_exit = True   # stop() was called before or during the loop
                else:
                    _clean_exit = False  # remote closed without our stop()
        except Exception as e:
            log.warning("Deepgram pump exited: %s", e)
            _reason = str(e) or "unknown error"
        finally:
            self._socket = None
            # Unblock start() if we never got to set _ready inside the with-block.
            if self._ready is not None and not self._ready.is_set():
                self._ready.set()
            if not _clean_exit and self._error_callback is not None:
                try:
                    self._error_callback(_reason)
                except Exception:
                    pass

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
            # socket is managed by the pump thread's contextmanager; don't null here
        if self._pump_thread is not None:
            self._pump_thread.join(timeout=3.0)
            self._pump_thread = None
