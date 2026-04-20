#!/usr/bin/env python3
"""
obsidian_sync — build & maintain an Obsidian vault of your Claude Code projects.

Generates ~/Obsidian/claude-vault/ with:
  - CLAUDE.md            root navigation (for Claude Code sessions inside the vault)
  - index.md             landing page
  - projects/<name>.md   one note per Claude Code project
  - topics/<tag>.md      cross-cutting topic notes (butterbase, oauth, agents, ...)
  - daily/               where Claude can append session logs

Projects are discovered from ~/.claude.json. Each project note gets:
  - YAML frontmatter (path, tags, created, updated, status)
  - Description (from README.md/CLAUDE.md first meaningful content)
  - Topic wiki-links (Uses: [[butterbase]] [[ionrouter]] ...)
  - Related projects (same topics)
  - Key files (top 5 by relevance)
  - Absolute path link

Usage:
    python3 scripts/obsidian_sync.py           # build or refresh
    python3 scripts/obsidian_sync.py --vault /custom/path
    python3 scripts/obsidian_sync.py --dry-run
"""

from __future__ import annotations

import argparse
import json
import os
import re
import subprocess
from collections import defaultdict
from datetime import datetime
from pathlib import Path

HOME = Path.home()
DEFAULT_VAULT = HOME / "Obsidian" / "claude-vault"

# Topic keywords mapped to an Obsidian-friendly tag
TOPIC_KEYWORDS = {
    "butterbase": ["butterbase", "app_36ybfio2fiy7", "butterbase.dev", "butterbase.ai"],
    "ionrouter": ["ionrouter", "ionrouter.io", "qwen3", "qwen 3"],
    "openai-api": ["openai", "gpt-4", "gpt-5", "chatgpt"],
    "claude-api": ["anthropic sdk", "anthropic api", "claude sonnet", "claude opus", "claude haiku"],
    "resend": ["resend.com", "resend api", "resend_api_key"],
    "oauth": ["oauth", "google sign-in", "sign-in with google"],
    "agents": ["agent", "agentic", "multi-agent", "critic", "maker"],
    "rag": ["rag", "retrieval-augmented", "embedding", "vector search"],
    "mcp": ["model context protocol", "mcp server", "mcp__"],
    "ralf": ["ralf", "refine-and-loop", "self-refine"],
    "typescript": [".ts", ".tsx", "typescript", "deno"],
    "python": [".py", "fastapi", "uvicorn"],
    "go": [".go ", "golang"],
    "react": ["react", "vite", "jsx", "tsx"],
    "scout": ["scout", "yutori", "thedi"],
    "hackathon": ["hackathon", "multimodel"],
    "email-digest": ["digest", "newsletter", "morning brief"],
    "kubernetes": ["kube", "k8s", "kubernetes"],
    "gmail": ["gmail api", "gmail-sync"],
    "life-os": ["life-os", "life os", "journaling"],
    "marriage": ["marriage"],
    "relationship": ["relationship", "partner"],
    "voice": ["voice transcription", "voiceink", "whisper", "cartesia"],
}


def load_project_paths() -> list[Path]:
    j = json.loads((HOME / ".claude.json").read_text())
    paths = []
    for k in j.get("projects", {}):
        p = Path(k)
        if not p.exists() or not p.is_dir():
            continue
        s = str(p)
        if any(frag in s for frag in ["/Library/", "/Downloads/", "/Desktop/"]):
            continue
        if p.parent != HOME:
            continue
        paths.append(p)
    return sorted(paths)


def read_head(path: Path, limit_bytes: int = 8000) -> str:
    try:
        return path.read_text(errors="replace")[:limit_bytes]
    except (OSError, UnicodeDecodeError):
        return ""


