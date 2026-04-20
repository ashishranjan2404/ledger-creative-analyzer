# DECISION — Thedi v2

*One page. Ashish-facing. 2026-04-19. Updated post-MCP-ground-truth-sweep (amendments H1, I1, I2, J1 in [round4/thedi-v2.md](round4/thedi-v2.md)).*

> **Late correction before reading further.** A post-research MCP sweep changed three things you should know before acting on section 4 below:
> 1. **Ramesh is already a Thedi v1 user** (signed up 2026-04-19 05:22 UTC) and has already received a digest and submitted feedback asking for X/LinkedIn sources. The "coffee as first introduction" framing in the original recommendation is fiction.
> 2. **Thedi v1 was deployed last night (2026-04-18 22:42 PT) — <24h old.** The "reuse established v1 infrastructure" premise of v0 is reusing a weekend sprint, not a stable production system.
> 3. **The landing page at `thedi.butterbase.dev` promises arxiv + HN + X**; the scout only does arxiv + HN. Ramesh's "crawl X and LinkedIn" feedback isn't scope creep — he's asking for the third promised source. Fix the copy-vs-code mismatch before or at coffee.
>
> **The v0-first recommendation (section 3 below) survives all three.** The section-4 tomorrow-morning action changes: see the amended version at the bottom of this doc.

---

### 1. The question we started with

Should Ashish build Thedi v2 — a full agentic newsletter pipeline — for Ramesh, his future Principal Engineer colleague at Saviynt, and on what terms?

### 2. What 9 iterations of research surfaced

- **C1 — invert the order.** Coffee with Ramesh comes before the §2870 filing. The legal scaffolding locks scope to the wrong answer if the North Star conversation hasn't happened yet. (iter-4 red team.)
- **Voice preservation only works anchored to Ramesh's verbatim Q&A, not to exemplars.** The Sep-2025 authorship paper caps register-imitation at 19–65% without anchoring; the whole pipeline architecture is the scaffolding that raises that ceiling. (round-1 brief 02 + iter-3-A.)
- **Structural guardrails are load-bearing and non-negotiable.** OSS license + §2870 carve-out + Ramesh self-hosts + zero money flow. Any one of these missing and the arrangement collapses into unpaid contracting inside a reporting chain. (round-1 brief 07 + iter-4-B script.)
- **v0 beats v2 on 9 of 12 dimensions and dominates 80% of Ramesh-archetype probability mass.** The pipeline's wins (cadence, career-narrative) require the 10%-probability Archetype-5 Ramesh who explicitly asks to co-design. (iter-8-A.)

### 3. The decision I'd make if I were Ashish

**B — v0-first, v2-as-conditional-upgrade.** Run the minimalist counter-plan for 3 months. Upgrade to v2 only on a specific signal: Ramesh, unprompted at coffee or by month-3, asks for the pipeline by name and can articulate a concrete blocker v0 created.

The honest reason this is hard to accept: you did 9 iterations of research on v2. Most of the intellectual product of this project is a v2 artifact. Choosing B means the research's recommendation is "don't build the thing you spent 9 iterations designing." The sunk-cost gravity pulling you toward A is real, and it will get stronger at the coffee when Ramesh says something polite-sounding that your brain will pattern-match to "Archetype 5." iter-6-B gives Archetype 5 a 10% prior. Your read in the moment won't revise that prior as much as it'll feel like it does. The math says the probability he's that Ramesh is ~10%; the probability he says something at coffee that makes you *feel* like he's that Ramesh is ~50%. Those are different numbers.

The career-incentive argument (D2) cuts against A too, not for it. A pinned v2 repo is only a positive career signal if paired with a second OSS project that's structurally yours. You don't have that yet. Shipping v2 first, without the parallel project pre-committed, means the month-12 audit (iter-6-A) closes with "your only pinned repo is one built for a colleague who's also a stakeholder" — which is worse than no pinned repo. v0 buys you the time to start the parallel OSS *first*, and lets v2 get built (if it gets built) on top of a career narrative that already exists.

Cost-of-being-wrong asymmetry: if B is wrong and Ramesh was Archetype 5, you lose 3 months of pipeline cadence and build v2 in July instead of May. Recoverable. If A is wrong and Ramesh was Archetype 3 or 4, you've spent 80–120 hours, filed a letter, had a legal bill, burned seven weekends, and strained a friendship — and the pipeline runs empty. Not recoverable in the same sense. B's downside is a delay; A's downside is a mistake.

Not C, because C forecloses the 10–20% case where Ramesh genuinely wants v2 and v0 is a real bottleneck. C is cheaper but throws away option value B preserves for free.

### 4. The one thing Ashish should do tomorrow morning

*Original recommendation (pre-ground-truth):* Text Ramesh a one-line coffee invite for this week — no agenda attached, no briefing doc, no pre-read — and do not send anything else about Thedi until after that coffee happens.

*Amended post-H1/I1/J1:* **Before sending the coffee invite, spend ~2 hours fixing what the landing page promised and Ramesh asked for.** Specifically:
- (30 min) Patch the `extracted_prefs: {}` bug per I2 — tighten the prompt, log the LLM response to `audit_log`, stop silently swallowing errors in `scout_feedback_submit.ts:26-51`.
- (5 min) Choose: fix the "arxiv + HN + X" landing-page copy to match what ships, OR ship the X source (if Nitter mirrors work today) or a better substitute (Substack RSS aggregation per I2). If you can't decide in 5 minutes, update the copy now and add sources when you can.
- (15 min) Choose: add a weekly cron that invokes `scout-polish-now` at 07:00 PT, OR update the "every morning at 7 AM" copy. Either is fine; promise/delivery must align.

*Then* text Ramesh the coffee invite. Now the conversation is concrete: *"Saw your feedback about X/LinkedIn. Landing page over-promised on X and I already fixed that. Here's what source expansion actually costs and what I'd do next — wanted your read before I invest more time."* This keeps amendment C1's spirit (don't sink §2870 legal work before coffee) while acknowledging the ground truth (Ramesh is already a user; he's given feedback; he deserves a response before more plan-making).

The coffee invite text itself is unchanged — see [`iter12/I12-execution-ready-artifacts.md`](iter12/I12-execution-ready-artifacts.md) §1.

### 5. The lesson worth remembering past this project

When you're building something for a colleague who's also a stakeholder, the research answers two different questions and it's easy to confuse them: *what's the right thing to build* and *what will feel right to build.* Nine iterations of architecture work compound the second question much faster than the first. The useful artifact from this package isn't the pipeline spec; it's the archetype analysis and the v0 counter-plan, both of which arrived in iter-6 and iter-8 specifically because earlier iterations were too invested in the object being designed to see around it. Next time: run the adversarial minimalist counter-plan in iteration 2, not iteration 8. The counter-plan is not a late-stage sanity check; it's the control group the main plan needed from the start. If the counter-plan wins, you saved 6 iterations. If it loses, the main plan is stronger for having survived it early.
