# Thedi event_poll Routine

Hourly poll that scans SEC EDGAR for insider cluster buys (Form 4) and institutional activism (13D/G) on the 8-ticker watchlist, dedups against `earnings_alert_seen`, and emails one alert per new finding to the personal recipient.

## Schedule

Cron: `0 * * * *` in `America/Los_Angeles` (every hour on the hour).

## Repo

`ledger-creative-analyzer` (this repo). Branch: `main`.

## Required env vars

All 3 must be present. `readEnv` aggregates and throws once with EVERY missing var named (e.g. `missing env var(s): RESEND_KEY`), so a half-configured cron is fixed in one edit. No source API keys are needed — EDGAR is keyless.

- `RESEND_KEY` — email delivery (sender `thedi@platformy.org`, DKIM verified for platformy.org).
- `BUTTERBASE_SERVICE_KEY` — reads/writes `earnings_alert_seen` (dedup ledger) and writes `audit_log` row on `app_36ybfio2fiy7`.
- `RECIPIENT` — must equal `ashishranjan2404@gmail.com` (`assertPersonalRecipient` is hard-locked; any other value throws `personal tool only`).

## Optional env vars

- `QUIVER_API_KEY` (**optional**) — enables the L8 congressional alert path. When set, `runEventPoll` fetches the last 7 days of House/Senate trades on the watchlist and emits one `'congressional'` alert per ticker that accrued trades (grouped: subject names the first rep + `+N more` if multiple; body lists each trade with rep/party/chamber/date/amount). Dedup `sourceId` is `<TICKER>|<sorted-tx-dates>` so re-polls of the same trade set don't re-alert, while a new trade by another rep produces a new alert. When **unset**, the congressional fetch is skipped entirely (resolves to `[]`), no `[congress]` warn, and the existing form4_cluster + 13D/G alert paths are unaffected.

## Operator guard

Personal long-term tool. Do not change recipients. Do not push to chat. Do not create new Butterbase tables. Source-fan-out failures are logged to stderr but do not abort — the run proceeds with whatever fulfilled.

## Run command

```bash
cd scripts/earnings && npm install --silent && node --experimental-strip-types event_poll.ts
```

## Description (≤200 chars)

Hourly EDGAR poll: detects Form 4 cluster buys + 13D/G activism on the watchlist, dedups via earnings_alert_seen, emails one alert per new finding, writes audit_log.

## Exit semantics

Prints `{ alerts, newAlerts, ms }` to stdout on success — `alerts` is total alerts considered, `newAlerts` is post-dedup count actually emailed. Each alert email is independently try/caught so a single Resend failure doesn't kill sibling sends. The `audit_log` row is always written: `ok` is `false` if any send failed, `note` carries `sent X/Y; first error: …`. Non-zero exit only on env/recipient assertion failure or unhandled error.

## V1 limitations

- **No 13F prior-quarter diff yet.** `runEventPoll` passes `[]` as `notableChanges` to `buildInstitutionalSignals`, so the consensus (≥2 funds accumulating) and big-new-position (>100k shares) rules can't fire. Only activist (13D/G) institutional alerts ship today. A future task will fetch the 90-day-prior snapshot and call `diffHoldings` so consensus alerts come online.
- Form 4 fetch window is the last 7 days per poll; the cluster-buy detector still applies its own 30-day rolling window inside that data.
- L8 congressional alerts: notable-politician filter is OPEN in V1 — any House/Senate member trading a watchlist ticker triggers an alert. A future tightening (e.g. filter to leadership / committee chairs) lives in `event_poll.ts` once we have a signal-to-noise readout from the first month of alerts.
- Alert union in `schema/earnings_alert_seen.AlertType` is extended with `'congressional'` for dedup-row separation from `'form4_cluster'`, `'13dg'`, `'notable_13f'`, `'8k_narrative'`.
- Layers 4/6/7 (8-K narrative, etc.) are not in this routine yet.

## Storage

Writes to the existing Butterbase app `app_36ybfio2fiy7`:

- `earnings_alert_seen` — dedup ledger (composite PK `ticker, alert_type, source_id`). Read by `wasSeen`, written by `markSeen`.
- `audit_log` — one row per run with `{step: 'event_poll', ok, ms, findings_count, note}`. `findings_count` is `newAlerts.length`.

Do not create new tables. Do not change recipients. Do not push to chat.