def extract_description(project: Path) -> str:
    """Pull the most useful 1–3 lines for a project summary."""
    for candidate in ["README.md", "CLAUDE.md", "README.rst", "README.txt"]:
        fp = project / candidate
        if not fp.exists():
            continue
        text = read_head(fp)
        # skip initial blank + headings, grab the first paragraph under the first heading
        lines = text.splitlines()
        in_body = False
        buf = []
        for line in lines:
            stripped = line.strip()
            if not stripped:
                if in_body and buf:
                    break
                continue
            if stripped.startswith("#"):
                in_body = True
                continue
            if stripped.startswith(">"):
                continue  # skip blockquote banners
            if in_body:
                buf.append(stripped)
                if sum(len(b) for b in buf) > 400:
                    break
        if buf:
            return " ".join(buf)[:500]
    return ""


def detect_topics(project: Path) -> list[str]:
    """Scan a small sample of files for topic keywords."""
    hits = set()
    candidates = []
    for name in ["README.md", "CLAUDE.md", "package.json", "pyproject.toml"]:
        if (project / name).exists():
            candidates.append(project / name)
    # sample 5 more top-level files
    try:
        for child in sorted(project.iterdir())[:20]:
            if child.is_file() and child.suffix.lower() in {".md", ".json", ".toml", ".yml", ".yaml"} and child not in candidates:
                candidates.append(child)
            if len(candidates) >= 8:
                break
    except OSError:
        pass

    blob = ""
    for fp in candidates:
        blob += " " + read_head(fp, 4000).lower()

    for tag, keywords in TOPIC_KEYWORDS.items():
        for kw in keywords:
            if kw.lower() in blob:
                hits.add(tag)
                break
    return sorted(hits)


def git_last_commit(project: Path) -> str | None:
    try:
        r = subprocess.run(
            ["git", "-C", str(project), "log", "-1", "--format=%ci"],
            capture_output=True, text=True, timeout=5,
        )
        if r.returncode == 0 and r.stdout.strip():
            return r.stdout.strip().split(" ")[0]
    except Exception:
        pass
    return None


def git_branch(project: Path) -> str | None:
    try:
        r = subprocess.run(
            ["git", "-C", str(project), "rev-parse", "--abbrev-ref", "HEAD"],
            capture_output=True, text=True, timeout=5,
        )
        if r.returncode == 0:
            return r.stdout.strip()
    except Exception:
        pass
    return None


def key_files(project: Path, limit: int = 6) -> list[Path]:
    interesting_names = {
        "README.md", "CLAUDE.md", "LESSONS.md", "ARCHITECTURE.md",
        "package.json", "pyproject.toml", "Cargo.toml",
        "Dockerfile", "requirements.txt",
        "main.py", "app.py", "index.ts", "index.js",
    }
    found = []
    for name in interesting_names:
        fp = project / name
        if fp.exists():
            found.append(fp)
    # fill rest with biggest top-level markdown files
    try:
        for child in sorted(project.iterdir(), key=lambda p: -p.stat().st_size if p.exists() else 0):
            if len(found) >= limit:
                break
            if child in found:
                continue
            if child.is_file() and child.suffix.lower() in {".md", ".py", ".ts"}:
                if child.name.startswith("."):
                    continue
                found.append(child)
    except OSError:
        pass
    return found[:limit]


