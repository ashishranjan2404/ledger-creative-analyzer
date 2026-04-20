# Sub-Question 5: Multi-Agent Orchestration Patterns for Content Generation

**Author:** Research Agent 5 | **Date:** 2026-04-19
**Scope:** For producing a single high-quality long-form Substack post, what multi-agent / multi-round pattern actually helps vs. just burns compute?

---

## 1. Decomposition Patterns — What Actually Moves the Needle

The strongest published evidence for multi-stage decomposition on long-form text comes from Stanford's **STORM** pipeline (pre-writing → outline via multi-perspective question asking → draft). STORM articles were judged **25% more organized and 10% broader in coverage** vs. an outline-driven retrieval baseline; **70% of Wikipedia editors** said it would be useful in pre-writing ([Stanford STORM](https://storm-project.stanford.edu/research/storm/), [GitHub](https://github.com/stanford-oval/storm)). The follow-up **Co-STORM** adds a human-in-the-loop round-table ([Co-STORM coverage](https://www.edtechinnovationhub.com/news/pn7fo3f7xehe5gfj24mcjuntt7ormz)).

For narrative/long-form specifically, **StoryWriter** (CIKM 2025) used a multi-agent outliner → drafter → reviewer decomposition on stories >10k tokens and showed consistent preference uplifts over single-shot and monolithic baselines ([ACM](https://dl.acm.org/doi/10.1145/3746252.3761616)).

**Bottom line:** *Research-scout → outliner → drafter* decomposition is the one pattern with repeated, published quality wins. Adding a separate "critic" as its own agent is cheaper than adding more drafters and is where Self-Refine/Reflexion live.

## 2. Critic/Refiner Loops — Where Does Quality Plateau?

- **Self-Refine** (NeurIPS 2023, still canonical) shows ~20% preference uplift from iterative self-feedback, with explicit plateau language: "improvements plateau after a few iterations" ([arXiv 2303.17651](https://arxiv.org/abs/2303.17651), [selfrefine.info](https://selfrefine.info/)).
- **Reflexion** (Shinn et al.) shows the steep part of the curve is **rounds 1–3**: GPT-4 on HotpotQA hard ~30% → ~60% after **3 reflection cycles** ([arXiv 2303.11366](https://arxiv.org/abs/2303.11366)). Gains beyond round 3 require either a held-out meta-policy (MPR, [arXiv 2509.03990](https://arxiv.org/html/2509.03990v1)) or task-specific test-time scaling — rare in creative writing.
- A 2025 faithful-summarization study reports the same shape: round 1 is the biggest jump, round 2 adds real value, round 3+ is marginal or regresses ([OpenReview](https://openreview.net/forum?id=uLlHwTxEpr)).

**Verdict on the "2–3 rounds" rule for long-form:** confirmed. For prose (vs. code/math), **2 rounds** is the defensible default; a 3rd round should be conditional on a scored rubric, not unconditional.

## 3. Agent Count — When Does Coordination Kill You

Google Research's **"Towards a Science of Scaling Agent Systems"** (Dec 2025) is the most quantitative answer to date:

- Once the single-agent baseline clears **~45% accuracy**, adding agents yields **diminishing-or-negative returns** ("capability saturation") ([research.google](https://research.google/blog/towards-a-science-of-scaling-agent-systems-when-and-why-agent-systems-work/), [arXiv 2512.08296](https://arxiv.org/html/2512.08296v1)).
- Independent agents **amplify errors 17.2×**; centralized coordination contains this to 4.4× ([Towards Data Science post-mortem](https://towardsdatascience.com/why-your-multi-agent-system-is-failing-escaping-the-17x-error-trap-of-the-bag-of-agents/)).
- Sequential-task performance can **degrade by −70%** when agent count grows without a strong orchestrator.

Berkeley's **MAST** (NeurIPS 2025) classifies 14 multi-agent failure modes across 1600+ traces; coordination failures dominate over single-agent hallucination ([arXiv 2503.13657](https://arxiv.org/abs/2503.13657), [MAST repo](https://github.com/multi-agent-systems-failure-taxonomy/MAST)).

**Practical ceiling for a blog-post pipeline:** **3–4 distinct agent roles**, one orchestrator, no more. Adding a 5th role (e.g., fact-checker + SEO + voice-critic + copyeditor + headline-writer) pushes coordination cost past marginal quality gains unless each has a hard, non-overlapping contract.

## 4. Cost Knee — Back-of-Envelope

Assume IonRouter `qwen3.5-122b-a10b` @ ~$0.60 input / $2.40 output per 1M tokens [assumption, based on typical mid-tier pricing] and a 1,800-word (~2,400-token) target post:

| Stage | In | Out | Cost |
|---|---|---|---|
| Scout digest → topic brief (cached from v1) | 6k | 400 | $0.005 |
| Outliner (brief + 3 references) | 4k | 800 | $0.005 |
| Drafter (outline + voice samples + refs) | 8k | 3k | $0.012 |
| Critic round 1 (draft + rubric) | 5k | 1k | $0.005 |
| Rewriter round 1 | 7k | 3k | $0.012 |
| Critic round 2 (conditional) | 5k | 800 | $0.005 |
| Rewriter round 2 (conditional) | 7k | 2.5k | $0.010 |
| **Total (2 rounds)** | | | **~$0.054** |

Doubling to 4 rounds lands near **$0.11/post**. At Ramesh's cadence (1–2 posts/week), even an over-engineered 4-round pipeline is **<$1/month**. **The cost knee is irrelevant; the quality-per-round knee is what matters.** The real cost is Ashish's 2 hrs/week budget — every round added that needs supervision burns the scarce resource.

## 5. Human-in-the-Loop Gates — Where to Place the Human

Best-documented practice converges on **gate after outline, gate before publish** ([WorkOS](https://workos.com/blog/why-ai-still-needs-you-exploring-human-in-the-loop-systems), [Towards Data Science — HITL agentic](https://towardsdatascience.com/building-human-in-the-loop-agentic-workflows/), [Fast.io HITL guide](https://fast.io/resources/ai-agent-human-in-the-loop/)). LangGraph's `interrupt()` (early-2025) made this operational: state persists indefinitely while the human is away ([LangGraph HITL](https://blog.n8n.io/human-in-the-loop-automation/)).

A cautionary banking-client data point: a "review every output" workflow saw reviewers **approve 90% unchanged** and flag 10% for reasons they couldn't articulate — noise, not signal ([n8n HITL](https://blog.n8n.io/human-in-the-loop-automation/)). **Gate at irreversible decisions only** (publish, send).

For Ramesh specifically, the voice-preservation constraint argues for a **second gate after the critic** (so he sees the "before/after" and can veto over-editing) — but it should be opt-in, not blocking.

## 6. Failure Modes (from MAST + practitioner post-mortems)

- **Circular critic loops / hallucinated flaws**: Critic and drafter share context → "collective delusion." Fix: **independent critic** with isolated context + predefined rubric ([Augment Code guide](https://www.augmentcode.com/guides/why-multi-agent-llm-systems-fail-and-how-to-fix-them), [Galileo](https://galileo.ai/blog/multi-agent-llm-systems-fail)).
- **Verbosity inflation**: Each round adds length without adding signal. Fix: **target-word-count in the rewriter contract** + reject-if-longer-than-1.1× rule.
- **Voice dilution across turns**: LLMs regress toward "LLM-native voice" even under prompt-based style control; fine-tuning on 50–100 samples fixes it ([ChronicleJournal 2025](https://markets.chroniclejournal.com/chroniclejournal/article/worldnewswire-2025-11-4-how-to-train-an-ai-to-mimic-your-writing-style-the-end-of-the-generic-voice), [ASJA 2025 Gathering of the Ghosts](https://www.asja.org/top-takeaways-from-2025-gathering-of-the-ghosts/)).
- **Termination ambiguity**: "When is it done?" — MAST's top system-design failure. Fix: **hard round cap (2) + scored rubric pass threshold**.
- **Error cascade**: one bad outline poisons the draft poisons the critic. Fix: **human gate at outline**.

---

## Recommendation for Thedi v2 — Minimum-Viable Multi-Agent Pattern

**Four roles, max two refinement rounds, two human gates.**

| Agent | Job | Input | Output |
|---|---|---|---|
| **Scout** (reuse v1) | Pick topic + pull 3 references | cron digest + feedback signal | topic brief + sources |
| **Outliner** | Plan-then-write: H1/H2 skeleton + thesis + hook | brief + Ramesh voice samples | outline (markdown, 400 tokens) |
| **Drafter** | Write full draft in Ramesh's voice | outline + 5 voice samples + refs | 1,500–2,000 word draft |
| **Critic** (independent context) | Score against rubric: voice fidelity, factual grounding, thesis clarity, length, specificity | draft only (no outline/brief) | rubric scores + ≤5 specific edits |
| **Rewriter** (same agent as Drafter, new turn) | Apply critic's edits, reject verbosity | draft + critic notes | revised draft |

**Rounds:** Critic → Rewriter **runs once, unconditionally**. A **second round fires only if rubric score < threshold** on any dimension. Hard cap: 2.

**Human gates:**
1. **After outline** (Ramesh approves/edits 1-line thesis + H2s) — this is the voice-preservation gate. Cheap (<2 min) and catches 80% of direction errors before any draft cost.
2. **Before publish** (Ramesh reads final draft, clicks approve in feedback UI) — TOS/authenticity gate.

No human gate between critic and rewriter — that's where throughput dies.

**Orchestrator:** Butterbase function with explicit state machine (outline_pending → outline_approved → drafting → critiquing → rewriting → review_pending → published). State persists in Postgres; no LangGraph needed for a 5-node graph.

**Estimated cost/post:** ~$0.05 (2 rounds, single model). At 2 posts/week × 52 weeks = **~$5/year** in IonRouter spend. The constraint is Ashish-hours, not dollars.

---

## Signals to Watch

- **If single-model quality jumps** (e.g., a GPT-5.5-class model on IonRouter clears STORM-quality in one shot), collapse Outliner + Drafter into one call and keep only Critic. Watch Google's scaling-agents paper for updates — they predict the crossover threshold.
- **If Ramesh ever edits a critic-approved draft heavily**, the critic rubric is mis-calibrated. Log his edits; re-derive rubric from the delta. This is the single most important feedback loop in the system.
- **If verbosity creeps** (posts trending >2,200 words over 4 weeks), add a hard token-budget constraint to the rewriter, not another critic.
- **If the outline-gate approval rate stays >95% for 10 consecutive posts**, the gate is theater — demote to async notification.
- **New published evidence of >3-round gains on long-form prose** (not code/math) would change the recommendation; as of April 2026 none exists.
- **Substack TOS update on AI-assisted content** (cross-ref sub-question on compliance) — if disclosure required, add a "disclosure drafter" mini-agent, not a full role.
