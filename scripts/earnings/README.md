# earnings-scout — personal long-term investing scout

Three Routines (Butterbase scheduled functions) that aggregate fundamentals,
news, sentiment, insider/institutional filings, and qualitative signals for a
hardcoded 8-ticker watchlist (AAPL/MSFT/GOOGL/AMZN/NVDA/META/AMD/TSLA), render
a digest, email it via Resend, and persist findings + an audit row to
Butterbase.

**Personal tool.** All sends are hard-locked to
`ashishranjan2404@gmail.com` via `assertPersonalRecipient`. Any attempt to
deliver elsewhere throws before a request leaves the process.

## Architecture

Per-lane upstream sources (each Routine fans out to a distinct source set):

- **tactical** — Finnhub (earnings calendar), Polygon (financials gap-fill),
  Yahoo + Benzinga (news), Reddit + StockTwits (sentiment).
- **deepdive** — EDGAR XBRL + 8-K transcripts, GitHub (stars/contributors),
  arXiv + HN (secular keyword velocity), Anthropic (optional, L4 narrative).
- **event_poll** — EDGAR Form 4 (cluster-buy detector), 13D/G (activist), 13F.

```
                    ┌──────────────┐
   schedule cron ──▶│  runTactical │──┐
   (07:00 ET daily) └──────────────┘  │     ┌──────────────┐
                    ┌──────────────┐  ├────▶│  Resend API  │──▶ inbox
   schedule cron ──▶│  runDeepDive │──┤     └──────────────┘
   (Sun 09:00 ET)   └──────────────┘  │     ┌──────────────┐
                    ┌──────────────┐  ├────▶│  Butterbase  │──▶ findings,
   schedule cron ──▶│ runEventPoll │──┘     │   data API   │   audit_log,
   (hourly ET mkt)  └──────────────┘        └──────────────┘   earnings_*
                            │
                            ▼
       ┌────────────────────────────────────────────────────┐
       │ sources/  Finnhub · Polygon · Yahoo · Benzinga ·   │
       │           Reddit · StockTwits · EDGAR (8-K, Form4, │
       │           13F, 13D/G, XBRL, transcripts)           │
       │ layers/   fundamentals · valuation · narrative ·   │
       │           operational · secular · insider · inst.  │
       │ render_*  digest formatting (text email body)      │
       │ schema/   apply_schema DSL for earnings_snapshot,  │
       │           earnings_alert_seen                      │
       └────────────────────────────────────────────────────┘
```

## Cadences

| Routine | Schedule | Output | Returns |
| --- | --- | --- | --- |
| `runTactical` (`tactical.ts`) | daily 07:00 ET | One digest email: today/tomorrow earnings calendar + 5 newest news items + froth signals. Persists `findings` + `audit_log`. | `{ sent, findings, ms }` |
| `runDeepDive` (`deepdive.ts`) | weekly Sun 09:00 ET | Per-ticker cards (4/week, week-of-year rotation): fundamentals trajectory, valuation context, narrative shift (LLM, optional), operational + secular signals. | `{ sent, cards, ms }` |
| `runEventPoll` (`event_poll.ts`) | hourly during market hours | Cluster-buy alerts (Form 4, 30d window) + activist filings (13D/G). Deduped via `earnings_alert_seen`. One email per unseen alert. | `{ alerts, newAlerts, ms }` |

## Setup

```bash
# 1. install deps
npm install

# 2. set env vars (locally for ad-hoc runs; via /schedule for production)
export RECIPIENT=ashishranjan2404@gmail.com   # required by all 3
export RESEND_KEY=re_xxx                       # required by all 3
export BUTTERBASE_SERVICE_KEY=svc_xxx          # required by all 3

# tactical-only:
export FINNHUB_KEY=xxx POLYGON_KEY=xxx BENZINGA_KEY=xxx
export REDDIT_CLIENT_ID=xxx REDDIT_CLIENT_SECRET=xxx

# optional (improves output, never required):
export ANTHROPIC_API_KEY=sk-ant-xxx            # deepdive: enables narrative layer
export GITHUB_TOKEN=ghp_xxx                    # deepdive: lifts GitHub rate limit

# 3. apply schema (idempotent — run once per environment)
node --experimental-strip-types schema/earnings_snapshot.ts
node --experimental-strip-types schema/earnings_alert_seen.ts

# 4. ad-hoc test run
node --experimental-strip-types tactical.ts
node --experimental-strip-types deepdive.ts
node --experimental-strip-types event_poll.ts

# 5. schedule on Butterbase via /schedule (one-time per Routine)
# Use the prompt files in routines/{tactical,deepdive,event_poll}.prompt.md
# as the agent instruction; cron expressions per the table above.
```

