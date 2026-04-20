# I4-A — Final Red Team (fresh-eyes adversarial pass after all amendments)

*Iter-4 deliverable. Prior passes: round5/red-flag-report (iter-1), iter-2 D1/D2/D3 (iter-2), iter-3 I3-A/B/C (iter-3). This pass looks for **new** weaknesses — not repeats of those — with all A1–A8 and B1–B5 amendments now integrated.*

---

## Skeleton

1. Risk 1 — **The A2×B2 interaction: compose surface ships empty, then stays empty.**
2. Risk 2 — **The A3×B4 two-gate × last-write-wins collision: rubric approved by Ashish on Thursday, shipped rubric written over by an in-flight critic on Friday.**
3. Risk 3 — **The 2026-05-23 install call is now mis-scheduled: B2-conservative path means install-day has no real load to exercise.**
4. Risk 4 — **Ambiguous-"yes" from Ramesh and the plan's silence-default bias.**
5. Risk 5 — **Partner-cost of "weekend block" load-bearing on every Path A/B branch.**
6. **What would I actually do** — the one change.

---

## Risk 1 — The A2×B2 interaction: "compose surface ships but stays empty"

**Amendment space.** A2 (drop Beehiiv, compose in `/admin`) × B2 (manual posts first, pipeline off until post 5+) × A4 (dashboard is Phase-1 Ramesh surface).

