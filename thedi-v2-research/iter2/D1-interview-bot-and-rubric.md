# D1 — Interview-Bot Socratic Generator + Voice-Fidelity Rubric Spec

**Iter-2 deliverable.** Concretes the two load-bearing artifacts in `round4/thedi-v2.md` that iter-1 only named: (1) the interview-bot's question-generator prompt, and (2) the voice-fidelity rubric with its LLM-as-judge scoring protocol. Everything below is implementation-ready: every prompt is paste-ready, every rubric line is a concrete scored definition, every threshold is numeric.

Audience: Ashish (building on Butterbase + IonRouter `gpt-oss-120b`). Ramesh reads Part 2 §rubric-recalibration and the digest email template.

---

## Part 1 — Interview-Bot Socratic Question Generator

### 1.1 The generator prompt (paste-ready)

*Model: IonRouter `kimi-k2.5` (same drafter tier — generating questions needs voice-sensitivity to avoid "LinkedIn podcast host" register; gpt-oss-120b was tried and rejected for producing generic questions).*

```
SYSTEM

You are an interviewing editor for Ramesh Nampalli's Substack on agentic AI in
DevOps / SRE / infrastructure. Your job is to produce 4–6 questions that, when
answered by Ramesh in ~150–300 words each, give a drafter enough verbatim
material + stance to compose a 1,200-word post in Ramesh's voice.

Ramesh is a Principal Engineer at an IAM company. He has ~20 years of
infrastructure experience. He does not write in listicle register. He prefers
concrete failure modes to framework-speak. He does not like hedging ("on the
one hand / on the other hand").

His voice markers (extracted from his seed interview + prior posts):
{{voice_markers_json}}

Two sample paragraphs from prior Ramesh writing:
---
{{sample_paragraph_1}}
---
{{sample_paragraph_2}}
---

INPUTS

TOPIC: {{topic_title}}
TOPIC_BLURB: {{topic_blurb_from_scout}}

SOURCE_MATERIAL:
  arxiv:
    {{arxiv_abstracts_top_3}}   # each: {title, authors, abstract, url}
  hn:
    {{hn_threads_top_2}}        # each: {title, url, top_3_comments}

QUESTIONS_ASKED_LAST_90_DAYS:
  {{prior_questions_json}}      # list of {question, asked_at, topic,
                                #          embedding_hash}

ARCHETYPE_BUDGET:
  You must draw from AT LEAST 4 of the 6 archetypes below, and MUST NOT use
  the same archetype twice in one session. Order matters: start with an
  opener archetype (war-story or strong-opinion), end with a forward-looking
  archetype (sequel-hook or concrete-metric).

  A1  war-story          "Tell me about a time <X> failed in production."
  A2  strong-opinion     "What's the dominant framing of <X> that you think
                          is wrong, and why?"
  A3  counter-take       "<Author Y in source_material> claims <Z>. What does
                          that miss from the operator's seat?"
  A4  concrete-metric    "What's a number you'd want a team to track for
                          <X> that they probably aren't?"
  A5  origin-story       "How did your view on <X> change between <earlier
                          career stage> and now?"
  A6  sequel-hook        "If someone implemented <Y> from your last post and
                          hit <complication>, what should they do next?"

TASK

Step 1 — Draft 6 candidate questions, one per archetype. Each question:
  - is a single sentence, <25 words
  - names a specific technology / practice / failure mode (no generic
    "Tell me about AI agents")
  - is answerable in a voice memo or 150–300 written words
  - avoids yes/no framing
  - uses Ramesh's vocabulary where natural (see voice_markers_json → lexicon)

Step 2 — Dedup against QUESTIONS_ASKED_LAST_90_DAYS. For each candidate,
  compute the archetype + topic-slot key. If any prior question shares
  (archetype, topic_slot, ≥3 content nouns) → discard and regenerate
  within the same archetype but shifting the concrete anchor.

Step 3 — Self-critique (see rubric §1.4). Score each surviving candidate
  on the six self-check dimensions. Any candidate scoring <6 on any
  dimension, or <7 on "specificity", gets regenerated once. Max 2 regen
  passes per candidate; if still below threshold, drop it.

Step 4 — Select 4–6 final questions. If fewer than 4 survive, return
  {"status": "insufficient_material", "reason": "<why>"} — the orchestrator
  will halt the week (see §1.5 minimum-input threshold).

OUTPUT (JSON)
{
  "status": "ok" | "insufficient_material",
  "questions": [
    {
      "idx": 1,
      "archetype": "A1",
      "text": "...",
      "anchor_noun": "kubernetes operator reconciliation loop",
      "self_check_scores": {
        "specificity": 8, "answerability": 9, "non_leading": 7,
        "voice_fit": 8, "originality_vs_90d": 10, "source_tether": 7
      },
      "source_ref": "arxiv:2511.04432 §3.2"
    },
    ...
  ],
  "suppressed_candidates": [
    {"archetype": "A2", "reason": "duplicate of Q#143 (2026-02-11)"}
  ]
}
```

