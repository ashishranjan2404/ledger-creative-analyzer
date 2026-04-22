# spec-lesson Plan 3 — Floating HUD

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development. Checkbox steps.

**Goal:** A floating, always-on-top translucent HUD window (top-right, ~320×220) that displays current topic, drift badge, last 3 response suggestions, scrolling timeline of tier events, and a 1.5h countdown. Reads state from the running Orchestrator via a thread-safe observer interface.

**Architecture:** View-model / view separation. The `HudState` dataclass is pure Python (testable). A `HudObserver` attached to the Orchestrator updates `HudState` on tier events. The `HudRenderer` Protocol has two implementations: (1) `TkinterHudRenderer` — built-in, runs everywhere; (2) `StdoutHudRenderer` — CI-friendly, dumps state transitions to stdout for integration tests.

**Why Tkinter, not PyObjC:** Tkinter ships with Python's stdlib (no extra deps), supports transparency and always-on-top on macOS, and is testable via CI headlessly by running with a dummy display. PyObjC path is deferred to v2.

**Tech Stack:** stdlib `tkinter` only (no new deps). Tests: existing pytest + `unittest.mock`.

---

## File Structure additions

```
spec_lesson/hud/
├── __init__.py
├── state.py                  # HudState dataclass + TierEvent log entries
├── observer.py               # HudObserver: wires Orchestrator tier events → HudState
├── renderer.py               # HudRenderer Protocol + StdoutHudRenderer + TkinterHudRenderer
└── runner.py                 # HudRunner: owns the main thread render loop

spec_lesson/orchestrator.py   # MODIFY: emit observable events on tier completion
spec_lesson/cli.py            # MODIFY: --hud flag (off by default; opt-in)

tests/unit/
├── test_hud_state.py
├── test_hud_observer.py
└── test_hud_renderer_stdout.py

tests/integration/
└── test_hud_wiring.py
```

---

## Task 21: `HudState` dataclass + TierEvent log

**Files:** `spec_lesson/hud/__init__.py` (empty), `spec_lesson/hud/state.py`, `tests/unit/test_hud_state.py`

- [ ] **Step 1: Failing test**

```python
# tests/unit/test_hud_state.py
from spec_lesson.hud.state import HudState, TierEvent

def test_initial_state():
    s = HudState.initial(max_seconds=5400.0)
    assert s.topic == "(session just starting)"
    assert s.drift == "unknown"
    assert s.suggestions == []
    assert s.timeline == []
    assert s.max_seconds == 5400.0
    assert s.elapsed_seconds == 0.0
    assert s.remaining_seconds() == 5400.0

def test_append_event_caps_at_50():
    s = HudState.initial()
    for i in range(60):
        s.append_event(TierEvent(at=float(i), kind="thread", summary=f"e{i}"))
    assert len(s.timeline) == 50
    assert s.timeline[0].summary == "e10"  # oldest events dropped
    assert s.timeline[-1].summary == "e59"

def test_remaining_seconds_clamped_to_zero():
    s = HudState.initial(max_seconds=10.0)
    s.elapsed_seconds = 20.0
    assert s.remaining_seconds() == 0.0

def test_set_drift_on_topic():
    s = HudState.initial()
    s.set_drift("on", "API design", "API design")
    assert s.drift == "on"
    assert s.topic == "API design"
    assert s.drift_from == "API design"
```

- [ ] **Step 2: Run; FAIL on ModuleNotFoundError**

- [ ] **Step 3: Implementation**

```python
# spec_lesson/hud/__init__.py
```

