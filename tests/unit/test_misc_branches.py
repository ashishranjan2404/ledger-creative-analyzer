# tests/unit/test_misc_branches.py
"""Covers:
  persist.py:52,55  — __enter__ / __exit__ context-manager paths
  context.py:47    — early return when buffer is empty at run() time
  tiers/base.py    — _coerce_str_list with non-list input
"""
import os
import pytest
from pathlib import Path
from unittest.mock import AsyncMock

from spec_lesson.transcript.persist import TranscriptWriter
from spec_lesson.transcript.utterance import Utterance
from spec_lesson.tiers.base import _coerce_str_list, Distillation
from spec_lesson.tiers.context import ContextTier
from spec_lesson.transcript.buffer import RollingTranscript


# persist.py:52,55 — TranscriptWriter as context manager
def test_transcript_writer_context_manager(tmp_path: Path):
    """__enter__ returns self, __exit__ closes the file. Covers persist.py:52,55."""
    path = tmp_path / "session.jsonl"
    with TranscriptWriter(path) as writer:
        assert writer is not None
        writer.append(Utterance(1.0, "user", "hello", True))
    # After __exit__, the file handle is closed.
    assert path.exists()
    lines = path.read_text().splitlines()
    assert len(lines) == 1


# context.py:47 — early return when buffer has no utterances
@pytest.mark.asyncio
async def test_context_tier_returns_empty_distillation_when_buffer_empty():
    """ContextTier.run() must return the cached last distillation immediately
    when the buffer contains no utterances. Covers context.py:47."""
    buf = RollingTranscript()
    client = AsyncMock()
    tier = ContextTier(client=client, buffer=buf)
    # Buffer is empty — no LLM call should be made.
    out = await tier.run(now=0.0)
    client.complete.assert_not_called()
    assert out.topic == "(session just started)"


# tiers/base.py — _coerce_str_list rejects non-list inputs
def test_coerce_str_list_rejects_string():
    """A bare string must become [] not a list of chars. Covers base.py:39."""
    assert _coerce_str_list("hello") == []


def test_coerce_str_list_rejects_none():
    assert _coerce_str_list(None) == []


def test_coerce_str_list_rejects_int():
    assert _coerce_str_list(42) == []


def test_coerce_str_list_filters_non_strings_from_list():
    """Mixed list: only str items are kept. Covers base.py:40."""
    result = _coerce_str_list(["a", 1, None, "b", 3.14])
    assert result == ["a", "b"]


def test_distillation_from_json_with_non_list_decisions():
    """from_json must tolerate LLM output where 'decisions' is a bare string."""
    raw = '{"topic":"t","decisions":"just a string","requirements":[],"open_questions":[]}'
    d = Distillation.from_json(raw)
    assert d.decisions == []
    assert d.topic == "t"
