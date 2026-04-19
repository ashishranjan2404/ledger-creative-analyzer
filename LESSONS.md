# Lessons — Adlyze / Ledger Hackathon (2026-04-18)

This repository held the **Adlyze Ledger Creative Analyzer** project through the
MultiModel Hackathon on 2026-04-18. The code was archived afterwards to make
room for a new project (Yatori). The git history preserves every commit of the
original build — walk backwards from the archive commit to see the full
working system, or see §*Time-travel pointers* below.

This doc captures the non-code knowledge that shouldn't vanish with the code:
integration gotchas, architecture choices that paid off, process lessons, and
the hackathon playbook that kept us unstuck under time pressure.

---

## What Adlyze/Ledger was

Async FastAPI service that turned DTC ad creatives into morning-brief videos:

```
Alex's GraphRAG chat API ──▶ creative_analyzer.py ──▶ MAKER-voted VLM (n=5 Qwen3.5-122B / IonRouter)
                                                        │
                                                        ├─▶ Neo4j graph (features as HAS_FEATURE edges)
                                                        │
                                                        ├─▶ Seedance brief video (Sissi's generator)
                                                        │     || fallback to Cartesia TTS audio
                                                        │
                                                        ├─▶ HF dataset (public hosting for Photon)
                                                        │
                                                        └─▶ Photon iMessage to +16692426592

                                 every stage ticks in the Butterbase `jobs` row
```

Final deliverable: a 59s portrait video with Cartesia narration of GraphRAG insights
landing on Ashish's phone as a Photon iMessage attachment.

---

## Integration gotchas (each cost ~30+ minutes)

| Surprise | Lesson |
|---|---|
| **spectrum-ts has no HTTP API** — only a TypeScript SDK | Python had to shell out to Node. "SDK-only" libraries silently force language decisions. |
| **spectrum-ts `Space` is NOT `{id, type}`** — that was a plain parser; the one `send()` needs is returned by `imessage(app).space(user)` with live methods | Read the TypeScript source, don't trust README shapes. |
| **Photon Spectrum has a ~4 MB gRPC frame limit** | Not in any doc. 18 MB video → silent failure. Added compression step with `h264_videotoolbox`. Always assume a cap. |
| **Butterbase is a BaaS, not a Python host** | Their Edge Functions are TS-only. Python had to run on ngrok/localhost. Read the platform capability matrix before planning deploys. |
| **Butterbase DSL uses `primaryKey` not `primary`** | The MCP tool corrected it once; dry-run first next time. |
| **Butterbase schema defaults normalize at display** | `'pending'` becomes `pending` in `get_schema` output but applies correctly at INSERT. Don't panic at the display form. |
| **Seedance queues *indefinitely* when the account is suspended** | 180s of `queued` status before a single 403 appeared. Suspended accounts don't fail fast — monitor queue behavior, not just status codes. |
| **macOS ffmpeg typically ships without libx264** | Anaconda's ffmpeg is GPL-disabled. `h264_videotoolbox` is the reliable Apple Silicon fallback. |
| **Python directory `ledger-delivery/` (hyphen) blocks package imports** | Had to `sys.path.insert` everywhere. Name Python packages with underscores from day one. |
| **MCP servers load at session start only** | Adding a new server via `claude mcp add` doesn't populate already-running sessions. Restart needed. |
| **Alex's GraphRAG chat API returned full inference even for `content=y`** | Didn't need a carefully crafted question — the default dump was comprehensive. Probe forgiving APIs before over-engineering queries. |
| **`response_format={"type":"json_object"}` is undocumented in IonRouter** | OpenAI-compat isn't exhaustive. Drop the arg and let the prompt enforce JSON shape if the call fails with "unknown parameter". |
| **HF dataset URLs require the dataset be public** for Photon to fetch them unauthenticated | Private + signed URLs rot and complicate downstream delivery. Public dataset was the right trade. |

---

## Architecture choices that paid off

- **Async trigger + polling** (202 + Butterbase `jobs` row) ran circles around the original sync-JSON contract. Gave us retries, observability, and realtime dashboard for free.
- **Parallel fan-out with fallback priority** — firing Seedance and Cartesia concurrently and picking whichever finished with a valid asset kept the demo alive through a payment failure. Pay the extra Cartesia call every time; recover gracefully when the primary dies.
- **MAKER voting via `ThreadPoolExecutor`, not asyncio** — sync OpenAI client is the norm; threads give real parallelism without the asyncio tax. At n=5, latency ≈ 1× single-call.
- **Confidence-based tiebreaks everywhere** — both per-field ties and winner-sample ties used self-reported confidence. Weak signal but adequate for hackathon scale. Document the caveat.
- **Runtime alias (`SEED_DANCE_API_KEY` → `ARK_API_KEY`)** instead of `.env` rename — one line of Python saved back-and-forth with a teammate. Principle: when two surfaces disagree, bridge on your side.
- **Jobs-as-cache** — the filesystem cache was replaced entirely by the Butterbase `jobs` row. Retry path became trivial and the dashboard showed every historical run.
- **Mock-first demo path (`demo_mock_loop.py`)** — ready BEFORE the real path was needed. When BytePlus went overdue mid-hackathon, we were never stuck.
- **Raw per-sample VLM outputs logged to stdout, not DB** — the `vote_log` aggregate lived in Butterbase; full samples went to logs for post-demo forensic analysis. Kept DB rows small.

---

## Process lessons

