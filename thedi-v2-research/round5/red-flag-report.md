# Red Flag / Adversarial Report

**Author:** Round 5 adversarial agent
**Date:** 2026-04-19
**Target:** Thedi v2 plan as of Round 3 (A: interview-bot primary + voice-note fallback; B: send 3-scenario brief to Ramesh; C: Ramesh self-hosts on his own Butterbase account).

This report does not pretend to be balanced. The synthesis agent is writing the "yes" case in parallel. My job is the "no" case.

---

## What's Wrong With This Plan Today (week 0)

### R1. The installer is the whole plan, and nobody has sized it.

**Scenario.** It is T+10 days. Ashish has shipped the code. He schedules a 90-minute install call with Ramesh on a Saturday morning. Ramesh has ~30 min before family brunch. The installer hits a Butterbase `init_app` rate-limit, an IonRouter dashboard UI that changed since Ashish tested it, a LinkedIn OAuth redirect URI that doesn't match because Ramesh signed up from a different email than expected, and a Resend domain-verification step that requires a DNS TXT record Ramesh can't add because `nampalli.dev` is managed by his spouse. Ramesh says "just send me the link and I'll do it later." Later never comes, or — worse — later is *"hey, can you just host it, I have a Substack launch in 2 weeks."* The plan is now silently Option 2 (Ashish-hosted). Brief 07 just collapsed.

**Trip-wire.** Pair-install call goes past 2 hours; any step Ashish has to screen-share through rather than Ramesh driving; the sentence "I'll just finish this later." Any one of these = slide to Option 2.

**Mitigation.** (a) **Budget 8+ hours, not 4, on the installer.** Round 3 C says "≤8 hrs Ashish install." That is the most optimistic number in the entire document and it is the one that decides whether the ops model works. (b) **Dry-run the installer against a throwaway `ramesh-test` Butterbase account *before* the call with Ramesh.** Catch the LinkedIn URI, Resend DNS, and IonRouter dashboard friction against a fresh-signup account, not Ramesh's live one. (c) **If the install doesn't complete in one 2-hour session, the pipeline does not go to production.** Ashish does not host "temporarily." There is no temporary.

---

### R2. The §2870 carve-out letter is a pre-condition, not a post-condition, and it's not in the week-0 plan.

**Scenario.** Ashish pushes the Thedi v2 repo public on a Sunday. Monday morning he's onboarding at Saviynt. Week 3, his manager asks him to sign the standard IP assignment + invention-disclosure form. The Thedi commits are three weeks old, under his personal GitHub, *pre-dating his employment*. But one commit landed on April 28, his start date. Another hit in week 2 because he fixed a bug at lunch. Saviynt Legal, doing what legal departments do, reads §2870(b) narrowly and says "you made substantive commits on employer time; the invention-disclosure form covers it; we own the repo now." Ramesh is now building his newsletter on IP his employer owns. Nobody involved wants this; nobody can undo it without a lawsuit. Brief 07 explicitly flagged this and it is still not on the week-0 critical path in Round 3 docs.

**Trip-wire.** Any git commit to the Thedi v2 repo dated on-or-after Ashish's Saviynt start date without a §2870 carve-out in hand. Any Saviynt Legal response to the carve-out request that takes >14 days (signals they're going to push back).

**Mitigation.** **Freeze all commits 7 days before Saviynt start date**, in writing, until Saviynt Legal returns a countersigned §2870 carve-out. If they refuse, Thedi is a thought experiment, not a product. This is not optional and it is not month-2 work. Add a `FROZEN_UNTIL_CARVEOUT.md` file to the repo with a hard date.

---

### R3. "Ramesh self-hosts" assumes a cooperation gradient that is fragile.