```python
# spec_lesson/hud/state.py
from dataclasses import dataclass, field
from typing import Literal

DriftLabel = Literal["on", "drifting", "unknown"]
TimelineCap = 50

@dataclass
class TierEvent:
    at: float           # seconds since session start
    kind: str           # "thread" | "context" | "immediate" | "trigger" | "polish"
    summary: str        # 1-line text

@dataclass
class HudState:
    topic: str
    drift: DriftLabel
    drift_from: str
    suggestions: list[str]
    timeline: list[TierEvent]
    elapsed_seconds: float
    max_seconds: float
    trigger_fired_at: float | None = None

    @classmethod
    def initial(cls, max_seconds: float = 5400.0) -> "HudState":
        return cls(
            topic="(session just starting)",
            drift="unknown",
            drift_from="",
            suggestions=[],
            timeline=[],
            elapsed_seconds=0.0,
            max_seconds=max_seconds,
        )

    def append_event(self, event: TierEvent) -> None:
        self.timeline.append(event)
        if len(self.timeline) > TimelineCap:
            # keep most recent TimelineCap entries
            del self.timeline[: len(self.timeline) - TimelineCap]

    def set_drift(self, drift: DriftLabel, current_topic: str, drift_from: str) -> None:
        self.drift = drift
        if current_topic:
            self.topic = current_topic
        self.drift_from = drift_from

    def set_suggestions(self, cands: list[str]) -> None:
        self.suggestions = list(cands)[:3]

    def remaining_seconds(self) -> float:
        return max(0.0, self.max_seconds - self.elapsed_seconds)
```

- [ ] **Step 4: PASS (4 passed)**
- [ ] **Step 5:**
```bash
git add spec_lesson/hud/__init__.py spec_lesson/hud/state.py tests/unit/test_hud_state.py
git commit -m "feat(spec-lesson): HudState view-model + TierEvent"
```

---

## Task 22: `HudObserver` (wires Orchestrator → HudState)

**Files:** `spec_lesson/hud/observer.py`, `tests/unit/test_hud_observer.py`

Design: `HudObserver` has an internal `HudState` and callback methods (`on_context`, `on_thread`, `on_immediate`, `on_trigger`, `on_polish`, `tick`). Each fires from whatever thread the orchestrator calls from — we guard with a `threading.Lock`. `snapshot()` returns a deepcopy for the renderer thread.

- [ ] **Step 1: Test**

```python
# tests/unit/test_hud_observer.py
from spec_lesson.hud.observer import HudObserver
from spec_lesson.hud.state import TierEvent

def test_on_context_updates_topic():
    o = HudObserver(max_seconds=100.0)
    o.on_context(at=5.0, topic="API design", decisions_count=3)
    snap = o.snapshot()
    assert snap.topic == "API design"
    assert snap.timeline[-1].kind == "context"
    assert "3 decisions" in snap.timeline[-1].summary

def test_on_thread_sets_drift_and_appends_event():
    o = HudObserver(max_seconds=100.0)
    o.on_context(at=0.0, topic="API design", decisions_count=0)
    o.on_thread(at=10.0, drift="drifting", current_topic="dinner", drift_from="API design")
    snap = o.snapshot()
    assert snap.drift == "drifting"
    assert snap.drift_from == "API design"
    assert snap.topic == "dinner"  # current_topic wins
    assert any(e.kind == "thread" for e in snap.timeline)

def test_on_immediate_sets_suggestions():
    o = HudObserver(max_seconds=100.0)
    o.on_immediate(at=3.0, candidates=["a", "b", "c", "d"])
    snap = o.snapshot()
    assert snap.suggestions == ["a", "b", "c"]

def test_on_trigger_records_timestamp():
    o = HudObserver(max_seconds=100.0)
    o.on_trigger(at=42.0, phrase="OK Claude build that")
    snap = o.snapshot()
    assert snap.trigger_fired_at == 42.0
    assert any(e.kind == "trigger" for e in snap.timeline)

def test_tick_updates_elapsed():
    o = HudObserver(max_seconds=100.0)
    o.tick(elapsed=37.5)
    snap = o.snapshot()
    assert snap.elapsed_seconds == 37.5
    assert snap.remaining_seconds() == 62.5

def test_snapshot_is_independent_copy():
    o = HudObserver(max_seconds=100.0)
    o.on_context(at=1.0, topic="t", decisions_count=0)
    s1 = o.snapshot()
    o.on_context(at=2.0, topic="t2", decisions_count=0)
    assert s1.topic == "t"  # not mutated by subsequent calls
```

- [ ] **Step 2: FAIL**
- [ ] **Step 3: Implementation**

```python
# spec_lesson/hud/observer.py
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
```

