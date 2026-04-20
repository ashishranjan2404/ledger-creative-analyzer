# D2 — Installer Walkthrough & Runbook

**Author:** iter-2 deep-dive agent
**Date:** 2026-04-19
**Audience:** Ashish (runs the install); Ramesh (reads sections 1 and 5 only)
**Status:** execute-from-top runbook

Iter-1's red-flag pass named the installer the single load-bearing artifact in the entire plan. If Ramesh's 90-minute install call goes sideways on OAuth redirects, DNS propagation, or a Butterbase dashboard UI Ashish last saw 3 weeks ago, the OSS-hosting story quietly collapses into "Ashish hosts temporarily." There is no temporarily. This document's job is to make the call boring.

Per amendment **A2**, Beehiiv is out. The compose surface is a Butterbase-hosted markdown editor bundled into the admin dashboard (A4). The installer provisions that dashboard; it does not provision a Beehiiv account.

---

## 1. The install call — minute-by-minute

A Saturday morning, 9:00 PT. Ashish and Ramesh on a Zoom. Ashish has a second window open with his own local repo checked out and a terminal attached to the Butterbase MCP. Ramesh has two things open: Gmail (his personal one) and a Chrome window logged out of everything. The dry-run checklist from §3 is pasted into the chat.

### 00:00–05:00 — Pre-flight

Ashish drives. Shares screen, walks the checklist: "We'll do Butterbase account, then upstream keys, then the installer script, then OAuth, then we test a post. I'm not going to touch your keyboard. If anything stalls >5 minutes, we pause and I patch."

At minute 4, Ramesh confirms: Butterbase sign-up email (`ramesh@nampalli.dev`, not `@saviynt.com`), billing card ready, 1Password "Thedi" shared vault already created and Ashish accepted.

### 05:00–15:00 — Butterbase account + app

Ramesh drives. He signs up at `butterbase.dev`, adds card (free tier picked, card held for Pro overflow), and in the dashboard clicks "New App" → name `thedi-ramesh` → region us-west-2. He copies the app ID and service key into the 1Password "Thedi" vault as item `thedi:butterbase:service-key` with `rotated_at=<today>` and `next_due_at=<today>+1 week` (short-lived; revoked at end of call).

Ashish runs `mcp__butterbase__list_apps` to confirm he can see the app with the short-lived service key Ramesh pasted into the Zoom chat (one-time paste; deleted from chat history after).

**What Ramesh sees on screen at minute 15:** the Butterbase dashboard home for `thedi-ramesh`, an empty Functions tab, an empty Database tab.

### 15:00–30:00 — Upstream keys

Ramesh drives, Ashish narrates. For each upstream service, Ramesh opens a tab, signs up with his personal email, creates a key, pastes it into 1Password with matching `rotated_at` and `next_due_at` fields, then reads the value out into Zoom chat for Ashish to consume into the installer.

Order (bypass-first: the ones that sometimes require human review get kicked off early):

1. **IonRouter** → `IONROUTER_API_KEY`. 2 min (fast signup).
2. **Anthropic Console** → `ANTHROPIC_API_KEY` (escape hatch / judge). 3 min (may require phone verify).
3. **Resend** → `RESEND_API_KEY`. 2 min signup, but domain verification is async (§15:00–30:00 continues below).
4. **LinkedIn Developer** → OAuth client ID + secret. 3–5 min, requires creating an "app" with a product called "Share on LinkedIn" requested. Redirect URI: `https://thedi-ramesh.butterbase.dev/auth/linkedin/callback` (exact format — note lowercase app-name, `butterbase.dev` domain, `/auth/<provider>/callback` path).
5. **Google OAuth** → already provisioned at `.secrets/google_oauth_client.json`; Ashish adds Ramesh's redirect URI `https://thedi-ramesh.butterbase.dev/auth/google/callback` to the existing `thedi-493804` project's authorized redirects. Ramesh does not need a Google Cloud Console account.

**What Ramesh sees at minute 30:** six 1Password items with consistent `rotated_at`/`next_due_at` metadata. Resend DNS records pending on his domain registrar.

### 30:00–60:00 — Installer script

Ashish drives. He runs the installer script from his local repo: `./install.sh --app-id <ramesh-app-id> --env-file <paste-into-stdin>`. The script is a thin orchestrator over the MCP call sequence in §2. Per-call progress is logged to stdout. Ramesh watches.