**Scenario.** Ramesh signs up for Butterbase, does the install, and then — because he is a Principal Engineer, not a product manager — notices that his voice-fidelity score has dropped on post 4 and opens a GitHub issue. Ashish is in his second week at Saviynt, in all-day onboarding trainings. He sees the issue Thursday night, replies Friday morning: "Try pulling main and re-running migrations." Ramesh tries. It fails. It is now Saturday, the week's post is due Monday, and Ramesh is staring at a Butterbase dashboard he doesn't fully understand. He pings Ashish on Slack — from his Saviynt account. Or over Signal. Or by dropping into Ashish's office on Monday. The boundary between "OSS maintainer" and "my direct-report's boss asking me to fix something" erodes on exactly the gradient brief 07 warned about.

**Trip-wire.** First time Ramesh contacts Ashish about Thedi through any Saviynt-affiliated channel (Slack, work email, in-person at the office). First time a Thedi issue gets raised during a Saviynt 1:1.

**Mitigation.** **One sentence in the README, and one in the install call:** "Thedi support happens at `https://github.com/<ashish>/thedi/issues`. Not Slack, not work email, not in 1:1s. If it's urgent enough to break that rule, open an issue first so there's a public record." This also protects Ashish — it's the audit trail if there's ever a question about company-time work.

---

### R4. "Overtime make some money through paid subscribers" has already been re-interpreted.

**Scenario.** Round 3 brief B politely proposes three scenarios (paid-primary, sponsorship-primary, advisory-funnel-primary) and Ashish's "opinion" subtly anchors Ramesh on scenario C (advisory funnel). Ramesh, reading it, agrees. Six months in, Thedi is doing exactly what Ashish designed: 2K engaged opens, LinkedIn cross-posting, bio-CTAs. But no advisory calls are coming in, because they're a 6-18 month lagging signal and Ramesh isn't tweeting his availability. Ramesh is now 6 months into a project that is on-track-per-Ashish and off-track-per-Ramesh. He says "can we add paid subs back" — and every Beehiiv/Substack decision needs to be unwound.

**Trip-wire.** The word "paid" or "monetize" in any Ramesh reply to the 3-scenario brief *without* picking scenario A explicitly. That's him keeping the door open, and Ashish should not interpret silence on A as a rejection of A.

**Mitigation.** (a) **Do not include Ashish's "opinion" in the brief.** Brief 04 was the research; brief B is the decision artifact. Anchoring the client on a scenario *before they answer* is a bias Ashish shouldn't introduce on a future boss. Remove §"Ashish's opinion" entirely. (b) **Force Ramesh to write one sentence in his own words** about what "worth it in 12 months" looks like, not pick from a menu. The menu is the trap.

---

### R5. Beehiiv-as-staging is specified but its AUP failure mode is unmitigated.

**Scenario.** Post 3 gets auto-moderated by Beehiiv's AUP detector because the draft included a 400-word LLM-written intro section that pattern-matches as "generic daily content designed to fill inboxes." Ramesh's Beehiiv account gets flagged. The post doesn't send. The silent-failure detection in Round 3 C §4e catches it — good — but Ramesh now has a Beehiiv account with a flag on it, and his launch newsletter is publicly tied to a platform that thinks he's AI-slopping. Even after appeal, the flag stays in his account history. Brief 03 predicted this exact outcome and the resolution was "either drop Beehiiv or adopt voice-note-first." Round 3 A picked interview-bot, which is *still* LLM-drafting into Beehiiv.

**Trip-wire.** First Beehiiv post that scores <7 on the critic's own voice-fidelity rubric and still ships to Beehiiv staging. That's the one that gets flagged.

**Mitigation.** **Compose in a private Google Doc (or a Butterbase-hosted editor), not in Beehiiv.** Beehiiv is unnecessary infrastructure for this workflow given Substack is the publish target anyway. The Round 3 plans carry Beehiiv forward from brief 03 without re-examining whether brief 03's recommendation still holds given Round 3 A's voice workflow. It does not. Drop Beehiiv.

---

### R6. The critic rubric recalibration loop approves by default.

**Scenario.** Round 3 A §"Rubric-recalibration loop" says "Ashish sees proposed deltas in a weekly digest email... Default is *reject* if Ashish doesn't act in 7 days." Good. But the *escalation* at 3 weeks shifts to "Either approve or kill. Silence is not an option." In practice, Ashish at Saviynt in week 8 has 14 unread Thedi digest emails, clicks "approve all" on the escalation one because it's shouting at him, and now a ban-list entry that shouldn't have existed is live. Voice drifts in a direction Ramesh didn't sign off on. Ramesh doesn't know the rubric changed.

