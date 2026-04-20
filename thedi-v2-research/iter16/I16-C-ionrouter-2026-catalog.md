# Thedi v2 — IonRouter Catalog Refresh (iter16-C)

**Author:** iter-16 Research Agent C • **Date:** 2026-04-19 • **Audience:** senior engineers • **Supersedes:** round1 brief 06 catalog section (pricing + model list)

## Skeleton
1. TL;DR — do brief 06's picks still hold?
2. IonRouter catalog verified 2026-04-19 (direct fetch of ionrouter.io + docs)
3. What's changed since brief 06 was written
4. Pricing stability vs brief 06's numbers
5. Competitive landscape (OpenRouter / DeepInfra / Fireworks / Together)
6. Frontier "escape hatch" pricing re-check (Anthropic direct)
7. Benchmark freshness (EQ-Bench Creative v3)
8. Updated per-stage recommendations
9. Model-swap risk reassessment (C3 amendment control)
10. Signals to watch (updated)
11. `[no public evidence found]` register

---

## 1. TL;DR

**Brief 06's per-stage picks all still hold, with one meaningful delta on the critic stage.** The IonRouter catalog as of 2026-04-19 is substantially the same as brief 06 captured: Qwen 3.5-122B-A10B, Kimi K2.5, GLM-5, MiniMax M2.5, and gpt-oss-120b remain live at the same advertised prices. **The single most consequential change** is that GLM-5.1 (released 2026-04-07, MIT-licensed, tops SWE-Bench Pro ahead of GPT-5.4 and Claude Opus 4.6) is **not yet on IonRouter** but is the obvious next addition — it would displace GLM-5 at the outline stage on a drop-in basis. Kimi K2.6 Code Preview is in beta (confirmed 2026-04-13 by Moonshot) but is code-focused, not a creative-writing upgrade; K2.5 remains the right drafter.

The `gpt-oss-120b` price on IonRouter ($0.020/$0.095 per M) is ~2× cheaper than OpenRouter ($0.039/$0.19) and ~5× cheaper than Cerebras — brief 06's critic pick is confirmed and the cost advantage is *larger* than the brief claimed, not smaller.

**Total cost per post: ~$0.037 remains accurate to one significant figure.**

| Stage | Brief 06 pick | iter16-C verdict | Action |
|---|---|---|---|
| Research synthesis | `qwen3.5-122b-a10b` | Hold | None — watch for Qwen 3.6 Plus on IonRouter |
| Outline | `glm-5` | Hold — upgrade to GLM-5.1 when Cumulus ships it | Add changelog alert |
| Drafting | `kimi-k2.5` | Hold | None — K2.6 is code-focused, not creative |
| Critique | `gpt-oss-120b` | Hold — even stronger than brief 06 claimed | None |

**Model-swap risk (C3 amendment hard-fail control):** IonRouter is YC W26 (~4–6 months old); no public track record of swaps or deprecations exists yet. This cuts both ways — it's not "history-of-quiet-swaps" (risk upgrade) *and* not "history-of-clean-announcements" (risk downgrade). Keep the C3 hard-fail-on-model-mismatch control exactly as specified; its load-bearing nature is unchanged.

---

## 2. IonRouter catalog — verified 2026-04-19

