# Thedi v2 — Production Operations Model (Round 3, Follow-up C)

**Author:** Round 3 refinement agent | **Date:** 2026-04-19
**Audience:** Round 4 synthesis / Ashish Ranjan
**Scope:** end-to-end production-ops model — hosting, credentials, degradation, detection, rotation — with honest naming of the arrangement.

---

## 0. Decision up front

- **Hosting:** **Ramesh provisions his own Butterbase account and app (`thedi-ramesh`)**; Ashish ships a one-shot installer (schema DSL + function bundle + env-var template) plus a setup guide and has no standing write access to prod. A 2-week Ashish-hosted *staging* instance is allowed only for pre-launch voice calibration, after which all secrets rotate and Ashish's account is removed.
- **Arrangement naming (honest):** **"OSS project + one-time paid setup engagement, ≤8 hours, flat fee or donated; ongoing involvement = OSS-maintainer best-effort."** This is what brief 07's "OSS release" actually means once you price in the install burden. If Ashish ever ends up holding a standing key to Ramesh's Beehiiv/LinkedIn/Resend, that is no longer OSS — it is unpaid contracting inside the reporting chain, and brief 07's entire analysis applies.
- **Biggest silent-failure risk:** **IonRouter silently routing to a different model.** Brief 06 recommends Kimi K2.5 for drafting; IonRouter's selling point is "multiplexed models with <100ms switch time" ([Cumulus Labs on Product Hunt](https://www.producthunt.com/products/ionrouter-by-cumulus-labs)). Nothing in the current design asserts the returned `model` field against the expected model-ID per pipeline stage. A silent swap to a cheaper/faster OSS model during prose drafting would dilute Ramesh's voice for weeks before anyone notices — and voice dilution is the single failure mode brief 02 says kills the Substack. A one-line assertion `response.model == "kimi-k2.5"` with hard-fail + email alert is the highest-leverage control in the whole system.

---

## 1. Hosting decision — self-host vs. Ashish-host

Butterbase is a hosted SaaS, not a self-installable Postgres+Deno stack ([Butterbase overview docs, local]). "Self-host" in this document means **Ramesh owns a Butterbase account and a dedicated app under his email**, not that he runs Postgres on a VPS. The choice is therefore *account ownership*, not infra.

### Option 1 — Ramesh owns the Butterbase account (recommended)

- Ramesh signs up at butterbase.dev with his personal email (not `@saviynt.com`).
- App `thedi-ramesh` provisioned under his account. He is root; he holds the dashboard password, the billing card, every function env var.
- Ashish installs via a published one-shot script that calls the Butterbase MCP tools (`init_app`, `apply_schema`, `deploy_function` × N, `update_function_env`, `configure_oauth_provider`) against Ramesh's `app_id` and a short-lived setup token Ramesh generates and revokes after install.
- **One-time Ramesh effort:** ~90 minutes. Sign-up (10), billing card + plan selection (5), generate IonRouter + Beehiiv + Resend + LinkedIn OAuth + Anthropic keys (40), paste into installer (10), run installer with Ashish pair-debugging over a call (25).
- **One-time Ashish effort:** ~4 hours to write + test the installer, ~2 hours pair-debug on the install call. Total ≤8 hours. Covered by "initial build," not counted against the ≤2-hrs/week ongoing budget.
- **Monthly cost to Ramesh:** **Free plan** fits v2 usage by a wide margin — 50K function invocations covers 2 posts/week × ~50 function calls/post × 4 weeks = 400 invocations/mo; 500 MB DB fits voice-note transcripts + post history for years; 1 GB file storage for voice memos (~10 MB/week = 520 MB/year) ([Butterbase billing docs, local]). **If** Ramesh enables voice-note workflow and bandwidth or AI credits exceed free-tier, Pro is $25/mo. Ceiling estimate: **$25/mo worst case, $0/mo likely**.
- **Ongoing Ashish touchpoints:** zero, except OSS-maintainer "open an issue" work.

