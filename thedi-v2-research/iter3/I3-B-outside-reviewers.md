# I3-B — Two Outside Reviewers (fresh-eyes pass)

*Iter-3 deliverable. Two independent outside reviewers read `round4/thedi-v2.md` + iter-2 D1/D2/D3. Each is written in their own voice. No integrating third review. Where they disagree, the disagreement stands.*

---

## Reviewer 1 — The experienced technical Substacker

*Persona: I run a paid Substack on SRE/MLOps infrastructure. 150+ posts across 3.5 years. ~4,800 free subs, ~380 paid at $8/mo. I've hired two ghostwriters and fired both. My day job for six of those years was senior SRE at a big-three cloud. I read this plan on my phone on the train. Here's what I'd say if Ashish shoved it across a dinner table and asked me to be honest.*

### 1. The interview-bot pattern: better than I expected, not the win the plan thinks it is

Honestly? I came in skeptical and left moderately less skeptical. The Spiral-style Q&A-as-anchor approach is the least bad of the bad options. You are correctly dodging the thing that killed both ghostwriters I tried — pure outline-then-draft collapses into "authoritative-sounding LinkedIn voice" within three posts, and your readers catch it in six. The verbatim-anchoring trick is real.

But here's the thing the plan is not telling Ashish. The interview-bot output will not read as *Ramesh's voice*. It will read as *Ramesh-answering-an-interview prose*. Those are different registers. When I re-read posts I dictated versus posts I wrote fingers-on-keyboard, the dictated ones have a Q&A-answer cadence — longer sentences, more "so the thing about X is", more mid-paragraph hedges. That cadence is legible to readers as "this guy is explaining something on a podcast" and it is *not* the cadence of a good technical essay. A good essay has a *written* rhythm: tight claims, paragraph structure that's been rearranged, opening sentences someone stared at for 10 minutes.

The rubric dimensions the plan uses (`voice_fidelity`, `concreteness`, `slop_absence`) are fine for catching slop but they won't catch the "this sounds like a transcribed interview" failure mode. That failure mode is what killed one of my two ghostwriters — every piece he produced was directionally correct and hit every bullet we'd discussed, but it read like radio copy. My readers wouldn't have canceled over any single post; they canceled because the aggregate *register* was wrong.

**Specifically the plan should add a rubric dimension called something like `written_not_spoken_register` or `essay_cadence`.** Score it by measuring sentence-length variance, paragraph transitions (does it have hinges, or just topic changes?), and whether the opener has been *sharpened* or whether it's still the first 30 words of Ramesh's Q&A answer. The draft my better ghostwriter produced passed this test because she actually rewrote rather than polished.

Verdict: the pattern is directionally right. It is *not* a shipping pattern as specified. It needs one more pass — call it an "editing pass," not "rewriter pass" — whose job is specifically to convert Q&A cadence into essay cadence. The current rewriter is a rubric-score-driven patcher, which is a different thing.

### 2. The 4–6 Q&A cadence for 52 weeks: this burns out by week 14

The plan assumes 4–6 Socratic questions answered by Ramesh at ~150–300 words each per week. Call it 900–1,800 words of Ramesh-as-input, every week. For 52 weeks.

I did this for six weeks. Not with a bot — with an actual human editor at my Substack who would send me five questions on Thursday. I abandoned it at week seven. Not because the questions were bad; they were excellent. I abandoned it because on a Principal-Engineer Thursday evening at 9pm, the cognitive cost of producing 900-1,800 words of careful concrete answers felt *identical* to just writing the post myself, and if I'm going to spend 90 minutes of peak-brain time either way, I want the primary artifact. Answering questions to an editor — or a bot — is a lossy intermediate step that feels like homework.

The plan's "silence-fallback → voice memo" is the escape hatch and that's good. What the plan is missing is the empirical fact: **for a Principal Engineer with a real day job, voice-memo-first will rapidly become the steady state, not the fallback.** The 2-week-silence trigger for voice is way too conservative. It should be: Ramesh picks his modality per topic. Some weeks he's got 1,500 words of keyboard answers in him; some weeks he's got a 12-minute rambling voice memo from a Saturday walk. Both should be first-class inputs, not primary/fallback.

