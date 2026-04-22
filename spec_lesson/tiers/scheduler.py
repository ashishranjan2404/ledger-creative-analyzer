import asyncio
import logging
from typing import Awaitable, Callable

log = logging.getLogger(__name__)


class PeriodicRunner:
    def __init__(self, name: str, interval_seconds: float, callback: Callable[[], Awaitable[None]]):
        self.name = name
        self.interval = interval_seconds
        self._cb = callback
        self._stop = asyncio.Event()
        self._trigger = asyncio.Event()

    def stop(self) -> None:
        self._stop.set()
        self._trigger.set()

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