### Option 2 — Ashish hosts on his Butterbase account (rejected)

- Uses Ashish's existing `thedi@platformy.org`-linked Butterbase app. Ramesh is a read-only user via the feedback UI.
- Ashish holds IonRouter, Beehiiv, Resend, LinkedIn OAuth, Anthropic keys in his function env.
- **This is not OSS. This is unpaid contracting.** Brief 07 §2 disqualified "informal / we'll figure it out" (Structure F) as highest-risk; Option 2 is that, dressed up. If Ashish is hit by a P0 at Saviynt during his wedding week, drafts stop shipping, keys can't be rotated, and Ramesh — Ashish's future boss — has a business dependency on his not-yet-employee's availability. That is precisely the entanglement brief 07 spent 2,000 words engineering around.
- **Monthly cost to Ashish:** $0–$25 (same tier math). Cost is not why this is rejected.
- **Rejected because:** it re-creates the exact power-dynamic failure mode brief 07 identified. If adopted, brief 07's fallback Structure C (flat fee + written contract + Saviynt disclosure) must replace the OSS framing, *and* brief 07's §5 signal "Ashish finds himself doing >2 hrs/week" fires on Day 1 because prod ops *is* standing work.

### Option 3 — Hybrid: Ashish-hosted staging, Ramesh-owned prod (pre-launch bridge only)

- Weeks 1–2 after initial install: Ashish hosts a staging copy for voice-calibration iteration (eval harness runs, rubric tuning). Prod is still Ramesh-owned from day 1.
- At T+2 weeks: all staging credentials are rotated, Ashish's staging app is deleted, Ramesh's prod is the only remaining instance. Logged in a one-line `HANDOFF.md` in the repo with timestamps.
- **Rationale:** the eval harness in brief 06 needs ~10 min × N sweep runs; having Ashish run these without Ramesh's prod credentials in hand speeds initial calibration. **This is a bridge, not a steady state.** If it extends past 4 weeks, the arrangement has defaulted to Option 2 and needs re-papering.

### Cost / effort comparison

| Dimension | Option 1 (Ramesh hosts) | Option 2 (Ashish hosts) | Option 3 (Hybrid, ≤2 wk) |
|---|---|---|---|
| Ramesh one-time setup | ~90 min | ~10 min (just review) | ~90 min at T+2 wk |
| Ashish one-time setup | ~8 hr (installer + pair) | ~4 hr | ~10 hr (install + staging + migration) |
| Ashish ongoing | ~0 hr/wk (OSS only) | ~1–2 hr/wk (ops) | ~0 hr/wk after T+2 |
| Monthly $ | $0–$25 (Ramesh's) | $0–$25 (Ashish's) | $0–$25 (split then Ramesh) |
| Power-dynamic cleanness | Clean (brief 07 Structure A) | **Violates brief 07** | Clean after T+2 |
| "Ashish out 4 weeks" test | Passes | **Fails** | Passes post-migration |
| Key-rotation cadence | Ramesh-driven 90-day | Ashish-driven; Ashish-dependent | Ramesh-driven post-migration |

### Recommendation

**Option 1 with Option 3 as a permitted 2-week bridge.** If the installer is not robust enough for Ramesh to run solo, the fix is "invest more in the installer," not "Ashish hosts forever." The installer is a one-time cost; Ashish-hosting is a permanent tax on the ≤2-hr/wk budget and on brief 07's compensation story.

---

## 2. Credential matrix

Every key the v2 pipeline touches, who holds it, and who can rotate it.

