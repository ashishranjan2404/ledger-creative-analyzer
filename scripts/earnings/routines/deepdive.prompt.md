# Thedi deep-dive Routine

Weekly Sunday 08:00 PT deep-dive that fetches L1 fundamentals (8q sparklines), L5 valuation context, L4 narrative shift (transcript-vs-prior-quarter, LLM-assisted), L6 operational velocity (GitHub) and L7 secular trend (arxiv + HN) per ticker, emails a per-ticker card digest to the personal recipient, and persists an `audit_log` row to Butterbase.

## Schedule

Cron: `0 8 * * 0` in `America/Los_Angeles` (Sunday 08:00 Pacific).

## Repo

`ledger-creative-analyzer` (this repo). Branch: `main`.

## Required env vars

The 3 hard-required vars must be present. `readEnv` aggregates and throws once with EVERY missing var named (e.g. `missing env var(s): RESEND_KEY`), so a half-configured cron is fixed in one edit. EDGAR/arxiv/HN/GitHub-anon are keyless; the only optional key is `ANTHROPIC_API_KEY` for L4.

- `RESEND_KEY` — email delivery (sender `thedi@platformy.org`, DKIM verified for platformy.org).
- `BUTTERBASE_SERVICE_KEY` — writes the `audit_log` row on `app_36ybfio2fiy7`.
- `RECIPIENT` — must equal `ashishranjan2404@gmail.com` (`assertPersonalRecipient` is hard-locked; any other value throws `personal tool only`).
- `ANTHROPIC_API_KEY` (**optional**) — enables L4 narrative-shift extraction (Claude compares the latest 8-K transcript vs the prior one and emits 3-5 bullets). When unset, the run does NOT fail — `readEnv` doesn't reject, the L4 section is silently omitted from each card, and L1/L5/L6/L7 still ship. Set this once you want the narrative section to appear.
- L8 government & capital section (`▌GOVERNMENT & CAPITAL`) is **always-on, keyless**: top 3 recent congressional trades (Senate + House Stock Watcher), latest-quarter lobbying total (Senate LDA), top 2 recent government contracts (USAspending.gov). Per-feed failures degrade independently — one feed empty → only that sub-block omitted; section header skipped only when ALL three are empty.

## Operator guard

Personal long-term tool. Do not change recipients. Do not push to chat. Do not create new Butterbase tables. If a fetch fails for one ticker the affected section renders `n/a — no … data` — the rest of the digest still goes out.

## Run command

```bash
cd scripts/earnings && npm install --silent && node --experimental-strip-types deepdive.ts
```

## Description (≤200 chars)

Sunday deep-dive: L1 fund / L5 val / L4 narrative (LLM, opt) / L6 GitHub / L7 arxiv+HN / L8 gov+capital (Quiver, opt); rotates 4/wk, emails digest, writes audit_log.

## Exit semantics

Prints `{ sent, cards, ms }` to stdout on success — `sent: true` if Resend accepted the email, `sent: false` if Resend failed (audit row is still written with `ok: false` and the failure reason in `note`). Non-zero exit only on env/recipient assertion failure or unhandled error. Per-ticker fetch failures are logged to stderr but do not abort — the missing section renders `n/a — no … data`.

## Watchlist rotation

`TICKERS` from `_watchlist.ts` (8 today). The Sunday email caps at **4 cards** per send so each card stays ~1–2 pages. Rotation slot = `weekOfYear(today) % ceil(N/4)`, so every ticker resurfaces every 2 weeks. Stable index order — no randomness, deterministic across re-runs of the same week. Deferred tickers still get tactical-daily coverage.

## V1 limitations (per spec §6 L5)

- Price feed + shares-outstanding feed are **not yet wired**. `runDeepDive()` passes `NaN` to `fetchValuationContext` so all `current` multiples render as `n/a` for now; the `5yr median` and sector columns still populate from XBRL history. Task 29 wires a quote source.
- L4 (narrative): `ANTHROPIC_API_KEY` is **optional**. When the key is unset, `buildLlmClientOrNull()` returns `null`, the EDGAR transcript batch fetch is skipped entirely (no wasted round-trip), and the `▌NARRATIVE SHIFT` section is omitted from every card. When the key IS set, the run pulls 8-K transcripts over a **180-day lookback** (≥ 2 quarters, accommodates slow-filing companies) and emits the section only for tickers where 2+ transcripts exist. LLM errors are surfaced as `[narrative TICKER]` warnings — distinct from EDGAR failures — and degrade to a skipped section per ticker, never block the run.
- L6 (operational): GitHub stars/contributors only. LinkedIn job-listing counts and Levels.fyi L5 comp need authenticated/scraped sources and are stubbed undefined; the operational section is skipped when no rows have data.
- L7 (secular): arxiv + HN keyword search per ticker via `TICKER_SECULAR_KEYWORDS`. A ticker missing from that map ships an empty L7 section — skipped at render. Add ticker→keyword entries in `layers/secular.ts` to enable.
- L8 (gov & capital): always-on, keyless. `runDeepDive` calls `maybeGovCapital(ticker)` per slate entry, which fans out to Senate + House Stock Watcher (last 90d), Senate LDA (trailing 4 quarters), USAspending (last 180d). All three sub-feeds fail independently; section header appears whenever ≥1 sub-block returns data. Notable-politician filter is OPEN in V1 (every House/Senate member's trade is signal at our scale).
- Layers 2/3 are still W3+ work — not in this routine yet.

## Storage

Writes to the existing Butterbase app `app_36ybfio2fiy7`:

- `audit_log` — one row per run with `{step: 'deepdive_run', ok, ms, findings_count, note}`. `findings_count` is the card count (== ticker count this week). `ok` is `false` when email send failed; `note` carries the failure reason in that case.

`earnings_snapshot` table is reserved for Layer-1/5 raw payload caching (W3+); not written by this V1 routine. Do not create new tables.
