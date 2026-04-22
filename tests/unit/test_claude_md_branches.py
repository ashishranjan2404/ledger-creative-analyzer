# tests/unit/test_claude_md_branches.py
"""Covers writer/claude_md.py:66-71 (_atomic_write exception cleanup path)
and the 'file exists without trailing newline' separator branch at line 38."""
import os
import tempfile
import pytest
from pathlib import Path
from unittest.mock import patch

from spec_lesson.writer.claude_md import ClaudeMdWriter, START_MARKER, END_MARKER


# claude_md.py:38 — file exists and does NOT end with newline
def test_write_managed_section_adds_separator_when_file_has_no_trailing_newline(tmp_path: Path):
    """When an existing CLAUDE.md lacks a trailing newline, one is inserted before
    the spec-lesson block. Covers claude_md.py:38."""
    claude = tmp_path / "CLAUDE.md"
    # Write a file with no trailing newline.
    claude.write_text("# My Project", encoding="utf-8")
    writer = ClaudeMdWriter(claude)
    writer.write_managed_section("## Topic: x\n")
    content = claude.read_text(encoding="utf-8")
    assert START_MARKER in content
    assert content.index("# My Project") < content.index(START_MARKER)
    # There must be a blank line before the marker (the separator was added).
    before_marker = content[: content.index(START_MARKER)]
    assert before_marker.endswith("\n\n") or before_marker.endswith("\n"), (
        "Expected a newline separator before START_MARKER"
    )


# claude_md.py:66-71 — _atomic_write cleans up temp file on exception
def test_atomic_write_cleans_up_temp_file_on_write_failure(tmp_path: Path):
    """If the write to the temp file raises, the temp file must be unlinked and
    the exception re-raised. Covers claude_md.py:66-71."""
    claude = tmp_path / "CLAUDE.md"
    writer = ClaudeMdWriter(claude)

    with patch("os.replace", side_effect=OSError("mock replace failed")):
        with pytest.raises(OSError, match="mock replace failed"):
            writer._atomic_write("some content")

    # No orphaned temp files should remain in tmp_path.
    leftovers = list(tmp_path.glob("CLAUDE.md.tmp.*"))
    assert leftovers == [], f"Temp file not cleaned up: {leftovers}"
