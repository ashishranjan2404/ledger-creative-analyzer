# I3-A — Week 1 Action Checklist (Phase 1 Executable)

**Author:** iter-3 agent
**Date drafted:** 2026-04-19 (Sunday evening)
**Audience:** Ashish, reading this at his desk Monday morning onward
**Scope:** Everything between now and end of second week at Saviynt (through 2026-05-10)

This is a single-file, hour-by-hour checklist. Each line is tickable. Copy-pasteable email/calendar templates are inline. External-dependency waits (attorney, Saviynt Legal, Ramesh) are flagged with a **[WAIT]** tag and a fallback.

**Assumed bracketed values** (change in one place at top if wrong):
- Saviynt start date: **2026-04-27 (Monday)**
- Per amendment A6: commit freeze on Thedi v2 public repo is **already active** (7 days before start date was 2026-04-20)
- Personal mailing address, personal phone, Saviynt hiring manager name: to be filled before filing Artifact 1

**Execution order (load-bearing; do not reorder):**
File §2870 letter → countersignature returns → send 5-point agreement → Ramesh "yes" → commit `RECUSAL.md` → begin Phase 1 build.

---

## Week 0 — before Saviynt start date

### Sunday 2026-04-19 — tonight, 1 hour (21:00–22:00 PT)

**Goal of this hour:** line up every Week 0 dependency so Monday isn't wasted. The single critical-path move is booking the attorney; everything else is prep.

- [ ] Open a personal Google Doc titled `Thedi — Week 0 Tracker` as the single status page for the next 14 days. Paste in the three gates: §2870 filed / countersigned / 5-point reply.
- [ ] Open `/Users/mei/ledger-creative-analyzer/thedi-v2-research/iter2/D3-paper-artifacts.md` in a second tab. This is the source for Artifacts 1, 2, 3.
- [ ] Search for 3 California employment attorneys who do §2870 / inventions-assignment carve-outs. Criteria: SF Bay Area or LA (near Saviynt El Segundo HQ), solo or small firm (cheap hourly), clear "employee-side" positioning. Good starting-point queries: "california employment attorney section 2870 invention assignment" + "employee side san francisco."
- [ ] Draft and **send tonight** (before 22:00 PT) three identical short emails to each. Subject and body below. Sending Sunday night means responses land first thing Monday.

**Copy-paste to attorney (personal Gmail → attorney intake email):**

> Subject: 1-hour consult — Cal. Labor Code §2870 carve-out letter review
>
> Hi — I'm a software engineer starting a new job at an IAM company next Monday (2026-04-27). I have a pre-existing personal open-source side project, and I'd like to file a §2870 carve-out acknowledgment letter with the new employer's Legal team before I resume work on it. I have a draft letter already — I need ~1 hour of an attorney's time to pressure-test the "relates to the employer's business" adjacency argument and fix any cite errors before I file. Could you see me in the next 5–7 business days? I can pay your standard 1-hour consult rate. I'm flexible on phone or video.
>
> Thanks,
> Ashish Ranjan
> [personal phone]

- [ ] Fill out the bracketed fields in Artifact 1 (`D3-paper-artifacts.md` §Artifact 1) that do **not** require attorney input: personal address, personal email, personal phone, Saviynt start date (2026-04-27), GitHub handle. Leave `[verify with attorney]` and `[depends on Saviynt's actual employment agreement language — verify]` tags intact.
- [ ] Locate the onboarding packet from Saviynt. If not received yet, note "ask hiring manager Monday for PIIA + §2872 notice." This is an input to Artifact 1 §5 and §Attachment E.
- [ ] End the hour. Tracker doc has: 3 attorney emails out, Artifact 1 half-filled, an explicit TODO for Monday.

**Unblocks:** attorney booking (the single longest external wait).
**External waits started:** 3× attorney reply — 1–5 business days.

---

### Monday 2026-04-20 evening — 1.5 hours (19:30–21:00 PT)

