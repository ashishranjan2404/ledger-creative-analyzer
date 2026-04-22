import asyncio
import os
import signal
from pathlib import Path
from typing import Awaitable, Callable

ShutdownHook = Callable[[], Awaitable[None]]


class SessionLifecycle:
    def __init__(self, state_dir: Path, max_seconds: float):
        self.state_dir = Path(state_dir)
        self.state_dir.mkdir(parents=True, exist_ok=True)
        self.pid_file = self.state_dir / "daemon.pid"
        self.max_seconds = max_seconds
        self._stop_event = asyncio.Event()
        self._shutdown_hooks: list[ShutdownHook] = []

    def write_pid_file(self) -> None:
        self.pid_file.write_text(str(os.getpid()))

    def clear_pid_file(self) -> None:
        try:
            self.pid_file.unlink()
        except FileNotFoundError:
            pass

    def on_shutdown(self, hook: ShutdownHook) -> None:
        self._shutdown_hooks.append(hook)

    def request_stop(self) -> None:
        self._stop_event.set()

    def install_signal_handlers(self) -> None:
        loop = asyncio.get_running_loop()
        for sig in (signal.SIGINT, signal.SIGTERM):
            try:
                loop.add_signal_handler(sig, self.request_stop)
            except NotImplementedError:
                # windows / restricted env
                pass

    async def run_until_done(self) -> None:
        self.write_pid_file()
        try:
            try:
                await asyncio.wait_for(self._stop_event.wait(), timeout=self.max_seconds)
            except asyncio.TimeoutError:
                pass  # hard cap hit
            for hook in self._shutdown_hooks:
                try:
                    await hook()
                except Exception:
                    # hooks must not prevent shutdown
                    pass
        finally:
            self.clear_pid_file()
