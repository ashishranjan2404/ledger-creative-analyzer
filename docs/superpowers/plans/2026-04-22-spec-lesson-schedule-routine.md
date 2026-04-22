# spec-lesson Plan 4 — /schedule cross-session roll-up

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development. Checkbox steps.

**Goal:** Produce a daily roll-up Markdown note summarizing all spec-lesson sessions from the last 24 hours, aggregating decisions/requirements/open-questions across sessions and detecting recurring themes. Runs as a scheduled routine on Claude Code on the web (Max plan → zero incremental API cost), but can also be run locally via a `spec-lesson rollup` CLI subcommand for testing / users without routines.

**Architecture:** A pure Python aggregator reads `.spec-lesson/session-*.md` files across one or more project directories, parses the distillation frontmatter and sections, groups by time window, and emits a single rolled-up Markdown note. The routine is a thin prompt that invokes the aggregator script via Bash.

**Tech Stack:** stdlib `pathlib` + `re` + `datetime`. No new deps. Tests use fixtures.

---

## File Structure additions

```
spec_lesson/rollup/
├── __init__.py
├── collector.py             # scans for session-*.md files + parses
├── aggregator.py            # dedupes + groups + renders rollup markdown
└── cli_entry.py             # `spec-lesson rollup --since=24h [--out=path]`

spec_lesson/cli.py           # MODIFY: register `rollup` subcommand

docs/routines/
└── spec-lesson-daily-rollup.md   # the /schedule routine prompt (for Claude Code on the web)

tests/unit/
├── test_rollup_collector.py
└── test_rollup_aggregator.py

tests/integration/
├── test_rollup_cli.py
└── fixtures/rollup/
    ├── project-a/.spec-lesson/session-2026-04-22T100000.md
    ├── project-a/.spec-lesson/session-2026-04-22T140000.md
    └── project-b/.spec-lesson/session-2026-04-22T120000.md
```

---

## Task 27: `collector` — scan and parse session files

**Files:** `spec_lesson/rollup/__init__.py` (empty), `spec_lesson/rollup/collector.py`, `tests/unit/test_rollup_collector.py`

Parses our session-*.md files. Each should have frontmatter-style fields but we're more forgiving — regex extract.

- [ ] **Step 1: Test**

```python
# tests/unit/test_rollup_collector.py
from pathlib import Path
from spec_lesson.rollup.collector import SessionNote, find_session_files, parse_session

def test_find_session_files_recurses(tmp_path: Path):
    for p in [
        tmp_path / "a/.spec-lesson/session-1.md",
        tmp_path / "b/.spec-lesson/session-2.md",
        tmp_path / "c/.spec-lesson/ignore-me.md",
    ]:
        p.parent.mkdir(parents=True, exist_ok=True)
        p.write_text("body")
    files = find_session_files(tmp_path)
    assert len(files) == 2  # only session-*.md
    paths = sorted(str(f) for f in files)
    assert paths[0].endswith("session-1.md")
    assert paths[1].endswith("session-2.md")

def test_parse_session_extracts_sections(tmp_path: Path):
    body = """---
date: 2026-04-22
session: spec-lesson
topics: [adhd, voice]
---

# ADHD voice assistant

## Summary
We designed a live meeting assistant.

## Decisions
- 1.5h hard cap
- Deepgram for ASR

## Requirements
- macOS first

## Open questions
- Should we ship HUD in v1?

## Action items
- [ ] Ship plan 1
"""
    p = tmp_path / "session-x.md"
    p.write_text(body)
    note = parse_session(p)
    assert note.date == "2026-04-22"
    assert note.topics == ["adhd", "voice"]
    assert note.title == "ADHD voice assistant"
    assert "1.5h hard cap" in note.decisions
    assert "Deepgram for ASR" in note.decisions
    assert "macOS first" in note.requirements
    assert "Should we ship HUD in v1?" in note.open_questions
    assert "Ship plan 1" in note.action_items
    assert note.path == p
```

- [ ] **Step 2: FAIL on ModuleNotFoundError**
- [ ] **Step 3: Implementation**

```python
# spec_lesson/rollup/__init__.py
```

```python
# spec_lesson/rollup/collector.py
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
```

- [ ] **Step 4: PASS**
- [ ] **Step 5:** commit `feat(spec-lesson): rollup collector for session notes`