**Scenario.** Ramesh picks the conservative build order per B2 on his North Star reply: "I'll write 3–5 manual posts first; activate pipeline on post 6." Ashish ships the Phase 1 `/admin` dashboard on 2026-05-09 per the A4 schedule — compose editor, alerts, rubric-delta view, pipeline screen. Ramesh logs in once during the install call, says "cool," and then goes back to drafting his first manual post in his preferred tool (Bear, or Google Docs, or Substack's own editor). He does not paste into the `/admin` compose editor because the pipeline isn't running yet — there is nothing for the compose editor to compose *from*. Six weeks pass. Ramesh has shipped 3 manual posts, all drafted in Bear. The `/admin` URL is bookmarked but unvisited since install day. The A4 14-day silence trigger fires three times. Each time Ashish gets an email, replies "ignore — he's writing manually per B2," and the trip-wire gets desensitized. Ramesh never writes into `/admin`; the rubric has no calibration data because Ramesh's essays never passed through the editor; when the pipeline "activates on post 6" the rubric has zero Ramesh-edit-signal and falls back to the seed rubric, which is interview-bot-register, which is the exact failure Reviewer 1 warned about — **B2 has not actually bought what it was supposed to buy**.

**What's new.** Prior passes flagged register-mismatch (Reviewer 1) and the silence-pause trigger (A4). They did not notice that **B2 and A4 together create a 6-week window where the dashboard silence-counter is *guaranteed* to fire** and that **B2's benefit only materializes if Ramesh's manual posts flow *through* the compose editor** — which the plan never requires. The dashboard becomes an empty stage.

**Mitigation.** In the Path A unfreeze procedure, add one commit: the compose editor's empty state for the pre-post-6 window shows a single text block — *"Paste your finished post here before you publish — even in manual mode. This trains the rubric."* And the `/admin/compose` screen in conservative mode accepts a finished essay (no Q&A session, no critic round) and writes it to `drafts` with `source='manual_paste_for_calibration'`. One UI change; saves B2's entire premise. Also: during the B2 window, the A4 silence-pause threshold raises to 30 days, not 14 — the pipeline has nothing to pause.

---

## Risk 2 — A3 × B4 collision: two-gate rubric survives Ashish approval, dies to a last-write-wins compose race

**Amendment space.** A3 (rubric delta needs Ashish + Ramesh gates) × B4 (compose editor ships last-write-wins with banner) × iter-2 D1's `fn_revalidate_golden_set` async trigger.

**Scenario.** Thursday 2026-06-11, 23:40 PT. Ashish, between two Saviynt on-call pages, approves a rubric delta (add `"in the realm of"` to ban list) from his phone via the signed email link. Delta status → `ashish_approved`. Friday 07:30 PT, Ramesh opens the admin dashboard, sees the rubric pending item, clicks Approve. `fn_revalidate_golden_set` fires async and begins re-scoring the last 8 posts against the new rubric. Friday 09:15 PT, the week's critic finishes round-1 on a fresh draft, decides score is 61/85, fires the rewriter. The rewriter writes a new `body_md` to the `drafts` row. Meanwhile Ramesh is editing post 14 in `/admin/compose` (Tab A, open since yesterday) with a stale `client_rev`; B4's "last-write-wins with banner" fallback shipped because slot 2:30 went over. Ramesh hits Save at 09:16. His save clobbers the rewriter's body. The banner was dismissed yesterday and doesn't re-show. The published post is Ramesh's now-partial edit of the round-0 draft, not the rewrite. Rubric scores in the health email look fine (the critic ran against a body that no longer exists).

**What's new.** Prior passes flagged (a) the rubric two-gate (A3) as a safety, (b) the last-write-wins fallback (B4) as a Phase-1.5 compromise, (c) the golden-set revalidation (D1) as the rubric-change consequence. None of them looked at what happens when **all three fire in the same 18-hour window**. A3's two-gate is designed to slow rubric changes down; B4's LWW assumes writes are rare; D1's async revalidation assumes the rubric is stable during revalidation. They interact to produce a write-collision the Pipeline screen won't show because the state machine thinks the post is still in `rewriting`.

**Mitigation.** When a rubric delta ships, `fn_admin_api` sets `pipeline_paused=true` for the duration of `fn_revalidate_golden_set`, with an auto-unpause on completion. This is 4 lines of code. It prevents any critic/rewriter/compose write during the window where the rubric and body could fork. Ship this before Phase 2's critic goes live, not as a Phase-1.5 nice-to-have.

---

## Risk 3 — The 2026-05-23 install call is load-bearing on a pipeline that isn't running

**Amendment space.** A1 (install call: 90min expected, 3h booked) × B2 (manual-first) × I3-A week-1 checklist (install call target 2026-05-23).

**Scenario.** Ramesh picks B2-conservative on 2026-05-06. The 2026-05-23 install call proceeds on schedule. Ashish runs through D2's 20-step installer — OAuth round-trips, schema apply, 13 function deploys, smoke tests. Every function deploys successfully; every smoke test passes with stub data. The `fn_smoke_test` pings IonRouter, Resend, LinkedIn, Anthropic, all green. Install "completes" in 2h 40min. Ashish deletes his staging instance per A1. `HANDOFF.md` commits. Both parties exhale. Problem: **none of the production paths were exercised with real load.** `fn_drafter` has never drafted, `fn_critic` has never critiqued, the topic-picker email was never sent to Ramesh's real inbox, the syndication flow never ran. The smoke tests verified connectivity, not behavior. Five weeks later, when Ramesh ships post 6 and the pipeline activates for the first time in production, `fn_drafter` returns a 502 from IonRouter because the kimi-k2.5 model alias retired two weeks ago and nobody noticed — no post has ever flowed through. Model-ID assertion would have caught it — if a real call had ever been made in production. Ashish is 6 weeks into his Principal Engineer role and cannot triage at 06:00 PT. Post 6 slips. The trip-wire "first real post after 5 manual" becomes the first real production bug; Ramesh's trust in the pipeline craters on its debut.

**What's new.** Prior passes stressed the install *call* (A1, 3-hour booking, dry-runs). None noticed that **A1's install-call protocol and B2's manual-first build order jointly guarantee a 5-week gap between "install completes" and "first real load."** In the aggressive-build-order world, post 1 exercises everything within 7 days. In the conservative world, the pipeline sits idle long enough for upstream changes (model retirement, OAuth scope changes, Beehiiv-equivalent TOS changes, LinkedIn API version bumps) to silently break the stack between install and first use.

**Mitigation.** Add one ritual to the `/admin/pipeline` screen: a **"Run a synthetic end-to-end post"** button, visible in B2-conservative mode, that Ramesh (or a weekly cron) triggers every 7 days during the manual-first window. Uses a canned topic + canned Q&A + logs to `pipeline_events` with `is_synthetic=true`. Exercises every real API, every model assertion, every syndication edge. Drops the post into a "synthetic-posts" holding table, does not publish, does not email. 20 LOC, catches the 5-week-silent-rot class of failure.

---

## Risk 4 — "Sure, seems reasonable" is not "yes," and the plan treats it as one

**Amendment space.** I3-A's Ramesh reply-handling ("5-day nudge; 3-week silence = soft no") × I3-B Reviewer 2's "change 'yes' to 'I agree'" recommendation (noted but not integrated into the action checklist) × the 5 conditions that "must be true in writing."

**Scenario.** Tuesday 2026-05-05, 21:14 PT. Ramesh replies to the 5-point email from his phone, mid-commute: *"Ash — this all seems reasonable to me. Let me think about the North Star one over the weekend, but the OSS + self-host + recusal stuff is fine. Let's grab coffee Saturday to talk about the subscriber angle — my treat. R."* Ashish reads it Wednesday morning, feels the emotional rush of "he said yes," and moves the unfreeze procedure to Wednesday night. First commits land 2026-05-07. Problem: Ramesh did not say "I agree" to points 1–5. He said points 1–4 are fine *and* he wants to discuss point 5 (re-paper threshold) AND point 1-adjacent (North Star) AND he wants to do it in-person Saturday, which is **the exact Saviynt-channel-crossover-adjacent scenario the plan bans under point 3**. Saturday coffee is not a Saviynt channel, but it is also not GitHub Issues; it's the "casual 1:1 that creates oral side agreements" pattern. Worse: Ashish never got the written "I agree" on point 3 itself. If, 9 months from now, an HR inquiry asks "were the channel rules agreed to in writing before work began?" the answer is "there is an email reply that says 'this all seems reasonable to me' but does not restate any point." Reviewer 2 already warned about this; the I3-A checklist's "await Ramesh 'yes' reply" did not integrate the warning.

**What's new.** Prior passes noted (a) Ramesh silence-default (3 weeks = soft no), (b) the "I agree" upgrade recommendation from Reviewer 2, (c) the Saviynt-channel ban. None looked at the **middle-case**: an enthusiastic, affectionate, non-committal reply that *feels* like yes and reads, in evidentiary terms, like mush. The I3-A checklist treats replies as binary (yes/silent) — no handling for the positive-but-ambiguous reply, which is the **most likely** reply from a kind senior colleague.

**Mitigation.** Add one state between "sent" and "yes" in the tracker: `replied_ambiguous`. Handler: a single follow-up email, same thread, *"Thanks Ramesh — for my records (and because I'm building this in writing as we agreed), could you reply with just 'I agree to points 1–5' in-line? Saturday coffee sounds great — let's keep any decisions from coffee in a GitHub issue afterward so we have them written down."* Single, scripted, non-awkward. Without that reply-in-hand, the repo stays frozen.

---

## Risk 5 — The weekend block is load-bearing; Ashish's partner is the unpriced dependency

**Amendment space.** I3-A's Saturday 4-hour blocks (2026-04-25, 2026-05-02, 2026-05-09, 2026-05-23 install call, Phase-2 Saturday builds) × the "≤2hr/wk post-launch" constraint from the compensation section × Ashish's incoming Principal Engineer role.

**Scenario.** Through the end of Phase 2 (2026-06-08), I3-A books Saturday mornings for 7 consecutive weekends (04-25, 05-02, 05-09, 05-16, 05-23 install, 05-30, 06-06). The plan frames these as 3–4 hour blocks; in practice, attorney follow-ups, installer dry-run failures, the real install slipping to 3 hours booked, and the inevitable Saturday-afternoon post-install debugging turn each weekend into a full day. Ashish's partner has noticed. They don't complain in April (launch energy is legible); they do complain in June (month 2 of the pattern). The plan assumes Ashish will gracefully descend to ≤2hr/wk after Phase 2 gate. In reality: Phase 2 gate is "5 posts shipped without Ashish touching prod." At weekly cadence that's 5 Saturday windows **after** the install, during which every production surprise (LinkedIn OAuth expiry, IonRouter spike, Resend DNS quirk, Ramesh's compose-editor confusion) routes to Ashish's GitHub issues and, because Ramesh is also a weekend writer, to Ashish's Saturday. The ≤2hr/wk ceiling is not a ceiling; it's an average, and it lands on weekends. By month 3, Ashish's partner's tolerance is not the bug — it's the load-bearing constraint the plan is silent about. Ashish starts deflecting ("it's fine, I'll do it Sunday night"). Sunday night bleeds into Saviynt Monday. Principal-Engineer-onboarding slips by 10%; nobody at Saviynt sees Thedi but they see Ashish underperforming the first 90 days review.

