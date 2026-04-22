import asyncio
import pytest
from spec_lesson.tiers.scheduler import PeriodicRunner

@pytest.mark.asyncio
async def test_runs_callback_on_interval_until_stopped():
    calls = []
    async def cb():
        calls.append(True)

    runner = PeriodicRunner(name="test", interval_seconds=0.05, callback=cb)
    task = asyncio.create_task(runner.run())
    await asyncio.sleep(0.17)  # should fire ~3 times
    runner.stop()
    await task
    assert 2 <= len(calls) <= 10, f"expected 2-10 calls in 0.17s at 0.05s interval, got {len(calls)}"

@pytest.mark.asyncio
async def test_trigger_now_forces_immediate_run():
    calls = []
    async def cb():
        calls.append(True)

    runner = PeriodicRunner(name="test", interval_seconds=10.0, callback=cb)
    task = asyncio.create_task(runner.run())
    await asyncio.sleep(0.02)
    await runner.trigger_now()
    await asyncio.sleep(0.05)
    runner.stop()
    await task
    assert len(calls) >= 1

@pytest.mark.asyncio
async def test_callback_errors_do_not_stop_runner():
    calls = []
    async def cb():
        calls.append(True)
        if len(calls) == 1:
            raise RuntimeError("boom")

    runner = PeriodicRunner(name="test", interval_seconds=0.03, callback=cb)
    task = asyncio.create_task(runner.run())
    await asyncio.sleep(0.12)
    runner.stop()
    await task
    assert len(calls) >= 2
