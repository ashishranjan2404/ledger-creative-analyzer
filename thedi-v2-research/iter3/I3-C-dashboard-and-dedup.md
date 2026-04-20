---
title: I3-C — `/admin` Dashboard + Scout Embedding-Based Dedup (build-ready specs)
author: iter-3 agent
date: 2026-04-19
status: ready-to-implement
parent_docs:
  - ../round4/thedi-v2.md  (amendments A2, A3, A4, A7; Phase-1 dashboard row)
  - ../iter2/D2-installer-walkthrough.md  (ship order; MCP sequence)
  - ../iter2/D1-interview-bot-and-rubric.md  (rubric-delta flow)
  - ../round1/05-multi-agent-orchestration.md  (recycle/sequel filter mention)
  - ../round2/critic-report.md  (flagged recycle/sequel as a gap)
---

# I3-C — `/admin` Dashboard + Scout Embedding-Based Dedup

Two Phase-1 artifacts promoted but not specified in prior rounds: the `/admin` dashboard (amendment A4) and the scout's embedding-based dedup + sequel handling (Round 2 critic gap; Brief 05 mention). Both must ship in ~6h + ~4h respectively. This document is the build spec.

---

## Part 1 — `/admin` Dashboard

### 1.0 Framing

- **Single-page app**, vanilla JS + HTML + IonRouter client pattern (mirrors the existing Thedi v1 landing page — see `/Users/mei/ledger-creative-analyzer/thedi/` SPA + Butterbase function pattern). No React build toolchain; a single `index.html` + `app.js` served from a Butterbase frontend deployment ([iter-2 D2 §2f](../iter2/D2-installer-walkthrough.md)). The iter-2 D2 walkthrough says "React SPA" — **this spec overrides**: vanilla JS matches Thedi v1, avoids a build step, and fits the 6h budget. `[assumption]`: if Ashish would rather use Vite+preact for a smaller diff vs. v1 landing, the spec's contents don't change — only the bundler does.
- **Ramesh-only, gated by Google OAuth via `configure_oauth_provider`** with an email allowlist. Ashish gets view-only via a separate `ashish-superuser` allowlist entry; every admin action Ashish takes is flagged in `audit_log.actor='ashish-superuser'`.
- **Ship order inside Phase 1** (per iter-2 D2 appendix B): **compose editor → alerts → rubric-delta view → OAuth settings**. The last two can land in a Phase-1.5 patch if the 6h runs over, but the compose editor is the critical path for shipping Post 1 (it is the A2 replacement for Beehiiv).
- **Route structure** (5 screens, 4 persistent routes + 1 modal):
  - `/admin` — Home / alerts (default landing)
  - `/admin/compose` — Compose editor (markdown + preview)
  - `/admin/rubric` — Rubric-delta approval queue
  - `/admin/pipeline` — Pipeline state for the current-week post
  - `/admin/settings` — OAuth + model pins + email prefs

### 1.1 Screen inventory

#### Screen 1 — Home / Alerts (`/admin`)

**Purpose.** First thing Ramesh sees after Google OAuth. Shows every unresolved alert with a one-click action. Also surfaces last-7d stats so the weekly health email (`fn_weekly_health`) becomes a backup, not the only surface.

