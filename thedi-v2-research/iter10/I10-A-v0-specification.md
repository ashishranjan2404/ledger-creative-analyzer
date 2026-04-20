# I10-A — Thedi v0: Full Specification

*Iter-10 deliverable. DECISION.md recommends v0-first, v2-as-conditional-upgrade. This document gives v0 the rigor v2 received: a runnable runbook, a paper-artifact set sized to what v0 actually is, an upgrade-trigger spec with falsifiable conditions, an explicit capability-gap list, and an honest 6/12-month ceiling. Cites iter-8 I8-A, iter-2 D3, iter-1 brief 04, iter-6-A pre-mortem, iter-6-B archetypes, and DECISION.md.*

*Date drafted: 2026-04-19. Register: dry executive. Every claim cited or marked `[assumption]`.*

---

## Part 1 — v0 Runbook

### 1.1 Weekly rhythm (week-over-week, steady state)

| Day/Time | Actor | Step | Time budget |
|---|---|---|---|
| Mon 09:00 PT | Automated (v1 scout) | Daily scout scans arXiv + HN, scores against Ramesh's topic rubric. No human action. | 0 min (already deployed) |
| Fri 08:00 PT | Automated (v1 scout) | Digest email lands in Ramesh's inbox. Format: 3 picks, one-line rationale each, source links. Bcc Ashish for QA. | 0 min live; 2-min read |
| Fri evening – Sun | Ramesh | Reads digest, picks ≤1 topic (often 0). Replies "going with #2" to Ashish by Sat night, or silently passes. | 5 min reply |
| Sat or Sun | Ramesh | Opens the shared Google Doc template at `thedi-drafts/YYYY-MM-DD-slug`, fills it in, writes at his normal cadence. | 2–4 h spread across weekend [iter-8 I8-A §Design constraints: 60–180 min typical] |
| Sun 21:00 PT or earlier | Ramesh | Drops comment `@ashish ready for pass` in the Doc. | 10 sec |
| Mon/Tue 19:30–20:00 PT | Ashish | Reads the draft end-to-end once. Leaves 5–10 in-line comments. Closes with one top-level comment ("pass complete, no blockers" or "one structural note — see [anchor]"). | 30 min |
| Tue/Wed | Ramesh | Resolves or rejects comments, revises where he wants, copies to Substack, publishes when he wants. Ashish does not gate publish. | 20–40 min |
| Post-publish | Ramesh | Pastes Substack URL at top of the Doc title line. | 10 sec |

**Weekly total, steady state:** Ramesh 3–5 h (his existing writing cadence [assumption — iter-6-B Archetypes 1–3 priors]); Ashish 30 min; collapses to 0 min for Ashish on weeks Ramesh doesn't flag.

### 1.2 One-off setup (Ashish, ≤4 h total)

Per iter-8 I8-A §Design constraints — unchanged:

1. Re-target v1 scout Friday-digest recipient to Ramesh; keep Ashish as bcc for QA (1 h — function already exists at `/Users/mei/ledger-creative-analyzer/thedi/functions/`; only prompt + recipient changes).
2. Prompt tweak: the digest should read "plain top 3 picks" — title, one-sentence rationale, source link. No scoring, no "confidence %", no emojis, no "why this matters for Ramesh" preamble. `[assumption — iter-8 I8-A didn't specify this format detail]`
3. Create shared Google Drive folder `thedi-drafts/` with a single Doc template (see §1.3). Share edit access with Ramesh's personal email (not Saviynt). (30 min)
4. Send Ramesh the v0-README + 5-point agreement (§Part 2). Wait for reply. (30 min drafting; reply async)

No Butterbase functions written. No new API keys. No `/admin` panel. No deployed infrastructure beyond what v1 scout already runs.

### 1.3 Google Doc template — `thedi-drafts/YYYY-MM-DD-slug` structure

```
[Post Title — will become Substack title]
Status: draft | ready-for-pass | revising | published
Published URL: (fill in after publish)
Target length: (pick one) 600–900 / 900–1500 / 1500–2500 words
Source links from Friday digest: (paste the 1–3 links)

---

## Hook (1–3 sentences)
What grabs a senior IC reader in the first paragraph?

## Outline (3–6 bullets)
- Main claim
- Evidence / example 1
- Evidence / example 2
- Counter-consideration or caveat
- Takeaway

## Draft
(full prose below — Ramesh writes here)

---
## Reviewer's block (Ashish uses inline comments above; summary here)
- Top-level pass note: (filled in by Ashish)
```

