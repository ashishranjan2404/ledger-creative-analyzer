import json
import os
import sys
import subprocess
from pathlib import Path

def _run(args, cwd, env=None, input_text=None):
    return subprocess.run(
        [sys.executable, "-m", "spec_lesson.cli", *args],
        cwd=str(cwd),
        env={**os.environ, **(env or {})},
        input=input_text,
        capture_output=True,
        text=True,
        timeout=30,
    )

def test_status_reports_not_running(tmp_path: Path):
    (tmp_path / ".spec-lesson").mkdir()
    r = _run(["status"], cwd=tmp_path)
    assert r.returncode == 0
    assert "not running" in r.stdout.lower()

def test_start_with_stdin_transcript_updates_claude_md(tmp_path: Path):
    fixture_lines = [
        '{"timestamp": 1.0, "speaker": "user", "text": "we want a tool", "is_final": true}',
        '{"timestamp": 10.0, "speaker": "user", "text": "OK Claude build that", "is_final": true}',
    ]
    fixture = "\n".join(fixture_lines) + "\n"

    # Use fake-mode via env var so CLI skips real API and uses canned responses
    env = {"SPEC_LESSON_FAKE_API": "1", "SPEC_LESSON_MAX_SECONDS": "0.5"}
    r = _run(["start", "--transcript-stdin"], cwd=tmp_path, env=env, input_text=fixture)
    assert r.returncode == 0, f"stderr: {r.stderr}"

    claude_md = (tmp_path / "CLAUDE.md").read_text()
    assert "<!-- spec-lesson:start -->" in claude_md
