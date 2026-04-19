# Thedi

**Thedi** (தேடி — Tamil for *"seek"*) is a daily research scout. It reads arxiv, Hacker News, and curated X lists every morning, ranks new items against your interests with a multi-agent LLM loop, and delivers a personalized 10-item digest to your inbox at 7 AM local time. Click *"Tell Thedi what missed"* on any email → tomorrow's critic sees your feedback and adjusts.

**Live:** https://thedi.butterbase.dev

---

## The polishing loop (MAKER-lite)

```
  arxiv + HN + X RSS (keyword-filtered)
         │
         ▼
     INGEST  ── 25–50 raw items
         │
         ▼
     SELECT  ── Qwen picks top 10 + per-item "why it matters"
         │
         ▼
     CRITIC  ── Qwen reviews: "is this list serving the user?"
         │
         ▼ (rejected)        ─── (accepted) ───┐
     REFINE  ── re-rank given critique          │
         │                                       │
         └──────────────────┬────────────────────┘
                            ▼
                       RED-FLAG   URL allowlist + title sanity
                            │
                            ▼
                       FINALIZE   write findings + digest meta
                            │
                            ▼
                        RENDER    hash-routed SPA URL
                            │
                            ▼
                       DELIVER    Resend email to user's inbox
                            │
                            ▼
       user clicks "Tell Thedi what missed"
                            │
                            ▼
                    scout-feedback-submit
                            │
                            ▼
           background prefs extraction (LLM)
                            │
                            ▼
       tomorrow's CRITIC consumes feedback.extracted_prefs
```

Every step writes to `audit_log` for full observability — see `/admin/runs` (token-gated).

---

## Stack

| Layer | Choice | Notes |
|---|---|---|
| Backend, DB, functions, static frontend | **Butterbase** (`app_36ybfio2fiy7`) | single platform — auth + Postgres + serverless TS functions + Cloudflare Pages frontend |
| LLM reasoning | **IonRouter** (Qwen 3.5 122B) | OpenAI-compatible, used for selector / critic / refiner / feedback extractor |
| Email delivery | **Resend** | sender domain verified via DKIM + MX + SPF on platformy.org |
| Sources | arxiv API, HN Algolia API, (X via RSS — phase 2) | degrades to "2-of-3 succeeded" |
| Auth | Google OAuth via Butterbase | RLS + per-user isolation policies |

---

## Data model — 6 tables

- **`users`** — id, email, google_sub, timezone (IANA), delivery_hour_local
- **`interests`** — user_id, keywords[] (≤20), sources[], active
- **`digests`** — per-run state: status, item_count, render_url, share_token, critique_text, critic_accepted, polish_started_at, last_step_at, sent_at
- **`findings`** — id, digest_id, rank, source, title, url, score, angle, summary, **initial_rank** (for replay diff)
- **`feedback`** — digest_id, user_id, message, extracted_prefs (jsonb)
- **`audit_log`** — id, user_id, digest_id, step, model, prompt_tokens, completion_tokens, ms, ok, note

Constraints: `UNIQUE(user_id, run_date)` for cron idempotency, `UNIQUE(digest_id, url)` to dedupe findings. RLS + `user_isolation_policy` on interests / digests / feedback. Cron / admin paths run as service role and bypass RLS (intentional).

---

## Deployed functions

| Function | Trigger | Purpose |
|---|---|---|
| `scout-polish-now` | POST | Synchronous end-to-end: ingest → select → critic → refine → red-flag → finalize → render → deliver. Admin-token gated (body `admin_token`). |
| `scout-findings` | POST | Return digest + findings by `share_token`. Public via token (capability-based). |
| `scout-feedback-submit` | POST | Save a user message + extract structured prefs via Qwen. |
| `scout-feedback-preview` | POST | Live re-rank the current findings given new feedback — no writes. Powers the "preview tomorrow's re-rank" button. |

