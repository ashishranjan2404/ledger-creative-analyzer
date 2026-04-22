"""
SEC-3 — PID file header validation tests.

Verifies that `spec-lesson stop` refuses to signal a PID file that was not
written by spec-lesson (missing or incorrect header line).
"""
import os
import sys
import subprocess
from pathlib import Path


def _run(args, cwd):
    return subprocess.run(
        [sys.executable, "-m", "spec_lesson.cli", *args],
        cwd=str(cwd),
        env={**os.environ},
        capture_output=True,
        text=True,
        timeout=10,
    )


def test_stop_refuses_pid_file_without_header(tmp_path: Path):
    """SEC-3: a PID file missing the header line must be rejected by stop."""
    state = tmp_path / ".spec-lesson"
    state.mkdir()
    # Write a bare PID file (the old pre-SEC-3 format) — no header.
    (state / "daemon.pid").write_text(f"{os.getpid()}\n")

    r = _run(["stop"], cwd=tmp_path)
    assert r.returncode != 0, "stop must exit non-zero when header is missing"
    output = (r.stdout + r.stderr).lower()
    assert "refusing" in output, (
        f"Expected 'refusing' in output but got: stdout={r.stdout!r} stderr={r.stderr!r}"
    )


def test_stop_refuses_pid_file_with_wrong_header(tmp_path: Path):
    """SEC-3: a PID file with an unexpected first line must be rejected."""
    state = tmp_path / ".spec-lesson"
    state.mkdir()
    (state / "daemon.pid").write_text(f"not-spec-lesson\n{os.getpid()}\n")

    r = _run(["stop"], cwd=tmp_path)
    assert r.returncode != 0
    output = (r.stdout + r.stderr).lower()
    assert "refusing" in output


def test_stop_not_running_when_no_pid_file(tmp_path: Path):
    """stop must exit 1 with a friendly message when there is no PID file."""
    r = _run(["stop"], cwd=tmp_path)
    assert r.returncode == 1
    assert "not running" in (r.stdout + r.stderr).lower()


def test_status_ignores_pid_file_without_header(tmp_path: Path):
    """SEC-3: status must not report a process as running from a headerless PID file."""
    state = tmp_path / ".spec-lesson"
    state.mkdir()
    (state / "daemon.pid").write_text(f"{os.getpid()}\n")

    r = _run(["status"], cwd=tmp_path)
    output = (r.stdout + r.stderr).lower()
    # Must not say "running" — should say "ignoring" or similar warning
    assert "running" not in output or "ignoring" in output
