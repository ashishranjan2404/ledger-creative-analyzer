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
    state = tmp_path / ".spec-lesson"
    life = SessionLifecycle(state_dir=state, max_seconds=1.0)
    life.write_pid_file()
    assert life.pid_file.exists()
    assert int(life.pid_file.read_text().strip()) > 0
    life.clear_pid_file()
    assert not life.pid_file.exists()


def test_is_stopping_reflects_stop_event(tmp_path):
    from spec_lesson.lifecycle import SessionLifecycle
    life = SessionLifecycle(state_dir=tmp_path / "x", max_seconds=60.0)
    assert life.is_stopping is False
    life.request_stop()
    assert life.is_stopping is True
