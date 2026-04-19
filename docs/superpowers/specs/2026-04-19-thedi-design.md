# Thedi — Yoturi MVP Design

**Version**: v3 (post-RALF round 3, final)
**Date**: 2026-04-19
**Status**: Brainstorming complete — ready for user review → writing-plans

---

## 1. Product

**Yoturi** is a multi-user daily scout. Each signed-in user gets a personalized morning digest of arxiv papers, Hacker News posts, and curated X items — scored, ranked, and angled for their research interests — delivered via email at 7 AM local time. The scout is named **Thedi** (Tamil: தேடி, "seek/search"). Users refine tomorrow's run via a pre-seeded feedback chat reachable from every email; a "Preview tomorrow's re-rank" button closes the feedback loop live.

## 2. Product surface

- **Landing page** (public SPA route `/`): 3-line value prop + sample email screenshot + "Sign in with Google". Copy: *"Thedi reads arxiv, HN, and X every morning. You get 10 ranked items at 7 AM with why-it-matters for you. Tell it what missed; tomorrow adjusts."*
- **Dashboard** (`/dashboard`, auth-gated): interests editor (keywords ≤20, sources, active), timezone, delivery hour (default 7 AM local), live "next digest scheduled for YYYY-MM-DD at HH:MM in your timezone", "Delete my account" button.
- **Email** (7 AM local):
  - Subject: top finding's angle sentence — e.g. *"Thedi: a new MoE routing paper matches your 'efficient inference' angle (+4 more)"*
  - Opening line: *"Thedi (தேடி) — your daily scout. Here's what seek'd your way:"* (etymology moved up from footer — name-memorable moment)
  - Body: top 3 items inline with angle + summary
  - CTAs: link to findings page (with `share_token`), **"More like #2"** and **"Less like #1"** deep-links (token-carrying) to feedback chat, plus "Tell Thedi what missed →"
- **Findings page** `thedi.butterbase.dev/f/<share_token>` (SPA client route → JSON fetch from `findings(token)` function): ranked list of items, per-item angle, summary, source link. Read-only.
- **Feedback chat** `/chat/<share_token>` (SPA route): IonRouter-backed. Assistant opens by citing 2 specific items. Deep-linked variants pre-seed the message. Extracts structured preferences. **Write path via function: requires share_token AND session whose `user_id == digests.user_id` AND uses `ctx.db.asUser(user_id)` so RLS re-asserts.** After prefs are extracted, a **"Preview tomorrow's re-rank"** button re-runs the refiner against today's item pool with new prefs and renders a top-10 diff in-place.
- **Replay page** `/r/<share_token>` (SPA route, auth-gated to digest owner): shows the 3-stage loop:
  1. Selector's initial top-10
  2. Critic's critique text + `accepted:bool`
  3. Final refined top-10 with rank-change arrows (↑3, ↓1, etc.)
  Used on stage to make the MAKER-lite loop visible.

## 3. Stack

| Layer | Choice |
|---|---|
| Auth + DB + Functions + cron + frontend | Butterbase (`app_36ybfio2fiy7`, `thedi.butterbase.dev`) |
| Frontend | **Vite + React SPA**, one zip deploy to Butterbase frontend (→ Cloudflare Pages under the hood). Client-side routes: `/`, `/dashboard`, `/f/:token`, `/chat/:token`, `/r/:token`. All data via `GET /v1/{app_id}/fn/<fn_name>?...` |
| LLM reasoning | Butterbase AI gateway (OpenAI-compatible, BYOK OpenRouter) — **Haiku for selector, critic, refiner, feedback extractor**. Sonnet eliminated. All calls `temperature=0`, 60s timeout, max 2 retries. Prompt-cache the `interests + feedback_prefs` block if passthrough works. |
| Email | Resend — SPF+DKIM on sender subdomain before demo |
| Sources | arxiv API + HN Algolia API + X via RSS (RSSHub/Nitter). `urllib.parse.quote(kw, safe='')` per keyword. Cap 3 calls/user/run per source. Ingest ok if ≥2/3 sources succeeded. |
| Secrets | `update_function_env` — `THEDI_ADMIN_TOKEN`, `RESEND_KEY`, `OPENROUTER_KEY`, `KILL_SWITCH` (env var, not a row), `ADMIN_GOOGLE_SUBS` (comma-sep env var) |

