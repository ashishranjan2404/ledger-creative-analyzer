# scripts/

Three Python utilities that treat your Claude Code setup as a network, not an island.

| Script | Pattern | Purpose |
|---|---|---|
| `claude_notebook.py` | **NotebookLM-style preprocessor** | Indexes all your Claude Code projects; retrieves top-K citation-backed chunks on any question. Pipe into Claude Code for cross-project context. |
| `obsidian_sync.py` | **Obsidian second brain** | Generates/refreshes `~/Obsidian/claude-vault/` — one wiki-linked markdown note per project + per cross-cutting topic. Open in Obsidian as a navigable map of your work. |
| `ralf_loop.py` + `ralf_dedup.py` | **Refinement loop** | Iteratively improves any markdown doc via 5 parallel IonRouter critics + a judge that emits edit ops. De-dup pass consolidates stacked headers. |

---

## claude-notebook (NotebookLM pattern)

```bash
# First time: index everything (~3 min)
python3 scripts/claude_notebook.py index

# Ask anything across all projects
python3 scripts/claude_notebook.py ask "how is OAuth done"
python3 scripts/claude_notebook.py ask "ralph loop" --top 8
python3 scripts/claude_notebook.py ask "X" --no-rerank   # skip LLM, pure BM25

# Feed results into a new Claude Code session
python3 scripts/claude_notebook.py ask "how is OAuth done" | claude
```

**Under the hood**: SQLite FTS5 BM25 picks 30 keyword candidates (~10ms), then Qwen 3.5 via IonRouter reranks to top-K with one-line reasoning per match (~2.5s, ~$0.001). Incremental — only re-ingests changed files.

**Alias** for convenience:

```bash
echo "alias cn='python3 ~/ledger-creative-analyzer/scripts/claude_notebook.py'" >> ~/.zshrc
```

**DB**: `~/.claude-notebook/index.db` (~13 MB for 7,000 files)

---

## obsidian-sync (Obsidian second-brain pattern)

```bash
# Build or refresh the vault
python3 scripts/obsidian_sync.py

# Preview without writing
python3 scripts/obsidian_sync.py --dry-run

# Custom vault path
python3 scripts/obsidian_sync.py --vault ~/Dropbox/my-vault
```

**What it generates** at `~/Obsidian/claude-vault/`:

```
claude-vault/
├── CLAUDE.md          # navigation guide for Claude Code sessions
├── index.md           # landing page: all projects + all topics
├── projects/
│   ├── <name>.md      # one note per Claude Code project
│   └── ...            # frontmatter + description + topic links + key files
├── topics/
│   ├── butterbase.md  # cross-cutting tag → which projects use it
│   ├── ionrouter.md
│   └── ...
└── daily/
    └── YYYY-MM-DD.md  # append-only scratch pad
```

Open in Obsidian: **File → Open folder as vault → `~/Obsidian/claude-vault/`**. All wiki-links + tags work out of the box.

**Topics auto-detected** via keyword scan of each project's README/CLAUDE.md/package.json:
`agents`, `butterbase`, `claude-api`, `email-digest`, `hackathon`, `ionrouter`, `kubernetes`, `life-os`, `marriage`, `mcp`, `oauth`, `openai-api`, `python`, `rag`, `react`, `scout`, `typescript`, `voice`, plus more as keywords expand.

**Preserves** hand-edits in the `## Notes` section of each project note across re-syncs — add your own commentary below the heading and it survives regeneration.

---

## How they work together

```
                        ┌──────────────────────────┐
                        │   ~/.claude.json         │
                        │   (your 15 CC projects)  │
                        └──────────┬───────────────┘
                                   │
                ┌──────────────────┼──────────────────┐
                │                  │                  │
                ▼                  ▼                  ▼
        ┌──────────────┐   ┌──────────────┐   ┌──────────────┐
        │ obsidian_sync│   │claude_notebook│  │  ralf_loop   │
        │              │   │               │  │              │
        │  browsable   │   │  searchable   │  │  refinable   │
        │  + linked    │   │  + citation-  │  │  (on any doc)│
        │  markdown    │   │  backed       │  │              │
        │  vault       │   │  retrieval    │  │              │
        └──────┬───────┘   └───────┬───────┘  └──────┬───────┘
               │                   │                  │
               ▼                   ▼                  ▼
        Open in Obsidian    cn ask "X" | claude    Iterate docs
        (visual map)        (context-on-demand)    automatically
```

- **claude-notebook** = when you want a chunk of text to answer a question. Surgical.
- **obsidian-sync** = when you want to see the whole landscape of your work at a glance. Navigational.
- **ralf-loop** = when you want to iteratively improve a specific doc. Refinement.

They share no state and don't depend on each other — each is useful independently.

---

## ralf-loop (refinement pattern)

```bash
# Refine any markdown doc via 20 rounds of 5 IonRouter critics + 1 judge
export IONROUTER_KEY=sk-...
python3 scripts/ralf_loop.py docs/features/yutori-reference.md --max-iters 20

# Deduplicate stacked section headers from a prior RALF run
python3 scripts/ralf_dedup.py docs/features/yutori-reference.md
```

Per-round diffs land in `docs/ralf/<doc-stem>/iter-NN.diff`. Stops on 2 consecutive no-ops.

Pair with `docs/features/<stem>.urls.txt` — URLs listed there get pre-fetched once per run so critics have live web context.

---

## Setup

All three scripts need:

- Python 3.10+ with `httpx` (installed already: `pip install httpx python-dotenv`)
- `IONROUTER_KEY` in `.env` at repo root (loaded automatically)

The Obsidian vault and notebook DB live **outside** the repo:

- `~/.claude-notebook/` — notebook index
- `~/Obsidian/claude-vault/` — Obsidian vault

Neither is committed; re-generate on any machine by running the scripts.
