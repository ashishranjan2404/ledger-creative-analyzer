# I11-A — Failure-Scenario Playbooks

*Iter-11 deliverable. DECISION.md recommends v0-first; I10-A specifies v0; I10-C specifies the coffee branches. This document is the downstream: **what Ashish actually does when a specific bad thing happens after coffee.** Not theory. Scripts, observables, 24-hour actions, week-one response, conversations, irreversibility score, one-line lesson.*

*Date drafted: 2026-04-19. Seven playbooks. Each ~1 page. No repeats of the iter-4 opening-coffee script.*

---

## Skeleton — the seven scenarios

1. **§2870 letter refused by Saviynt Legal** ("can't countersign — subject matter overlaps with our anticipated R&D").
2. **"Can you just host it for the first month?"** — the silent slide into Structure 2.
3. **Ambiguous coffee outcome** — warm, no named blockers, no A/B/C pick.
4. **Ramesh picks Scenario D (hiring funnel) despite anti-D framing** — detonates §2870.
5. **v0 works for 2 months, then Ramesh goes silent for 3 weeks** — I10-A hidden cost #1 firing.
6. **Saviynt reorg puts Ramesh directly over Ashish in month 4** — RECUSAL triggers.
7. **Ashish's partner raises the time cost at week 6** — I4-A Risk 5 firing.

---

## Playbook 1 — §2870 letter refused by Saviynt Legal

**Scenario title.** Saviynt Legal comes back: *"We can't countersign this letter. Thedi's subject matter — agentic content pipelines, LLM orchestration — overlaps with our anticipated internal R&D. Please withdraw the request."*

**How you know it's happening.** An email from Saviynt Legal (or HR routing on behalf of Legal) replying to Ashish's §2870 submission. Language variants: "conflicts with our anticipated R&D," "we consider this category of work within scope of our IP assignment," "we cannot provide the requested acknowledgement at this time." No counter-offer to scope it down. No lawyer name attached (usually a paralegal or HR ops).

