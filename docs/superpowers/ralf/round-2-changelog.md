# RALF Round 2 — Judge Synthesis

**Date**: 2026-04-19
**Input**: v1 design
**Critics**: Security/Privacy, Cost/Quality, Edge Cases/DST/i18n (parallel subagents)

---

## Vote tally

| # | Proposal | Lens | Decision |
|---|---|---|---|
| 1 | Token-gated findings + chat URLs (`digests.share_token`) | Security | **ACCEPT** — P0 security hole |
| 2 | Truncate/scrub audit_log payloads + 14-day TTL | Security | **ACCEPT** |
| 3 | `THEDI_ADMIN_TOKEN` env + `google_sub` allowlist | Security | **ACCEPT** |
| 4 | Cap critic iterations at 3, trim to (rank,title,angle), IonRouter prompt cache | Cost | **ACCEPT** — ~60% cost cut |
| 5 | Golden-set eval (30-item hand-scored, Spearman ρ) | Cost | **ACCEPT** — ships as `thedi_polish_now --eval` |
| 6 | `temperature=0` + fixed 4-axis 1–5 rubric + `score_breakdown` jsonb | Cost | **ACCEPT** — fixes rank instability |
| 7 | Instant welcome digest on first interests save | Edge | **ACCEPT** — fixes activation cliff |
| 8 | DST backfill (detect missed run by `delivery_hour + 2h`) + `dst_transition` audit row | Edge | **ACCEPT** |
| 9 | `urllib.parse.quote` keywords + sparse-day "quiet day" email template | Edge | **ACCEPT** |

## Nits folded in

- Resend: SPF+DKIM setup note added to SETUP.md (Security)
- Cap `interests.keywords` to 20/user; per-source calls to 3/user/run (Security)
- Per-user daily token ceiling in `audit_log` sum-check before critic loop (Security)
- Sparse niche fallback: include "best of last 3d undelivered" before flipping `deliverable=false` (Cost)
- Feedback extractor debounce: 1 call per 30s per user (Cost)
- `/admin/runs` reports `$ per user` via `SUM(tokens × rate)` (Cost)
- `DELETE /me` cascade by `user_id` (Edge)
- Cold-start critic prompt branches on empty feedback history (Edge)
- Edits-mid-polish deferred to tomorrow via `polish_started_at` lock (Edge)

## Rejected / deferred

None — all in-scope and cheap.

## Design doc updated to v2.
