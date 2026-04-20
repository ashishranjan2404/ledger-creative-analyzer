# Thedi v2 — Ashish's Action Checklist

*The one artifact Ashish opens to know what to do today. Maps each action to the research-package file that contains the prose/template/script for it. Ticks are literal — check them as you go.*

**Start date:** 2026-04-19 (Sunday). First action is tonight or tomorrow morning.

> **⚠ Updated post-ground-truth-sweep (see [`DECISION.md`](DECISION.md)'s late-correction banner).** Tomorrow-morning order changed: before the coffee invite, spend ~2 hours fixing what the landing page promised and Ramesh already asked for in his digest-1 feedback. The new Tomorrow section below reflects this; don't skip to the coffee-invite step.

---

## Today — Sunday 2026-04-19

- [ ] **Read [`DECISION.md`](DECISION.md) top to bottom.** 1 page. The whole package converges here. If you disagree with Option B (v0-first), stop and re-read it with that disagreement written down; the sunk-cost bias is real.
- [ ] **Read [`iter12/I12-execution-ready-artifacts.md`](iter12/I12-execution-ready-artifacts.md).** This is the literal text for tomorrow and the week. Skim it now so you know what you're sending tomorrow.
- [ ] *Optional — only if you're feeling skeptical of the recommendation:* Read [`iter8/I8-A-counter-plan.md`](iter8/I8-A-counter-plan.md). This is the case for v0. If after reading it you still want v2, trust that — but check [`iter10/I10-C-post-coffee-decision-tree.md`](iter10/I10-C-post-coffee-decision-tree.md) §"misreading toward v2 costs 80 hours and a filed letter."
- [ ] *Optional — only if you have the time budget to ship a parallel project alongside Thedi:* Read [`iter10/I10-B-parallel-oss-brainstorm.md`](iter10/I10-B-parallel-oss-brainstorm.md) for the reasoning, then [`iter15/agentspy-seed/README.md`](iter15/agentspy-seed/README.md) for the literal starter kit. Pre-committing to the parallel project is amendment D2; not doing it means Thedi is the only pinned repo and month-12 career-narrative audit closes net-negative. First concrete action is issue #1 (schema definition) in [`iter15/agentspy-seed/docs/ROADMAP.md`](iter15/agentspy-seed/docs/ROADMAP.md).
- [ ] *Optional — if you want to see what Ramesh's first post could look like before writing one:* Read [`iter14/I14-sample-thedi-post.md`](iter14/I14-sample-thedi-post.md). 1,223 words on agent observability. Useful as a voice reference for your v0 reviews.

---

## Tomorrow — Monday 2026-04-20, morning

**The one thing** *(amended post-ground-truth-sweep)*: fix what Ramesh already asked for, THEN text him the coffee invite. ~2 hours of morning work + a one-line text.

### Morning ~1: Fix what the landing page promised and the digest-1 feedback surfaced

- [ ] **Apply the `extracted_prefs: {}` fix** (30 min). `thedi/functions/scout_feedback_submit.ts:26-51` silently swallows all errors. Add one-shot example to the system prompt, log the LLM response content to `audit_log.note`, stop catching exceptions without logging them. See [iter-21 I2 amendment](round4/thedi-v2.md) §"The `extracted_prefs: {}` bug root cause" for the specific fix.
- [ ] **Resolve the landing-page-vs-scout mismatch** (5 min decision + up to 6h shipping). Landing page promises "arxiv, HN, and X"; scout does arxiv + HN only. Two paths:
  - *Fast:* Edit the landing copy to drop "and X" (15 min). Ramesh's feedback becomes "oh, that was aspirational — here's when I can add it."
  - *Better:* Per [iter-21 I2 amendment](round4/thedi-v2.md) §"Source expansion", add Substack RSS + Bluesky + Lobsters (5-6h). Then the landing copy gets UPGRADED to match: "arxiv, HN, Substack, Bluesky." This addresses Ramesh's intent ("non-academic, practical") without chasing the infeasible X official API or the unstable Nitter mirrors.
  - Pick one in 5 minutes; the hours only happen if you pick "Better."
- [ ] **Resolve the "every morning at 7 AM" promise** (15 min decision + up to 30 min shipping). Landing page promises it; there's no cron. Either add a weekly cron to `scout-polish-now` (30 min of Butterbase MCP work), or update copy to "weekly" / "on demand."
- [ ] At the end of this block, both deployed state and landing-page copy are internally consistent.

### Morning ~2: The coffee invite

- [ ] **Send the iMessage in [`iter12/I12-execution-ready-artifacts.md`](iter12/I12-execution-ready-artifacts.md) §1**. One line. Do not embellish.
- [ ] Put "**coffee with Ramesh (90-min block)**" on calendar for whatever time he picks.
- [ ] **Do not send a separate "here's my plan" doc** — the coffee carries that conversation. You can mention at coffee that you applied his feedback; don't front-load the claim in text.
- [ ] **Do not do any §2870 / attorney / repo-creation work** until after the coffee. C1 still holds.

---

## Before the coffee (whatever day it lands)

- [ ] **The night before:** read [`iter10/I10-C-post-coffee-decision-tree.md`](iter10/I10-C-post-coffee-decision-tree.md) §"one-page cheat sheet." Screenshot the cheat sheet to your phone.
- [ ] Read [`iter4/I4-B-ramesh-conversation-script.md`](iter4/I4-B-ramesh-conversation-script.md) §Act 1 once. Not to memorize — to pattern-match. Note the "overkill test" (I10-C Signal 4) and the "what does this buy you in 12 months" question.
- [ ] **5 minutes before coffee:** re-read the phone cheat sheet once. That's enough. Walk in relaxed.

## During the coffee

*Phone in pocket. The cheat sheet is for the parking lot, not the table.*

- [ ] Ask the "what does this look like in 12 months" question first.
- [ ] Float the "honestly this might be overkill — we could just do a Friday digest and a Google Doc" line at some point in the first 10 minutes.
- [ ] Listen specifically for **a named concrete blocker** (not warm agreement). No named blocker → default to v0.
- [ ] If Ramesh mentions the hiring-funnel (Scenario D) in any form: go to [`iter11/I11-A-failure-playbooks.md`](iter11/I11-A-failure-playbooks.md) §Playbook 4 within 48 hours. Do not agree in the moment.
- [ ] If Ramesh asks "can you just host it for the first month?": go to [`iter11/I11-A-failure-playbooks.md`](iter11/I11-A-failure-playbooks.md) §Playbook 2, now updated with the warmer register in [`iter12/I12-execution-ready-artifacts.md`](iter12/I12-execution-ready-artifacts.md) §5. Use the in-the-moment version; send the 24-hour follow-up.

## Within 48 hours after coffee

Pick one branch based on what Ramesh actually said (not what you wanted him to say). Signals in [`iter10/I10-C-post-coffee-decision-tree.md`](iter10/I10-C-post-coffee-decision-tree.md) §"branching decision tree."

### Branch 1 — v2 from day 1 (~10% probability)
- [ ] Send the 3 attorney outreach emails from [`iter12/I12-execution-ready-artifacts.md`](iter12/I12-execution-ready-artifacts.md) §2 (the "send post-coffee only" version).
- [ ] Write `FROZEN_UNTIL_CARVEOUT.md` in the future Thedi repo — freeze all v2 commits until the §2870 countersignature lands.
- [ ] Schedule the attorney consult (target: within 5 business days).
- [ ] Follow [`iter3/I3-A-week-1-action-checklist.md`](iter3/I3-A-week-1-action-checklist.md) from §"Path A" — but with the C1 inversion already applied (the coffee already happened).

### Branch 2 — v0 for 3 months (default, ~60-70% probability)
- [ ] Send the confirmation email from [`iter12/I12-execution-ready-artifacts.md`](iter12/I12-execution-ready-artifacts.md) §4 within 24 hours. Subject line is specified there; don't rewrite it.
- [ ] Create the shared Google Doc workspace per [`iter10/I10-A-v0-specification.md`](iter10/I10-A-v0-specification.md) §"v0 Runbook." One Doc per post; use the templated structure in that file.
- [ ] Verify the existing Thedi v1 scout is still emailing Friday digests. Small prompt tweak if needed (see I10-A).
- [ ] Calendar-block the month-3 retrospective for 2026-07-20 (or 90 days post-coffee if later).
- [ ] *Parallel track:* start the D2 parallel OSS project (`agentspy` per [`iter10/I10-B-parallel-oss-brainstorm.md`](iter10/I10-B-parallel-oss-brainstorm.md) §3). Day-1 action is there.

### Branch 3 — Scout-digest-only (~20-25% probability)
- [ ] Send Ramesh a short "glad we talked — I'll keep the scout pointed at your inbox, reach out if you ever want editorial eyes." No further infrastructure.
- [ ] Close the research package mentally. Do not start the parallel OSS project as a Thedi-displacement activity.

### Branch 4 — Drop it entirely (~5-10% probability)
- [ ] Turn off the Friday digest (to stop spamming his inbox with something he doesn't want).
- [ ] Archive the research package with a commit like `feat: archive thedi research; ramesh declined`.
- [ ] Move on. The retrospective in [`iter11/I11-B-meta-retrospective.md`](iter11/I11-B-meta-retrospective.md) §"durable process lessons" carries.

---

## Weeks 1–12 (v0 branch only)

The weekly cadence: see [`iter10/I10-A-v0-specification.md`](iter10/I10-A-v0-specification.md) §"v0 Runbook." One-line rhythm:

- [ ] **Monday**: scout runs automatically (no action needed).
- [ ] **Friday**: scout digest lands in Ramesh's inbox.
- [ ] **Sunday/Monday**: 30-min in-line review pass on whatever draft exists in the shared Doc.
- [ ] **Monthly (first of month, 15 min)**: fill in the tracking sheet — see [`iter13/I13-90day-retro-template.md`](iter13/I13-90day-retro-template.md) §"what Ashish tracks."
- [ ] **Monthly hours check with partner** (I11-A's latent bug fix). 5-minute conversation: "what have you seen me doing on weekends?" Write down the observed-hours number.

If anything unusual happens, open the failure playbook it matches:
- [ ] Saviynt-channel crossover (Slack, work email, in-office) → [`iter11/I11-A-failure-playbooks.md`](iter11/I11-A-failure-playbooks.md) §Playbook 3
- [ ] Ramesh silent for 3+ weeks → [`iter11/I11-A-failure-playbooks.md`](iter11/I11-A-failure-playbooks.md) §Playbook 6
- [ ] Organizational reorg involving either of you → [`iter11/I11-A-failure-playbooks.md`](iter11/I11-A-failure-playbooks.md) §Playbook 7
- [ ] Partner raises time cost → [`iter11/I11-A-failure-playbooks.md`](iter11/I11-A-failure-playbooks.md) §Playbook 8

---

## Day 90 — the month-3 retrospective

- [ ] **Solo pre-meeting work (night before, 30 min)**: [`iter13/I13-90day-retro-template.md`](iter13/I13-90day-retro-template.md) §"pre-meeting solo work." Five questions. Write your honest private answer before you meet. Pay special attention to Q4 — the reflexive 3-word response surfaces the self-deception before the rationalization layer activates.
- [ ] **The meeting (45 min)**: follow the agenda in [`iter13/I13-90day-retro-template.md`](iter13/I13-90day-retro-template.md) §"month-3 meeting agenda."
- [ ] **Watch for "upgrade-as-escape."** The strongest bias at the 90-day retro is NOT "keep going" — it's "now's the time for v2" (Outcome C), because C lets you use the research you already did. Before picking C, force yourself to name the pattern: is there a *specific* feature_ask that's been wanted 3+ times? If not, pick A or B — not C.
- [ ] **Decide**: one of four outcomes per [`iter13/I13-90day-retro-template.md`](iter13/I13-90day-retro-template.md) §"decision matrix." Write down the outcome within 24 hours.

---

## If at any point you find yourself drifting back into v2-planning mode

- [ ] Re-read [`DECISION.md`](DECISION.md) §"The decision I'd make if I were Ashish" — specifically the paragraph about sunk-cost gravity.
- [ ] Re-read [`iter11/I11-B-meta-retrospective.md`](iter11/I11-B-meta-retrospective.md) §"was it worth it" — specifically the part about *"learning a process lesson the expensive way is fine the first time; not the second."*
- [ ] If you still want to upgrade to v2, apply the I10-A Part 3 test: is there a specific named blocker v0 created? If not, keep running v0.

---

*Last updated after iter-13. If a future iteration adds artifacts, append to the relevant section above.*
