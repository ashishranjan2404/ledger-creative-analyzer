"""Integration test: stdin as a regular file (not a pipe) via subprocess."""
import json
import os
import subprocess
import sys
from pathlib import Path


def test_start_reads_from_file_redirect(tmp_path: Path):
    """Test that spec-lesson start can read from a regular file redirect via stdin."""
    fixture = tmp_path / "fixture.jsonl"
    fixture.write_text(
        '{"timestamp": 1.0, "speaker": "u", "text": "first", "is_final": true}\n'
        '{"timestamp": 2.0, "speaker": "u", "text": "OK Claude build that", "is_final": true}\n'
    )
    env = {
        **os.environ,
        "SPEC_LESSON_FAKE_API": "1",
        "SPEC_LESSON_MAX_SECONDS": "1.5",
    }
    # Use subprocess with stdin=open(...) to get a REGULAR FILE handle, not a pipe.
    # This simulates shell-style < redirect: spec-lesson start --transcript-stdin < file.jsonl
    with open(fixture, "rb") as fh:
        result = subprocess.run(
            [sys.executable, "-m", "spec_lesson.cli", "start", "--transcript-stdin"],
            cwd=str(tmp_path),
            env=env,
            stdin=fh,  # regular file handle, not a pipe
            capture_output=True,
            text=True,
            timeout=20,
        )
    assert result.returncode == 0, f"stderr: {result.stderr}\nstdout: {result.stdout}"
    # CLAUDE.md should have been written
    claude_md = (tmp_path / "CLAUDE.md").read_text()
    assert "<!-- spec-lesson:start -->" in claude_md
    # Trigger should have fired
    assert (tmp_path / ".spec-lesson" / "triggers.log").exists()