**Trip-wire.** Any "approve all" or batch-approve action on the rubric digest. Any week where Ashish doesn't read the digest email within 48 hours.

**Mitigation.** (a) **Rubric changes require Ramesh's sign-off too, not Ashish's.** Ashish is not the voice authority; Ramesh is. Add a second gate: after Ashish approves, Ramesh gets a one-line email "we're adding 'delve' to the ban list — reply yes or ignore." Default: no-change. (b) **Cap rubric changes at 1/week.** If the loop wants to propose 3 changes, pick one. Rubric churn is itself voice drift.

---

### R7. The single design choice becoming load-bearing: Ramesh's email is the control plane.

Every alert, every approval, every degradation signal, every rubric-recalibration prompt flows to Ramesh's email. Round 3 C lists nine alert types all going to email. A Principal Engineer's email inbox is a graveyard. If Ramesh bankruptcies his inbox once, the entire Thedi control plane gets archived.

**Trip-wire.** First time Ramesh says "I missed that email."

**Mitigation.** **Two control-plane surfaces, not one.** (a) Email for informational. (b) A persistent `/admin` dashboard that shows open alerts, required actions, and expired-approval-state. If Ramesh doesn't log in in 14 days, the pipeline pauses. Email-only control plane is fragile; the ops model above assumes it.

---

## What Fails in 6 Months

### F1. Q&A fatigue at post 10.

**Scenario.** Posts 1–5 go well. Ramesh enjoys the cold-start interview; it feels generative. Posts 6–8 the questions start feeling repetitive because the scout keeps surfacing adjacent arxiv threads. Post 9, the Q&A prompt is "What's your take on multi-agent reliability for incident response?" — which is what he answered in post 4. Ramesh answers in one sentence. The drafter produces thin prose. Critic flags it. Critic-recalibration loop fires. Ramesh, already tired, clicks "approve" on a draft he knows is weak because he doesn't want to re-do the Q&A. Post 10 ships, sounds flat.

The voice-note-fallback is supposed to catch this — but the fallback is triggered by Ramesh's *silence*, not by Ramesh's *disengagement*. A one-sentence Q&A answer is neither silence nor engagement. The system reads it as engagement and drafts from a starvation signal. The fallback never fires. Silent degradation.

**Trip-wire.** Any Q&A answer under 100 words. Any week Ramesh's cumulative Q&A input is under 500 words. Any week the critic rubric scores voice-fidelity <7 two posts in a row.

**Mitigation.** (a) **A minimum-input threshold per post.** If Q&A totals <500 words, skip the draft; email Ramesh "this week needs more input — would you rather voice-note it or skip?" (b) **Topic-dedup must be aggressive.** The scout should refuse to propose a topic Ramesh has answered in the last 90 days unless the angle is explicitly different. Brief 06's "recycle/sequel logic" was flagged as a gap in Round 2 and is not specified in Round 3. This is where it bites.

---

### F2. The North Star conversation doesn't actually get had, or gets had incompletely.

**Scenario.** Ramesh reads the 3-scenario brief. Replies: "Looks great, let's do it." Ashish, trying to respect the power dynamic, doesn't push back. Six months in, Ramesh makes a passing comment: "I thought we were gonna do paid subs eventually." Ashish realizes he built scenario C and Ramesh thought he was getting A. This is a conversation neither of them has the political capital to have cleanly: Ashish is a direct-report, Ramesh is a new boss, neither wants to admit the miscommunication. The Substack continues, with Ashish quietly adding paid-sub scaffolding on nights and weekends, pushing against his own ≤2-hr/wk budget, because the alternative is having a Friday 1:1 about it.

**Trip-wire.** Any Ramesh-reply to the 3-scenario brief that does not include the sentence "I pick (A) / (B) / (C)" verbatim. Any conversation where the word "eventually" appears paired with "monetize" or "paid."

