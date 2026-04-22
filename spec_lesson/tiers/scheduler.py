"""Periodic task runner with immediate-trigger support.

``PeriodicRunner`` executes a callback once on entry, then waits up to
``interval_seconds`` before running again — but it can be woken early via
``trigger_now()`` (e.g. when a wake-word fires).  Stopping via ``stop()``
unblocks any in-progress wait immediately.
"""
import asyncio
import logging
from typing import Awaitable, Callable

log = logging.getLogger(__name__)


class PeriodicRunner:
    """Run an async callback periodically, with early-trigger and stop support.

    On each loop iteration the callback fires first, then the runner waits for
    the earliest of: (a) interval elapsed, (b) ``stop()`` called, (c)
    ``trigger_now()`` called.  This means the callback always runs once
    immediately when ``run()`` is first awaited — callers should account for
    this if a cold-start delay is needed.
    """

    def __init__(self, name: str, interval_seconds: float, callback: Callable[[], Awaitable[None]]):
        self.name = name
        self.interval = interval_seconds
        self._cb = callback
        self._stop = asyncio.Event()
        self._trigger = asyncio.Event()

    def stop(self) -> None:
        self._stop.set()
        self._trigger.set()  # why: unblocks asyncio.wait() immediately so the
        # run() loop exits without waiting up to interval_seconds for the sleep
        # task to expire.

    async def trigger_now(self) -> None:
        self._trigger.set()

    async def run(self) -> None:
        while not self._stop.is_set():
            try:
                await self._cb()
            except Exception as e:
                log.warning("tier %s callback failed: %s", self.name, e)
            # wait up to interval, or until triggered/stopped
            waiters = [
                asyncio.create_task(asyncio.sleep(self.interval)),
                asyncio.create_task(self._stop.wait()),
                asyncio.create_task(self._trigger.wait()),
            ]
            done, pending = await asyncio.wait(waiters, return_when=asyncio.FIRST_COMPLETED)
            for t in pending:
                t.cancel()
            self._trigger.clear()
