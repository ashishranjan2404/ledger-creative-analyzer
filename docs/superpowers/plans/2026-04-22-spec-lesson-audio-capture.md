# spec-lesson Plan 2 — Live Audio Capture + Feature B

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the `--transcript-stdin` shim with live audio: capture mic + system audio (Zoom/Meet/Teams) via BlackHole loopback, stream to Deepgram Nova-3 WebSocket, emit `Utterance` dicts into the existing Orchestrator. Also add the Immediate tier (Feature B) that fires on speaker pauses to produce 3 response candidates.

**Architecture:** Two new thin adapters plug into the Orchestrator built in Plan 1. A `DeepgramStream` class owns the WebSocket lifecycle and emits `Utterance` dicts as they come in. An `AudioCapture` class owns `sounddevice` mic+loopback mixing and pushes PCM frames into the stream. Both are isolated, mockable, and wire into the existing `Orchestrator.ingest()` method with zero changes to Plan 1 code. Feature B (Immediate tier) observes utterance timestamps and fires on pauses >1.2s.

**Tech Stack (additions):** `deepgram-sdk>=3.7` · `sounddevice>=0.4` · `numpy` (sounddevice dep). System dep: BlackHole 2ch (installed via `brew install blackhole-2ch` — user responsibility; the CLI validates the device is available).

**Scope excluded from this plan (deferred to later plans):**
- HUD rendering → **Plan 3**
- `/schedule` cross-session roll-up → **Plan 4**
- Non-macOS audio capture (Linux PulseAudio, Windows WASAPI) — post-MVP

---

## File Structure additions

```
spec_lesson/capture/              # NEW
├── __init__.py
├── deepgram_stream.py            # Deepgram WebSocket client
├── audio_input.py                # sounddevice mic+loopback capture
└── devices.py                    # BlackHole presence check + device enumeration

spec_lesson/tiers/
└── immediate.py                  # NEW: Feature B — pause-triggered response suggestions

spec_lesson/
├── orchestrator.py               # MODIFIED: accept optional audio source, register Immediate tier
└── cli.py                        # MODIFIED: new --audio flag (mutex with --transcript-stdin)

tests/unit/
├── test_deepgram_stream.py       # NEW: mock WS
├── test_immediate_tier.py        # NEW
└── test_devices.py               # NEW
tests/integration/
├── test_audio_capture.py         # NEW: using pre-recorded WAV fixture
└── fixtures/
    └── short_utterance.wav       # NEW: ~3s synthetic audio for fixture tests
```

---

## Task 16: Device enumeration + BlackHole presence check

**Files:**
- Create: `spec_lesson/capture/__init__.py` (empty)
- Create: `spec_lesson/capture/devices.py`
- Create: `tests/unit/test_devices.py`

- [ ] **Step 1: Failing test**

```python
# tests/unit/test_devices.py
from unittest.mock import patch
from spec_lesson.capture.devices import find_blackhole_device, DeviceError

def test_find_blackhole_returns_index_when_present():
    fake_devices = [
        {"name": "Built-in Mic", "max_input_channels": 2},
        {"name": "BlackHole 2ch", "max_input_channels": 2},
        {"name": "External Speakers", "max_input_channels": 0},
    ]
    with patch("sounddevice.query_devices", return_value=fake_devices):
        idx = find_blackhole_device()
        assert idx == 1

def test_find_blackhole_raises_when_missing():
    fake_devices = [
        {"name": "Built-in Mic", "max_input_channels": 2},
    ]
    with patch("sounddevice.query_devices", return_value=fake_devices):
        try:
            find_blackhole_device()
            assert False, "should have raised"
        except DeviceError as e:
            assert "blackhole" in str(e).lower()
            assert "brew install blackhole-2ch" in str(e)
```

- [ ] **Step 2: Verify fails**

```bash
source .venv/bin/activate
pytest tests/unit/test_devices.py -v
```

Expected: FAIL with `ModuleNotFoundError: spec_lesson.capture.devices`

- [ ] **Step 3: Implementation**

```python
# spec_lesson/capture/__init__.py
```

```python
# spec_lesson/capture/devices.py
class DeviceError(RuntimeError):
    pass

def find_blackhole_device() -> int:
    """Return the sounddevice index of BlackHole 2ch. Raise DeviceError if missing."""
    import sounddevice
    devices = sounddevice.query_devices()
    for idx, dev in enumerate(devices):
        if "blackhole" in dev["name"].lower() and dev["max_input_channels"] > 0:
            return idx
    raise DeviceError(
        "BlackHole 2ch virtual audio device not found. "
        "Install with: brew install blackhole-2ch"
    )
```