### 1.2 Question archetypes (rotation set)

The six archetypes above are the rotation. Rationale for each:

| # | Archetype | Why it matters | Source |
|---|---|---|---|
| A1 | war-story | Forces Ramesh into specific past-tense verbatim — the single highest-yield voice signal, per [Brief 02](../round1/02-voice-preservation.md) §2 (published Substacker workflows converge on war-stories). Spiral v3 opens with "Yes, and…"-improv exactly because it anchors in concrete memory ([Every, Spiral v3](https://every.to/on-every/introducing-spiral-v3-an-ai-writing-partner-with-taste)). | Spiral v3; Anchor Change |
| A2 | strong-opinion | Ramesh's stated dislike of hedging; a post that doesn't have a claim isn't a post. [Paul Graham's essay diagnostic](http://www.paulgraham.com/essay.html): "if it doesn't seem to say anything new, it probably isn't worth writing." | Editor-writer convention |
| A3 | counter-take | Forces the post to engage with the scout's source material instead of floating free. Also hedges against Ramesh drifting off-topic from the week's actual research pack. | Seth Godin / ghostwriter-interview tradition |
| A4 | concrete-metric | Pre-empts "flat and uninspired" abstraction ([Scale blog](https://scale.com/blog/using-llms-while-preserving-your-voice)). Numbers are a slop vaccine. | Brief 02 §3 |
| A5 | origin-story | Produces time-structured prose ("in 2014 I thought X; now I think Y") that LLMs find hard to fabricate convincingly — good voice anchor. | Technical-ghostwriter pattern ([Lewis Commercial Writing, 2025](https://www.lewiscommercialwriting.com/post/ghostwriter-voice)) |
| A6 | sequel-hook | Builds the Brief 04 flywheel: each post seeds the next topic-picker email. Also mechanically prevents topic recycling ([Round 4 §red-flag A1 recycle filter](../round4/thedi-v2.md)). | Brief 05 |

**Why 6 not 3**: [arXiv 2509.14543](https://arxiv.org/html/2509.14543v1) shows diminishing returns after ~5 reference examples. Six archetypes × at least 4 used per session means every 4-session cycle covers all six without any archetype repeating within a session. After 10 sessions the question corpus has adequate diversity to prevent "these all sound the same."

### 1.3 Anti-repeat guardrail

Dedup is a **three-stage filter** against `question_log` table:

```sql
CREATE TABLE question_log (
  id             bigserial primary key,
  question_text  text not null,
  archetype      text not null,        -- A1..A6
  topic_slug     text not null,        -- from topic-picker
  anchor_nouns   text[] not null,      -- extracted: ["k8s operator", "reconciliation"]
  embedding      vector(1536) not null,-- text-embedding-3-small (cheap)
  question_hash  text not null,        -- sha256 of lowercased, punctuation-stripped
  asked_at       timestamptz not null,
  answered       boolean default false
);
CREATE INDEX ON question_log USING ivfflat (embedding vector_cosine_ops);
CREATE INDEX ON question_log (archetype, topic_slug);
```

Filter stages (all run before step 4 of the generator):

1. **Exact-hash filter.** `SELECT 1 FROM question_log WHERE question_hash = ? AND asked_at > now() - interval '90 days'`. Exact or near-exact repeats discarded.
2. **Archetype+topic+noun filter.** If a prior question in the last 90 days shares `archetype`, `topic_slug`, AND `>=3 anchor_nouns` overlap → discard. This catches rephrased duplicates that hash differently.
3. **Semantic similarity filter.** `1 - cosine_distance(candidate_embedding, prior_embedding) > 0.88` against all prior 90-day questions. 0.88 chosen because [OpenAI text-embedding-3 cookbook](https://cookbook.openai.com/examples/semantic_textual_similarity) reports 0.85+ as "near-paraphrase" and 0.90+ as "same meaning, trivially reworded" — 0.88 is a defensible middle.

If a candidate fails any stage, the generator is re-prompted with a `"banned_phrases"` field listing the triggering prior-question anchors, and instructed to shift to a different concrete anchor within the same archetype. Hard cap: 2 regenerations per candidate.

**Why 90 days**: Ramesh's weekly cadence × 5-6 questions/week = ~250 questions per 90 days. That's the size of the semantic index the generator can check against in <100ms, and it's long enough to avoid "didn't you just ask me this?" fatigue. Beyond 90 days, re-asking a question with evolved framing is legitimate (Ramesh's views shift).

### 1.4 Question-quality self-critique rubric

The generator scores each candidate on six dimensions before returning. Threshold: all ≥6, specificity ≥7.

| Dim | Score guide |
|---|---|
| **specificity** (1–10) | **1**: "What are your thoughts on AI agents?" **5**: "How do you think about observability for agents?" **10**: "How should a k8s operator reconciling LLM-autoscaler replicas handle a partial-failure where the remote inference pool returns 429s for 30s then recovers?" |
| **answerability** (1–10) | **1**: "What is the future of agentic AI?" (unbounded). **5**: "Tell me how you'd design an agent evaluation harness." (doable but 800+ words). **10**: "Give me one failure mode you've seen with retry-storms in LLM autoscaling." (single-anecdote scope). |
| **non_leading** (1–10) | **1**: "Don't you agree that LangGraph is overkill for most teams?" **5**: "Is LangGraph overkill for most teams?" **10**: "Where do you put the line between a state-machine you write yourself and an orchestration framework?" |
| **voice_fit** (1–10) | **1**: uses words Ramesh never uses ("unleash", "leverage", "synergy"). **5**: register-neutral. **10**: uses a Ramesh-attested preferred construction from `voice_markers_json → lexicon` (e.g., "failure mode", "the operator's seat"). |
| **originality_vs_90d** (1–10) | **1**: identical to a prior question by hash. **5**: same archetype+topic, different concrete anchor. **10**: archetype unused in last 90 days, novel concrete anchor. |
| **source_tether** (1–10) | **1**: pure abstraction, no connection to source_material. **5**: uses a theme from the scout but no specific reference. **10**: directly references an arxiv paper §/figure or a named HN commenter's claim. |

The self-critique is a **separate IonRouter call** to `gpt-oss-120b` (different model family from the generator — same "external-evidence critic" principle that Round 3 A applied to the main draft critic, citing [LangChain reflection agents, 2024](https://www.langchain.com/blog/reflection-agents) and [Nature npj AI 2025](https://www.nature.com/articles/s44387-025-00045-3)).

### 1.5 Minimum-input threshold (`insufficient_material` state)

If total Ramesh Q&A response is <500 words (sum across all answered questions this session), the pipeline **skips the week**. Exact behavior:

**State-machine transition:**

```
qa_in_progress → qa_insufficient_material
    (if total_answer_words < 500 AND deadline_passed)
    OR
    (if generator returns status="insufficient_material")

qa_insufficient_material → week_skipped
    (after email sent + 48h fallback window passes)
```

**Email to Ramesh (Resend, subject `"Thedi — skip this week?"`):**

```
Subject: Thedi — skip this week? (takes 30 seconds)

Ramesh,

This week's Q&A has <500 words of answers so far. At that level the drafter
will generate more slop than signal, so I'd rather skip than ship something
you'd have to rewrite.

Three options, pick one by replying with the letter:

  (a) Skip this week. I'll send the next topic-picker Thursday.
  (b) 5-min voice memo instead. Record on your phone, use the MacWhisper
      local-only flow, paste transcript here:
      https://thedi.platformy.org/voice/{{session_id}}
      (No audio leaves your device.)
  (c) Extend Q&A by 48 hours. The questions will resend; just reply to any.

Default on no reply by {{now+48h}}: option (a). No post this week.

— Thedi
Weekly health email Monday 07:00 PT as usual.
```

**Fallback offer (option b, voice-memo path):** This is the Round 3 A silence-fallback activated mid-session. On-device MacWhisper only; no raw audio leaves the phone. Transcript ≥300 words gates the week back into `qa_in_progress` with the voice-memo text as a single giant "answer." Rubric critic still runs normally.

**Option c mechanics:** Regenerates the same 4–6 questions, re-emails. No new scout pass (topic is locked). Extends deadline by 48h. If *still* <500 words, force-transitions to `week_skipped`.

**Drafting is never attempted below 500 words.** Below that, voice anchoring has nothing to anchor on and the drafter falls back to generic LLM prose — exactly the [Brief 02](../round1/02-voice-preservation.md) failure mode Round 3 A disqualified.

---

## Part 2 — Voice-Fidelity Rubric + LLM-as-Judge Protocol

### 2.1 The rubric (7 dimensions, 1-10 each, weighted)

| Dim | Weight | What it measures |
|---|---|---|
| voice_fidelity | 2.0× | Does the draft sound like Ramesh? Cadence, opener style, concession patterns, technical-term preferences. |
| factual_accuracy | 1.0× | Are claims grounded in source_material or Ramesh's Q&A verbatim? No hallucinated papers, numbers, or attributions. |
| concreteness | 1.0× | Specific failure modes, numbers, names, code vs. abstraction ("in today's evolving landscape"). |
| flow_coherence | 1.0× | Does paragraph N follow from N-1? Does the post have a claim that advances? |
| slop_absence | 1.5× | Zero hits on the ban list (§2.3). Weighted above neutral because the failure mode is career-visible. |
| hedge_density | 1.0× | Ratio of hedged claims ("it could be argued", "in some cases", "nuanced") to total claims. Lower is better. |
| topic_coherence | 1.0× | Does the draft stay on the picked topic, vs. drifting into adjacent Ramesh-interesting territory? |

**Weighted sum** = voice_fidelity·2 + factual_accuracy + concreteness + flow_coherence + slop_absence·1.5 + hedge_density + topic_coherence. **Max = 8.5·10 = 85. Threshold to approve = 65** (equivalent to ~7.6/10 averaged, weighted). Below 65 → rewriter pass (max 2 rounds).

#### Anchor examples per dimension (1 / 5 / 10)

**voice_fidelity**
- **1**: "In today's rapidly evolving landscape of artificial intelligence, agentic systems represent a paradigm shift." (Generic AI-hype opener; Ramesh never writes like this.)
- **5**: "Agentic systems are becoming important in SRE workflows. Many teams are adopting them, but there are challenges." (Register-neutral, no voice markers, but no slop tells either.)
- **10**: "The thing about an agentic autoscaler is that its failure mode is invisible until 3am. You don't find out your LLM pool is undersized; you find out your pager is on fire and the autoscaler is politely explaining why the 429s are fine, actually." (Ramesh's concrete-failure-mode-at-3am cadence, documented in seed interview.)

**factual_accuracy**
- **1**: Cites a paper that doesn't exist, or attributes a quote to someone who didn't say it. ("As Andrej Karpathy wrote in 2025, 'agents are the new microservices.'" — fabricated.)
- **5**: Claims are directionally correct but lose specificity ("Recent research shows LLMs can hallucinate" — true but vague, no citation).
- **10**: Every specific claim traces to an arxiv paper in source_material, a Ramesh Q&A verbatim, or a widely-known fact. Numbers carry units and sources.

**concreteness**
- **1**: "Agents can help with many tasks and provide value." (no nouns).
- **5**: "Agents can help SRE teams with incident triage by summarizing logs." (one noun, still generic).
- **10**: "At post-incident review we found the agent had spent 40% of its tool budget on redundant `kubectl describe` calls against already-failed pods, because the retry loop didn't debounce on 410 Gone."

**flow_coherence**
- **1**: Paragraphs are independent; could be reordered without effect.
- **5**: Local flow exists but the post has no thesis arc.
- **10**: Each paragraph makes a claim that the next paragraph either advances or qualifies. Post ends somewhere the opener couldn't have.

**slop_absence**
- **1**: Three or more ban-list hits. Em-dashes in every paragraph. "It's not X, it's Y" appears twice.
- **5**: One or two mild slop constructions ("delve" once; one "in conclusion").
- **10**: Zero ban-list hits across the full draft.

**hedge_density**
- **1**: >25% of claims hedged ("it could be argued that, in some cases, agents may, potentially…").
- **5**: 10–15% hedge rate (normal professional register).
- **10**: <5% hedge rate; claims are load-bearing.

**topic_coherence**
- **1**: Draft drifts off-topic by paragraph 3 (topic was "autoscaling LLM inference"; draft is now about prompt engineering).
- **5**: Stays on topic but with a 1-paragraph tangent.
- **10**: Every section maps back to the picked topic. Scope is defensible.

### 2.2 Judge prompt (paste-ready for `gpt-oss-120b`)

*Model: IonRouter `gpt-oss-120b`. Separate call, separate context, different model family from drafter (`kimi-k2.5`). Short output → cheap (~$0.0008/post).*

```
SYSTEM

You are a style editor scoring a draft post for Ramesh Nampalli's Substack on
agentic AI / DevOps / SRE. You are NOT rewriting. You score, cite evidence
from the text, and propose specific edits.

RAMESH_VOICE_MARKERS:
{{voice_markers_json}}

BAN_LIST:
{{ban_list_json}}

KEEP_LIST:
{{keep_list_json}}

SOURCE_MATERIAL (for factual_accuracy grounding):
{{source_material_condensed}}

QA_VERBATIM (for voice_fidelity anchoring):
{{ramesh_qa_verbatim}}

RUBRIC: 7 dimensions, each scored 1-10. Weighted sum threshold = 65.
  voice_fidelity    (weight 2.0)
  factual_accuracy  (weight 1.0)
  concreteness      (weight 1.0)
  flow_coherence    (weight 1.0)
  slop_absence      (weight 1.5)
  hedge_density     (weight 1.0)
  topic_coherence   (weight 1.0)

For each dimension, use the anchor examples in RUBRIC_ANCHORS to calibrate.
RUBRIC_ANCHORS:
{{rubric_anchors_json}}   # the 1/5/10 examples from §2.1

FEW-SHOT EXEMPLARS

--- EXAMPLE 1: APPROVED (weighted score 74) ---
DRAFT: {{exemplar_approved_1}}
SCORES: {"voice_fidelity": 9, "factual_accuracy": 8, "concreteness": 9,
         "flow_coherence": 8, "slop_absence": 10, "hedge_density": 8,
         "topic_coherence": 9}
EVIDENCE: "The 3am pager opener (line 1) matches RAMESH_VOICE_MARKERS.openers.
Zero ban-list hits. Every claim in §2 traces to QA_VERBATIM Q3."
EDITS: []

--- EXAMPLE 2: APPROVED (weighted score 67) ---
DRAFT: {{exemplar_approved_2}}
SCORES: {"voice_fidelity": 8, "factual_accuracy": 9, "concreteness": 7,
         "flow_coherence": 7, "slop_absence": 9, "hedge_density": 7,
         "topic_coherence": 8}
EVIDENCE: "One hedge stacking in §3 ('could potentially in some cases'). One
abstraction in §4 ('provides value to operators'). Otherwise clean."
EDITS: [
  {"loc": "§3 sentence 2", "issue": "hedge stacking", "suggest": "cut 'could potentially'"},
  {"loc": "§4 sentence 4", "issue": "abstraction", "suggest": "replace with a concrete metric from QA_VERBATIM Q4"}
]

--- EXAMPLE 3: REJECTED (weighted score 52) ---
DRAFT: {{exemplar_rejected_1}}
SCORES: {"voice_fidelity": 4, "factual_accuracy": 7, "concreteness": 5,
         "flow_coherence": 6, "slop_absence": 3, "hedge_density": 5,
         "topic_coherence": 7}
EVIDENCE: "Opener 'In today's rapidly evolving landscape' is BAN_LIST #3.
Three em-dashes in §1. 'It's not just X, it's Y' construction in §2 (BAN_LIST
#7). Voice is generic AI-explainer, not Ramesh. No concrete failure modes;
all abstraction."
EDITS: [
  {"loc": "§1 sentence 1", "issue": "ban-list opener", "suggest": "replace with a concrete anecdote from QA_VERBATIM Q1"},
  {"loc": "§1", "issue": "em-dash overuse (3 instances)", "suggest": "convert to periods or commas"},
  {"loc": "§2 sentence 3", "issue": "ban-list: it's not X it's Y", "suggest": "rewrite as a direct claim"},
  {"loc": "§3", "issue": "no concreteness", "suggest": "anchor to the 429-retry-storm anecdote from QA_VERBATIM Q2"},
  {"loc": "overall", "issue": "voice drift", "suggest": "rewrite §1 and §3 pulling phrasings from QA_VERBATIM"}
]

TASK

Score the following draft on all 7 rubric dimensions. For each dimension:
  1. Assign a 1-10 score with reference to RUBRIC_ANCHORS.
  2. Cite specific line(s) as evidence.

Propose up to 5 concrete edits ordered by impact. Each edit names a
location, the rubric dimension it addresses, and a specific rewrite or cut.

Compute weighted_sum. If >= 65, recommend APPROVE. If 55–64, recommend
REWRITE (single pass). If <55, recommend REWRITE_FROM_QA (two passes
max; may require pulling more verbatim from QA_VERBATIM).

DRAFT TO SCORE:
---
{{draft_text}}
---

OUTPUT (JSON)
{
  "scores": {
    "voice_fidelity": <int 1-10>,
    "factual_accuracy": <int 1-10>,
    "concreteness": <int 1-10>,
    "flow_coherence": <int 1-10>,
    "slop_absence": <int 1-10>,
    "hedge_density": <int 1-10>,
    "topic_coherence": <int 1-10>
  },
  "weighted_sum": <float>,
  "recommendation": "APPROVE" | "REWRITE" | "REWRITE_FROM_QA",
  "evidence": "<2-4 sentence summary>",
  "edits": [
    {"loc": "<section or line>", "dim": "<rubric dim>",
     "issue": "<short>", "suggest": "<specific rewrite or cut>"}
  ]
}
```

### 2.3 Slop ban list (v1 — starter set of 22)

Stored in Postgres as `rubric.ban_list` rows: `(pattern, pattern_type, source, added_at, approved_by)`. Pattern types: `literal`, `regex`, `construction`.

Each entry cites the published analysis that surfaced it.

| # | Pattern | Type | Source |
|---|---|---|---|
| 1 | `delve` | literal | [Jodie Cook ban list](https://www.jodiecook.com/ban-list/); [The Conversation on delve/tapestry](https://theconversation.com/too-many-em-dashes-weird-words-like-delves-spotting-text-written-by-chatgpt-is-still-more-art-than-science-259629) |
| 2 | `tapestry` | literal | The Conversation; Jodie Cook |
| 3 | `nuanced` | literal | Jodie Cook |
| 4 | `(landscape\|ecosystem) of` | regex | Jodie Cook; widely documented |
| 5 | `in (today's\|the modern) (fast-paced\|rapidly evolving) (world\|landscape)` | regex | Jodie Cook |
| 6 | `it's not (just )?X,? it's Y` construction | construction | Jodie Cook (canonical GPT tell) |
| 7 | `in conclusion,` | literal | Jodie Cook; [Plagiarism Today, 2025](https://www.plagiarismtoday.com/2025/06/26/em-dashes-hyphens-and-spotting-ai-writing/) |
| 8 | em-dash frequency > 2 per 400 words | regex+metric | [Sean Goedecke on em-dashes](https://www.seangoedecke.com/em-dashes/); [TechRound Nov 2025](https://techround.co.uk/artificial-intelligence/chatgpt-ditches-the-em-dash-what-does-this-mean-for-ai-detection/) |
| 9 | `paradigm shift` | literal | Jodie Cook |
| 10 | `leverage` (as verb) | literal | Jodie Cook; LinkedIn-slop canon |
| 11 | `unleash` | literal | Jodie Cook |
| 12 | `synergy` / `synergies` | literal | Jodie Cook |
| 13 | `at the end of the day` | literal | Jodie Cook |
| 14 | `honestly,` (as opener) | literal | Jodie Cook (fake-directness tell) |
| 15 | `here's the (breakdown\|thing\|kicker)` | regex | Jodie Cook |
| 16 | `let me be (direct\|clear\|honest)` | regex | Jodie Cook |
| 17 | `on the one hand...on the other hand` | construction | editor convention; Ramesh-stated dislike |
| 18 | rule-of-three listicle pattern: `X, Y, and Z` in >30% of sentences | metric | Brief 02; ACL 2025 GenAIDetect |
| 19 | `it could be argued that` / `one might say` | regex | hedge marker, Jodie Cook |
| 20 | `transformative` / `game-changing` / `revolutionary` | literal | Jodie Cook |
| 21 | `in the realm of` | literal | Jodie Cook; [Plagiarism Today](https://www.plagiarismtoday.com/2025/06/26/em-dashes-hyphens-and-spotting-ai-writing/) |
| 22 | `dive (deep\|into)` as section opener | regex | Jodie Cook |

**Note on #8:** em-dash density is metric-based, not literal. Ramesh uses em-dashes — they're a legitimate punctuation — but LLMs over-use them ~10x ([Goedecke, 2025](https://www.seangoedecke.com/em-dashes/)). Threshold of 2/400 words is calibrated from Ramesh's seed interview (measured: 1.2/400), doubled for headroom.

### 2.4 Golden-set mechanism

Five approved drafts stored in Postgres as immutable ground truth.

```sql
CREATE TABLE golden_set (
  id                int primary key,
  title             text not null,
  draft_text        text not null,               -- the approved final version
  approved_at       timestamptz not null,
  approved_by       text not null,               -- 'ramesh@...'
  expected_scores   jsonb not null,              -- {voice_fidelity: 9, ...}
  expected_weighted float not null,
  source_post_url   text,                        -- published Substack URL
  expected_model_map jsonb not null,             -- {drafter: "kimi-k2.5",
                                                  --  critic: "gpt-oss-120b",
                                                  --  generator: "kimi-k2.5"}
  notes             text                         -- why this draft is golden
);
```

**Seed (at Phase 2 ship):** 5 drafts pulled from Phase 1 posts 1–5 after Ramesh graduated the cold-start protocol (Round 3 A §cold-start). Expected scores captured at the time of Ramesh approval.

**Revalidation triggers (any one fires):**

1. **Expected-model map changes.** Any row in `model_stage_config` changes (new drafter, new critic, new version). `fn_revalidate_golden_set` runs the current critic on all 5 golden drafts.
2. **Ramesh edit-rate crosses threshold.** Rolling 5-post mean of Levenshtein-ratio edits > 25% (recall Round 3 A's 15% is "light edit"; >25% signals systematic miscalibration).
3. **Rubric deltas applied.** Any ban-list add/remove or rubric reweighting triggers revalidation on the same week.
4. **Manual.** `fn_revalidate_golden_set` invokable via admin dashboard (A4 control-plane, Round 4).

**Divergence metric:** run current critic on all 5 golden drafts. For each draft, compute per-dimension delta vs. `expected_scores`. **Fail condition: any single dimension delta >1.0 point on any draft.** On fail:

- Pipeline **pauses new drafts** (`state_machine` blocks transition `drafting → critiquing`).
- Email to Ashish + Ramesh: "Golden-set revalidation failed on draft #3 dimension `voice_fidelity`: expected 9, got 7.2. Pipeline paused."
- Ashish investigates; decides to (a) accept new baseline (update `expected_scores`), (b) revert the rubric/model change, or (c) escalate.

**Why >1.0 and not >0.5:** LLM-as-judge noise is ~0.3-0.5 points on repeated runs of the same draft ([arXiv 2306.05685 LLM-as-judge](https://arxiv.org/abs/2306.05685) and successors). 1.0 is 2-3× the noise floor; anything less trips on the judge's own variance.

### 2.5 Rubric-recalibration loop (operational spec)

Augments Round 3 A §rubric-recalibration-loop with the red-flag A3 amendment (Ramesh-approval required, not just Ashish).

**Who updates:** Ashish *proposes*. Ramesh *approves*. Default-reject on either silence.

**Trigger:** post-publish diff > 15% character-level Levenshtein between critic-approved draft and Ramesh's final published text.

**Cadence:** weekly digest, Sunday 09:00 PT. Cap: 1 rubric change shipped per week, max.

**Signal:** Ramesh's edits, categorized by the recalibration prompt (Round 3 A) into (a) factual, (b) voice, (c) structural.

#### The weekly digest email (Resend, to Ashish)

```
Subject: Thedi rubric digest — week of {{iso_week}} — {{n_proposals}} proposed deltas

Ashish,

Last week Ramesh edited {{n_posts}} posts with {{mean_edit_pct}}% mean diff.
The recalibrator grouped the edits and proposes {{n_proposals}} rubric deltas.
Each needs your 1-click review, then Ramesh's 1-click confirm.

1. {{delta_1_type}}: {{delta_1_summary}}
   Evidence: {{n_examples}} edits in posts #{{post_ids}}
   Example edit: "{{before}}" → "{{after}}"
   Proposed rule: {{delta_1_rule}}
   [approve] https://thedi.platformy.org/rubric/approve/{{delta_1_id}}?token={{signed}}
   [reject]  https://thedi.platformy.org/rubric/reject/{{delta_1_id}}?token={{signed}}

2. ...

Also in this digest:
  - Golden-set divergence: {{max_divergence}} (threshold 1.0)
  - Voice-drift detector: {{rolling_trend}}
  - Ban-list hits last week: {{ban_list_hit_count}}

Silence default: REJECT all. Cap of 1 delta/week shipped regardless of
approvals. If Ashish approves 2+, Ramesh gets a tiebreaker one-liner.
```

#### Approve/reject protocol (two-gate, per red-flag A3)

```
STATE machine for a rubric delta:

proposed
  └── (ashish approves via signed link within 7 days)
        → ashish_approved
             └── (email to Ramesh: 1-line summary + approve/reject links)
                  ├── (ramesh approves) → shipped → applied to rubric
                  ├── (ramesh rejects)  → killed
                  └── (ramesh silent 7 days) → killed (DEFAULT)
  └── (ashish silent 7 days) → killed (DEFAULT)
  └── (ashish rejects) → killed
```

#### Ramesh-facing one-liner email

```
Subject: Thedi rubric — 1 rule to confirm

Ramesh — I'm adding this to the slop ban list based on 3 of your recent edits:

  "{{new_ban_pattern}}"
  (you replaced it with: "{{example_replacement}}" in 3 posts)

  [yes, add it]  https://thedi.platformy.org/rubric/confirm/{{id}}?a=yes
  [no, keep it]  https://thedi.platformy.org/rubric/confirm/{{id}}?a=no

Silence = no change. Either is fine.

— Ashish (via Thedi)
```

**Escalation (per Round 3 A):** if same ban-list delta is proposed 3 weeks running and is rejected or ignored by either gate, the email text shifts to "This pattern has fired 3x. Either approve, reject with a reason, or I'll manually remove it from the recalibrator's trigger set so it stops pinging you." Forces a terminal decision; prevents zombie proposals.

**Kill-switch:** if recalibrator proposes >5 deltas in any week for 3 consecutive weeks, pipeline auto-pauses (Round 3 A signals-to-watch). Signal that the critic is miscalibrated; manual reseed required.

---

## Appendix — open questions for iter-3

- **Empirical threshold for 500-word minimum.** Pulled from [Brief 02](../round1/02-voice-preservation.md) "5-10 min voice ramble yields ~800–1500 words of transcript" and halved for safety margin. Revisit after posts 1–5 land; if rubric passes consistently at 400 words, lower it.
- **Golden-set size (5).** Chosen to match cold-start protocol. If pipeline runs stably for 6 months, expand to 10; adds 2 more drafts per quarter.
- **Archetype rotation may need a 7th (sequel-dissent) if recycling problem surfaces.** Watch for same-topic different-archetype questions triggering dedup false-positives.
- **Self-critique could be skipped if specificity scores stay >8 for 20 sessions.** Cost savings ~$0.0003/session; not urgent.

---

## Evidence footnotes

- [arXiv 2509.14543 — Catch Me If You Can? Not Yet](https://arxiv.org/html/2509.14543v1) — 19–65% blog-register imitation ceiling; diminishing returns after ~5 few-shot exemplars. Drives the minimum-6-archetype design and the "interview anchors prose" workflow.
- [Every, Spiral v3 (Oct 2025)](https://every.to/on-every/introducing-spiral-v3-an-ai-writing-partner-with-taste) — the interview-then-draft pattern; archetype rotation is adapted from Spiral's "Yes, and…" improv structure.
- [Jodie Cook ban list](https://www.jodiecook.com/ban-list/) — primary source for slop ban list entries #1-4, #7-22.
- [Sean Goedecke — Why do AI models use so many em-dashes?](https://www.seangoedecke.com/em-dashes/) — evidence for the em-dash density metric (#8).
- [Plagiarism Today, June 2025](https://www.plagiarismtoday.com/2025/06/26/em-dashes-hyphens-and-spotting-ai-writing/) — corroborating em-dash + "in the realm of" evidence.
- [ACL 2025 GenAIDetect](https://aclanthology.org/2025.genaidetect-1.6.pdf) — stylometric detection 96-99%; supports rule-of-three detector.
- [LangChain reflection agents, 2024-2025](https://www.langchain.com/blog/reflection-agents) — external-evidence critic principle; applied to self-critique of questions.
- [Nature npj AI 2025 — self-consistency failure](https://www.nature.com/articles/s44387-025-00045-3) — don't let generator critique own output with same context.
- [OpenAI text-embedding-3 cookbook](https://cookbook.openai.com/examples/semantic_textual_similarity) — 0.88 cosine threshold for near-paraphrase.
- [arXiv 2306.05685 — Judging LLM-as-a-Judge](https://arxiv.org/abs/2306.05685) — judge noise ~0.3-0.5 points; calibrates the >1.0 divergence threshold.
- [Anchor Change — How to Edit Without Losing Your Voice](https://anchorchange.substack.com/p/how-to-edit-without-losing-your-voice) — "light edit" 10-20% range; calibrates the 15%/25% thresholds.
- [Scale blog — preserving voice](https://scale.com/blog/using-llms-while-preserving-your-voice) — "flat and uninspired" concreteness failure mode.
- [Lewis Commercial Writing — ghostwriter voice-matching](https://www.lewiscommercialwriting.com/post/ghostwriter-voice) — archetype A5 (origin-story) provenance.
- [Round 3 A voice-workflow decision](../round3/A-voice-workflow-decision.md) — parent spec for interview-bot primary + voice-note fallback, and the initial rubric-recalibration loop.
- [Round 4 Thedi v2](../round4/thedi-v2.md) §red-flag amendments A3 — two-gate rubric approval requirement.
- [Brief 06 — IonRouter model selection](../round1/06-ionrouter-model-selection.md) — model-stage assignments used throughout.
