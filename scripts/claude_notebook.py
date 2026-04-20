#!/usr/bin/env python3
"""
claude-notebook — a NotebookLM-style preprocessor for Claude Code.

Indexes markdown + key code files across your tracked Claude Code projects
using SQLite FTS5 (pure keyword search) and reranks candidates via IonRouter
Qwen for semantic relevance.

No embedding model, no Ollama download — uses the IonRouter key already in .env.

Usage:
    python3 scripts/claude_notebook.py index              # build / refresh
    python3 scripts/claude_notebook.py ask "how is OAuth done?"
    python3 scripts/claude_notebook.py ask "IonRouter Qwen" --top 8 --no-rerank
    python3 scripts/claude_notebook.py list               # projects + counts
    python3 scripts/claude_notebook.py stats

Pipe into Claude Code:
    python3 scripts/claude_notebook.py ask "X" | claude

Architecture:
    1. Index: walk files, chunk (~900 chars), store in SQLite FTS5
    2. Ask: BM25 pulls top 30 candidates, then Qwen (IonRouter) reranks
       into top K with one-line reasoning per match
"""

from __future__ import annotations

import argparse
import hashlib
import json
import os
import re
import sqlite3
import sys
import time
from pathlib import Path

import httpx

HOME = Path.home()
DB_PATH = HOME / ".claude-notebook" / "index.db"

IONROUTER_URL = "https://api.ionrouter.io/v1/chat/completions"
RERANK_MODEL = os.environ.get("RERANK_MODEL", "qwen3.5-122b-a10b")
KEY = os.environ.get("IONROUTER_KEY") or os.environ.get("IONROUTER_API_KEY")

INCLUDE_EXT = {
    ".md", ".markdown", ".mdx",
    ".py", ".ts", ".tsx", ".js", ".jsx",
    ".go", ".rs", ".java", ".rb", ".c", ".h", ".cpp",
    ".sh", ".yml", ".yaml", ".toml", ".json", ".sql",
}
SKIP_DIR_NAMES = {
    "node_modules", ".git", "__pycache__", ".venv", "venv", "env",
    "dist", "build", ".next", ".nuxt", ".cache", "target", "out",
    "briefs", ".claude", ".secrets", "coverage",
    ".pytest_cache", ".mypy_cache", ".DS_Store",
}

CHUNK_CHARS = 900
CHUNK_OVERLAP = 120
MAX_FILE_BYTES = 80_000
CANDIDATE_LIMIT = 30  # BM25 candidates before rerank


# ---------------------------------------------------------------------------
# DB
# ---------------------------------------------------------------------------


def db_conn() -> sqlite3.Connection:
    DB_PATH.parent.mkdir(parents=True, exist_ok=True)
    c = sqlite3.connect(DB_PATH)
    c.execute("""
    CREATE TABLE IF NOT EXISTS files (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        project TEXT NOT NULL,
        path TEXT UNIQUE NOT NULL,
        file_hash TEXT NOT NULL,
        indexed_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )""")
    c.execute("""
    CREATE VIRTUAL TABLE IF NOT EXISTS chunks USING fts5(
        content,
        project UNINDEXED,
        path UNINDEXED,
        chunk_idx UNINDEXED,
        start_line UNINDEXED,
        end_line UNINDEXED,
        file_id UNINDEXED,
        tokenize = "porter unicode61 remove_diacritics 1"
    )""")
    c.commit()
    return c


# ---------------------------------------------------------------------------
# Walk + chunk
# ---------------------------------------------------------------------------


def iter_files(project_root: Path):
    for p in project_root.rglob("*"):
        if not p.is_file():
            continue
        if any(part in SKIP_DIR_NAMES for part in p.parts):
            continue
        if any(part.startswith(".") and part not in {".github", ".claude"} for part in p.parts):
            continue
        if p.suffix.lower() not in INCLUDE_EXT:
            continue
        try:
            if p.stat().st_size > MAX_FILE_BYTES:
                continue
        except OSError:
            continue
        yield p


def chunk_text(text: str) -> list[tuple[int, int, str]]:
    total = len(text)
    if total == 0:
        return []
    chunks = []
    pos = 0
    while pos < total:
        end = min(pos + CHUNK_CHARS, total)
        body = text[pos:end]
        start_line = text.count("\n", 0, pos) + 1
        end_line = text.count("\n", 0, end) + 1
        chunks.append((start_line, end_line, body))
        if end == total:
            break
        pos = end - CHUNK_OVERLAP
    return chunks