- [ ] **Step 4: Verify passes**

```bash
pytest tests/unit/test_devices.py -v
```

Expected: 2 passed.

- [ ] **Step 5: Commit**

```bash
git add spec_lesson/capture/__init__.py spec_lesson/capture/devices.py tests/unit/test_devices.py
git commit -m "feat(spec-lesson): BlackHole device enumeration"
```

---

## Task 17: Deepgram streaming client

**Files:**
- Create: `spec_lesson/capture/deepgram_stream.py`
- Create: `tests/unit/test_deepgram_stream.py`

Design: `DeepgramStream` owns the WebSocket. It exposes `start()`, `send_audio(bytes)`, `stop()`, and `on_utterance(callback)`. The callback receives `dict` payloads ready to feed into `Orchestrator.ingest()`. Under the hood it uses `deepgram-sdk`'s `LiveClient`.

- [ ] **Step 1: Failing test**

```python
# tests/unit/test_deepgram_stream.py
import pytest
from unittest.mock import MagicMock
from spec_lesson.capture.deepgram_stream import DeepgramStream

def test_on_utterance_callback_invoked_on_final_transcription():
    # we will dependency-inject a fake sdk object
    fake_dg = MagicMock()
    fake_live = MagicMock()
    fake_dg.listen.websocket.v.return_value = fake_live

    stream = DeepgramStream(api_key="fake", dg_sdk=fake_dg)
    received = []
    stream.on_utterance(lambda u: received.append(u))
    stream.start()

    # locate the "Transcript" event handler registered by start()
    handler_calls = [c for c in fake_live.on.call_args_list if c.args[0].name == "Transcript"]
    assert handler_calls, "should register a Transcript handler"
    transcript_handler = handler_calls[0].args[1]

    # simulate a final transcript event from Deepgram
    fake_event = MagicMock()
    fake_event.is_final = True
    fake_event.channel.alternatives = [MagicMock(transcript="hello world")]
    fake_event.start = 1.5
    fake_event.channel.alternatives[0].words = [MagicMock(speaker=0)]

    transcript_handler(None, fake_event)

    assert len(received) == 1
    u = received[0]
    assert u["text"] == "hello world"
    assert u["is_final"] is True
    assert u["timestamp"] == 1.5
    assert u["speaker"] == "speaker_0"

def test_interim_transcripts_are_ignored():
    fake_dg = MagicMock()
    fake_live = MagicMock()
    fake_dg.listen.websocket.v.return_value = fake_live
    stream = DeepgramStream(api_key="fake", dg_sdk=fake_dg)
    received = []
    stream.on_utterance(lambda u: received.append(u))
    stream.start()

    handler = [c for c in fake_live.on.call_args_list if c.args[0].name == "Transcript"][0].args[1]
    fake_event = MagicMock()
    fake_event.is_final = False
    fake_event.channel.alternatives = [MagicMock(transcript="partial")]
    fake_event.start = 0.5
    handler(None, fake_event)

    assert received == []

def test_send_audio_forwards_to_sdk():
    fake_dg = MagicMock()
    fake_live = MagicMock()
    fake_dg.listen.websocket.v.return_value = fake_live
    stream = DeepgramStream(api_key="fake", dg_sdk=fake_dg)
    stream.start()
    stream.send_audio(b"\x00" * 160)
    fake_live.send.assert_called_once_with(b"\x00" * 160)

def test_stop_calls_sdk_finish():
    fake_dg = MagicMock()
    fake_live = MagicMock()
    fake_dg.listen.websocket.v.return_value = fake_live
    stream = DeepgramStream(api_key="fake", dg_sdk=fake_dg)
    stream.start()
    stream.stop()
    fake_live.finish.assert_called_once()
```

- [ ] **Step 2: Verify fails**

```bash
pytest tests/unit/test_deepgram_stream.py -v
```

- [ ] **Step 3: Implementation**

