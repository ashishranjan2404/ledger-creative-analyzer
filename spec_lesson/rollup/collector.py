import re
from dataclasses import dataclass, field
from datetime import datetime, timezone
from pathlib import Path


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

_SECTION_HEADERS = {
    "decisions": "Decisions",
    "requirements": "Requirements",
    "open_questions": "Open questions",
    "action_items": "Action items",
}


def _parse_bulleted_section(body: str, header: str) -> list[str]:
    # Capture lines under `## Header` until next heading
    pattern = rf"##\s+{re.escape(header)}\s*\n(.*?)(?=\n##\s|\Z)"
    m = re.search(pattern, body, re.DOTALL)
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


def parse_session(path: Path) -> SessionNote:
    text = path.read_text(encoding="utf-8")
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
        decisions=_parse_bulleted_section(text, "Decisions"),
        requirements=_parse_bulleted_section(text, "Requirements"),
        open_questions=_parse_bulleted_section(text, "Open questions"),
        action_items=_parse_bulleted_section(text, "Action items"),
    )