**Immediate action (within 24 hours).**
1. Do not reply same-day. Do not reply from emotion. Forward to your outside counsel (the attorney who drafted the letter) with a one-line note: *"Saviynt came back with this — want your read before I respond."*
2. Freeze all Thedi code commits. If on v0, freeze the editorial pass mid-thread: Ashish finishes any open comment but opens no new draft until §2870 resolves. If on v2 (we shouldn't be, per DECISION.md, but in case): `git tag frozen-pending-2870` on current head, push to personal GitHub, write to Ramesh the "pause" email in step 3.
3. Send Ramesh a short, honest message from personal email: *"Hey — Saviynt Legal came back and wouldn't sign the §2870 letter. They're calling the subject matter overlapping. I don't want to ignore that, so I'm pausing on my side until I figure out what it means. I'll know more by end of next week. Nothing for you to do; don't write around it, don't push back internally, just letting you know why I went quiet."*

**Short-term response (within a week).**
Work three options in parallel with outside counsel, pick one by day 7.
- **(a) Renegotiate scope.** Ask Legal what subset *would* be signable. Often the answer is "a content pipeline for general tech writing" is fine; "an agentic LLM platform with rubric-scored critics" is not. Narrow the letter: strike the architecture language, keep only "editorial collaboration on a colleague's personal Substack on topics outside identity/IAM." Re-file. 70% of refusals resolve here at ~2 weeks latency.
- **(b) Drop to v0-without-letter.** If the refusal was specifically about Thedi as a system (not about editorial collaboration), the §2.2 argument in I10-A applies: v0 involves no invention and arguably didn't require the letter. Document the refusal, file the declined letter itself as the record of good-faith disclosure, and continue v0 with a one-paragraph HR moonlighting disclosure only. **This is the correct move for most v0-mode refusals.**
- **(c) Drop Thedi entirely.** If Legal's language extends to *any* colleague-facing editorial work (rare), continue violates the IP policy as interpreted. Shelve. Ramesh keeps writing solo; Ashish is not involved.

Do NOT: keep Thedi as "unprotected personal project and hope." That's the worst option. Refusal-on-record + continuing = bad faith. It becomes the termination story in an HR dispute 14 months later.

**The conversation with Ramesh (day 7, in-person or phone).**
> *"Okay — here's where I landed. Saviynt Legal doesn't want to countersign the full carve-out. My lawyer thinks for v0 specifically — me leaving comments on your Substack drafts — we're fine without it, because I'm not writing code and there's no invention. What I can't do is build you the pipeline, now or later, without them signing something. So v0 is still on. v2 is dead for as long as I'm at Saviynt, or until they change their mind. That a problem?"*

**Irreversibility score.** **Medium.** v0 survives; v2 optionality dies for the duration of Saviynt employment. Recoverable career-wise (Ashish can build v2 after leaving Saviynt) but the narrow "v2 for Ramesh while colleagues" door is closed. If Ashish escalates or argues, closes harder — a second refusal is worse than a first.

**Lesson for next time.** **Don't file a §2870 letter for a system you haven't committed to building.** The letter's own scope creates the surface Legal refuses. Under v0-default (no letter), this scenario never fires.

---

## Playbook 2 — "Can you just host it for the first month?"

**Scenario title.** Post-coffee (or in the install call if we're on v2): Ramesh says some variant of *"honestly, I don't want to deal with Butterbase for the first month — can you just run it from your account and we'll migrate once it's stable?"*

**How you know it's happening.** The exact sentence varies. Tells: "just for a bit," "till I get the hang of it," "migrate later," "easier if you run it first." Often delivered warmly, often on a Friday when Ramesh is tired. In v0-mode, the analogous version: *"can you just send the digest from your inbox instead of me setting up the forwarding?"* or *"can you own the Google Drive folder?"*

**Immediate action (within 24 hours).**
1. Do not agree in the moment. The iter-1 brief 07 and iter-3 C pattern is that this *is* the silent slide into Structure 2 (unpaid contracting inside a reporting chain). The answer is no, but the delivery matters.
2. Reply within 24 hours — don't let it sit, because silence reads as reluctance to say no, which reads as "probably yes eventually."
3. Response template (text or email, personal channel):
   > *"Thought about this — can't do the hosting even short-term. The reason the OSS + self-host framing holds up legally is that I'm not operating production for you. The minute I'm running your account, it's not OSS maintainership, it's unpaid contracting, and the §2870 framing stops working. I know it's a paperwork-feeling answer to a practical question. Two things I can do instead: (a) I'll run the Butterbase install live with you on a screen-share, takes 90 min, you end up with the keys; (b) if you hit a wall mid-setup, I'll unblock on that specific wall — not take over the account. Does that work?"*

**Short-term response (within a week).** If the ask repeats or escalates ("but just this month"), treat as a signal that Ramesh is not Archetype-5 self-host-capable — he's Archetype 2/3 with operational reluctance. This is the exact condition where v2 runs empty (the iter-6-A pre-mortem). Downgrade proposal: *"If the hosting piece is the sticking point, I think we should drop back to v0 — the Friday digest and the Google Doc. Same output for you, none of the hosting problem for either of us. Pipeline was overbuilt for where we actually are."* This reframes the refusal as a product decision, not a boundary.

**The conversation with Ramesh.**
> *"Look — I know this sounds like I'm making a small thing bigger than it is. The reason I can't just host for a month is that 'just a month' is how every unpaid-contractor-inside-a-reporting-chain story starts. I've read those stories. I'm not going to be in one. If it's the setup friction — let's just do v0 instead. Less for both of us, and the legal story stays clean."*

**Irreversibility score.** **Low if Ashish says no cleanly. High if he says yes.** Once Ashish hosts for even a week, the "why'd you change that later?" conversation becomes harder every subsequent week. The precedent is the trap.

**Lesson for next time.** **The request to host is not a request for help — it's a request to change the structure.** Never say yes to structural changes in-the-moment; always say yes or no async after sleeping on it. If the answer is yes, it's a different project.

---

## Playbook 3 — Ambiguous coffee outcome

**Scenario title.** Coffee ended warm. Ramesh didn't say yes or no to anything concrete. Didn't name a blocker. Didn't pick A/B/C. Hugged at the parking lot. Ashish is driving home and realizes he has zero falsifiable signal.

**How you know it's happening.** Run the I10-C phone cheat sheet 10 minutes after coffee, in the car, before starting it. Count signals. If the count is 1–2 and the overkill-test (Signal 4) produced polite affirmation rather than a named blocker — this is the ambiguous outcome. The gut-feel will be "that went well!" The cheat sheet will say "you have no evidence."

**Immediate action (within 24 hours).**
1. Do not send the v0-README yet. Do not re-target the scout. Do not file the §2870 letter. **Any of those is premature commitment in the ambiguous case.**
2. Write — in a file, not to Ramesh — the 5-signal count and which specific moments scored them. This forces the gut-feel vs. evidence split onto paper while memory is fresh. File: `iter11/coffee-log-YYYY-MM-DD.md`. Not for anyone else; for the 48-hour decision.
3. Sleep on it.

**Short-term response (within a week).**
Default to **Branch 2 (v0 for 3 months)** as I10-C prescribes. That's what the default is *for* — the ambiguous case where the signal is weak but not negative. One follow-up text, calibrated low:
> *"Good to catch up. I'm going to re-target the scout so you get the Friday digest starting next week — same format we talked about, three picks, no pressure. If you want to write against one, tag me in a Google Doc and I'll read it. If you don't, the digest just lands and you ignore it. We can re-check in 90 days. Cool?"*

Watch for the reply. A one-word "cool" or emoji-thumb = Branch 2 confirmed. A reply that re-raises a pipeline feature = re-evaluate toward Branch 1. A silence past 5 days = downgrade toward Branch 3 (scout-digest-only). More than 2 weeks of silence = Branch 4.

**The conversation with Ramesh (if he pings you mid-week unprompted to extend the conversation).**
> *"Yeah, I've been chewing on it too. Honestly I don't have a strong read on what you actually want from it yet — that's not a bad thing, it just means I shouldn't go build anything specific. Let's let the Friday digest run for a couple months and see what you end up doing with it. If nothing, we have our answer. If something, we'll have a specific thing to talk about."*

**Irreversibility score.** **Low.** The ambiguous case is exactly what v0-default is built for. The mistake isn't picking the wrong branch — it's trying to force clarity by over-committing (filing a letter, writing code) to "move things along." That's what creates the irreversibility.

**Lesson for next time.** **Ambiguous is a valid outcome, not a problem to solve.** The research repeatedly flagged that Ashish's pattern-matcher will inflate warmth into signal. The playbook is "do less and wait," not "do more and ask."

---

## Playbook 4 — Ramesh picks Scenario D (hiring funnel)

**Scenario title.** Somewhere in Act 2 or 3 of the coffee, Ramesh says: *"honestly, part of why I want the Substack going is I want to use it to pull good engineers into my team at Saviynt. If it builds an audience of senior IAM people, I can hire from it."*

**How you know it's happening.** The phrase variants are narrow: "recruit," "hire from the audience," "pull people into the team," "bring candidates to Saviynt." Anything that makes the Substack instrumental to Ramesh's Saviynt hiring is this scenario. Said casually; Ramesh likely does not know this is the scenario the plan explicitly rules out.

**Immediate action (within 24 hours).**
1. In the moment: **do not argue and do not immediately decline.** Say something like *"Interesting — let me think about that one, there's a wrinkle on my side. Let's keep going on the other stuff for now."* Buy the conversation 90 seconds of continuity while you internally re-plan.
2. Do not sign anything, re-target anything, or file anything for 48 hours. This is the only scenario where walking-away-cleanly matters more than speed.
3. Within 24 hours, write to Ramesh (email, personal):
   > *"Hey — been thinking about the recruiting angle you mentioned. I can't be part of something that builds a hiring pipeline into your Saviynt team. It's not a values thing — it's that the moment the Substack's purpose is feeding candidates into your team, I'm indirectly helping source the team I'm about to join, and §2870 stops protecting any of this. Saviynt's lawyers would be right to say it's in scope. I don't want to rebuild the scope of what I'm doing around that, because there isn't a version of it that's clean. I'm still in on editing your writing as a friend-reading-a-friend's-drafts. I'm out on the audience-as-funnel piece. Want to find a version of the Substack that's not a funnel, or does that remove most of what you wanted from it?"*

**Short-term response (within a week).** Two possible replies from Ramesh.
- *"Yeah no worries, the recruiting thing wasn't the main point — let's just do the writing piece."* → Back to Branch 2 (v0). Note the scenario clearly in `coffee-log`. Watch for recruiting to re-surface; it often does when v0 starts producing subscribers.
- *"Okay but that was honestly the main value for me."* → Decline cleanly. Offer Branch 3 (scout-digest-only, no editorial involvement — he can do whatever he wants with the topics) or Branch 4 (drop entirely). Do NOT offer "v0 but I'll help build it and you use the audience for whatever." That's the hope-version that detonates.

**The conversation with Ramesh (the declining version).**
> *"I hear you, and I get the pitch — senior audience is the best kind of recruiting pool. For me though it lands as Saviynt-adjacent in a way I can't structure around. The friendship isn't touched by this; the project is. If you want the scout, I'll keep the Friday emails flowing and that's as far as I can go on my side. What you do with the audience after that is yours. Deal?"*

**Is there a "help with v0 only and make clear the pipeline can never ship" version?** Technically yes — Ashish edits the Substack, Ramesh uses the audience for hiring, no v2 ever. But this requires Ashish to believe Ramesh won't later ask "so now that it's working, can we do the pipeline?" and the honest answer is he will. The declining version is cleaner. Pick it.

**Irreversibility score.** **High if Ashish doesn't decline within 48 hours. Low if he does.** The window matters. If Ashish goes three weeks into v0 editorial work while Ramesh is tweeting about "the Substack I'm using to hire my team," the §2870 defense in any future HR inquiry gets dramatically worse. The early decline is the save.

**Lesson for next time.** **The hiring-funnel scenario is not negotiable and not a gradient.** It's a structural different-project. Name it, decline it, keep the friendship, don't try to engineer around it.

---

## Playbook 5 — v0 works for 2 months, then Ramesh goes silent for 3 weeks

**Scenario title.** Weeks 1–8 of v0: 4 posts published, cadence ~1 every 2 weeks, Ashish's editorial passes all clean. Week 9: no draft in the shared Doc. Week 10: no draft. Week 11: no draft. Three Friday digests sent; no reply from Ramesh on any of them.

**How you know it's happening.** Hard observable: zero `@ashish ready for pass` comments in `thedi-drafts/` for 3 consecutive weeks, combined with no reply to the Friday digest during the same window. (One of the two alone is normal; both together is the pattern.) This is I10-A Hidden Cost #1 firing — v0 exposes Ramesh's writing cadence directly, and the "robustness" is only mechanical.

**Immediate action (within 24 hours of noticing — which will likely be at week 11, not week 9).**
1. Do not chase immediately. The 3-week silence could be Saviynt crunch, personal stuff, travel, a writing block. None of those are emergencies for Ashish.
2. Check the Friday digest bcc to confirm emails are actually landing (it's not a scout failure). This is 2 minutes.
3. Do nothing else for 48 hours.

**Short-term response (within a week of the 3-week mark — so at week 4).**
One text, from the personal thread. Low-pressure, no agenda, no ask. The goal is to remove the implicit "are we still on?" pressure, not to create it:
> *"Hey — noticed the last few weeks have been quiet on the Substack side. Totally fine, just want you to know: I'm not waiting on anything, the digest keeps going, no pressure from my end. Ping me whenever you want to pick it back up, or don't — either's cool."*

Do NOT send: "Are we done?" That's asking him to make a decision he might not want to make yet. Do NOT send: a long email explaining what's working and what isn't. That's making the silence about Ashish, not about Ramesh.

**What happens next determines the path.**
- Reply within a week ("yeah crunch time, back next Sat") → Business as usual. Note in `coffee-log`.
- Reply acknowledging the silence but no return date ("yeah it got away from me") → Continue v0 passively. Do NOT send a second nudge. Digest keeps landing. Let it come back when it comes back.
- No reply after another 2 weeks → 6 weeks total silence. This is the I10-A §3.2 negative case: cadence stall without writing-block language. Not an upgrade trigger; a "this may be ending" signal. **Do nothing**. The digest keeps landing; no more nudges. The arrangement has downshifted to Branch 3 (scout-digest-only) by default, which is fine.
- No reply after 3 more months → the relationship with Thedi has ended. Ashish can send one final "I'm going to stop the digest; if you want it back on ping me" text, but only if he wants to formalize. Default: let the digest keep running. It costs $0.

**The conversation with Ramesh (if/when he resurfaces, in-person or call).**
> *"Hey — glad you picked it back up. No need to explain where you went, seriously. One thing I've been thinking about: v0 is set up so silence is fine. If you publish twice a year, that's still a working arrangement. I'd rather that than you feeling like you owe me a post. Cool?"*

**Irreversibility score.** **Low.** v0's core feature is that silence doesn't break it. This is the plan working as designed; it only becomes a crisis if Ashish forces a conversation that didn't need to happen.

**Lesson for next time.** **Under v0, silence is not a problem to solve. It's the default state punctuated by writing.** The plan's robustness to this was real; the playbook is "don't invent urgency."

---

## Playbook 6 — Saviynt reorg puts Ramesh directly over Ashish in month 4

**Scenario title.** Month 4 into v0. Saviynt announces a re-org. Ramesh is named Ashish's skip-level (or direct manager, or performance-panel chair for Ashish's team). Neither of them saw it coming.

**How you know it's happening.** An email from Saviynt HR or the VP Eng announcing the reorg. Ashish's reporting line has changed. Or: Ashish's manager mentions it in a 1:1 before the formal announcement. Or: the org chart in Workday updates and Ashish notices in the morning.

**Immediate action (within 24 hours of the announcement).**
1. Stop v0 on the editorial side immediately. Next draft Ramesh tags, Ashish does NOT read. Instead reply in the Doc comment: *"Paul — don't read this today, just saw the reorg. I'll be in touch separately."* Use his name, personal channel if possible.
2. Send Ramesh a personal-email message same day, short:
   > *"Saw the reorg this morning. Per the recusal clause we agreed to, I'm stepping back from editorial immediately — point 4 of the v0 agreement. Not making a federal case of it, just doing what we said we'd do. I'll file the HR disclosure this week. No action for you; just don't tag me on drafts until we figure out the paperwork."*
3. Do NOT have this conversation on Saviynt Slack, Saviynt email, or in the office. Personal channels only. (This is exactly what clause 3 of the v0 agreement exists for.)

**Short-term response (within a week).**
1. File HR disclosure. One paragraph, factual:
   > *"Per the reorg announced 2026-08-XX, [Ramesh] is now in my reporting chain (skip-level / direct manager / panel evaluator — specify). Since [coffee date], I have spent approximately 30 minutes per week leaving editorial comments on his personal Substack drafts. No compensation. No Saviynt resources. No shared code. I have suspended this activity effective the reorg announcement and will not resume while the reporting relationship is in place. Available to discuss."*
2. Tell your direct manager before HR processes the disclosure — courtesy, not policy. One sentence: "Heads up, filing a recusal disclosure today because of the reorg; it's about a friend's personal Substack, nothing operational."
3. Do not "archive the repo" because in v0 there is no repo. (In v2 world: `git tag recused-YYYY-MM-DD`, push, set repo to private or archived per the v2 RECUSAL.md.) The only v0 artifact is the Google Doc folder; leave it shared, stop writing in it.
4. Put a 6-month calendar reminder: "Check reorg status — if Ramesh is out of reporting chain, re-evaluate editorial pass." Do not set it shorter; do not assume the reorg reverses.

**The conversation with Ramesh (week 1, on personal channel — call or coffee, not text).**
> *"Okay — the playbook works. You and I are doing the thing we said we'd do, which is I stop reviewing and we both keep it above-board. I've told HR. Doesn't affect you — you keep writing, you publish on your own cadence, the scout keeps sending you topics. What this is not: a crisis. What it is: exactly the thing we filed paperwork for nine months ago. When the reorg reverses — or if you end up somewhere else in the org — we can pick editorial back up. Until then, it's just you and the Substack."*

**Does Ashish announce to Saviynt HR?** Yes, via the disclosure in step 1. Does he archive the repo immediately? In v0 there is no repo; the editorial relationship is what pauses. In v2 (if somehow we got there) — yes, same day, per the canonical RECUSAL.md procedure.

**Irreversibility score.** **Medium.** The v0 arrangement is on ice but not dead. The friendship is fine *if Ashish handled it by the book*. The irreversibility fires if Ashish delays, tries to "finish the post in progress first," or handles it on Saviynt channels — any of those creates the HR story where "he kept editing his manager's Substack for two weeks after the reorg." Execute within 24 hours; the irreversibility stays low.

**Lesson for next time.** **The recusal clause is a ritual, not a hypothetical. When it fires, you execute it on the day, not after "wrapping up one last thing."** The "one last thing" is the headline that ends the career.

---

## Playbook 7 — Ashish's partner raises the time cost at week 6

**Scenario title.** Saturday morning, week 6. Partner: *"I've noticed you've been spending every weekend on this. When does it end?"* Not angry — concerned, or tired, or both.

**How you know it's happening.** Literal statement like the above. Precursors (caught earlier are better): declining weekend plans "because of Thedi," bringing the laptop to family brunch, reading drafts in bed. Under v0, the expected Ashish load is ~30 min/week; if the partner is raising it, Ashish's actual load is probably 2–4 hours/week without him having noticed the drift. That drift is itself the bug — trip-wire for 5-point-agreement clause 5 ("revisit if >1 h/week sustained").

**Immediate action (within 24 hours).**
1. Don't defend. Don't say "it's just 30 minutes." The partner would not raise it if it were just 30 minutes. Their observation is the ground truth of your actual time; your self-report is the noisy one.
2. Say: *"You're right, I hadn't done the accounting. Let me actually look at the last three weeks and come back tonight."*
3. That evening, actually do the accounting. Open calendar, Slack history, Google Doc edit history. Add up the real minutes — not the "Thedi time" slot, but every moment spent thinking about Ramesh's post, drafting comments, reading the digest Ashish forgot he also reads, etc. The honest number is usually 2–3x the planned number.

**Short-term response (within a week).**
Under the 5-point agreement, clause 5 fires when >1 h/week sustained for 3+ weeks. The partner just observed ~6 weeks of it. Do not try to compress the work to fit the budget — it's usually impossible without dropping quality. Instead, have the two conversations clause 5 was written to trigger:
- The conversation with yourself: is v0 quietly becoming v2? The drift-tells are: Ashish is thinking about voice, not just clarity; Ashish is suggesting phrasings, not flagging structural issues; Ashish is re-reading drafts outside the Tuesday slot. Any of those = v0 has become v1.5 without an agreement update.
- The conversation with Ramesh (next playbook section).

**The conversation with Ramesh.**
> *"Had to do some accounting this weekend. The 30-minute pass we agreed on is running closer to 2.5 hours when I add up everything — the re-reads, the comment drafts, thinking about your post during the week. That's on me, not you; you've been fine. But it means clause 5 of what we agreed to is firing: if it's more than an hour a week, we revisit. Two options: I hard-cap the pass at 30 minutes and let some stuff land less polished, or I dial back to every other week, or we decide v0 wasn't actually as light as we thought and pause editorial entirely. I'm leaning toward option 1. What do you think?"*

**The conversation with the partner (ongoing).**
> *"You were right, it's been more like 2 hours a week, not 30 minutes. I talked to Ramesh; we're capping it at 30. If in three weeks I'm still blowing past that, we stop doing it. That okay?"*

And then actually hold the cap. If week 9 is still 2 hours, the honest move is stopping, not apologizing again.

**The parallel-OSS-project (D2) mitigation.** Per DECISION.md §3, a second OSS project was supposed to partially protect against this. It only does if it exists. Most of the time when this scenario fires, the parallel project hasn't been started yet — Ashish pushed it to "after v0 stabilizes." This playbook is the reminder that *v0's only career-narrative value is unlocked by the parallel project existing in parallel, not after*. If it's week 6 and there's no parallel project, the v0 time isn't paid back even in the career-narrative sense — it's being spent twice (on Ramesh *and* on the opportunity-cost of not building the project that would make v0 legible as career narrative).

**Irreversibility score.** **Low on the relationship with Ramesh (v0 contracts around this cleanly). Medium-to-high on the relationship with the partner if Ashish's response is to relitigate the number rather than accept the observation.** The partner raising it the first time is cheap to handle. Raising it a second time after nothing changed is expensive. Raising it a third time is often past the point of cheap repair.

**Lesson for next time.** **The partner is the most accurate time-tracker in the system. When they raise the hours, the hours are real; your calendar is lying.** Build the slack into the agreement from day one (clause 5 already does this); hold the slack when it triggers (which most people don't).

---

*End of I11-A. Seven playbooks. Each scenario has observables, 24-hour actions, a week-one response, a script fragment, an irreversibility score, and a one-line lesson. The playbooks assume v0-default; the §2870-refusal playbook (#1) is the one that only fires under upgrade-to-v2 or if Ashish files the letter anyway per I10-C Branch 2.*