Order of operations (each is one MCP call or a small group):

1. `mcp__butterbase__dry_run_schema` with the v2 schema → prints diff → Ramesh confirms "looks right" → `mcp__butterbase__apply_schema`.
2. `mcp__butterbase__deploy_function` × 13 (9 new v2 + 4 preserved v1). Each ~10s.
3. `mcp__butterbase__update_function_env` with the full env map — one call per function, batched in the script.
4. `mcp__butterbase__configure_oauth_provider` for Google (admin login) and LinkedIn (content posting).
5. `mcp__butterbase__enable_rls` + `mcp__butterbase__create_policy` for `drafts`, `qa_sessions`, `audit_log`.
6. `mcp__butterbase__create_frontend_deployment` for `thedi-admin` → `mcp__butterbase__set_frontend_env` → `mcp__butterbase__start_frontend_deployment`.

At minute 55, the script prints a big green "INSTALL OK" and hits `mcp__butterbase__invoke_function` on `fn_smoke_test` to exercise every credential. If any return non-200, the script halts and prints the failing credential.

**What Ramesh sees at minute 60:** the Butterbase dashboard with 13 functions listed, 7 tables in the Database tab, and a URL `https://thedi-ramesh.butterbase.dev/admin` he can click.

### 60:00–75:00 — OAuth round-trip + admin dashboard

Ramesh drives. He opens the admin URL, clicks "Sign in with Google," authenticates with `ramesh@nampalli.dev`, lands on the admin dashboard. Ashish verifies in the Butterbase `audit_log` that the row appeared and that `user_id` matches Ramesh's OAuth subject.

Then Ramesh clicks "Connect LinkedIn" → OAuth consent → redirect back. Admin dashboard now shows "LinkedIn: connected, expires in 60 days."

If either redirect fails (and they commonly do the first time because of redirect URI typos), see §4.

### 75:00–85:00 — End-to-end test

Ramesh drives. On the admin dashboard, he clicks "Compose new post" → the markdown editor opens → he types three paragraphs → clicks "Save draft." Ashish invokes `fn_weekly_health` manually via `mcp__butterbase__invoke_function` and confirms the email lands in Ramesh's inbox with correct content.

Ashish invokes `fn_scout_daily` manually. Scout writes a topics row. Ramesh sees it in the admin.

### 85:00–90:00 — Cutover and handoff

Ashish **rotates the Butterbase service key** (Ramesh generates a new one in the dashboard, pastes into vault, old one auto-expires or is manually revoked). Ashish's MCP no longer has write access. Ashish commits `HANDOFF.md` (§5) to the OSS repo with timestamps. Ramesh is now the sole operator.

**What Ramesh sees at minute 90:** the admin dashboard with one topic candidate, the HANDOFF.md URL, and the rotation calendar.

---

## 2. MCP call sequence

Every step below is either an MCP call or a concrete manual action. No hand-waves.

### 2a. Account & app creation (manual; Ramesh)

- Sign up at `butterbase.dev` with `ramesh@nampalli.dev`.
- Dashboard → "New App" → name `thedi-ramesh`, region `us-west-2`.
- Generate short-lived service key (Settings → Service Keys → "Create, expire in 24h"). Paste into 1Password vault item `thedi:butterbase:service-key`. Share value with Ashish via Zoom chat for the duration of the call only.
- Ashish configures his local MCP: `BUTTERBASE_SERVICE_KEY=<value>`, `BUTTERBASE_APP_ID=<ramesh-app-id>`.

### 2b. Schema apply

Single call: `mcp__butterbase__dry_run_schema` → inspect diff → `mcp__butterbase__apply_schema`.

Tables (all new in v2 except where noted):

