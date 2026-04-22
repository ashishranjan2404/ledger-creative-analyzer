"""Session lifecycle: PID file locking, signal handling, and max-duration cap.

``SessionLifecycle`` owns the exclusive PID file (O_CREAT|O_EXCL), installs
SIGINT/SIGTERM handlers, and exposes ``run_until_done()`` which blocks until
either a stop signal arrives or the max-seconds wall-clock cap elapses, then
drains registered async shutdown hooks before returning.
"""
import asyncio
import logging
import os
import signal
from pathlib import Path
from typing import Awaitable, Callable

log = logging.getLogger(__name__)

# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

# SEC-3: first line of every PID file written by spec-lesson.  `stop` refuses
# to signal a PID file that does not carry this header, preventing accidental
# SIGTERM to a recycled PID that was written by a different tool.
PID_FILE_HEADER = "spec-lesson"


def _pid_is_alive(pid: int) -> bool:
    """Return True if *pid* refers to a running process on this machine."""
    try:
        os.kill(pid, 0)  # signal 0 = existence check, no actual signal sent
        return True
    except (ProcessLookupError, PermissionError):
        # ProcessLookupError → no such process
        # PermissionError on some OSes means process exists but we can't signal it
        return False

ShutdownHook = Callable[[], Awaitable[None]]


class SessionLifecycle:
    """Manage the process lifetime of a single spec-lesson session.

    On construction creates the ``.spec-lesson/`` state directory.  Call
    ``run_until_done()`` after starting the event loop; it writes the PID file,
    blocks until SIGINT/SIGTERM or the max-seconds cap, runs shutdown hooks, then
    removes the PID file.  Hooks registered via ``on_shutdown()`` are awaited in
    order and must not raise — exceptions are swallowed to guarantee cleanup.
    """

    def __init__(self, state_dir: Path, max_seconds: float):
        self.state_dir = Path(state_dir)
        self.state_dir.mkdir(parents=True, exist_ok=True)
        self.pid_file = self.state_dir / "daemon.pid"
        self.max_seconds = max_seconds
        self._stop_event = asyncio.Event()
        self._shutdown_hooks: list[ShutdownHook] = []

    def write_pid_file(self) -> None:
        """Write the current PID to *pid_file* using O_CREAT | O_EXCL so that
        two concurrent starts in the same state dir cannot silently overwrite
        each other (RES-8 / EDGE-2).

        SEC-3: the file is written with a ``spec-lesson`` header on line 1 and
        the PID on line 2.  ``stop`` reads the header before sending SIGTERM
        so it can refuse to signal a PID file not written by this tool.
        File mode is 0o600 (owner-readable only) to limit exposure on shared
        machines.

        Behaviour:
          • No existing PID file  → write and return.
          • Existing file with header + alive PID  → raise RuntimeError.
          • Existing file, stale or corrupt  → unlink and retry once.
        """
        pid_content = f"{PID_FILE_HEADER}\n{os.getpid()}\n"
        pid_bytes = pid_content.encode()

        def _write_exclusive(path: Path) -> None:
            fd = os.open(str(path), os.O_CREAT | os.O_EXCL | os.O_WRONLY, 0o600)
            try:
                os.write(fd, pid_bytes)
            finally:
                os.close(fd)

        try:
            _write_exclusive(self.pid_file)
        except FileExistsError:
            # Read the existing file and decide whether it is still alive.
            existing_pid: int | None = None
            try:
                lines = self.pid_file.read_text().splitlines()
                if lines and lines[0] == PID_FILE_HEADER and len(lines) >= 2:
                    existing_pid = int(lines[1])
            except (ValueError, OSError):
                existing_pid = None

            if existing_pid is not None and _pid_is_alive(existing_pid):
                raise RuntimeError(
                    f"spec-lesson is already running (pid {existing_pid}). "
                    f"Kill it or remove {self.pid_file} if it is stale."
                )

            # Stale or corrupt lock — remove and write our PID.
            try:
                self.pid_file.unlink()
            except FileNotFoundError:
                pass  # lost race; another process removed it first
            _write_exclusive(self.pid_file)

    def clear_pid_file(self) -> None:
        try:
            self.pid_file.unlink()
        except FileNotFoundError:
            pass
        except OSError as e:
            log.warning("could not clear pid file %s: %s", self.pid_file, e)

    def on_shutdown(self, hook: ShutdownHook) -> None:
        self._shutdown_hooks.append(hook)

    @property
    def is_stopping(self) -> bool:
        """True once request_stop() has been called or the max-seconds cap has elapsed."""
        return self._stop_event.is_set()

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
