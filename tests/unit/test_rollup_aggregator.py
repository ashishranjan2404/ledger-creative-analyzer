from datetime import datetime, timezone, timedelta
from pathlib import Path
from spec_lesson.rollup.aggregator import render_rollup
from spec_lesson.rollup.collector import SessionNote


def _note(title, decisions=None, requirements=None, topics=None):
    return SessionNote(
        path=Path("/tmp/fake.md"),
        date="2026-04-22",
        title=title,
        topics=topics or [],
        decisions=decisions or [],
        requirements=requirements or [],
    )


def test_rollup_merges_decisions_with_attribution():
    notes = [
        _note("Session 1", decisions=["1.5h cap", "Deepgram"]),
        _note("Session 2", decisions=["1.5h Cap", "Tkinter HUD"]),  # case duplicate
    ]
    md = render_rollup(notes, window_label="last 24h")
    assert "last 24h" in md
    assert "1.5h cap" in md.lower()
    # merged once, not twice
    assert md.lower().count("1.5h cap") == 1
    assert "Deepgram" in md
    assert "Tkinter HUD" in md
    # session attribution present
    assert "Session 1" in md
    assert "Session 2" in md


def test_rollup_shows_top_topics():
    notes = [
        _note("A", topics=["adhd", "voice", "python"]),
        _note("B", topics=["adhd", "tkinter"]),
        _note("C", topics=["voice"]),
    ]
    md = render_rollup(notes, window_label="24h")
    # adhd and voice each appear twice; should be listed
    assert "adhd" in md
    assert "voice" in md


def test_rollup_empty_notes():
    md = render_rollup([], window_label="24h")
    assert "No sessions" in md