| Table | Purpose | Key columns |
|---|---|---|
| `topics` | Scout output; weekly topic picker reads from here. Adds dedup column over v1. | `id`, `title`, `summary`, `source_urls[]`, `score`, `created_at`, `dedup_hash`, `picked_at` |
| `qa_sessions` | Interview-bot Q&A per topic. | `id`, `topic_id`, `questions[]`, `answers[]`, `word_count`, `status` (`open`/`closed`/`skipped`), `created_at` |
| `drafts` | Drafter + critic + rewriter state machine. | `id`, `topic_id`, `qa_session_id`, `body_md`, `model_used`, `rubric_scores` (jsonb), `round`, `status` (`drafting`/`critiquing`/`rewriting`/`review_pending`/`approved`/`published`) |
| `rubric_versions` | Voice rubric with human sign-off trail (A3). | `id`, `version`, `ban_list[]`, `keep_list[]`, `dimensions` (jsonb), `proposed_by`, `ashish_approved_at`, `ramesh_approved_at`, `active` |
| `published_posts` | Permanent record of shipped posts; scout's dedup reference. | `id`, `topic_id`, `draft_id`, `substack_url`, `published_at`, `linkedin_urn`, `x_post_id` |
| `health_heartbeats` | Cron liveness. | `id`, `job_name`, `ts`, `status`, `details_json` |
| `audit_log` | Every admin action + every model-ID assertion pass/fail. | `id`, `ts`, `actor` (`ramesh`/`system`/`ashish-install`), `action`, `payload_json` |

Plus one legacy table preserved from v1: `scout_findings` and `scout_feedback` (the Butterbase-side state used by the preserved v1 functions — see 2c).

### 2c. Function deployments

One `mcp__butterbase__deploy_function` call per entry. All use the Deno runtime.

**Preserved from v1 (4):**
- `scout_feedback_preview` — existing; shows a scored topic preview. Untouched.
- `scout_feedback_submit` — existing; stores feedback on a topic candidate. Untouched.
- `scout_findings_by_token` — existing; token-gated JSON endpoint for the v1 feedback UI. Untouched.
- `scout_polish_now` — existing; on-demand rerun of scout scoring. Untouched.

**New v2 (9):**

| Function | Trigger | Purpose |
|---|---|---|
| `fn_scout_daily` | Cron `0 13 * * *` UTC (06:00 PT) | Daily arxiv + HN scout, writes to `topics`. Dedup against `published_posts.dedup_hash` over trailing 90d. |
| `fn_topic_picker_email` | Cron `0 14 * * 4` UTC (Thu 07:00 PT) | Emails Ramesh top-3 `topics` from last 7d; email contains reply-link for pick. |
| `fn_interview_bot` | HTTP (called by admin UI) | Given `topic_id`, generates 4–6 Socratic Q&A prompts via IonRouter; writes to `qa_sessions`. |
| `fn_drafter` | HTTP (called when `qa_sessions.status=closed`) | IonRouter kimi-k2.5. Anchors to Q&A verbatim. Asserts `response.model == kimi-k2.5` — hard-fail on mismatch. Writes `drafts` row. |
| `fn_critic` | HTTP (called on new `drafts` row in `drafting`) | IonRouter gpt-oss-120b. Separate context. Scores voice_fidelity × 2, factual_accuracy, concreteness, flow_coherence, slop_absence. Asserts model. |
| `fn_rewriter` | HTTP (called when critic score < threshold, `round < 2`) | Same model as drafter. Max 2 rounds hard cap. |
| `fn_composer_editor` | HTTP (admin UI markdown editor backend) | Save/load draft bodies as markdown. Replaces the Beehiiv CMS path (amendment A2). |
| `fn_weekly_health` | Cron `0 14 * * 1` UTC (Mon 07:00 PT) | Aggregates last 7d stats; emails Ramesh via Resend. |
| `fn_heartbeat_watcher` | Cron `0 * * * *` (hourly) | Checks `health_heartbeats` — alerts Ramesh if any job silent >26h. |

Plus one deploy-time-only utility (deploy then invoke once to verify, then leave in place):

- `fn_smoke_test` — exercises every credential with a minimal call (IonRouter ping, Resend send-to-self, LinkedIn `GET /me`, Anthropic ping). Used during install and for break-glass after key rotation.

### 2d. Env var setup

Single batch: one `mcp__butterbase__update_function_env` per function. The env map reflects the credential matrix from Round 3 C.

**Global (every function):**
```
IONROUTER_API_KEY
ANTHROPIC_API_KEY
RESEND_API_KEY
SUPABASE_JWT_SECRET  (auto-provisioned by Butterbase)
THEDI_SENDER_EMAIL   (ramesh's choice: thedi@nampalli.dev preferred;
                      thedi@platformy.org acceptable with Ashish-DNS caveat)
```

**`fn_topic_picker_email`, `fn_weekly_health`, `fn_heartbeat_watcher`:** `RAMESH_EMAIL=ramesh@nampalli.dev`.