## 4. Data model (6 tables)

- `users` — id, email, google_sub, timezone (IANA), delivery_hour_local (default 7), created_at
- `interests` — user_id, keywords[] (≤20), sources[], active (default true), updated_at
- `digests`
  - id, user_id, run_date, status (see §5 state machine), item_count, render_url, deliverable (bool, default false), delivery_attempts (int, default 0), share_token (text, app-generated `secrets.token_urlsafe(32)`, UNIQUE), polish_started_at (timestamptz, null), last_step_at (timestamptz), critique_text (text, null), critic_accepted (bool, null), sent_at, created_at
  - indexes: `UNIQUE(user_id, run_date)` via `indexes` block; index on `share_token`; index on `status`
- `findings` — id, digest_id, rank, source, title, url, score (float), angle, summary, initial_rank (int, null — for replay page rank-diff)
  - indexes: `UNIQUE(digest_id, url)`, index on digest_id
- `feedback` — id, digest_id, user_id, message, extracted_prefs (jsonb NOT NULL DEFAULT `'{}'::jsonb`), created_at
- `audit_log` — id, user_id (denormalized), digest_id, step, model, prompt_tokens, completion_tokens, ms, ok (bool), note (text, ≤2KB, email/URL-scrubbed; populated only when `ok=false`)

RLS: `enable_rls` + `create_user_isolation_policy(user_column='user_id')` on `interests`, `digests`, `feedback`. Cron functions run as service role and bypass RLS intentionally (need cross-user reads). User-write paths go through HTTP functions that re-assert via `ctx.db.asUser(ctx.user.id)`.

## 5. The polishing loop — step-functions keyed by status

**Why step-functions**: Butterbase function timeout is **5 min max**. The whole polish is 15–30 min wall clock. Split into short steps; a polling cron drives the state machine.

### State machine (`digests.status`)
```
pending → ingesting → selecting → critiquing → refining → red_flagging → finalizing → rendering → delivering → sent
                                                                                                                  ↓
                                                                          (on permanent fail, any state) → failed
```

### Step functions (each ≤5 min)

```
scout_dispatch        — cron `0 * * * *` (every hour UTC)
scout_step_worker     — cron `*/1 * * * *` (every minute) — state-machine advancer
scout_polish_now      — HTTP, admin-token gated, bypasses schedule (used for welcome + rehearsal)
scout_findings        — HTTP, token-gated (read): returns JSON for /f/:token
scout_replay          — HTTP, token-gated + auth-gated: returns JSON for /r/:token
scout_feedback_submit — HTTP, token+session-gated (write): appends message, schedules extract
scout_feedback_preview — HTTP, token+session-gated: re-runs refiner for live preview
scout_delete_me       — HTTP, auth-gated: cascades by user_id
scout_audit_sweep     — cron `0 3 * * *` (daily): `DELETE audit_log WHERE created_at < now() - 14d AND ok=true`
```

### scout_dispatch (hourly)
```python
for user where active=true:
    user_local = now_utc.astimezone(user.timezone)
    target_hour = (user.delivery_hour_local - 6) % 24
    if user_local.hour == target_hour:
        INSERT INTO digests(user_id, run_date=today_local, status='pending',
                            share_token=secrets.token_urlsafe(32))
          ON CONFLICT (user_id, run_date) DO NOTHING

# DST backfill
for user where active=true AND no digest today AND
    user_local.hour >= (delivery_hour_local + 2) % 24:
    INSERT ... note='dst_backfill'
```