## Testing

```bash
npm test          # node:test --experimental-strip-types
npm run typecheck # tsc --noEmit (strict)
```

The suite covers each module unit-test-style **plus** a single shared-server
e2e (`__tests__/e2e.test.ts`) that boots a `node:http` fixture, rewrites every
known external host (Finnhub/Polygon/Yahoo/Benzinga/Reddit/StockTwits/EDGAR/
Resend/Butterbase/GitHub/arXiv/HN/Anthropic) to that fixture via a
`globalThis.fetch` override, and exercises all 3 entry points. The e2e
asserts each `runX` returns its declared shape with the right primitive
types — not a deep-equal on payloads (those drift) — so it stays green
across data-shape evolutions of upstream APIs while still catching wiring
breakage.

## File layout

```
earnings/
├── tactical.ts            # daily digest entry point
├── deepdive.ts            # weekly per-ticker entry point
├── event_poll.ts          # hourly alert entry point
├── render_tactical.ts     # text digest renderer
├── render_deepdive.ts     # per-ticker card renderer (sparkline charts)
├── render_alert.ts        # event alert subject + body + dedup glue
├── send.ts                # Resend client (recipient-locked)
├── _butterbase.ts         # data API client (insertRow, insertRows)
├── _http.ts               # fetchJson, fetchRss, fetchWithTimeout
├── _types.ts              # Ticker brand, EarningsEvent, RawItem, Finding
├── _watchlist.ts          # TICKERS array + toTicker / isTrackedTicker
├── _recipient.ts          # RECIPIENT constant + assertPersonalRecipient
├── _sparkline.ts          # unicode-block bar chart for deep-dive cards
├── froth.ts               # sentiment-spike detector (used by tactical)
├── sources/               # 11 adapters (one per upstream)
├── layers/                # 7 derived signals (fundamentals…secular)
├── schema/                # apply_schema DSL for the 2 owned tables
├── routines/              # *.prompt.md agent instructions for /schedule
└── __tests__/             # 30+ unit tests + e2e.test.ts
```

## V1 limitations

- No backfill. `findings` accumulates from first deploy onward; no historical
  baseline → `detectFroth` returns `[]` until enough history exists.
- LinkedIn / Levels.fyi job + comp counts (`operational` layer) are
  unauthenticated-scraper-blocked → omitted; only GitHub stars/contributors
  surface for V1.
- 13F notable-fund position deltas (`institutional` layer) need a prior
  snapshot to diff. V1 ships only 13D/G activist alerts (single-snapshot
  signal); position changes wire in V2.
- `narrative` layer (LLM-extracted theme shifts from earnings transcripts) is
  optional: missing `ANTHROPIC_API_KEY` → layer is silently skipped, deepdive
  cards omit the `narrative` field.
- Polygon free tier yields no EPS/revenue estimates; Polygon dates exist
  purely as a Finnhub fallback.
- `_butterbase.ts` bulk endpoint shape is unverified against the deployed API
  — see the WHY comment in that file. Single-row `/api/data/{table}` is
  exercised by the cron path.
- Deep-dive rotation surfaces 4 tickers/week → ceil(8/4) = every ticker
  resurfaces every 2 weeks.

## Reference docs

- Spec: `docs/superpowers/specs/2026-05-08-thedi-earnings-scout-personal-design.md`
- 30-task plan: `docs/superpowers/specs/2026-05-08-thedi-earnings-30-task-plan.md`

## Recipient enforcement (security note)

`_recipient.ts` exports a single `RECIPIENT` literal
(`ashishranjan2404@gmail.com`) and an `assertPersonalRecipient(addr)` that
throws `personal tool only — recipient must be ashishranjan2404@gmail.com`
on any other value. **Every** `runX` calls it on `env.RECIPIENT` before any
fan-out; **every** `sendEmail` call re-asserts on `args.to` before issuing
the HTTP POST. Two checkpoints means a regression that smuggles in a custom
recipient still fails closed at send-time. Do not relax this without
explicit owner sign-off — this is a personal long-term-investing tool, not
a multi-tenant service.