**`fn_drafter`, `fn_rewriter`:** `EXPECTED_MODEL=moonshotai/kimi-k2.5`.
**`fn_critic`:** `EXPECTED_MODEL=openai/gpt-oss-120b`.
**`fn_interview_bot`:** `EXPECTED_MODEL=moonshotai/kimi-k2.5`.

**LinkedIn cross-post function (lives inside `fn_composer_editor` as a sub-action):** `LINKEDIN_CLIENT_ID`, `LINKEDIN_CLIENT_SECRET` (from the OAuth provider config, §2e).

**Do NOT set:** `BEEHIIV_API_KEY` (dropped per A2), `GROQ_API_KEY` (voice workflow deferred), `SUBSTACK_*` (no API exists).

### 2e. OAuth provider configuration

Two providers. Both configured via `mcp__butterbase__configure_oauth_provider`.

**Google (admin sign-in for Ramesh):**
- Client ID: `38704078361-p6gs7qgq5fitc9mv0ei9j2qr8pgq3e2v.apps.googleusercontent.com` (from `.secrets/google_oauth_client.json`).
- Client secret: from same file.
- Redirect URI (must be registered in Google Cloud Console before install call): `https://thedi-ramesh.butterbase.dev/auth/google/callback`.
- Scopes: `openid email profile`.
- Allowed user emails (allowlist in `configure_oauth_provider`): `["ramesh@nampalli.dev"]`. If anyone else lands on `/admin`, Google auth completes but Butterbase rejects with 403 before session issuance. This is the recusal kill-switch surface.

**LinkedIn (content cross-post):**
- Client ID + secret: from Ramesh's LinkedIn Developer app created at minute 15.
- Redirect URI: `https://thedi-ramesh.butterbase.dev/auth/linkedin/callback`.
- Scopes: `w_member_social` only. No profile, no email — minimum blast radius.
- Refresh token storage: Butterbase OAuth state table (managed automatically).

### 2f. Frontend deployment (admin dashboard, per A4)

The admin dashboard is a small React SPA bundled into the repo at `frontend/admin`. Three MCP calls:

1. `mcp__butterbase__create_frontend_deployment` → name `thedi-admin`, source type `git` (pointing at the OSS repo at the pinned v2 tag), build command `npm run build`, output dir `dist`.
2. `mcp__butterbase__set_frontend_env` → `VITE_APP_ID=<app-id>`, `VITE_GOOGLE_CLIENT_ID=<client-id>`, `VITE_API_BASE=https://thedi-ramesh.butterbase.dev/fn`.
3. `mcp__butterbase__start_frontend_deployment` → returns URL `https://thedi-ramesh.butterbase.dev/admin`.

The SPA has four routes:
- `/admin` — home; open alerts, required actions, last 7d stats.
- `/admin/compose` — markdown editor (Butterbase-hosted; this is the A2 replacement for Beehiiv).
- `/admin/rubric` — pending rubric deltas from A3; approve/ignore.
- `/admin/settings` — connected OAuth providers; rotate-now buttons with runbook links.

If Ramesh doesn't hit `/admin` for 14 days, `fn_weekly_health` flips a `pipeline_paused=true` flag in a `system_config` row. This is the A4 pause-on-silence mechanism.

---

## 3. Dry-run protocol

**Hard rule: the real Ramesh install does not happen until a clean dry-run has been completed against a throwaway account within the last 48 hours.**

### 3a. Throwaway account convention

- Butterbase signup: `ash-test+ramesh-YYYY-MM-DD@platformy.org` (Gmail plus-addressing). App name: `ramesh-test-YYYY-MM-DD`.
- Domain for Resend verification: Ashish uses a subdomain of `platformy.org` (e.g., `ramesh-test.platformy.org`) so DNS is under his control; the real install uses Ramesh's actual domain DNS.
- LinkedIn app: created under Ashish's own LinkedIn Developer account with redirect URI matching `ramesh-test-YYYY-MM-DD.butterbase.dev`.
- Google OAuth: the existing `thedi-493804` Google Cloud project already has this redirect URI pre-authorized (one-time add by Ashish).

### 3b. What gets dry-run tested

Every external-service touchpoint. Each row below produces a PASS/FAIL in the artifact.

