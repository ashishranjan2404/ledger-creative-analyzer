# tests/unit/test_rollup_collector_branches.py
"""Covers rollup/collector.py:61 — the '- [x]' completed-checkbox path,
and the missing-frontmatter (no YAML ---) path."""
from pathlib import Path
from spec_lesson.rollup.collector import parse_session
from spec_lesson.tiers.prompts import POLISH_SECTION_ACTION_ITEMS, POLISH_SECTION_DECISIONS


def test_parse_session_handles_checked_checkbox(tmp_path: Path):
    """'- [x]' completed items must be parsed the same as '- [ ]' — only the
    marker is stripped, not the item. Covers collector.py:61."""
    body = (
        "# My session\n\n"
        f"## {POLISH_SECTION_ACTION_ITEMS}\n"
        "- [x] Deploy to prod\n"
        "- [ ] Write tests\n"
    )
    p = tmp_path / "session-x.md"
    p.write_text(body)
    note = parse_session(p)
    assert note is not None
    assert "Deploy to prod" in note.action_items
    assert "Write tests" in note.action_items


def test_parse_session_without_frontmatter_uses_stem_as_title(tmp_path: Path):
    """A session file with no --- frontmatter must still parse; title falls back
    to path.stem and date/topics are empty. Covers collector.py:75-87."""
    body = (
        "# My bare session\n\n"
        f"## {POLISH_SECTION_DECISIONS}\n"
        "- Use Postgres\n"
    )
    p = tmp_path / "session-bare.md"
    p.write_text(body)
    note = parse_session(p)
    assert note is not None
    assert note.title == "My bare session"
    assert note.date == ""
    assert note.topics == []
    assert "Use Postgres" in note.decisions
