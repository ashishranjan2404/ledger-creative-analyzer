import copy
import threading
from .state import HudState, TierEvent

class HudObserver:
    def __init__(self, max_seconds: float = 5400.0):
        self._state = HudState.initial(max_seconds=max_seconds)
        self._lock = threading.Lock()

    def _append(self, event: TierEvent) -> None:
        self._state.append_event(event)

    def on_context(self, at: float, topic: str, decisions_count: int) -> None:
        with self._lock:
            self._state.topic = topic
            self._append(TierEvent(at=at, kind="context", summary=f"context refreshed · {decisions_count} decisions"))

    def on_thread(self, at: float, drift: str, current_topic: str, drift_from: str) -> None:
        with self._lock:
            self._state.set_drift(drift, current_topic, drift_from)  # type: ignore[arg-type]
            summary = f"drift: {drift}" + (f" (was: {drift_from})" if drift == "drifting" else "")
            self._append(TierEvent(at=at, kind="thread", summary=summary))

    def on_immediate(self, at: float, candidates: list[str]) -> None:
        with self._lock:
            self._state.set_suggestions(candidates)
            self._append(TierEvent(at=at, kind="immediate", summary=f"{len(candidates)} suggestions"))

    def on_trigger(self, at: float, phrase: str) -> None:
        with self._lock:
            self._state.trigger_fired_at = at
            self._append(TierEvent(at=at, kind="trigger", summary=f"trigger: {phrase}"))

    def on_polish(self, at: float) -> None:
        with self._lock:
            self._append(TierEvent(at=at, kind="polish", summary="session polished"))

    def tick(self, elapsed: float) -> None:
        with self._lock:
            self._state.elapsed_seconds = elapsed

    def snapshot(self) -> HudState:
        with self._lock:
            return copy.deepcopy(self._state)
