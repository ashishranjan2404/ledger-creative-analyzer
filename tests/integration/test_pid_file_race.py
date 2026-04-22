"""
Fix 8 (RES-8 / EDGE-2) — atomic PID file write

Scenarios tested:
  A. PID file contains a PID for a running process → RuntimeError raised.
  B. PID file contains a stale PID (no such process) → write succeeds.
  C. No existing PID file → write succeeds normally.
"""
import os
import pytest
from pathlib import Path

from spec_lesson.lifecycle import SessionLifecycle


def _life(state_dir: Path) -> SessionLifecycle:
    return SessionLifecycle(state_dir=state_dir, max_seconds=60.0)


# ---------------------------------------------------------------------------
# A. Existing PID file pointing to a live process → RuntimeError
# ---------------------------------------------------------------------------

def test_write_pid_file_raises_if_live_process_owns_lock(tmp_path: Path):
    """RES-8: a second start must not silently overwrite the first process's
    PID file when that process is still alive."""
    state = tmp_path / ".spec-lesson"
    life = _life(state)

    # Use the current process's PID as the "already running" process.
    live_pid = os.getpid()
    life.pid_file.write_text(str(live_pid))

    with pytest.raises(RuntimeError, match="already running"):
        life.write_pid_file()


# ---------------------------------------------------------------------------
# B. Existing PID file with a dead (stale) PID → write succeeds
# ---------------------------------------------------------------------------

def test_write_pid_file_replaces_stale_pid(tmp_path: Path):
    """RES-8: a stale lock (PID of a dead process) must be replaced, not
    cause an error."""
    state = tmp_path / ".spec-lesson"
    life = _life(state)

    # PID 99999999 is virtually guaranteed not to exist on any test machine.
    stale_pid = 99_999_999
    life.pid_file.write_text(str(stale_pid))

    # Must not raise.
    life.write_pid_file()

    # The PID file must now contain our own PID.
    written_pid = int(life.pid_file.read_text().strip())
    assert written_pid == os.getpid(), (
        f"Expected PID {os.getpid()}, got {written_pid}"
    )

    life.clear_pid_file()


# ---------------------------------------------------------------------------
# C. No existing PID file → first write succeeds
# ---------------------------------------------------------------------------

def test_write_pid_file_first_write(tmp_path: Path):
    """Baseline: first write succeeds and the file contains the current PID."""
    state = tmp_path / ".spec-lesson"
    life = _life(state)

    assert not life.pid_file.exists()
    life.write_pid_file()
    assert life.pid_file.exists()
    assert int(life.pid_file.read_text().strip()) == os.getpid()
    life.clear_pid_file()
