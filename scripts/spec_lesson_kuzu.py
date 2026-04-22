#!/usr/bin/env python3
"""
spec_lesson_kuzu.py — Build a Kuzu graph database of the spec-lesson project.

Graph is written to ~/Obsidian/claude-vault/.kuzu/spec-lesson.db/
Idempotent: wipes and rebuilds on every run.

Usage:
    python3 scripts/spec_lesson_kuzu.py
"""

import shutil
import subprocess
from datetime import date
from pathlib import Path

import kuzu

# ---------------------------------------------------------------------------
# Paths
# ---------------------------------------------------------------------------
VAULT_KUZU = Path.home() / "Obsidian" / "claude-vault" / ".kuzu"
DB_PATH = VAULT_KUZU / "spec-lesson.db"
REPO_ROOT = Path(__file__).parent.parent  # ledger-creative-analyzer/

# ---------------------------------------------------------------------------
# Static data
# ---------------------------------------------------------------------------
PROJECT = {
    "name": "spec-lesson",
    "repo": "ledger-creative-analyzer",
    "branch": "feat/spec-lesson",
    "started": date(2026, 4, 22),
}

FEATURES = [
    ("B", "Response suggestions",          2, "Pause-triggered candidate responses"),
    ("C", "Topic-drift nudge",             1, "HUD cue when conversation drifts"),
    ("D", "Polished Obsidian artifact",    4, "Session-close markdown"),
    ("E", "Claude Code context bridge",    3, "CLAUDE.md managed section"),
]

PLANS = [
    (1, "Core pipeline",                   "shipped"),
    (2, "Live audio capture",              "shipped"),
    (3, "HUD",                             "deferred"),
    (4, "/schedule cross-session roll-up", "deferred"),
]

# (bug_id, severity, summary, round, fix_sha, fix_subject)
BUGS_FIXES = [
    # Round 1 — all fixed in c79266a
    ("BUG-C-1",   "Critical",
     "asyncio.create_task from Deepgram pump thread silently fails", 1,
     "c79266a698589382d3f219301e84b51464c81197",
     "round1 — thread-safe ingest + safe_from_dict + polish shutdown guard"),
    ("BUG-E-1",   "Critical",
     "Utterance.from_dict KeyError crashes daemon", 1,
     "c79266a698589382d3f219301e84b51464c81197",
     "round1 — thread-safe ingest + safe_from_dict + polish shutdown guard"),
    ("ISSUE-E-4", "High",
     "Polish tier unbounded input risks 400 at shutdown", 1,
     "c79266a698589382d3f219301e84b51464c81197",
     "round1 — thread-safe ingest + safe_from_dict + polish shutdown guard"),
    # Round 2
    ("BUG-D-2",   "High",
     "Distillation.from_json splits strings into single chars", 2,
     "a230551fe28bb2a55007d7215ed885a4ea8c103a",
     "round2 — reject non-list distillation fields"),
    ("BUG-D-1",   "High",
     "Context tier cursor advanced post-await, skips utterances", 2,
     "85a426932830bf9009883c93f13a8495626874c4",
     "round2 — snapshot context tier cursor before LLM call"),
    ("BUG-D-3",   "Medium",
     "latest_timestamp returns last-appended not max", 2,
     "4bf231e68ad2f3021634949a6040858f030a3fe4",
     "round2 — out-of-order utterance timestamps"),
    ("BUG-D-6",   "Medium",
     "Trigger cooldown uses audio timestamp, breaks on reconnect", 2,
     "2e81f3f4c5549e925ceec2ca36d472335be33012",
     "round2 — wall-clock trigger cooldown"),
    ("BUG-D-8",   "Medium",
     "Polish tail-only truncation drops session brief", 2,
     "5e0a277121d430cc7f4945c0e5316d5d27292199",
     "round2 — head+tail polish truncation"),
    ("RES-1",     "Critical",
     "_on_shutdown no try/finally: transcript fh leaks", 2,
     "46012c85f9dcb19b704a27edd653acec9d0ad815",
     "round2 — transcript writer cleanup on shutdown exception"),
    ("RES-2",     "Critical",
     "_pause_watcher races with shutdown writes", 2,
     "46012c85f9dcb19b704a27edd653acec9d0ad815",
     "round2 — transcript writer cleanup on shutdown exception"),
    ("RES-8",     "High",
     "PID file non-atomic write: two startups silently overwrite", 2,
     "4bb159843fdaa32941ed15a2e944fbfc10de5b3c",
     "round2 — atomic PID file write"),
    ("RES-4",     "Medium",
     "PortAudio loopback handle leak on mic-start exception", 2,
     "6f77c93bdbca8dc11ab385f16b935ba1efaf764b",
     "round2 — portaudio loopback cleanup on mic-start failure"),
    # Round 3
    ("BUG-A-1",   "Critical",
     "Deepgram connect() is contextmanager, production was broken", 3,
     "f3f044ece274edd16da6744e8fb6f1a1ad39a702",
     "round3 — use contextmanager for Deepgram connect"),
    ("BUG-A-2",   "High",
     "Prompt cache never hit: cached blocks under 1024 token threshold", 3,
     "df80873fd862d77a104b488104c24d8f519491e3",
     "round3 — move system prompt into cached block"),
    ("BUG-A-3",   "High",
     "response.content[0].text crashes on empty or ThinkingBlock first", 3,
     "df80873fd862d77a104b488104c24d8f519491e3",
     "round3 — move system prompt into cached block"),
    ("BUG-A-4",   "Medium",
     "AsyncAnthropic default 600s timeout freezes asyncio loop", 3,
     "df80873fd862d77a104b488104c24d8f519491e3",
     "round3 — move system prompt into cached block"),
    ("SHUTDOWN-1","High",
     "Concurrent double-run of Context tier at 1.5h boundary", 3,
     "26c9a7cf3f40a5f2ca2694c78ce3a4f61099b5f2",
     "round3 — serialize concurrent Context tier runs"),
    ("SHUTDOWN-3","Low",
     "CLAUDE.md.tmp.* orphans in project root after SIGKILL", 3,
     "3e3123250160ac4903b6a3fbde712fc62b6bb73b",
     "round3 — gitignore CLAUDE.md tmp files"),
]

