# Thedi v2 — IonRouter Model Selection per Pipeline Stage

**Author:** Research Agent 6 • **Date:** 2026-04-19 • **Audience:** senior engineers

## TL;DR

Thedi v1 used `qwen3.5-122b-a10b` for every stage. For v2 we split the pipeline
into four stages with different quality/cost profiles and recommend three
different IonRouter models plus a voice-critical escape hatch.

| Stage | Recommended | Fallback | Rationale | Est. $ / 1.2k-word post |
|---|---|---|---|---|
| 1. Research synthesis (20 papers → themes) | **`qwen3.5-122b-a10b`** | `kimi-k2.5` | 991K–1M ctx fits 20 abstracts + full-text excerpts; strong structured-output; cheapest long-ctx on IonRouter ([Artificial Analysis](https://artificialanalysis.ai/models/qwen3-5-122b-a10b), [maniac.ai](https://www.maniac.ai/blog/chinese-frontier-models-compared-glm5-minimax-kimi-qwen)) | ~$0.012 |
| 2. Outline generation | **`glm-5`** | `kimi-k2.5` | GLM-5 scored highest (9.0/10) on structured-output dual-judge eval and is explicitly called out for "all sections addressed completely" — exactly what an outline needs ([ai-crucible.com](https://ai-crucible.com/articles/chinese-ai-models-feb-2026-glm-4-7-vs-qwen-3-5-vs-kimi-k2-5/)) | ~$0.006 |
| 3. Prose drafting | **`kimi-k2.5`** | `glm-5` | Best Chinese-model EQ-Bench Creative score at 1,663.8 (~87% of Claude Sonnet 4.6 at ~1/5 the cost); "novel frameworks and operational tools" tracks with Ramesh's voice-driven posts ([evy.so](https://evy.so/compare/best-llms-for-writing/), [ai-crucible.com](https://ai-crucible.com/articles/chinese-ai-models-feb-2026-glm-4-7-vs-qwen-3-5-vs-kimi-k2-5/)) | ~$0.018 |
| 4. Critique / editorial loop | **`gpt-oss-120b`** | `qwen3.5-122b-a10b` | $0.02/$0.095 per M is 20× cheaper than Kimi; critique is a short-output classification+diff task where a competent mid-tier model is adequate ([ionrouter.io](https://ionrouter.io/)) | ~$0.0008 |

**Total est. cost per post: ~$0.037** (vs v1 baseline ~$0.028 all-Qwen; we pay
~+$0.01 for measurable quality at the drafting step, which is the voice-critical
stage).

---

## 1. IonRouter catalog (as of 2026-04-19)

IonRouter is operated by Cumulus Labs on NVIDIA Grace/B200 silicon using their
proprietary "IonAttention" inference engine; they advertise "~half market rate"
vs OpenRouter for equivalent open-weight models ([Product Hunt](https://www.producthunt.com/products/ionrouter-by-cumulus-labs)).
There is **no public API reference page that lists every model**; the landing page
at [ionrouter.io](https://ionrouter.io/) shows the catalog below but hints at
"9+ language models" total. Anthropic/OpenAI frontier models do **not** appear to
be routed through IonRouter — it is an open-weight / Chinese-frontier gateway.
Treat any assumption that Claude/GPT-5 is reachable via IonRouter as
`[assumption: false — verify with Cumulus before designing around it]`.

| Model | Provider | Input $/M | Output $/M | Throughput | Context | Notes |
|---|---|---|---|---|---|---|
| `glm-5` | ZhiPu AI | $1.20 | $3.50 | ~220 tok/s | 137K | 600B+ MoE flagship, EAGLE speculative decoding ([ionrouter.io](https://ionrouter.io/)) |
| `kimi-k2.5` | Moonshot AI | $0.20 | $1.60 | ~120 tok/s | 262K | MoE reasoning; creative writing leader among OSS ([maniac.ai](https://www.maniac.ai/blog/chinese-frontier-models-compared-glm5-minimax-kimi-qwen)) |
| `minimax-m2.5` | MiniMax | $0.40 | $1.50 | ~120 tok/s | ~200K | SWE-bench 70.4% (M2.7 → 73.8%) |
| `qwen3.5-122b-a10b` | Alibaba/Cumulus | $0.20 | $1.60 | ~120 tok/s | 262K → 1M | 122B MoE, 10B active, 256 experts; current v1 default ([HF card](https://huggingface.co/Qwen/Qwen3.5-122B-A10B)) |
| `gpt-oss-120b` | OpenAI (open release) | $0.020 | $0.095 | ~100 tok/s | ~128K `[assumption]` | 60× cheaper than Kimi; aimed at cheap bulk inference ([ionrouter.io](https://ionrouter.io/)) |

**Reference points not on IonRouter** (useful as upper-bound quality anchors, not
as candidates): Claude Sonnet 4.6 at $3/$15 ([Vellum](https://www.vellum.ai/llm-leaderboard))
leads EQ-Bench Creative at 1,937.7; Claude Opus 4.7 at $5/$25 with 1M context
and 87.6% SWE-bench ([Vellum](https://www.vellum.ai/llm-leaderboard)). DeepSeek
V3.2 and Llama 4 Scout/Maverick are not listed on IonRouter's public catalog as
of this date.

## 2. Per-stage reasoning

### Stage 1 — Research synthesis (20-paper digest → key themes)
Input is ~40K–80K tokens (paper abstracts + selected full-text). Quality bar is
"don't drop citations, group by theme." Qwen 3.5-122B-A10B's 991K–1M context,
structured-output discipline, and $0.20/$1.60 pricing dominate this stage.
Kimi K2.5 is interchangeable on quality and ties on price, kept as fallback.

### Stage 2 — Outline generation
Input ~4K, output ~2K. Needs rigid structure (H1/H2/H3 + target word counts per
section) and voice-awareness on topic framing. GLM-5 explicitly wins on
"comprehensive, structured outputs with perfect completeness" per the AI
Crucible dual-judge eval (9.0/10 vs Kimi 8.8 vs Qwen 8.6) ([ai-crucible.com](https://ai-crucible.com/articles/chinese-ai-models-feb-2026-glm-4-7-vs-qwen-3-5-vs-kimi-k2-5/)).
GLM-5 is 6× pricier per output token than Kimi, but the stage emits only ~2K
tokens — total delta is ~$0.004/post, negligible.

### Stage 3 — Prose drafting
This is the voice-critical stage. Hard constraint from the Thedi brief: "Voice
preservation is load-bearing … AI-dilution failure would kill the Substack
before it starts." EQ-Bench Creative Writing is the best proxy we have for
voice-preservation quality; among IonRouter-available models Kimi K2.5 leads
at 1,663.8, with GLM-5 at 1,626.9 and Qwen 3-235B at 1,459 ([evy.so](https://evy.so/compare/best-llms-for-writing/)).
Kimi K2.5 recommended; GLM-5 fallback.

**Escape hatch** `[assumption]`: for the first 3–5 posts while we calibrate
voice, Ashish should A/B draft-stage output against Claude Sonnet 4.6 via the
direct Anthropic API (not IonRouter). At 1,937.7 EQ-Bench vs Kimi's 1,663.8,
Sonnet 4.6 is meaningfully stronger on narrative quality ([evy.so](https://evy.so/compare/best-llms-for-writing/))
— cost delta is ~$0.045/post, trivial given the stakes. Once the voice-guide
prompt is tuned, fall back to Kimi for ongoing runs.

### Stage 4 — Critique / editorial loop
Short input (the draft), short output (diff-style suggestions). Judgment
sharpness matters more than prose quality. `gpt-oss-120b` at $0.020/$0.095 is
20–60× cheaper than the alternatives — use it as the default critic and run
2–3 rounds for the same cost as one Kimi round. Qwen 3.5 is the fallback if
gpt-oss-120b produces low-signal critiques.

## 3. Evaluation harness (spec)

Since no local IonRouter key is available, the following is a spec for a
Butterbase function `fn_eval_model_stage` that Ashish can implement in ~30 min
once credentials are provisioned.

```
FUNCTION fn_eval_model_stage
ENV: IONROUTER_API_KEY, ANTHROPIC_API_KEY (for judge)
TABLES (new):
  eval_runs        (id, created_at, stage, model, prompt_id, input_tokens,
                    output_tokens, latency_ms, cost_usd, raw_output)
  eval_scores      (run_id, rubric_dim, score_0_10, judge_reasoning)
  eval_prompts     (id, stage, name, system_prompt, user_input, reference_out)

INPUT (JSON):
  stage: "research" | "outline" | "draft" | "critique"
  models: ["kimi-k2.5", "qwen3.5-122b-a10b", "glm-5", "gpt-oss-120b",
           "minimax-m2.5"]
  prompt_ids: [list of eval_prompts.id for this stage]
  judge: "claude-sonnet-4-6"   # fixed — not an IonRouter model
  rounds: 1

FIXED PROMPT SET (seed into eval_prompts):
  stage=research:
    - R1 "20 arxiv abstracts on LLM agents for SRE → group into 4 themes"
    - R2 "60K-token cluster of incident post-mortems → extract reusable patterns"
    - R3 "heterogeneous feed (10 HN + 10 arxiv) → deduplicate & tag by novelty"
  stage=outline:
    - O1 "theme pack → 1,200-word post outline with H1/H2/H3 + word targets"
    - O2 "theme pack + Ramesh voice-guide → outline in his cadence"
    - O3 "recycle-a-topic: given 3 prior posts, outline a non-redundant sequel"
  stage=draft:
    - D1 "expand outline O1 to full 1,200-word draft"
    - D2 "same outline, but voice-matched to a 2K-word Ramesh sample"
    - D3 "technical explainer: kubernetes operator for LLM autoscaling"
    (each must include 3 voice fingerprints: em-dash tolerance,
     second-person asides, concrete code snippets)
  stage=critique:
    - C1 "flag AI-slop phrases in this draft + propose 5 cuts"
    - C2 "score draft on: concreteness, voice-fidelity, factual-grounding"
    - C3 "identify 3 places where the author could add a dissenting note"

EXECUTION:
  FOR each (model, prompt):
    call IonRouter /v1/chat/completions with prompt.system+user
    record latency, token counts, output
    compute cost = input_tokens * price_in + output_tokens * price_out
    INSERT eval_runs

SCORING (LLM-as-judge, claude-sonnet-4-6 via Anthropic direct):
  Rubric dimensions (score 0–10 each):
    research stage:
      - theme_coverage, citation_fidelity, dedup_quality, structure_adherence
    outline stage:
      - completeness, voice_match, specificity, structure_adherence
    draft stage:
      - voice_fidelity (weighted 2x), factual_accuracy, concreteness,
        flow_coherence, slop_absence
    critique stage:
      - signal_density, false_positive_rate (inverted),
        actionability, style_neutrality

  Judge prompt: "You are reviewing model output for Ramesh Nampalli's Substack
  on agentic AI in DevOps/SRE. Ramesh's voice is: [canonical 500-word sample].
  Score the following output on {dim}. Return JSON: {score, reasoning}."
  INSERT eval_scores

OUTPUT:
  aggregate per (stage, model): mean scores, total cost, p50/p95 latency
  write to table eval_leaderboard materialized view
  surface via /admin/evals UI (reuse Thedi v1 feedback UI shell)

DECISION RULE:
  For each stage, pick model with highest
    composite = 0.7 * quality_mean + 0.3 * cost_efficiency
  where cost_efficiency = 1 - (cost / max_cost_in_set)
  Drafting stage: override — quality_mean weight = 0.9, cost = 0.1 (voice is
  load-bearing, not a cost-optimization target)

WHAT TO LOG (beyond eval_runs):
  - raw IonRouter response headers (to catch silent model swaps)
  - token-per-second (detect degraded inference on shared GPUs)
  - refusal/safety-tripwire rate (some OSS models refuse SRE topics like
    chaos-engineering prompts)
  - output length vs target length (slop indicator)

COST CEILING:
  Hard-cap harness run at $5 total; alert if any single model exceeds
  $1 for full prompt set.
```

Run this once on model-catalog-change, and whenever Ramesh flags a
voice-drift post. Target runtime: <10 min, <$5 per sweep.

## 4. Signals to watch

- **Qwen 4 / Qwen 3.6 Plus hits IonRouter.** Qwen 3.6 Plus is already on OpenRouter
  ([OpenRouter](https://openrouter.ai/qwen/qwen3.6-plus:free)); when Cumulus serves
  it, re-run the harness — likely displaces `qwen3.5-122b-a10b` for research.
- **DeepSeek V4 public release** (rumored 80–85% SWE-bench at $0.14/$? per M,
  1M context) ([NxCode](https://www.nxcode.io/resources/news/deepseek-v4-release-specs-benchmarks-2026)).
  If Cumulus adds it, it likely wins Stage 1 on cost+context.
- **Claude Haiku 4.6 pricing.** If Anthropic drops a sub-$0.50/M output Haiku
  with >1,700 EQ-Bench, the draft-stage escape hatch becomes the default and
  IonRouter is relegated to research+critique.
- **IonRouter adds a frontier-passthrough tier** (Claude/GPT-5). Product Hunt
  comments hint at this but no public announcement as of 2026-04-19.
- **GLM-5.1 / GLM-6 on IonRouter.** GLM-5.1 already scores 84 on combined
  reasoning ([benchlm.ai](https://benchlm.ai/blog/posts/best-chinese-llm)) — a
  drop-in upgrade for the outline stage.
- **Voice-drift complaint from Ramesh on ≥2 consecutive posts** → trigger eval
  harness re-run; consider promoting Claude Sonnet 4.6 to default drafter.
- **IonRouter throughput degrades below 60 tok/s sustained** → drafting stage
  becomes latency-bound; re-evaluate GLM-5 (220 tok/s) as the default drafter
  despite lower EQ-Bench score.
- **EQ-Bench / WritingBench publishes a dedicated technical-writing split.**
  Current Creative split may over-index on fiction; a technical-writing
  leaderboard could flip Kimi ↔ Qwen ordering.

---

### Sources

- [IonRouter landing & pricing](https://ionrouter.io/)
- [IonRouter on Product Hunt (Cumulus Labs)](https://www.producthunt.com/products/ionrouter-by-cumulus-labs)
- [Qwen 3.5-122B-A10B model card (Hugging Face)](https://huggingface.co/Qwen/Qwen3.5-122B-A10B)
- [Qwen 3.5-122B-A10B — Artificial Analysis](https://artificialanalysis.ai/models/qwen3-5-122b-a10b)
- [Chinese frontier models compared — maniac.ai (2026)](https://www.maniac.ai/blog/chinese-frontier-models-compared-glm5-minimax-kimi-qwen)
- [GLM-4.7 vs Qwen 3.5 vs Kimi K2.5 — AI Crucible (Feb 2026)](https://ai-crucible.com/articles/chinese-ai-models-feb-2026-glm-4-7-vs-qwen-3-5-vs-kimi-k2-5/)
- [Best LLMs for Writing — EVY aggregated benchmarks](https://evy.so/compare/best-llms-for-writing/)
- [Best Chinese LLMs 2026 — BenchLM](https://benchlm.ai/blog/posts/best-chinese-llm)
- [Vellum LLM Leaderboard (2026)](https://www.vellum.ai/llm-leaderboard)
- [DeepSeek V4 specs & rumors — NxCode](https://www.nxcode.io/resources/news/deepseek-v4-release-specs-benchmarks-2026)
- [Qwen 3.6 Plus on OpenRouter](https://openrouter.ai/qwen/qwen3.6-plus:free)
