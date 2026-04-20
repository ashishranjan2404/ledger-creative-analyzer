# I8-A — Thedi v0: the adversarial minimalist counter-plan

*Iter-8 deliverable. The iter-5 canonical plan proposes ~80–120 Ashish-hours of infrastructure. This brief argues the opposite: that nearly all of it is unnecessary, and that for ~70% of plausible Ramesh-archetypes the right answer is a dramatically cheaper v0 that ships Friday-digest-plus-human-editing and nothing else. Compares v0 to v2 honestly, identifies the narrow slice where v2 actually wins, and picks the literal sentence Ashish says at the coffee.*

*Cites iter-5 canonical, iter-5 exec briefing for Ramesh, iter-6-A 12-month pre-mortem, iter-6-B archetype sensitivity.*

---

## Part 1 — Thedi v0: the minimalist counter-proposal

### Design constraints

- Total Ashish build time ≤ 4 hours, across 1–2 evenings.
- Ongoing Ashish time ≤ 30 minutes per week.
- Zero new infrastructure. Zero new API keys. Zero Butterbase functions written beyond the existing v1 scout. Zero LLM in the drafting path.
- Voice preservation: 100% — Ramesh writes every word.
- Reuses only what already ships: v1 scout (Friday digest email), a Google Doc, Substack.

### The workflow, step by step

