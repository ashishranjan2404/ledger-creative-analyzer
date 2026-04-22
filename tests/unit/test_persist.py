import json
import os
from pathlib import Path
from spec_lesson.transcript.utterance import Utterance
from spec_lesson.transcript.persist import TranscriptWriter

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