```python
# spec_lesson/capture/deepgram_stream.py
from typing import Any, Callable, Optional

UtteranceCallback = Callable[[dict], None]

class DeepgramStream:
    """Thin wrapper over deepgram-sdk's LiveClient.

    Emits dict payloads ready for Orchestrator.ingest():
      {"timestamp": float, "speaker": str, "text": str, "is_final": bool}

    Only final (is_final=True) transcripts are forwarded.
    """

    def __init__(self, api_key: str, dg_sdk: Optional[Any] = None, model: str = "nova-3"):
        if dg_sdk is None:
            from deepgram import DeepgramClient
            dg_sdk = DeepgramClient(api_key)
        self._sdk = dg_sdk
        self._model = model
        self._live = None
        self._callback: Optional[UtteranceCallback] = None

    def on_utterance(self, callback: UtteranceCallback) -> None:
        self._callback = callback

    def start(self) -> None:
        from deepgram import LiveTranscriptionEvents, LiveOptions
        self._live = self._sdk.listen.websocket.v("1")

        def _on_transcript(_client, result, **_kwargs):
            if not getattr(result, "is_final", False):
                return
            alts = result.channel.alternatives
            if not alts:
                return
            text = alts[0].transcript.strip()
            if not text:
                return
            speaker_label = "user"
            words = getattr(alts[0], "words", None)
            if words:
                speaker_id = getattr(words[0], "speaker", None)
                if speaker_id is not None:
                    speaker_label = f"speaker_{speaker_id}"
            if self._callback:
                self._callback({
                    "timestamp": float(result.start),
                    "speaker": speaker_label,
                    "text": text,
                    "is_final": True,
                })

        self._live.on(LiveTranscriptionEvents.Transcript, _on_transcript)

        options = LiveOptions(
            model=self._model,
            smart_format=True,
            interim_results=False,
            diarize=True,
            punctuate=True,
            encoding="linear16",
            sample_rate=16000,
            channels=1,
        )
        self._live.start(options)

    def send_audio(self, pcm: bytes) -> None:
        if self._live is None:
            raise RuntimeError("DeepgramStream not started")
        self._live.send(pcm)

    def stop(self) -> None:
        if self._live is not None:
            self._live.finish()
            self._live = None
```

- [ ] **Step 4: Verify passes**

```bash
pytest tests/unit/test_deepgram_stream.py -v
```

Expected: 4 passed.

- [ ] **Step 5: Commit**

```bash
git add spec_lesson/capture/deepgram_stream.py tests/unit/test_deepgram_stream.py
git commit -m "feat(spec-lesson): Deepgram streaming client"
```

---

## Task 18: Audio input capture (mic + BlackHole mix)

**Files:**
- Create: `spec_lesson/capture/audio_input.py`
- Create: `tests/unit/test_audio_input.py`

Design: `AudioCapture` opens two `sounddevice.InputStream`s — one on the default mic, one on BlackHole — at 16kHz mono (resample if needed). For each pair of frames it averages PCM samples and calls `sink(pcm_bytes)`. Runs in a background thread.

- [ ] **Step 1: Failing test**

```python
# tests/unit/test_audio_input.py
import numpy as np
from unittest.mock import MagicMock, patch
from spec_lesson.capture.audio_input import AudioCapture

def test_mixes_two_streams_by_averaging():
    """Given a mic frame and a loopback frame, emit their average."""
    captured_sinks = []

    def sink(pcm: bytes):
        captured_sinks.append(pcm)

    # mic frame = all 100s; loopback frame = all 200s; expected average = all 150s
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
```

- [ ] **Step 2: Verify fails**

```bash
pytest tests/unit/test_audio_input.py -v
```

- [ ] **Step 3: Implementation**

```python
# spec_lesson/capture/audio_input.py
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
            n = min(len(mic), len(loop))
            mixed = ((mic[:n] + loop[:n]) // 2).astype(np.int16)
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
        import sounddevice
        mic_stream = sounddevice.RawInputStream(
            samplerate=self._sample_rate,
            channels=1,
            dtype="int16",
            blocksize=self._frame_size,
            device=self._mic_index,
        )
        loop_stream = None
        if self._loopback_index is not None:
            loop_stream = sounddevice.RawInputStream(
                samplerate=self._sample_rate,
                channels=1,
                dtype="int16",
                blocksize=self._frame_size,
                device=self._loopback_index,
            )

        mic_stream.start()
        if loop_stream is not None:
            loop_stream.start()
        try:
            while not self._stop.is_set():
                mic_buf, _ = mic_stream.read(self._frame_size)
                loop_buf = None
                if loop_stream is not None:
                    loop_buf, _ = loop_stream.read(self._frame_size)
                self._mix_and_emit(bytes(mic_buf), bytes(loop_buf) if loop_buf is not None else None)
        finally:
            mic_stream.stop(); mic_stream.close()
            if loop_stream is not None:
                loop_stream.stop(); loop_stream.close()
```

- [ ] **Step 4: Verify passes**

```bash
pytest tests/unit/test_audio_input.py -v
```

Expected: 2 passed.

- [ ] **Step 5: Commit**

```bash
git add spec_lesson/capture/audio_input.py tests/unit/test_audio_input.py
git commit -m "feat(spec-lesson): audio input mixer (mic + loopback)"
```

---