- [ ] **Step 4: PASS**
- [ ] **Step 5:**
```bash
git add spec_lesson/hud/observer.py tests/unit/test_hud_observer.py
git commit -m "feat(spec-lesson): HudObserver with thread-safe snapshot"
```

---

## Task 23: `StdoutHudRenderer` (headless-testable HUD)

**Files:** `spec_lesson/hud/renderer.py`, `tests/unit/test_hud_renderer_stdout.py`

Renderer Protocol: `def render(self, state: HudState) -> None`. `StdoutHudRenderer` formats state as a single line and writes to stdout. Used by CI and by `--hud=stdout` CLI option for debugging without a display.

- [ ] **Step 1: Test**

```python
# tests/unit/test_hud_renderer_stdout.py
from io import StringIO
from spec_lesson.hud.renderer import StdoutHudRenderer
from spec_lesson.hud.state import HudState, TierEvent

def test_renders_state_line():
    buf = StringIO()
    r = StdoutHudRenderer(stream=buf)
    s = HudState.initial(max_seconds=100.0)
    s.topic = "API design"
    s.drift = "on"
    s.elapsed_seconds = 30.0
    s.suggestions = ["a", "b", "c"]
    r.render(s)
    out = buf.getvalue()
    assert "API design" in out
    assert "70.0s left" in out or "01:10 left" in out
    assert "🟢" in out or "on" in out

def test_drift_shows_amber():
    buf = StringIO()
    r = StdoutHudRenderer(stream=buf)
    s = HudState.initial(max_seconds=100.0)
    s.drift = "drifting"
    s.drift_from = "API design"
    s.topic = "dinner plans"
    r.render(s)
    out = buf.getvalue()
    assert "🟡" in out or "drifting" in out
    assert "API design" in out
```

- [ ] **Step 2-5 similar.** Implementation (single file covers both renderers):

```python
# spec_lesson/hud/renderer.py
import sys
from typing import Protocol, TextIO
from .state import HudState

class HudRenderer(Protocol):
    def render(self, state: HudState) -> None: ...
    def close(self) -> None: ...


def _fmt_time(seconds: float) -> str:
    s = int(max(0.0, seconds))
    return f"{s // 60:02d}:{s % 60:02d}"

def _drift_badge(drift: str) -> str:
    if drift == "on":
        return "🟢 on"
    if drift == "drifting":
        return "🟡 drifting"
    return "⚪ unknown"


class StdoutHudRenderer:
    def __init__(self, stream: TextIO = sys.stdout):
        self._s = stream

    def render(self, state: HudState) -> None:
        drift = _drift_badge(state.drift)
        if state.drift == "drifting" and state.drift_from:
            drift += f" (was: {state.drift_from})"
        remaining = _fmt_time(state.remaining_seconds())
        sug = " | ".join(state.suggestions) if state.suggestions else "—"
        line = (
            f"[spec-lesson] topic={state.topic!r}  {drift}  "
            f"sugg=[{sug}]  {remaining} left\n"
        )
        self._s.write(line)
        self._s.flush()

    def close(self) -> None:
        pass
```

```bash
git add spec_lesson/hud/renderer.py tests/unit/test_hud_renderer_stdout.py
git commit -m "feat(spec-lesson): HudRenderer protocol + StdoutHudRenderer"
```

---

## Task 24: `TkinterHudRenderer` (the real HUD)

**Files:** append to `spec_lesson/hud/renderer.py`. No unit test (requires a display).

Design: A `tk.Toplevel` window with:
- `overrideredirect(True)` for frameless
- `-topmost` + `-alpha 0.85` for always-on-top + translucent
- Geometry: `320x220+SCREEN_W-340+20` (top-right corner)
- 4 labels: topic, drift badge, suggestion panel, timeline (last 5 events, scroll beyond)
- Countdown updates via `tick()`

Key constraint: Tkinter requires its event loop to run on the main thread. So the HUD runs in main thread; the orchestrator (asyncio) runs in the main thread too. We use `root.after(100, self._tick)` for polling updates from the observer.

Implementation (append to `renderer.py`):

