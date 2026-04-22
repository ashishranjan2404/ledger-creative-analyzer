# tests/unit/test_cli_branches.py
"""Covers cli.py missed branches using Typer's CliRunner (no subprocess):
  status with stale PID (os.kill raises ProcessLookupError) — cli.py:232-233
  stop with corrupt header — cli.py:276-280
  _read_pid_file bad_header / corrupt paths — cli.py:204-208
"""
import os
import pytest
from pathlib import Path
from typer.testing import CliRunner

from spec_lesson.cli import app
from spec_lesson.lifecycle import PID_FILE_HEADER

runner = CliRunner()


def _write_pid_file(pid_file: Path, content: str) -> None:
    pid_file.parent.mkdir(parents=True, exist_ok=True)
    pid_file.write_text(content)


# cli.py:232-233 — status with stale PID (process not alive)
def test_status_shows_stale_pid_message(tmp_path: Path, monkeypatch):
    """status must report a stale PID and return 0 when the process is gone.
    Covers cli.py:232-233."""
    pid_file = tmp_path / ".spec-lesson" / "daemon.pid"
    _write_pid_file(pid_file, f"{PID_FILE_HEADER}\n99999999\n")
    # Monkeypatch os.kill to simulate dead process.
    monkeypatch.setattr(os, "kill", lambda pid, sig: (_ for _ in ()).throw(ProcessLookupError))
    monkeypatch.chdir(tmp_path)
    result = runner.invoke(app, ["status"])
    assert result.exit_code == 0
    assert "stale" in result.stdout.lower() or "gone" in result.stdout.lower()


# cli.py:224-228 — status with corrupt header (bad_header path)
def test_status_with_bad_header_warns_and_exits_0(tmp_path: Path, monkeypatch):
    """status must warn about unrecognized PID file and still exit 0.
    Covers cli.py:224-228."""
    pid_file = tmp_path / ".spec-lesson" / "daemon.pid"
    _write_pid_file(pid_file, "not-spec-lesson\n12345\n")
    monkeypatch.chdir(tmp_path)
    result = runner.invoke(app, ["status"])
    assert result.exit_code == 0
    assert "not written by spec-lesson" in result.stdout.lower() or "ignoring" in result.stdout.lower()


# cli.py:276-280 — stop with corrupt/foreign PID file (bad_header → exits 2)
def test_stop_refuses_to_signal_corrupt_pid_file(tmp_path: Path, monkeypatch):
    """stop must exit 2 and refuse to send SIGTERM when PID file header is wrong.
    Covers cli.py:276-280."""
    pid_file = tmp_path / ".spec-lesson" / "daemon.pid"
    _write_pid_file(pid_file, "some-other-tool\n12345\n")
    monkeypatch.chdir(tmp_path)
    result = runner.invoke(app, ["stop"])
    assert result.exit_code == 2
    assert "refusing" in result.stdout.lower() or "not written by spec-lesson" in result.stdout.lower()


# cli.py:199-208 — _read_pid_file: file exists, corrupt int (ValueError)
def test_read_pid_file_returns_corrupt_on_invalid_int(tmp_path: Path):
    """_read_pid_file must return (None, 'corrupt') when line 2 is not an int.
    Covers cli.py:204-208."""
    from spec_lesson.cli import _read_pid_file
    pid_file = tmp_path / "daemon.pid"
    _write_pid_file(pid_file, f"{PID_FILE_HEADER}\nnot-an-int\n")
    pid, err, _started = _read_pid_file(pid_file)
    assert pid is None
    assert err == "corrupt"


# cli.py:199-208 — _read_pid_file: empty file → bad_header
def test_read_pid_file_returns_bad_header_on_empty_file(tmp_path: Path):
    """_read_pid_file must return (None, 'bad_header', None) on empty file."""
    from spec_lesson.cli import _read_pid_file
    pid_file = tmp_path / "daemon.pid"
    _write_pid_file(pid_file, "")
    pid, err, _started = _read_pid_file(pid_file)
    assert pid is None
    assert err == "bad_header"


# UX-5 — status shows started_at and elapsed when pid file has line 3
def test_status_shows_started_at_and_elapsed(tmp_path: Path, monkeypatch):
    """UX-5: status must show started_at and elapsed when pid file contains ISO timestamp."""
    from datetime import datetime, timezone, timedelta
    pid_file = tmp_path / ".spec-lesson" / "daemon.pid"
    # Write a pid file with an ISO timestamp ~5 minutes ago
    started = datetime.now(timezone.utc) - timedelta(minutes=5)
    started_iso = started.isoformat(timespec="seconds")
    _write_pid_file(pid_file, f"{PID_FILE_HEADER}\n{os.getpid()}\n{started_iso}\n")
    monkeypatch.chdir(tmp_path)
    result = runner.invoke(app, ["status"])
    assert result.exit_code == 0
    out = result.stdout
    assert "running" in out.lower()
    assert "started" in out.lower()
    assert "elapsed" in out.lower()
    # elapsed should show minutes
    assert "m" in out  # e.g. "5m00s"


# UX-10 — status shows wrong-cwd hint when pid file not found
def test_status_shows_wrong_cwd_hint_when_not_running(tmp_path: Path, monkeypatch):
    """UX-10: status must show a cwd hint when PID file is not present."""
    monkeypatch.chdir(tmp_path)
    # No .spec-lesson dir created at all
    result = runner.invoke(app, ["status"])
    assert result.exit_code == 0
    # stdout has the "not running in <path>" message
    assert "not running" in result.stdout.lower()
    assert str(tmp_path) in result.stdout
    # hint goes to stderr (typer CliRunner captures it in result.output or mix)
    combined = result.output
    assert "hint" in combined.lower() or "cd" in combined.lower() or ".spec-lesson" in combined.lower()


# UX-10 — stop shows wrong-cwd hint when pid file not found
def test_stop_shows_wrong_cwd_hint_when_not_running(tmp_path: Path, monkeypatch):
    """UX-10: stop must show a cwd hint when PID file is not present."""
    monkeypatch.chdir(tmp_path)
    result = runner.invoke(app, ["stop"])
    assert result.exit_code == 1
    combined = result.output
    assert "not running" in combined.lower()
    assert "hint" in combined.lower() or "cd" in combined.lower() or ".spec-lesson" in combined.lower()


# cli.py — --version flag
def test_version_flag_prints_version():
    """--version must print 'spec-lesson 0.1.0' and exit 0."""
    from spec_lesson import __version__
    result = runner.invoke(app, ["--version"])
    assert result.exit_code == 0
    assert f"spec-lesson {__version__}" in result.output


# SEC-5 — startup warning about verbatim audio persistence
def test_start_emits_secrets_warning(tmp_path: Path, monkeypatch):
    """start must print a secrets-warning before recording begins.

    Uses --transcript-stdin so we don't need audio hardware; exits immediately
    via EOF on stdin.  The warning must be present in combined output.
    """
    monkeypatch.chdir(tmp_path)
    # Provide empty stdin (immediate EOF) so feed_stdin exits and orch.run() times out
    import os as _os
    env = {**_os.environ, "SPEC_LESSON_MAX_SECONDS": "0.05", "SPEC_LESSON_FAKE_API": "1"}
    result = runner.invoke(app, ["start", "--transcript-stdin"], env=env, input="")
    combined = result.output + (result.stdout or "")
    assert "verbatim" in combined.lower() or "secret" in combined.lower(), (
        f"SEC-5: expected secrets warning in start output, got: {combined!r}"
    )