## Task 19: Immediate tier (Feature B — response suggestions)

**Files:**
- Create: `spec_lesson/tiers/immediate.py`
- Modify: `spec_lesson/tiers/prompts.py` (add `IMMEDIATE_SYSTEM`)
- Create: `tests/unit/test_immediate_tier.py`

Design: `ImmediateTier` is NOT periodic. It's invoked on-demand by the Orchestrator when a pause is detected (no new utterance for >1.2s). Takes the last 90s of transcript, returns a list of 3 short response candidates.

- [ ] **Step 1: Failing test**

```python
# tests/unit/test_immediate_tier.py
import pytest
from unittest.mock import AsyncMock
from spec_lesson.transcript.buffer import RollingTranscript
from spec_lesson.transcript.utterance import Utterance
from spec_lesson.tiers.immediate import ImmediateTier, ResponseSuggestions

def _u(t, text): return Utterance(timestamp=t, speaker="user", text=text, is_final=True)

@pytest.mark.asyncio
async def test_returns_three_suggestions():
    buf = RollingTranscript()
    buf.append(_u(1.0, "we're debating whether to use Deepgram or Whisper"))
    client = AsyncMock()
    client.complete = AsyncMock(return_value='{"candidates":["Deepgram is faster","Whisper is local","What are the latency needs?"]}')
    tier = ImmediateTier(client=client, buffer=buf)
    out = await tier.run(now=10.0)
    assert isinstance(out, ResponseSuggestions)
    assert out.candidates == [
        "Deepgram is faster",
        "Whisper is local",
        "What are the latency needs?",
    ]

@pytest.mark.asyncio
async def test_malformed_json_returns_empty():
    buf = RollingTranscript()
    buf.append(_u(1.0, "x"))
    client = AsyncMock()
    client.complete = AsyncMock(return_value="not json")
    tier = ImmediateTier(client=client, buffer=buf)
    out = await tier.run(now=2.0)
    assert out.candidates == []

@pytest.mark.asyncio
async def test_trims_candidates_to_three_if_more_returned():
    buf = RollingTranscript()
    buf.append(_u(1.0, "x"))
    client = AsyncMock()
    client.complete = AsyncMock(return_value='{"candidates":["a","b","c","d","e"]}')
    tier = ImmediateTier(client=client, buffer=buf)
    out = await tier.run(now=2.0)
    assert out.candidates == ["a", "b", "c"]
```

- [ ] **Step 2: Verify fails**

```bash
pytest tests/unit/test_immediate_tier.py -v
```

- [ ] **Step 3: Implementation**

First, add to `spec_lesson/tiers/prompts.py` (append at end):

```python
IMMEDIATE_SYSTEM = """You help an ADHD user respond in real time during a meeting.

You receive the last ~90 seconds of conversation transcript.

Output strict JSON with exactly three short response candidates — things the user could say next:
{
  "candidates": ["<cand 1>", "<cand 2>", "<cand 3>"]
}

Rules:
- Each candidate ≤ 15 words.
- Candidates should be diverse: one neutral/buying-time, one substantive, one clarifying question.
- JSON ONLY.
"""
```

Then `spec_lesson/tiers/immediate.py`:

```python
import json
from dataclasses import dataclass, field
from .client import AnthropicClient
from .prompts import IMMEDIATE_SYSTEM
from ..transcript.buffer import RollingTranscript

@dataclass
class ResponseSuggestions:
    candidates: list[str] = field(default_factory=list)

class ImmediateTier:
    name = "immediate"
    model = "claude-haiku-4-5"
    max_tokens = 200
    TAIL_SECONDS = 90.0

    def __init__(self, client: AnthropicClient, buffer: RollingTranscript):
        self._client = client
        self._buffer = buffer

    async def run(self, now: float) -> ResponseSuggestions:
        tail = self._buffer.tail(seconds=self.TAIL_SECONDS, now=now)
        tail_text = "\n".join(f"[{u.timestamp:.1f}] {u.speaker}: {u.text}" for u in tail)
        cached = "LAST 90 SECONDS:"
        fresh = tail_text or "(silence)"
        raw = await self._client.complete(
            model=self.model,
            system=IMMEDIATE_SYSTEM,
            cached_context=cached,
            fresh_input=fresh,
            max_tokens=self.max_tokens,
        )
        try:
            data = json.loads(raw)
            cands = list(data.get("candidates", []))[:3]
            return ResponseSuggestions(candidates=cands)
        except (json.JSONDecodeError, ValueError):
            return ResponseSuggestions(candidates=[])
```

- [ ] **Step 4: Verify passes**

```bash
pytest tests/unit/test_immediate_tier.py -v
```