**Goal:** get the Saviynt onboarding paperwork in hand; refine Artifact 1 using its actual language.

- [ ] Check attorney replies. If any responded, book the earliest slot. Reply accepting. Confirm hourly rate in writing (avoid surprise bills).
  - **[FALLBACK] If no attorney can see Ashish within 2 weeks:** send 3 more emails tonight to a second tier (LegalZoom "employment attorney" directory + local bar-association referral line — SF Bar Association Lawyer Referral runs ~$35 for a 30-min consult). Second-tier fallback is acceptable here because the letter is already drafted; the attorney's job is a surgical review, not from-scratch counsel. If *still* nothing by Friday, file the letter **without attorney review** only if Ramesh has not yet replied to the 5-point email (i.e., no v2 code was going to ship anyway). Otherwise, keep the freeze until review.
- [ ] Open Saviynt onboarding email thread. Pull: PIIA document (exact title), signed offer letter date, §2872 notice (if issued separately), handbook. If any are missing, reply to the Saviynt hiring coordinator: *"Could you send over the signed PIIA and the Labor Code §2872 notice from my onboarding packet? I want to make sure my personal files are complete before start date."* Neutral, plausible request.
- [ ] Once PIIA is in hand, fill the remaining bracketed fields in Artifact 1: exact agreement title (§1), date of §2872 notice receipt (§2), "depends on Saviynt's actual employment agreement language" tags in §6 replaced with the actual policy names (Moonlighting / Outside Activities / Code of Conduct — pull from handbook).
- [ ] Draft Artifact 1 Attachment D (the one-page architectural summary). This is new content, not in D3. Keep it boring. One paragraph: data flow (public arxiv/HN → LLM draft → Ramesh edits → Ramesh publishes to his Substack). One paragraph: what Thedi is not (no identity data, no enterprise deployment, no multi-tenant, no Saviynt-adjacent anything). Save as `thedi-arch-summary-for-saviynt.pdf`.
- [ ] Update the tracker doc.

**Unblocks:** attorney review can happen as soon as the slot lands this week.
**Artifacts produced:** filled Artifact 1 (pending attorney), `thedi-arch-summary-for-saviynt.pdf`.

---

### Tuesday 2026-04-21 evening — 1.5 hours (19:30–21:00 PT)

**Goal:** pre-bake the 5-point Ramesh email and the RECUSAL.md so they can ship the moment the §2870 letter is countersigned.