---

## Task 28: `aggregator` — dedupe + render rollup markdown

**Files:** `spec_lesson/rollup/aggregator.py`, `tests/unit/test_rollup_aggregator.py`

Design: takes a list of `SessionNote`s + a window (e.g., "last 24h"), filters by `mtime_utc`, aggregates items with case-insensitive dedup + session attribution, renders as markdown.

- [ ] **Step 1: Test**

```python
# tests/unit/test_rollup_aggregator.py
from datetime import datetime, timezone, timedelta
from pathlib import Path
from spec_lesson.rollup.aggregator import render_rollup
from spec_lesson.rollup.collector import SessionNote

def _note(title, decisions=None, requirements=None, topics=None):
    return SessionNote(
        path=Path("/tmp/fake.md"),
        date="2026-04-22",
        title=title,
        topics=topics or [],
        decisions=decisions or [],
        requirements=requirements or [],
    )

def test_rollup_merges_decisions_with_attribution():
    notes = [
        _note("Session 1", decisions=["1.5h cap", "Deepgram"]),
        _note("Session 2", decisions=["1.5h Cap", "Tkinter HUD"]),  # case duplicate
    ]
    md = render_rollup(notes, window_label="last 24h")
    assert "last 24h" in md
    assert "1.5h cap" in md.lower()
    # merged once, not twice
    assert md.lower().count("1.5h cap") == 1
    assert "Deepgram" in md
    assert "Tkinter HUD" in md
    # session attribution present
    assert "Session 1" in md
    assert "Session 2" in md

def test_rollup_shows_top_topics():
    notes = [
        _note("A", topics=["adhd", "voice", "python"]),
        _note("B", topics=["adhd", "tkinter"]),
        _note("C", topics=["voice"]),
    ]
    md = render_rollup(notes, window_label="24h")
    # adhd and voice each appear twice; should be listed
    assert "adhd" in md
    assert "voice" in md

def test_rollup_empty_notes():
    md = render_rollup([], window_label="24h")
    assert "No sessions" in md
```

- [ ] **Step 2: FAIL**
- [ ] **Step 3: Implementation**

```python
# spec_lesson/rollup/aggregator.py
from collections import Counter
from datetime import datetime, timezone, timedelta
from typing import Optional
from .collector import SessionNote


def _dedupe_case_insensitive(items_by_session: list[tuple[str, list[str]]]) -> list[tuple[str, list[str]]]:
    """Return list of (canonical_item, session_titles_contributing), dedup by lowercase."""
    first_seen: dict[str, tuple[str, list[str]]] = {}
    for session_title, items in items_by_session:
        for raw in items:
            key = raw.strip().lower()
            if not key:
                continue
            if key in first_seen:
                first_seen[key][1].append(session_title)
            else:
                first_seen[key] = (raw.strip(), [session_title])
    return list(first_seen.values())


def render_rollup(notes: list[SessionNote], window_label: str = "last 24 hours") -> str:
    if not notes:
        return f"# spec-lesson rollup — {window_label}\n\nNo sessions in window.\n"

    # Aggregate
    decisions = _dedupe_case_insensitive([(n.title, n.decisions) for n in notes])
    requirements = _dedupe_case_insensitive([(n.title, n.requirements) for n in notes])
    open_questions = _dedupe_case_insensitive([(n.title, n.open_questions) for n in notes])
    action_items = _dedupe_case_insensitive([(n.title, n.action_items) for n in notes])

    topic_counts = Counter()
    for n in notes:
        topic_counts.update(n.topics)
    top_topics = topic_counts.most_common(10)

    now = datetime.now(timezone.utc).strftime("%Y-%m-%d %H:%M UTC")
    lines = [
        f"# spec-lesson rollup — {window_label}",
        f"*Generated {now} from {len(notes)} session(s)*",
        "",
        "## Sessions",
    ]
    for n in sorted(notes, key=lambda x: x.mtime_utc(), reverse=True):
        lines.append(f"- **{n.title}** (`{n.path.name}`)")
    lines.append("")

    if top_topics:
        lines.append("## Top topics")
        for tag, count in top_topics:
            lines.append(f"- `{tag}` × {count}")
        lines.append("")

    def _section(heading: str, items: list[tuple[str, list[str]]]) -> None:
        if not items:
            return
        lines.append(f"## {heading}")
        for text, sessions in items:
            attr = f"  _(from: {', '.join(sorted(set(sessions)))})_" if len(sessions) > 1 else ""
            lines.append(f"- {text}{attr}")
        lines.append("")

    _section("Decisions", decisions)
    _section("Requirements", requirements)
    _section("Open questions", open_questions)
    _section("Action items", action_items)

    return "\n".join(lines) + "\n"


def filter_by_window(notes: list[SessionNote], hours: float) -> list[SessionNote]:
    cutoff = datetime.now(timezone.utc) - timedelta(hours=hours)
    return [n for n in notes if n.mtime_utc() >= cutoff]
```