Expected: 3 passed.

- [ ] **Step 5: Commit**

```bash
git add spec_lesson/tiers/immediate.py spec_lesson/tiers/prompts.py tests/unit/test_immediate_tier.py
git commit -m "feat(spec-lesson): Immediate tier for response suggestions"
```

---

## Task 20: Orchestrator + CLI live-audio integration

**Files:**
- Modify: `spec_lesson/orchestrator.py` (add audio source wiring + pause detection + Immediate tier hook)
- Modify: `spec_lesson/cli.py` (add `--audio` flag)
- Create: `tests/integration/test_live_audio_wiring.py`

Design choices:
- Orchestrator gets an optional `audio_source` argument. If provided, `run()` starts it and wires `on_utterance → self.ingest`.
- Pause detection: a tiny internal method `_maybe_fire_immediate_tier()` runs on a 0.5s interval. It checks `buffer.latest_timestamp()`; if `(wall_clock_now - latest_ts) > 1.2s` and no immediate-tier call fired since the latest utterance, fire one. Result is logged (HUD will consume it in Plan 3).
- `AudioSource` is a Protocol: `start()`, `stop()`, `on_utterance(callback)`. Both the stdin reader and live audio satisfy it.
- CLI adds `--audio`. Mutex with `--transcript-stdin`. Requires `DEEPGRAM_API_KEY` env var (fail fast with clear error).

- [ ] **Step 1: Failing test** (integration, using mock audio source)

```python
# tests/integration/test_live_audio_wiring.py
import asyncio
import json
import pytest
from pathlib import Path
from unittest.mock import AsyncMock, MagicMock
from spec_lesson.orchestrator import Orchestrator, OrchestratorConfig
from spec_lesson.session import Session
from spec_lesson.tiers.client import AnthropicClient

@pytest.mark.asyncio
async def test_audio_source_utterances_are_ingested(tmp_path: Path):
    project_dir = tmp_path / "p"
    project_dir.mkdir()
    session = Session.new(project_dir=project_dir)

    client = AsyncMock(spec=AnthropicClient)
    client.complete = AsyncMock(return_value=json.dumps({
        "topic": "t", "decisions": [], "requirements": [],
        "open_questions": [], "recent_verbatim": ""
    }))

    # fake audio source: captures the callback, can push utterances on demand
    class FakeAudioSource:
        def __init__(self):
            self._cb = None
            self.started = False
            self.stopped = False
        def on_utterance(self, cb): self._cb = cb
        def start(self): self.started = True
        def stop(self): self.stopped = True
        def push(self, u): self._cb(u)

    source = FakeAudioSource()
    cfg = OrchestratorConfig(thread_interval=999, context_interval=999, max_seconds=0.4)
    orch = Orchestrator(session=session, client=client, config=cfg, audio_source=source)

    async def feed():
        await asyncio.sleep(0.05)
        source.push({"timestamp": 1.0, "speaker": "user", "text": "hello", "is_final": True})
        source.push({"timestamp": 2.0, "speaker": "user", "text": "OK Claude build that", "is_final": True})

    await asyncio.gather(orch.run(), feed())

    assert source.started
    assert source.stopped
    # transcript persisted
    lines = session.transcript_jsonl.read_text().strip().splitlines()
    assert len(lines) == 2
    # trigger fired
    assert (session.state_dir / "triggers.log").exists()

@pytest.mark.asyncio
async def test_pause_fires_immediate_tier(tmp_path: Path, monkeypatch):
    """When a pause >1.2s is detected after an utterance, immediate tier runs."""
    project_dir = tmp_path / "p"
    project_dir.mkdir()
    session = Session.new(project_dir=project_dir)

    client = AsyncMock(spec=AnthropicClient)
    # ensure immediate tier JSON is valid
    client.complete = AsyncMock(return_value='{"candidates":["a","b","c"]}')

    class FakeAudioSource:
        def __init__(self): self._cb=None
        def on_utterance(self, cb): self._cb=cb
        def start(self): pass
        def stop(self): pass
        def push(self, u): self._cb(u)

    source = FakeAudioSource()
    cfg = OrchestratorConfig(thread_interval=999, context_interval=999, max_seconds=2.0)
    orch = Orchestrator(session=session, client=client, config=cfg, audio_source=source)
    # speed up pause check
    orch._pause_check_interval = 0.1
    orch._pause_threshold = 0.3

    fired = []
    original = orch._run_immediate
    async def spy():
        fired.append(True)
        await original()
    orch._run_immediate = spy

    async def feed():
        await asyncio.sleep(0.05)
        source.push({"timestamp": 1.0, "speaker": "user", "text": "something", "is_final": True})
        # then silence; pause detector should fire immediate tier
        await asyncio.sleep(0.8)
        orch._lifecycle.request_stop()

    await asyncio.gather(orch.run(), feed())
    assert fired, "immediate tier should have fired on pause"
```