**Mitigation.** **Force the picks.** Don't send a 3-scenario brief. Send a form with three radio buttons and a single text field. "Pick one. One-line reason." Round 3 B's current form is a trap; it rewards ambiguity and Ramesh will give ambiguous answers because he's a polite senior engineer.

---

### F3. Model churn. Kimi K3 drops on IonRouter; rubric is tuned to K2.5.

**Scenario.** August 2026: IonRouter adds `kimi-k3` and deprecates `kimi-k2.5` with 30 days notice. The model-ID assertion in Round 3 C §4a fires, pipeline halts, email goes to Ramesh. Ramesh is on PTO. Two weeks later, Ramesh updates the expected model to `kimi-k3`, assertion passes, drafts resume. But the rubric was calibrated on K2.5's stylistic quirks (it has particular em-dash patterns, particular concession cadences). K3 has different ones. The rubric isn't catching them. Voice drifts for 6 weeks before Ramesh notices a reader-comment thread saying "your newsletter feels different lately."

**Trip-wire.** Any time the expected-model map changes in config, the rubric recalibration loop should auto-fire with a recalibration-recommendation. It currently doesn't — recalibration is triggered by Ramesh's edits, not by model changes.

**Mitigation.** **Model-ID pinning includes a rubric-revalidation step.** When the pinned model changes, the pipeline runs the current rubric against a "golden set" of prior approved drafts (stored for this purpose). If the new model's critic scores diverge >1 point on any dimension, pause the pipeline until Ashish reviews. This is a 2-hour build and it prevents the highest-probability silent-voice-drift scenario in the 6-month window.

---

### F4. Interpersonal: Ramesh's Substack is behind schedule. Performance review season.

**Scenario.** Q4 2026. Ashish's mid-year Saviynt performance review is in Ramesh's hands. Ramesh's Substack has been stalled for 6 weeks — he's behind on a Saviynt launch, his Q&A input has dwindled, Thedi is pausing weekly because of the silence-detection logic. Ramesh, in the 1:1 before the review: "Hey, Thedi's been great, but the drafts I am getting feel a bit thin — could you take a look at the prompts?" This is a request that sounds innocuous and is, in context, a senior engineer asking a direct-report to spend unpaid time on the senior engineer's personal project *during performance review season*. Ashish cannot say no cleanly. He spends 6 hours on a Saturday. His Saviynt work suffers. The review, two weeks later, mentions his "strong teamwork and ownership."

This is the contractor-in-my-own-reporting-chain trap brief 07 named. It arrived not through scope creep but through a polite ask that Ashish could not refuse without political cost.

**Trip-wire.** The first Ramesh ask for Thedi work that comes within 30 days of a Saviynt performance touchpoint (review, comp cycle, promo discussion). The first time Ashish spends >4 hours on a Thedi issue in a week.

**Mitigation.** (a) **Pre-disclose the arrangement to Saviynt HR in writing.** Not just §2870 carve-out; a moonlighting disclosure naming Ramesh as the OSS user. This creates a paper trail that makes "polite ask during review season" visible as what it is. (b) **Hard recusal:** if Ramesh becomes Ashish's direct manager or comp-chain participant, the arrangement pauses, in writing. Thedi v2 should ship with a `RECUSAL.md` that says "if reporting-chain changes, this project enters read-only mode until HR reviews." This feels bureaucratic and it is precisely the protection Ashish will need.

---

### F5. Post-hoc compensation asymmetry.

**Scenario.** Month 8: Ramesh's Substack, powered by Thedi, hits 4K subs. He opens a founding-member tier. Early supporters hit him up. He's now making $800/mo on a project Ashish built and maintains. Ashish is still on ≤2-hr/wk. No money has changed hands. Ashish's feelings shift from "I built a nice OSS tool" to "I'm hosting a revenue pipeline for my boss for free." Month 10: Ramesh hits $1,500/mo. Ashish tries to bring it up casually. Ramesh, who has not thought about this because he's been busy being happy, says "Oh, I wasn't sure how you wanted to handle it — didn't you say no money changes hands?" Both are embarrassed. The conversation is now harder than it would have been in month 0.

