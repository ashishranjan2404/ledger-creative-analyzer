import re
from dataclasses import dataclass, field
from datetime import datetime, timezone
from pathlib import Path

from ..tiers.prompts import (
    POLISH_SECTION_DECISIONS,
    POLISH_SECTION_REQUIREMENTS,
    POLISH_SECTION_OPEN_QUESTIONS,
    POLISH_SECTION_ACTION_ITEMS,
)


@dataclass
class SessionNote:
    path: Path
    date: str
    title: str
    topics: list[str] = field(default_factory=list)
    decisions: list[str] = field(default_factory=list)
    requirements: list[str] = field(default_factory=list)
    open_questions: list[str] = field(default_factory=list)
    action_items: list[str] = field(default_factory=list)

    def mtime_utc(self) -> datetime:
        return datetime.fromtimestamp(self.path.stat().st_mtime, tz=timezone.utc)


def find_session_files(root: Path) -> list[Path]:
    return sorted(root.rglob(".spec-lesson/session-*.md"))


_FRONT_RE = re.compile(r"^---\n(.*?)\n---\n", re.DOTALL)
_TITLE_RE = re.compile(r"^# (.+?)$", re.MULTILINE)
_DATE_RE = re.compile(r"^date:\s*(.+?)$", re.MULTILINE)
_TOPICS_RE = re.compile(r"^topics:\s*\[(.*?)\]", re.MULTILINE)

# Section header names are derived from the prompt constants so that any
# rename in prompts.py is automatically reflected in the parser.


def _parse_bulleted_section(body: str, header: str) -> list[str]:
    # Capture lines under `## Header` until next heading.
    # Use MULTILINE + ^## anchor so an empty section followed immediately by
    # another ## header does not bleed bullets from the next section.
    pattern = rf"^##\s+{re.escape(header)}\s*\n(.*?)(?=^##\s|\Z)"
    m = re.search(pattern, body, re.DOTALL | re.MULTILINE)
    if not m:
        return []
    section = m.group(1)
    items = []
    for line in section.splitlines():
        s = line.strip()
        if s.startswith("- [ ]") or s.startswith("- [x]"):
            items.append(s[5:].strip())
        elif s.startswith("- "):
            items.append(s[2:].strip())
    return [i for i in items if i]


def parse_session(path: Path) -> "SessionNote | None":
    import logging as _logging
    try:
        text = path.read_text(encoding="utf-8")
    except (OSError, UnicodeDecodeError) as e:
        _logging.getLogger(__name__).warning("skipping unreadable session %s: %s", path, e)
        return None
    front = _FRONT_RE.match(text)
    date = ""
    topics: list[str] = []
    if front:
        fb = front.group(1)
        dm = _DATE_RE.search(fb)
        if dm:
            date = dm.group(1).strip()
        tm = _TOPICS_RE.search(fb)
        if tm:
            topics = [t.strip() for t in tm.group(1).split(",") if t.strip()]
    title_m = _TITLE_RE.search(text)
    title = title_m.group(1).strip() if title_m else path.stem
    return SessionNote(
        path=path,
        date=date,
        title=title,
        topics=topics,
        decisions=_parse_bulleted_section(text, POLISH_SECTION_DECISIONS),
        requirements=_parse_bulleted_section(text, POLISH_SECTION_REQUIREMENTS),
        open_questions=_parse_bulleted_section(text, POLISH_SECTION_OPEN_QUESTIONS),
        action_items=_parse_bulleted_section(text, POLISH_SECTION_ACTION_ITEMS),
    )