- [ ] **Step 2: Verify fails**

```bash
pytest tests/integration/test_live_audio_wiring.py -v
```

Expected: fails because Orchestrator has no `audio_source` param / no pause detection.

- [ ] **Step 3: Orchestrator modifications**

Full revised `spec_lesson/orchestrator.py`:

```python
import asyncio
import logging
import time
from dataclasses import dataclass
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Optional, Protocol

from .lifecycle import SessionLifecycle
from .session import Session
from .tiers.client import AnthropicClient
from .tiers.context import ContextTier
from .tiers.thread import ThreadTier
from .tiers.polish import PolishTier
from .tiers.immediate import ImmediateTier
from .tiers.scheduler import PeriodicRunner
from .transcript.buffer import RollingTranscript
from .transcript.persist import TranscriptWriter
from .transcript.utterance import Utterance
from .trigger.detector import TriggerDetector
from .writer.claude_md import ClaudeMdWriter

log = logging.getLogger(__name__)


class AudioSource(Protocol):
    def on_utterance(self, cb) -> None: ...
    def start(self) -> None: ...
    def stop(self) -> None: ...


@dataclass
class OrchestratorConfig:
    thread_interval: float = 120.0
    context_interval: float = 300.0
    max_seconds: float = 5400.0


class Orchestrator:
    def __init__(
        self,
        session: Session,
        client: AnthropicClient,
        config: OrchestratorConfig,
        audio_source: Optional[AudioSource] = None,
    ):
        self.session = session
        self.client = client
        self.cfg = config
        self.audio_source = audio_source

        self.buffer = RollingTranscript()
        self.transcript_writer = TranscriptWriter(session.transcript_jsonl)
        self.claude_md_writer = ClaudeMdWriter(session.claude_md)

        self.context_tier = ContextTier(client=client, buffer=self.buffer)
        self.thread_tier = ThreadTier(client=client, buffer=self.buffer)
        self.polish_tier = PolishTier(client=client)
        self.immediate_tier = ImmediateTier(client=client, buffer=self.buffer)
        self.trigger = TriggerDetector()

        self._context_runner = PeriodicRunner(name="context", interval_seconds=config.context_interval, callback=self._run_context)
        self._thread_runner = PeriodicRunner(name="thread", interval_seconds=config.thread_interval, callback=self._run_thread)
        self._lifecycle = SessionLifecycle(state_dir=session.state_dir, max_seconds=config.max_seconds)
        self._lifecycle.on_shutdown(self._on_shutdown)

        # pause detection for Immediate tier
        self._pause_check_interval = 0.5  # seconds between checks
        self._pause_threshold = 1.2       # fire if last utterance is older than this
        self._last_immediate_for_ts: Optional[float] = None
        self._pause_task: Optional[asyncio.Task] = None

    def ingest(self, utterance_dict: dict) -> None:
        u = Utterance.from_dict(utterance_dict)
        self.buffer.append(u)
        self.transcript_writer.append(u)
        if u.is_final and self.trigger.check(u.text, now=u.timestamp):
            self._log_trigger(u)
            asyncio.create_task(self._context_runner.trigger_now())

    def _log_trigger(self, u: Utterance) -> None:
        line = f"{datetime.now(timezone.utc).isoformat()} | {u.text}\n"
        self.session.triggers_log.parent.mkdir(parents=True, exist_ok=True)
        with self.session.triggers_log.open("a", encoding="utf-8") as fh:
            fh.write(line)

    async def _run_context(self) -> None:
        latest = self.buffer.latest_timestamp()
        if latest is None:
            return
        dist = await self.context_tier.run(now=latest)
        self.claude_md_writer.write_managed_section(dist.render_markdown())

    async def _run_thread(self) -> None:
        latest = self.buffer.latest_timestamp()
        if latest is None:
            return
        baseline = self.context_tier.last.topic
        await self.thread_tier.run(baseline_topic=baseline, now=latest)
        log.info("thread tier ran")

    async def _run_immediate(self) -> None:
        latest = self.buffer.latest_timestamp()
        if latest is None:
            return
        out = await self.immediate_tier.run(now=latest)
        log.info("immediate: %s", out.candidates)

    async def _pause_watcher(self) -> None:
        """Watch for pauses. If `now - latest_utterance_ts > threshold` and we haven't
        fired immediate tier for this utterance yet, fire it."""
        while not self._lifecycle._stop_event.is_set():
            await asyncio.sleep(self._pause_check_interval)
            latest = self.buffer.latest_timestamp()
            if latest is None:
                continue
            # use wall clock delta since utterance was recorded (utterance ts is its own time)
            # For live audio, utterance ts tracks audio-stream time. We compare wall clock
            # since the tier was last fired, using a simple "has a pause elapsed since latest" heuristic.
            if self._last_immediate_for_ts == latest:
                continue
            elapsed = time.monotonic() - self._utterance_received_monotonic
            if elapsed >= self._pause_threshold:
                self._last_immediate_for_ts = latest
                try:
                    await self._run_immediate()
                except Exception as e:
                    log.warning("immediate tier failed: %s", e)

    async def _on_shutdown(self) -> None:
        self._context_runner.stop()
        self._thread_runner.stop()
        if self.audio_source is not None:
            try:
                self.audio_source.stop()
            except Exception:
                pass
        latest = self.buffer.latest_timestamp()
        if latest is not None:
            dist = await self.context_tier.run(now=latest)
            self.claude_md_writer.write_managed_section(dist.render_markdown())
            all_text = self.buffer.as_text()
            polished = await self.polish_tier.run(final_distillation=dist, full_transcript=all_text)
            self.session.distillation_md.write_text(polished, encoding="utf-8")
        self.transcript_writer.close()

    def _on_utterance_from_audio(self, utterance_dict: dict) -> None:
        """Bridge callback: audio source → ingest + update wall-clock marker for pause detector."""
        self._utterance_received_monotonic = time.monotonic()
        self.ingest(utterance_dict)

    async def run(self) -> None:
        self._lifecycle.install_signal_handlers()
        self._utterance_received_monotonic = time.monotonic()
        if self.audio_source is not None:
            self.audio_source.on_utterance(self._on_utterance_from_audio)
            self.audio_source.start()
        runners = asyncio.gather(
            self._context_runner.run(),
            self._thread_runner.run(),
            self._pause_watcher(),
            return_exceptions=True,
        )
        await self._lifecycle.run_until_done()
        self._context_runner.stop()
        self._thread_runner.stop()
        try:
            await runners
        except Exception:
            pass
```

