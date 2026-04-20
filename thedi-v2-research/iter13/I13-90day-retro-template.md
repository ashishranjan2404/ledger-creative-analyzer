# I13 — Thedi v0 90-Day Retro Template

*Iter-13 deliverable. The 90-day retrospective that DECISION.md assumes but never specifies. Operationalizes the v0-first bet: light tracking, a calendar-blocked conversation at T+90, a four-way decision matrix, explicit biases, and a solo pre-mortem worksheet. Cites DECISION.md, I10-A (v0 spec), I10-C (branches + upgrade triggers), I6-A (month-3 premortem), I6-B (archetype month-3 projections).*

*Date drafted: 2026-04-19. Target retro date: **2026-07-18** (90 days post-coffee, assuming coffee week of 2026-04-20). Calendar-block both parties now.*

---

## Part 1 — The Tracking Sheet

One Google Sheet, three tabs. Owner: Ashish. Shared read-only with Ramesh from day 1 (transparency is a feature — he should see what he's being measured on). Total Ashish time: ~5 min/week + ~15 min/month + ad-hoc.

**Design principle.** Every column earns its place by answering a question the month-3 decision will need to answer. No vanity metrics. Numeric fields should be one-glance-fillable; notes fields capped at one line.

### Tab 1 — Weekly (filled every Sunday night, 5 min)

| Column | Type | How to fill | What question it answers |
|---|---|---|---|
| `week_of` | date (Monday) | Auto-increment | Index |
| `digest_sent` | bool | Did the Friday scout digest actually land in Ramesh's inbox? | Did v0's only piece of infrastructure work this week? |
| `post_shipped` | bool | Did Ramesh publish to Substack this week? | The headline metric |
| `post_url` | url | Paste the Substack URL if shipped | Audit trail |
| `ashish_minutes` | int | Total minutes Ashish spent on Thedi (review pass + any ad-hoc) | The budget check. Playbook 7 warns this self-reports 2–3× low; see Part 2 |
| `ramesh_signal` | enum | `responded`, `wrote`, `published`, `silent`, `declined` | Engagement pulse (I10-C Signal 1 pattern) |
| `quick_fix_ask` | bool + one-line | Did Ramesh ask for any automation/feature? If yes, one-line description | Upgrade-trigger §3.1 (I10-A) — "third resented task" candidates |
| `notes` | one line | Anything worth a sentence. Default: blank | Context for retro |

**Conventions.**
- Silent week with no digest issue is `silent`, not `declined`. `declined` = explicit "pass" or "skipping this one."
- `ashish_minutes` includes time *thinking about* Thedi during non-Thedi hours if it was material. If Ashish finds himself mentally drafting comments Saturday morning, that's 15 min, not 0 min.
- `quick_fix_ask` is filled even for one-offs. Distinguishing pattern from one-off happens at retro, not in the moment.

### Tab 2 — Monthly (filled last Sunday of each month, 15 min)

| Column | Type | How to fill | What question it answers |
|---|---|---|---|
| `month` | YYYY-MM | Auto | Index |
| `substack_subs_free` | int | Substack dashboard | Does the audience curve track iter-1 brief 04 bands? |
| `substack_subs_paid` | int | Substack dashboard (expect 0 in v0) | Any revenue signal? |
| `avg_open_rate` | % | Last 30 days, Substack native | Engaged audience proxy |
| `total_posts_ytd` | int | Count from Tab 1 | Cadence vs. I10-A §5 prediction (8–12 at 6mo, scale to 4–6 at 3mo) |
| `ashish_hours_ytd` | float | Sum of Tab 1's `ashish_minutes` ÷ 60 | Budget tracking |
| `channel_crossover` | bool + line | Did any Thedi conversation happen outside personal email / Google Doc comments? | 5-point agreement Point 3 health |
| `partner_cost_ping` | bool + line | Did Ashish's partner raise Thedi time? (Even in passing.) | Iter-4 Risk 5 watch |
| `notes` | paragraph | One short paragraph of "what happened this month" | Raw material for retro's Part 2 |

### Tab 3 — Events (filled as things happen, <3 min per entry)

| Column | Type | How to fill |
|---|---|---|
| `date` | date | When it happened |
| `type` | enum | `rubric_complaint`, `voice_complaint`, `saviynt_crossover`, `partner_concern`, `ramesh_unprompted_raise`, `feature_ask`, `drift_worry`, `other` |
| `what_happened` | 2–3 lines | Factual, not editorialized |
| `my_read` | 1 line | Ashish's in-the-moment interpretation |
| `triggered_response` | 1 line | What Ashish did or said |

**Why this tab exists.** Weekly/monthly tabs capture cadence. The retro needs signal-level events — one Ramesh unprompted "I was thinking about that piece you commented on…" in month 2 is worth more than any open-rate number. These events are mostly forgotten by day 90 if not logged in the moment.

**Time budget total.** ~50 min/month Ashish-side. Anything heavier defeats v0's point; anything lighter makes the retro vibes-only.

---

## Part 2 — The Month-3 Meeting Agenda

**Format.** 45 minutes, in-person coffee preferred. Calendar-blocked from day 0. Agenda shared 48 hours before (not earlier — Ramesh shouldn't pre-optimize his answers).

**Ashish's prep.** Part 5 worksheet done the night before. Tracking sheet open on laptop. Print of this agenda in hand.

### Block 1 — The numbers (10 min)

**Goal.** Establish shared ground truth on what actually happened. No interpretation yet.

- **Open with:** *"Let me just read back the numbers before we talk about them. No reactions yet — just want to make sure we're looking at the same data."*
- Read aloud from Tab 2 (month 1, 2, 3) and Tab 1 summary (total posts, total Ashish hours, Ramesh's signal distribution).
- **The Playbook-7 adjustment.** Ashish says aloud: *"Self-report on my hours is typically 2–3× undercount. My logged hours are X; the honest range is X to 3X. I'll treat 2X as the working number."* This is non-negotiable — he says it even if it feels silly. It structurally prevents the later "v0 is cheap so let's keep going" argument from resting on a number that's half-fictional.
- **Prompt for Ramesh:** *"Does any of that land differently than you expected?"* Log his answer verbatim in Tab 3 as `type=drift_worry` or similar if it surfaces a mismatch.
- **Compare against iter-1 brief 04 percentile bands:** for 3-month free-sub count at technical-niche median, the band is roughly 200–500. 25th-percentile is 80–200. 10th-percentile is <80. State which band Ramesh lands in, aloud, without softening.

**What this block is NOT.** Not a discussion. Not "what should we do." Just reading.

### Block 2 — The signals (15 min)

**Goal.** Did any v0-to-v2 upgrade trigger from I10-A §3 fire? Run the "third resented task" test honestly.

Discussion prompts, in order:

1. *"Ramesh — in the last 90 days, did you ever find yourself wanting a thing v0 didn't do? Anything you wished you could click or ask for?"* Wait for an answer. Don't fill silence.
2. *"If you said yes just now — can you name the specific thing? Like, if I were to build it tomorrow, what am I building?"* (I10-C Signal 2 test: specificity. Vague = not a trigger. Named feature = candidate trigger.)
3. *"How many times in 90 days did you want it? Once? Twice? Every week?"* (The pattern/one-off distinction from I10-A §3.1.)
4. *"Ashish — was there anything I did this quarter that felt like 'ugh, again' on the third time? Any task where I found myself doing it manually and wishing I'd automated it two weeks ago?"* (The third-resented-task test applied to Ashish's side. If yes, that's an upgrade trigger too — but one Ashish might be biased to overstate. Cross-reference Tab 1 `quick_fix_ask` entries.)
5. *"Look at Tab 3 together. Walk through every event entry. For each one — was this a pattern or a one-off?"* (Log the answer in-line; mark events `pattern` vs `one-off`.)
6. *"Did anything leak outside personal email / Google Doc comments in 90 days?"* (Tab 2 `channel_crossover`. If yes, that's a structural issue independent of the A/B/C/D decision.)
7. *"Ramesh — if I'd never existed for this project, would you have shipped posts anyway?"* (Diagnostic for Archetype 1 vs. 3 vs. 5. An Archetype-1 Ramesh says no but is polite about it. An Archetype-5 Ramesh says "probably fewer" with specifics.)

### Block 3 — The open questions (10 min)

**Goal.** Surface what's shifted that the tracking sheet can't see.

Prompts:

1. *"What's blocking you right now, if anything? Not '90 days ago' — right now."*
2. *"What surprised you? Good or bad."*
3. *"Has anything shifted that would change the North Star you picked at the first coffee?"* (This is the big one. If Ramesh's answer is "actually I care about advisory more than sponsor now," that's a material data point for Outcome B/C.)
4. *"If we were starting this conversation today, with the 90-day data in hand, would you still pick v0? Would you pick v2? Would you pick not-doing-it?"* (Forces the counterfactual.)
5. *"Is there anything you've been sitting on that you wanted to say but haven't? About the arrangement, not about the writing."*

**Listen for:** named specific blockers (per I10-C Signal 4), unprompted pipeline references (Signal 3), mentions of wanting to stop that get walked back ("no, it's fine" after a pause — that's not fine, that's politeness cascade; see Part 4).

### Block 4 — The decision (10 min)

**Goal.** One of four outcomes, named explicitly, with the next step committed before leaving the table.

- **Open with:** *"Okay, I think one of four things is true right now. Let me name all four, and then we pick."* Read Part 3 A/B/C/D aloud from printed card.
- **Then ask:** *"Which one does the data we just walked through point at?"* Note: ask Ramesh first. His answer, uncolored by Ashish's, is signal. If Ashish answers first, he's priming; Ramesh defaults to agreement by conversational pressure.
- **Cross-check:** *"Does anyone want to argue for a different one?"* Even if both parties agree, one of them should steelman the runner-up outcome for 60 seconds. This prevents the politeness cascade from ratifying whatever feels socially easiest.
- **Commit the next step before ending the meeting.** Don't leave with "let's sleep on it" — that's the outcome-deferring antipattern. If either party genuinely needs more time, the meeting outcome is "decision deferred 14 days max" with a recurrence booked.

**What the conversation is NOT.** Not a re-run of the original coffee. Not another round of North Star discovery. Not a brainstorm of new features. The job at day 90 is evaluation of evidence, not generation of options. Per I10-A §3.4: *"the null hypothesis is not upgrade."*

---

## Part 3 — The Decision Matrix

Four outcomes. Each with quantitative triggers (from Part 1 data), qualitative triggers (from Part 2 conversation), and the specific next step.

### Outcome A — Continue v0 unchanged for another 90 days

**Quantitative triggers (any sufficient set):**
- `total_posts` between 3 and 6 at day 90 (I10-A §5 extrapolates 1/2-3 weeks = 4–6 over the window).
- `ashish_hours_ytd` between 4 and 8 (the ~30 min/week budget holding, adjusted upward 2× for Playbook 7).
- `substack_subs_free` in the 25th–75th percentile band per iter-1 brief 04.
- Zero `channel_crossover` events.
- Zero `feature_ask` entries in Tab 3 that Ramesh would describe at retro as "pattern."

**Qualitative triggers:**
- Block 2 Q1 answer: "not really" or "not specifically."
- Block 3 Q3: North Star unchanged.
- Block 3 Q4 counterfactual: "yeah, I'd still pick v0."
- No Part 4 biases triggered (see below).

**Next step:** Schedule month-6 retro (2026-10-18) on both calendars before leaving. Reuse this template verbatim. Ashish does nothing else.

### Outcome B — v0 sharpens (small tweaks, not upgrade)

**Quantitative triggers:**
- `total_posts` within range BUT ≥2 Tab-3 events of type `voice_complaint`, `rubric_complaint`, or specific-friction one-liners.
- Ramesh's `ashish_minutes` reliably exceeds 30 on weeks he ships, indicating the format itself has friction.
- One `feature_ask` classified as "one-off" (per I10-A §3.1) that nonetheless keeps coming up — the boundary case where the third-resented-task test is borderline.

**Qualitative triggers:**
- Block 2 Q1/Q2 answers: specific friction named, but scoped ("I wish the digest included X" not "I wish we had a pipeline").
- Examples that qualify: "digest arrives Friday but I only read email Sunday — can it come Saturday?" / "your comments would land better earlier in the week" / "can the shared doc have a second template for shorter posts?"
- Ramesh explicitly says: *"I don't want the whole pipeline, I just want [one specific thing]."*

**Next step:** Book a 2-hour session within 14 days. Implement the named tweaks. If any tweak requires >2 hours, it's probably Outcome C in disguise — escalate back to this matrix. Document the tweaks in Tab 3 and adjust Tab 1's `quick_fix_ask` column to include `post_tweak_ask` distinction going forward. Month-6 retro still scheduled.

**Watch for:** Upgrade-as-escape (Part 4) masquerading here. If Ashish finds himself excited to build three tweaks and each is 3 hours, he's doing v2 in weekly installments. B should feel small.

### Outcome C — Upgrade to v2 (conditional)

**Quantitative triggers (BOTH required):**
- At least one `feature_ask` entry Ramesh describes at retro as "pattern" — i.e., a third-time-wanted automation, per I10-A §3.1 (primary trigger), OR
- Cadence stall: `total_posts == 0` across a 6+ consecutive week window within the 90 days, per I10-A §3.2, AND
- Ramesh says aloud at retro: *"I wanted to write but didn't know where to start."* Both conditions for the stall trigger, per I10-A §3.2.

**Qualitative triggers:**
- Block 2 Q2 produces a specific named feature Ramesh can describe as a deliverable.
- Block 3 Q4 counterfactual: *"If we were starting today, I'd want the pipeline."*
- I10-C Signal 4 test, re-run live at the retro: Ashish says *"we could just keep doing v0."* Ramesh pushes back with a named blocker (not polite affirmation, not relief).
- None of Part 4's biases look like they're driving this — especially not Upgrade-as-escape.

**Next step:**
1. Ashish confirms out loud at the table: *"I'm going to email three CA employment attorneys this week to start the §2870 process. Before I file, you and I have one more coffee after I've got the letter drafted — that's the last off-ramp."* This preserves the DECISION.md invariant that the letter follows, not leads.
2. Timeline: 8–12 weeks from green-light to v2 shipped (attorney consult 2–3 wk + letter countersign 2 wk + Phase 1 build 4–6 wk + install call). Explicit: Ashish does NOT start coding before the letter is countersigned.
3. Ramesh's 5-point agreement gets re-papered per iter-2 D3 Artifact 2 (OSS license + self-host + Saviynt-channel + recusal + $500/mo repapering).
4. v0 continues *unchanged* during the build. The pipeline doesn't cut over until install day. This means 8–12 weeks of overlap, not a freeze.

**Mandatory 48-hour cooling-off.** The §2870 emails do NOT go out the same day as the retro. Ashish sleeps on it. If either party's read shifts during the 48 hours — even slightly — they converge by text and potentially fall back to Outcome B.

### Outcome D — Wind down

**Quantitative triggers:**
- `total_posts == 0` across 6+ consecutive weeks AND Ramesh's signal column shows `silent` or `declined` repeatedly, AND
- No Tab 3 `ramesh_unprompted_raise` events in the second half of the window, OR
- Ramesh explicitly says *"this isn't for me"* or equivalent at retro.

**Qualitative triggers:**
- Block 3 Q5: Ramesh surfaces something he's been sitting on — most commonly a version of "I don't actually want to keep writing."
- Block 3 Q4 counterfactual: *"If we were starting today I'd probably say no thanks."*
- Archetype-4 (Disengaged Output Consumer, per I6-B) behavior dominates the tracking sheet.
- Alternatively: Ashish realizes his own enthusiasm died. (Less common but possible — Part 4 Sunk-cost bias makes this the hardest admission.)

**Next step:**
1. Ashish archives the shared Google Drive folder (doesn't delete — archives, in case Ramesh resurrects it). Removes Ramesh from the scout digest recipient list.
2. Sends one short email: *"Thanks for the 90 days. I've paused the digest and archived the folder. If you want to pick this up in 6 months or next year, reply to this thread and we'll figure out the right shape for then."*
3. **No follow-up.** Per I10-C Branch 4: silence is the confirmation. A "checking in" email two weeks later re-opens the conversation in a way neither party wants.
4. Ashish closes the iter-13 retro file with a one-paragraph honest write-up: which outcome fired, why, what he'd do differently. That becomes iter-14 or the post-mortem artifact.
5. The friendship persists. The arrangement ends. Those are different things.

---

## Part 4 — Biases to Watch For

The retro's biggest risk is that Outcomes A and C (the "keep going" outcomes) absorb cases that should have been B or D. All four biases push in that direction.

### Bias 1 — Sunk-cost rationalization

**What it sounds like.** *"We've gotten this far — it'd be a shame to stop now."* / *"Three months of v0 means something; let's not waste it."* / *"The digest is basically automatic, the cost of continuing is nothing."*

**The tell.** The argument for continuing rests on *past investment* rather than *forward evidence*. If Ashish hears himself use the word "already" ("we already have the Google Doc," "Ramesh already knows the workflow"), that's the tell.

**Counter-move.** Reframe the decision as fresh: *"If I didn't know any of this and Ramesh asked me today to start a newsletter collaboration, what would I build?"* If the answer is "not this," then the only reason to continue is sunk cost. Sunk cost isn't a reason. (DECISION.md §5 names this explicitly: *"Most of the intellectual product of this project is a v2 artifact. Choosing B means the research's recommendation is 'don't build the thing you spent 9 iterations designing.'"*)

### Bias 2 — Politeness cascade

**What it sounds like.** Ramesh: *"It's going fine, I think."* Ashish: *"Yeah, I think so too — unless you want to change anything?"* Ramesh: *"No no, it's good. Unless you want to?"* Ashish: *"Nah, let's keep going."* Neither has said "this isn't working"; both think the other wants to continue; both are wrong.

**The tell.** Two consecutive deferrals to the other party's preference without a first-person statement. If 5 minutes into Block 4 neither has said *"I want X"* — only *"I'm fine with whatever you want"* — that's the tell.

**Counter-move.** Ashish pre-commits to stating his honest read FIRST at the meeting, unprompted, before asking Ramesh. He writes it on the printed agenda card before coffee. Yes, this biases Ramesh's answer — but the bias cuts against the cascade. An explicit first-person read forces Ramesh to either agree-with-reasons or disagree, both of which are more informative than mirror-politeness.

### Bias 3 — Upgrade-as-escape

**What it sounds like.** *"v0 is fine but I think we're ready for v2."* / *"v0 is the right 90 days; v2 is the right next 90 days."* / *"Now that the voice is stabilized, the pipeline makes sense." [Note: nobody said the voice needed stabilizing.]*

**The tell.** Outcome C is being argued for without a **named specific blocker** that v2 addresses. If Ashish can't answer "what is v0 failing to do?" with a sentence that names a concrete workflow friction, the argument for C is aesthetic, not utilitarian. This is the I10-C Signal 4 pattern re-applied at the retro.

**Counter-move.** Force the blocker-naming test aloud: *"If we went with Outcome C, the first line of the §2870 letter needs to describe the thing I'm building. What's that first line?"* If the answer is vague ("an agentic newsletter pipeline") rather than concrete ("a Socratic interview-bot that generates draft openings because Ramesh keeps getting stuck on blank pages"), Outcome B or A is correct, not C. The specificity test from I10-C Signal 2 applies.

### Bias 4 — Mistaking cadence for success

**What it sounds like.** *"12 posts in 12 weeks, we're crushing it."* (Subs: 47.) / *"The system works."* (No named reader.) / *"This is the longest Ramesh has kept up a writing practice."* (The writing is read by Ashish and Ramesh's mother.)

**The tell.** The success narrative leans on posts-shipped without a corresponding engagement number. Cadence is necessary but not sufficient — iter-6-A Month-11 audit failure scenario is *"the audit data that matters isn't in the system."* If the only number being cited in the positive direction is post count, the audit has started to decouple from the North Star.

**Counter-move.** Before any outcome is chosen in Block 4, Ashish reads aloud: *"North Star was [C advisory / B sponsor / A founding-member]. Has the North Star metric moved?"* If the answer is "we don't know" or "not really," the retro's evaluation criterion is cadence-as-proxy, which is the bias. Outcome A is only defensible if *either* North Star metric moved *or* iter-1 brief 04 curves justify "we're on track, wait another 90 days." Without one of those, A drifts toward D.

---

## Part 5 — Pre-Meeting Solo Worksheet (Ashish only, night before)

**When.** 2026-07-17, evening. 30 minutes, undistracted, alone. Not on the laptop the tracking sheet is on — print it, hand-answer on paper. Paper matters: it slows the answer and prevents the cut-paste-from-the-sheet reflex.

**Format.** Five questions. No cheating. Ashish photographs the paper afterward so he can compare to the meeting outcome.

---

**Question 1.**
*Having just walked through all three tracking tabs, which of the four outcomes (A, B, C, D) does the data — JUST the data, ignoring what I hope or what I feel — point to? Write the letter. Write one sentence of why.*

[ ___________________________________________________________ ]
[ ___________________________________________________________ ]

**Question 2.**
*Which outcome do I want to happen? Not "which should happen" — which one does my gut pull toward? Write the letter. Write one sentence of why, honestly. (Hint: "I'm neutral" is almost always false. Look harder.)*

[ ___________________________________________________________ ]
[ ___________________________________________________________ ]

**Question 3.**
*What is the delta between Q1 and Q2? If they're the same letter, explain what specific data point closed the gap — if you can't name one, Q2 is probably contaminating Q1. If they're different letters, which of Part 4's four biases best explains the delta?*

[ ___________________________________________________________ ]
[ ___________________________________________________________ ]

**Question 4.**
*If Ramesh opens the meeting tomorrow by saying "honestly, I think we should wind down" — write down, right now, the first three words of my reflexive response. Then: would those three words be agreement, negotiation, or persuasion-against? If negotiation or persuasion-against, what's driving that — and does the data support it, or am I defending a position I want regardless of the evidence?*

[ ___________________________________________________________ ]
[ ___________________________________________________________ ]

**Question 5.**
*Write one sentence I do not want to say at the meeting tomorrow. Then write one sentence describing what happens if I don't say it.*

[ ___________________________________________________________ ]
[ ___________________________________________________________ ]

---

**What Ashish does with the worksheet.** Brings it to the meeting folded in the back of the agenda. Does not read it aloud. Checks it ONCE during Block 4, privately, before stating his own read. Specifically: if his stated read at the meeting diverges from Q1, he pauses and asks himself whether Q2-Q4 bias has moved his position in the last 24 hours. If yes, he states the Q1 answer instead.

**Purpose of Q4 specifically.** Q4 surfaces the asymmetry in how Ashish responds to the four outcomes. Most people's reflexive responses to "let's wind down" are either agreement (they wanted to too) or persuasion-against (they don't). There is no neutral. The first three words reveal it unfiltered, before the self-editing layer kicks in.

**Purpose of Q5 specifically.** The sentence a person does not want to say at a meeting is almost always the most important sentence in the meeting. Naming it the night before makes it 10× more likely to be said aloud in the room.

---

*End of I13-90day-retro-template. Three tabs, four blocks, four outcomes, four biases, five questions. Everything Ashish needs to not-vibes-only the day-90 decision.*
