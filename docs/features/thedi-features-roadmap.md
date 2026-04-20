# Thedi — Features Today + Roadmap

> What Thedi ships today, and what to build next — organized by impact per hour of work, not by feature area. Companion to [`yutori-reference.md`](./yutori-reference.md) (what Yutori does) and [`research-scout-landscape.md`](./research-scout-landscape.md) (what everyone else does).

**Last refreshed**: 2026-04-20
**Live**: https://thedi.butterbase.dev

---

## Shipped today

### Core pipeline
- ✅ **Synchronous scout-polish-now** — one function runs the entire loop in 12–13s
- ✅ **MAKER-lite multi-agent loop** — selector → critic → refiner → red-flag → deliver
- ✅ **Per-item `angle`** — one-sentence "why this matters for you" on every item
- ✅ **Rank diff persisted** (initial_rank → final) → visible on replay page
- ✅ **audit_log** — every step's tokens, ms, ok, note

### Sources
- ✅ **arxiv** (keyword query via the arxiv API)
- ✅ **Hacker News** (Algolia search_by_date)
- ⬜ X (stub in interests.sources but not wired — RSS ingest pending)

### Auth + multi-user
- ✅ Google OAuth via Butterbase
- ✅ RLS + user_isolation_policy on `interests`, `digests`, `feedback`
- ✅ SPA landing with sign-in button → Butterbase OAuth flow → token capture

### Delivery
- ✅ Email via Resend, sender: `thedi@platformy.org` (DKIM/SPF/MX verified)
- ✅ Subject templated from top finding's title
- ✅ Top 3 inline in email body; link to findings page + chat
- ⬜ iMessage (phase 2)
- ⬜ Webhook (phase 2)

### Feedback loop
- ✅ "Tell Thedi what missed" chat page pre-seeded with two specific items
- ✅ `scout-feedback-submit` extracts `{avoid, prefer, weight_changes}` via LLM
- ✅ `scout-feedback-preview` live re-ranks in-page (no writes)
- ✅ Tomorrow's critic consumes last 3 `extracted_prefs` entries

### Data model (6 tables)
- `users`, `interests`, `digests`, `findings`, `feedback`, `audit_log`

### Frontend
- ✅ Vanilla HTML + JS SPA, no build step
- ✅ Hash routes: `/#/`, `/#/f/:token`, `/#/chat/:token`, `/#/r/:token`
- ✅ Replay page showing initial→final rank diff + critique text

---

## Roadmap — priority-ordered

### P0 · This week · Must-ship for activation

1. **Dashboard + interests editor** — today the only onboarding is an admin `insert_row` call. Build a signed-in page at `/#/dashboard` with:
   - Keywords editor (max 20)
   - Sources toggles (arxiv / HN / X)
   - Timezone (auto-detect via `Intl.DateTimeFormat().resolvedOptions().timeZone` on first save)
   - Delivery hour local (0–23)
   - "Delete my account" button
   Wires directly to Butterbase's data API with user JWT — no new functions.

2. **Welcome digest on signup** — on first `interests` save, fire `scout-polish-now` inline with `run_date = welcome_YYYY-MM-DD`. 10 min of work, massive activation boost.

3. **Daily cron** — deploy `scout-dispatch` (hourly UTC → insert `pending` digest rows per user whose local time == delivery_hour − 6) + `scout-step-worker` (every minute → advances state machine). Replaces manual `scout-polish-now` triggers.

4. **Publish Google OAuth app** — current app is in Testing (100 test-users cap). For `openid email profile` it's instant to publish.

### P1 · Next week · "feels like a product"

5. **Yutori-style audit trail view** — expose `audit_log` + `critiques` for a digest at `/#/r/:token` so users can see what the agents were thinking. Trust primitive.

6. **Reply-to-email feedback** — configure Resend inbound → Butterbase webhook → `scout-feedback-submit`. Users can reply to the digest to refine — no need to click through to chat.

7. **Scout templates** — onboarding suggests 5 starter scouts per persona:
   - *"AI researcher"* → agentic AI, multi-agent systems, LLM evals
   - *"Substack writer"* → tech trends, DTC growth, AI product moves
   - *"DevOps / SRE"* → AI SRE, incident response automation, AIOps
   - *"Founder"* → fundraising, hiring signals, market moves
   - *"Custom"* → free-form

