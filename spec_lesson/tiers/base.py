import json
from dataclasses import dataclass, field
from typing import Any, Literal, Protocol

# Single canonical definition — import from here in all other modules.
DriftLabel = Literal["on", "drifting", "unknown"]


def _escape_verbatim(text: str) -> str:
    """Return *text* safe for embedding in a Markdown blockquote.

    SEC-2: every newline becomes ``\\n> `` so that continuation lines are also
    blockquoted.  Literal marker patterns are escaped to prevent injection into
    the managed CLAUDE.md section even via the verbatim path.
    """
    if not text:
        return "(none)"
    lines = text.split("\n")
    safe_lines = [ln.replace("<!-- spec-lesson:", "<!-- literal-spec-lesson:") for ln in lines]
    return "\n> ".join(safe_lines)


def _coerce_str_list(v: Any) -> list[str]:
    """Return a clean list[str] from *v*, or [] if *v* is not a proper list.

    Guards against two classes of bad LLM output:
      • v is a bare string  → would silently become a list of single chars
      • v is a list with non-string items (e.g. integers) → cast to str, drop
        items that are not str at all
    """
    if not isinstance(v, list):
        return []
    return [x for x in v if isinstance(x, str)]


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
            decisions=_coerce_str_list(data.get("decisions", [])),
            requirements=_coerce_str_list(data.get("requirements", [])),
            open_questions=_coerce_str_list(data.get("open_questions", [])),
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
            f"**Recent verbatim (last 3 min):**\n\n> {_escape_verbatim(self.recent_verbatim)}\n"
        )


class Tier(Protocol):
    name: str

    async def run(self) -> Any: ...