# Feature → files mapping
FEATURE_FILES = {
    "B": ["spec_lesson/tiers/immediate.py"],
    "C": ["spec_lesson/tiers/thread.py", "spec_lesson/orchestrator.py"],
    "D": ["spec_lesson/tiers/polish.py"],
    "E": ["spec_lesson/tiers/context.py", "spec_lesson/writer/claude_md.py"],
}

# Bug → files mapping (inferred from summaries + fix commit touched files)
BUG_FILES = {
    "BUG-C-1":   ["spec_lesson/orchestrator.py"],
    "BUG-E-1":   ["spec_lesson/transcript/utterance.py"],
    "ISSUE-E-4": ["spec_lesson/tiers/polish.py"],
    "BUG-D-2":   ["spec_lesson/tiers/base.py"],
    "BUG-D-1":   ["spec_lesson/tiers/context.py"],
    "BUG-D-3":   ["spec_lesson/transcript/buffer.py"],
    "BUG-D-6":   ["spec_lesson/trigger/detector.py"],
    "BUG-D-8":   ["spec_lesson/tiers/polish.py"],
    "RES-1":     ["spec_lesson/orchestrator.py"],
    "RES-2":     ["spec_lesson/orchestrator.py"],
    "RES-8":     ["spec_lesson/lifecycle.py"],
    "RES-4":     ["spec_lesson/capture/audio_input.py"],
    "BUG-A-1":   ["spec_lesson/capture/deepgram_stream.py"],
    "BUG-A-2":   ["spec_lesson/tiers/client.py"],
    "BUG-A-3":   ["spec_lesson/tiers/client.py"],
    "BUG-A-4":   ["spec_lesson/tiers/client.py"],
    "SHUTDOWN-1":["spec_lesson/tiers/context.py"],
    "SHUTDOWN-3":["spec_lesson/writer/claude_md.py"],
}

# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def run_git(args: list[str]) -> str:
    result = subprocess.run(
        ["git"] + args,
        cwd=REPO_ROOT,
        capture_output=True,
        text=True,
        check=True,
    )
    return result.stdout.strip()


def get_files_for_commit(sha: str) -> list[str]:
    """Return the list of project files touched by a commit."""
    out = run_git(["show", "--name-only", "--format=", sha])
    return [
        p for p in out.splitlines()
        if p and (p.startswith("spec_lesson/") or p.startswith("tests/"))
    ]