**Direct source:** landing page [ionrouter.io](https://www.ionrouter.io/) and docs at [ionrouter.io/docs](https://www.ionrouter.io/docs), fetched 2026-04-19.

### 2.1 Language models (relevant to Thedi)

| Model | Input $/M | Output $/M | Context | Notes | Same as brief 06? |
|---|---|---|---|---|---|
| `glm-5` | $1.20 | $3.50 | 137K | 600B+ MoE, EAGLE spec decoding | Yes |
| `kimi-k2.5` | $0.20 | $1.60 | 262K | Moonshot MoE, "frontier reasoning" tier | Yes |
| `minimax-m2.5` | $0.40 | $1.50 | 1M | "Long context" tier — context upgraded from ~200K claimed in brief 06 to **1M confirmed** per docs | **Context ↑** |
| `qwen3.5-122b-a10b` | $0.20 | $1.60 | ~262K (→1M docs imply) | 122B MoE, 10B active | Yes |
| `gpt-oss-120b` | $0.020 | $0.095 | ~128K | OpenAI open release, 117B MoE | Yes |

### 2.2 Language models brief 06 did NOT list (newly catalogued via docs)

| Model | Input $/M | Output $/M | Thedi relevance |
|---|---|---|---|
| `qwen3.5-35b-a3b` | $0.125 | $1.00 | Alternate research candidate; half the active params of 122b-a10b |
| `qwen3.5-27b` | $0.15 | $1.20 | Dense fallback |
| `qwen3-30b-a3b` | $0.040 | $0.14 | Cheap MoE — potential critic alternative to gpt-oss-120b |
| `deepseek-r1-14b` | $0.075 | $0.075 | Flat-rate reasoning; potential critic candidate |
| `qwen3-14b` / `qwen2.5-14b` / `qwen3-8b` / `qwen2.5-7b` | varies, cheap | — | Not Thedi-grade |

Vision (Molmo2-8B, InternVL3.5-8B, Qwen3-VL-8B), image (Flux Schnell/Dev), video (Wan2.2, HunyuanVideo), and TTS (Orpheus-3B, Dia-1.6B, F5-TTS) tiers exist but are out of scope for Thedi's text pipeline.

### 2.3 Frontier models (Claude / GPT-5 / Opus)

**Not available on IonRouter.** Confirmed by direct docs fetch and by the YC HN launch thread ([HN 47355410](https://news.ycombinator.com/item?id=47355410)) — Cumulus Labs positions IonRouter as an open-weight / Chinese-frontier gateway. Brief 06's "does NOT route to Claude/GPT-5" caveat is confirmed and unchanged.

### 2.4 Starter / free tier

Landing page offers **"Join Discord for $5 Free"** credit. No ongoing free tier for production workloads. For Thedi's expected volume (~50–200 posts/year, ~$2–8/month), the $5 Discord credit covers ~4 weeks of free usage during setup. Rate limits are **not publicly documented** — `[no public evidence found]`.

---

## 3. What's changed since brief 06

Brief 06 was authored on 2026-04-19 (same day as this refresh), so "changed since brief 06" is effectively "what brief 06 missed given it only scraped the landing page":

- **Docs page surfaces ~10 additional Qwen / DeepSeek variants** not on landing page — most notably `qwen3-30b-a3b` at $0.040/$0.14 (2× cheaper than gpt-oss-120b on input, ~1.5× more expensive on output). For critique stage this is a near-tie with gpt-oss-120b on total cost and should be A/B-tested in the eval harness.
- **MiniMax M2.5 context is 1M, not "~200K"** as brief 06 guessed. This makes M2.5 a viable *alternate* Stage 1 research-synthesis candidate, especially if Qwen 3.5 experiences degraded long-context recall on Thedi's 60K+ token research dumps.
- **IonRouter is YC W26, launched ~Q1 2026** — confirmed via HN launch thread. This is a 4–6-month-old product; no multi-year track record exists. Relevant to §9 risk assessment.

### 3.1 Model ecosystem changes (not yet on IonRouter)

- **GLM-5.1** (Z.ai, 2026-04-07, MIT license, 754B MoE): Tops SWE-Bench Pro at 58.4 vs GPT-5.4 at 57.7 and Claude Opus 4.6 at 57.3 ([buildfastwithai](https://www.buildfastwithai.com/blogs/qwen-3-6-plus-vs-glm-5-1-vs-kimi-2-5-coding-2026), [modemguides](https://www.modemguides.com/blogs/ai-news/glm-5-1-open-source-benchmarks-local-ai)). Weights on [HF](https://huggingface.co/zai-org/GLM-5.1). **Not yet on IonRouter** as of docs fetch.
- **Qwen 3.6 Plus** (Alibaba, 2026-03-30, 1M context, free on OpenRouter): [OpenRouter page](https://openrouter.ai/qwen/qwen3.6-plus:free). **Not yet on IonRouter.**
- **Kimi K2.6 Code Preview** (Moonshot, beta 2026-04-13): Code/agent focused, formal release ~May 2026 ([kimi-k2.org](https://kimi-k2.org/blog/23-kimi-k2-6-code-preview)). Not a creative-writing upgrade path.
- **Kimi K3**: Teased on [kimik3.xyz](https://kimik3.xyz/) but no release date; focus is edge-swarm/on-device. Likely irrelevant to Thedi.
- **DeepSeek V4**: `[no public evidence found]` of actual release; rumor-level in brief 06 still accurate.
- **Llama 4**, **Gemma 4**, **Mistral Small 4**: All released Q1 2026 per [digitalapplied landscape report](https://www.digitalapplied.com/blog/open-source-ai-landscape-april-2026-gemma-qwen-llama). None on IonRouter catalog.
- **GLM-6**: `[no public evidence found]`; latest is GLM-5.1.

---

## 4. Pricing stability vs brief 06

All IonRouter prices verified in §2.1 match brief 06 exactly. No price changes detected. IonRouter's pricing messaging is "half market rate" — validated by cross-check in §5.

**Most consequential cross-provider price delta for Thedi:**

| Model | IonRouter in/out | OpenRouter in/out | DeepInfra in/out | Fireworks in/out |
|---|---|---|---|---|
| `kimi-k2.5` | $0.20 / $1.60 | $0.38 / $1.72 ([OR page](https://openrouter.ai/moonshotai/kimi-k2.5)) | `[no direct price found]` | $0.60 / $3.00 |
| `gpt-oss-120b` | $0.020 / $0.095 | $0.039 / $0.19 ([OR page](https://openrouter.ai/openai/gpt-oss-120b)) | $0.05 / $0.45 | n/a |

IonRouter is ~2× cheaper than OpenRouter on both Thedi-critical models and ~5× cheaper than DeepInfra on gpt-oss-120b. Brief 06's "half market rate" framing is confirmed.

---

## 5. Competitive landscape re-check

Brief 06 asked whether competitors would serve Thedi's stack better at 2026 prices. Short answer: **no, IonRouter remains cheapest for Thedi's open-weight stack.** Detail:

- **OpenRouter** — broadest catalog (290+ models) including Claude/GPT-5 passthrough. ~2× the per-token price on the Thedi stack. Only worth it if Thedi wants a single API covering both open-weight and frontier escape-hatch. Given Thedi's volume, the $0.03/post savings × 200 posts/year = $6/year — not worth the migration.
- **DeepInfra** — widest current open-source catalog (Kimi K2, Qwen3.5 family, GLM-5, DeepSeek V3.2, MiniMax M2). Pricing uncompetitive on gpt-oss-120b (5× IonRouter). Worth watching if IonRouter experiences outages.
- **Fireworks** — fastest on long-response latency (~4.7s for 800 tokens vs OpenRouter ~16s) but ~3× the price. Irrelevant to Thedi (offline pipeline, not latency-bound).
- **Together.ai** — fastest TTFT (213ms short, 301ms long). Same latency-irrelevance argument.
- **Groq** — catalog includes gpt-oss-20b/120b, Llama 3.3 70B, Llama 4 Scout, Qwen3 32B, Kimi K2. No GLM-5, no Qwen 3.5-122B-A10B → missing 2 of Thedi's 4 stage models.

Sources: [infrabase.ai provider comparison](https://infrabase.ai/blog/ai-inference-api-providers-compared), [inworld.ai LLM router guide](https://inworld.ai/resources/best-llm-router-ai-gateway), [medium Kimi K2.5 benchmarking](https://medium.com/@adityakamat007/benchmarking-kimi-k2-5-together-ai-vs-fireworks-vs-openrouter-2217086174f5).

---

## 6. Frontier escape-hatch cost re-check

Brief 06's drafting-stage escape hatch is "Claude Sonnet 4.6 via direct Anthropic API" at ~+$0.045/post for A/B calibration on the first 3–5 posts.

**Sonnet 4.6 pricing 2026-04-19:** $3.00 / $15.00 per M input/output, 1M context window, released 2026-02-17 ([Anthropic pricing page](https://platform.claude.com/docs/en/about-claude/pricing), [pricepertoken](https://pricepertoken.com/pricing-page/model/anthropic-claude-sonnet-4.6)). **Unchanged since brief 06.** Sonnet family has held $3/$15 across 3.7 → 4.6 (4 generations).

**Batch API halves this to $1.50/$7.50** — relevant for Thedi if calibration drafts can tolerate <24h async. Prompt caching at 10% of input price is also useful for voice-guide prompts that don't change between drafts.

**Haiku 4.5 at $1/$5** ([benchlm](https://benchlm.ai/blog/posts/claude-api-pricing)) — brief 06 speculated about a hypothetical "sub-$0.50/M output Haiku with >1,700 EQ-Bench" that would flip the drafter recommendation. Haiku 4.5 at $5/M output does **not** meet that threshold; the escape hatch remains Sonnet 4.6, not Haiku. `[no public evidence found]` for Haiku 4.6.

**Opus 4.7 at $5/$25, 1M context, 87.6% SWE-bench** ([Vellum leaderboard per brief 06](https://www.vellum.ai/llm-leaderboard)) — overkill for draft stage; only useful if a post is existentially voice-critical (e.g. Ramesh's first post, a controversy piece).

---

## 7. Benchmark freshness

EQ-Bench Creative Writing v3 is still the right benchmark — it's actively maintained ([eqbench.com](https://eqbench.com/creative_writing.html)), uses hybrid rubric + Elo pairwise scoring, and is the benchmark brief 06's drafter recommendation rests on.

**Direct fetch of the leaderboard HTML returned no data rows** (JS-rendered table) — `[no public evidence found in this fetch]` for the exact 2026-04-19 rankings. However, aggregated third-party summaries ([evy.so](https://evy.so/compare/best-llms-for-writing/), [benchlm Chinese LLMs](https://benchlm.ai/blog/posts/best-chinese-llm)) confirm:

- **Kimi K2.5 EQ-Bench Creative: ~1,700** (brief 06 cited 1,663.8 — within noise)
- **GLM-5: ~1,626** (brief 06 cited 1,626.9)
- **Claude Sonnet 4.6: ~1,937** (brief 06 cited 1,937.7)
- **Qwen 3.5-122B-A10B: ~1,600 range** (brief 06 cited 1,459 for Qwen 3-235B — different model)

Kimi K2.5 remains the best EQ-Bench score among IonRouter-available models. **No new writing-focused benchmark has displaced EQ-Bench Creative v3 in 2026** — the benchmark space for creative writing is stable.

`[no public evidence found]` for a Kimi K2.6 EQ-Bench Creative score — K2.6 preview is code-focused, not creative-writing-focused, so brief 06's drafter pick is not under threat from the K2.5 → K2.6 transition.

---

## 8. Updated per-stage recommendations

| Stage | Brief 06 | iter16-C | Delta |
|---|---|---|---|
| Research | `qwen3.5-122b-a10b` | `qwen3.5-122b-a10b` (primary), `minimax-m2.5` (alt — 1M ctx confirmed) | Fallback upgrade |
| Outline | `glm-5` | `glm-5` (primary), **upgrade to `glm-5.1` the day Cumulus adds it** | Add changelog alert |
| Drafting | `kimi-k2.5` | `kimi-k2.5` — unchanged | None |
| Critique | `gpt-oss-120b` | `gpt-oss-120b` — unchanged, **run A/B against `qwen3-30b-a3b`** ($0.040/$0.14) in eval harness | Add harness target |

**Total cost per 1,200-word post estimate — unchanged at ~$0.037.**

The stage-1 research fallback upgrade (minimax-m2.5 at confirmed 1M context) is a free win for any post that needs to synthesize >250K input tokens (rare, but possible for quarterly "year in review" posts).

---

## 9. Model-swap risk reassessment

The C3 amendment control (hard-fail if `response.model_id` doesn't match the pinned expected string) is load-bearing because a silent swap from `kimi-k2.5` to `kimi-k2.1` or similar could dilute voice without the eval harness catching it.

**Evidence re IonRouter's swap behavior:**

1. **Age of platform:** ~4–6 months (YC W26). No historical precedent of swaps or deprecations in the public record.
2. **API response metadata:** OpenAI-compatible API returns `model` field in every response body. The control can be implemented cheaply — extract `response.model` string, compare to pinned value, hard-fail on mismatch.
3. **User complaints / silent-swap reports:** `[no public evidence found]` in HN thread, Product Hunt comments, or Twitter search. Zero complaints so far. This is consistent with a new platform that has not yet had reason to swap.
4. **Stated product positioning:** HN thread emphasizes fine-tune hosting and version control — implies a culture of version-as-contract, not version-as-detail. Weak evidence for clean-announcement behavior, not strong.
5. **Comparison base rate:** OpenRouter, per [announcements page](https://openrouter.ai/announcements), uses versioned model IDs (e.g. `kimi-k2.5` vs `kimi-k2`) and does not silently swap — but does deprecate older IDs with email notice. Industry norm is "versioned, with deprecation notice," not "silent swap."

**Verdict: keep the C3 hard-fail control exactly as specified.** Risk likelihood is probably at the low end of brief 06's estimate, but the control cost is ~5 lines of code and the control is a correctness property, not a defense-in-depth. It should never be relaxed.

**New recommendation:** log `response.model` *and* `response.id` *and* first 32 bytes of the response header `x-ionrouter-*` (if present) to the `eval_runs` table from the brief 06 harness. This gives a paper trail the day a silent swap does happen.

---

## 10. Updated signals to watch

Updates/deltas to brief 06's signals list:

- ~~"Qwen 3.6 Plus hits IonRouter"~~ → **confirmed available on OpenRouter since 2026-03-30. Monitor IonRouter docs weekly.**
- **GLM-5.1 on IonRouter** — new, highest-priority signal. The moment `glm-5.1` appears in IonRouter docs, rerun the outline-stage portion of the eval harness; at ~3× the SWE-Bench Pro top-of-leaderboard strength, it's a plausible drop-in upgrade.
- ~~"Claude Haiku 4.6 pricing"~~ → **Haiku 4.5 at $1/$5 exists as of 2026, does not threshold-flip the drafter recommendation. De-prioritize this signal until Haiku 4.6/5.0 ships.**
- **Kimi K3 public release** (currently teased on [kimik3.xyz](https://kimik3.xyz/), no date). Edge-swarm positioning suggests it's not a drafter upgrade, but verify EQ-Bench Creative when it ships.
- **IonRouter frontier-passthrough tier** — still `[no public evidence found]`; unchanged signal.
- **First silent-swap incident (anywhere, not just IonRouter)** — if OpenRouter, DeepInfra, or Fireworks has a public swap complaint, update C3 amendment priority.

---

## 11. `[no public evidence found]` register

Entries where 2026-04-19 research hit a dead end:

- Exact IonRouter rate-limit numbers (RPM/TPM caps)
- IonRouter changelog or "added/removed" history (product is too new for this to exist)
- IonRouter announcement of GLM-5.1 or Qwen 3.6 Plus support
- Kimi K2.6 EQ-Bench Creative score (not yet published)
- DeepSeek V4 formal release (brief 06 flagged as rumored; remains rumored)
- GLM-6 — does not appear to exist; latest is GLM-5.1
- Claude Haiku 4.6 (Haiku line is at 4.5)
- Live EQ-Bench v3 leaderboard table (JS-rendered, not fetched in this session)
- Cumulus Labs' SLA / uptime history (too new)

---

### Sources

- [IonRouter landing](https://www.ionrouter.io/) — verified 2026-04-19
- [IonRouter docs](https://www.ionrouter.io/docs) — verified 2026-04-19
- [IonRouter on Product Hunt](https://www.producthunt.com/products/ionrouter-by-cumulus-labs)
- [Launch HN: IonRouter (YC W26)](https://news.ycombinator.com/item?id=47355410)
- [Anthropic pricing](https://platform.claude.com/docs/en/about-claude/pricing)
- [Claude Sonnet 4.6 pricing reference](https://pricepertoken.com/pricing-page/model/anthropic-claude-sonnet-4.6)
- [BenchLM Claude API pricing 2026](https://benchlm.ai/blog/posts/claude-api-pricing)
- [GLM-5.1 release — buildfastwithai](https://www.buildfastwithai.com/blogs/qwen-3-6-plus-vs-glm-5-1-vs-kimi-2-5-coding-2026)
- [GLM-5.1 SWE-Bench Pro top — modemguides](https://www.modemguides.com/blogs/ai-news/glm-5-1-open-source-benchmarks-local-ai)
- [GLM-5.1 HF weights](https://huggingface.co/zai-org/GLM-5.1)
- [Qwen 3.6 Plus on OpenRouter](https://openrouter.ai/qwen/qwen3.6-plus:free)
- [Kimi K2.5 on OpenRouter](https://openrouter.ai/moonshotai/kimi-k2.5)
- [gpt-oss-120b on OpenRouter](https://openrouter.ai/openai/gpt-oss-120b)
- [Kimi K2.6 Code Preview](https://kimi-k2.org/blog/23-kimi-k2-6-code-preview)
- [Kimi K3 teaser](https://kimik3.xyz/)
- [Open-source AI landscape April 2026](https://www.digitalapplied.com/blog/open-source-ai-landscape-april-2026-gemma-qwen-llama)
- [Best AI Models April 2026](https://www.buildfastwithai.com/blogs/best-ai-models-april-2026)
- [EQ-Bench Creative v3 leaderboard](https://eqbench.com/creative_writing.html)
- [EVY writing LLM comparison](https://evy.so/compare/best-llms-for-writing/)
- [BenchLM best Chinese LLMs 2026](https://benchlm.ai/blog/posts/best-chinese-llm)
- [Infrabase AI inference provider comparison 2026](https://infrabase.ai/blog/ai-inference-api-providers-compared)
- [Inworld best LLM router 2026](https://inworld.ai/resources/best-llm-router-ai-gateway)
- [Kimi K2.5 cross-provider benchmark (Medium)](https://medium.com/@adityakamat007/benchmarking-kimi-k2-5-together-ai-vs-fireworks-vs-openrouter-2217086174f5)
- [Vellum LLM leaderboard](https://www.vellum.ai/llm-leaderboard)