The template is deliberately boring. No rubric fields, no voice-score, no dimensions. Ramesh fills the top metadata in 60 seconds and writes prose. `[assumption — Google Docs is Ramesh's existing writing surface; confirm at coffee]`

### 1.4 Ashish's review template — what he does and does NOT do

**Does leave comments on:**
- **Structural**: "this paragraph is the real hook — consider swapping with the intro." "The piece has three ideas; the third might be its own post."
- **Voice / register**: "this sentence sounds like LinkedIn. Earlier graf is your voice — closer to that?"
- **Clarity**: "unclear what 'it' refers to here." "First-time reader won't know what SCIM is; two-word gloss?"
- **Factual**: "check this number — I recall it being closer to X." "Is this Saviynt-specific or generally true?"
- **Evidence gap**: "a single example would make this land."

**Does NOT leave:**
- Prescriptive rewrites ("change X to Y"). Exception: if Ramesh explicitly asks.
- Line-level copy edits (typos, comma splices). Ramesh has his own editor or catches them himself.
- Rubric-style scored feedback ("voice: 6/10"). v0 has no rubric.
- Contentious factual corrections via comment thread — if in doubt, flag with "I'd double-check this" and let Ramesh decide.
- Anything that could be read as "I would have written this differently." That's a rewrite, and v0's central commitment is that Ashish is not a drafter (§Part 2, Point 1).

Target density: 5–10 comments per post, ≤30 min total, one pass. If a draft needs more than that, Ashish leaves the top 5 and a single meta-comment ("this one has more in it than fits a 30-min pass — happy to chat if you want, but not required"). The 30-min ceiling is load-bearing — see §Part 5.

### 1.5 Calendar recurrence

**Ashish's calendar:**
- Recurring event "Thedi editorial pass" — Tue 19:30–20:00 PT, weekly.
- Event description: "If no `@ashish ready for pass` in `thedi-drafts/`, cancel and reclaim the 30 min."
- No paging, no Slack notification. Ashish checks the shared folder at the start of the slot.

**Ramesh's calendar:**
- Nothing forced. Writing is opportunistic.
- Optional: a recurring "Thedi writing" block Sat/Sun 10:00–12:00 PT, but Ashish does not set this up or suggest it — it's Ramesh's call. `[assumption — iter-6-B Archetype 1/3 Rameshes don't want imposed cadence]`

### 1.6 Time budgets summary

| Party | Per week steady state | Per quarter | Per year |
|---|---|---|---|
| Ramesh | 3–5 h (his existing writing cadence) | 40–60 h | 150–250 h |
| Ashish | 30 min (or 0 if no flag) | 4–6 h | 15–20 h |

Per iter-8 I8-A §What's on each calendar: "~15–20 hours of editorial time [year one], versus the canonical plan's 80–120-hour build plus 2 hr/week ongoing (~160+ hours year-one total)." v0 is ~8–10× cheaper for Ashish over a year.

---

## Part 2 — v0 Paper Artifacts

### 2.1 The v0 5-point agreement

Distilled from iter-2 D3 Artifact 2, stripped of self-hosting, OSS-license, credential-rotation, and revenue-threshold clauses. Sent Ashish-personal-email → Ramesh-personal-email. "Yes" reply sufficient.

```
Hey Ramesh,

Five things before the Friday digest starts landing in your inbox. Small
list because v0 is a small arrangement. An emailed "yes" is all I need.

1. All writing is yours. No ghostwriting, no LLM in the drafting path, no
   AI-authored paragraphs. The words in the Substack post are yours.

2. I review in-line only, not as drafter. I leave 5–10 comments per draft,
   mostly structural / voice / clarity / factual. I don't rewrite, and
   I don't suggest paragraphs. If I ever start to — call it out.

3. No Saviynt-channel contact about this. Not Saviynt Slack, not Saviynt
   email, not hallway at the office, not 1:1s. Personal email or Google
   Doc comments only. This is the rule I care about most — it's what
   keeps v0 from accidentally becoming unpaid work-in-the-reporting-chain.

4. Pauses automatically if you end up in my reporting chain. Direct
   manager, skip-level, or any performance/comp panel evaluating me —
   I stop reviewing, you keep writing, we both call HR. Same recusal
   logic as v2, just shorter because there's no repo to archive.

5. If v0 starts to feel like real work for me (>1 h/week sustained for
   3+ weeks), we revisit. Either I'm doing something v0 doesn't cover
   and we should name it, or v0 has quietly become v2 without the
   agreement update that should precede that.

A one-word "yes" is fine.

- Ashish
```

