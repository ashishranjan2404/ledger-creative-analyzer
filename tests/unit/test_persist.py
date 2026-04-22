import json
import os
from pathlib import Path
import pytest
from spec_lesson.transcript.utterance import Utterance
from spec_lesson.transcript.persist import TranscriptWriter


def test_writer_marks_degraded_on_oserror(tmp_path, monkeypatch):
    path = tmp_path / "session.jsonl"
    writer = TranscriptWriter(path)
    u = Utterance(1.0, "u", "x", True)
    # monkeypatch os.fsync to raise
    monkeypatch.setattr(os, "fsync", lambda fd: (_ for _ in ()).throw(OSError("disk full")))
    writer.append(u)  # should NOT raise
    assert writer.degraded is True
    assert "disk full" in writer.degradation_reason


def test_writer_degraded_only_logs_once(tmp_path, monkeypatch):
    """Second OSError should not re-log — _degraded already True."""
    path = tmp_path / "session.jsonl"
    writer = TranscriptWriter(path)
    u = Utterance(1.0, "u", "x", True)
    monkeypatch.setattr(os, "fsync", lambda fd: (_ for _ in ()).throw(OSError("no space")))
    writer.append(u)
    writer.append(u)  # second call; still degraded, no raise
    assert writer.degraded is True


def test_writer_not_degraded_on_success(tmp_path):
    path = tmp_path / "session.jsonl"
    writer = TranscriptWriter(path)
    u = Utterance(1.0, "u", "hello", True)
    writer.append(u)
    assert writer.degraded is False
    writer.close()


def test_writer_appends_and_fsyncs(tmp_path: Path):
    path = tmp_path / "session.jsonl"
    writer = TranscriptWriter(path)
    u1 = Utterance(1.0, "user", "hello", True)
    u2 = Utterance(2.0, "user", "world", True)
    writer.append(u1)
    writer.append(u2)
    writer.close()
    lines = path.read_text().splitlines()
    assert len(lines) == 2
    assert json.loads(lines[0]) == u1.to_dict()
    assert json.loads(lines[1]) == u2.to_dict()

def test_writer_creates_parent_dirs(tmp_path: Path):
    path = tmp_path / "nested" / "dir" / "session.jsonl"
    writer = TranscriptWriter(path)
    writer.append(Utterance(1.0, "user", "x", True))
    writer.close()
    assert path.exists()
