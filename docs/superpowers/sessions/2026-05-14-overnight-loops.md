# Earnings Scout — Overnight Improvement Loops

**Started:** 2026-05-14
**Branch:** `feat/earnings-improvements` (off `feat/spec-lesson` after earnings baseline commit `e7e6f35`)
**Baseline:** 300/300 tests passing, tsc clean
**Target:** ~50 ralph loops, halt-on-5-consecutive-failures
**Adapted pattern** (compressed for overnight wall-time):
- 1 Opus coder (implements + tests)
- 1 Sonnet reviewer (per `feedback_ralph_loop_code_review.md`)
- Verify (tsc + tests)
- If reviewer flags blocker: 1 fixer (Opus) → re-verify
- Commit per loop with task # in message
- Trivial tasks (renames, formatting): skip reviewer

**Ground rules:**
- Tests must stay green; failing-test commits get reverted
- Halt if 5 consecutive loops fail
- Each loop ≤ 25 min wall-time; abort + log if longer

---

## Plan: 50 Tasks

### Tier A: Open follow-ups (1–15) — from wiki, concrete items

| # | Task | Type |
|---|---|---|
| 1 | Wire free-source adapters into `deepdive.ts` L8 (replace Quiver gate) | standard |
| 2 | Wire free-source adapters into `event_poll.ts` (replace Quiver gate) | standard |
| 3 | Fix `edgar_xbrl.ts:71` — thread `endpoint` param through `tickerToCik` call | trivial |
| 4 | Fix `feedOverride` CIK padding bug in `edgar_form4.test.ts` | trivial |
| 5 | Wire `notable13F` prior-quarter diff in `event_poll.ts` (currently fetched but unused) | standard |
| 6 | Verify Coatue/Greenlight/Baupost CIKs against EDGAR submissions endpoint | standard |
| 7 | Refactor `deepdive.ts` to ≤160 lines (currently 161) | trivial |
| 8 | Add test for email-failure findings-insert path (T10 follow-up) | trivial |
| 9 | Rename `QuiverSignal` type → `GovCapitalSignal` (post-swap cleanup) | trivial |
| 10 | Wire L5 current price/shares feed via Finnhub `/quote` | standard |
| 11 | Wire `earnings_snapshot` caching for L1 fundamentals (avoid re-fetching weekly) | standard |
| 12 | Audit `audit_log` step labels for consistency across 3 routines | trivial |
| 13 | Extract shared `readEnv` helper into `_env.ts` (used by all 3 routines) | trivial |
| 14 | Extract shared `FROM` constant into `_email.ts` | trivial |
| 15 | Consolidate date parsing into single helper `_parsing.ts:parseGoodDate` | standard |

### Tier B: Source hardening (16–30)

| # | Task | Type |
|---|---|---|
| 16 | Add exponential backoff for Finnhub 429s (60/min limit) | standard |
| 17 | Add exponential backoff for Polygon 429s | standard |
| 18 | Add exponential backoff for SEC EDGAR 429s | standard |
| 19 | Add exponential backoff for Benzinga 429s | standard |
| 20 | Add per-source timeout config in `_http.ts` | trivial |
| 21 | Add circuit breaker per source after 5 consecutive failures | standard |
| 22 | Add accept-encoding gzip to `_http.ts` (big payloads: XBRL, USAspending) | trivial |
| 23 | Add LDA filings pagination (current code only reads page 1) | standard |
| 24 | Add USAspending pagination (current limit=20, may miss bulk awards) | standard |
| 25 | Add Yahoo RSS retry on transient parse errors | trivial |
| 26 | Add StockTwits backoff on 429 | trivial |
| 27 | Add ApeWisdom backoff on errors | trivial |
| 28 | Add congress_disclosure fallback if jeremiak repo 404s | standard |
| 29 | Add `_http.fetchJson` retry-once on transient network errors | standard |
| 30 | Audit all HTTP calls for User-Agent compliance (SEC needs identifying UA) | trivial |

### Tier C: Layer enhancements (31–40)

| # | Task | Type |
|---|---|---|
| 31 | L1: Add YoY growth markers (▲/▼) in sparkline rendering | standard |
| 32 | L3: Add Tiger Global, Lone Pine, Pershing Square to `NOTABLE_FUNDS` (with CIK verification) | standard |
| 33 | L3: Add Capital Group, T Rowe Price to `NOTABLE_FUNDS` (with CIK verification) | standard |
| 34 | L5: Add P/B ratio to valuation context | standard |
| 35 | L5: Add EV/Sales metric (alt to EV/EBITDA for unprofitable companies) | standard |
| 36 | L5: Add forward EPS estimate vs prior year | standard |
| 37 | L7: Add per-ticker patent grant trend (USPTO public API) | standard |
| 38 | Add `congressional` alert filter: leadership / committee chairs only (signal-to-noise) | standard |
| 39 | Add L8 sub-section: SEC enforcement actions (recent filings filter) | standard |
| 40 | Add per-layer fetch latency to `audit_log` notes | trivial |

### Tier D: Test coverage (41–50)

| # | Task | Type |
|---|---|---|
| 41 | Property-based test for `rotateCards` (ISO week math, all bucket sizes) | standard |
| 42 | Property-based test for `detectFroth` (z-score math) | standard |
| 43 | E2E snapshot test for `render_tactical` output | standard |
| 44 | E2E snapshot test for `render_deepdive` output (golden file) | standard |
| 45 | E2E snapshot test for `render_alert` output (per AlertType) | standard |
| 46 | Fuzz test for date parsing across all sources (PullPush ISO, LDA YYYY, etc.) | standard |
| 47 | Fuzz test for amount string parsing (Quiver "$1,001 - $15,000" etc.) | standard |
| 48 | Integration test: full deepdive flow with all sources mocked | complex |
| 49 | Integration test: full event_poll flow with EDGAR mocked | complex |
| 50 | Regression test for 8 historical bugs from original 30 loops (per wiki) | complex |

---

## Progress Log

| # | Status | Commit | Notes |
|---|---|---|---|
| 1 | ✅ | `8531d97` | Quiver→free swap in deepdive.ts. Reviewer 🟢. 300/300 tests. |

Each row appended after loop completion.

---

## Halt log

(populated only if 5 consecutive failures trigger halt)

## Descoped loops (intentional, with rationale)

- **Loop 38** (congressional leadership filter): static allowlist of leadership / committee chairs rots with every new Congress. The right trigger is live signal-to-noise data, which we don't have. Updated routine prompt md.
- **Loop 39** (SEC enforcement actions): watchlist is all mega-cap (Apple/Microsoft/Google/Amazon/NVDA/Meta/AMD/Tesla). AAER + Litigation Release frequency against this cohort is ~1-2/year — near-zero signal per weekly digest. Would add an RSS adapter + filter logic for <1 alert/month. Reconsider only if watchlist expands to mid/small caps where enforcement targets are realistic.

---

## Morning Action Items

- Review log table for failed loops, decide retry-or-skip
- Run full test suite: `cd scripts/earnings && npx tsc --noEmit && node --test --experimental-strip-types __tests__/*.test.ts`
- Decide deploy strategy: push to GitHub + `/schedule`, OR run from local cron
- For `/schedule`: paste `routines/tactical.prompt.md`, `routines/deepdive.prompt.md`, `routines/event_poll.prompt.md`