Also: the plan caps at 2 rounds of rewriter. Fine. But the *number of Q&A sessions per week* is unbounded at 4–6. In practice Ramesh will answer 2 of the 6 fully and hand-wave at 4, and the drafter will be anchored to the 2 good answers + 4 thin ones. The rubric will then flag low concreteness and the rewriter will paper over it with LLM-flavored filler. This is the cycle that produces slop in weeks 8-15 of newsletter automation projects I've watched peers abandon. **Add: adaptive question count. If Ramesh's first answer is already >400 words, stop after 3 questions. If every answer is <80 words, you're in `insufficient_material` territory already — don't try to squeeze out a 6th.**

### 3. North Star three-scenario framing: you missed the most realistic one

The three scenarios (paid, sponsor, advisory) are the three that consultants pitch. In practice, for a Principal Engineer at an IAM company, the dominant scenario is none of them. It's:

**Scenario D: Hiring funnel for Ramesh's team at Saviynt.** A senior technical Substack, written by an engineering leader at a company with open reqs, is the single most efficient funnel for senior hires in 2026. I know a director at Datadog whose newsletter has generated four full-cycle hires worth ~$2M in recruiter-fee-avoidance and ~$0 in "revenue." His CEO treats it as a P0 expense; Ramesh's CTO should do the same.

Scenario D is explosive because (a) it is *company-adjacent in exactly the way Ashish's §2870 letter has to disclaim* — the newsletter is drafting Ramesh's thought-leadership *while Ramesh is recruiting for Saviynt's agentic AI team*, which rings the "business of the employer" bell pretty loudly; (b) it is the scenario most likely to cause a Saviynt Legal head to perk up on the §2870 review, because suddenly the OSS project is generating *Saviynt hires*, which is a benefit flowing to Saviynt, which is exactly the entanglement you're trying to avoid.

**The plan must flag Scenario D and explicitly decide whether Ramesh is allowed to use Thedi in a hiring-funnel capacity.** I'd bet money this is the first real use case that emerges at month 4, and the plan has no answer for it. My advice: pick now. Either (i) explicit carve-out in the Ramesh agreement saying Thedi will not be used to route candidates to Saviynt, or (ii) explicit amendment to the §2870 letter disclosing the hiring-funnel use case upfront. Don't let this sneak up.

### 4. "Engaged-open count" is vanity-metric-adjacent in 2026

The plan talks about "engaged-opens" as a Phase 3 metric under the sponsor scenario. In 2026, between Apple Mail Privacy Protection (now 4 years deep), Gmail's click-classifier bots, and the general trend of corporate mail gateways pre-fetching links, raw open counts are *more* polluted than they were when I started in 2022.

Better leading indicators, from what I actually track:

1. **Reply rate.** A reply is a bot-proof signal. My personal rule: a post that gets >1% reply rate is working. <0.3% and something is off.
2. **Scroll-depth-weighted read-time** from Substack's native analytics (they added this late 2025). Proxy for "did they actually read it."
3. **Substack Notes restack count in the first 72 hours.** This is the growth engine in 2026 Substack. If your notes aren't being restacked, you don't grow.
4. **Paid-conversion-on-next-post**, not cumulative paid. If the last 4 posts didn't convert a single new paid sub, the voice or topic mix is wrong, *right now*, regardless of cumulative numbers.

The plan's weekly health email should surface 1, 3, and 4. Open rates can stay in the email for sentiment but Ashish should not let Ramesh make decisions off them.

### 5. What I'd do differently, having shipped 150 posts

Tactically, a few things I wish I'd known at post 1:

- **Post length: 1,800-2,400 words, not 1,200.** The plan targets 1,200. In 2026 on Substack-Notes-driven growth, the posts that get restacked are longer, denser, with at least one genuinely contrarian claim. 1,200-word posts read as "I dashed this off," and they get the scroll treatment. 1,800+ with sharp structure gets the save-for-later treatment, which converts to paid.
- **Cadence: 1 deep post every 10 days, not weekly.** Weekly on a Principal Engineer's schedule is the single most common cause of burnout-quit I've watched. Aim for 1 post/10 days; some weeks you'll do two, most weeks you'll do one, some weeks you'll skip. The plan assumes weekly as default; that's the failure cadence.
- **Introduce paid at post 15, not later, not earlier.** Earlier and you have no audience to pay; later and you've trained readers that everything is free and they resent the paywall. Post 15 is where I converted ~25 paid subs instantly from accumulated goodwill. Waiting until 50 cost me.
- **Write the first 10 posts before shipping any.** This is the single most valuable advice I'd give Ramesh. Write 10 posts in your draft folder, unpublished, then publish the first one. The backlog is the insurance policy against the week you cannot write.
- **Don't build automation until after post 10.** The plan has Ashish shipping full pipeline by post 5. I'd invert this: Ramesh writes the first 10 manually, by hand, in a plain text editor, and *then* Ashish looks at what Ramesh actually writes and builds automation to amplify it. Right now Ashish is building a factory for a product that doesn't have a stable design. Post 1-10's voice will be different from post 40's, and the rubric calibrated on the early interview-bot outputs will be wrong by post 15.

That last one is the big one. **Build the automation after the voice has stabilized, not before.** The plan inverts the natural order because Ashish is a builder and wants to build. I've watched three peers do this and all three had to rip out the pipeline in months 4-6 because the rubric was wrong, the topic selection was wrong, or the cadence was wrong.

### 6. The one thing I'd tell Ramesh before post 1

**"The first post is not the best post. Don't launch with your best idea. Launch with your second-best, and keep your best for post 4 or 5 when you'll have a small audience of early adopters who'll actually share it."**

The plan has Ramesh's first post validated by an end-to-end interview-bot run on a real Ramesh topic. That post will go out to ~12 people: Ramesh's close colleagues, Ashish, family. It should not be the strongest essay. It should be a directionally correct, 80%-quality test of the pipeline. The strongest essay — the one Ramesh has been wanting to write for two years — should be post 4 or 5, when there's an audience to carry it. Post 1 is a calibration run; treat it like one.

Relatedly: **no one launches on post 1**. The launch is post 5 when you've got backlog, rhythm, and the pipeline has survived 4 real-world failure modes. Tell everyone about the newsletter after post 5, not before post 1. The plan's "Phase 1 gate = one interview-bot run + post 1 shipped" is engineering thinking; the Substacker thinking is "Phase 1 gate = post 5 shipped, five posts in the can, one reader reply."

### Top 3 concrete changes I would make to the plan

1. **Invert the build order: Ramesh writes 10 manual posts before the pipeline ships.** Ashish builds v1-light (scout + topic-picker email only) in Phase 1; full interview-bot + drafter + critic waits until Ramesh has 10 shipped posts in his actual voice to calibrate the rubric on. Current order calibrates the rubric on interview-bot output, which is the Q&A-cadence register — not Ramesh's essay voice.