def escape_str(s: str) -> str:
    """Escape single quotes for inline Cypher string literals."""
    return s.replace("\\", "\\\\").replace("'", "\\'")

# ---------------------------------------------------------------------------
# Build
# ---------------------------------------------------------------------------

def build_graph():
    # -- Wipe existing DB (Kuzu creates a directory; guard against stale files too)
    if DB_PATH.exists():
        if DB_PATH.is_dir():
            shutil.rmtree(DB_PATH)
        else:
            DB_PATH.unlink()
    VAULT_KUZU.mkdir(parents=True, exist_ok=True)

    db = kuzu.Database(str(DB_PATH))
    conn = kuzu.Connection(db)

    # ------------------------------------------------------------------ Schema
    print("Creating schema...")
    schema_stmts = [
        "CREATE NODE TABLE Project(name STRING PRIMARY KEY, repo STRING, branch STRING, started DATE)",
        "CREATE NODE TABLE Feature(code STRING PRIMARY KEY, name STRING, priority INT64, descr STRING)",
        "CREATE NODE TABLE Plan(number INT64 PRIMARY KEY, title STRING, status STRING)",
        "CREATE NODE TABLE Bug(id STRING PRIMARY KEY, severity STRING, summary STRING, round INT64)",
        "CREATE NODE TABLE Fix(sha STRING PRIMARY KEY, subject STRING, round INT64)",
        "CREATE NODE TABLE File(path STRING PRIMARY KEY, kind STRING)",
        "CREATE NODE TABLE Commit(sha STRING PRIMARY KEY, subject STRING, message STRING)",
        "CREATE REL TABLE PROJECT_HAS_FEATURE(FROM Project TO Feature)",
        "CREATE REL TABLE PROJECT_HAS_PLAN(FROM Project TO Plan)",
        "CREATE REL TABLE FEATURE_IMPLEMENTED_IN(FROM Feature TO File)",
        "CREATE REL TABLE PLAN_PRODUCES_COMMIT(FROM Plan TO Commit)",
        "CREATE REL TABLE BUG_FOUND_IN(FROM Bug TO File)",
        "CREATE REL TABLE FIX_ADDRESSES(FROM Fix TO Bug)",
        "CREATE REL TABLE FIX_IS_COMMIT(FROM Fix TO Commit)",
        "CREATE REL TABLE FIX_TOUCHES(FROM Fix TO File)",
        "CREATE REL TABLE COMMIT_TOUCHES(FROM Commit TO File)",
    ]
    for stmt in schema_stmts:
        conn.execute(stmt)

    # ------------------------------------------------------------------ Nodes: Project
    print("Inserting Project...")
    conn.execute(
        "CREATE (:Project {name: $name, repo: $repo, branch: $branch, started: date($started)})",
        {
            "name": PROJECT["name"],
            "repo": PROJECT["repo"],
            "branch": PROJECT["branch"],
            "started": str(PROJECT["started"]),
        },
    )

    # ------------------------------------------------------------------ Nodes: Features
    print("Inserting Features...")
    for code, name, priority, desc in FEATURES:
        conn.execute(
            "CREATE (:Feature {code: $code, name: $name, priority: $priority, descr: $dval})",
            {"code": code, "name": name, "priority": priority, "dval": desc},
        )

    # ------------------------------------------------------------------ Nodes: Plans
    print("Inserting Plans...")
    for number, title, status in PLANS:
        conn.execute(
            "CREATE (:Plan {number: $number, title: $title, status: $status})",
            {"number": number, "title": title, "status": status},
        )

    # ------------------------------------------------------------------ Nodes: Files
    print("Collecting files from git ls-files...")
    ls_out = run_git(["ls-files", "spec_lesson/", "tests/"])
    all_files: list[tuple[str, str]] = []
    for path in ls_out.splitlines():
        if not path:
            continue
        kind = "source" if path.startswith("spec_lesson/") else "test"
        all_files.append((path, kind))

    print(f"  {len(all_files)} files found")
    known_files: set[str] = set()
    for path, kind in all_files:
        conn.execute(
            "CREATE (:File {path: $path, kind: $kind})",
            {"path": path, "kind": kind},
        )
        known_files.add(path)

    # ------------------------------------------------------------------ Nodes: Commits
    print("Collecting commits from git log...")
    log_out = run_git(["log", "--format=%H|%s", "9ac2d40^..HEAD"])
    commits: list[tuple[str, str]] = []
    for line in log_out.splitlines():
        if not line:
            continue
        sha, subject = line.split("|", 1)
        commits.append((sha, subject))

    print(f"  {len(commits)} commits found")
    commit_shas: set[str] = set()
    for sha, subject in commits:
        conn.execute(
            "CREATE (:Commit {sha: $sha, subject: $subject, message: $subject})",
            {"sha": sha, "subject": subject},
        )
        commit_shas.add(sha)

    # ------------------------------------------------------------------ Nodes: Bugs + Fixes
    print("Inserting Bugs and Fixes...")
    # deduplicate Fix nodes by sha (multiple bugs can share a fix commit)
    inserted_fixes: set[str] = set()

    for row in BUGS_FIXES:
        bug_id, severity, summary, rnd, fix_sha, fix_subject = row
        conn.execute(
            "CREATE (:Bug {id: $id, severity: $severity, summary: $summary, round: $round})",
            {"id": bug_id, "severity": severity, "summary": summary, "round": rnd},
        )
        if fix_sha not in inserted_fixes:
            conn.execute(
                "CREATE (:Fix {sha: $sha, subject: $subject, round: $round})",
                {"sha": fix_sha, "subject": fix_subject, "round": rnd},
            )
            inserted_fixes.add(fix_sha)

    # ------------------------------------------------------------------ Edges: PROJECT_HAS_FEATURE
    print("Creating PROJECT_HAS_FEATURE edges...")
    for code, *_ in FEATURES:
        conn.execute(
            "MATCH (p:Project {name: 'spec-lesson'}), (f:Feature {code: $code}) "
            "CREATE (p)-[:PROJECT_HAS_FEATURE]->(f)",
            {"code": code},
        )

    # ------------------------------------------------------------------ Edges: PROJECT_HAS_PLAN
    print("Creating PROJECT_HAS_PLAN edges...")
    for number, *_ in PLANS:
        conn.execute(
            "MATCH (p:Project {name: 'spec-lesson'}), (pl:Plan {number: $number}) "
            "CREATE (p)-[:PROJECT_HAS_PLAN]->(pl)",
            {"number": number},
        )

    # ------------------------------------------------------------------ Edges: FEATURE_IMPLEMENTED_IN
    print("Creating FEATURE_IMPLEMENTED_IN edges...")
    for code, file_list in FEATURE_FILES.items():
        for fpath in file_list:
            if fpath in known_files:
                conn.execute(
                    "MATCH (feat:Feature {code: $code}), (fi:File {path: $path}) "
                    "CREATE (feat)-[:FEATURE_IMPLEMENTED_IN]->(fi)",
                    {"code": code, "path": fpath},
                )

    # ------------------------------------------------------------------ Edges: BUG_FOUND_IN
    print("Creating BUG_FOUND_IN edges...")
    for bug_id, file_list in BUG_FILES.items():
        for fpath in file_list:
            if fpath in known_files:
                conn.execute(
                    "MATCH (b:Bug {id: $id}), (fi:File {path: $path}) "
                    "CREATE (b)-[:BUG_FOUND_IN]->(fi)",
                    {"id": bug_id, "path": fpath},
                )

    # ------------------------------------------------------------------ Edges: FIX_ADDRESSES + FIX_IS_COMMIT
    print("Creating FIX_ADDRESSES and FIX_IS_COMMIT edges...")
    linked_fix_commits: set[str] = set()
    for bug_id, _sev, _sum, _rnd, fix_sha, _subj in BUGS_FIXES:
        conn.execute(
            "MATCH (f:Fix {sha: $sha}), (b:Bug {id: $id}) "
            "CREATE (f)-[:FIX_ADDRESSES]->(b)",
            {"sha": fix_sha, "id": bug_id},
        )
        if fix_sha in commit_shas and fix_sha not in linked_fix_commits:
            conn.execute(
                "MATCH (f:Fix {sha: $sha}), (c:Commit {sha: $sha}) "
                "CREATE (f)-[:FIX_IS_COMMIT]->(c)",
                {"sha": fix_sha},
            )
            linked_fix_commits.add(fix_sha)

    # ------------------------------------------------------------------ Edges: FIX_TOUCHES
    print("Creating FIX_TOUCHES edges...")
    for fix_sha in inserted_fixes:
        touched = get_files_for_commit(fix_sha)
        for fpath in touched:
            if fpath in known_files:
                conn.execute(
                    "MATCH (f:Fix {sha: $sha}), (fi:File {path: $path}) "
                    "CREATE (f)-[:FIX_TOUCHES]->(fi)",
                    {"sha": fix_sha, "path": fpath},
                )

    # ------------------------------------------------------------------ Edges: COMMIT_TOUCHES
    print("Creating COMMIT_TOUCHES edges...")

    # Map abbreviated sha to full sha for plan linking
    plan_commit_keywords = {
        1: "Core pipeline",  # We'll link plan→commit by subject text
        2: "Plan 2",
    }

    # Determine which commits belong to which plan (heuristic: plan docs)
    # Plan 1 = all feat/fix commits before Plan 2 doc commit (4d03ded)
    # Plan 2 = all feat/fix commits after 4d03ded
    plan2_doc_sha = "4d03dedb72d4546a5c81d249aa921d84ae77d074"
    plan2_doc_idx = next(
        (i for i, (sha, _) in enumerate(commits) if sha == plan2_doc_sha), None
    )

    commit_to_plan: dict[str, int] = {}
    if plan2_doc_idx is not None:
        # commits list is newest-first; indices > plan2_doc_idx are older (Plan 1)
        for i, (sha, _) in enumerate(commits):
            if i > plan2_doc_idx:
                commit_to_plan[sha] = 1
            else:
                commit_to_plan[sha] = 2

    for sha, subject in commits:
        touched = get_files_for_commit(sha)
        for fpath in touched:
            if fpath in known_files:
                conn.execute(
                    "MATCH (c:Commit {sha: $sha}), (fi:File {path: $path}) "
                    "CREATE (c)-[:COMMIT_TOUCHES]->(fi)",
                    {"sha": sha, "path": fpath},
                )

    # ------------------------------------------------------------------ Edges: PLAN_PRODUCES_COMMIT
    print("Creating PLAN_PRODUCES_COMMIT edges...")
    for sha, plan_num in commit_to_plan.items():
        if sha in commit_shas and plan_num in (1, 2):
            conn.execute(
                "MATCH (pl:Plan {number: $number}), (c:Commit {sha: $sha}) "
                "CREATE (pl)-[:PLAN_PRODUCES_COMMIT]->(c)",
                {"number": plan_num, "sha": sha},
            )

    print("\nGraph build complete.")
    print(f"Database at: {DB_PATH}\n")
    return conn


