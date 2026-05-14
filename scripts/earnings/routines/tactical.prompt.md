# Thedi tactical Routine

Daily 06:00 PT scout that fans out to Finnhub, Polygon, Yahoo, Benzinga, ApeWisdom, PullPush, Arctic-Shift, Reddit RSS, optional OAuth Reddit, and StockTwits; emails a digest to the personal recipient, and persists findings + an audit row to the existing Butterbase tables.

## Schedule

Cron: `0 6 * * *` in `America/Los_Angeles` (06:00 daily Pacific).

## Repo

`ledger-creative-analyzer` (this repo). Branch: `main`.

## Required env vars

All 6 must be present. `readEnv` aggregates and throws once with EVERY missing var named (e.g. `missing env var(s): FINNHUB_KEY, RESEND_KEY`), so a half-configured cron is fixed in one edit.

- `FINNHUB_KEY` — earnings calendar
- `POLYGON_KEY` — financials filing dates (Finnhub gap-fill)
- `BENZINGA_KEY` — news API token
- `RESEND_KEY` — email delivery (sender `thedi@platformy.org`, DKIM verified for platformy.org)
- `BUTTERBASE_SERVICE_KEY` — writes `findings` + `audit_log` rows on `app_36ybfio2fiy7`
- `RECIPIENT` — must equal `ashishranjan2404@gmail.com` (`assertPersonalRecipient` is hard-locked; any other value throws `personal tool only`)

## Optional env vars

- `REDDIT_CLIENT_ID`, `REDDIT_CLIENT_SECRET` — OAuth credentials for the Reddit Data API. When **both** are set, the tactical run pulls per-ticker post mentions from r/wallstreetbets, r/stocks, r/investing, r/SecurityAnalysis as a sentiment signal alongside StockTwits. When **either is unset**, the Reddit OAuth fetch is skipped entirely (no OAuth round-trip, no `[reddit]` warn). The three keyless Reddit fallbacks below remain active either way. Reddit's 2024-25 app-creation flow gates new apps behind manual approval; ApeWisdom + the keyless trio cover tactical sentiment.
- `UPSTASH_REDIS_REST_URL`, `UPSTASH_REDIS_REST_TOKEN` — when both are set, `_ratelimit.acquireToken` switches from an in-process token bucket to Upstash-backed buckets so PullPush, Arctic-Shift, and Reddit RSS share rate-limit state across concurrent routines (e.g. tactical + event_poll firing on overlapping cron cells). Unset → in-process bucket per routine instance (current V1 behavior). Optional; no behavior changes for single-instance runs.

## Sentiment sources (keyless)

- **ApeWisdom** (`apewisdom.io`) — aggregated Reddit retail sentiment with structured `Bullish/Bearish/Neutral` labels AND a `mentions_24h_ago` baseline. ApeWisdom's baseline feeds `detectFroth` directly: for tickers covered by ApeWisdom's top page, `mentionsPrior24h` becomes the baseline (replicated 3x to clear `detectFroth`'s n≥3 minimum). When variance is zero (V1: 3x replication of one value) `detectFroth` skips the ticker; when hourly history rows land in a future task the z-score gate will fire on genuine spikes. Tickers off the ApeWisdom top page (e.g. low-volume names) get no baseline and produce no froth flag — by design.
- **PullPush** (`api.pullpush.io`) — raw Reddit post search; bare mentions, no structured sentiment. Internal 100ms gap keeps us under the 15/min soft cap.
- **Arctic-Shift** (`arctic-shift.photon-reddit.com`) — Pushshift alternative; rate-limited via `_ratelimit.acquireToken('arctic_shift', …)`.
- **Reddit RSS** (`reddit.com/r/<sub>/search.rss`) — last-resort fallback; rate-limited via `_ratelimit.acquireToken('reddit_rss', …)`. Often 403s on header heuristics — log + skip is the expected degraded path.
- **StockTwits** — unchanged; per-symbol stream with structured `Bullish/Bearish` annotations.

## Reddit subreddits

Hard-coded `SUBS = ['wallstreetbets', 'stocks', 'investing', 'SecurityAnalysis']`. Adjust by editing the const at the top of `tactical.ts` — not via env, to keep the routine deterministic across runs.

## Run command

```bash
cd scripts/earnings && npm install --silent && node --experimental-strip-types tactical.ts
```

## Description (≤200 chars)

Fans out to Finnhub/Polygon/Yahoo/Benzinga/ApeWisdom/PullPush/Arctic-Shift/Reddit-RSS/Reddit-OAuth/StockTwits, dedupes the schedule, picks 5 freshest news items, emails the digest, writes findings + audit_log.

## Exit semantics

Prints `{ sent, findings, ms }` to stdout on success — `sent: true` if Resend accepted the email, `sent: false` if Resend failed (findings + audit row are still written). Non-zero exit only on env/recipient assertion failure or unhandled error. Source-fan-out failures are logged to stderr but do not abort — the digest goes out with whatever fulfilled.

## Storage

Writes to the existing Butterbase app `app_36ybfio2fiy7`:

- `findings` — one row per schedule item and per news item (bulk insert).
- `audit_log` — one row per run with `{step: 'tactical_run', ok, ms, findings_count, note}`. `ok` is `false` when email send failed; `note` carries the failure reason in that case.

Do not create new tables. Do not change recipients. Do not push to chat.
