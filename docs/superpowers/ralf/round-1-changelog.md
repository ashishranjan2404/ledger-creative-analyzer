# RALF Round 1 — Judge Synthesis

**Date**: 2026-04-19
**Input**: `/Users/mei/yoturi/docs/superpowers/specs/2026-04-19-thedi-design.md` v0
**Critics**: Product/UX, Engineering, Delivery/Ops (parallel, general-purpose subagents)

---

## K-threshold vote tally

| # | Proposal | Critics agreeing | Decision |
|---|---|---|---|
| 1 | Idempotency guard on cron (UNIQUE `user_id, run_date`, INSERT ... ON CONFLICT) | Eng (direct), Ops (adjacent via backfill) | **ACCEPT** |
| 2 | Failure/cost ceiling + kill-switch + delivery retry | Eng + Ops (both direct) | **ACCEPT** (merge) |
| 3 | Email subject = top finding's angle sentence | Product | **ACCEPT** — cheap, demo-visible |
| 4 | Feedback chat lands pre-filled + "more like/less like" email CTA | Product | **ACCEPT** — core differentiator |
| 5 | 30-second landing page with sample email screenshot | Product | **ACCEPT** — 0 backend, activation-critical |
| 6 | Replace naive URL liveness with well-formed + host allowlist | Eng | **ACCEPT** — obvious win, 20 min |
| 7 | `thedi_polish_now(user_id, dry_run)` admin endpoint | Ops | **ACCEPT** — cannot rehearse without it |
| 8 | `digests.deliverable` gate + global `kill_switch` + IonRouter timeouts | Ops | **ACCEPT** (merged with #2) |
| 9 | `GET /admin/runs?date=` observability read path | Ops | **ACCEPT** — 45 min, invisible regressions kill demo |

## Nits folded in (cheap + uncontroversial)

- Add `delivered_failed` to digest status enum
- `digests.delivery_attempts` int column (for retry bookkeeping)
- `findings UNIQUE(digest_id, url)`
- `feedback.extracted_prefs NOT NULL DEFAULT '{}'::jsonb`
- Denormalize `audit_log.user_id` for cheap cost queries
- Dashboard shows next scheduled send time in user's tz
- "Thedi" etymology one-line in email footer
- Sources ingest: 2-of-3 degradation, never fail whole run
- `run_missed_users(date)` admin backfill function
- `SETUP.md` with the 3 `update_function_env` commands

## Rejected / deferred

None this round — all proposals were in-scope and cheap.

## Design doc updated to v1.
