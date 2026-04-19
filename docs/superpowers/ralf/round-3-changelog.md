# RALF Round 3 — Judge Synthesis (final round)

**Date**: 2026-04-19
**Input**: v2 design
**Critics**: YAGNI/Simplicity, Demo Narrative, Butterbase Feasibility (parallel subagents)

---

## This round was load-bearing — 3 proposals reshape the architecture

| # | Proposal | Lens | Decision |
|---|---|---|---|
| 1 | **Collapse critic loop to 1 pass; swap Sonnet→Haiku critic** | YAGNI | **ACCEPT** — cuts ~65% LLM spend; 1 pass still demo-visible |
| 2 | **Drop `rate_limits` table + `golden_set` eval + `config` table** | YAGNI | **ACCEPT** — replace with env vars + eyeballed rehearsals |
| 3 | **Collapse 9 tables → 6** (fold `critiques` into `digests.critique_text`, drop `config`, drop `rate_limits`) | YAGNI | **ACCEPT** |
| 4 | **Pre-run at T-10min; demo opens on phone lockscreen mockup showing push notif** | Demo | **ACCEPT** — opening punch |
| 5 | **`/admin/runs/<digest_id>/replay` page streams critic text + rank diff** | Demo | **ACCEPT** — makes the MAKER loop visible |
| 6 | **"Preview tomorrow's re-rank" button in feedback chat (live refiner re-call)** | Demo | **ACCEPT** — closes the feedback loop inside the 3-min window |
| 7 | **Split polish into step-functions keyed by `digests.status`; each step ≤5 min; polling cron drives** | Feasibility | **ACCEPT (P0)** — 15–30 min monolith can't run on Butterbase (5-min function cap) |
| 8 | **SPA (Vite/React, one zip to Cloudflare Pages) + `/f/:token` client route → JSON from function** | Feasibility | **ACCEPT (P0)** — Butterbase frontend is zip-deploy, not per-digest HTML |
| 9 | **Enable RLS + `user_isolation_policy`; user-write paths go through HTTP functions using `ctx.db.asUser(ctx.user.id)`; cron stays service-role** | Feasibility | **ACCEPT (P0)** — cron bypasses RLS by default |

## Nits folded in

- `UNIQUE(user_id, run_date)` declared in `indexes`, not column prop (Butterbase DSL)
- `share_token` generated app-side (Python `secrets.token_urlsafe(32)`), not DB-side `gen_random_bytes`
- Drop `score_breakdown` per-axis down to single `score` float — replay page still works off ranks (YAGNI accepted)
- Drop `dry_run` and `eval` flags on `thedi_polish_now`; keep only `no_wait` (YAGNI)
- Remove sparse-day email template — fail loud on `item_count < 5` during MVP (YAGNI)
- Tamil etymology moves to first email paragraph, not footer (Demo)
- Seed user's angle should be specific ("KV-cache quantization for on-device LLMs") for spicy subject line (Demo)
- Pre-recorded 15s fallback video of email arrival — insurance (Demo)
- Butterbase AI gateway is OpenAI-compatible + BYOK OpenRouter — can replace IonRouter; verify prompt-cache header passthrough (Feasibility)
- `audit_log` TTL sweep runs as a daily cron function (no DB triggers on Butterbase) (Feasibility)

## Rejected / deferred

- **`score_breakdown` jsonb per-axis 1–5 (added in v2)** — reverted to single `score` float. Replay page uses rank changes, not score breakdowns.

## Design updated to v3 (final).