| Key | Purpose | Holder (Option 1) | Rotation cadence | Who rotates | Ashish-free rotation? |
|---|---|---|---|---|---|
| **IonRouter API key** | LLM gateway for scout/outline/draft/critique (briefs 01, 05, 06) | Ramesh's Butterbase function env var `IONROUTER_API_KEY` | 90 days | Ramesh, via IonRouter dashboard + `update_function_env` | **Yes** — docs + MCP tool call |
| **Beehiiv API key** (`posts:write`, `subscriptions:read`) | If Beehiiv used as staging CMS (brief 03) | Ramesh's env `BEEHIIV_API_KEY` | 90 days | Ramesh | **Yes** |
| **Resend API key** | Email delivery for digest + health summary + approval gates | Ramesh's env `RESEND_API_KEY` | 90 days | Ramesh | **Yes** |
| **LinkedIn OAuth refresh token** (`w_member_social`) | Cross-post to Ramesh's LinkedIn (brief 03 §3) | Ramesh's env; stored in Butterbase OAuth config ([Butterbase auth docs]) | 60 days (LinkedIn refresh-token expiry) | Ramesh, via re-consent in `/admin` UI | **Yes** |
| **Anthropic API key** (escape hatch) | Sonnet 4.6 for voice-critical drafting A/B + eval-harness judge (brief 06) | Ramesh's env `ANTHROPIC_API_KEY` | 90 days | Ramesh | **Yes** |
| **Whisper / Groq API key** | Voice-memo transcription if Option A adopted (brief 02) | Ramesh's env `GROQ_API_KEY` | 90 days | Ramesh | **Yes** |
| **Substack session cookie** | **DO NOT ADOPT** — reverse-API path violates Substack TOS ([brief 03 §1]) | — | N/A | — | N/A |
| **Butterbase dashboard password** | Root access to the app | Ramesh (his 1Password) | 180 days | Ramesh | **Yes** |
| **Butterbase service key** | Programmatic admin (migrations, function deploys) | Ramesh (his 1Password); **short-lived copy shared with Ashish during install then revoked** | Issued per-install, revoked at T+install | Ramesh generates via `generate_service_key` | **Yes** |
| **Resend-verified domain DNS** | `thedi@platformy.org` sender domain (user memory) | **Ashish** (owns platformy.org DNS) | Renewed annually (DNS) | Ashish | **Partial** — DNS records need Ashish hand; Resend key itself is Ramesh's |
| **Shared 1Password vault** | Secret-storage substrate for all of the above | Joint (1Password Families or Teams "Thedi" vault) | — | Both invited; rotation events logged in vault item history | **Yes** |

**Note on Resend sender domain:** `thedi@platformy.org` is Ashish's domain per user memory. Two clean paths: (a) Ramesh moves to his own verified sender (`thedi@nampalli.dev` or similar) at T+install — cleanest; **recommended**; (b) keeps `thedi@platformy.org`, in which case Ashish retains a single long-term dependency (DNS) which he documents in a break-glass runbook. Option (a) is the only fully Ashish-free path.

**Every production key is rotatable without Ashish present under Option 1.** That is the headline result of the matrix.

---

## 3. Graceful-degradation contract

### 3a. Ramesh silent — default behavior by duration

| Silence | Pipeline behavior | Notifications |
|---|---|---|
| **1 week** | Nothing changes. Scout still runs daily; outline gate waits; no draft is produced without outline approval (brief 05 §5). Pipeline state machine parks in `outline_pending`. | None — 1-week silence is normal. |
| **2 weeks** | Scout paused. Daily cron becomes weekly-digest-only; no new outlines created. A "we skipped this week" email goes to Ramesh's subscriber list (opt-in) or is held as a draft Substack Note (if opted-out). | Email to Ramesh: "2 weeks of silence detected — pipeline paused. Reply 'resume' or click link to acknowledge." |
| **4 weeks** | Full pause. All cron jobs disabled except the weekly health summary. Subscriber list informed via one-time "brief hiatus" post drafted by Thedi, **held as a draft requiring Ramesh to click publish** (never auto-send during long silence — that IS the failure mode). | Weekly email to Ramesh until he engages. After 8 weeks, pipeline archives state and stops emailing. |

