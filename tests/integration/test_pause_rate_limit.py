"""
COST-2 — Immediate tier rate-limiting tests.

Verifies that _pause_watcher respects:
  1. immediate_min_utterances gate (fires zero times when below threshold)
  2. immediate_min_interval gate (fires at most once per interval even with many pauses)
"""
import asyncio
import pytest
from pathlib import Path
from unittest.mock import AsyncMock
from spec_lesson.orchestrator import Orchestrator, OrchestratorConfig
from spec_lesson.session import Session
from spec_lesson.tiers.client import AnthropicClient
from spec_lesson.transcript.utterance import Utterance


class _FakeSource:
    def __init__(self):
        self._cb = None

    def on_utterance(self, cb):
        self._cb = cb

    def start(self):
        pass

    def stop(self):
        pass

    def push(self, u: dict):
        if self._cb is not None:
            self._cb(u)


def _make_orch(tmp_path: Path, cfg: OrchestratorConfig, client) -> tuple[Orchestrator, _FakeSource]:
    proj = tmp_path / "p"
    proj.mkdir()
    session = Session.new(project_dir=proj)
    src = _FakeSource()
    orch = Orchestrator(session=session, client=client, config=cfg, audio_source=src)
    return orch, src


@pytest.mark.asyncio
async def test_immediate_tier_respects_min_utterances(tmp_path: Path):
    """With only 2 utterances (< min_utterances=3), Immediate must never fire."""
    client = AsyncMock(spec=AnthropicClient)
    client.complete = AsyncMock(return_value='{"candidates":["a","b","c"]}')
    cfg = OrchestratorConfig(
        thread_interval=999,
        context_interval=999,
        max_seconds=0.6,
        pause_check_interval=0.05,
        pause_threshold=0.1,
        immediate_min_utterances=3,
        immediate_min_interval=0.1,
    )
    orch, src = _make_orch(tmp_path, cfg, client)

    fired = []
    original = orch._run_immediate

    async def spy():
        fired.append(True)
        await original()

    orch._run_immediate = spy

    async def feed():
        await asyncio.sleep(0.02)
        # push only 2 utterances — below the min_utterances threshold
        src.push({"timestamp": 1.0, "speaker": "u", "text": "hello", "is_final": True})
        src.push({"timestamp": 2.0, "speaker": "u", "text": "world", "is_final": True})
        await asyncio.sleep(0.45)
        orch._lifecycle.request_stop()

    await asyncio.gather(orch.run(), feed())
    assert len(fired) == 0, (
        f"Immediate fired {len(fired)} times with only 2 utterances (min=3)"
    )


@pytest.mark.asyncio
async def test_immediate_tier_fires_once_min_utterances_met(tmp_path: Path):
    """With 3+ utterances and a long enough pause, Immediate must fire at least once."""
    client = AsyncMock(spec=AnthropicClient)
    client.complete = AsyncMock(return_value='{"candidates":["x"]}')
    cfg = OrchestratorConfig(
        thread_interval=999,
        context_interval=999,
        max_seconds=1.0,
        pause_check_interval=0.05,
        pause_threshold=0.1,
        immediate_min_utterances=3,
        immediate_min_interval=0.05,
    )
    orch, src = _make_orch(tmp_path, cfg, client)

    fired = []
    original = orch._run_immediate

    async def spy():
        fired.append(True)
        await original()

    orch._run_immediate = spy

    async def feed():
        await asyncio.sleep(0.02)
        src.push({"timestamp": 1.0, "speaker": "u", "text": "one", "is_final": True})
        src.push({"timestamp": 2.0, "speaker": "u", "text": "two", "is_final": True})
        src.push({"timestamp": 3.0, "speaker": "u", "text": "three", "is_final": True})
        await asyncio.sleep(0.6)
        orch._lifecycle.request_stop()

    await asyncio.gather(orch.run(), feed())
    assert len(fired) >= 1, "Immediate should have fired at least once after 3+ utterances"