# ---------------------------------------------------------------------------
# Verification queries
# ---------------------------------------------------------------------------

def run_verification(conn):
    print("=" * 60)
    print("VERIFICATION QUERIES")
    print("=" * 60)

    # 1. Count nodes by label
    print("\n--- Node counts ---")
    result = conn.execute(
        "MATCH (n) RETURN label(n) AS kind, count(n) AS cnt ORDER BY cnt DESC"
    )
    while result.has_next():
        row = result.get_next()
        print(f"  {row[0]:<20} {row[1]}")

    # 2. Critical bugs and commits that fixed them
    print("\n--- Critical bugs and their fix commits ---")
    result = conn.execute(
        "MATCH (b:Bug)<-[:FIX_ADDRESSES]-(f:Fix)-[:FIX_IS_COMMIT]->(c:Commit) "
        "WHERE b.severity = 'Critical' "
        "RETURN b.id, b.summary, f.sha, c.subject "
        "ORDER BY b.round"
    )
    while result.has_next():
        row = result.get_next()
        bug_id, summary, sha, subject = row
        print(f"  [{bug_id}] {summary[:50]}...")
        print(f"    fix: {sha[:10]}  {subject[:60]}")

    # 3. Files with the most bugs
    print("\n--- Files with most bugs ---")
    result = conn.execute(
        "MATCH (b:Bug)-[:BUG_FOUND_IN]->(f:File) "
        "RETURN f.path, count(b) AS bug_count "
        "ORDER BY bug_count DESC LIMIT 5"
    )
    while result.has_next():
        row = result.get_next()
        print(f"  {row[1]:>3}  {row[0]}")

    # 4. Bonus: Features and their implementing files
    print("\n--- Feature → implementing files ---")
    result = conn.execute(
        "MATCH (feat:Feature)-[:FEATURE_IMPLEMENTED_IN]->(fi:File) "
        "RETURN feat.code, feat.name, fi.path "
        "ORDER BY feat.priority"
    )
    while result.has_next():
        row = result.get_next()
        print(f"  [{row[0]}] {row[1]:<35}  {row[2]}")

    print("\n" + "=" * 60)