**Critical: do not fall back to "best-guess" drafts Ramesh will edit into slop.** Brief 02's cited evidence says the LLM-drafts-alone path fails at 19–65% accuracy in the blog register ([arXiv 2509.14543](https://arxiv.org/abs/2509.14543), cited in brief 02). The correct degradation is "publish less, not publish worse." A paused newsletter survives; a slop-polluted newsletter is the thing that dies.

### 3b. Ashish silent — default behavior by duration

| Silence | Pipeline behavior | Notifications |
|---|---|---|
| **1 week** | Nothing changes. Ramesh's prod is Ramesh's prod; Ashish's presence is not on the hot path. | None. |
| **2 weeks** | Nothing changes. If Ramesh hits an issue he cannot resolve, GitHub Issues on the OSS repo is the documented channel. | None automatic; Ramesh's choice to open an issue. |
| **4 weeks** | Nothing changes operationally. If a key rotation comes due during this window, Ramesh rotates per runbook §5 — no Ashish dependency. **This is the scenario Option 1 was designed to pass.** | None. If Ashish is at his wedding or slammed at Saviynt, the system does not notice. |

The 4-week Ashish-silent test *passes only under Option 1*. Under Option 2 it fails at the first expired key or the first cron-died-silently incident.

### Degradation table (consolidated)

| Actor | 1 wk | 2 wk | 4 wk |
|---|---|---|---|
| Ramesh silent | Park at outline gate | Pause + skip-week email | Full pause, hiatus draft held for approval |
| Ashish silent | No effect | No effect | No effect (under Option 1) |

---

## 4. Silent-failure detection plan

Silent failure is the dominant risk mode because the pipeline emails Ramesh drafts regardless of whether those drafts are good. Without active detection, "Thedi is working" and "Thedi is producing slop" look identical in his inbox.

### 4a. Model-ID hard-fail circuit breaker (highest priority)

