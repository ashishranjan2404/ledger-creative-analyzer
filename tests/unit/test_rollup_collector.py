from pathlib import Path
from spec_lesson.rollup.collector import SessionNote, find_session_files, parse_session


def test_find_session_files_recurses(tmp_path: Path):
    for p in [
        tmp_path / "a/.spec-lesson/session-1.md",
        tmp_path / "b/.spec-lesson/session-2.md",
        tmp_path / "c/.spec-lesson/ignore-me.md",
    ]:
        p.parent.mkdir(parents=True, exist_ok=True)
        p.write_text("body")
    files = find_session_files(tmp_path)
    assert len(files) == 2  # only session-*.md
    paths = sorted(str(f) for f in files)
    assert paths[0].endswith("session-1.md")
    assert paths[1].endswith("session-2.md")


def test_parse_session_extracts_sections(tmp_path: Path):
    body = """---
date: 2026-04-22
session: spec-lesson
topics: [adhd, voice]
---

# ADHD voice assistant

## Summary
We designed a live meeting assistant.

## Decisions
- 1.5h hard cap
- Deepgram for ASR

## Requirements
- macOS first

## Open questions
- Should we ship HUD in v1?

## Action items
- [ ] Ship plan 1
"""
    p = tmp_path / "session-x.md"
    p.write_text(body)
    note = parse_session(p)
    assert note.date == "2026-04-22"
    assert note.topics == ["adhd", "voice"]
    assert note.title == "ADHD voice assistant"
    assert "1.5h hard cap" in note.decisions
    assert "Deepgram for ASR" in note.decisions
    assert "macOS first" in note.requirements
    assert "Should we ship HUD in v1?" in note.open_questions
    assert "Ship plan 1" in note.action_items
    assert note.path == p
