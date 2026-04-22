from pathlib import Path
from spec_lesson.writer.claude_md import ClaudeMdWriter

def test_creates_file_with_section_if_missing(tmp_path: Path):
    p = tmp_path / "CLAUDE.md"
    w = ClaudeMdWriter(p)
    w.write_managed_section("hello body")
    text = p.read_text()
    assert "<!-- spec-lesson:start -->" in text
    assert "hello body" in text
    assert "<!-- spec-lesson:end -->" in text

def test_rewrites_section_preserving_surrounding_content(tmp_path: Path):
    p = tmp_path / "CLAUDE.md"
    p.write_text(
        "# Project\n\nSome rules.\n\n<!-- spec-lesson:start -->\nOLD\n<!-- spec-lesson:end -->\n\nFooter.\n"
    )
    w = ClaudeMdWriter(p)
    w.write_managed_section("NEW DISTILLATION")
    text = p.read_text()
    assert "# Project" in text
    assert "Some rules." in text
    assert "Footer." in text
    assert "NEW DISTILLATION" in text
    assert "OLD" not in text

def test_appends_section_when_file_exists_but_no_markers(tmp_path: Path):
    p = tmp_path / "CLAUDE.md"
    p.write_text("# Project\n\nSome rules.\n")
    w = ClaudeMdWriter(p)
    w.write_managed_section("body")
    text = p.read_text()
    assert text.startswith("# Project")
    assert "<!-- spec-lesson:start -->" in text
    assert "body" in text

def test_atomic_rewrite_does_not_leave_tmp_files(tmp_path: Path):
    p = tmp_path / "CLAUDE.md"
    w = ClaudeMdWriter(p)
    w.write_managed_section("a")
    w.write_managed_section("b")
    w.write_managed_section("c")
    # No CLAUDE.md.tmp.* orphans should remain after successful atomic writes.
    tmp_files = list(tmp_path.glob("CLAUDE.md.tmp.*"))
    assert tmp_files == [], f"Unexpected tmp files left after write: {tmp_files}"


def test_body_containing_end_marker_does_not_corrupt(tmp_path: Path):
    """SEC-1: body that contains the literal end marker must not split the block."""
    p = tmp_path / "CLAUDE.md"
    w = ClaudeMdWriter(p)
    w.write_managed_section("part A\n<!-- spec-lesson:end -->\npart B")
    w.write_managed_section("fresh content")
    text = p.read_text()
    assert text.count("<!-- spec-lesson:start -->") == 1
    assert text.count("<!-- spec-lesson:end -->") == 1
    assert "fresh content" in text


def test_body_containing_start_marker_does_not_nest(tmp_path: Path):
    """SEC-1: body containing the start marker must not create a nested block."""
    p = tmp_path / "CLAUDE.md"
    w = ClaudeMdWriter(p)
    w.write_managed_section("see <!-- spec-lesson:start --> here")
    text = p.read_text()
    assert text.count("<!-- spec-lesson:start -->") == 1


def test_gitignore_covers_claude_md_tmp_pattern():
    """SHUTDOWN-3: .gitignore must contain CLAUDE.md.tmp.* so SIGKILL orphans
    don't show up in git status."""
    from pathlib import Path
    gitignore = Path(__file__).parents[2] / ".gitignore"
    assert gitignore.exists(), ".gitignore not found at repo root"
    content = gitignore.read_text(encoding="utf-8")
    assert "CLAUDE.md.tmp.*" in content, (
        ".gitignore is missing CLAUDE.md.tmp.* — orphan tmp files will appear in git status after SIGKILL"
    )