- [ ] **Step 4: CLI modifications**

Add `--audio` to `spec-lesson start`. Full revised `spec_lesson/cli.py`:

```python
import asyncio
import json
import os
import sys
from pathlib import Path
from unittest.mock import AsyncMock

import typer

from .orchestrator import Orchestrator, OrchestratorConfig
from .session import Session
from .tiers.client import AnthropicClient

app = typer.Typer(help="spec-lesson: ADHD live meeting assistant", no_args_is_help=True)


def _canned_response(*, model, system, cached_context, fresh_input, max_tokens) -> str:
    if "thread" in system.lower():
        return '{"current_topic":"fake","drift":"on","drift_from":""}'
    if "respond in real time" in system.lower():
        return '{"candidates":["ok","understood","can you clarify?"]}'
    return json.dumps({
        "topic": "(fake) captured session",
        "decisions": ["decision from fake api"],
        "requirements": ["req from fake api"],
        "open_questions": [],
        "recent_verbatim": fresh_input[-200:],
    })


def _build_client() -> AnthropicClient:
    if os.environ.get("SPEC_LESSON_FAKE_API") == "1":
        sdk = AsyncMock()
        client = AnthropicClient(sdk=sdk)
        client.complete = AsyncMock(side_effect=lambda **kw: _canned_response(**kw))
        return client
    return AnthropicClient(sdk=None, api_key=os.environ.get("ANTHROPIC_API_KEY"))


def _build_cfg() -> OrchestratorConfig:
    cfg = OrchestratorConfig()
    override = os.environ.get("SPEC_LESSON_MAX_SECONDS")
    if override:
        cfg.max_seconds = float(override)
    return cfg


def _build_audio_source() -> "AudioSource":
    """Build the live audio source: mic + BlackHole → Deepgram → utterance callback."""
    from .capture.devices import find_blackhole_device, DeviceError
    from .capture.deepgram_stream import DeepgramStream
    from .capture.audio_input import AudioCapture

    dg_key = os.environ.get("DEEPGRAM_API_KEY")
    if not dg_key:
        typer.secho("DEEPGRAM_API_KEY is not set. Get one at https://deepgram.com", fg=typer.colors.RED)
        raise typer.Exit(1)

    loopback_idx = None
    try:
        loopback_idx = find_blackhole_device()
    except DeviceError as e:
        typer.secho(f"Warning: {e}\nProceeding with mic-only capture.", fg=typer.colors.YELLOW)

    stream = DeepgramStream(api_key=dg_key)
    cap = AudioCapture(sink=None, loopback_index=loopback_idx)

    class _LiveSource:
        def on_utterance(self, cb): stream.on_utterance(cb)
        def start(self):
            stream.start()
            cap._sink = stream.send_audio
            cap.start()
        def stop(self):
            cap.stop()
            stream.stop()

    return _LiveSource()


@app.command()
def start(
    transcript_stdin: bool = typer.Option(False, "--transcript-stdin", help="Read JSONL utterances from stdin"),
    audio: bool = typer.Option(False, "--audio", help="Capture mic + BlackHole loopback, transcribe via Deepgram"),
):
    """Start a spec-lesson session in the current directory."""
    if transcript_stdin and audio:
        typer.secho("--transcript-stdin and --audio are mutually exclusive", fg=typer.colors.RED)
        raise typer.Exit(2)
    if not (transcript_stdin or audio):
        typer.secho(
            "Choose a source: --audio (live) or --transcript-stdin (Plan 1 stdin).",
            fg=typer.colors.YELLOW,
        )
        raise typer.Exit(2)

    project_dir = Path.cwd()
    session = Session.new(project_dir=project_dir)
    client = _build_client()
    cfg = _build_cfg()

    audio_source = _build_audio_source() if audio else None
    orch = Orchestrator(session=session, client=client, config=cfg, audio_source=audio_source)

    if transcript_stdin:
        async def feed_stdin():
            loop = asyncio.get_running_loop()
            reader = asyncio.StreamReader()
            protocol = asyncio.StreamReaderProtocol(reader)
            await loop.connect_read_pipe(lambda: protocol, sys.stdin)
            while True:
                line = await reader.readline()
                if not line:
                    break
                line_s = line.decode("utf-8").strip()
                if not line_s:
                    continue
                try:
                    payload = json.loads(line_s)
                except json.JSONDecodeError:
                    continue
                orch.ingest(payload)

        async def main():
            await asyncio.gather(orch.run(), feed_stdin())

        asyncio.run(main())
    else:
        asyncio.run(orch.run())


@app.command()
def status():
    pid_file = Path.cwd() / ".spec-lesson" / "daemon.pid"
    if not pid_file.exists():
        typer.echo("spec-lesson: not running")
        return
    pid = int(pid_file.read_text().strip())
    try:
        os.kill(pid, 0)
    except ProcessLookupError:
        typer.echo(f"spec-lesson: stale pid file (pid {pid} gone) — run again to recover")
        return
    typer.echo(f"spec-lesson: running (pid {pid})")


@app.command()
def stop():
    pid_file = Path.cwd() / ".spec-lesson" / "daemon.pid"
    if not pid_file.exists():
        typer.echo("spec-lesson: not running")
        raise typer.Exit(1)
    pid = int(pid_file.read_text().strip())
    import signal
    os.kill(pid, signal.SIGTERM)
    typer.echo(f"spec-lesson: sent SIGTERM to pid {pid}")


if __name__ == "__main__":
    app()
```