# ---------------------------------------------------------------------------
# README
# ---------------------------------------------------------------------------

README = """\
# spec-lesson Kuzu graph DB

Database directory: `spec-lesson.db/` (Kuzu stores its files in a directory, not a single file)

## Connect and query

```python
import kuzu
from pathlib import Path

DB_PATH = Path.home() / "Obsidian" / "claude-vault" / ".kuzu" / "spec-lesson.db"
db = kuzu.Database(str(DB_PATH))
conn = kuzu.Connection(db)

result = conn.execute("MATCH (n) RETURN label(n) AS kind, count(n) AS cnt")
while result.has_next():
    print(result.get_next())
```

## Schema

### Node tables

| Table   | Primary key | Key fields                          |
|---------|-------------|-------------------------------------|
| Project | name        | repo, branch, started (DATE)        |
| Feature | code        | name, priority (INT), descr         |
| Plan    | number      | title, status                       |
| Bug     | id          | severity, summary, round (INT)      |
| Fix     | sha         | subject, round (INT)                |
| File    | path        | kind ("source" or "test")           |
| Commit  | sha         | subject, message                    |

### Relationship tables

| Edge                  | From    | To      |
|-----------------------|---------|---------|
| PROJECT_HAS_FEATURE   | Project | Feature |
| PROJECT_HAS_PLAN      | Project | Plan    |
| FEATURE_IMPLEMENTED_IN| Feature | File    |
| PLAN_PRODUCES_COMMIT  | Plan    | Commit  |
| BUG_FOUND_IN          | Bug     | File    |
| FIX_ADDRESSES         | Fix     | Bug     |
| FIX_IS_COMMIT         | Fix     | Commit  |
| FIX_TOUCHES           | Fix     | File    |
| COMMIT_TOUCHES        | Commit  | File    |

## Example queries

```cypher
-- All critical bugs and their fix commits
MATCH (b:Bug)<-[:FIX_ADDRESSES]-(f:Fix)-[:FIX_IS_COMMIT]->(c:Commit)
WHERE b.severity = 'Critical'
RETURN b.id, b.summary, f.sha, c.subject

-- Files with the most bugs
MATCH (b:Bug)-[:BUG_FOUND_IN]->(f:File)
RETURN f.path, count(b) AS bug_count ORDER BY bug_count DESC LIMIT 5

-- Features and their source files
MATCH (feat:Feature)-[:FEATURE_IMPLEMENTED_IN]->(fi:File {kind: 'source'})
RETURN feat.code, feat.name, fi.path ORDER BY feat.priority

-- All commits that touched a given file
MATCH (c:Commit)-[:COMMIT_TOUCHES]->(fi:File {path: 'spec_lesson/tiers/context.py'})
RETURN c.sha, c.subject ORDER BY c.subject

-- Fixes that touch the most files
MATCH (f:Fix)-[:FIX_TOUCHES]->(fi:File)
RETURN f.sha, f.subject, count(fi) AS file_count ORDER BY file_count DESC
```

## Rebuild

```bash
cd ~/ledger-creative-analyzer
source .venv/bin/activate
python3 scripts/spec_lesson_kuzu.py
```

The script is idempotent — it wipes spec-lesson.db and rebuilds from scratch each run.
"""


def write_readme():
    readme_path = VAULT_KUZU / "README.md"
    readme_path.write_text(README)
    print(f"README written to {readme_path}")


# ---------------------------------------------------------------------------
# Main
# ---------------------------------------------------------------------------

if __name__ == "__main__":
    conn = build_graph()
    run_verification(conn)
    write_readme()