**Differences from iter-2 D3 Artifact 2 (the v2 agreement):**

| D3 clause (v2) | v0 handling |
|---|---|
| Point 1: OSS / MIT / personal GitHub repo | Removed — no repo exists |
| Point 2: Ramesh runs own Butterbase / own keys | Removed — no Butterbase app, no keys |
| Point 3: Support via GitHub issues only | Replaced with "no Saviynt-channel contact" (same goal, different medium) |
| Point 4: Recusal if reporting-chain changes | Retained, simplified (no repo to archive) |
| Point 5: Re-paper at $500/mo revenue | Replaced with "revisit if >1 h/week sustained" (effort-based, not revenue-based — v0 has no revenue path Ashish touches) |

### 2.2 Why no §2870 letter for v0

v0 involves no invention being created by Ashish. Specifically:

- **No code written.** iter-2 D3 §3 describes Thedi's scope as "TypeScript, Butterbase serverless platform, … IonRouter." v0 writes zero new code; the scout already exists and predates any Ramesh involvement.
- **No IP in editorial comments.** Inline comments on someone else's prose ("consider swapping these paragraphs") do not constitute invention under California Labor Code §2870. There's no patentable artifact, no copyrightable work-for-hire, no trade-secret flow. Ashish is operating as a peer reviewer — a role broadly analogous to a friend editing a friend's cover letter.
- **No Saviynt-adjacent workflow touched.** The scout reads public arXiv + HN, emails a digest, and stops. No IAM, IGA, PAM, or identity data anywhere in the flow. Same argument as iter-2 D3 §4(c), but the surface area is even smaller.
- **Prior-art on the scout is already timestamped.** The v1 scout commits exist on Ashish's personal GitHub predating any Ramesh-as-user relationship [assumption — verify commit dates predate any coffee conversation]. If v0 ever upgrades to v2, the §2870 letter gets filed *then*, before any new code lands. v0 itself doesn't move the legal exposure needle.