**Trip-wire.** Any Thedi-enabled revenue Ramesh receives. The first time Ashish notices himself doing the arithmetic of "hours spent × market rate."

**Mitigation.** **In the v2 launch conversation, specify the revenue trigger now.** Brief 07's Structure A says no money flows. Amend: "If Thedi-directly-attributable revenue exceeds $X/month sustained over 3 months, we re-paper the arrangement with a lawyer." Pick X now. $500? $1000? Doesn't matter — what matters is there's a stated threshold so the conversation in month 10 is scheduled, not ambushed.

---

## What Makes Ashish Regret Building It

### G1. "My best OSS project is a productivity tool for my boss, not career work."

**Scenario.** Month 12. Ashish is up for Principal-Engineer-to-Architect at Saviynt (or a lateral to another IAM company). His GitHub profile has three pinned repos. The most-starred, most-active one is Thedi: a newsletter productivity tool for agentic-AI-in-DevOps writers. The hiring manager asks "what's the most interesting technical problem you've worked on in the last year?" Ashish talks about IAM work at Saviynt. The hiring manager scrolls his GitHub. Thedi has 200 stars. The IAM work, confidential, has none. Ashish realizes his most visible technical output was unpaid infrastructure for his manager's side hustle. The opportunity cost is not financial; it is narrative.

**Trip-wire.** The first time Ashish gets asked about Thedi in a job interview or internal promo discussion. The first time he finds himself minimizing it because he doesn't want to explain the power dynamic.

**Mitigation.** **Commit to a second OSS project *before* shipping Thedi v2.** One that is not about Ramesh, that solves Ashish's own problem, that develops his IAM/security career narrative. Thedi is allowed to exist, but it cannot be the only pinned repo. If Ashish cannot commit to a parallel project, that is a signal that Thedi is already consuming more attention than the ≤2-hr/wk budget suggests.

---

### G2. The sunk-cost "quick fix" trap.

**Scenario.** Month 3. Ramesh: "Hey, quick fix — can Thedi also draft LinkedIn posts from the Substack post? Should be 30 minutes of work." Ashish knows it's not 30 minutes. It's a new cross-post surface, a new LLM call, a new rubric, a new format constraint. It's 6 hours minimum. He says yes because (a) sunk cost — he's already built all the hard parts, (b) Ramesh is being reasonable, and (c) saying no feels disproportionate. He spends 6 hours. Month 4: "Also Twitter? Same deal, 30 min?" Month 5: "Could Thedi auto-reply to commenters in my voice?" Each ask, standalone, is reasonable. Cumulatively, the ≤2-hr/wk budget is blown by week 20 and Ashish hasn't noticed because it's been distributed across five "quick fixes."

**Trip-wire.** The word "just" in any feature request. The word "quick" in any feature request. Two features shipped within 60 days of v2 launch. Any feature request where Ramesh quotes an estimate shorter than Ashish's own gut estimate.

**Mitigation.** (a) **Feature requests go through GitHub issues, with a 14-day cooling-off period before implementation.** Not Slack, not email, not in person. The cooling-off kills the "while we're on this call" scope creep. (b) **Hard cap: zero new features in the first 90 days post-v2-launch.** Launch is the feature.

---

### G3. Principal Engineer at an IAM company running his boss's personal content pipeline.

**Scenario.** Month 15. Saviynt's CISO, in a company all-hands, announces that Saviynt is cracking down on "shadow AI" — employees using personal accounts on third-party AI services with any company-adjacent context. A town hall Q&A follows. Ramesh's Substack — which talks about agentic AI for DevOps/SRE with reference to real-world incident patterns — is running through IonRouter (Chinese-hosted models in the pool), Resend, Butterbase, and Beehiiv. It's Ramesh's personal project, but it's maintained by another Saviynt employee (Ashish), and it's topically adjacent to Saviynt's market. Someone at the town hall asks a pointed question. Ashish's name comes up in a subsequent compliance review. He is not in trouble, but he is *in a review*, which costs political capital, for a project that was never paying him.

