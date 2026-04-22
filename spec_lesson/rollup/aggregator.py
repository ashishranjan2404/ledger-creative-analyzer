"""Rollup aggregation and Markdown rendering.

Takes a list of ``SessionNote`` objects, deduplicates items case-insensitively
across sessions (preserving the first canonical form), counts topic tags, and
renders a single Markdown rollup document.  ``filter_by_window()`` narrows to
notes whose file mtime falls inside a rolling time window.
"""
from collections import Counter
from datetime import datetime, timezone, timedelta
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
    def _safe_mtime(n: SessionNote):
        try:
            return n.mtime_utc()
        except OSError:
            return datetime.min.replace(tzinfo=timezone.utc)

    for n in sorted(notes, key=_safe_mtime, reverse=True):
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