```python
class TkinterHudRenderer:
    def __init__(self, observer, poll_ms: int = 500):
        import tkinter as tk
        self._tk = tk
        self._observer = observer
        self._poll_ms = poll_ms
        self._root: tk.Tk | None = None
        self._vars: dict = {}

    def _build(self):
        tk = self._tk
        root = tk.Tk()
        root.overrideredirect(True)
        root.attributes("-topmost", True)
        root.attributes("-alpha", 0.88)
        w, h = 340, 230
        sw = root.winfo_screenwidth()
        root.geometry(f"{w}x{h}+{sw - w - 24}+24")
        root.configure(bg="#0f172a")

        topic_var = tk.StringVar(value="(starting)")
        drift_var = tk.StringVar(value="⚪ unknown")
        sugg_var = tk.StringVar(value="—")
        timeline_var = tk.StringVar(value="")
        time_var = tk.StringVar(value="--:--")

        tk.Label(root, textvariable=topic_var, fg="#f8fafc", bg="#0f172a",
                 font=("Helvetica", 13, "bold"), wraplength=300, anchor="w",
                 justify="left").pack(fill="x", padx=10, pady=(8, 2))
        tk.Label(root, textvariable=drift_var, fg="#cbd5e1", bg="#0f172a",
                 font=("Helvetica", 11), anchor="w").pack(fill="x", padx=10)
        tk.Label(root, text="Suggestions:", fg="#94a3b8", bg="#0f172a",
                 font=("Helvetica", 10, "italic"), anchor="w").pack(fill="x", padx=10, pady=(6, 0))
        tk.Label(root, textvariable=sugg_var, fg="#e2e8f0", bg="#0f172a",
                 font=("Helvetica", 10), wraplength=300, anchor="w",
                 justify="left").pack(fill="x", padx=10)
        tk.Label(root, textvariable=timeline_var, fg="#64748b", bg="#0f172a",
                 font=("Helvetica", 9), wraplength=300, anchor="w",
                 justify="left").pack(fill="x", padx=10, pady=(6, 0))
        tk.Label(root, textvariable=time_var, fg="#fbbf24", bg="#0f172a",
                 font=("Helvetica", 10, "bold"), anchor="e").pack(fill="x", padx=10, pady=(4, 6))

        self._vars = {
            "topic": topic_var, "drift": drift_var, "sugg": sugg_var,
            "timeline": timeline_var, "time": time_var,
        }
        self._root = root

    def _poll(self):
        if self._root is None:
            return
        snap = self._observer.snapshot()
        self._vars["topic"].set(snap.topic)
        drift_text = _drift_badge(snap.drift)
        if snap.drift == "drifting" and snap.drift_from:
            drift_text += f"  (was: {snap.drift_from})"
        self._vars["drift"].set(drift_text)
        self._vars["sugg"].set("\n".join(f"· {c}" for c in snap.suggestions) or "—")
        lines = [f"{_fmt_time(e.at)} {e.kind}: {e.summary}" for e in snap.timeline[-5:]]
        self._vars["timeline"].set("\n".join(lines))
        self._vars["time"].set(_fmt_time(snap.remaining_seconds()) + " left")
        self._root.after(self._poll_ms, self._poll)

    def mainloop(self) -> None:
        self._build()
        self._root.after(self._poll_ms, self._poll)
        self._root.mainloop()

    def render(self, state) -> None:
        # not used — Tk drives its own loop via mainloop()
        pass

    def close(self) -> None:
        if self._root is not None:
            try: self._root.destroy()
            except Exception: pass
            self._root = None
```

```bash
git add spec_lesson/hud/renderer.py
git commit -m "feat(spec-lesson): TkinterHudRenderer (frameless + always-on-top)"
```

---

## Task 25: Orchestrator → Observer wiring + CLI `--hud` flag

**Files:** modify `spec_lesson/orchestrator.py` + `spec_lesson/cli.py`; add `tests/integration/test_hud_wiring.py`.

**Orchestrator change:** accept an optional `HudObserver` in `__init__`. In `_run_context`, `_run_thread`, `_run_immediate`, `_log_trigger`, call `self._observer.on_X(...)` if observer present.

Also add a `_hud_tick_task` in `run()` that updates `observer.tick(elapsed)` once per second.

