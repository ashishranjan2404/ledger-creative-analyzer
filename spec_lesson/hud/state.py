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
