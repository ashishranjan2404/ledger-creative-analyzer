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