def render_project_note(project: Path, topics: list[str], topic_counts: dict[str, list[str]]) -> str:
    name = project.name
    description = extract_description(project) or "_(no description found in README/CLAUDE.md)_"
    last_commit = git_last_commit(project)
    branch = git_branch(project)
    now = datetime.now().strftime("%Y-%m-%d")

    # related = projects that share >=2 topics
    related = set()
    for t in topics:
        for sibling in topic_counts.get(t, []):
            if sibling != name:
                related.add(sibling)
    # only keep siblings sharing 2+ topics
    related_strong = sorted([
        s for s in related
        if sum(1 for t in topics if s in topic_counts.get(t, [])) >= 2
    ])

    files = key_files(project)
    files_list = "\n".join(
        f"- `{f.relative_to(project)}` ({f.stat().st_size} bytes)"
        for f in files
    ) or "_(no key files detected)_"

    tag_str = " ".join(f"#{t}" for t in topics)
    topic_links = " ".join(f"[[{t}]]" for t in topics) if topics else "_(none detected)_"
    related_links = " · ".join(f"[[{r}]]" for r in related_strong) if related_strong else "_(none)_"

    frontmatter = {
        "name": name,
        "path": str(project),
        "tags": topics,
        "updated": now,
    }
    if last_commit:
        frontmatter["last_commit"] = last_commit
    if branch:
        frontmatter["branch"] = branch

    fm_lines = ["---"]
    for k, v in frontmatter.items():
        if isinstance(v, list):
            fm_lines.append(f"{k}:")
            for item in v:
                fm_lines.append(f"  - {item}")
        else:
            fm_lines.append(f"{k}: {v}")
    fm_lines.append("---")

    return "\n".join(fm_lines) + f"""

# {name}

{description}

**Path**: [`{project}`](file://{project})
{"**Branch**: `" + branch + "`" if branch else ""}
{"**Last commit**: " + last_commit if last_commit else ""}

## Topics

Uses: {topic_links}

{tag_str}

## Related projects

{related_links}

## Key files

{files_list}

## Notes

_Add your notes here. Claude Code can read + update this section._
"""


def render_topic_note(topic: str, projects: list[str]) -> str:
    now = datetime.now().strftime("%Y-%m-%d")
    bullets = "\n".join(f"- [[{p}]]" for p in sorted(projects))
    fm = f"""---
topic: {topic}
updated: {now}
---

# {topic}

Projects on your machine using **{topic}**:

{bullets}

## Notes

_Cross-cutting notes on this topic. What works, what doesn't, what you've learned._
"""
    return fm


def render_index(projects: list[tuple[Path, list[str]]], topic_counts: dict[str, list[str]]) -> str:
    now = datetime.now().strftime("%Y-%m-%d %H:%M")
    proj_lines = "\n".join(
        f"- [[{p.name}]] — {', '.join(t for t in topics) or '_(no topics)_'}"
        for p, topics in sorted(projects, key=lambda x: x[0].name)
    )
    topic_lines = "\n".join(
        f"- [[{t}]] ({len(ps)} projects)"
        for t, ps in sorted(topic_counts.items(), key=lambda x: -len(x[1]))
    )
    return f"""---
title: Claude Code Vault
updated: {now}
---

# 🧠 Claude Code Vault

A second-brain view over every Claude Code project on this machine. Every project has a note under [[projects]], and cross-cutting themes live under [[topics]].

> Last synced: **{now}**
> Sync again: `python3 ~/ledger-creative-analyzer/scripts/obsidian_sync.py`

## Projects

{proj_lines}

## Topics

{topic_lines}

## Daily notes

- [[daily/{datetime.now().strftime('%Y-%m-%d')}]] — today

## How this works

This vault is **auto-regenerated** by `obsidian_sync.py`. Project notes overwrite on each sync; only the `## Notes` section at the bottom and `daily/` entries are preserved across runs (if you edit the project note, use a heading other than one generated by the sync).

Companion: the `claude-notebook` tool (BM25 + Qwen rerank for semantic retrieval) lives at `cn ask "..."`. Use it when you want cross-project citation-backed context inside a Claude Code session.
"""


def render_vault_claude_md() -> str:
    return """# CLAUDE.md

You are working inside an Obsidian-style vault that indexes every Claude Code project on this machine. Navigate like this:

- `index.md` — root landing + all projects + topics
- `projects/<name>.md` — one note per project (auto-generated by `obsidian_sync.py`)
- `topics/<tag>.md` — cross-cutting themes (butterbase, oauth, agents, ...)
- `daily/YYYY-MM-DD.md` — daily note you can append to

## When you're asked about something in this vault

1. Read `index.md` first.
2. Hop through wiki-links (`[[project-name]]`) to get the right note.
3. Notes are shallow on purpose — each has a `Path:` link to the actual project dir on disk if you need deep content.

## When you want to retrieve deep content across projects

Use the semantic retrieval tool — not the vault:

```bash
python3 ~/ledger-creative-analyzer/scripts/claude_notebook.py ask "..."
```

This does BM25 + LLM rerank across all 13 projects' full text. Pipe its output back into Claude Code with `| claude`.

## Don't

- Don't overwrite `index.md` or project notes — they're auto-generated.
- Edit `## Notes` sections at the bottom of project notes if you want to persist commentary; those are preserved on re-sync.
- Daily notes (`daily/*`) are free-form and always preserved.

## Regenerating the vault

```bash
python3 ~/ledger-creative-analyzer/scripts/obsidian_sync.py
```
"""