- [ ] **Step 4: PASS**
- [ ] **Step 5:** commit `feat(spec-lesson): rollup aggregator with case-insensitive dedup + attribution`

---

## Task 29: CLI `spec-lesson rollup` subcommand

**Files:** modify `spec_lesson/cli.py`; add `tests/integration/test_rollup_cli.py`

Add:
```python
@app.command()
def rollup(
    since_hours: float = typer.Option(24.0, "--since-hours", help="Window in hours"),
    root: Path = typer.Option(Path.home(), "--root", help="Directory to scan for .spec-lesson/ session files"),
    out: Path = typer.Option(None, "--out", help="Output path; default stdout"),
):
    """Aggregate recent spec-lesson sessions into a rollup markdown."""
    from .rollup.collector import find_session_files, parse_session
    from .rollup.aggregator import render_rollup, filter_by_window
    files = find_session_files(root)
    notes = [parse_session(f) for f in files]
    notes = filter_by_window(notes, hours=since_hours)
    md = render_rollup(notes, window_label=f"last {since_hours:g}h")
    if out:
        out.parent.mkdir(parents=True, exist_ok=True)
        out.write_text(md, encoding="utf-8")
        typer.echo(f"Wrote rollup to {out}")
    else:
        typer.echo(md)
```

Integration test: lay out 2 fake projects with session files, invoke via subprocess, verify output.

Commit: `feat(spec-lesson): CLI rollup subcommand`.

---

## Task 30: Routine prompt doc for Claude Code on the web

**File:** `docs/routines/spec-lesson-daily-rollup.md`

This is the text to paste into Claude Code on the web's routine setup. It instructs Claude to:
1. Clone the user's repo (already authenticated via GitHub App)
2. Run `spec-lesson rollup` against `~/Obsidian/claude-vault/` (or wherever session notes are)
3. Write the rollup to `~/Obsidian/claude-vault/rollups/spec-lesson-YYYY-MM-DD.md`
4. Post a summary to the user (via the routine's chat output)

Content:

```markdown
# spec-lesson-daily-rollup routine

**Recommended schedule:** Daily at 08:00 local time.

## Prompt

You are a daily roll-up agent for spec-lesson sessions. Each morning:

1. Change to the `ledger-creative-analyzer` repository.
2. Install the package in dev mode if not already: `pip install -e ".[dev]"` (should be quick).
3. Run: `spec-lesson rollup --since-hours=24 --root=$HOME --out=$HOME/Obsidian/claude-vault/rollups/spec-lesson-$(date +%Y-%m-%d).md`
4. If the rollup contains any *Open questions* or unresolved *Action items*, summarize them here as your response (so they appear in my morning notifications).
5. If no sessions in window, say "No spec-lesson sessions yesterday."

## Setup

1. Go to claude.ai/code → New routine
2. Paste the prompt above
3. Cron: `0 8 * * *` (daily at 08:00)
4. GitHub: grant access to the `ledger-creative-analyzer` repo
5. Environment: no secrets needed (no API calls; pure file aggregation)
```

Commit: `docs(spec-lesson): daily rollup routine for Claude Code on the web`.

---

## Self-review

- Pure Python, no new deps.
- No API calls — routine uses the Max plan, zero incremental cost.
- Collector + aggregator tested independently.
- CLI integration tested via subprocess.
- Routine prompt deliberately simple — any regressions in `spec-lesson rollup` get caught locally before the routine runs.

Expected test count after Plan 3 + Plan 4: 101 + 2 (collector) + 3 (aggregator) + 1 (cli integration) = **107 tests passing**.