### scout_step_worker (every minute)
Selects rows `WHERE status NOT IN ('sent','failed') AND last_step_at < now() - interval '30s'`, locks with `FOR UPDATE SKIP LOCKED`, and advances:

```python
match row.status:
    case 'pending':    ingest_step(row)       # → status='ingesting' → on return, 'selecting'
    case 'ingesting':  # (transient — worker sees only if prior step crashed; retry or fail)
    case 'selecting':  select_step(row)       # → 'critiquing'
    case 'critiquing': critic_step(row)       # → 'refining' (always 1 pass)
    case 'refining':   refine_step(row)       # → 'red_flagging'
    case 'red_flagging': red_flag_step(row)   # → 'finalizing' OR one more 'refining'
    case 'finalizing': finalize_step(row)     # sets deliverable, writes findings → 'rendering'
    case 'rendering':  render_step(row)       # uploads HTML? NO — SPA renders client-side.
                                               # This step just marks deliverable URL:
                                               # render_url = f'https://thedi.butterbase.dev/f/{share_token}'
                                               # → 'delivering'
    case 'delivering': deliver_step(row)      # Resend send → 'sent' OR retry up to 3x
```

Each step is a separate function invocation, fits in 5 min. `last_step_at` updated on exit; stuck rows (>5 min in same state) get one retry, then `status='failed'`.

### Single-pass critic (§5 step was 3 iterations, now 1)
```
select_step:    SELECTOR (Haiku, temp=0) → top 10 with initial_rank + score
critic_step:    CRITIC   (Haiku, temp=0) → critique_text, critic_accepted:bool
refine_step:    REFINER  (Haiku, temp=0) → re-rank given critique (final rank)
red_flag_step:  per-item URL-allowlist + title-sanity + 7d-dupe check
                any fail → ONE more refine_step pass, then bail
finalize_step:  if red-flags cleared AND item_count ≥ 5 → deliverable=true
                elif item_count < 5 → deliverable=false, status='failed', note='sparse_day'
                  (no sparse-template; fail loud per YAGNI)
```

Cost estimate (all Haiku): ~5 IonRouter calls per user/day (select + critic + refine + maybe 1 red-flag-refine + feedback extract on chat). **Typical: <$0.03/user/day; worst case <$0.08.**

### deliver_step
```python
if os.environ['KILL_SWITCH'] == '1': fail('kill_switch')
if not row.deliverable: fail('not_deliverable')
try:
    resend_send(row)
    row.status='sent'; row.sent_at=now()
except:
    row.delivery_attempts += 1
    row.status='delivered_failed'
    # scout_step_worker will retry up to 3x
```

## 6. Feedback loop

User clicks email CTA → SPA route `/chat/:token` (optional `?seed=more_like_2`). Assistant's first message is injected client-side from findings; subsequent turns POST to `scout_feedback_submit`:

```python
# scout_feedback_submit (HTTP, auth + token)
def handler(ctx):
    assert ctx.user is not None
    digest = ctx.db.selectOne('digests', where={'share_token': req.token})
    assert digest.user_id == ctx.user.id
    ctx.db.asUser(ctx.user.id).insert('feedback', {message, digest_id=digest.id, ...})
    # Background extract (debounced 30s per user):
    if last_extract_ms_for_user(ctx.user.id) > 30_000:
        schedule_extract(feedback_id)
```

`scout_feedback_preview` re-runs `refine_step` logic with the new `extracted_prefs` against the existing findings pool — returns a diffed top-10 without writing anywhere. "Preview tomorrow's re-rank" button calls it; rendering the diff is client-side.

## 7. Scheduling (per-user materialized cron)

See §5 `scout_dispatch`. Hourly cron; idempotent via `UNIQUE(user_id, run_date)` + `ON CONFLICT DO NOTHING`. DST backfill sweep runs in the same function after the main materialization loop.

## 8. Admin + observability