| # | Step | What PASS looks like |
|---|---|---|
| D1 | Butterbase signup + app creation + service key | `list_apps` returns the app; service key authenticates |
| D2 | Schema dry-run + apply, all 7 tables | `get_schema` returns matching definition |
| D3 | Deploy all 13 functions | `list_functions` returns 13 entries |
| D4 | Env map applied to every function | `fn_smoke_test` returns 200 for every upstream |
| D5 | IonRouter key works + model assertion | `fn_smoke_test` returns `{model: "moonshotai/kimi-k2.5"}` matching `EXPECTED_MODEL` |
| D6 | Resend domain DNS verified | Resend dashboard shows "verified" (not just "pending") |
| D7 | Resend send-to-self | Test email arrives within 60s |
| D8 | LinkedIn OAuth round-trip | Consent page loads; callback lands; refresh token in Butterbase |
| D9 | LinkedIn `w_member_social` scope works | `fn_smoke_test` posts a draft LinkedIn update and deletes it |
| D10 | Google OAuth round-trip | Sign-in redirect works; allowlist rejects non-Ramesh email |
| D11 | Admin dashboard deployment | URL loads; SPA renders |
| D12 | Admin dashboard auth | Signed-in Ramesh equivalent test account sees dashboard home |
| D13 | `fn_scout_daily` invocation | Writes a topics row |
| D14 | `fn_topic_picker_email` invocation | Email arrives |
| D15 | `fn_interview_bot` → `fn_drafter` → `fn_critic` round-trip | Draft row with rubric scores present |
| D16 | `fn_weekly_health` invocation | Health email arrives with all sections populated |
| D17 | `fn_heartbeat_watcher` triggered on stale heartbeat | Alert email arrives |
| D18 | Service key rotation | Old key returns 401; new key works |
| D19 | Frontend env rotation | `set_frontend_env` + restart deploys new env |
| D20 | Tear-down (`delete_app`) | Throwaway app is gone |

### 3c. Dry-run artifact format

A markdown file `dry-run-ramesh-YYYY-MM-DD.md` committed to the OSS repo under `install-logs/` with:

- Date, account email, app name.
- One row per D1–D20 above: PASS / FAIL / timestamp / notes.
- Any screenshots captured for D6, D8, D10 (the three OAuth/DNS steps that most often fail).
- Total wall-clock time for the dry-run (target: ≤120 min).
- A "ready for real install" checkbox at the bottom, initialed by Ashish.

### 3d. Dry-run failure handling

If any D-step fails:

1. Ashish does NOT schedule the real install call.
2. Ashish patches the failing step (installer script bug, env var, OAuth config, docs wording).
3. Ashish tears down the current throwaway account (`delete_app`) and re-runs the dry-run against a fresh one the next day (new date suffix).
4. Only after a 100% PASS dry-run within 48h does the real install get scheduled with Ramesh.

This is the mechanism that buys the "install runs in 90 min" claim. Without it, the claim is aspirational.

---

## 4. "Install broke at step N" handling

The rule is **no temp-hosting**. A broken install is always "patch and reschedule," never "let me just host it for now." For each major branch:

### 4a. Butterbase signup / app creation fails (mins 5–15)

Most likely cause: card declined, email already in use, region unavailable.

**Action:** pause call. If card issue → Ramesh fixes with bank, reschedule 24h. If email in use → use `ramesh+thedi@nampalli.dev`. If region unavailable → retry us-east-1 (Butterbase region choice is reversible). Call continues same-day.

### 4b. Upstream key creation fails (mins 15–30)

Most likely cause: IonRouter signup requires phone verification; LinkedIn dev app pending review; Anthropic account requires business verification.

**Action:** if phone verification is just delayed → wait up to 10 min. If LinkedIn dev app is pending (can take up to 24h first time) → **reschedule**. Ashish does NOT loan Ramesh his LinkedIn app; doing so would keep Ashish in the OAuth path long-term. Same for Anthropic.

### 4c. Schema apply fails (mins 30–35)

Most likely cause: installer script bug; Butterbase schema DSL validation error.

**Action:** Ashish has the repo open. He diffs against the last green dry-run. If a one-line patch → he pushes, Ramesh re-runs installer. If the bug isn't obvious in 10 min → reschedule. **Do not hand-edit Ramesh's prod schema via MCP as "a temporary workaround"**; every MCP call Ashish makes against Ramesh's prod from his own credential is a standing-access breach.

### 4d. Function deploy fails (mins 40–50)

Most likely cause: Deno runtime version mismatch; a preserved v1 function has stale imports.