- [ ] Open `D3-paper-artifacts.md` §Artifact 2. Copy the 5-point email into a Gmail draft in the personal Gmail account (*not* Saviynt mail — account doesn't exist yet, but habit formation matters). To-field: Ramesh's personal email. Subject: `Thedi v2 — quick alignment on five things before I start the weekend build`.
- [ ] Do **not send yet.** Artifact 2 is gated on §2870 countersignature per D3 §Cover Memo. Label the Gmail draft clearly: `HOLD — send only after §2870 countersigned`.
- [ ] Open `D3-paper-artifacts.md` §Artifact 3 (`RECUSAL.md`). In a private scratch repo (not the public `thedi` repo yet — freeze is active), copy the content into `RECUSAL.md` and `RECUSAL_LOG.md`. Fill bracketed fields: maintainer handle, repo URL, effective date placeholder `[to be replaced with first commit date]`.
- [ ] Scratch repo location: `~/code/thedi-v2-private` or similar; `git init`; do not push. This is the holding area for all Thedi v2 work during the freeze. **Do not add a remote.**
- [ ] Prepare a `FROZEN_UNTIL_CARVEOUT.md` file in the scratch repo stating: "No public push until §2870 countersigned. Target unfreeze: week of 2026-05-04."
- [ ] Tracker doc: check that all three Week-0 artifacts are ready for their send trigger (letter: awaiting attorney review; Ramesh email: awaiting countersignature; RECUSAL.md: awaiting first commit).

**Artifacts produced:** held Gmail draft of 5-point email, scratch-repo stub containing RECUSAL.md/RECUSAL_LOG.md/FROZEN_UNTIL_CARVEOUT.md.

---

### Wednesday 2026-04-22 evening — 2 hours (19:00–21:00 PT)

**Goal:** the installer dry-run prep. Amendment A1 says the real install cannot happen until a clean dry-run completes within 48h; start building the dry-run capacity now.

- [ ] Open `D2-installer-walkthrough.md` §3 (Dry-run protocol).
- [ ] Create the throwaway Butterbase account: sign up with `ash-test+ramesh-2026-04-22@platformy.org`, app name `ramesh-test-2026-04-22`, region `us-west-2`. Card: personal.
- [ ] Copy service key into 1Password under vault item `thedi-dryrun:butterbase:service-key`, set `next_due_at=now+24h`.
- [ ] Configure local MCP env vars.
- [ ] Scaffold `install.sh` in scratch repo. It's the orchestrator over the MCP call sequence in D2 §2. Stub each step with a `TODO: <mcp call>` comment — actual call implementation happens Thursday/Friday. What matters tonight is the structure and the error-handling shape (each step logs PASS/FAIL and stops on first FAIL).
- [ ] Install attempt tonight: not expected to complete. Target: get through D1 (signup), D2 (schema apply) with manual MCP calls.
- [ ] Tracker doc: log "dry run 1 started 2026-04-22, halted at step D<X>, will resume Thursday."

**Unblocks:** Saturday long-block dry-run attempt. No external dependency.

---

### Thursday 2026-04-23 evening — 1.5 hours (19:30–21:00 PT)

**Goal:** finish the installer-script skeleton so Saturday's dry-run can actually run end-to-end.

- [ ] Check attorney reply status. If a slot has been booked for later this week, confirm meeting details + send the draft letter + architectural summary PDF 24h before the meeting. If the meeting is next week, factor that into the unblock timeline (see "branching plan" below).
- [ ] Flesh out `install.sh` steps D3 (function deploys — 13 of them) and D4 (env var setup). For each function, the deploy call is the same shape; write a `deploy_function_from_dir()` helper. Function source code itself doesn't exist yet — stub each with a Deno `export default async () => Response.json({ok:true})` placeholder so deploy succeeds in the dry-run. Real logic comes in the build phase.
- [ ] Write the `fn_smoke_test` stub — this one must be real (not a placeholder) because it's the gate between "install finished" and "install works." Copy D2 §2c row for `fn_smoke_test` as the spec; implement the four upstream pings (IonRouter, Resend, LinkedIn, Anthropic). Use test-tier / free-tier credentials.
- [ ] Tracker doc: "installer skeleton 70% done; Saturday D1–D11 target."

**External dependency check:** has Saviynt HR/Legal sent a Code of Conduct / Moonlighting policy link? If not, reply to the hiring coordinator asking. Need it for Artifact 1 §6.

---

### Friday 2026-04-24 evening — 1 hour (19:30–20:30 PT)

**Goal:** buffer + anything that slipped earlier in the week. The temptation Friday is to start a new thread; resist it. Close out Monday–Thursday's TODOs.

- [ ] Sweep the tracker doc. Every item from Mon–Thu should be either DONE or explicitly rescheduled into Saturday's block with a note.
- [ ] If attorney met this week: integrate their feedback into Artifact 1. Remove `[verify with attorney]` tags where the cite was confirmed; delete cites the attorney said to drop; accept adjacency-argument edits.
- [ ] Do NOT file Artifact 1 tonight. File in business hours (Monday–Tuesday next week) so it lands in Saviynt Legal's inbox when they're reading, not over the weekend.
- [ ] Light prep for Saturday: clear calendar 09:00–13:00, charge laptop, verify throwaway Butterbase account is still live.

---

### Saturday 2026-04-25 — 4 hours (09:00–13:00 PT)

**Goal:** complete a clean dry-run of the installer. Also: if attorney met this week and feedback is in, finalize Artifact 1 for filing Monday.

- [ ] 09:00–11:30 — Run `install.sh` end-to-end against the throwaway account. Walk the D2 §3b table D1 through D20. Stop on first failure. Track time per step. Target: all D1–D11 pass today. D12–D20 can slip to the second dry-run.
  - [ ] D1 Butterbase signup + service key — already done Wednesday
  - [ ] D2 Schema apply — run `mcp__butterbase__dry_run_schema` then `apply_schema`
  - [ ] D3 All 13 function deploys
  - [ ] D4 Env map applied (use placeholder keys where real ones unsafe to expose)
  - [ ] D5 IonRouter smoke — real key, real ping. Verify `response.model == "moonshotai/kimi-k2.5"`
  - [ ] D6 Resend DNS — skip fully; use `ramesh-test.platformy.org` subdomain, accept ~24h propagation as ok
  - [ ] D7 Resend send-to-self — once DNS is up
  - [ ] D8 LinkedIn OAuth round-trip — **expected pain point, per D2 Appendix A**. Create the LinkedIn app under Ashish's own developer account with the throwaway redirect URI. Factor 20–40 min for the first attempt.
  - [ ] D9 LinkedIn `w_member_social` post + delete
  - [ ] D10 Google OAuth — add throwaway redirect URI to `thedi-493804` project; test sign-in
  - [ ] D11 Admin dashboard deployment — `create_frontend_deployment`, `set_frontend_env`, `start_frontend_deployment`. Verify URL loads.
- [ ] 11:30–12:00 — Write `install-logs/dry-run-ramesh-2026-04-25.md` with PASS/FAIL per step and wall-clock times. Target wall-clock ≤ 120 min; expect first dry-run to be 180+.
- [ ] 12:00–12:30 — Integrate attorney edits to Artifact 1 (if not already done Friday). Print hard copy + save PDF. Ready for Monday filing.
- [ ] 12:30–13:00 — Tear down the throwaway Butterbase app via `mcp__butterbase__delete_app` (D20). Rotate the test-tier keys. Tracker doc updated.

**Artifacts produced:** `dry-run-ramesh-2026-04-25.md` with identified failure points; finalized Artifact 1.

---

### Sunday 2026-04-26 — 1 hour final prep (20:00–21:00 PT)

**Goal:** start date is tomorrow. Stage everything so Monday feels boring.

- [ ] Review Saviynt onboarding email: confirm first-day logistics, address, laptop pickup, IT ticket. Do NOT open the Saviynt laptop until Monday. Artifact 1 goes out from personal device only.
- [ ] Queue Artifact 1 for filing:
  - Print or PDF the finalized letter.
  - Address to Saviynt Legal (mailing address from Saviynt website).
  - Draft an accompanying email to Saviynt Legal's general counsel (with cc to HR and hiring manager) — one paragraph pointing them to the attached letter and requesting the 14-day countersignature window.
  - **Do NOT send from Saviynt work email** (doesn't exist yet and must never be the channel). Send from personal Gmail.
  - Send Monday morning from home, before commuting.
- [ ] Review Week-0 tracker. Everything in green or explicitly deferred.
- [ ] Set calendar reminder: Tuesday 2026-04-28 end-of-day, "check Saviynt Legal acknowledgment of §2870 letter receipt."

**External waits active going into Week 1:**
- §2870 letter: filed tomorrow, 14 calendar days to countersignature → expected reply window 2026-04-28 through 2026-05-11.
- Attorney consult: expected completed, but if deferred, still blocks filing.

---

## Week 1 at Saviynt — 2026-04-27 through 2026-05-03

Focus is **paper artifacts + more dry-run reps**. No public v2 repo commits; the scratch-repo work continues privately.

### Monday 2026-04-27 — first day at Saviynt

**Morning, before commute (~07:00 PT):**
- [ ] Send Artifact 1 filing email to Saviynt Legal (gc@saviynt.com or equivalent) from personal Gmail. cc HR, cc hiring manager. Subject: `§2870 Carve-Out — Pre-Existing Personal Open-Source Project "Thedi" — Request for Countersignature Within 14 Days`. Attach Artifact 1 PDF + Attachment D architecture summary.
- [ ] Save sent email to tracker doc with timestamp. §2870 14-day clock starts now.

**Evening, 1 hour (20:00–21:00 PT):**
- [ ] File the **A7 moonlighting disclosure** with Saviynt HR using whatever intake form the handbook specifies (usually an HR portal + a PDF). This is a separate filing from Artifact 1 but references it. Name Ramesh as the single current user. State: "no money, OSS, user runs own infrastructure." Attach a copy of Artifact 1.
- [ ] Note the filing timestamp. Tracker doc.
- [ ] Check for Saviynt IP / PIIA surprises: re-read the agreement now that you're inside and have access to the employee portal. Any language different from what attorney saw last week? If yes, email the attorney: "Found this clause on day 1 — does it change your view?" Brief paid follow-up consult if needed (~$150).
  - **[FALLBACK] If the PIIA is materially broader than what the attorney reviewed** (e.g., explicit "AI-for-identity" language, or assignment-of-personal-time clauses): pause. Do NOT continue Thedi work. Open the Week-0 tracker, add a red flag, schedule an emergency 30-min attorney follow-up.

### Tuesday 2026-04-28 evening — 1 hour (20:00–21:00 PT)

- [ ] Check: did Saviynt Legal acknowledge receipt of Artifact 1? Usually Legal sends a "received, in review" boilerplate within 2 business days. If not, that's a mild signal; not yet worrying.
- [ ] Second dry-run of the installer, focused on the D-steps that failed on Saturday. Fresh throwaway account: `ash-test+ramesh-2026-04-28@platformy.org`.
- [ ] Work through failing steps. Target: add PASS rows to `dry-run-ramesh-2026-04-28.md`. Tear down at end of hour.

### Wednesday 2026-04-29 evening — 1 hour (20:00–21:00 PT)

- [ ] Continue installer hardening. Focus this evening: the D15 end-to-end orchestrator test (`fn_interview_bot` → `fn_drafter` → `fn_critic` round-trip). Even with stub functions, the state machine transitions must fire.
- [ ] Draft the admin dashboard skeleton (React SPA at `frontend/admin/`). Four routes per D2 §2f. Don't style yet — pure function routing + the compose-editor markdown view. This is the A4 work that A2 displaced Beehiiv to free.

### Thursday 2026-04-30 evening — 1 hour (20:00–21:00 PT)

- [ ] Saviynt HR onboarding: check if moonlighting disclosure was received & acknowledged. If not, follow up in HR portal.
- [ ] Dashboard: finish the `/admin/compose` markdown editor. Use `react-markdown` or equivalent. This is the compose surface (A2).
- [ ] Tracker doc update.

### Friday 2026-05-01 evening — 1 hour buffer (20:00–21:00 PT)

- [ ] Catch up on anything that slipped. Expected-state check: dashboard skeleton compiles; installer dry-run #2 all green; §2870 letter acknowledged as received.
  - **[FALLBACK — Saviynt onboarding ate all evenings.]** If Monday–Thursday were consumed by new-hire training, laptop imaging, security courses, etc., and no Thedi work got done: **do not panic.** Amendment A6 freeze is still active; no deadline was missed. Move all Week-1 Thedi work into Saturday's block and shorten Week-2 scope. The only hard deadline was filing Artifact 1 Monday morning before work — that takes 5 minutes and must have happened regardless of onboarding chaos.

### Saturday 2026-05-02 — 3–4 hours (09:00–13:00 PT)

**Goal:** dry-run #3 (clean end-to-end) and **book the Phase-2 install call with Ramesh** if the §2870 letter has been countersigned.

- [ ] 09:00–11:00 — Clean end-to-end dry-run. All 20 D-steps green. Write `dry-run-ramesh-2026-05-02.md`. This is the "ready for real install" artifact.
- [ ] 11:00–11:30 — Check on §2870 countersignature. Legal has had 6 calendar days. 8 business days remaining on the 14-day clock.
- [ ] 11:30–13:00 — **If 5-point agreement has been returned with "yes"** (expected by end of week 2, so probably not yet): schedule install call. Otherwise, use this block for dashboard work or to draft `docs/ROTATION.md`.

### Sunday 2026-05-03 — 1 hour (20:00–21:00 PT)

- [ ] Review Week-1. Close out tracker items.
- [ ] Prepare Week-2 plan: if §2870 is countersigned, Monday 2026-05-04 unfreeze + send 5-point → unblock first v2 commit by end of week. If not, keep going on paper artifacts + dashboard.

---

## Week 2 — 2026-05-04 through 2026-05-10

Branching plan. **Path A** = §2870 countersigned by Monday. **Path B** = not yet.

### Path A — countersigned by Monday 2026-05-04

#### Monday 2026-05-04 evening — 1.5 hours

- [ ] File the countersigned letter in personal records + in Saviynt HR portal if the portal accepts supplementary docs.
- [ ] **Send the held 5-point email to Ramesh** (Gmail draft from Tuesday 2026-04-21). Time the send for ~20:00 PT weekday evening — personal hours, personal email on both ends, no Saviynt-channel overlap.
- [ ] Tracker doc: "Artifact 2 sent; awaiting Ramesh yes."

#### Tuesday 2026-05-05 evening — 1 hour

- [ ] No reply yet is normal — Ramesh has a day job. Use this hour to finalize `docs/ROTATION.md` per Phase-2 plan: per-key 10-line sections, 90-day cadence.

#### Wednesday 2026-05-06 evening — 1 hour

- [ ] Check Ramesh inbox. If replied yes: unfreeze the v2 repo (see "Repo unfreeze procedure" below).
- [ ] If not: keep working privately.

#### Thursday 2026-05-07 evening — 1 hour

- [ ] **Ramesh 5-day fallback check.** If 5 days have passed since the 5-point email with no reply: send a single-sentence nudge from personal Gmail:
  > Subject: Re: Thedi v2 — quick alignment on five things before I start the weekend build
  >
  > Hey — circling back on this once. No pressure; just want to know if the five points work before I sink more weekend hours. A one-word "yes" or "let's talk" is fine.
  > — Ashish
- [ ] If Ramesh signals "let's talk": schedule a 20-min call via personal phone for a weekend. Do NOT use work calendar.
- [ ] If silence persists after the nudge: hold the freeze another week. Use the time for the dashboard + installer. Do not push the public repo.

#### Repo unfreeze procedure (when Ramesh has replied "yes")

- [ ] Create public GitHub repo `github.com/[ashish-handle]/thedi` under personal account. MIT license at init. README brief.
- [ ] First commit: `LICENSE`, `README.md`, `RECUSAL.md`, `RECUSAL_LOG.md`. Remove `FROZEN_UNTIL_CARVEOUT.md` from scratch repo; never push it.
- [ ] Second commit: `docs/ROTATION.md`.
- [ ] Third commit: installer scaffolding.
- [ ] Tag: `v0.1.0-unfrozen`.
- [ ] Update tracker: "repo public, Phase 1 build begins."

#### Friday–Saturday 2026-05-08/09 — begin Phase 1 build

Per `thedi-v2.md` Phase-1 table: scout dedup (0.5h), model-ID assertion (1h), interview-bot MVP (8h), admin dashboard continuation (6h). Saturday is the long block; start with the interview-bot since that unblocks Ramesh's first Q&A.

#### The install-call scheduling question (Path A only)

Book the Phase-2 install call with Ramesh. **Prerequisites that must be done first:**

1. §2870 countersigned ✓ (path A condition)
2. 5-point agreement "yes" from Ramesh ✓ (path A condition)
3. Two clean dry-runs in the last 7 days (from Week-1 Saturday + one more before the call)
4. All 13 functions deployed + tested on a throwaway account
5. `docs/ROTATION.md` committed
6. `HANDOFF.md` template ready to fill

**When:** earliest viable Saturday is **2026-05-23** (Phase-2 week 4 of the roadmap) assuming Path A unfreeze ~2026-05-06 + 2.5 weeks of Phase-1 build. Path A week 2 ends 2026-05-10 with the 5-point "yes" and the first commits. The install itself is Phase-2, not Phase-1; it's scheduled **for** in Week 2 but **happens** in Phase 2.

**Calendar invite** (send from personal Gmail to Ramesh's personal email, not work calendar):

> Subject: Thedi install — 90 min expected, 3 hours booked
>
> When: Saturday 2026-05-23, 09:00–12:00 PT (3-hour block)
> Where: Zoom link below + screenshare from both sides
> What: one-time install of Thedi on your own Butterbase account.
>
> Honest time budget: 90 minutes if everything goes perfectly, 3 hours if OAuth redirects or DNS fight us. I've booked 3 hours so we never feel rushed. If we finish in 90 min, great — we take the rest of the morning off.
>
> Before the call you'll need:
>  - Credit card ready (for Butterbase free tier; card is held for overflow only)
>  - Personal Gmail + a non-Saviynt email address confirmed
>  - 1Password account (I'll share a vault called "Thedi" ahead of the call)
>  - 45 minutes the evening before to skim a 1-page "what we'll do" doc I'll send
>
> I do a clean dry-run the Wednesday before against a throwaway account. If the dry-run fails, I'll reschedule us — I'd rather push a week than half-install.
>
> Zoom: [link]

### Path B — not countersigned by Monday 2026-05-04

#### Monday 2026-05-04 evening — 1 hour

- [ ] Check inbox. No countersignature.
- [ ] Send a polite follow-up to Saviynt Legal from personal email:
  > Subject: Re: §2870 Carve-Out — Thedi — Checking on Timeline
  >
  > Hi — writing to check on the timeline for the §2870 acknowledgment I filed on 2026-04-27. The letter requested a 14-calendar-day countersignature window, which lands on 2026-05-11. I want to make sure the request is routed and not waiting on additional input from me. Happy to provide anything you need.
  > — Ashish
- [ ] Do NOT follow up via Slack / in-person. Always personal email.

#### Tuesday–Friday 2026-05-05 through 2026-05-08 evenings — 1 hour each

- [ ] Continue scratch-repo work: finish installer skeleton, finish dashboard skeleton, finish `docs/ROTATION.md`. None of this pushes public.
- [ ] No v2 commits to public repo.
- [ ] Thursday: if still no countersignature (day 10 of 14), check whether Saviynt Legal has scheduled an internal review meeting. Escalate to hiring manager with the neutral framing: "Heads up — §2870 acknowledgment I filed 2 weeks ago hasn't come back yet. Is there someone in Legal I should chase?"

#### Saturday 2026-05-09 — 3–4 hours

- [ ] Installer dry-run #4, fully green.
- [ ] Dashboard polish.
- [ ] Draft of Phase-1 scout-dedup patch (in scratch repo only).

#### Sunday 2026-05-10 — 1 hour

- [ ] Review. 14-day clock expires 2026-05-11 (tomorrow).
- [ ] Decide Monday's escalation: if still no countersignature + no communication, the letter's §Signatures block says "please provide a written response." Send that request. In parallel, re-engage the attorney for a 30-min consult on next steps (may be: register the existing `thedi-v1` repo history as prior art; decline to resume v2 work under Saviynt employment; etc.).

**Path B never sends the 5-point email to Ramesh.** Ramesh must not know the letter is blocking; that would create pressure from him to Saviynt that's itself a problematic dynamic. Keep the channel clean: Ashish's legal situation is Ashish's to resolve, not Ramesh's to apply leverage to.

---

## Fallback scenarios — consolidated

### Ramesh doesn't reply in 5 days to the 5-point email

Send the one-line nudge shown in Path A Thursday. Single nudge, no second. If still silent after another 5 days:

1. Do not send a third email.
2. Hold the v2 build at its current state (dashboard + installer + scout-dedup ready; no interview-bot work yet, because that's the first work that needs Ramesh's actual input).
3. After 3 weeks of silence total (2 weeks beyond the nudge), treat as a soft "no" — Ramesh has drifted. The OSS repo is still public under Ashish's name; the project becomes a maintainer-waiting-for-users situation, which is fine. Ashish does not keep building speculatively.

### California employment attorney can't see Ashish for 2 weeks

Attorney review is ideal but not strictly blocking. Sequence:

1. Widen search — SF Bar Association referral ($35/30min), LegalZoom directory, LinkedIn search for "California employment attorney §2870."
2. A 30-minute consult is sufficient — the letter is already drafted; Ashish only needs pressure-test on adjacency + cite verification.
3. **If no consult is possible before the 2026-05-04 target filing date:** file the letter **without** cites. Remove §5 "Supporting Legal Context" entirely. The letter stands on its own plain-language §2870 recitation (§2) and factual application (§4) without needing case citations. This is weaker but not fatal.
4. After filing, keep searching. An attorney review can still inform the follow-up if Saviynt pushes back.

### Saviynt onboarding eats Monday–Friday evenings in Week 1

Acceptable. The three gates are:

1. Artifact 1 filed Monday morning (pre-commute) — 5 minutes. Non-negotiable.
2. Moonlighting disclosure filed — can be Wednesday or Friday evening; 30 minutes.
3. Dry-run #2 — can slip into Saturday 2026-05-02; Saturday block exists for this.

If onboarding eats weekends too (Saviynt-sponsored Saturday training or similar), rework Week 2 to absorb the Week-1 slip. The freeze protects us: there's no external deadline being missed; only the internal build schedule slides, and everything slides together.

### Installer fails the final dry-run before the real call

Per D2 §4h: reschedule the Ramesh install 7 days out. Re-do dry-run. Ashish says the agreed phrase: *"Let's stop here. I'll patch and reschedule — I don't want to half-install this on you."*

### Ramesh asks via Saviynt channel during Week 1 or 2

Per red-flag trip-wire: one-sentence response, "please open a GitHub issue." But the issue doesn't exist yet if the repo isn't public. So: "Let me get back to you on this — the project's going public soon and this is the kind of thing that should live in GitHub issues once it is. Can I circle back Monday via personal email?" Zero Saviynt-channel commitment. Move the conversation to personal Gmail immediately.

---

## Tracker doc — single-page status view

Maintain at top of `Thedi — Week 0 Tracker` Google Doc:

| Gate | Status | Target date | External dep |
|---|---|---|---|
| Attorney consult booked | ☐ | 2026-04-21 | 3 attorneys emailed |
| Artifact 1 finalized | ☐ | 2026-04-25 | Attorney review |
| Artifact 1 filed | ☐ | 2026-04-27 | — |
| Moonlighting disclosure filed (A7) | ☐ | 2026-04-27 | — |
| Dry-run #1 partial | ☐ | 2026-04-25 | — |
| Dry-run #2 | ☐ | 2026-04-28 | — |
| Dry-run #3 clean end-to-end | ☐ | 2026-05-02 | — |
| §2870 countersigned | ☐ | 2026-05-11 (day 14) | Saviynt Legal |
| 5-point email sent | ☐ | 2026-05-04 (Path A) | countersignature |
| Ramesh "yes" reply | ☐ | 2026-05-09 (Path A) | Ramesh |
| Repo public, v0.1.0 tagged | ☐ | 2026-05-10 (Path A) | all above |
| Install call scheduled | ☐ | 2026-05-10 | repo public |
| Install call executes | ☐ | 2026-05-23 | dry-run #4 clean |

---

*End of I3-A action checklist.*
