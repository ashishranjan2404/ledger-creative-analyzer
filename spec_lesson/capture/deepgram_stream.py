from typing import Any, Callable, Optional, Union

UtteranceCallback = Callable[[dict], None]


class DeepgramStream:
    """Thin wrapper over deepgram-sdk's live WebSocket client.

    Emits dict payloads ready for Orchestrator.ingest():
      {"timestamp": float, "speaker": str, "text": str, "is_final": bool}

    Only final (is_final=True) transcripts are forwarded.
    """

    def __init__(self, api_key: str, dg_sdk: Optional[Any] = None, model: str = "nova-3"):
        if dg_sdk is None:
            from deepgram import DeepgramClient
            dg_sdk = DeepgramClient(api_key=api_key)
        self._sdk = dg_sdk
        self._model = model
        self._socket = None
        self._callback: Optional[UtteranceCallback] = None

    def on_utterance(self, callback: UtteranceCallback) -> None:
        """Register a callback to be invoked for each final utterance."""
        self._callback = callback

    def start(self) -> None:
        """Connect to Deepgram WebSocket and configure options."""
        # Connect to Deepgram
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
        # Socket is now ready to send audio and recv messages

    def process_message(
        self, result: Any
    ) -> Optional[dict]:
        """Process a message from Deepgram and return utterance dict if final."""
        # Check if this is a results message and if it's final
        if not hasattr(result, "is_final"):
            return None

        if not getattr(result, "is_final", False):
            return None

        # Extract alternatives
        alts = getattr(result, "channel", None)
        if alts is None:
            return None

        alts = getattr(alts, "alternatives", [])
        if not alts:
            return None

        text = alts[0].transcript.strip()
        if not text:
            return None

        # Determine speaker label
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
        """Send audio bytes to Deepgram."""
        if self._socket is None:
            raise RuntimeError("DeepgramStream not started")
        self._socket.send_media(pcm)

    def stop(self) -> None:
        """Finalize the stream and close the socket."""
        if self._socket is not None:
            self._socket.send_finalize()
            self._socket = None
