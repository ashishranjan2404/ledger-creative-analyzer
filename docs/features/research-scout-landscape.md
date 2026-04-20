# Research-Scout Landscape

> The broader competitive set Thedi operates in. Yutori is the closest direct comparable (see [`yutori-reference.md`](./yutori-reference.md) for a deep dive on it). This doc covers everything else: academic tools, newsletter platforms, deep-research agents, and OSS baselines.
>
> **Use this when:** deciding features, positioning the pitch, or arguing why Thedi is differentiated in a specific dimension.

**Last refreshed**: 2026-04-20

---

## The 4 clusters Thedi sits inside

```
           Academic research          Daily-digest newsletters
                 │                             │
                 ▼                             ▼
      Elicit, RResearchRabbit,        Smol.AI AINews,
      Semantic Scholar,               TLDR AI, The Rundown,
      Emergent Mind, Consensus,       Ben's Bites,
      arxiv-sanity                    Feedly Leo
                 │                             │
                 └─────────► Thedi ◄───────────┘
                 ▲                             ▲
                 │                             │
         Autonomous web agents     Deep-research report tools
                 │                             │
                 ▼                             ▼
          Yutori Scouts,             Perplexity Deep Research,
          Galileo, Mem,              OpenAI Deep Research,
          Manus, Anthropic           Gemini Deep Research
          computer use
```

Thedi's differentiator: it's the **only product that sits in all four clusters at once**. A daily-push personalized digest (cluster 2) built with a multi-agent research pipeline (cluster 4) over research sources (cluster 1) that adapts to free-text feedback (cluster 3 pattern).

---

## Cluster 1 — Academic research tools

### Elicit · https://elicit.com/
- **Corpus**: Semantic Scholar + PubMed + OpenAlex (~138M papers)
- **Scouting**: embedding retrieval → GPT-4 re-ranking → structured extraction (methodology, sample size, findings)
- **Feedback**: per-query thumbs; no persistent user model
- **Delivery**: web only, no push
- **Pricing**: Free · Plus $12/mo · Pro $49/mo · Team $99/seat
- **vs Thedi**: deep-per-query (minutes). We're shallow-daily (seconds). Different use-case.

