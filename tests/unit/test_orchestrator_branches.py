# tests/unit/test_orchestrator_branches.py
"""Covers orchestrator.py missed branches: observer try/except paths,
pause_watcher gates (min_utterances, min_interval), audio_source.stop() error,
_run_thread observer path."""
import asyncio
import json
import time
import pytest
from pathlib import Path
from unittest.mock import AsyncMock, MagicMock

from spec_lesson.orchestrator import Orchestrator, OrchestratorConfig
from spec_lesson.session import Session
from spec_lesson.tiers.client import AnthropicClient
from spec_lesson.hud.observer import HudObserver


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _fake_client(extra_responses=None):
    """Return an AnthropicClient whose complete() returns canned JSON."""
    responses = extra_responses or []
    default = json.dumps({
        "topic": "test", "decisions": [], "requirements": [],
        "open_questions": [], "recent_verbatim": "",
    })
    client = AsyncMock(spec=AnthropicClient)
    client.complete = AsyncMock(side_effect=responses or [default] * 20)
    return client


def _cfg(**kwargs):
    base = dict(thread_interval=999, context_interval=999, max_seconds=0.4,
                pause_check_interval=0.05, pause_threshold=0.1,
                immediate_min_utterances=1, immediate_min_interval=0.0)
    base.update(kwargs)
    return OrchestratorConfig(**base)


async def _run_orch_with_feeder(orch, feeder_coro, timeout=2.0):
    await asyncio.wait_for(asyncio.gather(orch.run(), feeder_coro), timeout=timeout)


# ---------------------------------------------------------------------------
# orchestrator.py:202 — min_utterances gate in _pause_watcher
# ---------------------------------------------------------------------------

@pytest.mark.asyncio
async def test_pause_watcher_respects_min_utterances_gate(tmp_path: Path):
    """ImmediateTier must NOT fire when buffer has fewer utterances than
    immediate_min_utterances. Covers orchestrator.py:202."""
    project_dir = tmp_path / "p"
    project_dir.mkdir()
    session = Session.new(project_dir=project_dir)
    # Need many utterances before first fire; we only feed 1.
    client = _fake_client([json.dumps({
        "topic": "t", "decisions": [], "requirements": [],
        "open_questions": [], "recent_verbatim": "",
        "candidates": [],
    })] * 20)
    immediate_mock = AsyncMock(return_value=MagicMock(candidates=[]))
    cfg = _cfg(immediate_min_utterances=5, max_seconds=0.3)
    orch = Orchestrator(session=session, client=client, config=cfg)
    orch._run_immediate = immediate_mock

    async def feeder():
        await asyncio.sleep(0.05)
        orch.ingest({"timestamp": 1.0, "speaker": "user", "text": "hi", "is_final": True})
        await asyncio.sleep(0.25)

    await _run_orch_with_feeder(orch, feeder())
    # With only 1 utterance and min=5, _run_immediate must not have been called.
    immediate_mock.assert_not_called()


# ---------------------------------------------------------------------------
# orchestrator.py:211 — min_interval gate in _pause_watcher
# ---------------------------------------------------------------------------

@pytest.mark.asyncio
async def test_pause_watcher_respects_min_interval_gate(tmp_path: Path):
    """ImmediateTier must NOT fire a second time within min_interval wall-clock
    seconds. Covers orchestrator.py:211."""
    project_dir = tmp_path / "p"
    project_dir.mkdir()
    session = Session.new(project_dir=project_dir)
    client = _fake_client([json.dumps({
        "topic": "t", "decisions": [], "requirements": [],
        "open_questions": [], "recent_verbatim": "",
    })] * 20)
    immediate_mock = AsyncMock(return_value=MagicMock(candidates=[]))
    # Set a very long min_interval (60s) so the second fire is gated.
    cfg = _cfg(immediate_min_utterances=1, immediate_min_interval=60.0,
               pause_threshold=0.05, max_seconds=0.4)
    orch = Orchestrator(session=session, client=client, config=cfg)
    orch._run_immediate = immediate_mock

    async def feeder():
        await asyncio.sleep(0.02)
        # Feed enough utterances; pause_watcher should fire once then gate.
        for i in range(3):
            orch.ingest({"timestamp": float(i), "speaker": "user",
                         "text": f"word {i}", "is_final": True})
        await asyncio.sleep(0.35)

    await _run_orch_with_feeder(orch, feeder())
    # Should have fired at most once because min_interval is 60s.
    assert immediate_mock.call_count <= 1


# ---------------------------------------------------------------------------
# orchestrator.py:218-219 — _pause_watcher swallows exceptions from _run_immediate
# ---------------------------------------------------------------------------

