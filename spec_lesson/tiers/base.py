import json
from dataclasses import dataclass, field
from typing import Any, Protocol


@dataclass
class Distillation:
    topic: str
    decisions: list[str]
    requirements: list[str]
    open_questions: list[str]
    recent_verbatim: str = ""
    updated_at_iso: str = ""

    @classmethod
    def empty(cls) -> "Distillation":
        return cls(topic="(session just started)", decisions=[], requirements=[], open_questions=[])

    @classmethod
    def from_json(cls, raw: str) -> "Distillation":
        data = json.loads(raw)
        return cls(
            topic=data.get("topic", ""),
            decisions=list(data.get("decisions", [])),
            requirements=list(data.get("requirements", [])),
            open_questions=list(data.get("open_questions", [])),
            recent_verbatim=data.get("recent_verbatim", ""),
            updated_at_iso=data.get("updated_at_iso", ""),
        )

    def to_json(self) -> str:
        return json.dumps({
            "topic": self.topic,
            "decisions": self.decisions,
            "requirements": self.requirements,
            "open_questions": self.open_questions,
            "recent_verbatim": self.recent_verbatim,
        })

    def merge_append_only(self, new: "Distillation") -> "Distillation":
        """Merge with append-only semantics: never drop items from old lists."""
        def _append_unique(old: list[str], fresh: list[str]) -> list[str]:
            seen = set(old)
            merged = list(old)
            for item in fresh:
                if item not in seen:
                    merged.append(item)
                    seen.add(item)
            return merged

        return Distillation(
            topic=new.topic or self.topic,
            decisions=_append_unique(self.decisions, new.decisions),
            requirements=_append_unique(self.requirements, new.requirements),
            open_questions=_append_unique(self.open_questions, new.open_questions),
            recent_verbatim=new.recent_verbatim,
            updated_at_iso=new.updated_at_iso,
        )

    def render_markdown(self) -> str:
        def bullets(items: list[str]) -> str:
            return "\n".join(f"- {x}" for x in items) if items else "- (none yet)"

        return (
            f"## Session context (auto-generated — last updated {self.updated_at_iso})\n\n"
            f"**Topic:** {self.topic}\n\n"
            f"**Decisions so far:**\n{bullets(self.decisions)}\n\n"
            f"**Requirements:**\n{bullets(self.requirements)}\n\n"
            f"**Open questions:**\n{bullets(self.open_questions)}\n\n"
            f"**Recent verbatim (last 3 min):**\n\n> {self.recent_verbatim or '(none)'}\n"
        )


class Tier(Protocol):
    name: str

    async def run(self) -> Any: ...
