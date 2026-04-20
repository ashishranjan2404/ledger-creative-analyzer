# Voice Preservation in LLM-Assisted Writing — Round 1 Brief

**Sub-question 2 of Thedi v2 research.** Load-bearing constraint: if Ramesh's Substack reads like LLM slop, his career credibility takes a hit. Goal: a practical, citeable answer on how to keep an author's voice through AI assistance.

---

## 1. What "voice erosion" actually looks like

Well-documented LLM tells as of 2025–2026:

- **Em-dash overuse.** GPT-4o uses ~10× more em-dashes than GPT-3.5; GPT-4.1 worse. OpenAI only shipped a user-level em-dash opt-out in GPT-5.1 (Nov 2025). Claude and Gemini are more restrained but not exempt. ([Sean Goedecke, "Why do AI models use so many em-dashes?"](https://www.seangoedecke.com/em-dashes/); [Plagiarism Today, Jun 2025](https://www.plagiarismtoday.com/2025/06/26/em-dashes-hyphens-and-spotting-ai-writing/); [TechRound, Nov 2025](https://techround.co.uk/artificial-intelligence/chatgpt-ditches-the-em-dash-what-does-this-mean-for-ai-detection/))
- **Flowery vocabulary.** "Delve," "tapestry," "nuanced," "landscape," "evolving," "paradigm" — likely an RLHF artifact from training-data demographics. ([The Conversation](https://theconversation.com/too-many-em-dashes-weird-words-like-delves-spotting-text-written-by-chatgpt-is-still-more-art-than-science-259629))
- **Rule-of-three listicles.** "Speed, efficiency, and innovation." Same shape every paragraph.
- **"It's not X, it's Y" / hedged balanced takes.** Reads authoritative but says nothing. ([Jodie Cook ban list](https://www.jodiecook.com/ban-list/))
- **Fake-directness openers.** "Honestly?" "Here's the breakdown." "Let me be direct." ([Jodie Cook](https://www.jodiecook.com/ban-list/))
- **Generic transitions and problem-solution clichés.** "In today's fast-paced digital world…"
- **Stylometric fingerprint.** Even without surface tells, LLM outputs cluster by model family in part-of-speech distributions, detectable at ~96–99% accuracy against human authors. ([ACL 2025 GenAIDetect](https://aclanthology.org/2025.genaidetect-1.6.pdf))

**The research says style-imitation via few-shot prompting is fundamentally limited.** A Sep 2025 paper tested LLMs on imitating everyday authors' implicit styles: authorship-verification accuracy was 95–97% in structured domains (news, email) but collapsed to **19–65% for blog/forum writing**, and **adding more than ~5 reference examples gave diminishing returns**. Under 55% of outputs passed as human-written. ([Catch Me If You Can? Not Yet, arXiv 2509.14543](https://arxiv.org/html/2509.14543v1)) → Translation: you cannot prompt your way to a convincing first-person Substack voice from samples alone. The human has to be in the generative loop.

## 2. How successful AI-assisted writers actually use AI

Consistent pattern across published workflows: **AI is an editor, interviewer, or structurer — almost never the drafter.**

- **Packy McCormick (Not Boring)** uses Claude for research synthesis, outline generation, alt-phrasing suggestions, and self-graded rubrics. Final editorial decisions are human; the whimsical voice is preserved by hands-on writing. ([CO/AI profile](https://getcoai.com/news/founder-of-not-boring-shares-how-he-uses-ai-to-enhance-his-writing/))
- **Every.to's Spiral v3** (Dan Shipper, Oct 2025) is explicitly built on the ghostwriter-interview model: a multi-agent system where one agent *interviews* the user ("Yes, and…" improv-style) before another drafts. It generates three simultaneous drafts to prevent regression-to-mean. Workspaces hold style principles per team. ([Every introducing Spiral v3](https://every.to/on-every/introducing-spiral-v3-an-ai-writing-partner-with-taste); [Every podcast transcript](https://every.to/podcast/transcript-spiral-s-creator-on-why-better-writing-means-better-thinking))
- **Substacker workflows** (Katie Harbath / Anchor Change, et al.) converge on: submit raw unpolished drafts, give explicit guardrails ("do not add ideas, keep personal details, trim only"), compare side-by-side, ask the AI for *reflection questions* rather than rewrites. ([How to Edit Without Losing Your Voice, Anchor Change](https://anchorchange.substack.com/p/how-to-edit-without-losing-your-voice); [AI Clarity Hub](https://aiclarityhub.substack.com/p/how-i-use-ai-to-write-without-sounding))
- **What they refuse to let AI do:** generate ideas, draft from a blank page, choose vocabulary, write openings/closings. ([William B. Irvine on AI ghostwriting](https://morebetterthinking.substack.com/p/should-you-employ-an-ai-ghostwriter))

## 3. Countermeasures (ranked by evidence)

| Technique | Evidence | Effort |
|---|---|---|
| **Voice-note-first: author generates raw transcript, LLM only structures/edits** | Multiple published workflows; preserves actual voice because the LLM never drafts [[1]](https://aimaker.substack.com/p/ai-automation-voice-memo-to-second-brain-notion-substack-notes-newsletter-business-ideas-wisprflow)[[2]](https://weeatrobots.substack.com/p/voice-memo-ai-automation-productivity-workflow) | Author: 5–15 min speaking; tool: Whisper/Wispr Flow/AudioPen |
| **Ban-list negative prompting (em-dash, "delve," hedges, fake-directness)** | Widely adopted; logit_bias works at API level [[3]](https://www.jodiecook.com/ban-list/) | One-time system prompt |
| **Critic-then-rewrite loop with voice rubric** | Iterative critique-refine frameworks improve personalization; voice-specific rubric is the lever [[4]](https://arxiv.org/pdf/2510.24469) | Engineering: 1 day to set up |
| **Few-shot exemplars from author's existing writing** | Helps but caps out at ~5 samples; weak for informal/personal voice [[5]](https://arxiv.org/html/2509.14543v1) | Low; include 3–5 paras in system prompt |
| **"AI as interviewer" pattern (Spiral-style)** | Shipped product; user reports good results [[6]](https://every.to/on-every/introducing-spiral-v3-an-ai-writing-partner-with-taste) | Medium; requires conversational UX |
| **Reader survey / voice-fingerprint detector** | Stylometric detection is feasible at 96%+ accuracy [[7]](https://aclanthology.org/2025.genaidetect-1.6.pdf); can be used as guardrail | `[assumption]` integrating this into Thedi is worth the complexity only if false negatives start appearing |

## 4. Voice-note-first workflow: tooling and quality ceiling

- **Wispr Flow** — live dictation with cleanup; 2026 flagship for "sounds like me" marketing. ([wisprflow.ai](https://wisprflow.ai/))
- **AudioPen** — tuned specifically for "messy voice note → clean prose," user-selectable length. Reviewers call it "excellent for turning voice rambles into clean outlines, posts, or emails." ([WonderTools review](https://wondertools.substack.com/p/voiceai); [Byteful Sunday review](https://bytefulsunday.substack.com/p/my-honest-review-of-audiopen-ai-a))
- **MacWhisper / Whisper API** — raw transcription, no opinions; pair with a separate LLM pass for structure. Preferred by engineers who want full control. ([Jeff Triplett](https://micro.webology.dev/2025/04/30/voice-dictation-with-ai-and/))
- **Descript** — stronger on editing long audio with filler-word removal; overkill for a 5-min ramble.

**Quality ceiling.** `[assumption]` For a technical writer like Ramesh, a 5–10 min voice ramble yields ~800–1500 words of transcript after filler removal; that's roughly one Substack section. Voice is preserved at ~90%+ because the LLM's job is trimming, not generating. The remaining risk is the LLM "improving" technical phrasing and injecting jargon hedges — guardrail via ban list.

---

## 5. Recommendations for Thedi

Ranked by likely voice-preservation quality vs. Ramesh-effort.

### Option A (recommended): **Voice-note-first, LLM as structural editor**
Ramesh records a 5–10 min ramble in response to a Thedi-selected research topic. Transcribe with Whisper. LLM pass is constrained to: (1) remove filler/restarts, (2) add section breaks, (3) flag unclear sentences for Ramesh to fix — **not rewrite them**. Ban-list in system prompt. Deliver a near-publishable draft that is 85%+ Ramesh's words, with his actual cadence.
- **Voice-preservation: highest.** The LLM never drafts.
- **Ramesh effort:** ~15 min per post (ramble) + 20 min review.
- **Ashish effort:** one-time build of audio-intake + transcribe + edit pipeline (existing Butterbase function pattern + Whisper/Groq API).

### Option B: **Interview-bot (Spiral-style) + ban-list rewrite**
Thedi sends Ramesh 3–5 Socratic questions on a topic ("What's the failure mode you see most often with LLM-driven incident response?"). Ramesh answers by voice or text. LLM composes a draft from answers, gated by voice rubric + ban list, with critic-rewrite loop.
- **Voice-preservation: medium-high.** LLM does draft, but anchored to Ramesh's exact phrasings in answers.
- **Ramesh effort:** ~20 min Q&A + 30 min edit.
- **Ashish effort:** higher — conversational state, rubric tuning.

### Option C (not recommended): **Full draft from research, Ramesh edits**
Thedi synthesizes a draft from arxiv+HN findings; Ramesh rewrites to voice.
- **Voice-preservation: low.** Editing slop is cognitively harder than writing from scratch; this is exactly the failure mode Ramesh flagged ("I can't edit LLM slop"). Published writers consistently reject this workflow. ([Anchor Change](https://anchorchange.substack.com/p/how-to-edit-without-losing-your-voice))

**Substack TOS check.** As of April 2026, Substack has no mandatory AI-disclosure policy; disclosure is a voluntary community norm. ([Substack TOS](https://substack.com/tos); [Substack Writers at Work, 2026](https://www.substackwritersatwork.com/p/substack-ai-policy-workshop-2026)) Option A is defensible as "AI-assisted editing" under any reasonable disclosure policy; Option B requires more careful framing.

---

## 6. Signals to watch

These would change my recommendation:

- **Ramesh dislikes speaking to a recorder.** Kills Option A; fall back to Option B with text Q&A.
- **Whisper transcription quality on Ramesh's accent/technical vocabulary is poor.** Would need to test with a real sample; if WER >10% on Saviynt-specific terms, overhead of fixing transcripts negates the workflow advantage.
- **Readers flag drafts as AI-sounding in first 3 posts.** Add stylometric detector in the CI loop; re-tune ban list.
- **OpenAI/Anthropic ship a model with materially better author-style imitation.** The Sep 2025 paper's 19–65% blog-domain ceiling is the current state; if that jumps above ~85%, few-shot + good rubric becomes viable and the voice-note-first friction may not be worth it.
- **Substack ships a mandatory AI-disclosure regime.** Would require clearer labeling and possibly shift reader expectations — Option A's "AI-edited" framing is more defensible than Option B/C.
- **Ramesh's first 2–3 voice-note drafts take >90 min of cleanup.** Signals the LLM editor pass is under-constrained; tighten the "do not rewrite sentences, only flag them" rule.