def render_daily_stub() -> str:
    now = datetime.now().strftime("%Y-%m-%d")
    return f"""---
date: {now}
---

# {now}

_Append notes here as Claude Code sessions produce them._
"""


def preserve_notes_section(existing: str) -> str:
    """Extract the `## Notes` section from an existing note, if any."""
    if not existing:
        return ""
    m = re.search(r"(## Notes\n[\s\S]*)", existing)
    if m:
        block = m.group(1).strip()
        # Drop the default placeholder
        if "_Add your notes here." in block and len(block) < 200:
            return ""
        return block
    return ""


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--vault", type=Path, default=DEFAULT_VAULT)
    ap.add_argument("--dry-run", action="store_true")
    args = ap.parse_args()

    vault: Path = args.vault.expanduser()
    projects = load_project_paths()
    print(f"▶ Obsidian sync — {len(projects)} projects → {vault}")

    if not args.dry_run:
        vault.mkdir(parents=True, exist_ok=True)
        (vault / "projects").mkdir(exist_ok=True)
        (vault / "topics").mkdir(exist_ok=True)
        (vault / "daily").mkdir(exist_ok=True)
        (vault / ".obsidian").mkdir(exist_ok=True)
        # minimal Obsidian config so the folder opens as a vault cleanly
        (vault / ".obsidian" / "app.json").write_text('{"attachmentFolderPath":"attachments"}\n')

    # Pass 1: compute topics per project
    project_topics: list[tuple[Path, list[str]]] = []
    topic_counts: dict[str, list[str]] = defaultdict(list)
    for proj in projects:
        topics = detect_topics(proj)
        project_topics.append((proj, topics))
        for t in topics:
            topic_counts[t].append(proj.name)

    # Pass 2: write project notes
    for proj, topics in project_topics:
        note_path = vault / "projects" / f"{proj.name}.md"
        new_body = render_project_note(proj, topics, topic_counts)
        # Preserve any hand-edited Notes section
        if note_path.exists():
            existing = note_path.read_text()
            preserved = preserve_notes_section(existing)
            if preserved:
                new_body = re.sub(r"## Notes[\s\S]*$", preserved, new_body)
        if args.dry_run:
            print(f"  would write {note_path.relative_to(vault)}")
        else:
            note_path.write_text(new_body)
            print(f"  📝 {note_path.relative_to(vault)}  ({', '.join(topics) or 'no topics'})")

    # Pass 3: write topic notes
    for topic, projs in topic_counts.items():
        tp = vault / "topics" / f"{topic}.md"
        if args.dry_run:
            continue
        tp.write_text(render_topic_note(topic, projs))
    print(f"  🏷  {len(topic_counts)} topic notes")

    # Pass 4: write root files
    if not args.dry_run:
        (vault / "index.md").write_text(render_index(project_topics, topic_counts))
        (vault / "CLAUDE.md").write_text(render_vault_claude_md())
        today = vault / "daily" / f"{datetime.now().strftime('%Y-%m-%d')}.md"
        if not today.exists():
            today.write_text(render_daily_stub())
        print(f"  ✓ index.md · CLAUDE.md · daily/{today.name}")

    print(f"\n✓ vault ready at {vault}")
    print(f"  → open in Obsidian: 'Open folder as vault' → {vault}")


if __name__ == "__main__":
    main()