- **Commit small and often** — 14+ commits in one afternoon. If any single step broke, rollback was one line. Watch the commit log in `git log --oneline` for the cadence.
- **Write `CLAUDE.md` + `ARCHITECTURE.md` as you go, not after** — this session died and restarted 10+ times; the docs made every resume free. "Documentation is a tax you pay once and collect every session."
- **Read source > guess API** — 20 min inside `node_modules/spectrum-ts/dist/` saved hours of API probing on the `Space.send()` puzzle.
- **Explicitly scope things OUT** — "no tests, no linter, no Docker, no type checker" was protective. Saved us from orchestrator suggestions that would have eaten the budget.
- **Verify secrets work BEFORE wiring 5 steps on top of them** — smoke test first; demo scripts last. The earliest-possible end-to-end (HF upload → Photon send) caught several integration issues before they blocked a demo.
- **Pre-warm every demo asset** — HF upload, Butterbase schema, video cache. The live demo then has zero API dependencies unless you intentionally want them.
- **Alias at runtime, don't rename at the source** — for env vars, file paths, directory names. Saves diplomatic overhead between teammates.
- **Auto-load secrets from dedicated files** (`.cartesia.env` in its own gitignored file) — keeps the main `.env` clean and makes key rotation surgical.
- **`retry_seedance.sh` pattern** — when a dependency is transiently broken, a bounded retry loop in the background lets the system auto-recover without a human in the loop. 18 attempts × 10min was fine for our case.

---

## Hackathon playbook (transferable)

- **Always have a no-dependency fallback path** (mock loop using cached intro + hardcoded samples).
- **Always have a credentials-rotation checklist** maintained as you integrate, not after.
- **Mark promo-code expiration dates in calendar the moment you sign up.** `BETAHACK418` = $20 credit on Butterbase Launch Plan ($19/mo), renews 5/18/2026. Easy to forget.
- **Log every outbound HTTP call with the request ID the vendor returned** (Seedance included one in its error, for instance). Makes cross-vendor root-cause debugging possible.
- **Compression step for anything crossing a delivery boundary** — 4 MB cap on Photon was a real invariant, not a one-off. Put the compressor in the sender helper, not in each demo script.

---

## What I'd do differently next time

- Put helpers in a `ledger_delivery/` package from day one (underscore), skip the `sys.path` dance.
- Design for async/202 contract on day 1 — we spent real effort migrating from sync, and async was always the right shape for a pipeline this multi-stage.
- Build the **compression-for-delivery step into the Photon sender helper itself**, not into each demo script. The 4 MB cap is a delivery-pipeline invariant, not a demo concern.
- Log **every outbound HTTP call with the request ID** returned by the vendor (Seedance, Cartesia, IonRouter all included them). Cross-vendor debugging gets dramatically easier.
- Split the repo into `service/` + `delivery/` + `demos/` from the start. Ended up with everything at root, which worked but made imports uglier.

---

## Key code patterns worth stealing

All deleted from the tree but preserved in git history up to commit `72bfa6e`:

| Pattern | Where it lived (pre-archive) |
|---|---|
| Robust chat-API parser (JSON-first, markdown bullet fallback, whole-text fallback) | `ledger-delivery/ledger_client.py::_extract_json_array` + `_parse_markdown_bullets` |
| ThreadPoolExecutor-based parallel VLM calls + MAKER voting | `creative_analyzer.py::call_vlm_parallel` + `maker_vote` |
| FastAPI BackgroundTasks + Butterbase job-tracked async pipeline | `creative_analyzer.py::run_pipeline` + `run_brief_delivery` |
| Parallel fan-out with fallback priority + timeout | `creative_analyzer.py::run_brief_delivery` (Seedance vs Cartesia) |
| Node subprocess shim for TS-only SDKs (photon-node) | `ledger-delivery/photon-node/send_imessage.mjs` + Python wrapper |
| Multi-encoder ffmpeg compression with fallback | `demo_olipop.py::compress_for_imessage` (videotoolbox → libopenh264) |
| Auto-load dedicated-file secrets at module import | `ledger-delivery/cartesia_client.py` top-of-module |

---

## Time-travel pointers

The full working codebase lives at:

- **Archive marker commit:** (the commit that introduced this file — the commit immediately before deleted everything)
- **Last fully-green state:** `72bfa6e` — Olipop hackathon demo committed
- **MAKER voting introduced:** `b2322b4`
- **Photon iMessage plumbing end-to-end verified:** `ae64724`
- **Butterbase `jobs` schema:** `43bbce0` (the JSON payload)
- **Initial scaffold:** `6dea625`

To recover a specific file: `git show <commit>:<path>` (e.g. `git show 72bfa6e:creative_analyzer.py`).
To browse the full old tree: `git checkout 72bfa6e` (then `git checkout main` to return).

---

## Services we integrated (and where to revoke)

| Service | Why it was used | Revoke URL / action |
|---|---|---|
| IonRouter / Cumulus | Qwen3.5-122B VLM for MAKER voting | Dashboard → API keys → revoke `IONROUTER_KEY` |
| Butterbase | `jobs` DB + storage + MCP | Console → billing → cancel Launch Plan subscription before 5/18/2026 |
| BytePlus Seedance (ModelArk) | Video generation (Sissi's briefs) | Clear overdue balance first, then revoke `ARK_API_KEY` |
| Cartesia | TTS narration fallback | Console → API keys → revoke key in `.cartesia.env` |
| Photon Spectrum | iMessage cloud delivery | `app.photon.codes` → revoke `PHOTON_API_KEY` |
| Neo4j Aura | Graph for `(:Creative)-[:HAS_FEATURE]` edges | Aura console → delete instance if paid; downgrade to Free if keeping |
| Hugging Face | Public dataset `quantranger/ledger-briefs` hosting brief videos | Delete dataset if removing demo videos; rotate `HF_TOKEN` in `~/.zshrc` |