**Where HR disclosure may still make sense:** Saviynt's moonlighting / outside-activities policy — depending on its specific language — may require disclosing any regular outside engagement with a coworker, regardless of whether it generates IP. `[depends on Saviynt's actual policy — verify]` If the policy triggers, a lightweight HR-facing disclosure ("I leave editorial comments on a colleague's personal writing, ≤30 min/week, no money, no Saviynt resources") is appropriate. This is one paragraph, not an attorney-reviewed letter.

**What the legal-facing v0 artifact set reduces to:**
1. The 5-point email agreement (§2.1) — sent, reply stored.
2. Optional: a one-paragraph HR moonlighting disclosure if policy requires.
3. Nothing else. No repo-root `RECUSAL.md`, no `RECUSAL_LOG.md`, no attorney review.

This is a ~$0 / ~1 h artifact set vs. iter-2 D3's ~$400–600 / ~4 h set.

---

## Part 3 — The Upgrade-Trigger Spec

v0 graduates to v2 only on explicit, falsifiable signals. The defaults are aggressively biased toward *not* upgrading — per DECISION.md §3, "the probability he says something at coffee that makes you *feel* like he's [Archetype 5] is ~50%; the probability he actually is ~10%."

### 3.1 Primary trigger — Ramesh names a feature by pattern

**Fires when:** Ramesh, unprompted, asks Ashish to build a specific feature (call it X) where X requires automation Ashish isn't already doing manually. Concrete examples of what would qualify:

- "Can the Friday digest also include last week's post's open rate from Substack?" (pattern: recurring analytics pull — v2's engagement dashboard)
- "I keep getting stuck starting drafts. Can we do the Q&A-bot thing you described?" (pattern: interview-bot — v2's voice-anchor architecture)
- "Can you auto-cross-post to LinkedIn when I publish?" (pattern: syndication — v2's Phase 3)

**Does NOT fire when:** Ramesh asks a one-off question answerable by Ashish doing the thing manually once. Examples:

- "Can you grab the open rate for last week's post?" → Ashish pastes it into the Doc, costs 2 min, no upgrade.
- "Can you check if last week's topic was covered on HN?" → Ashish checks, costs 3 min, no upgrade.

**The pattern/one-off distinction:** if Ashish would do the thing manually a second time and not mind, it's a one-off; do it. If Ramesh would clearly want it a *third* time and Ashish would start resenting it, that's a pattern; that's an upgrade trigger.

**Threshold:** one clean pattern-hit, *or* two soft pattern-hits in a 4-week window, triggers the 90-minute upgrade conversation (§3.4). Not an automatic upgrade — a conversation.

### 3.2 Secondary trigger — cadence stall despite v0 working

**Fires when:** Ramesh's publishing cadence stalls for **>6 consecutive weeks** despite no structural obstacle in v0 (i.e., he's receiving the digest, the Doc works, Ashish is responding in <48 h on the rare flagged drafts). Stall = 0 posts published in the window.

**What the stall diagnoses:** if v0 is mechanically fine and Ramesh still isn't publishing, the bottleneck is likely "starting" (blank-page problem), which is structurally what the v2 interview-bot addresses — Socratic Q&A against verbatim-phrasing archetypes, per iter-5 canonical §voice-anchoring. That's the v2 feature with the clearest v0-resistant value.

**What the stall does NOT diagnose:** Ramesh being busy with other things, Saviynt crunch, personal life, or "I don't want to write right now." These are archetype-1/4 signals (reluctant or disengaged per iter-6-B) and an upgrade does not fix them — v2's empty pipeline is a more expensive version of the same problem.

**Threshold:** the 6-week stall, plus Ramesh saying aloud some variant of "I wanted to write but didn't know where to start" in the coffee following the stall. Both conditions. One without the other is not a trigger.

### 3.3 Negative triggers — do NOT upgrade

Explicit list of things that feel like triggers but aren't:

- **Ashish's own boredom with v0.** A 30-min/week editorial pass is load-bearing precisely because it's unglamorous. Ashish wanting to build is not evidence Ramesh wants v2. Per DECISION.md §3: "Most of the intellectual product of this project is a v2 artifact. Choosing B means the research's recommendation is 'don't build the thing you spent 9 iterations designing.'"
- **"It would be cool to automate this."** Coolness is not a trigger. Utility is. If Ashish can articulate a concrete hour-count saved per week, OK; if the argument is aesthetic, no.
- **Post-coffee warm signals that fade by week 3.** Ramesh saying "yeah that sounds great" at an in-person coffee is a ~50%-false-positive signal per DECISION.md §3. Only count enthusiasm that persists to week 3+ and shows up as an unprompted ask.
- **Ashish's career narrative anxiety.** Per iter-6-A the v2 pinned-repo signal only clears the bar paired with a second OSS project. v0 doesn't foreclose building that second project; v2-now does foreclose, because the time goes into v2 instead. If career narrative is the motivation, the right move is the other project, not v2.
- **A single Archetype-5-sounding sentence at month 2.** Wait for the ask to repeat. Archetype-5 Ramesh has pattern-consistency; polite-engaged Ramesh has one great coffee and no follow-up.

### 3.4 The upgrade decision itself — the 90-min conversation

At the end of the 3-month v0 window (T+90 days from coffee), Ashish and Ramesh have one scheduled 90-minute coffee. Agenda:

1. **(20 min)** What got published. Count the posts. Read the openings aloud. Does Ramesh feel good about them? Does Ashish?
2. **(20 min)** Where did v0 get in the way? Specific moments, not vibes. "I wanted X and v0 didn't have it" — name X.
3. **(20 min)** Is any named X a pattern or a one-off? (See §3.1 decision rule.) Write them down.
4. **(15 min)** Given those patterns, is v2 the answer, or is v0-plus-one-small-thing the answer? Default to the smaller answer.
5. **(15 min)** Decide. Three outcomes: continue v0; build v0-plus-named-addition; commit to v2. If v2, the next step is iter-2 D3 Artifact 1 (the §2870 letter) — that's where the legal paperwork begins.

**What this is not:** another 9-iteration research project. DECISION.md §5: "Next time: run the adversarial minimalist counter-plan in iteration 2, not iteration 8." v0 *is* that counter-plan running in production. The 90-minute conversation evaluates evidence, not hypotheticals. If the answer at 90 minutes is "I don't know," the default is another 90 days of v0; the null hypothesis is not upgrade.

---

## Part 4 — What v0 Does NOT Do (full capability-gap list)

Per iter-8 I8-A §Capabilities lost vs. v2, restated as an up-front disclosure to Ramesh so expectations match reality:

1. **No topic dedup beyond v1 scout's existing logic.** If last week's digest and this week's digest both surface "agentic RAG failure modes," the scout won't catch it; Ramesh eyeballs. v2's pgvector-backed 3-stage dedup (iter-5 canonical) does not exist.
2. **No voice calibration.** No interview-bot, no archetype detection, no verbatim-phrasing anchor, no `voice_fidelity` scoring. v0's voice preservation mechanism is "Ramesh writes every word." Ceiling is 100% human; no scaffolding to fall back on if Ramesh wants a draft help.
3. **No scheduled publishing.** Ramesh hits publish on Substack himself, when he wants. No cron, no publish queue, no time-zone-aware send.
4. **No automated cross-posting.** LinkedIn, X, Substack Notes — Ramesh pastes links manually if he wants them, ~2 min/platform. No OAuth integration. Per iter-5 Risk 2, this was the single-most-likely Phase-2 install failure point in v2; v0 never touches it.
5. **No analytics beyond Substack native.** Substack's dashboard (opens, clicks, sub counts) is what Ramesh sees. No beehiiv-style engagement depth, no scroll-time, no per-post funnel, no sponsor-ready audience report generator. Per iter-1 brief 04 §Q3, sponsor conversations are a Year-2+ concern anyway.
6. **No rubric, no critic, no rewriter.** No 7-dimension scoring, no slop-ban list, no `gpt-oss-120b` critic, no `kimi-k2.5` drafter, no two-round rewrite loop. All prose is Ramesh's first-and-final draft with Ashish's line-level comments as the only quality signal.
7. **No PII/redaction pass.** Ramesh self-redacts. As iter-8 I8-A notes: "IAM Principal Engineer is already paid to know what he can't publish."
8. **No silence-fallback voice-note path.** If Ramesh can't type, he doesn't write that week. No MacWhisper loop, no on-device transcription.
9. **No `/admin` compose editor.** Google Doc.
10. **No model-ID assertion, cron heartbeat, key-expiry watcher, budget alert, voice-drift detector, silence counter, weekly health email.** v0 has no autonomous pipeline, so the failure modes these guard against are structurally impossible.
11. **No one-shot installer, rotation runbook, HANDOFF.md.** Nothing to install.
12. **No founding-member tier scaffolding.** Deferred to "when there's an actual sponsor/monetization conversation," per iter-1 brief 04 §Q3.5.

v0 has the Friday digest, a Google Doc template, and Ashish's 30-min weekly pass. That is the entire product.

---

## Part 5 — v0's Honest Ceiling

### 5.1 6-month outcome (best case)

Tied to iter-1 brief 04 subscriber curves (median percentile, technical niche, no pre-existing audience):

- **Posts published**: 8–12 (roughly 1 every 2–3 weeks, Ramesh's realistic solo cadence per iter-8 I8-A §Capabilities). v2's 1/week target only holds under Archetype 2/5 per iter-6-B.
- **Free subs**: 500–1,500 `[iter-1 brief 04 Q2, 50th-percentile technical-niche curve at 6mo: 800–1,800]`
- **Paid conversions**: not a v0 goal; effectively $0 in year 1 per iter-1 brief 04 §Q3.
- **Ashish time sunk**: ~8–12 h cumulative (4h setup + ~30 min × ~12 active weeks).
- **Ramesh time sunk**: 30–60 h writing (3–5 h/week × ~10–12 active weeks).
- **Voice authenticity**: 100% Ramesh. No imitation ceiling concerns — v2's 19–65% engineered-imitation ceiling (Sep-2025 arXiv 2509.14543, per iter-8 I8-A §Voice preservation) is irrelevant because nothing is being imitated.

### 5.2 12-month outcome (best case)

- **Posts published**: 15–25 (roughly matching iter-8 I8-A §Part 4 Defense-2 floor: "Ramesh shipped 15 posts he's proud of").
- **Free subs**: 1,500–4,500 `[iter-1 brief 04 Q2, 50th-percentile: 2,000–4,500; "Most likely for Ramesh" at 3,000–6,000 conditional on weekly + LinkedIn cross-post, which v0 does not guarantee]`.
- **Sponsor-viability threshold**: iter-1 brief 04 §Q3.1 gives 2,000+ engaged opens/week as the sponsor-conversation threshold. v0 plausibly hits this at month 10–12 for median-percentile Ramesh; not before.
- **Revenue**: $0 from v0-as-such. Any sponsorship happens through Ramesh's own outreach, unassisted by v0 tooling. Per iter-1 brief 04, advisory/consulting funnel is the more likely real monetization — and that runs through Ramesh's Saviynt reputation, not through any Thedi capability.
- **Ashish time sunk**: ~15–20 h cumulative.
- **Ramesh time sunk**: 60–120 h writing.

### 5.3 Comparison to v2's 12-month ceiling

Per iter-6-A pre-mortem, v2 at 12 months has ~40–50% probability of clearing the was-it-worth-it bar, conditional on Archetype 5 + parallel career-narrative OSS + North Star C. Under those conditions, v2 ships 30–45 posts vs. v0's 15–25. v2's voice-authenticity is 19–65% engineered ceiling + anchoring margin (per Sep-2025 paper) vs. v0's 100% human.

**The trade in one line:** v0 ships roughly half as many posts as v2-under-ideal-conditions, at roughly 10× less Ashish time, at roughly 2× higher voice authenticity, and with substantially lower tail risk (no fragile pipeline, no legal exposure, no handoff dance). At the 80% archetype mass where v2 runs empty per iter-6-B, v0 strictly dominates.

### 5.4 Hidden costs the "simple" framing obscures

Three costs v0 has that the "no infrastructure" framing can downplay:

1. **Ashish's 30-min slot is load-bearing and non-fungible.** It can't be batched. A 30-min pass compressed into a 10-min skim produces different-quality comments; Ramesh will notice. If Ashish is under Saviynt crunch and wants to defer a week, the Tuesday slot is the wrong thing to drop — better to drop it cleanly ("I'm slammed this week, comments Friday instead") than deliver a rushed pass. v2's automated pipeline has no analogue to this failure mode, because it has no Ashish-taste dependency; that's v2's point. v0's value rides entirely on the reliability of that 30 min.
2. **Ramesh's writing cadence is exposed.** v2 hides writing difficulty behind the interview-bot scaffolding — the Q&A produces raw material that the pipeline shapes into a draft. v0 has no such scaffolding; if Ramesh has a bad writing month, v0 produces 0 posts that month, visibly. The "v0 is robust" claim in iter-8 I8-A is true for the mechanics (Google Docs don't break); it is not true for the output. The failure mode v0 is robust to is *pipeline breakage*; the failure mode v0 is exposed to is *Ramesh doesn't feel like writing*, which is the more likely failure mode under the iter-6-B archetype priors anyway — so the robustness story is real but narrower than it sounds.
3. **The "Ashish isn't building anything" framing is load-bearing for legal but not for social.** The §2870 argument in §2.2 rests on "no invention." Socially, Ashish is still spending 30 min/week on a colleague's side project, reading drafts, shaping output with comments. That's a relationship with social weight, even if it has zero IP weight. iter-4 Risk 5's "partner-cost" concern is lighter under v0 than v2 but not zero. The 5-point agreement's Point 5 ("revisit if >1 h/week sustained") exists specifically to catch the slow drift from "30 min pass" to "I'm thinking about his post on Saturday afternoon" — which is the drift that turns v0 into unacknowledged v2.

---

*End of I10-A. v0's specification is smaller than v2's by design; the fact that this document is ~3 pages rather than the canonical plan's ~30 is not an oversight but the thesis.*