**Action:** the 4 preserved v1 functions are the most likely culprits because they haven't been re-tested against current Butterbase Deno version. Ashish keeps a pinned-version manifest in the repo. If a v1 function fails to deploy → ship it as-is minus the failing one and log a "v1 function X deferred; open GitHub issue" note in `HANDOFF.md`. Do not block the install on a v1 carryover.

### 4e. OAuth round-trip fails (mins 60–75)

**This is the highest-probability failure.** Three sub-modes:

- **Redirect URI mismatch** — LinkedIn or Google console doesn't have the exact URL. Ashish coaches Ramesh through adding it in the provider dashboard. 5-min fix, call continues.
- **Scope consent screen mis-configured** — LinkedIn app missing "Share on LinkedIn" product. Ramesh adds; takes effect immediately. 5-min fix.
- **Google OAuth rejects Ramesh's email** because Ashish forgot to update the allowlist. Ashish patches via `mcp__butterbase__update_oauth_provider`. 3-min fix.

If OAuth cannot be resolved in 20 min of fiddling → **reschedule**. The install is not "done" without Ramesh logged into `/admin`. Handing him a partial setup is worse than rescheduling.

### 4f. DNS / Resend verification fails (mins 15–90, async)

DNS propagation can be up to 48h. If Resend verification is still pending at minute 85:

**Action:** finish the install with a placeholder `THEDI_SENDER_EMAIL=thedi@platformy.org` (Ashish's verified domain); Ramesh completes DNS later and does a `update_function_env` swap himself using the rotation runbook. This is the one exception to "no Ashish-hosted anything" — the DNS record lives on Ashish's platformy.org only if Ramesh chose that path in §2d. If Ramesh chose his own domain, DNS stays his problem; the install can still ship with a temporary placeholder sender.

### 4g. Smoke test fails (min 80)

`fn_smoke_test` returns non-200 for one upstream.

**Action:** identify which upstream. If it's IonRouter/Resend/Anthropic — Ramesh re-rotates that key and re-runs smoke test; usually resolves. If LinkedIn — probably a scope issue; falls back to 4e. If it's Butterbase's own auth — rare; reschedule.

### 4h. Universal fall-through: the "two hour" tripwire

If wall-clock time hits 2 hours (30 min past the 90-min budget) and the install is not complete, Ashish says the agreed phrase: "Let's stop here. I'll patch and reschedule — I don't want to half-install this on you." Any protest from Ramesh ("just finish it later," "can you host it for me this week") is deflected to: the red-flag report's R1 tripwire fired. This is not punitive; it's the guardrail. Reschedule 7 days out. Re-do dry-run. Try again.

---

## 5. Post-install handoff — `HANDOFF.md`

Committed to the OSS repo in a new commit at minute 87. Template below. Every `<placeholder>` is filled in live during the call. Ramesh does not need to read this during the call; he reads it once in the week after.

```markdown
# Thedi v2 — Handoff Record

**Install date:** <YYYY-MM-DD>
**Installed by:** Ashish (one-time OSS-maintainer assist)
**Owner (sole operator from this date):** Ramesh Nampalli
**App ID:** <butterbase-app-id>
**Admin URL:** https://thedi-ramesh.butterbase.dev/admin

## Where your secrets live

All keys are in the 1Password "Thedi" shared vault. Each item has `rotated_at`
and `next_due_at` custom fields. The vault is the source of truth — not this
document, not the Butterbase dashboard, not anyone's email.

- `thedi:butterbase:service-key` — your Butterbase service key (rotate 180d)
- `thedi:ionrouter:api-key` — rotate 90d
- `thedi:anthropic:api-key` — rotate 90d
- `thedi:resend:api-key` — rotate 90d
- `thedi:linkedin:oauth-refresh` — auto-rotates every 60d via `/admin`
- `thedi:google:oauth-client` — Ashish-owned; rotation is his job (see below)

**Ashish's standing access after this commit:** NONE. Ashish has been removed
from the Butterbase app. His 1Password access to the Thedi vault was revoked at
<HH:MM PT>. The only Ashish-owned dependency is the Google OAuth client (in the
`thedi-493804` Google Cloud project) — this is intentional because migrating it
costs Ramesh nothing operationally and migrating would force a reconsent flow.
If Ramesh ever wants to take this over, follow `docs/ROTATION.md#google-oauth`.

## Rotation runbook

See `docs/ROTATION.md`. One 10-line section per key. Your next rotation event
is <next-key-due-date> for <next-key-name>.

## Support

**GitHub Issues only:** https://github.com/<ashish>/thedi/issues

Not Slack. Not work email. Not in-person at Saviynt. Not DMs. Not 1:1s.
If it's urgent enough to break this rule, open an issue first so there's a
public record, then ping.

## Recusal

If Ashish becomes Ramesh's direct manager, skip-level, or comp-chain
participant, Thedi enters read-only mode until HR reviews. Mechanism:
`docs/RECUSAL.md`. One-line summary: Ashish revokes his own GitHub repo-write
access; Ramesh's prod keeps running; no new features; bug fixes only via
community PRs.

## Emergency pause

If something looks wrong and Ramesh wants to stop the pipeline NOW:

    Admin dashboard → Settings → "Pause all crons" button
    (or manually: flip `system_config.pipeline_paused=true`)

All cron-triggered functions check this flag before doing anything. Scout stops,
topic-picker email stops, weekly health stops. Nothing is deleted; nothing is
published. Un-pause is the same button.

## Revenue trigger

Per our v2 launch conversation: if Thedi-attributable revenue exceeds $500/mo
sustained over 3 months, we re-paper the arrangement with a lawyer. Not a
conversation either of us needs to remember unprompted — the weekly health
email surfaces revenue if Substack webhooks are connected.
```

---

## 6. Honest time budget

The 90-minute claim in Round 3 C was always optimistic. Below is the per-step estimate, then the 2× buffer from amendment A1 applied.

| # | Step | Point estimate | A1 2× buffer |
|---|---|---|---|
| 1 | Pre-flight + checklist review | 5 min | 10 min |
| 2 | Butterbase signup + app + service key | 10 min | 20 min |
| 3 | 5 upstream key creations (IonRouter, Anthropic, Resend, LinkedIn, Google already done) | 15 min | 30 min |
| 4 | Installer script run (schema, 13 function deploys, env, OAuth, RLS, frontend) | 25 min | 50 min |
| 5 | OAuth round-trips (Google + LinkedIn) | 10 min | 20 min |
| 6 | End-to-end test (compose, health email, scout invoke) | 10 min | 20 min |
| 7 | Cutover (service key rotation, HANDOFF.md commit, Ashish credential revoke) | 5 min | 10 min |
| 8 | Buffer for one small hiccup | 10 min | 20 min |
| **Sum** | | **90 min** | **180 min** |

**Honest budget: 3 hours with 2× buffer, 90 minutes only if everything goes perfectly.**

The implication: Ashish should schedule a **3-hour block** with Ramesh, labelled "Thedi install — 90 min expected, 3h booked as buffer so we never feel rushed." Framing it as 90 min creates the R1 failure mode where at minute 95 Ramesh says "I have to go, just host it."

If dry-run was clean within 48h (§3 passed), the real install will likely complete in ≈120 min. If dry-run is stale (>7 days) or never happened, budget 240 min and expect to reschedule.

**Where the 90-min claim actually holds:** the *happy path* — no DNS async waits, no LinkedIn app review delay, no OAuth redirect typos. Happy path is ~40% probability. 2× buffer covers the other 60%.

---

## Appendix A — Single most likely failure point

**The LinkedIn OAuth redirect round-trip (step 4e).** Three compounding causes: the LinkedIn Developer app has to be newly created in Ramesh's account (not Ashish's), the redirect URI format is brittle (case-sensitive app name + exact path), and the first consent may require a second product ("Share on LinkedIn") whose approval is usually instant but sometimes delayed minutes. This is the step that most often converts "install" into "install + 20 min of fiddling."

The dry-run catches this if done against Ashish's own LinkedIn Developer account, but the real install always involves Ramesh's fresh app where Ashish has not seen the UI state. Carry an explicit LinkedIn app setup checklist in the installer script output.

## Appendix B — Dashboard (A4) ships Phase 1 or Phase 2?

**Phase 1.** The admin dashboard is not optional — it's the A4 pause-on-silence mechanism, the A3 rubric-delta sign-off surface, and the A2 compose-editor replacement for Beehiiv. Without it, there is no place for Ramesh to do anything except reply to emails. Build hours (~6h) fit Phase 1 because it displaces ~4h of Beehiiv integration work that A2 removed from the plan. Net delta Phase 1: +2h. Worth it.

Ship order within Phase 1: compose editor → alerts view → rubric-delta view → OAuth settings view. The last two can land in a Phase-1.5 patch if time is tight, but compose + alerts is the MVP gate.