- [ ] **Step 5: Verify passes**

```bash
pytest -q
```

Expected: all prior tests pass + 2 new integration tests (49 total, give or take).

- [ ] **Step 6: Commit**

```bash
git add spec_lesson/orchestrator.py spec_lesson/cli.py tests/integration/test_live_audio_wiring.py
git commit -m "feat(spec-lesson): live audio wiring + pause-triggered Immediate tier"
```

---

## Deferred

- HUD rendering (Plan 3) will subscribe to the Orchestrator's tier outputs instead of just logging them.
- `/schedule` cross-session roll-up (Plan 4) reads the archived Obsidian notes produced by Polish tier.

---

## Self-review

- **Spec §2 Feature B** (response suggestions, <1.5s) → Task 19 (Immediate tier) + Task 20 (pause detector wiring)
- **Spec §9 macOS audio capture + BlackHole** → Task 16 (device check) + Task 18 (audio input)
- **Spec §9 Deepgram Nova-3 streaming** → Task 17
- **Spec §8 `DEEPGRAM_API_KEY` check** → Task 20 CLI `_build_audio_source`
- All previously-passing tests (47) must remain green after Plan 2 — the orchestrator changes are additive and gated on `audio_source is None`.

No placeholders. Interfaces match: `AudioSource` protocol satisfied by the `_LiveSource` closure in `cli.py`; `DeepgramStream.on_utterance` signature matches `_LiveSource.on_utterance`; `AudioCapture` sink signature matches `DeepgramStream.send_audio`.