Production design includes `scout-dispatch` (hourly cron → materializes per-user `polish` jobs) and `scout-step-worker` (every-minute state machine). The MVP uses `scout-polish-now` synchronously for a cleaner demo; the async state machine is documented in the design doc for phase 2.

---

## Repo layout

```
├── README.md                      ← you are here
├── LESSONS.md                     prior project (Adlyze) post-mortem
├── docs/
│   └── superpowers/
│       ├── specs/
│       │   └── 2026-04-19-thedi-design.md    v3 design doc (post-RALF)
│       └── ralf/
│           ├── round-1-changelog.md           critic synthesis per round
│           ├── round-2-changelog.md
│           └── round-3-changelog.md
└── thedi/
    ├── functions/                             Butterbase HTTP functions (TS)
    │   ├── scout_polish_now.ts
    │   ├── scout_findings_by_token.ts
    │   ├── scout_feedback_submit.ts
    │   └── scout_feedback_preview.ts
    └── frontend/
        └── dist/
            ├── index.html                     vanilla SPA, hash-routed
            └── _redirects                     SPA fallback for Cloudflare Pages
```

---

## Trigger a run

```bash
curl -X POST https://api.butterbase.ai/v1/app_36ybfio2fiy7/fn/scout-polish-now \
  -H "Content-Type: application/json" \
  -d '{
    "admin_token": "$THEDI_ADMIN_TOKEN",
    "user_id": "<uuid>",
    "angle_hint": "what I want to read about today",
    "skip_email": false
  }'
```

Returns:

```json
{
  "ok": true,
  "digest_id": "…",
  "share_token": "…",
  "item_count": 10,
  "accepted": false,
  "critique": "Drop #4 (CAD) and #10 (web UI gen) as off-topic…",
  "total_ms": 12500,
  "render_url": "https://thedi.butterbase.dev/#/f/…"
}
```

---

## Frontend

Single HTML + vanilla JS (no build step). Hash-routed client-side:

- `/#/` — landing
- `/#/f/<token>` — findings page
- `/#/chat/<token>` — feedback chat (seeded with two specific items from the digest)
- `/#/r/<token>` — **replay page** showing initial → final rank diff, critic text, and which items the refiner pulled in as replacements

---

## Cost

Typical run: **~7,000 tokens on Qwen 3.5 ≈ <$0.01 per digest**.

At 1 digest/user/day: **<$0.30/user/month** on inference alone. Email + DB + hosting are flat on Butterbase free tier for MVP traffic.

---

## Design doc

Full design with data flow, scheduling (per-user materialized cron, DST-safe), error handling, scope decisions, and the 3-round RALF refinement history (27 accepted proposals across 9 critic lenses):

**→ [`docs/superpowers/specs/2026-04-19-thedi-design.md`](docs/superpowers/specs/2026-04-19-thedi-design.md)**

Changelogs for each RALF round are in [`docs/superpowers/ralf/`](docs/superpowers/ralf/).

---

## Prior art

This repo previously hosted **Adlyze / Ledger Creative Analyzer** (2026-04-18 MultiModel Hackathon). That code was archived in commit `5303cd6`; post-mortem lives in [`LESSONS.md`](LESSONS.md). Recover any Adlyze file with `git show 72bfa6e:<path>`.

---

## Environment variables

None are committed. `.gitignore` covers `.env`, `.env.local`, `.cartesia.env`, `*.credentials`, `.secrets/`, `*.key`, `node_modules/`. Function env vars are managed via Butterbase `update_function_env`:

- `IONROUTER_API_KEY` — IonRouter bearer token
- `RESEND_API_KEY` — Resend send-only key
- `RESEND_FROM` — verified sender, e.g. `Thedi <thedi@platformy.org>`
- `THEDI_ADMIN_TOKEN` — gates admin HTTP endpoints (placed in request body, not headers — Butterbase gateway strips custom headers)