**Trip-wire.** Any Saviynt all-hands or policy update mentioning "shadow AI," "personal side projects," "third-party LLM services," or "content created on company-adjacent topics." Any compliance-survey question about outside activities.

**Mitigation.** (a) **Pre-file the disclosure.** Brief 07 recommended it; Round 3 did not re-emphasize it. Ashish files a moonlighting + IP disclosure before any commit dated on-or-after his Saviynt start. (b) **Keep Thedi *strictly* personal-topic on Ramesh's end.** Not a code contract — a social contract in the v2 launch conversation. "If you ever reference a Saviynt customer, internal tool, or non-public roadmap detail in a Q&A answer, Thedi discards the answer and prompts for a rewrite." Round 3 A §"Privacy architecture" lists a redaction pass with a deny-list — promote that from "nice-to-have" to "pre-launch blocker."

---

### G4. The "I can rewrite this in a weekend" illusion.

**Scenario.** Month 8. Ramesh wants a feature that requires non-trivial refactoring — say, a "draft this as a thread-optimized-for-X" mode. Ashish thinks "I can do this in a weekend." It takes three weekends, because Thedi is now 18 months of accumulated decisions he's forgotten, because Butterbase has changed its function signatures twice, because the rubric system has subtle coupling to the drafter he didn't remember. At the end of the three weekends, the feature works; Ashish is behind on sleep; his Saviynt project is behind; his partner is annoyed. The ≤2-hr/wk budget has been blown three weekends in a row and Ashish only notices after the fact.

**Trip-wire.** Any time Ashish catches himself saying "I can do this in a weekend." This phrase is almost always a lie.

**Mitigation.** **Double every estimate. Refuse anything estimated above 4 hours without scoping it into multiple weekly slots that respect the budget.** If a feature requires a weekend, it requires 2-3 weeks of 2-hr slots. Saying yes to a weekend feature is saying yes to breaking the ops model.

---

## The Single Thing That Must Be True

**Ramesh must agree, in writing, before any v2 code ships, that the arrangement is: (a) OSS under Ashish's personal GitHub, (b) Ramesh runs it on his own Butterbase account with his own keys, (c) all support happens in GitHub issues with no Saviynt-channel crossover, (d) Thedi work pauses if Ramesh becomes Ashish's direct manager or on his comp chain, and (e) re-paper with a lawyer at a pre-stated revenue threshold.** If any one of those five is soft, everything else in the plan is window-dressing for unpaid contracting in a reporting chain.

---

## Summary (<250 words)

**Top three risks — one-line scenario + trip-wire each:**

1. **The installer is the plan, and its budget is optimistic.** Scenario: 90-minute install call goes sideways on OAuth/DNS/dashboard friction; Ramesh says "just host it for me"; Option 2 is reality on day 1; brief 07 collapses. Trip-wire: the pair-install runs past 2 hours *or* the sentence "I'll just finish this later" appears.

2. **Q&A fatigue at post 10 causes silent voice degradation that the fallback doesn't catch.** Scenario: Ramesh replies to Q&A with one-sentence answers; the drafter starves; critic rubric passes it anyway because the critic doesn't know the input was thin; post 10 ships flat. The voice-note fallback triggers on silence, not on one-word engagement. Trip-wire: any Q&A answer under 100 words, or two voice-fidelity scores <7 in a row.

3. **Performance-review-season "quick fix" ask from Ramesh is the trap brief 07 named.** Scenario: Q4 2026, Ramesh in 1:1 asks Ashish to "take a look at the Thedi prompts," 30 days before Ashish's Saviynt performance review. Ashish cannot say no cleanly. 6 hours disappear from his weekend, his Saviynt work slips, the review mentions "strong teamwork." The contractor-in-my-reporting-chain trap arrives through politeness, not scope creep. Trip-wire: any Thedi ask within 30 days of a Saviynt performance touchpoint.

The plan is not fine. The synthesis agent will tell you it's elegant. It is — on paper. In Ashish's actual week after starting at Saviynt, half the load-bearing assumptions are fragile.