@pytest.mark.asyncio
async def test_pause_watcher_swallows_immediate_tier_exception(tmp_path: Path):
    """An exception raised inside _run_immediate must not crash _pause_watcher.
    Covers orchestrator.py:218-219."""
    project_dir = tmp_path / "p"
    project_dir.mkdir()
    session = Session.new(project_dir=project_dir)
    client = _fake_client([json.dumps({
        "topic": "t", "decisions": [], "requirements": [],
        "open_questions": [], "recent_verbatim": "",
    })] * 20)
    exploding_immediate = AsyncMock(side_effect=RuntimeError("boom"))
    cfg = _cfg(immediate_min_utterances=1, immediate_min_interval=0.0,
               pause_threshold=0.05, max_seconds=0.4)
    orch = Orchestrator(session=session, client=client, config=cfg)
    orch._run_immediate = exploding_immediate

    async def feeder():
        await asyncio.sleep(0.02)
        orch.ingest({"timestamp": 1.0, "speaker": "user", "text": "hi", "is_final": True})
        await asyncio.sleep(0.35)

    # Must not propagate RuntimeError out of orch.run()
    await _run_orch_with_feeder(orch, feeder())


# ---------------------------------------------------------------------------
# orchestrator.py:164-177 — observer.on_thread try/except in _run_thread
# ---------------------------------------------------------------------------

@pytest.mark.asyncio
async def test_run_thread_observer_exception_is_swallowed(tmp_path: Path):
    """observer.on_thread() raising must not propagate. Covers orchestrator.py:164-177."""
    project_dir = tmp_path / "p"
    project_dir.mkdir()
    session = Session.new(project_dir=project_dir)
    thread_resp = json.dumps({"current_topic": "x", "drift": "on", "drift_from": ""})
    context_resp = json.dumps({
        "topic": "t", "decisions": [], "requirements": [],
        "open_questions": [], "recent_verbatim": "",
    })
    client = AsyncMock(spec=AnthropicClient)
    client.complete = AsyncMock(side_effect=[context_resp, thread_resp] * 10)

    bad_observer = MagicMock(spec=HudObserver)
    bad_observer.on_thread = MagicMock(side_effect=RuntimeError("observer broken"))
    bad_observer.tick = MagicMock()
    bad_observer.on_context = MagicMock()

    cfg = _cfg(thread_interval=0.05, max_seconds=0.35)
    orch = Orchestrator(session=session, client=client, config=cfg, observer=bad_observer)

    async def feeder():
        await asyncio.sleep(0.02)
        orch.ingest({"timestamp": 1.0, "speaker": "user", "text": "hello", "is_final": True})
        await asyncio.sleep(0.3)

    # Must not raise despite bad observer.
    await _run_orch_with_feeder(orch, feeder())
    bad_observer.on_thread.assert_called()


# ---------------------------------------------------------------------------
# orchestrator.py:186-190 — observer.on_immediate try/except in _run_immediate
# ---------------------------------------------------------------------------

@pytest.mark.asyncio
async def test_run_immediate_observer_exception_is_swallowed(tmp_path: Path):
    """observer.on_immediate() raising must be swallowed. Covers orchestrator.py:186-190."""
    project_dir = tmp_path / "p"
    project_dir.mkdir()
    session = Session.new(project_dir=project_dir)
    imm_resp = json.dumps({"candidates": ["yes", "no"]})
    context_resp = json.dumps({
        "topic": "t", "decisions": [], "requirements": [],
        "open_questions": [], "recent_verbatim": "",
    })
    client = AsyncMock(spec=AnthropicClient)
    client.complete = AsyncMock(side_effect=[context_resp, imm_resp] * 10)

    bad_observer = MagicMock(spec=HudObserver)
    bad_observer.on_immediate = MagicMock(side_effect=RuntimeError("observer broken"))
    bad_observer.tick = MagicMock()
    bad_observer.on_context = MagicMock()
    bad_observer.on_thread = MagicMock()

    cfg = _cfg(immediate_min_utterances=1, immediate_min_interval=0.0,
               pause_threshold=0.05, max_seconds=0.4)
    orch = Orchestrator(session=session, client=client, config=cfg, observer=bad_observer)

    async def feeder():
        await asyncio.sleep(0.02)
        orch.ingest({"timestamp": 1.0, "speaker": "user", "text": "hi", "is_final": True})
        await asyncio.sleep(0.35)

    await _run_orch_with_feeder(orch, feeder())
    bad_observer.on_immediate.assert_called()


# ---------------------------------------------------------------------------
# orchestrator.py:231-232 — audio_source.stop() exception is swallowed
# ---------------------------------------------------------------------------

@pytest.mark.asyncio
async def test_on_shutdown_swallows_audio_source_stop_exception(tmp_path: Path):
    """audio_source.stop() raising must not propagate out of _on_shutdown.
    Covers orchestrator.py:231-232."""
    project_dir = tmp_path / "p"
    project_dir.mkdir()
    session = Session.new(project_dir=project_dir)
    client = _fake_client([json.dumps({
        "topic": "t", "decisions": [], "requirements": [],
        "open_questions": [], "recent_verbatim": "",
    })] * 10)
    bad_audio = MagicMock()
    bad_audio.on_utterance = MagicMock()
    bad_audio.start = MagicMock()
    bad_audio.stop = MagicMock(side_effect=OSError("audio device gone"))

    cfg = _cfg(max_seconds=0.2)
    orch = Orchestrator(session=session, client=client, config=cfg, audio_source=bad_audio)
    # Must not raise.
    await orch.run()
    bad_audio.stop.assert_called_once()
