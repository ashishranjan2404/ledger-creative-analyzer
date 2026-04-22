"""HUD rendering backends: stdout line printer and Tkinter overlay.

``StdoutHudRenderer`` prints one status line per poll cycle to any text stream.
``TkinterHudRenderer`` creates a frameless, always-on-top, semi-transparent
overlay (alpha 0.88) that self-updates every 500 ms by polling the observer
from the Tk main loop — ``render()`` is a no-op on this backend.
"""
import sys
from typing import TYPE_CHECKING, Protocol, TextIO
from .state import HudState

if TYPE_CHECKING:
    import tkinter as tk

class HudRenderer(Protocol):
    def render(self, state: HudState) -> None: ...
    def close(self) -> None: ...
    def mainloop(self) -> None: ...


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

    def mainloop(self) -> None:
        """No-op: stdout renderer has no event loop."""
        pass


# Task 24: Tkinter HUD — frameless, always-on-top, translucent
class TkinterHudRenderer:
    def __init__(self, observer, poll_ms: int = 500):
        import tkinter as tk
        self._tk = tk
        self._observer = observer
        self._poll_ms = poll_ms
        self._root: "tk.Tk | None" = None
        self._vars: "dict[str, tk.StringVar]" = {}

    def _build(self) -> None:
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

    def _poll(self) -> None:
        if self._root is None:
            return
        snap = self._observer.snapshot()
        self._vars["topic"].set(snap.topic)
        drift_text = _drift_badge(snap.drift)
        if snap.drift == "drifting" and snap.drift_from:
            drift_text += f"  (was: {snap.drift_from})"
        self._vars["drift"].set(drift_text)
        self._vars["sugg"].set("\n".join(f"· {c}" for c in snap.suggestions) or "—")
        lines = [f"{_fmt_time(e.elapsed_seconds)} {e.kind}: {e.summary}" for e in snap.timeline[-5:]]
        self._vars["timeline"].set("\n".join(lines))
        self._vars["time"].set(_fmt_time(snap.remaining_seconds()) + " left")
        self._root.after(self._poll_ms, self._poll)

    def mainloop(self) -> None:
        self._build()
        assert self._root is not None  # _build() always sets _root
        self._root.after(self._poll_ms, self._poll)
        self._root.mainloop()

    def render(self, state: HudState) -> None:  # noqa: ARG002
        """No-op: TkinterHudRenderer is self-driving via Tk's event loop."""
        pass

    def close(self) -> None:
        if self._root is not None:
            try: self._root.destroy()
            except Exception: pass
            self._root = None