8. **Source expansion** — X via RSS (RSSHub / Nitter), Semantic Scholar, OpenReview for conference papers. Each ~30 lines in `scout_polish_now.ts`.

9. **7-day dedupe** — query against last 7d of delivered findings before the selector runs, so today never repeats last week.

### P2 · Month 2 · Scale + network effects

10. **Sessions + steps refactor** — adopt the 5-agent RALF's recommended split (idempotency keys on each step, lease-based claim pattern). Reduces duplicate billed LLM calls on retries.

11. **Per-user daily cost cap + 90/min rate limit** — safety before publishing the OAuth app.

12. **Substack draft generator** — new function `scout-draft-post(digest_id)`: synthesize the top-5 items into a 500–800 word post in the user's voice. Uses user's Substack URL as a style-reference corpus. Ramesh's exact use case.

13. **Public shareable digests** — findings URLs are already public via share_token. Add OG meta tags → Twitter/Reddit shares drive signups. Consider a `discover` page showing top public digests by category.

14. **iMessage delivery via Photon** — original "Yatori" concept. Ports cleanly from `ledger-delivery/` in git history (commit `72bfa6e`). Short summary to phone, full digest in email.

15. **Persistent chat history** — right now `/chat/:token` is one-shot per digest. Store threaded history; let users come back and continue the conversation across digests.

### P3 · Month 3 · Monetization

16. **Stripe Connect tiers** (Butterbase supports it):
    - **Free**: 1 scout, 3 keywords, daily digest
    - **Pro $5/mo**: multiple scouts, unlimited keywords, Substack drafts, persistent chat, iMessage
    - **Team $15/mo/seat**: shared scouts + Slack delivery

17. **Connectors** (from Yutori's playbook): Gmail, Notion, Linear — inform ranking from the user's own workflow. "Papers related to my open Linear tickets."

18. **Scout-to-scout cross-reference** — if two users have overlapping keywords, occasionally surface each other's feedback as a "you may also find interesting" signal.

---

## Features explicitly NOT on the roadmap

From the v3 design `docs/superpowers/specs/2026-04-19-thedi-design.md`:

- ❌ Full i18n translation of UI strings
- ❌ Live fine-tuning on per-user feedback (prompt injection is enough)
- ❌ Per-axis `score_breakdown` jsonb (reverted to single float after YAGNI)
- ❌ Real-time WebSocket notifications (email-first UX)
- ❌ Social features — following other users' scouts (privacy risk outweighs value for MVP)
- ❌ Browser automation / clicking through sites (Yutori does this, we intentionally stay RSS/API only)

---

## What would 10× the product

Ranked by leverage:

1. **Prove the feedback loop works across days** — right now one user has one digest. If you click "Tell Thedi what missed" → tomorrow is visibly different → that's the magic moment everything else amplifies. Today's priority.

2. **Welcome digest** — cuts time-to-first-value from 24h to 2 min. Single biggest activation lever.

3. **Substack draft feature** — turns Thedi from "reader" to "writer's co-pilot." Unique positioning vs every competitor.

4. **Public findings pages w/ OG** — organic growth channel. Cost: 30 min of meta tag work.

---

## Build order (committed for the next 7 days)

**Today**: prove feedback-loop cross-day (run it with Ramesh, send him tomorrow's digest that reflects his reply)

**Day 2**: dashboard + interests editor + welcome digest

**Day 3**: daily cron + scout-step-worker

**Day 4**: publish OAuth app + X RSS source + 7-day dedupe

**Day 5–6**: reply-to-email feedback + scout templates

**Day 7**: public shareable OG tags + Substack draft generator v1

Review point on day 7: if fewer than 5 users are using Thedi daily, pause feature work and spend a week on growth.

---

## Sources for this doc

- [`yutori-reference.md`](./yutori-reference.md) — Yutori's shipped feature set
- [`research-scout-landscape.md`](./research-scout-landscape.md) — broader competitive cut
- [`docs/superpowers/specs/2026-04-19-thedi-design.md`](../superpowers/specs/2026-04-19-thedi-design.md) — v3 design doc (post-RALF)
- Live product at https://thedi.butterbase.dev