### Research Rabbit · https://www.researchrabbit.ai/
- **Scouting**: citation + co-authorship graph expansion from user-seeded collections
- **Feedback**: implicit (adds, dismissals)
- **Delivery**: email alerts + web app
- **Pricing**: Free · RR+ $10/mo
- **vs Thedi**: graph-native (we're not). Academic-only (we span HN/X). No critique loop.

### Semantic Scholar Research Feeds · https://www.semanticscholar.org/me/research
- **Scouting**: list-based recommender (positive+negative examples → learned ranker)
- **Feedback**: **explicit "not relevant" button** — only competitor with dedicated negative-signal channel comparable to ours
- **Delivery**: web only
- **Pricing**: free
- **vs Thedi**: closest feedback pattern. But academic-only, no LLM synthesis or critique.

### Emergent Mind · https://www.emergentmind.com/
- **Scouting**: ranks arxiv by social engagement (HN, X, Reddit, YouTube, GitHub)
- **Feedback**: none user-specific
- **Delivery**: web only
- **Pricing**: Free · Pro ~$15/mo
- **vs Thedi**: **closest content overlap** (arxiv + HN + X). Distinction: we personalize, they broadcast. We push, they pull.

### Consensus · https://consensus.app/
- **Scouting**: hybrid retrieval (semantic + BM25) over 200M+ papers, LLM synthesis with "% consensus" trust labels
- **Feedback**: minimal
- **Delivery**: web only
- **Pricing**: Free · Premium $10/mo
- **vs Thedi**: Q&A-shaped, not digest-shaped.

### arxiv-sanity (Karpathy) · https://github.com/karpathy/arxiv-sanity-lite
- **Scouting**: per-user SVM over tf-idf bigrams of abstracts
- **Feedback**: implicit (tag adds)
- **Delivery**: web + email (legacy)
- **Pricing**: free/OSS
- **vs Thedi**: reference for "personalization without LLMs." Good benchmark.

---

## Cluster 2 — Daily-digest newsletters

### Smol.AI AINews · https://news.smol.ai/
- **Scouting**: research agents scrape AI Discords + subreddits + X; LLM drafts; human editor ships
- **Feedback**: none user-specific (one broadcast)
- **Delivery**: daily email + web archive
- **Pricing**: free
- **vs Thedi**: **closest stylistic sibling.** Same cadence, same AI focus. Distinction: they are one-email-for-everyone, we personalize per-user.

### TLDR AI · https://tldr.tech/ai
- **Scouting**: human curation + LLM drafting
- **Feedback**: none
- **Delivery**: daily email
- **Pricing**: free (ad-supported) · Pro ~$20/mo (deep-dives)
- **vs Thedi**: stronger brand/voice. Identical broadcast model.

### Ben's Bites · https://www.bensbites.com/
- Same pattern as TLDR, focused on builders + founders

### The Rundown AI · https://www.therundown.ai/
- Same pattern, heavier on tool reviews

### Feedly Leo · https://feedly.com/ai
- **Scouting**: rule-based "Skills" (Prioritize, Mute, Deduplicate) + LLM summarization over user-supplied RSS
- **Feedback**: **"Like-Board"** — curate examples, Leo learns
- **Delivery**: web + daily email + Slack/Teams
- **Pricing**: Pro+ $12.99/mo · Enterprise $1,600/mo
- **vs Thedi**: stronger at *source breadth* + train-by-example. Weaker: no agentic critique, no arxiv-native, users bring their own sources.

---

## Cluster 3 — Autonomous web-monitoring agents

### Yutori Scouts · https://yutori.com/scouts
- **See `yutori-reference.md`**
- Summary: general-purpose prompt-defined web monitors with multi-channel delivery, authenticated connectors, audit trail. No critique loop, no daily-digest format, no cross-scout learning.

### Manus · https://manus.im/
- General autonomous agent with web access, code execution, VM sandbox
- Not a research-digest product per se — general "ask it to do a task"
- Relevance to Thedi: **agentic primitives** Thedi could adopt (browser tool use, code execution for data viz)

### Mem · https://mem.ai/
- AI-augmented note-taking with "Mem X" agent that can draft, summarize, tag
- Not a scout, but adjacent: your personal knowledge context is always available
- Relevance: **connector for user's existing knowledge** — something Thedi lacks

### Anthropic Computer Use · https://www.anthropic.com/news/developing-computer-use
- Agent that operates a desktop (clicks, types, scrolls)
- Not a product, but a capability
- Relevance: the underlying tech Yutori-style scouts are built on

---

## Cluster 4 — Deep-research report generators

### Perplexity Deep Research · https://www.perplexity.ai/hub/blog/introducing-perplexity-deep-research
- **Scouting**: dozens of parallel searches, hundreds of sources, 2–4 min runs
- **Delivery**: in-product reports, exportable
- **Feedback**: none persistent
- **Pricing**: free tier (limited) · Pro $20/mo
- **vs Thedi**: one-shot per query. We'd reference their API as a future source.

### OpenAI Deep Research · https://openai.com/index/introducing-deep-research/
- **Scouting**: o3-based agent, 15–25 min runs
- **Benchmark**: 26.6% on Humanity's Last Exam
- **Pricing**: Plus ($20, 10/mo) · Pro ($200, unlimited)
- **vs Thedi**: same story — deep-per-query, not push.

### Gemini Deep Research · https://gemini.google/overview/deep-research/
- **Scouting**: Gemini 3.1 Pro, multi-step plan + Workspace integration
- **Pricing**: Gemini Advanced $20/mo
- **vs Thedi**: Google ecosystem lock-in.

---

## Where Thedi wins / loses

### 🟢 Thedi wins on
1. **Multi-agent critique on daily cadence** — no one else ships this combo
2. **Free-text feedback → next-day critic prompt injection** — novel
3. **Rank-diff visible in the product** (replay page shows initial → final movement) — unique
4. **Cross-source fusion into one ranked digest** — Emergent Mind ranks, we merge-and-synthesize
5. **Tamil-character branding + personal voice** — no direct competitor in this aesthetic space

### 🔴 Thedi loses on
1. **Source breadth** — Feedly/Yutori have 10× more sources
2. **Connectors to user's own data** (Gmail/Notion/Slack) — Yutori does, we don't
3. **Multi-channel delivery** — Yutori has email+webhook+iOS+Slack, we're email-only
4. **Graph-based discovery** — Research Rabbit's citation graph is powerful; we don't have one
5. **Per-item trust signals** — Consensus's "% papers agreeing" is a feature we should consider
6. **Public trust / audit trail** — Yutori exposes the agent's reasoning; our `audit_log` is admin-only
7. **Brand/voice** — TLDR AI / Ben's Bites have stronger editorial personalities

### 🟡 Toss-ups (depends on positioning)
- **Daily vs weekly cadence** — TLDR is daily, some research users want weekly
- **Personalization depth** — more personalization = stickier; also more fragile
- **Human-in-the-loop editing** — Smol.AI mixes it; we're pure-agent

---

## The "if we had to position ourselves in one sentence"

Against Yutori: *"Thedi is the opinionated research version of Yutori — one prompt, one 7 AM email, a critic that knows your taste."*

Against Smol.AI AINews: *"Thedi is AINews if it wrote a different issue for every reader."*

Against Elicit: *"Thedi is Elicit if it came to you every morning instead of waiting for you to query."*

Against Emergent Mind: *"Thedi is Emergent Mind if the rankings knew you personally."*

---

## Sources

Every product link is inline above. This doc is auto-refined by the RALF loop — run `python scripts/ralf_loop.py docs/features/research-scout-landscape.md`.