**What's new.** Prior passes flagged Principal-Engineer workload (I3-B Reviewer 1) and the ≤2hr/wk budget (Brief 07). None looked at **where those hours will land on the calendar**. All the Phase 1 checklist's block-time is weekend; the A1 install is Saturday; post-launch support is wherever Ramesh writes, which for a full-time IAM engineer is weekends. The plan has no weekday touchpoints that don't depend on Ramesh being a weekend writer too. The partner-cost is both real and invisible to the plan's metrics.

**Mitigation.** Add one line to `docs/ROTATION.md` and to `RECUSAL.md`'s scope clause: *"Ashish's support availability is Tuesday and Thursday evenings (19:30–21:00 PT). GitHub issues filed outside this window get best-effort reply on the next support window. No weekend support except for pre-scheduled install/rotation events."* Put it in writing up front; tell Ramesh before he replies "I agree" so it's part of the agreement, not a later renegotiation. This flips the invisible weekend-default to an explicit weekday-default, which most senior engineers will honor because they understand the pattern.

---

## What would I actually do

If I were Ashish holding this plan tonight, the **one change** I would make before executing is this: **send Ramesh the North Star one-pager (Artifact 2) *this week*, before the §2870 letter is filed, framed as "30-minute coffee conversation, no commitment, no code written yet."** Not the 5-point agreement — just the North Star question.

Here's why this one change cascades: the entire 6-week plan is predicated on Ramesh picking (A), (B), or (C) *and* Option 1-aggressive or Option 2-conservative per B2. If Ramesh's real answer is "honestly, just send me a scout digest email every Friday, I'll write when I write, we don't need a pipeline" — which I put at ~40% likely given his "over time, some paid subs" stated goal — then 200 of the next 200 hours are wasted, and the §2870 letter, the attorney fee, the Saviynt HR disclosure, and the partner-cost of 7 Saturdays are all sunk for nothing. Every other risk in this document evaporates if the plan itself is overbuilt for Ramesh's actual tempo. And the one way to find out is to ask him *before* filing the letter, because the letter's scope is the thing you'd want to change if the answer is "version 0 — just a Friday digest."

The plan's execution order puts the letter first because the letter is a hard dependency for commits. It is not a hard dependency for a 30-minute coffee. Do the coffee first. File the letter in the week *after* Ramesh confirms he wants the thing being carved out.

---

*End of I4-A.*