| Step | Actor | What happens | Time |
|---|---|---|---|
| 0. (one-off setup) | Ashish | Adjust v1 scout to email Ramesh a Friday 08:00 PT digest with top-3 topics and 1-line rationales. Scout already does this for Ashish; re-target recipient, copy Ashish as bcc for QA. | 1h |
| 0. (one-off setup) | Ashish | Create a single shared Google Drive folder `thedi-drafts/` containing one Google Doc template (title, H2 sections, placeholder hook). Share permissioned edit access with Ramesh. | 30min |
| 0. (one-off setup) | Ashish | Send Ramesh the one-page `v0-README` (see below) — the whole collaboration contract fits on half a page. | 1h |
| 0. (one-off setup) | Ashish | §2870 letter still files (protects prior-art on v1 scout and any future OSS on Ashish's own GitHub). Attorney review not required for v0 because no new code touches Saviynt-adjacent workflows — v0 is just email + Google Doc + Substack. | 30min drafting; reuses iter-2 D3 template |
| **Weekly operation** | | **Total build ≈ 3h; with §2870 reuse ≈ 3.5h** | |
| 1. Friday 08:00 PT | Automated (v1) | Scout digest lands in Ramesh's inbox. Top-3 topics, 1-line rationale each. | 0 min live |
| 2. When Ramesh feels like it | Ramesh | Picks a topic mentally; opens the Google Doc template; writes a draft at his own cadence. 60–180 min per post, spread over whenever. | Ramesh's time, opportunistic |
| 3. When Ramesh flags for review | Ramesh | Drops a comment `@ashish ready for pass` in the Doc. | 10 seconds |
| 4. Within 48 hours of flag | Ashish | Reads the draft, leaves ≤10 in-line comments. No rubric, no rewriter, no LLM. Register: "senior-peer editorial pass," the thing good editors do for free for friends. | 20–30 min |
| 5. When Ramesh feels done | Ramesh | Resolves comments, copies to Substack, hits publish. | 10 min |
| 6. After publish | Ramesh | Drops a link in the Doc title. Ashish sees it in the shared folder; no email, no dashboard. | 10 sec |

### The one-page v0-README (the whole contract)

```
Thedi v0 — the no-infrastructure version

1. Every Friday you get an email with 3 topic ideas. Pick one or ignore it.
2. You write in thedi-drafts/ on Google Docs at your own pace.
3. When you want an editorial pass, tag @ashish. I'll have comments back in 48h.
4. You publish on Substack when you're ready. No LLM touches the text.
5. I don't hold your keys, don't touch your Substack, don't run a pipeline.
6. If you ever want more automation, we revisit. Until then this is the whole thing.
```

### What's on each calendar weekly

**Ramesh:** nothing forced. Writing is opportunistic. The scout digest is a 2-minute read when it arrives. Drafting happens when he wants to write.

**Ashish:** one 30-minute slot, Tuesday evening 19:30–20:00 PT, reserved on the calendar as "Thedi editorial pass." If no draft is flagged that week, the slot collapses. Over a year: ~15–20 hours of editorial time, versus the canonical plan's 80–120-hour build plus 2 hr/week ongoing (~160+ hours year-one total).

### Voice preservation

Trivial. Ramesh writes every word. The canonical plan's entire voice-anchoring architecture — interview-bot archetypes, 3-stage dedup, verbatim-phrasing anchor, 7-dimension rubric, `voice_fidelity` weighted 2.0, `kimi-k2.5` drafter, `gpt-oss-120b` critic, golden-set revalidation, voice-drift detector — solves a problem v0 doesn't have. The 19–65% imitation ceiling from the [Sep 2025 authorship paper (arXiv 2509.14543)](https://arxiv.org/html/2509.14543v1) is irrelevant because nothing is being imitated.

### Capabilities lost vs. v2 (full list)

This is the honest inventory. v0 is cheaper because it does less.

1. **Cadence guarantee.** v2 targets 1 post/week. v0 is limited by Ramesh's solo writing — realistically 1 post / 2–3 weeks for a Principal Engineer with a day job.
2. **Interview-bot Q&A.** No Socratic prompts drawing from six archetypes. If Ramesh needs prompts to write, v0 doesn't give them to him. (Counter: the Friday digest is itself a prompt.)
3. **Silence-fallback voice-note path.** No MacWhisper loop, no on-device transcription. If Ramesh can't type, he doesn't write that week.
4. **Rubric critic / slop ban list.** No automated quality gate. Ashish's editorial pass is the only quality signal. Less scalable but vastly more reliable because Ashish has taste.
5. **Rubric recalibration loop.** Nothing to recalibrate.
6. **`/admin` compose editor.** Google Doc. Already works.
7. **Auto-syndicate to LinkedIn/X/Substack Notes.** Ramesh pastes a link manually if he wants to cross-post. ~2 min/platform. LinkedIn-API OAuth integration was the single-most-likely Phase-2 install failure point per iter-5 Risk 2 — v0 never touches it.
8. **Model-ID assertion, cron heartbeat, key-expiry watcher, budget alert, voice-drift detector, `/admin` silence counter, weekly health email.** All of these exist because v2 runs an autonomous pipeline. v0 has no pipeline. The failure mode "IonRouter silently routes a drafter call to a different model" is structurally impossible because there are no drafter calls.
9. **Scout dedup with pgvector.** v1 scout already works without this. Ramesh can eyeball "isn't this the same as last week?" cheaper than 4 hours of pgvector work.
10. **PII/redaction pass with Saviynt deny-list.** Ramesh writes in a Google Doc; he redacts by not typing the thing. IAM Principal Engineer is already paid to know what he can't publish.
11. **Engagement dashboard aligned to North Star.** Substack's native analytics exist. Beehiiv-level analytics don't ship unless/until there's a sponsor conversation that needs them.
12. **Founding-member tier scaffolding, sponsor-ready audience report generator.** All Phase-3 gated. v0 defers them to "when there's an actual sponsor conversation."
13. **The one-shot installer, rotation runbook, HANDOFF.md, revocation dance.** No infrastructure → nothing to install, rotate, or hand off.
14. **The synthetic end-to-end post button.** No pipeline → nothing to synthetically exercise.
15. **Rubric-safety interlock for write collisions.** No critic → no collisions.

### What v0 retains that v2 has

- The Friday scout digest (already exists in v1).
- The §2870 letter (files for IP-protection even in v0 — it's cheap and future-proofs).
- The 5-point collaboration contract, radically simplified to six lines above.
- The "coffee before code" sequencing.

---

## Part 2 — Honest comparison

| Dimension | v0 (no infra) | v2 (full plan) | Winner |
|---|---|---|---|
| Build time (Ashish hours) | ~4h | ~80–120h | **v0 (30× cheaper)** |
| Ongoing Ashish time | 30 min/week; collapses to 0 if no draft flagged | 2 hr/week nominal; 4+ hr/week under Archetype 2 | **v0** |
| Voice preservation | Perfect (human) | 85–95% engineered (Sep-2025 paper caps at 19–65% without anchoring; anchoring adds margin but no free lunch) | **v0** |
| Post velocity | 1 post / 2–3 weeks realistically; maybe 1 / week in bursts | Up to 1 / week, degraded under Archetypes 1/3/4 per iter-6-B | **v2 (if cadence is the North Star)** |
| Scalability | Hard-capped at Ramesh's solo writing time | Scales to 1/week if and only if Archetype 5 holds | **v2** |
| Fragility | Robust — no moving parts. Google Docs, Gmail, and Substack already work without Ashish. | Fragile — amendment-interaction risks C2/C3/C4 from iter-4, model-alias silent swap (canonical's "single biggest risk"), OAuth rot, cron drift | **v0** |
| §2870 exposure | Minimal — Ashish is doing editorial peer review, nothing more. The "overlap with Saviynt agentic-AI roadmap" attack surface vanishes when there's no code. | Real — requires attorney-reviewed carve-out letter ($400–600), commit freeze, moonlighting disclosure, and sustained compliance vigilance | **v0** |
| Ramesh's cognitive load | Standard writing load. Nothing else. | Writing + Q&A sessions + rubric-delta sign-off + `/admin` logins + key rotation Tue/Thu + health email triage | **v0** |
| Ashish's career narrative | ~0% signal — no pinned repo, no LLM-orchestration craft demo | Modest pinned-repo signal — but per iter-6-A month-12 audit, only clears the bar if paired with a *second* career-narrative OSS | **v2 (marginally; and the "only pinned repo" problem is real)** |
| Ashish's opportunity cost | Negligible — the 30-min Tuesday slot is cheaper than the social cost of declining | 80–120 Saturdays/evenings. Partner-cost (iter-4 Risk 5) unpriced. | **v0** |
| Reversibility | ~100% — nothing to undo. If Ramesh ghosts, the Google Doc just goes quiet. | Partial — public OSS repo is timestamped; §2870 letter is on Saviynt paper; handoff commit is semi-permanent | **v0** |
| Probability of clean 12-month outcome | High — low ambition ≠ no value; floor is "Ramesh shipped 15 posts he's proud of" | ~40–50% under iter-6-A's own honest pre-mortem; the canonical plan "clears the was-it-worth-it bar" only under North Star C with a parallel career-narrative OSS | **v0** |

**Tally: v0 wins 9 of 12 dimensions. v2 wins 2 (scalability, career narrative). v2 and v0 tie on "velocity is a v2 win only if velocity is the goal."**

The v2 wins are the ones Ramesh has to explicitly ask for. The v0 wins are free.

---

## Part 3 — When does v2 actually beat v0?

v2 is the right call under three specific conditions, and effectively only three:

### Condition A — Ramesh picks North Star A (paid subs) AND is confident in ≥ biweekly cadence

Paid subs compound with cadence. At biweekly for 12 months = 26 posts; at "Ramesh's natural solo rate" of every 2–3 weeks = 17–26 posts. On the low end those numbers are close, but the *reliability* of biweekly matters for paid-sub psychology (readers churn when cadence feels unpredictable). Founding-member tier math (round-1 newsletter-economics brief) needs at least 1,000 engaged readers to produce $5–15K/yr at 3–5% conversion; a cadence-reliable pipeline plausibly gets there faster.

**But: this only works if Ramesh is Archetype 2 or 5 (30% combined from iter-6-B). Under Archetype 1/3/4 (70%), even v2 doesn't deliver the cadence.**

### Condition B — Ramesh picks North Star B (sponsor-primary) AND needs Beehiiv-level analytics to close sponsor conversations

Sponsors in the DevOps/SRE vertical ask for opens, clicks, scroll-depth, per-post conversion. Substack's native dashboard is thin for this. v2's Phase-3 engagement dashboard + sponsor-ready audience-report PDF generator becomes load-bearing.

**But: you only need this when a sponsor is at the table. Deferring until month 6 (after a first sponsor inquiry) is dramatically cheaper than building it upfront on spec.**

### Condition C — Ramesh is Archetype 5 (Fully-Engaged Collaborator) AND wants the tool as a collaborator

The 10% archetype. Genuinely wants to co-design rubrics, use the interview-bot as a thinking tool, live-tune the pipeline. For this Ramesh, v2 is the product, not just infrastructure.

### Expected-value math

Using iter-6-B's archetype probabilities:

- P(Archetype 1 reluctant) = 20% → v0 dominates; v2 wastes effort.
- P(Archetype 2 over-engager) = 10% → v2 enables; v0 bottlenecks on his enthusiasm.
- P(Archetype 3 AI-anxious skeptic) = 35% → v0 dominates; v2's model choices become a friction point.
- P(Archetype 4 disengaged) = 25% → v0 dominates; v2 is an empty pipeline.
- P(Archetype 5 fully engaged) = 10% → v2 wins cleanly.

**Weighted: v0 is the dominant strategy in 20+35+25 = 80% of archetype mass. v2 is the dominant strategy in 10+10 = 20%.**

Even if you weight v2's wins heavily (say, 2× because of the career-narrative OSS signal), v0's expected value still beats v2's unless P(Archetype 5) > ~30%, which the iter-6-B analysis says it isn't.

**Break-even condition:** v2 beats v0 in expected value only if Ashish's prior on Archetype 5 exceeds ~30%, OR Ashish values the pinned-repo signal at > 40 hours of his own future time. Both are defensible positions. Neither is the default.

---

## Part 4 — Recommendation

### What Ashish should actually say at the coffee (amendment C1)

**Pick option B: "Let me run v0 for 3 months; we upgrade to v2 only if v0 is blocking."**

The literal sentence:

> *"Here's what I'm actually going to propose. Starting next week, my v1 scout emails you three topics every Friday. You write in Google Docs when you feel like it. You tag me, I give you an editor's pass within 48 hours, you publish on Substack. That's the whole thing — no pipeline, no rubric, no LLM touching your prose. Give it 90 days. If after 90 days the only thing blocking you is 'I wish this were automated,' I'll build the full pipeline then. But I'd rather find out you actually wanted the Friday digest than build you a cathedral you didn't ask for."*

### Defense, paragraph 1: why not "full v2"

The canonical plan's own 12-month pre-mortem (iter-6-A) concludes v2 only clears the was-it-worth-it bar for Ashish *under North Star C AND with a parallel career-narrative OSS project AND if partner-cost stays priced.* That's a three-way conjunction. iter-6-B gives ~70% probability that Ramesh is some blend of AI-Anxious Skeptic + Reluctant Subscriber-Chaser — archetypes under which v2's pipeline runs half-empty, posts ship at half the target cadence, and Ashish spends 80+ Saturdays building infrastructure that Ramesh rubber-stamps or ignores. The exec briefing to Ramesh already acknowledges ~40% probability his real answer is "just send me a Friday digest." Building v2 first and finding out at month 3 is the most expensive possible discovery path. Coffee is cheap; the attorney fee, the installer dry-runs, seven weekend blocks, the OAuth integration debugging, the rubric calibration loop, the handoff dance — all of that is sunk if the answer was "actually, just the digest."

### Defense, paragraph 2: why not "v0 forever"

Option C ("v0 forever; v2 would be overkill") is too absolute. There is a real 10–30% probability Ramesh is Archetype 2 or 5, in which case v0 genuinely bottlenecks him — he wants to ship weekly, he wants the rubric, he wants to tune prompts with Ashish. Committing to "v0 forever" forecloses that option on day one and would leave signal on the table. The 3-month v0 window is itself the diagnostic: if at month 3 Ramesh has shipped 4+ posts, is asking for more automation, and has named a concrete blocker ("I'd write more if I had prompts"), *that's* when v2 gets built — after the archetype is observed, not assumed. This is also Reviewer 1's "3–5 manual posts first" recommendation from iter-3-B, promoted to the primary strategy rather than a Phase 2a insertion. The canonical plan's own iter-6-B cross-archetype amendment ("invert the build order: Ramesh writes 3–5 manual posts before any pipeline goes live") is, when taken seriously, indistinguishable from v0. v0 is not a demotion of v2; it is the honest operationalization of what iter-6-B already said was the single most robust amendment across all five archetypes.

### Caveat

If at the coffee Ramesh volunteers *"no, I want the full pipeline — I've been thinking about the interview-bot format and I want to co-design the rubric,"* that's a live Archetype-5 signal and v2 is the right call. But Ashish should not *prompt* for that answer; the only honest way to get it is to offer v0 first and see if Ramesh pushes back.

---

## Summary table

| Question | Answer |
|---|---|
| v0 build time | ≤4h over 1–2 evenings |
| v0 weekly Ashish time | ≤30 min, often 0 |
| v0 weekly Ramesh time | standard writing, no extra |
| Dimensions v0 wins | 9 of 12 |
| Dimensions v2 wins | 2 of 12 (scalability, career-narrative) |
| Archetype mass where v0 dominates | 80% |
| Archetype mass where v2 dominates | 20% |
| Break-even condition for v2 | P(Archetype 5) > 30%, which iter-6-B says it isn't |
| The unambiguous v2-wins case | Ramesh volunteers at coffee that he wants to co-design the rubric |
| Ashish's literal sentence | "Give v0 90 days. If you hit a blocker I'll build v2 then." |

---

*End of I8-A. v0 is not a strawman; it is the honest operationalization of iter-6-B's cross-archetype amendment.*