def file_sha(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()[:16]


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


# ---------------------------------------------------------------------------
# Commands
# ---------------------------------------------------------------------------


def cmd_index(args) -> None:
    projects = load_project_paths()
    print(f"▶ indexing {len(projects)} projects → {DB_PATH}")
    c = db_conn()

    n_files = n_chunks = n_skipped = 0
    for proj in projects:
        proj_name = proj.name
        files_in_proj = 0
        for fp in iter_files(proj):
            try:
                data = fp.read_bytes()
            except OSError:
                continue
            h = file_sha(data)

            existing = c.execute(
                "SELECT id, file_hash FROM files WHERE path=?", (str(fp),)
            ).fetchone()
            if existing and existing[1] == h:
                n_skipped += 1
                continue

            try:
                text = data.decode("utf-8", errors="replace")
            except Exception:
                continue

            # Upsert file record
            if existing:
                c.execute(
                    "DELETE FROM chunks WHERE file_id = ?", (existing[0],)
                )
                c.execute(
                    "UPDATE files SET file_hash=?, indexed_at=CURRENT_TIMESTAMP WHERE id=?",
                    (h, existing[0]),
                )
                file_id = existing[0]
            else:
                cur = c.execute(
                    "INSERT INTO files (project, path, file_hash) VALUES (?, ?, ?)",
                    (proj_name, str(fp), h),
                )
                file_id = cur.lastrowid

            chunks = chunk_text(text)
            for idx, (sl, el, body) in enumerate(chunks):
                c.execute(
                    """INSERT INTO chunks
                       (content, project, path, chunk_idx, start_line, end_line, file_id)
                       VALUES (?, ?, ?, ?, ?, ?, ?)""",
                    (body, proj_name, str(fp), idx, sl, el, file_id),
                )
                n_chunks += 1
            n_files += 1
            files_in_proj += 1
        if files_in_proj:
            print(f"  📁 {proj_name} · {files_in_proj} files")
        c.commit()

    print(f"\n✓ indexed {n_files} files ({n_chunks} chunks) · {n_skipped} unchanged")


def fts_escape(query: str) -> str:
    """Turn user query into a safe FTS5 expression."""
    tokens = re.findall(r"\w+", query)
    if not tokens:
        return '""'
    return " OR ".join(f'"{t}"' for t in tokens if len(t) > 1)


def bm25_candidates(c: sqlite3.Connection, query: str, limit: int) -> list[tuple]:
    fts_q = fts_escape(query)
    try:
        rows = c.execute(
            """SELECT project, path, start_line, end_line, content, bm25(chunks)
               FROM chunks WHERE chunks MATCH ? ORDER BY rank LIMIT ?""",
            (fts_q, limit),
        ).fetchall()
        return rows
    except sqlite3.OperationalError as e:
        print(f"  ⚠ FTS error: {e}", file=sys.stderr)
        return []


def llm_rerank(query: str, candidates: list[tuple], top: int) -> list[tuple[int, str]]:
    """Return [(candidate_index, reason), ...] for top-K."""
    if not KEY:
        print("  ⚠ IONROUTER_KEY not set — skipping rerank", file=sys.stderr)
        return [(i, "") for i in range(min(top, len(candidates)))]

    catalog = []
    for i, (proj, path, sl, el, content, _) in enumerate(candidates):
        catalog.append({
            "id": i,
            "project": proj,
            "path": Path(path).name,
            "snippet": content[:400],
        })

    system = f"""You are a code-search reranker. Given a user query and {len(candidates)} candidate chunks,
pick the top {top} most relevant and explain why in one phrase each.
Return STRICT JSON: {{"picks": [{{"id": int, "reason": "short why this matches"}}]}}
If none are relevant, return {{"picks": []}}."""
    user = f"QUERY: {query}\n\nCANDIDATES:\n{json.dumps(catalog, indent=1)}"

    try:
        with httpx.Client(timeout=60) as c:
            r = c.post(
                IONROUTER_URL,
                headers={"Authorization": f"Bearer {KEY}", "Content-Type": "application/json"},
                json={
                    "model": RERANK_MODEL,
                    "temperature": 0,
                    "max_tokens": 1200,
                    "response_format": {"type": "json_object"},
                    "messages": [
                        {"role": "system", "content": system},
                        {"role": "user", "content": user},
                    ],
                },
            )
        if r.status_code >= 400:
            print(f"  ⚠ rerank {r.status_code}: {r.text[:200]}", file=sys.stderr)
            return [(i, "") for i in range(min(top, len(candidates)))]
        data = json.loads(r.json()["choices"][0]["message"]["content"])
        return [(p["id"], p.get("reason", "")) for p in data.get("picks", [])][:top]
    except Exception as e:
        print(f"  ⚠ rerank failed: {e}", file=sys.stderr)
        return [(i, "") for i in range(min(top, len(candidates)))]


def cmd_ask(args) -> None:
    c = db_conn()
    t0 = time.time()

    candidates = bm25_candidates(c, args.query, CANDIDATE_LIMIT)
    bm25_ms = int((time.time() - t0) * 1000)

    if not candidates:
        print(f"# No matches for: {args.query!r}")
        return

    if args.no_rerank:
        ranked = [(i, "") for i in range(min(args.top, len(candidates)))]
        rr_ms = 0
    else:
        t1 = time.time()
        ranked = llm_rerank(args.query, candidates, args.top)
        rr_ms = int((time.time() - t1) * 1000)

    print(f"# Top {len(ranked)} matches for: {args.query!r}  (BM25 {bm25_ms}ms · rerank {rr_ms}ms · {len(candidates)} candidates)\n")

    for rank, (idx, reason) in enumerate(ranked, 1):
        if idx >= len(candidates):
            continue
        proj, path, sl, el, content, _ = candidates[idx]
        rel = Path(path)
        try:
            rel = rel.relative_to(HOME)
        except ValueError:
            pass
        print(f"## [{rank}] {proj}:{rel}:{sl}-{el}")
        if reason:
            print(f"*{reason}*")
        print()
        snippet = content if len(content) < 1200 else content[:1200] + "\n...[truncated]..."
        print(snippet.rstrip())
        print()
        print("---")
        print()


def cmd_list(args) -> None:
    c = db_conn()
    rows = c.execute(
        "SELECT project, COUNT(*) AS n, COUNT(DISTINCT path) AS f "
        "FROM chunks GROUP BY project ORDER BY n DESC"
    ).fetchall()
    total_c = sum(r[1] for r in rows)
    total_f = sum(r[2] for r in rows)
    print(f"{'PROJECT':<32} {'FILES':>8} {'CHUNKS':>8}")
    print("-" * 52)
    for proj, n, f in rows:
        print(f"{proj:<32} {f:>8} {n:>8}")
    print("-" * 52)
    print(f"{'TOTAL':<32} {total_f:>8} {total_c:>8}")


def cmd_stats(args) -> None:
    c = db_conn()
    total = c.execute("SELECT COUNT(*) FROM chunks").fetchone()[0]
    files = c.execute("SELECT COUNT(*) FROM files").fetchone()[0]
    projects = c.execute("SELECT COUNT(DISTINCT project) FROM chunks").fetchone()[0]
    size_mb = DB_PATH.stat().st_size / 1024 / 1024 if DB_PATH.exists() else 0
    print(f"DB: {DB_PATH}")
    print(f"  {projects} projects, {files} files, {total} chunks")
    print(f"  size: {size_mb:.1f} MB")
    print(f"  rerank model: {RERANK_MODEL} via {IONROUTER_URL}")


# ---------------------------------------------------------------------------


def main():
    # Auto-load .env if present
    env = Path(".env")
    if env.exists():
        for line in env.read_text().splitlines():
            if "=" in line and not line.startswith("#"):
                k, v = line.split("=", 1)
                os.environ.setdefault(k.strip(), v.strip())
        global KEY
        KEY = os.environ.get("IONROUTER_KEY") or os.environ.get("IONROUTER_API_KEY")

    ap = argparse.ArgumentParser(prog="claude-notebook")
    sub = ap.add_subparsers(dest="cmd", required=True)

    sp = sub.add_parser("index", help="Build/refresh the index")
    sp.set_defaults(func=cmd_index)

    sp = sub.add_parser("ask", help="Ask a question")
    sp.add_argument("query", nargs="+")
    sp.add_argument("--top", type=int, default=5)
    sp.add_argument("--no-rerank", action="store_true", help="Skip LLM rerank — pure BM25")
    sp.set_defaults(func=lambda a: cmd_ask(argparse.Namespace(
        query=" ".join(a.query), top=a.top, no_rerank=a.no_rerank
    )))

    sp = sub.add_parser("list", help="Show projects + counts")
    sp.set_defaults(func=cmd_list)

    sp = sub.add_parser("stats", help="DB stats")
    sp.set_defaults(func=cmd_stats)

    args = ap.parse_args()
    args.func(args)


if __name__ == "__main__":
    main()