- **`scout_polish_now(user_id, no_wait:bool)`** — HTTP, requires `THEDI_ADMIN_TOKEN` constant-time compare. Inserts digest with `run_date='rehearsal_YYYY-MM-DD-<nonce>'` or `welcome_YYYY-MM-DD`. When `no_wait=true`, skips scheduled delivery delay. Welcome path is auto-invoked on first `interests` save (gated by `users.created_at > now()-10m`).
- **`GET /admin/runs?date=YYYY-MM-DD`** — Admin-token + `ADMIN_GOOGLE_SUBS` allowlist. Returns JSON: per-digest status, ms, any `ok=false` audit rows, final item_count, $ per user (SUM via token costs).
- **`scout_delete_me`** — cascades by user_id. GDPR-adjacent.
- **Kill switch**: `KILL_SWITCH=1` env var on `scout_step_worker` and `deliver_step` functions. Flip via `update_function_env` then redeploy — takes <30s.

## 9. Auth, privacy, abuse controls

- Google OAuth via Butterbase (`configure_oauth_provider`).
- RLS enabled on all user-owned tables; `create_user_isolation_policy` per table.
- User-write paths use `ctx.db.asUser(ctx.user.id)`.
- `audit_log` TTL 14 days via `scout_audit_sweep` daily cron.
- Keywords capped at 20; per-source calls at 3/run.
- Resend SPF+DKIM before demo.
- `share_token` is unguessable (32B urlsafe) but not a capability — writes always re-check session identity.

## 10. Skipped (phase 2)

- iMessage delivery
- Persistent chat history (one-shot per digest)
- Multi-tenant billing / paid tiers
- Live fine-tuning
- Live X scraping beyond RSS
- Full i18n UI translation
- Per-axis `score_breakdown` (reverted in v3; single score suffices)
- `rate_limits` table + golden-set Spearman eval (demo-day YAGNI)

## 11. Open questions (still blockers for code-start)

1. Repo path — `/Users/mei/ledger-creative-analyzer` confirmed; rename later if desired
2. Google OAuth client — create via Google Cloud Console, or reuse an existing one? (~10 min walkthrough if creating fresh)
3. Resend API key + sender subdomain + DKIM records
4. Seed user (email + IANA timezone + 3–5 keywords) — you; recommend specific angle like "KV-cache quantization for on-device LLMs" for spicy demo subject line
5. Butterbase AI gateway prompt-cache passthrough — verify early; fallback is direct IonRouter calls

## 12. Success criteria

- Signed-in seed user with interests configured
- `scout_polish_now(seed_user, no_wait=true)` completes <20 min across step-worker ticks, item_count ≥ 5
- Welcome digest fires within 2 min of first interests save
- Email arrives at 7 AM local in inbox (SPF/DKIM green)
- Findings page `/f/<token>` renders with 10 items + angles
- Replay page `/r/<token>` shows selector→critic→refined rank diff
- Feedback chat: message accepted, auth blocks cross-user writes, "Preview tomorrow" button diffs top-10 live
- `/admin/runs?date=today` all green, cost per user < $0.08/day worst case

## 13. Demo flow (3 min)

- **T–10 min (backstage)**: run `scout_polish_now(demo_seed_user, no_wait=false)` so the email lands at demo time
- **[0:00]** open with phone lockscreen mockup + push notification: *"Thedi: a new KV-cache quant paper matches your 'on-device LLM' angle (+4 more) — 7:00 AM"*
- **[0:30]** tap email, show body + angles
- **[1:00]** click "More like #2" → feedback chat opens pre-seeded, user types "less theory", hit "Preview tomorrow's re-rank" → live diff
- **[1:45]** open `/r/<token>` replay page → show selector → critique text → refined diff (the MAKER/RALF story visualized)
- **[2:15]** cut to architecture: "every night, Thedi argues with itself using MAKER-style decomposition; every morning, it listens to you"
- **[2:45]** stack logos, close

Fallback: 15s pre-recorded video of email arrival in case Resend lags.

---

**End v3. Brainstorming complete. Awaiting user review before invoking writing-plans.**