**CLI change:** `--hud=off|stdout|tk` flag. Default `off`. For `stdout`, the renderer lives inside the asyncio loop. For `tk`, the tkinter mainloop runs in main thread and the asyncio loop runs in a dedicated thread (reverse of the default layout).

Integration test (headless-friendly): assert observer snapshot reflects tier events.

```python
# tests/integration/test_hud_wiring.py
import asyncio
import json
import pytest
from pathlib import Path
from unittest.mock import AsyncMock
from spec_lesson.orchestrator import Orchestrator, OrchestratorConfig
from spec_lesson.session import Session
from spec_lesson.tiers.client import AnthropicClient
from spec_lesson.hud.observer import HudObserver

@pytest.mark.asyncio
async def test_observer_captures_context_events(tmp_path: Path):
    project = tmp_path / "p"; project.mkdir()
    session = Session.new(project_dir=project)
    client = AsyncMock(spec=AnthropicClient)
    client.complete = AsyncMock(return_value=json.dumps({
        "topic": "design work", "decisions": ["cap 1.5h"],
        "requirements": [], "open_questions": [], "recent_verbatim": ""
    }))
    observer = HudObserver(max_seconds=0.3)
    cfg = OrchestratorConfig(thread_interval=999, context_interval=999, max_seconds=0.3)
    orch = Orchestrator(session=session, client=client, config=cfg, observer=observer)

    async def feed():
        await asyncio.sleep(0.02)
        orch.ingest({"timestamp": 1.0, "speaker": "user", "text": "OK Claude build that", "is_final": True})

    await asyncio.gather(orch.run(), feed())
    snap = observer.snapshot()
    assert snap.topic == "design work"
    assert any(e.kind == "context" for e in snap.timeline)
    assert snap.trigger_fired_at == 1.0
```

Commit: `feat(spec-lesson): wire Orchestrator to HudObserver + CLI --hud flag`.

---

## Task 26: Manual smoke test + README

Since Tkinter HUD isn't CI-testable, add a standalone demo script:

```
spec_lesson/hud/demo.py
```

```python
"""Standalone HUD demo: synthetic state updates every few seconds."""
import asyncio
import threading
from spec_lesson.hud.observer import HudObserver
from spec_lesson.hud.renderer import TkinterHudRenderer

def _feed(observer):
    import time
    time.sleep(1)
    observer.on_context(at=5, topic="Designing the access cert flow", decisions_count=3)
    time.sleep(2)
    observer.on_thread(at=10, drift="on", current_topic="Designing the access cert flow", drift_from="Designing the access cert flow")
    time.sleep(2)
    observer.on_immediate(at=12, candidates=["Have we considered auto-escalation?", "Who owns the SLA?", "What's the rollback plan?"])
    time.sleep(3)
    observer.on_thread(at=15, drift="drifting", current_topic="Lunch plans", drift_from="Designing the access cert flow")
    time.sleep(2)
    observer.on_trigger(at=17, phrase="OK Claude build that")

def main():
    observer = HudObserver(max_seconds=120.0)
    threading.Thread(target=_feed, args=(observer,), daemon=True).start()
    TkinterHudRenderer(observer=observer).mainloop()

if __name__ == "__main__":
    main()
```

Run with: `python -m spec_lesson.hud.demo`. Verify visually: window appears top-right, updates over ~20s, shows green/amber badges, countdown, suggestions.

Commit: `feat(spec-lesson): HUD demo script`.

---

## Self-review

- HudState is pure Python, fully tested (4 tests).
- HudObserver is thread-safe (lock + deepcopy snapshot), fully tested (6 tests).
- StdoutHudRenderer is fully tested (2 tests).
- TkinterHudRenderer: intentionally no unit test; `demo.py` is the smoke test. Acceptable because the rendering logic is thin and the state logic is already tested.
- Orchestrator integration: one new integration test verifying observer wiring.
- No new runtime dependencies (tkinter is stdlib).
- Plan 2 compatibility: existing tests continue to pass.

Expected test count: 88 → 88 + 4 + 6 + 2 + 1 = **101 passed**.
