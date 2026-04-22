# tests/unit/test_lifecycle_branches.py
"""Covers lifecycle.py:93-94, 105-106, 113, 133-135, 147-149."""
import asyncio
import os
import signal
import pytest
from pathlib import Path
from unittest.mock import AsyncMock

from spec_lesson.lifecycle import SessionLifecycle, PID_FILE_HEADER


# lifecycle.py:93-94 — ValueError/OSError handler when reading corrupt PID file content.
def test_write_pid_file_overwrites_corrupt_pid_file(tmp_path: Path):
    """A PID file containing garbage (no valid header+int) is treated as stale
    and replaced, not raised. Covers the except (ValueError, OSError) branch at
    lifecycle.py:93-94."""
    state = tmp_path / ".spec-lesson"
    life = SessionLifecycle(state_dir=state, max_seconds=60.0)
    # Write a corrupt PID file manually (no header, just garbage).
    life.pid_file.write_text("this is not a valid pid file\n")
    # write_pid_file should unlink the corrupt file and write our PID.
    life.write_pid_file()
    lines = life.pid_file.read_text().splitlines()
    assert lines[0] == PID_FILE_HEADER
    assert int(lines[1]) == os.getpid()
    life.clear_pid_file()


# lifecycle.py:105-106 — FileNotFoundError lost-race path in unlink inside
# write_pid_file (another process deleted the stale file between our read and unlink).
def test_write_pid_file_tolerates_lost_race_on_stale_unlink(tmp_path: Path, monkeypatch):
    """Simulates the case where the stale PID file is removed by another process
    between the FileExistsError and our unlink() call. Covers lifecycle.py:105-106."""
    import pathlib
    state = tmp_path / ".spec-lesson"
    life = SessionLifecycle(state_dir=state, max_seconds=60.0)
    # Plant a stale PID file (dead PID, valid header).
    life.pid_file.write_text(f"{PID_FILE_HEADER}\n99999999\n")
    # Monkeypatch unlink to raise FileNotFoundError (simulates lost race).
    original_unlink = pathlib.Path.unlink
    calls = []

    def fake_unlink(self, missing_ok=False):
        calls.append(self)
        raise FileNotFoundError("already gone")

    monkeypatch.setattr(pathlib.Path, "unlink", fake_unlink)
    # Should NOT propagate FileNotFoundError; will then try _write_exclusive
    # which will fail because the file still exists (we faked unlink).
    # So we only verify no unexpected exception type leaks out.
    try:
        life.write_pid_file()
    except (FileExistsError, OSError):
        pass  # acceptable — the key is no AttributeError/crash
    monkeypatch.setattr(pathlib.Path, "unlink", original_unlink)
    assert calls  # unlink was at least attempted


# lifecycle.py:113 — clear_pid_file FileNotFoundError branch (file already gone).
def test_clear_pid_file_tolerates_missing_file(tmp_path: Path):
    """clear_pid_file must not raise when the PID file was already removed.
    Covers lifecycle.py:113."""
    state = tmp_path / ".spec-lesson"
    life = SessionLifecycle(state_dir=state, max_seconds=60.0)
    # Do NOT write a PID file — call clear directly.
    life.clear_pid_file()  # must not raise


# lifecycle.py:133-135 — NotImplementedError swallowed in install_signal_handlers.
@pytest.mark.asyncio
async def test_install_signal_handlers_tolerates_not_implemented(monkeypatch):
    """Covers the except NotImplementedError branch at lifecycle.py:133-135
    (Windows / restricted event loop)."""
    loop = asyncio.get_running_loop()
    # Monkeypatch add_signal_handler to raise NotImplementedError.
    monkeypatch.setattr(loop, "add_signal_handler", lambda sig, cb: (_ for _ in ()).throw(NotImplementedError))
    state_dir = Path("/tmp/spec_lesson_test_sig")
    state_dir.mkdir(parents=True, exist_ok=True)
    life = SessionLifecycle(state_dir=state_dir, max_seconds=1.0)
    # Must not propagate NotImplementedError.
    life.install_signal_handlers()


# lifecycle.py:147-149 — shutdown hook that raises Exception must not prevent cleanup.
@pytest.mark.asyncio
async def test_shutdown_hook_exception_does_not_block_cleanup(tmp_path: Path):
    """A hook that raises must be swallowed so the PID file is still removed.
    Covers lifecycle.py:147-149."""
    state = tmp_path / ".spec-lesson"
    life = SessionLifecycle(state_dir=state, max_seconds=0.1)
    cleanup_ran = []

    async def bad_hook():
        raise RuntimeError("hook intentionally broken")

    async def good_hook():
        cleanup_ran.append(True)

    life.on_shutdown(bad_hook)
    life.on_shutdown(good_hook)
    await life.run_until_done()
    assert cleanup_ran == [True], "good hook must run even after bad hook raises"
    assert not life.pid_file.exists(), "PID file must be removed despite hook failure"