2. **Add an `essay_cadence` rubric dimension and a corresponding "editing pass" distinct from the "rewriting pass."** The rewriter is a rubric-score patcher. An editor is a register converter. These are different jobs; the plan conflates them. Concrete instrumentation: measure sentence-length variance (target std-dev >8 words for Ramesh's voice, per my own-writing calibration), paragraph transition markers, and whether paragraph 1 was sharpened or is still raw Q&A response.

3. **Flag Scenario D (hiring funnel for Ramesh's Saviynt team) now, not in month 4.** Either carve it out in the §2870 letter explicitly or bar it in the Ramesh agreement. Do not let it emerge organically — it is the specific use case most likely to blow up the §2870 story, and it is the scenario Ramesh is most likely to find attractive six months in.

---

## Reviewer 2 — California Employment Attorney (informal read)

*Persona: 15 years, Bay Area boutique employment firm, heavy IP carve-out practice. I've written op-eds warning engineers about exactly this kind of arrangement. I'm reading this between two depositions. This is not legal advice; it's a collegial read from someone who's seen this failure mode 40+ times. Where I'm speculating I'll say so. Where I'm citing, I'll cite — and `[verify]` where I'm going from memory.*

### 1. Does the §2870 carve-out letter actually do what Ashish thinks it does?

Partially. Let me be specific about what it does and does not do.

**What it does:** It creates a contemporaneous record of Ashish's position that Thedi falls within §2870(a). That record has genuine value. If litigation ever came, the letter + the pre-Saviynt git history + the personal-equipment/personal-accounts recital establishes the factual predicate for §2870 protection. California Labor Code §2872 imposes on the employer the duty to notify the employee of §2870 rights when the invention-assignment agreement is signed; the letter's Section 2 recital of §2872 is good practice and reminds Saviynt of its reciprocal duty.

**What it does NOT do, and Ashish needs to be clear-eyed about this:** *A §2870 carve-out is a statutory limit on what an employer can contractually require; it is not an employer-granted right.* Saviynt cannot "grant" a §2870 carve-out because Saviynt never had the power to assign those inventions in the first place — §2870(b) expressly voids any assignment clause that reaches beyond §2870(a). A countersignature from Saviynt Legal is *acknowledgment*, not *grant*. This matters because:

- If Saviynt *refuses* to countersign, that refusal does **not** extinguish Ashish's §2870 rights. The rights exist statutorily regardless.
- If Saviynt *does* countersign but later claims Thedi in fact relates to its business or uses its trade secrets, the countersignature is *evidence* (helpful!) but not *estoppel* (not dispositive). A judge would still look at the facts at the time of each invention.
- Conversely, if Ashish's factual recitations in the letter turn out to be inaccurate — e.g., it later emerges he used a Saviynt-issued laptop one Saturday — the carve-out's protective value on *that* specific invention collapses.

So the letter is a useful prophylactic record, not an insurance policy. Treat it as the former.

Two specific drafting concerns with the template as written:

**(a)** The 14-day countersignature deadline in Section 6 is aggressive for a corporate legal department and may read as adversarial on first contact. I'd soften to 30 days with a gentler follow-up cadence. 14 days is the kind of number that gets a letter kicked to outside counsel, which doubles the cost and halves the chance of a clean result. You want Saviynt's in-house legal team to handle this over coffee, not escalate it.

**(b)** Attachment C, the disclosure of Ramesh as a user, is where I'd push hardest. The letter currently reveals Ramesh's name in Attachment C and in Section 6's closing paragraph. This reveal, at the moment of first contact with Saviynt Legal, is strategically risky. Saviynt Legal reading "the only user is a colleague who is also an engineering leader at your company" will treat this letter very differently than a letter that discloses only "I have an OSS project." My recommendation would be to keep the §2870 letter *purely about the IP scope* and file the Outside Activities / Moonlighting disclosure with Ramesh's name as a *separate, parallel* filing to HR (not Legal) on the same day. Two letters, two purposes, two audiences. The current template fuses them and exposes Ramesh's name to the audience most likely to object.

### 2. Saviynt Legal's strongest refusal argument: "demonstrably anticipated R&D"

This is the one the plan correctly identifies but underweights.

§2870(a)(1) carves *out* of §2870's protection any invention that "relates at the time of conception... to the employer's business, or to the employer's actual or demonstrably anticipated research or development." Saviynt sells IAM/IGA/PAM; the product-category argument that Thedi (a Substack authoring tool) is in a different category is reasonable. But "demonstrably anticipated R&D" is the gotcha.

Saviynt, like every major enterprise security vendor in 2026, has a publicly stated "AI strategy" and almost certainly has internal R&D pushing into **agentic AI for identity workflows** — autonomous agents managing access requests, AI-driven anomaly detection, LLM-powered policy authoring. If any of that is on an internal roadmap deck, a sufficiently motivated Saviynt Legal could argue that Thedi's *technical subject matter* — agentic pipelines, LLM orchestration, model routing — is "demonstrably anticipated R&D" within the meaning of §2870(a)(1) regardless of product-category distinction.

The leading California case line on this is *Cadence Design Systems v. Bhandari*, N.D. Cal. 2007 `[verify — going from memory]`, which held that an employee's side project implementing the same *technique* as the employer's R&D fell outside §2870 even though the end product was in a different market. The reasoning: §2870(a)(1) turns on relation to "research or development," not to the product. An agentic-AI-pipeline side project, developed by an employee of a company with an agentic-AI roadmap, is the textbook fact pattern that line of cases addresses.

**What this means for Ashish:** the "product category" argument in Section 4(c) of the letter is necessary but not sufficient. The letter should *also* argue that Thedi's technical subject matter (newsletter-author Q&A drafting) is not within the technical scope of Saviynt's R&D, by affirmatively describing what that scope *is not* — e.g., Thedi does not interact with identity data, access decisions, authorization graphs, credential vaults, session management, or any of the categories Saviynt R&D actually works on.

**Recommended pre-emptive language**, to drop into Section 4(c):

> "For the avoidance of doubt, Thedi does not process, generate, manage, or make decisions about: identity data; access credentials; authorization policy; entitlements; privileged sessions; authentication events; or any other category within the technical scope of Identity and Access Management. Its subject matter — automated assistance to a single newsletter author in drafting prose from the author's own verbatim input — is technically orthogonal to Saviynt's research and development program regardless of both parties' incidental use of large language models."

That last clause — "regardless of both parties' incidental use of large language models" — is load-bearing. LLMs are a shared tool. A dishwasher and a laboratory centrifuge both use electric motors; neither is "research or development" in the other's field. The letter needs to say this explicitly because without it, the "we both use LLMs" argument will be the first thing a hostile reading lands on.

### 3. The 5-point agreement with Ramesh: contract, gentleman's agreement, or mush?

Mush, mostly, and that's probably fine — but the plan should know which parts are enforceable and which are aspirational. Going point by point:

- **Point 1 (OSS under Ashish's personal GitHub, MIT).** This is enforceable. It's a statement of ownership + license choice; it creates a unilateral grant to Ramesh (and the world) under MIT. Solid.
- **Point 2 (Ramesh runs his own account).** Enforceable in the sense that if Ashish doesn't actually hold keys, there's nothing to breach. The *operational* protection is real. The *contractual* protection is weak, but not needed.
- **Point 3 (GitHub issues only; no Saviynt-channel crossover).** This is a gentleman's agreement with zero contractual force. There's no consideration flowing to bind Ramesh; there's no damages remedy if violated; an employment-law claim arising from an in-office conversation wouldn't care what a GitHub-issue rule said. Its value is *norm-setting and evidence* — if Ramesh later claims "we agreed this was work," point 3 is contemporaneous evidence they didn't. That's real evidentiary value, but don't mistake it for enforceable.
- **Point 4 (recusal if reporting-chain change).** Same as point 3 — gentleman's agreement, norm-setting, evidentiary. The actual recusal mechanism in `RECUSAL.md` has some teeth (see §4 below) but the commitment *to* the mechanism is aspirational.
- **Point 5 (re-paper at $500/mo revenue threshold).** This is a *promise to negotiate*, which California courts generally do not enforce as contracts (*Copeland v. Baskin Robbins U.S.A.*, 96 Cal.App.4th 1251 (2002) `[verify]`). Its value is entirely the evidentiary record that both parties contemplated a re-papering trigger.

A version that is *both* stronger legally and *not* more bureaucratic-feeling: turn this from a 5-point email-reply into a **two-paragraph Mutual Understanding Memo**, signed by both parties (or formally emailed with "I acknowledge and agree" language), with the five points collapsed into two operational commitments: (1) Ashish's ownership/license commitments, and (2) the norms-and-triggers (channels, recusal, re-paper threshold). The signature format — "I acknowledge and agree" in the reply — is the one upgrade I'd push. A reply of "yes" to a long email is weaker evidence than a reply that restates the commitment. Not because a court would be confused, but because a lawyer reviewing it years later will be.

The plan's "emailed 'yes' reply is sufficient" is almost right. Make it "a reply of 'I agree' is sufficient."

### 4. `RECUSAL.md` as a legal artifact: performative or load-bearing?

A markdown file in a public GitHub repo has **zero direct legal weight.** It is not a contract, not a regulation, not a policy. It binds Ashish the same way a New Year's resolution binds him: entirely on his own good faith.

That said, it has real *evidentiary* and *ethical* weight, both of which can matter:

- **Evidentiary:** If Ramesh ever became Ashish's manager and Ashish then sued for (hypothetically) retaliation or unfair treatment, `RECUSAL.md` committed on day one is contemporaneous evidence that both parties recognized the conflict risk and chose a mitigation. That's useful.
- **Ethical/HR:** If Saviynt's ethics committee ever reviewed the arrangement, `RECUSAL.md` demonstrates pre-emptive mitigation. That matters for "willful misconduct" determinations and for whether the employer was on notice.

**What would make it load-bearing (or closer to it):**

1. **Reference it in the §2870 letter as a binding representation to Saviynt.** If Ashish says in the letter "I have committed, publicly and in writing, to the recusal protocol in [URL]" — that makes the commitment *to Saviynt*, not merely to himself, and creates a basis for Saviynt to act in reliance. That transforms it from self-help into a representation.
2. **Add a provision that HR/Saviynt may enforce the recusal** directly — i.e., Ashish grants Saviynt the right to inspect the repo and confirm archival status if the trigger fires. This third-party-beneficiary framing gives the recusal an enforcement mechanism beyond Ashish's own willingness.
3. **Commit `RECUSAL.md` in an initial commit signed with a PGP key** (GitHub's verified-commit flag). Prevents a "he amended it later" argument. A signed commit is a genuinely durable timestamp.

The current draft is closer to performative than load-bearing. Doing those three things — especially #1 — moves it into real territory.

### 5. The $500/mo revenue threshold: enforceability, taxes, conflict-of-interest

Three separate issues bundled together.

**(a) Enforceability.** As noted above, a promise to negotiate is not enforceable in California. The $500 threshold is aspirational. Its value is the evidentiary record. Fine — treat it as such.

**(b) Taxation.** This one the plan does miss. Any revenue Ramesh generates from Thedi is Ramesh's income, taxable to Ramesh. But watch for two tax gotchas:

- **If the §2870 carve-out is granted, and Ramesh later *gives* money to Ashish** (hackathon splits, "thank-you" payments, etc.), that is potentially a gift subject to federal gift-tax rules above the annual exclusion (~$18,000 in 2026 `[verify]`). More importantly, gifts from supervisors to supervisees — even modest ones — trigger most large-cap companies' conflict-of-interest policies. Saviynt likely has such a policy `[depends on Saviynt's actual COI policy]`.
- **If money flows *the other way* — Ramesh pays Ashish** — that's unambiguous independent-contractor income taxable to Ashish, and Ashish would owe self-employment tax. Also: if Ramesh pays Ashish for work while they are both Saviynt employees, Saviynt's Outside Activities policy almost certainly requires disclosure *of the payment*, not just the activity. The current Outside Activities disclosure mentioned in the §2870 letter's Section 6 discloses the *relationship* but the plan's current structure says "no money flows." If that ever becomes false — and the $500/mo threshold contemplates exactly that — **the disclosure must be updated, in writing, before the first dollar moves.**

**(c) Conflict-of-interest policy interaction.** This is the one I'd flag hardest. Most large-cap tech companies' COI policies have a "gifts, benefits, and side arrangements with co-workers" clause that requires disclosure of any arrangement where a coworker derives economic benefit from another coworker's personal activity. The plan's current "no money flows" framing satisfies this. The $500/mo threshold *explicitly contemplates a future state where the framing no longer holds.*

**Recommendation:** add to the 5-point agreement a sixth point or a sub-clause: "At the moment revenue begins flowing to either party in connection with Thedi, the Saviynt Outside Activities disclosure will be updated and re-filed before receipt of any funds." That single sentence fixes the COI exposure without requiring the plan to have all the tax details figured out.

### 6. Practice-of-law and ethics gotchas the plan missed

Three that jumped out:

**(a) No unauthorized practice of law.** Ashish drafting the §2870 letter for his own use is fine — anyone can draft their own legal correspondence. Ashish using the same template for other people (e.g., open-sourcing it on the Thedi repo under `/templates/`) starts to edge toward unauthorized practice of law if distributed as legal advice. **Don't open-source the §2870 letter template.** Keep it private; let other people get their own lawyer.

**(b) Fair Labor Standards Act — probably a non-issue here, but.** If Ashish's Saviynt role is hourly/non-exempt (unlikely for an engineer but possible), hours spent debugging Thedi in response to Ramesh-the-user requests could, in an edge case, be recharacterized as hours worked for Saviynt by a motivated plaintiff's attorney — specifically if the argument is that Ramesh is a supervisor directing those hours. The plan's GitHub-issues-only channel + "no Saviynt-channel crossover" rule is exactly the right mitigation. Keep that rule absolute. If Ashish is exempt (nearly certain) this entire issue dissolves, but the operational hygiene matters regardless.

**(c) California Business & Professions Code §16600 / non-compete.** Saviynt's employment agreement almost certainly has non-compete or non-solicit language. §16600 voids most non-compete clauses in California, but non-solicit of customers/employees is variably enforceable. Thedi's current architecture doesn't touch this. **Thedi's hiring-funnel use case (see Reviewer 1, Scenario D) would.** If Ramesh ever uses Thedi to attract candidates to Saviynt, that's fine (he's soliciting for Saviynt). If Ramesh ever leaves Saviynt and Thedi readers follow him, some portion of those readers may fall under a non-solicit clause — especially if any of them are Saviynt customers. This is a 3+ year concern, not a Phase 1 concern, but flag it.

### 7. The one amendment I'd insist on before anything is filed

**Separate the §2870 letter from the Ramesh-user disclosure. File §2870 first, with no mention of Ramesh by name. File the Outside Activities disclosure separately, same day, with HR (not Legal), naming Ramesh and the guardrails.**

The current plan fuses them. That fusion is the single biggest strategic error in D3. Saviynt Legal's job is to protect Saviynt's IP. Reading "I have an OSS project" triggers a low-stakes review. Reading "I have an OSS project AND its single user is a colleague who is also a candidate for manager-level responsibilities at your company" triggers a different, higher-stakes review. These two facts should be disclosed, both of them, but to *different audiences* at *different desks*, because their combination in a single letter reads as either a negotiation ("what will you let me do") or a hidden conflict ("why is he telling us this together"). Neither reading helps Ashish.

The separation is cheap (write two letters instead of one), preserves full disclosure, and routes each fact to the team whose actual job it is to adjudicate that fact.

### Top 3 concrete changes I would make to the plan

1. **Split the §2870 letter from the Outside Activities / Ramesh-as-user disclosure.** Two letters, two audiences (Legal vs. HR), same day, full disclosure — but not fused. The current fused draft exposes Ramesh's name to the worst possible first reader.

2. **Add the "technical subject matter is orthogonal to IAM" language (§2 above) and the "incidental use of LLMs does not constitute subject-matter overlap" disclaimer to the §2870 letter Section 4(c).** The current product-category argument is necessary but not sufficient against a "demonstrably anticipated R&D" attack under §2870(a)(1).

3. **Add a sixth point (or sub-clause on point 5) to the Ramesh agreement: "Before any dollar flows, update and re-file the Saviynt Outside Activities disclosure in writing."** The $500/mo trigger currently contemplates a future state where "no money flows" becomes false; there must be a written-disclosure-before-money gate, independent of the re-papering conversation.

---

*End of I3-B. Two reviewers, two voices, no integrating summary. They overlap on the point that the plan underestimates Scenario D / hiring-funnel use case and its entanglement risk; they disagree on tempo (Reviewer 1 wants Ashish to slow down and let Ramesh write 10 posts manually first; Reviewer 2 wants Ashish to move faster and fix the letter before any commit). The disagreement is real and surfaced; the iter-3 synthesis can decide.*
