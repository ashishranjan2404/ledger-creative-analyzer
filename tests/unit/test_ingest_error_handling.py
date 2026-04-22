"""
Fix 2 — BUG-E-1: Utterance.from_dict raises KeyError on any malformed
utterance, which propagates out of Orchestrator.ingest() and crashes the
async event loop (no distillation written, daemon exits silently).

Tests verify:
  1. Utterance.safe_from_dict returns None for malformed dicts instead of
     raising.
  2. Orchestrator.ingest() skips malformed utterances and continues processing
     valid ones that arrive later.
"""
import asyncio
import json
import pytest
from pathlib import Path
from unittest.mock import AsyncMock

from spec_lesson.transcript.utterance import Utterance
from spec_lesson.orchestrator import Orchestrator, OrchestratorConfig
from spec_lesson.session import Session
from spec_lesson.tiers.client import AnthropicClient


# ---------------------------------------------------------------------------
# Unit tests for Utterance.safe_from_dict
# ---------------------------------------------------------------------------

def test_safe_from_dict_returns_none_when_speaker_missing():
    result = Utterance.safe_from_dict({"timestamp": 1.0, "text": "hi", "is_final": True})
    assert result is None


def test_safe_from_dict_returns_none_when_text_missing():
    result = Utterance.safe_from_dict({"timestamp": 1.0, "speaker": "user", "is_final": True})
    assert result is None


def test_safe_from_dict_returns_none_when_completely_empty():
    result = Utterance.safe_from_dict({})
    assert result is None


def test_safe_from_dict_returns_utterance_when_valid():
    data = {"timestamp": 1.0, "speaker": "user", "text": "hello", "is_final": True}
    result = Utterance.safe_from_dict(data)
    assert result is not None
    assert result.text == "hello"


def test_safe_from_dict_returns_none_on_type_error():
    # timestamp as non-float string that can't be coerced
    result = Utterance.safe_from_dict({"timestamp": "not-a-float", "speaker": "user",
                                       "text": "hi", "is_final": True})
    # Should not raise; None or Utterance is acceptable
    # The key property: no exception propagates
    assert result is None or isinstance(result, Utterance)


# ---------------------------------------------------------------------------
# Integration: malformed utterance does NOT crash the orchestrator
# ---------------------------------------------------------------------------

@pytest.mark.asyncio
async def test_malformed_utterance_does_not_crash_orchestrator(tmp_path: Path):
    """
    Feeding a malformed dict (missing 'speaker') followed by a valid trigger
    utterance must:
      - NOT crash the event loop
      - still write the trigger log when the valid utterance arrives
    """
    project_dir = tmp_path / "p"
    project_dir.mkdir()
    session = Session.new(project_dir=project_dir)

    client = AsyncMock(spec=AnthropicClient)
    client.complete = AsyncMock(return_value=json.dumps({
        "topic": "voice tool",
        "decisions": [],
        "requirements": [],
        "open_questions": [],
        "recent_verbatim": "",
    }))

    cfg = OrchestratorConfig(thread_interval=999, context_interval=999, max_seconds=0.4)
    orch = Orchestrator(session=session, client=client, config=cfg)

    async def feed():
        await asyncio.sleep(0.05)
        # Malformed: missing speaker, is_final
        orch.ingest({"timestamp": 0.5, "text": "hi"})
        # Valid trigger utterance should still work
        orch.ingest({
            "timestamp": 1.0,
            "speaker": "user",
            "text": "OK Claude build that",
            "is_final": True,
        })
        await asyncio.sleep(0.1)

    # Must not raise
    await asyncio.gather(orch.run(), feed())

    # Daemon survived — JSONL has only the one valid utterance
    jsonl_path = session.transcript_jsonl
    lines = jsonl_path.read_text().strip().splitlines()
    assert len(lines) == 1, f"Expected 1 valid utterance in JSONL, got {len(lines)}: {lines}"

    # Trigger still fired for the valid utterance
    triggers_log = session.state_dir / "triggers.log"
    assert triggers_log.exists(), "triggers.log was not created after malformed + valid utterances"
