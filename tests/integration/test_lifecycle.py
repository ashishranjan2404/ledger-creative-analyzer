import asyncio
import pytest
from pathlib import Path
from spec_lesson.lifecycle import SessionLifecycle

@pytest.mark.asyncio
async def test_hard_cap_triggers_shutdown(tmp_path: Path):
    state = tmp_path / ".spec-lesson"
    life = SessionLifecycle(state_dir=state, max_seconds=0.2)
    shutdown_called = []

    async def on_shutdown():
        shutdown_called.append(True)

    life.on_shutdown(on_shutdown)
    await life.run_until_done()
    assert shutdown_called == [True]
    assert not life.pid_file.exists()  # cleaned up

@pytest.mark.asyncio
async def test_stop_triggers_shutdown_before_cap(tmp_path: Path):
    state = tmp_path / ".spec-lesson"
    life = SessionLifecycle(state_dir=state, max_seconds=60.0)
    shutdown_called = []

    async def on_shutdown():
        shutdown_called.append(True)

    life.on_shutdown(on_shutdown)

    async def stopper():
        await asyncio.sleep(0.1)
        life.request_stop()

    await asyncio.gather(life.run_until_done(), stopper())
    assert shutdown_called == [True]

def test_pid_file_written_and_parseable(tmp_path: Path):
    from spec_lesson.lifecycle import PID_FILE_HEADER
    state = tmp_path / ".spec-lesson"
    life = SessionLifecycle(state_dir=state, max_seconds=1.0)
    life.write_pid_file()
    assert life.pid_file.exists()
    # SEC-3: PID file now has a two-line format: header + PID
    lines = life.pid_file.read_text().splitlines()
    assert lines[0] == PID_FILE_HEADER, f"Expected header line, got: {lines[0]!r}"
    assert int(lines[1]) > 0
    life.clear_pid_file()
    assert not life.pid_file.exists()


def test_is_stopping_reflects_stop_event(tmp_path):
    from spec_lesson.lifecycle import SessionLifecycle
    life = SessionLifecycle(state_dir=tmp_path / "x", max_seconds=60.0)
    assert life.is_stopping is False
    life.request_stop()
    assert life.is_stopping is True


def test_clear_pid_file_tolerates_readonly(tmp_path, monkeypatch):
    import pathlib
    from spec_lesson.lifecycle import SessionLifecycle
    life = SessionLifecycle(state_dir=tmp_path / "x", max_seconds=60.0)
    life.write_pid_file()
    # monkeypatch unlink to raise PermissionError
    original_unlink = pathlib.Path.unlink

    def boom(self, missing_ok=False):
        raise PermissionError("read-only fs")

    monkeypatch.setattr(pathlib.Path, "unlink", boom)
    # should NOT raise
    life.clear_pid_file()
    # restore so tmp_path cleanup works
    monkeypatch.setattr(pathlib.Path, "unlink", original_unlink)
