def test_polish_prompt_contains_section_headers():
    from spec_lesson.tiers.prompts import (
        POLISH_SYSTEM,
        POLISH_SECTION_DECISIONS,
        POLISH_SECTION_REQUIREMENTS,
        POLISH_SECTION_OPEN_QUESTIONS,
        POLISH_SECTION_ACTION_ITEMS,
        POLISH_SECTION_SUMMARY,
    )
    assert f"## {POLISH_SECTION_DECISIONS}" in POLISH_SYSTEM
    assert f"## {POLISH_SECTION_REQUIREMENTS}" in POLISH_SYSTEM
    assert f"## {POLISH_SECTION_OPEN_QUESTIONS}" in POLISH_SYSTEM
    assert f"## {POLISH_SECTION_ACTION_ITEMS}" in POLISH_SYSTEM
    assert f"## {POLISH_SECTION_SUMMARY}" in POLISH_SYSTEM


def test_collector_uses_prompt_constants(tmp_path):
    """Renaming a prompt constant must update the parser automatically."""
    from spec_lesson.tiers.prompts import POLISH_SECTION_DECISIONS
    from spec_lesson.rollup.collector import parse_session

    p = tmp_path / "session-contract.md"
    p.write_text(
        f"# Contract test\n\n"
        f"## {POLISH_SECTION_DECISIONS}\n"
        f"- shared constant decision\n"
    )
    note = parse_session(p)
    assert note is not None
    assert "shared constant decision" in note.decisions