Every IonRouter call asserts `response.model == expected_model_for_stage`. OpenAI-compatible responses include the `model` field in the top-level response body ([OpenAI API ref](https://platform.openai.com/docs/api-reference/introduction); IonRouter advertises drop-in OpenAI compatibility). On mismatch: **fail the function, log the discrepancy to `pipeline_alerts`, send an immediate email to Ramesh**. No silent fallback. Budget per check: 2 lines of code per call site (5 call sites = 10 LOC).

Expected-model map:
```
scout:     qwen3.5-122b-a10b
outline:   glm-5
draft:     kimi-k2.5
critique:  gpt-oss-120b
judge:     claude-sonnet-4-6   (Anthropic direct, not IonRouter)
```

This is the fix to brief 06's admission: *"raw IonRouter response headers (to catch silent model swaps) … nobody reads them."* Nobody reads logs; everybody reads email. Move the signal from logs to alerts.

### 4b. Weekly health summary email to Ramesh (Monday 07:00 PT)

A Butterbase scheduled function (`fn_weekly_health`, cron `0 14 * * 1` UTC) emails Ramesh a dashboard:

- Posts drafted, critiqued, approved, published in last 7 days
- Model-ID assertions: pass count / fail count (should always be 100% pass)
- Scout topic-dedup stats (from round 2 critic gap: recycle/sequel logic)
- Rubric-score trend line (critic's own voice-fidelity score over last 8 posts)
- IonRouter spend week-over-week
- Any paused-for-silence flags
- Key-expiry countdown (days until each key's 90-day rotation is due)

If the function itself fails 2 weeks in a row → escalation email to both Ramesh and Ashish with subject line `[thedi-ops] health summary has not sent`. This is the only alert that pings Ashish — because "the alerting system is down" is the one thing that must wake him up.

### 4c. Cron heartbeat

Scout cron posts a heartbeat row to `heartbeats(ts, job, status)` on every run. A separate `fn_heartbeat_watch` checks hourly: if scout hasn't heartbeated in 26 hours (scout runs daily + 2hr grace), email Ramesh. Catches "the cron stopped firing" — a Butterbase-side failure that would otherwise look like "Ramesh hasn't written anything this week" from his POV.

### 4d. Key-expiry watcher

Each key's rotation date is a row in `key_rotations(key_name, rotated_at, next_due_at)`. Weekly health summary includes "IONROUTER_API_KEY due in 14 days" countdown. At T-7 days, a dedicated "rotate now" email with runbook link. At T-0, the circuit breaker that pattern-matches on IonRouter 401/403 responses triggers an immediate email. Not waiting for the next health summary.

### 4e. Beehiiv AUP flag watcher

If Beehiiv is used as staging CMS (brief 03): poll `GET /publications/{id}` weekly; if `status != active` or any moderation flag surfaces, email Ramesh immediately. Brief 03 flags Beehiiv's AUP as "the strictest stance among platforms surveyed" — a silently-moderated account would break the pipeline with no user-visible symptom for days.

### 4f. Budget ceiling alert

Per brief 06's eval-harness spec: hard cap at $5/run. Also applied to production: if weekly IonRouter spend > $2 (baseline is <$0.20/wk per brief 06), email alert. A spend spike usually means either a prompt that's regressed to infinite-loop behavior or a silent switch to an expensive model.

### 4g. Rubric-score drift detector

The critic-rubric recalibration loop is named but under-specified across briefs (critic report explicit gap). Minimum hook here: log `voice_fidelity` score on every post; if 3-post rolling mean drops >1 point (on the 0–10 rubric) relative to the prior 8-post mean, flag in next health summary with subject `[thedi] voice-drift suspected`. This is a cheap proxy for the full recalibration loop brief 05 called "the single most important feedback loop in the system."

### Alerting channels summary

| Signal | Channel | Frequency | Urgency |
|---|---|---|---|
| Model-ID mismatch | Email to Ramesh | On every occurrence | Same-day |
| Weekly health summary | Email to Ramesh | Weekly (Mon) | Informational |
| Health summary failed to send | Email to Ramesh + Ashish | On failure | Same-day |
| Cron heartbeat lost | Email to Ramesh | On failure | Same-day |
| Key expiry T-7 | Email to Ramesh | One-shot | Within-week |
| Key 401/403 | Email to Ramesh | Immediate | Same-hour |
| Beehiiv AUP flag | Email to Ramesh | Immediate | Same-day |
| Budget spike | Email to Ramesh | On occurrence | Same-day |
| Voice-drift suspected | Weekly summary annotation | Weekly | Review |

All emails use `thedi@platformy.org` (current) or `thedi@nampalli.dev` (post-migration). Resend's free tier (100 emails/day) covers this by two orders of magnitude.

---

## 5. 90-day key-rotation runbook (Ramesh-driven)

### 5a. Shared vault

- **1Password Families or Teams "Thedi" shared vault.** Invitees: Ramesh (owner), Ashish (read during install period only; removed at T+2 wk under Option 1, or T+install under pure Option 1).
- Every key lives as a 1Password item with: current value, `rotated_at` timestamp (custom field), `next_due_at` (custom field), rotation-instructions URL (link to repo runbook).
- 1Password's shared vault pattern is the documented substrate for this ([1Password Secrets Automation](https://developer.1password.com/docs/secrets-automation/); general-pattern: SOC2/PCI-DSS typically mandate 30/60/90-day rotation for credentials of varying sensitivity ([rotation overview, Akeyless](https://www.akeyless.io/secrets-management-glossary/secret-rotation/))).

### 5b. Rotation calendar

Keys offset so no two rotate in the same week — reduces "I'll do all of these" procrastination and cognitive load per event.

| Week of year | Rotate |
|---|---|
| Week 1, 14, 27, 40 | IonRouter API key |
| Week 4, 17, 30, 43 | Beehiiv API key |
| Week 7, 20, 33, 46 | Resend API key |
| Week 10, 23, 36, 49 | Anthropic API key |
| Week 2, 9, 16, 23, 30, 37, 44, 51 | LinkedIn refresh token (60-day cadence) |
| Week 12, 38 | Groq API key (if voice workflow adopted) |
| Week 26 | Butterbase dashboard password (180-day) |

Health summary email surfaces upcoming rotations. Ramesh's total time budget: **~15 min/month** average, concentrated in 10-min single-key rotation events.

### 5c. Per-key rotation steps (template; full runbook lives in `docs/ROTATION.md`)

For each key:

1. Open vault item; copy old value to `value_previous` field.
2. Generate new key in upstream provider dashboard (IonRouter / Beehiiv / Resend / Anthropic / LinkedIn OAuth re-consent).
3. Update vault item's `value` and `rotated_at`.
4. Run `butterbase functions env set <app_id> <FN_NAME> <ENV_VAR>=<new_value>` via CLI, or use `update_function_env` MCP tool ([Butterbase functions docs, local]).
5. Invoke `fn_smoke_test` — a 30-second canary function that exercises every credential with a minimal call. Confirm 200s across the board.
6. Revoke old key in upstream provider. Do not skip this step; a rotated-but-not-revoked key is worse than no rotation (larger exposed-key window).
7. Clear `value_previous` from vault.

### 5d. Break-glass procedure (suspected leak)

1. Ramesh revokes the key in the upstream dashboard **immediately** (step 6 before step 2 — the order inverts under compromise).
2. Pipeline fails the next API call; circuit breaker (§4a) emails Ramesh.
3. Ramesh runs the full rotation per §5c.
4. If Ramesh cannot reach the upstream dashboard (e.g., compromised email), the Butterbase service key can be used to set a provably-invalid placeholder into `IONROUTER_API_KEY`, pausing the pipeline until the upstream revocation completes.
5. **Ashish is optional in this flow.** If he happens to be available, he can help; if not, Ramesh has the authority and the access. This was the design goal.

### 5e. Who writes the runbook

Ashish ships `docs/ROTATION.md` as part of the one-time install. Per-key sections are ~10 lines each. Ramesh reviews once during install pair. Runbook is versioned in the OSS repo; updates happen via PR, same as any code.

---

## 6. Reconciliation with brief 07's OSS story

### What the OSS framing supports (under Option 1)

- Ashish ships code to a public repo. Ramesh (and anyone else) self-installs to a Butterbase account they own.
- Ashish's ongoing involvement is OSS-maintainer norms: accepts PRs, tags releases, answers issues on his schedule. Not on Ramesh's.
- No standing access, no standing credentials, no standing financial relationship. Brief 07 §3's Structure A as stated.

### What the OSS framing does NOT support (and is currently fuzzy in briefs 03/05/06)

- Ashish holding IonRouter, Beehiiv, Resend, LinkedIn, Anthropic keys for Ramesh in Ashish's Butterbase env.
- Ashish rotating those keys on a schedule.
- Ashish responding to Beehiiv AUP flags on Ramesh's account.
- Ashish debugging cron failures at 2am because Ramesh's subscriber digest didn't send.

All four are contracting work. If any persist past the 2-week Option-3 bridge, **the arrangement is no longer OSS and must be re-papered as brief 07's fallback Structure C (flat fee, one invoice, written contract, Saviynt conflict-of-interest filing).** No hybrid.

### The honest naming, concretely

- **Build phase (T-0 to T+2 weeks):** Ashish is the unpaid author of an OSS project + does a ~8-hour personal installation assist for Ramesh, the first user. This is the "maintainer helps early adopter" norm in OSS. Cap the hours explicitly; log them.
- **Steady state (T+2 weeks onward, under Option 1):** Ashish is a maintainer. Ramesh is a user. Ashish owes Ramesh nothing beyond what any maintainer owes any user. Ramesh owes Ashish nothing. Brief 07's recommended arrangement is achieved.
- **If steady state drifts to Option 2 (Ashish hosting prod):** the arrangement has silently become contracting. The §5 signals in brief 07 fire: "Ashish finds himself doing >2 hrs/week" and "reporting-chain change" (Ramesh as future boss becomes a paying-beneficiary of Ashish's unpaid work). Pause. Re-paper.

### One sentence for Ashish to say to Ramesh

> "I'll build it, I'll help you install it on your own Butterbase account, and from then on it's yours. I'll keep the repo healthy the same way any OSS maintainer does. I don't hold your keys and I'm not on call."

---

## 7. Signals to watch

- **Ramesh asks Ashish to "just host it for me."** This is the Option-2 slide. The correct response is to invest another 2–4 hours in the installer, not to say yes. Saying yes silently converts OSS into unpaid contracting.
- **A key rotation slips past T-0.** Means the runbook is not being followed. First slip: email reminder + re-walk the runbook. Second slip: escalate the conversation — the ops model is not working for Ramesh and needs a redesign (possibly a managed-rotation service like Doppler or Infisical).
- **Model-ID assertion fails > 2× in 30 days.** IonRouter routing is flaky enough that the pipeline can't trust the `model` field. Escalate to Cumulus Labs; consider pinning to a specific provider/region endpoint if they offer one.
- **Beehiiv AUP flag fires.** Brief 03's prediction materializes. Revisit the staging-CMS choice — probably move to "compose in private Google Doc → paste to Substack" per the critic's reconciliation note on contradiction #3.
- **Installer run time creeps past 90 minutes for Ramesh.** The install experience is too complex for future OSS users; invest in scripting or a GUI wrapper. A Thedi that only Ashish can install is not OSS.
- **Ashish's ongoing weekly touchpoints trend > 0.5 hrs/wk over a 4-week window.** Early-warning indicator for Option-2 drift. 
- **Butterbase pricing changes.** Free tier is load-bearing for cost claims here; if Butterbase changes meters (e.g., raises the AI-credits floor from $0.10 lifetime), re-estimate.
- **Saviynt updates its moonlighting or IP policy.** Brief 07's §2870 analysis is jurisdiction- and policy-contingent; a policy change may force a re-paper even under the clean Option 1 path.
- **Ramesh adds a voice-memo workflow.** Triggers the brief 02 data-handling concern (IAM employee routing voice through third-party ASR); under Option 1 at least the data chain is Ramesh-owned, but a DPA review is still warranted.

---

## Summary (<250 words)

**Recommended hosting model:** Ramesh owns his own Butterbase account and app (`thedi-ramesh`); Ashish ships a one-shot installer + `docs/ROTATION.md` runbook and holds no standing production credentials. A 2-week Ashish-hosted staging bridge is permitted only for initial voice calibration, then all secrets rotate to Ramesh. Monthly cost: $0–$25 to Ramesh. Ashish's ongoing time: OSS-maintainer best-effort, consistent with the ≤2-hr/wk build constraint and brief 07's Structure A. This is the only configuration under which all three critic-tests pass: "Ashish silent 4 weeks" (no standing dependency), "Ramesh silent 2 weeks" (pipeline parks at outline gate, sends skip-week email, does not fabricate), and "IonRouter silently swaps models" (per-call `model`-field assertion emails Ramesh on mismatch).

**Single biggest silent-failure risk:** IonRouter silently routing to a cheaper/faster model mid-pipeline. Brief 06 already flagged "nobody reads the logs"; the fix is a one-line assertion per call site that hard-fails and emails Ramesh on mismatch. This is the highest-leverage single control in the entire ops model.

**Most important unresolved trade-off:** The installer's UX is load-bearing. Option 1's entire cleanness depends on Ramesh being able to run the install in ~90 minutes with Ashish on a call. If the installer is brittle, Ramesh will ask Ashish to "just host it" and the arrangement silently slides into Option 2 — unpaid contracting inside the reporting chain, exactly what brief 07 spent 2,000 words avoiding. Round 4 must budget real hours (≥4) for the installer, not assume it emerges for free from "standard Butterbase MCP calls."