**Data it shows.**
- Open alerts (`SELECT * FROM alerts WHERE status='open' ORDER BY severity DESC, created_at DESC`):
  - Model-ID mismatch (`fn_drafter`/`fn_critic` got wrong model back — hard-fail per the main plan's "single most important control").
  - Key-expiry countdown (any key in 1Password with `next_due_at < now() + interval '14 days'`).
  - Ramesh-silence counter (days since last `audit_log` row with `actor='ramesh'`). At 7d → warning; at 14d → pipeline auto-pauses (A4).
  - Rubric digest pending (any `rubric_deltas.status='ashish_approved'` row awaiting Ramesh confirm).
  - Q&A insufficient-material (any `qa_sessions.status='qa_insufficient_material'`).
  - Cron heartbeat stale (any `health_heartbeats` job >26h silent).
  - Budget alert (IonRouter WoW spend > $2).
- Last-7d stats bar: posts drafted, posts approved, posts published, critic pass-rate, total IonRouter spend.
- "Current-week pipeline state" mini-card — 1 line: `Week of 2026-04-20: state=drafting (round 1/2), topic="k8s operator reconciliation under partial-failure"` — click to jump to Pipeline screen.

**Actions it offers.** Each alert row has a primary action button:
- Model-ID mismatch → "View logs" (opens `audit_log` filtered modal).
- Key expiry → "Open rotation runbook" (links `docs/ROTATION.md#<service>`).
- Silence counter → "I'm here" (writes an `audit_log` ping row; resets counter; un-pauses pipeline if paused).
- Rubric pending → "Review" (navigates to `/admin/rubric`).
- Q&A insufficient → "Compose options" (modal with skip/voice-note/extend choices from [D1 §1.5](../iter2/D1-interview-bot-and-rubric.md)).
- Cron heartbeat stale → "Invoke now" (calls `fn_heartbeat_watcher` manually).
- Budget alert → "Open spend breakdown" (navigates to Settings → AI usage).

Also a global "Pause pipeline" toggle in the header (flips `system_config.pipeline_paused`). One click; confirmation modal; logged to `audit_log`.

**Empty state.** "No open alerts. Last check: {{now()}}. Pipeline: running. Next weekly health email: Monday 07:00 PT." Plus a green dot.

**Error state.** If the `/admin` API call fails (network or 500), show the last-cached alert set with a red "Stale — last fetched {{cached_at}}" banner. `[assumption]`: uses `localStorage` for cache; 5-minute TTL. If OAuth expired, redirect to `/auth/google/login` with return URL.

---

#### Screen 2 — Compose (`/admin/compose`)

**Purpose.** The A2 replacement for Beehiiv CMS. Markdown editor + live preview pane. The draft arrives pre-populated from `fn_drafter` + `fn_critic` + `fn_rewriter` output. Ramesh edits inline, then clicks Approve (sends to `published_posts.status='awaiting_manual_paste'`) or Reject (sends back to `fn_rewriter` with a free-text reason for round 2). This is HITL gate #2.

**Data it shows.**
- Left pane: markdown editor (textarea or a minimal `contenteditable`; no complex editor lib — `[assumption]` vanilla textarea plus Cmd+B/I keyboard shortcuts is sufficient for a Ramesh-only tool).
- Right pane: rendered markdown preview (use a 3KB `marked.js` CDN script — no build step).
- Top bar: draft metadata — topic title, draft round (`round=1` or `round=2`), rubric scores from `drafts.rubric_scores`, word count, estimated read time.
- Sidebar: Q&A verbatim pinned from the `qa_sessions` that produced this draft, so Ramesh can cross-reference his own answers while editing. This is the load-bearing "meaningful human input" signal (brief 03 AUP framing) made visible to Ramesh.
- A "critic's edits" panel: the top-5 edits from `fn_critic` rendered as clickable line-anchors. Clicking jumps the cursor to that location in the editor.

**Actions it offers.**
- **Save draft** (autosaves every 15s via `fn_composer_editor PUT /drafts/:id`; also on Cmd+S).
- **Approve & copy to clipboard** — sets `drafts.status='approved'`; creates a `published_posts` row with `status='awaiting_manual_paste'`; pops a toast "Copied — open Substack and paste." Ramesh pastes manually ([Brief 03](../round1/03-substack-beehiiv-apis.md)).
- **Mark as published** — after Ramesh pastes to Substack and publishes, he comes back and clicks this; prompts for the Substack URL; updates `published_posts.substack_url, published_at`; fires `fn_syndicate_linkedin_x` to cross-post.
- **Reject → re-critic** — surfaces a short textarea for a free-text reason; resets `drafts.status='rewriting'`, `drafts.round=2`; triggers `fn_rewriter`.
- **Discard** — soft-deletes the draft (`drafts.status='discarded'`); marks the week as skipped.

**Empty state.** If there is no current-week draft: "No draft yet. Pipeline state: `{{current_state}}`. When `fn_drafter` produces a draft, it will appear here." Link to Pipeline screen. Also a "Start a blank draft" button for manual-override cases — writes a new `drafts` row with `status='review_pending'`, `qa_session_id=null`, `body_md=''`.

**Error state.** Autosave failures show an inline "Save failed — retrying in 30s" badge; editor stays editable; last successful save timestamp visible. If `drafts` row is deleted by another actor while Ramesh is editing, show a modal "This draft was removed. Your local copy is preserved in `localStorage`. Copy out before leaving this page." — never silently drop Ramesh's edits.

---

#### Screen 3 — Rubric (`/admin/rubric`)

**Purpose.** Ramesh-facing view of the rubric-recalibration two-gate approval flow ([D1 §2.5](../iter2/D1-interview-bot-and-rubric.md), amendment A3). Ashish proposes → Ashish approves (via email or his own admin-superuser view) → then it lands here for Ramesh's one-click confirm. Ramesh is the voice authority.

**Data it shows.** List of `rubric_deltas` rows where `status='ashish_approved'` (pending Ramesh) or `status='proposed'` (pending Ashish, visible as read-only info to Ramesh). Each row:
- Proposed rubric change (e.g., "Add to ban list: `in the realm of`").
- Signal that prompted it ("3 edits in posts #12, #14, #15 removed this phrase; avg edit location score -2.4 on `slop_absence`").
- Ashish's reasoning (free-text 1-2 sentences; stored in `rubric_deltas.rationale`).
- Example edit ("You replaced `in the realm of agent reliability` with `with agent reliability` in post #14.").
- Diff against current rubric version (`rubric_versions.ban_list`).

**Actions it offers.** Per row:
- **Approve** → `rubric_deltas.status='shipped'`; creates a new `rubric_versions` row with incremented version; flips `active=true` on the new row and `active=false` on the prior one; fires `fn_revalidate_golden_set` async.
- **Reject** → `rubric_deltas.status='killed'`; records `killed_reason` (optional short text); no rubric change.
- **Defer** → sets `deferred_until = now() + interval '7 days'`; row disappears from the queue until then. Cap: a delta can be deferred at most twice before forced decision.

Top bar: current rubric version number (e.g., v7), link to `rubric_versions` history (read-only audit trail of every ban-list change with timestamps and who approved).

**Empty state.** "No rubric deltas pending. Current version: v{{n}}. Last change: {{last_shipped_at}} ({{what}})."

**Error state.** If a delta's state-machine transition fails (e.g., Ashish's signed link expired, Ramesh's Google OAuth session timed out mid-approve), show the row with a red "Action failed: retry" and keep the row in its current state (never lose proposals).

---

#### Screen 4 — Pipeline (`/admin/pipeline`)

**Purpose.** Source-of-truth view of the current-week post's progress through the state machine. Also how Ramesh does emergency pause.

**Data it shows.** The current-week post as a vertical timeline of states with timestamps and active-stage highlighted:

```
scout_complete    2026-04-14 13:00 PT    [topic picked: "..."]
topic_picked      2026-04-17 07:12 PT    (Ramesh replied "1")
qa_sent           2026-04-17 07:13 PT    (4 questions emailed)
qa_in_progress    2026-04-18 09:42 PT    (3 of 4 answered, 620 words)
qa_closed         2026-04-18 18:00 PT    [deadline; closed with 4/4]
drafting          2026-04-18 18:01 PT    (kimi-k2.5, 3m 14s) ✅
critiquing        2026-04-18 18:05 PT    (gpt-oss-120b, score 61/85)
rewriting         2026-04-18 18:09 PT    [round 1/2] ← CURRENT
critiquing_r2     (pending)
review_pending    (pending)
approved          (pending)
published         (pending)
```

Each row: state, timestamp, and a small `payload` summary (model used, scores, word count, error if any).

**Actions it offers.**
- **Pause pipeline** button (top-right). Flips `system_config.pipeline_paused=true`. All cron-triggered functions check this flag before doing anything. Un-pause is the same button. Confirmation modal.
- **Advance manually** (for each stuck state, a button that forces the transition — e.g., "Force drafter", "Force critic"). Gated by a confirmation modal. Logged to `audit_log` with `actor`.
- **View raw payload** — opens a modal with the full JSON event history for the current post (reads `pipeline_events` table).
- **Skip this week** (only visible if in `qa_insufficient_material` or `drafting` states) — force-transitions to `week_skipped`, writes audit row, emails Ashish.

**Empty state.** "No post in progress. Next scout run: {{next_cron}}. Next topic-picker email: {{next_thursday}}."

**Error state.** If the pipeline is in `error` state (any function raised an uncaught exception): big red banner with the error message, stack trace link, and a "Retry last transition" button. Also: if `system_config.pipeline_paused=true`, all action buttons are disabled with a tooltip "Pipeline paused — un-pause from Home."

---

#### Screen 5 — Settings (`/admin/settings`)

**Purpose.** OAuth connections, model pins per stage, email preferences. Read-heavy — most settings change rarely. Also the rotation-runbook landing surface (deep-links to `docs/ROTATION.md`).

**Data it shows.**
- **OAuth connections** table: Google (admin login), LinkedIn (syndication), Anthropic (escape hatch). Each row: status (connected / expired / not-connected), `expires_at`, "Reconnect" button.
- **Model pins** per stage: reads `model_stage_config` table; shows `stage → expected_model` (e.g., `drafter → moonshotai/kimi-k2.5`). Each row has an "Edit" button (opens modal, free-text, warns "changing this triggers golden-set revalidation").
- **Email preferences**: weekly health email day+time (default Mon 07:00 PT), recipient address, toggle for each alert type ("email me when model-ID mismatches", etc.).
- **AI usage** (last 30d): bar chart of IonRouter spend by day, total, per-stage breakdown. Uses Butterbase's `GET /v1/{app_id}/ai/usage` endpoint if BYOK is configured, else reads from `audit_log` where `action='ionrouter_call'`.
- **Rotation calendar**: reads each credential's `next_due_at` from a local `credentials_metadata` table (Ashish seeds this at install; Ramesh updates on each rotation). Shows next 5 upcoming rotations.

**Actions it offers.**
- Reconnect OAuth (Google / LinkedIn / Anthropic) — redirects through the provider's consent flow; refresh token lands in Butterbase OAuth state table.
- Edit model pin — opens modal; on save, fires `fn_revalidate_golden_set` and writes `audit_log`.
- Edit email prefs — saves to `email_prefs` table.
- **Rotate now** (per credential) — opens the relevant section of `docs/ROTATION.md` in a new tab; after Ramesh rotates, he clicks "I rotated it" which updates `rotated_at` and recomputes `next_due_at`.
- **Export audit log** — downloads last-90d `audit_log` as JSON (compliance artifact).

**Empty state.** Not really applicable (always has OAuth + model-pin rows after install). If `credentials_metadata` is empty (pre-install dry-run), show "Credentials not yet seeded — rerun installer."

**Error state.** If a reconnect flow returns an OAuth error (consent revoked, scope changed), show inline red with the exact error and a link to the provider's dashboard.

### 1.2 Data contracts

PostgreSQL DDL (Butterbase schema DSL). Every table below is new in v2 unless marked (preserved). Run once via `mcp__butterbase__apply_schema`.

```sql
-- alerts: Home/Alerts screen (§1.1 Screen 1)
CREATE TABLE alerts (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  kind            text NOT NULL,       -- 'model_mismatch' | 'key_expiry' |
                                       -- 'silence' | 'rubric_pending' |
                                       -- 'qa_insufficient' | 'cron_stale' |
                                       -- 'budget_exceeded'
  severity        text NOT NULL DEFAULT 'info', -- 'info' | 'warn' | 'critical'
  title           text NOT NULL,
  body_md         text,
  payload         jsonb,                -- kind-specific
  status          text NOT NULL DEFAULT 'open', -- 'open' | 'resolved' | 'dismissed'
  action_url      text,                 -- primary-action target (relative)
  created_at      timestamptz NOT NULL DEFAULT now(),
  resolved_at     timestamptz,
  resolved_by     text                  -- actor
);
CREATE INDEX ON alerts (status, created_at DESC);
CREATE INDEX ON alerts (kind, status);

-- rubric_deltas: Rubric screen (§1.1 Screen 3), A3 two-gate flow
CREATE TABLE rubric_deltas (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  proposed_at           timestamptz NOT NULL DEFAULT now(),
  delta_type            text NOT NULL,  -- 'ban_add' | 'ban_remove' |
                                        -- 'weight_change' | 'anchor_add'
  proposal              jsonb NOT NULL, -- full delta spec
  rationale             text NOT NULL,  -- Ashish's 1-2 sentences
  signal                jsonb NOT NULL, -- {n_edits, post_ids[], example_before,
                                        --  example_after, dimension_delta}
  status                text NOT NULL DEFAULT 'proposed',
                      -- 'proposed' | 'ashish_approved' | 'shipped' |
                      -- 'killed' | 'deferred'
  ashish_approved_at    timestamptz,
  ashish_token_hash     text,           -- signed-link token (prevents replay)
  ramesh_approved_at    timestamptz,
  shipped_at            timestamptz,
  killed_reason         text,
  deferred_until        timestamptz,
  defer_count           int NOT NULL DEFAULT 0,
  rubric_version_id     uuid            -- set when shipped
                         REFERENCES rubric_versions(id)
);
CREATE INDEX ON rubric_deltas (status, proposed_at DESC);

-- draft_sessions: Compose screen (§1.1 Screen 2) autosave + version
CREATE TABLE draft_sessions (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  draft_id        uuid NOT NULL REFERENCES drafts(id),
  body_md         text NOT NULL,
  saved_at        timestamptz NOT NULL DEFAULT now(),
  saved_by        text NOT NULL,         -- 'ramesh' | 'system' | 'ashish-superuser'
  autosave        boolean NOT NULL DEFAULT false,
  client_rev      bigint NOT NULL        -- monotonic per-session; prevents
                                         -- cross-tab clobber
);
CREATE INDEX ON draft_sessions (draft_id, saved_at DESC);
-- keep last 50 per draft; older pruned by fn_prune_draft_sessions cron

-- topic_picker_options: read-only projection of the weekly top-3 for
-- the topic-picker email + Pipeline screen topic-card
CREATE TABLE topic_picker_options (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  week_iso            text NOT NULL,     -- '2026-W17'
  topic_id            uuid NOT NULL REFERENCES topics(id),
  rank                int NOT NULL,      -- 1..3 (4 if a sequel slot fires; see Part 2)
  dedup_tag           text NOT NULL,     -- 'novel' | 'sequel' | 'recycled'
  sequel_of_post_id   uuid REFERENCES published_posts(id),
  rationale           text,              -- one-liner shown in picker email
  picked_at           timestamptz,       -- Ramesh's click-timestamp
  sent_to_ramesh_at   timestamptz
);
CREATE UNIQUE INDEX ON topic_picker_options (week_iso, rank);

-- pipeline_events: Pipeline screen event log (§1.1 Screen 4)
CREATE TABLE pipeline_events (
  id              bigserial PRIMARY KEY,
  post_week_iso   text NOT NULL,          -- '2026-W17'
  from_state      text,
  to_state        text NOT NULL,
  event           text NOT NULL,
  side_effects    jsonb,                  -- {email_sent, model_used, ...}
  actor           text NOT NULL DEFAULT 'system',
  ts              timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX ON pipeline_events (post_week_iso, ts);

-- system_config: singletons (one row only, id='global')
CREATE TABLE system_config (
  id                  text PRIMARY KEY DEFAULT 'global',
  pipeline_paused     boolean NOT NULL DEFAULT false,
  last_ramesh_ping_at timestamptz,        -- any /admin hit; drives A4 silence
  created_at          timestamptz NOT NULL DEFAULT now(),
  updated_at          timestamptz NOT NULL DEFAULT now()
);

-- email_prefs: Settings screen
CREATE TABLE email_prefs (
  id              text PRIMARY KEY DEFAULT 'global',
  health_day      text NOT NULL DEFAULT 'mon', -- 'mon'..'sun'
  health_hour_pt  int NOT NULL DEFAULT 7,
  recipient       text NOT NULL,
  alert_kinds_on  text[] NOT NULL DEFAULT
    ARRAY['model_mismatch','key_expiry','cron_stale']::text[]
);

-- model_stage_config: Settings screen model pins
CREATE TABLE model_stage_config (
  stage           text PRIMARY KEY,     -- 'drafter' | 'critic' | 'rewriter' |
                                        -- 'interview_bot' | 'scout_dedup_embed'
  expected_model  text NOT NULL,
  updated_at      timestamptz NOT NULL DEFAULT now(),
  updated_by      text NOT NULL
);

-- credentials_metadata: Settings screen rotation calendar (mirror of 1Password)
CREATE TABLE credentials_metadata (
  key_name        text PRIMARY KEY,     -- 'thedi:ionrouter:api-key', ...
  rotated_at      timestamptz NOT NULL,
  next_due_at     timestamptz NOT NULL,
  rotation_doc    text                  -- link to docs/ROTATION.md#<anchor>
);
```

Plus the v2 tables already declared in [iter-2 D2 §2b](../iter2/D2-installer-walkthrough.md): `topics`, `qa_sessions`, `drafts`, `rubric_versions`, `published_posts`, `health_heartbeats`, `audit_log`. `rubric_versions` gets one new column this spec adds: `active boolean NOT NULL DEFAULT false`.

#### JSON API contracts (read from the SPA, served by `fn_admin_api`)

All endpoints require a valid Butterbase session cookie; all enforce the Google OAuth email allowlist at the edge.

```
GET  /fn/admin/home
  → { alerts: Alert[], stats_7d: Stats, current_week: WeekSummary,
      pipeline_paused: boolean }

GET  /fn/admin/compose/:draft_id
  → { draft: Draft, qa_session: QASession | null,
      critic_edits: Edit[], rubric_scores: Scores,
      prior_autosaves: Session[] /* last 5 */ }
PUT  /fn/admin/compose/:draft_id
  { body_md: string, client_rev: number }
  → { saved_at: ts, server_rev: number } | 409 if stale client_rev
POST /fn/admin/compose/:draft_id/action
  { action: 'approve' | 'reject' | 'published', reason?, substack_url? }
  → { new_status: string }

GET  /fn/admin/rubric
  → { pending: RubricDelta[], history: RubricVersion[],
      current_version: number }
POST /fn/admin/rubric/:delta_id
  { action: 'approve' | 'reject' | 'defer', reason? }
  → { new_status: string }

GET  /fn/admin/pipeline
  → { week_iso: string, events: PipelineEvent[],
      current_state: string, post_id: uuid, topic_id: uuid,
      pipeline_paused: boolean }
POST /fn/admin/pipeline/pause
  { paused: boolean }
POST /fn/admin/pipeline/force_advance
  { to_state: string, reason: string }

GET  /fn/admin/settings
  → { oauth: {google, linkedin, anthropic},
      model_pins: {stage, expected_model}[],
      email_prefs: EmailPrefs,
      ai_usage_30d: UsageReport,
      credentials: CredentialMetadata[] }
PUT  /fn/admin/settings/model_pin
  { stage: string, expected_model: string }
PUT  /fn/admin/settings/email_prefs
  { day: string, hour: int, recipient: string, alert_kinds_on: string[] }
POST /fn/admin/settings/credential_rotated
  { key_name: string }  // resets rotated_at = now()

POST /fn/admin/ping   // on every /admin navigation; resets silence counter
  → { ok: true, last_ramesh_ping_at: ts }
```

The SPA calls `POST /fn/admin/ping` on every route change. This is the A4 silence-counter reset hook (see §1.4).

### 1.3 State machine (the pipeline's source of truth)

Single authoritative table: `pipeline_events`. Read: "for week W, what's the latest `to_state`?" → current state. The Pipeline screen projects this.

| from_state | event | to_state | side_effect |
|---|---|---|---|
| *(none)* | `fn_scout_daily` run | `scout_complete` | insert `topics` rows |
| `scout_complete` | Thu 07:00 PT cron → `fn_topic_picker_email` | `topic_sent` | email Ramesh top-3 via Resend |
| `topic_sent` | Ramesh clicks picker link | `topic_picked` | update `topics.picked_at`; insert `pipeline_events`; fire `fn_interview_bot` |
| `topic_picked` | `fn_interview_bot` returns questions | `qa_sent` | email Ramesh Q&A link; insert `qa_sessions` row |
| `qa_sent` | Ramesh submits any answer | `qa_in_progress` | update `qa_sessions.answers`, word_count |
| `qa_in_progress` | Deadline (Sun 20:00 PT) AND word_count≥500 | `qa_closed` | set `qa_sessions.status='closed'`; fire `fn_drafter` |
| `qa_in_progress` | Deadline AND word_count<500 | `qa_insufficient_material` | send Ramesh the 3-option email ([D1 §1.5](../iter2/D1-interview-bot-and-rubric.md)) |
| `qa_insufficient_material` | Ramesh picks (a) skip | `week_skipped` | email Ashish; no draft |
| `qa_insufficient_material` | Ramesh picks (b) voice-memo | `qa_in_progress` | accept MacWhisper transcript; re-extend deadline |
| `qa_insufficient_material` | Ramesh picks (c) extend 48h | `qa_in_progress` | resend questions, bump deadline |
| `qa_insufficient_material` | No reply after 48h | `week_skipped` | default action |
| `qa_closed` | `fn_drafter` start | `drafting` | IonRouter kimi-k2.5; assert `model==expected` |
| `drafting` | `fn_drafter` done | `critiquing` | insert `drafts` row with `body_md`; fire `fn_critic` |
| `drafting` | model-ID mismatch OR exception | `error` | insert `alerts` row; email Ramesh |
| `critiquing` | score ≥ 65 | `review_pending` | insert compose-ready event |
| `critiquing` | score < 65 AND round < 2 | `rewriting` | fire `fn_rewriter` |
| `critiquing` | score < 65 AND round == 2 | `review_pending` | insert `alerts` row "manual review — critic never passed" |
| `rewriting` | `fn_rewriter` done | `critiquing` | round++; re-fire `fn_critic` |
| `review_pending` | Ramesh clicks Approve in compose | `approved` | insert `published_posts` row with `status='awaiting_manual_paste'`; copy to clipboard |
| `review_pending` | Ramesh clicks Reject | `rewriting` | reason stored; round=2 (hard cap) |
| `review_pending` | Ramesh clicks Discard | `week_skipped` | email Ashish |
| `approved` | Ramesh clicks "Mark as published" + URL | `published` | update `published_posts.substack_url, published_at`; fire `fn_syndicate_linkedin_x` |
| `published` | `fn_syndicate_linkedin_x` done | `syndicated` | update LinkedIn URN + X post id |
| *(any)* | Ramesh silent 14d | `paused` (on `system_config`) | all crons check `pipeline_paused` before running |
| `paused` | Ramesh hits `/admin` | *(prior state resumed)* | update `system_config.last_ramesh_ping_at=now()`; pipeline resumes |

Every transition writes one row to `pipeline_events` with `from_state`, `to_state`, `side_effects jsonb`, `actor`. This table IS the state machine; everything else is a view of it.

### 1.4 Auth and session behavior

**OAuth flow** (implemented via `mcp__butterbase__configure_oauth_provider`):
1. Ramesh visits `https://thedi-ramesh.butterbase.dev/admin` → SPA checks session cookie.
2. No cookie → redirect to `/auth/google/login` → Google consent → callback at `/auth/google/callback`.
3. Butterbase matches returned email against `allowed_emails` allowlist (`["ramesh@nampalli.dev", "ashish-superuser@platformy.org"]`).
4. On match: Butterbase issues session JWT (24h TTL); SPA stores in httpOnly cookie; audit row written with `actor=ramesh` (or `ashish-superuser`) and `action=login`.
5. On no match: Butterbase returns 403; SPA shows "Not authorized" page with support link.

**Ashish's view-only access.**
- Separate allowlist entry `ashish-superuser@platformy.org`.
- Every API endpoint checks the session email: if `ashish-superuser`, every `POST`/`PUT`/`DELETE` is allowed BUT flagged in `audit_log.actor='ashish-superuser'` with `warn: true`.
- The SPA renders a persistent red banner "Viewing as ashish-superuser — all actions are audited to Ramesh" when logged in as Ashish.
- `[assumption]`: Ashish should almost never need write access in prod; any POST from `ashish-superuser` also triggers a real-time email to Ramesh ("Ashish just did X via admin superuser"). Makes the audit trail proactive, not retrospective.

**Session timeout.** 24h JWT TTL. Refresh via silent Google SSO on focus (standard OAuth refresh token exchange). If refresh fails (revoked consent, password change), kick to `/auth/google/login` preserving return URL.

**The A4 "silence → pause" check.**
- **Where it runs.** Inside `fn_heartbeat_watcher` (cron `0 * * * *`, hourly). Every run, the function reads `system_config.last_ramesh_ping_at`. If `now() - last_ramesh_ping_at > interval '14 days'` AND `pipeline_paused=false` → sets `pipeline_paused=true`; writes `alerts` row `kind='silence'` `severity='critical'`; emails Ramesh + Ashish.
- **Why `fn_heartbeat_watcher` and not a separate function.** It already runs hourly and already touches `system_config`. Adding one branch keeps the control surface small.
- **Reset trigger.** Any successful `POST /fn/admin/ping` updates `last_ramesh_ping_at = now()` AND if `pipeline_paused=true` AND the pause was silence-triggered (check `alerts.kind='silence'` unresolved) → flips `pipeline_paused=false` and resolves the silence alert. Pipeline resumes where it left off.
- **Why 14d not 21d.** The D1 rubric-recalibration spec already has a 7-day Ramesh-silence window on rubric approvals; 14d on the whole pipeline is the natural double. Also: 14d = 2 weekly cycles missed — enough data to conclude "Ramesh is not engaged right now" but not so long that scout keeps burning IonRouter credits on topics he'll never see.
- **Override.** Ramesh can pre-set a vacation window from Settings ("pause pipeline from DATE to DATE"); during that window, silence-counter is paused. `[assumption]`: this UI is Phase-1.5 if time is tight.

### 1.5 Ship order (~6h, 30-min slices)

Aligned with iter-2 D2 Appendix B's priority (compose → alerts → rubric → settings). Pipeline screen is cheap because it's just a projection of `pipeline_events`; slot it late.

| slot | mins | task | cumulative |
|---|---|---|---|
| 0:00–0:30 | 30 | Bootstrap: create `frontend/admin/`, `index.html` + `app.js` + `styles.css`; serve "Hello admin" via `mcp__butterbase__create_frontend_deployment`; verify route lives at `/admin` | 0:30 |
| 0:30–1:00 | 30 | OAuth wiring: `configure_oauth_provider` + allowlist; confirm Ramesh's email round-trips; audit row on login | 1:00 |
| 1:00–1:30 | 30 | `fn_admin_api` skeleton — one Deno function routing `/fn/admin/*`; session-cookie auth check; `POST /ping` endpoint | 1:30 |
| 1:30–2:00 | 30 | Schema: apply the 8 new tables (§1.2 DDL); seed `system_config` + `email_prefs` + `model_stage_config` rows | 2:00 |
| 2:00–2:30 | 30 | **Compose screen — editor skeleton**: textarea + `marked.js` preview; `GET /admin/compose/:id`; render `body_md` | 2:30 |
| 2:30–3:00 | 30 | **Compose screen — autosave + approve/reject buttons**: `PUT` every 15s; `POST action`; `localStorage` fallback | 3:00 |
| 3:00–3:30 | 30 | **Compose screen — sidebar**: Q&A verbatim pin + critic edits panel; click-to-jump on edits | 3:30 |
| 3:30–4:00 | 30 | **Home/Alerts**: list view, actions, stats bar, "I'm here" button, pause toggle | 4:00 |
| 4:00–4:30 | 30 | **Rubric screen**: list pending deltas; approve/reject/defer buttons; `fn_revalidate_golden_set` fire on approve | 4:30 |
| 4:30–5:00 | 30 | **Pipeline screen**: project `pipeline_events` into the timeline; pause/force-advance buttons | 5:00 |
| 5:00–5:30 | 30 | **Settings screen**: OAuth status rows, model-pin list, rotation calendar, email prefs form | 5:30 |
| 5:30–6:00 | 30 | **Polish + the A4 check**: `fn_heartbeat_watcher` branch for silence→pause; smoke-test all 5 screens as Ramesh in dry-run env; commit | 6:00 |

**Riskiest slot** (see summary): **Compose screen's autosave-without-clobber** (slot 2:30–3:00). It's the only feature that has genuine concurrency semantics (Ramesh editing in Tab A, `fn_rewriter` writing in Tab B from a critic callback). The `client_rev` monotonic counter in `draft_sessions` plus 409-on-stale is the mitigation; if it doesn't land clean in its 30-min slot, the fallback is dumber-autosave-with-last-write-wins and a banner "Edits may be overwritten if pipeline is mid-rewrite." That fallback ships in 10 min; the proper version risks eating 60 min. **Ship the fallback if slot 2:30 slips**; upgrade to `client_rev` in Phase-1.5.

---

## Part 2 — Scout embedding-based dedup + semantic recycle handling

### 2.0 Framing

The Thedi v1 scout (`scout_polish_now`, `scout_findings_by_token`, etc. — see `/Users/mei/ledger-creative-analyzer/thedi/functions/`) ranks arxiv + HN candidates by a scoring rubric and returns a top-3 list. It has **no dedup against prior weeks**. Over 12 weeks it will propose "multi-agent reliability" 3x ([Round 2 critic](../round2/critic-report.md) §Gaps: "over 12 weeks the scout will surface the same arxiv threads repeatedly"). Brief 05 mentioned a "recycle/sequel filter" but never specified it; iter-1's plan promised "dedup against Postgres `published_posts`" but punted on algorithm. This section fills both gaps.

### 2.1 Dedup algorithm

**Embedding choice: Butterbase's built-in AI gateway embedding endpoint.**

Butterbase supports OpenAI-compatible embeddings natively ([Butterbase docs §AI §Embeddings](https://butterbase.dev/docs)). Three models available:

| Model | ID | Dims | Relative cost |
|---|---|---|---|
| Text Embedding 3 Small | `openai/text-embedding-3-small` | 1536 | 1× baseline |
| Text Embedding 3 Large | `openai/text-embedding-3-large` | 3072 | ~6.5× |
| Text Embedding Ada 002 | `openai/text-embedding-ada-002` | 1536 | ~1.3× |

**Recommend `openai/text-embedding-3-small`.** Ada is legacy; Large is 6.5× the cost for a ~5% retrieval-quality lift (OpenAI's own numbers, which align with the [MTEB 2025 leaderboard](https://huggingface.co/spaces/mteb/leaderboard)) that Thedi does not need. The D1 question-dedup system already uses `text-embedding-3-small` at 0.88 threshold; using the same model keeps the two corpora (questions + topics) comparable.

**Cost per 1k vectors.** OpenAI's published rate for `text-embedding-3-small` is $0.02/1M tokens. A topic record (title + summary + 3 source snippets) is ~1k tokens. So 1 topic ≈ $0.00002; 1k vectors ≈ $0.02. Scout runs daily with ~20 candidates per run → ~$0.0004/day → ~$0.15/year. Negligible vs. the $0.037/post drafter spend.

**Vector storage: Butterbase Postgres `vector(N)` column (pgvector native).**

Verified via `mcp__butterbase__butterbase_docs` §schema: Butterbase's schema DSL explicitly supports `vector(N)` columns (pgvector extension is installed by default). Example from the docs is literally a `documents` table with `"embedding": { "type": "vector(1536)" }`. **No side-table, no JSON-blob workaround.** This is the recommended path.

```sql
-- Schema addition (extends the `topics` and `published_posts` tables
-- declared in iter-2 D2 §2b)
ALTER TABLE topics          ADD COLUMN embedding vector(1536);
ALTER TABLE published_posts ADD COLUMN embedding vector(1536);

-- pgvector ivfflat index for fast cosine-similarity search
CREATE INDEX idx_topics_embedding          ON topics          USING ivfflat (embedding vector_cosine_ops) WITH (lists=50);
CREATE INDEX idx_published_posts_embedding ON published_posts USING ivfflat (embedding vector_cosine_ops) WITH (lists=50);
```

**Embedding input.** Concatenate `title || ' \n ' || summary || ' \n ' || (top-3 source snippets joined by '\n')`. Truncate to 8000 chars to stay under the embedding model's 8192-token input cap.

**Similarity threshold: cosine similarity > 0.82 = "already covered"; 0.70–0.82 = "sequel candidate"; <0.70 = "novel."**

| Band | Cosine sim | Interpretation | Action |
|---|---|---|---|
| **Dedup** | >0.82 | Near-same topic, same angle | Drop candidate, promote next |
| **Sequel** | 0.70–0.82 | Adjacent topic, potentially fresh angle | Surface with sequel label to Ramesh |
| **Novel** | <0.70 | Unrelated enough to stand alone | Surface as novel |

**Tuning justification.** The D1 question-dedup uses 0.88 for *near-paraphrase* (OpenAI cookbook: 0.85+ near-paraphrase, 0.90+ same-meaning). Topic-level dedup should be *looser* than question-level because:
1. Topics are broader (a "multi-agent orchestration" topic covers many sub-angles; a question pins one).
2. False-negatives here cost real Ramesh annoyance (same topic twice > accidentally dropped variant).
3. The [OpenAI text-embedding-3 cookbook](https://cookbook.openai.com/examples/semantic_textual_similarity) reports topic-level cosine 0.75–0.85 as "same general subject, different specifics"; 0.82 is the upper half of that band.

The sequel band (0.70–0.82) is chosen to catch "same cluster, shifted sub-cluster" — Brief 05's recycle/sequel case. 0.70 lower-bound corresponds roughly to "same domain, unrelated sub-topic" in the MTEB STS benchmark ([MTEB 2025](https://huggingface.co/spaces/mteb/leaderboard)).

**Tuning protocol (post-Phase-1):** after 10 posts published, run a one-off eval: score every pair of (new topic, prior post) by cosine; spot-check 20 pairs at each threshold band; let Ramesh hand-label "actually dupe" / "actually sequel" / "actually novel"; compute confusion and shift thresholds. `[assumption]`: 0.82 / 0.70 hold until the N=10 eval; only the eval moves them.

**Window: 90-day rolling, recommended.**

| Window | Pro | Con |
|---|---|---|
| All-time | No topic ever re-proposed; strongest anti-repeat | Over 12+ months, forever-banned clusters become a problem ("agents changed a lot; Ramesh's Post 1 was 18 months ago; the topic is fresh now") |
| 90-day rolling | Fresh angles on older topics allowed | Possible to re-propose at day 91 |

**Recommend 90-day rolling**, with a secondary "permanent sequel lineage" signal: every dedup check also computes `sequel_of_post_id` by finding the single highest-similarity all-time published post even if it's >90 days old. Scout proposes the topic as novel (within 90d window) but labels it with lineage in the picker email. This gives Ramesh context without suppressing legitimately-refreshable topics. Matches the D1 question-dedup's 90d window for consistency.

### 2.2 Semantic recycle handling (sequel lineage)

**Scout identifies sequel candidates** by:
1. Embed the candidate topic.
2. Find nearest-neighbor `published_posts` via `ORDER BY embedding <=> $1 LIMIT 5` (pgvector cosine-distance).
3. If best match sim ∈ [0.70, 0.82] → flag `dedup_tag='sequel'`, record `sequel_of_post_id=<best_match.id>`.
4. Additional "different sub-cluster" check: the candidate's `anchor_nouns` (extracted from `summary` via the same NER pass used for D1 question dedup) must differ from the prior post's `anchor_nouns` by at least 2 nouns; if not, demote to `dedup_tag='recycled'` and drop.
5. "Different evidentiary set" check: compare `source_urls` intersection; if >50% overlap with the prior post's sources → demote to `recycled` and drop (same papers → same post, more or less).

**Topic-picker email framing** (sequel candidate line):

```
3. "Debouncing 429-storms in LLM autoscaler reconciliation loops"
   (sequel to Post 14 — "Autoscaler retry policy under partial-failure")
   Fresh angle: specifically about 429 vs. 503 handling; prior post stayed
   generic. New evidence: arxiv:2604.01823 §3.
   [ Pick this one: https://thedi-ramesh.butterbase.dev/pick/{{token}}/3 ]
```

**Data schema for sequel lineage.**

```sql
-- Added to topics (declared in D2 §2b):
ALTER TABLE topics ADD COLUMN dedup_tag         text; -- 'novel' | 'sequel' | 'recycled'
ALTER TABLE topics ADD COLUMN dedup_sim_best    float;
ALTER TABLE topics ADD COLUMN sequel_of_post_id uuid REFERENCES published_posts(id);
ALTER TABLE topics ADD COLUMN dedup_reason      text; -- free-text explanation

-- Dedicated lineage table, for graph-traversal queries
-- ("show me every descendant of Post 14")
CREATE TABLE post_lineage (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  ancestor_post_id  uuid NOT NULL REFERENCES published_posts(id),
  descendant_topic_id uuid REFERENCES topics(id),
  descendant_post_id  uuid REFERENCES published_posts(id),
  relation_kind     text NOT NULL,  -- 'sequel' | 'direct_response' | 'retraction'
  cosine_sim        float NOT NULL,
  anchor_delta      text[],         -- nouns that differ
  created_at        timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX ON post_lineage (ancestor_post_id);
CREATE INDEX ON post_lineage (descendant_post_id);
```

### 2.3 Integration with the topic-picker email

**Email template diff vs. v1.** v1 sends top-3 as a naked list; v2 adds a 1-line "why this one" under each entry. If one of the 3 top-ranked candidates was dedup'd out, the 4th candidate is promoted into its slot and the email notes the substitution.

**New template (v2, paste-ready for `fn_topic_picker_email`):**

```
Subject: Thedi — pick this week's topic (3 options, takes 30 seconds)

Ramesh,

Here are this week's top candidates from scout. Reply with the number or
click a link to pick.

1. {{candidate_1.title}}
   {{candidate_1.summary_one_liner}}
   {% if candidate_1.dedup_tag == 'novel' %}
     (novel — not covered in the last 90 days)
   {% elif candidate_1.dedup_tag == 'sequel' %}
     (sequel to Post {{candidate_1.sequel_post_number}} — "{{...title}}")
     Fresh angle: {{candidate_1.dedup_reason}}
   {% endif %}
   [ Pick: https://thedi-ramesh.butterbase.dev/pick/{{token}}/1 ]

2. {{candidate_2.title}}
   ... (same as above)
   [ Pick: .../2 ]

3. {{candidate_3.title}}
   ... (same as above)
   [ Pick: .../3 ]

{% if any_dedup_substitutions %}
Note: candidate #{{substituted_rank}} was dropped (too close to Post
{{dropped_close_to}} — cosine {{sim}}). The fourth candidate replaced it.
{% endif %}

Reply with just the number (1/2/3), or click a link.
Default on no reply by Sunday 09:00 PT: skip this week.

— Thedi
```

**Picker click URL handler.** `GET /pick/:token/:rank` → validates signed token → writes `topic_picker_options.picked_at`, fires the state-machine transition `topic_sent → topic_picked` → redirects Ramesh to `/admin/pipeline` showing "topic picked; Q&A incoming."

### 2.4 Failure modes

**Mode A: pgvector extension not installed on startup.**
- **Detection.** At install time, the installer script runs `mcp__butterbase__apply_schema` with the `vector(1536)` column. If pgvector is missing, the schema apply hard-fails with a clear Postgres error (`type "vector" does not exist`).
- **Handling.** Butterbase docs explicitly support `vector(N)` as a first-class type (verified via `mcp__butterbase__butterbase_docs` §schema). If apply fails anyway, the installer detects the failure-message, halts, and tells the operator: "pgvector not available on this region — either pick us-west-2 or us-east-1 (both confirmed-supported), or fall back to keyword dedup mode by setting `SCOUT_DEDUP_MODE=keyword` in env vars."
- **Keyword-dedup fallback** (graceful degradation, worse but functional): no embedding column; dedup is a Postgres `@@` full-text-search match against `title + summary` tsvector against prior 90-day `published_posts`, with hand-tuned stopwords. Loses sequel detection entirely — every keyword-match is treated as `recycled`. Sequel candidates become false-negatives (dropped as novel). **Acceptable for Phase 1 if pgvector is unavailable; explicit degraded-mode banner in the admin dashboard.**

**Mode B: embedding model silently swaps (IonRouter / Butterbase AI gateway).**
- **Mirror of the main pipeline's model-ID assertion pattern.** Every embedding call reads back `response.model` and asserts `== expected_model_for_stage`. `model_stage_config` has a row `stage='scout_dedup_embed', expected_model='openai/text-embedding-3-small'`. Mismatch → hard-fail, write `alerts` row `kind='model_mismatch'`, email Ramesh.
- **Additional drift detector.** Embeddings are only stable within a single model version. If the gateway swaps `text-embedding-3-small` for `text-embedding-3-small-v2` (hypothetical minor version bump), cosine distances between historical vectors and new vectors become non-comparable.
- **Mitigation.** `published_posts.embedding` rows are tagged with the model ID used to generate them (add a `embedding_model text NOT NULL` column). On any model-pin change in `model_stage_config`, `fn_scout_daily` refuses to run until a re-embed job (`fn_reembed_all_posts`) runs against the new model, writes fresh vectors, and updates `embedding_model` on every row. This is the embedding-space analog of the golden-set revalidation from [D1 §2.4](../iter2/D1-interview-bot-and-rubric.md).
- **Re-embed cost.** At 1 post/week × 52 weeks = 52 posts × ~$0.00002 ≈ $0.001 for a full corpus re-embed. Cheap; run whenever the model pin changes.

**Mode C: cosine threshold drifts (false positives spike).**
- **Detection.** Rolling 10-topic false-positive rate: how many "novel" candidates did Ramesh later say "we did this"? Tracked via a thumb-down button on the picker email's reply (`[ wrong — I already covered this: /feedback/{{token}}/wrong ]`).
- **Handling.** After 10 posts, run the one-off tuning eval (§2.1 "Tuning protocol"); if the thumb-down rate >20%, tighten the threshold 0.82 → 0.80; if <5% and Ramesh complains "I want to cover a refresh topic" → loosen to 0.84.

**Mode D: embedding API outage at scout-run time.**
- **Handling.** `fn_scout_daily` catches embedding API exceptions; falls back to keyword dedup for that run only; writes `alerts` row `kind='scout_embedding_failed'` `severity='warn'`; scout still produces a top-3 (never blocks the week). Embedding retry on next daily run.

---

## Appendix — open items for iter-4 or Phase-1.5

- **Vacation window UI** in Settings (pre-set pause windows) — deferred if 6h is tight.
- **Ashish-superuser real-time email to Ramesh on any write** — requires a Butterbase webhook or a wrapper in `fn_admin_api`. 30-min build, deferred to Phase-1.5.
- **Threshold auto-tuner** — Bayesian updating of 0.82 threshold from thumb-up/thumb-down feedback. Premature until N>10.
- **Sequel-dissent archetype** ([D1 §Appendix](../iter2/D1-interview-bot-and-rubric.md)) — if the sequel detector fires >3x in 4 weeks and Ramesh picks none of them, consider a 7th question archetype that directly challenges the prior post's thesis.
- **Full-text fallback's stopword list** is not specified here. `[assumption]`: stock Postgres English stopwords are adequate; if keyword dedup's false-positive rate >30% in practice, curate a Ramesh-specific list.

---

## Evidence footnotes

- [Butterbase docs — Schema DSL §Vectors](https://butterbase.dev/docs/schema) — verified `vector(N)` first-class type; pgvector installed in default regions.
- [Butterbase docs — AI Gateway §Embeddings](https://butterbase.dev/docs/ai) — `openai/text-embedding-3-small` available; OpenAI-compatible API.
- [OpenAI text-embedding-3 cookbook](https://cookbook.openai.com/examples/semantic_textual_similarity) — threshold bands for paraphrase vs. same-topic-different-specifics.
- [MTEB 2025 leaderboard](https://huggingface.co/spaces/mteb/leaderboard) — text-embedding-3-small vs. -large quality lift.
- [pgvector docs](https://github.com/pgvector/pgvector) — ivfflat index with `lists=50` as baseline for <10k rows.
- [Round 1 Brief 05 §Recommendation](../round1/05-multi-agent-orchestration.md) — recycle/sequel mention that this spec fulfills.
- [Round 2 critic report §Gaps](../round2/critic-report.md) — flagged same-topic 3× problem.
- [iter-2 D1 §1.3 Anti-repeat guardrail](../iter2/D1-interview-bot-and-rubric.md) — 0.88 question-level threshold; this spec's 0.82 topic-level threshold consistency justification.
- [iter-2 D2 §2f Frontend deployment](../iter2/D2-installer-walkthrough.md) — installer sequence for the admin dashboard this spec specifies.
- [Round 4 Thedi v2 §Red Flags A2/A3/A4/A7](../round4/thedi-v2.md) — amendments this spec implements.
