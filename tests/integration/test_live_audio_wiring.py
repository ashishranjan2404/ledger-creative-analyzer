import asyncio
import json
import pytest
from pathlib import Path
from unittest.mock import AsyncMock
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
    lines = session.transcript_jsonl.read_text().strip().splitlines()
    assert len(lines) == 2
    assert (session.state_dir / "triggers.log").exists()


@pytest.mark.asyncio
async def test_pause_fires_immediate_tier(tmp_path: Path):
    """When a pause >threshold is detected after an utterance, immediate tier runs."""
    project_dir = tmp_path / "p"
    project_dir.mkdir()
    session = Session.new(project_dir=project_dir)

    client = AsyncMock(spec=AnthropicClient)
    client.complete = AsyncMock(return_value='{"candidates":["a","b","c"]}')

    class FakeAudioSource:
        def __init__(self): self._cb = None
        def on_utterance(self, cb): self._cb = cb
        def start(self): pass
        def stop(self): pass
        def push(self, u): self._cb(u)

    source = FakeAudioSource()
    # COST-2: set immediate_min_utterances=1 for this test so a single
    # utterance is enough to trigger the tier (the default is 3 to save cost,
    # but here we want to verify the pause-detection wiring, not the rate-limit).
    cfg = OrchestratorConfig(
        thread_interval=999,
        context_interval=999,
        max_seconds=2.0,
        immediate_min_utterances=1,
        immediate_min_interval=0.0,
    )
    orch = Orchestrator(session=session, client=client, config=cfg, audio_source=source)
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
        await asyncio.sleep(0.8)
        orch._lifecycle.request_stop()

    await asyncio.gather(orch.run(), feed())
    assert fired, "immediate tier should have fired on pause"
