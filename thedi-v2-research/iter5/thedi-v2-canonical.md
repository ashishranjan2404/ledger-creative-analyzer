# Thedi v2

*Canonical plan. Audience: Ashish (builder) and Ramesh (future boss), both reading on phones. Senior-engineer register.*

---

## Executive Summary

Thedi v2 is a small graph of Butterbase serverless functions that scouts public sources, interviews Ramesh in 4–6 Socratic prompts, drafts prose anchored to his verbatim phrasings, and gates every output behind a rubric critic and a human-approval step before he manually pastes to Substack. Three decisions are already locked and drive every section below.

**First, the voice workflow is interview-bot primary with a voice-note silence-fallback.** Pure few-shot imitation is disqualified: the [Sep 2025 authorship paper (arXiv 2509.14543)](https://arxiv.org/html/2509.14543v1) caps blog-register imitation at 19–65% accuracy, below the threshold that keeps Ramesh's Substack from reading as slop. Ramesh answers 4–6 Socratic prompts by text; the drafter anchors to his verbatim answers; the critic scores against a weighted rubric. When Ramesh goes silent ≥2 weeks, the pipeline offers an on-device MacWhisper voice-memo path — no raw audio ever crosses a wire.

**Second, Ramesh self-hosts his own Butterbase app.** He owns the account, the billing card, and every upstream key. Ashish ships a one-shot installer and a 10-line-per-key rotation runbook, then holds zero standing production credentials. This is the only configuration under which the "Ashish silent four weeks" test passes and the §2870 OSS framing stays honest.

**Third, the North Star is conversation-required.** Ramesh's stated "follower network; over time, paid subs" expands into three incompatible Year-1 builds — paid-primary (~$200–600/mo), sponsorship-primary (~$400–900/mo), or one $15K advisory engagement that dwarfs either — and a fourth scenario (using Thedi as a Saviynt hiring funnel) that is off-limits because it detonates the §2870 carve-out. Ashish's recommendation is (C) advisory-funnel with (B) sponsor as free byproduct, but the build pauses on Ramesh's pick.

**Execution order.** Coffee with Ramesh first, §2870 letter second, code third. There is a roughly 40% probability Ramesh's real answer is *"just email me a Friday digest, I don't need a pipeline"* — and if that's the answer, the attorney fee, the letter filing, and seven weekend blocks are all sunk. The legal scaffolding is a hard dependency for committing code, not for having coffee. Talk first, build if the answer justifies it.

**Compensation.** MIT-licensed OSS on Ashish's personal GitHub, a written California Labor Code §2870 carve-out letter from Saviynt on file before the next commit, Ramesh self-hosts, no money flows, best-effort OSS-maintainer support capped at ≤2hr/week. Retainer, gift-then-host, and rev-share all silently become unpaid contracting inside a reporting chain.

**The single biggest risk.** IonRouter silently routes a drafter call to a different model mid-pipeline — voice drift would accumulate for weeks before anyone noticed. The highest-leverage single control in the system is a one-line `response.model == expected` assertion per call site with email-Ramesh-on-mismatch. **That one-line assertion is the first line of code that ships.**

---

## Recommended Architecture

```
                                 ┌───────────────────────┐
                                 │  Daily cron (scout)   │   reused from v1
                                 │  arxiv + HN scoring   │   + pgvector dedup
                                 └──────────┬────────────┘
                                            │
                                 ┌──────────▼────────────┐
                                 │ Weekly topic-picker   │
                                 │ email to Ramesh       │
                                 │ "top 3 — reply to pick"│
                                 └──────────┬────────────┘
                                            │  Ramesh picks topic (HITL #1)
                                            │
       ┌────── silence ≥ 2 wks ─────────────┤
       │                                    │
 ┌─────▼──────────────┐            ┌────────▼────────────┐
 │ Voice-note fallback│            │  Interview-bot      │
 │ on-device          │            │  4–6 Socratic Q&A   │
 │ MacWhisper → text  │            │  via email or web   │
 └─────┬──────────────┘            └────────┬────────────┘
       │                                    │  Ramesh answers
       └───────────────┬────────────────────┘
                       │
                 ┌─────▼─────────────┐
                 │ PII/redaction pass│   Saviynt deny-list
                 │ (Butterbase fn)   │   US-pinned models only
                 └─────┬─────────────┘
                       │
                 ┌─────▼─────────────┐
                 │  Drafter          │   IonRouter kimi-k2.5
                 │  anchored to      │   verbatim Q&A +
                 │  verbatim phrasing│   cadence markers
                 └─────┬─────────────┘
                       │
                 ┌─────▼─────────────┐
                 │  Critic           │   IonRouter gpt-oss-120b
                 │  rubric scoring   │   separate context
                 │  ban/keep list    │   different model family
                 └─────┬─────────────┘
                       │  weighted score < 65?
                       │
                 ┌─────▼─────────────┐
                 │  Rewriter         │   kimi-k2.5 (same as drafter)
                 │  max 2 rounds     │
                 └─────┬─────────────┘
                       │
                 ┌─────▼─────────────┐
                 │ HITL #2: /admin   │   Butterbase-hosted markdown
                 │ compose editor    │   editor; Ramesh approves
                 └─────┬─────────────┘
                       │  Ramesh pastes to Substack (manual, 5–10 min)
                       │
                 ┌─────▼─────────────┐
                 │ Substack publish  │
                 └─────┬─────────────┘
                       │
                 ┌─────▼─────────────┐
                 │ Auto-syndicate    │
                 │ LinkedIn  (API)   │
                 │ X         ($0.01) │
                 │ Substack Notes    │
                 │   (manual)        │
                 └───────────────────┘

Cross-cutting controls (every IonRouter call):
  • response.model == expected_model_for_stage   (hard-fail + email)
  • PII/Saviynt deny-list redaction before transmit
  • Model pinning to US-routed variants for Ramesh-authored text
  • Weekly health email to Ramesh (Mon 07:00 PT)
  • Cron heartbeat watcher (26hr no-show → alert)
  • 90-day key rotation runbook (Ramesh-driven)
  • /admin silence-counter: 14 days no login → pipeline auto-pauses
```

### Node rationales

**Scout.** Reused from Thedi v1 (arxiv + HN scoring for agentic-AI / DevOps / SRE). One upgrade: embedding-based dedup against 90-day rolling `published_posts` using Butterbase-native `vector(1536)` columns and `openai/text-embedding-3-small` via the built-in AI gateway. Cosine >0.82 drops the candidate as "already covered"; 0.70–0.82 surfaces it as a sequel candidate with lineage labeling; <0.70 is novel. ~$0.15/year at weekly cadence.

**Weekly topic-picker email.** Thursday 07:00 PT: top-3 candidates with one-line "why this one" rationales, sequel-lineage labels where they apply, and reply-link selection. Ramesh effort: ~2 minutes. First HITL gate; topic selection is the highest-leverage editorial decision.

**Interview-bot.** Once Ramesh picks, the generator produces 4–6 Socratic questions drawing from six archetypes (war-story, strong-opinion, counter-take, concrete-metric, origin-story, sequel-hook). Ramesh answers by text in an emailed form or `/admin` web UI. Archetype rotation and three-stage dedup (exact-hash, archetype+topic+nouns, cosine >0.88) prevent "didn't you just ask me this" fatigue. Minimum 500 words of Ramesh input per session — below that, the week skips rather than drafts slop. The plan also supports Ramesh picking modality per topic: some weeks keyboard Q&A, some weeks a voice memo from a Saturday walk. Both are first-class inputs.

**Drafter.** IonRouter `kimi-k2.5` (EQ-Bench Creative 1,663.8, top of the OSS pool at ~1/5 the cost of Claude Sonnet per [evy.so benchmarks](https://evy.so/compare/best-llms-for-writing/)). Inputs: Q&A verbatim, extracted cadence markers from the cold-start seed interview, and scout sources. Preserves Ramesh's exact phrasings where possible. Asserts `response.model == moonshotai/kimi-k2.5`; hard-fail on mismatch.

**Critic.** IonRouter `gpt-oss-120b` — separate call, separate context, different model family, ~20× cheaper than the drafter. Scores on seven rubric dimensions (weights in parens): voice_fidelity (2.0), factual_accuracy (1.0), concreteness (1.0), flow_coherence (1.0), slop_absence (1.5), hedge_density (1.0), topic_coherence (1.0). Weighted threshold: 65/85 to approve. Outputs scores plus up to 5 concrete line-anchored edits. 22-entry slop ban list v1 (`delve`, `in the realm of`, em-dash density >2/400 words, "it's not X it's Y" construction, etc.) with each entry sourced to published analysis.

**Rewriter.** Same model as drafter. Hard cap at 2 rounds per [Self-Refine](https://arxiv.org/abs/2303.17651) and [Reflexion](https://arxiv.org/abs/2303.11366) evidence that quality plateaus after rounds 2–3.

**HITL #2 — `/admin` compose editor.** Butterbase-hosted markdown editor with live preview, pinned Q&A-verbatim sidebar, click-to-jump critic edits, and autosave. Ramesh approves → copy-to-clipboard → he pastes to Substack manually. Replaces any third-party CMS: Substack has no publish API and its TOS bans session-cookie automation; routing through Beehiiv exposes Ramesh's launch account to AUP pattern-detectors regardless of the Q&A-as-meaningful-human-input defense. Composing in `/admin` keeps the blast radius inside infrastructure Ramesh already owns.

**Auto-syndicate.** LinkedIn via the official `w_member_social` Posts API; X pay-per-use (~$0.01/post); Substack Notes manual (the reverse-engineered session-cookie path is a TOS risk on Ramesh's account). LinkedIn Newsletters stay out of scope — no API.

**Silence-fallback.** When Ramesh is silent ≥2 weeks (or picks modality per topic), on-device MacWhisper transcribes a voice memo locally. Hard rule: no raw audio on any wire. Protects against an IAM-company employee routing voice with incidental Saviynt context through a 4+ processor chain.

**Orchestrator.** Butterbase Deno functions with an explicit state machine in Postgres (`scout_complete → topic_sent → topic_picked → qa_sent → qa_in_progress → qa_closed → drafting → critiquing → rewriting → review_pending → approved → published → syndicated`). No LangGraph, no CrewAI — both are Python-first and don't fit the Deno runtime. `pipeline_events` is the single source of truth; every screen projects from it.

**Silent-failure detection.**
- **Model-ID assertion** per call site — 10 LOC total, first thing that ships.
- **Weekly health email** (Mon 07:00 PT): drafts/approvals/publishes, model-assertion pass rate, scout dedup stats, rubric-score trend, IonRouter spend WoW, key-expiry countdowns. If it fails two weeks running, escalate to both parties.
- **Cron heartbeat watcher** — every job writes to `health_heartbeats`; 26hr no-show alerts Ramesh.
- **Key-expiry watcher** — T-7 email, T-0 circuit-break on 401/403.
- **Budget alert** — IonRouter weekly spend > $2 (baseline <$0.20).
- **Voice-drift detector** — 3-post rolling `voice_fidelity` mean drops >1pt vs. prior 8-post mean → flag in next health email.
- **`/admin` silence counter** — 14 days no Ramesh login → `pipeline_paused=true` automatically, unpauses on next visit. Raises to 30 days during the manual-first build window (see Roadmap) since the pipeline has nothing to pause.

**Rubric safety interlock.** When a rubric delta ships, the pipeline auto-pauses for the duration of the golden-set revalidation job. Four lines of code, ships before the critic goes live. Prevents a three-way write collision between Ashish's delta approval, Ramesh's compose-editor save, and an in-flight rewriter — a collision the pipeline UI otherwise hides because the state machine thinks the post is still in `rewriting`.

---

## Phased Roadmap

Each task carries **[build hours · Ramesh-input-required · irreversibility]**. Irreversibility is how hard it is to back out if the call was wrong.

### Phase 1 — weeks 1–2: unblock the Ramesh conversation

The goal of Phase 1 is **not** to ship the pipeline. It's to have coffee, confirm the North Star and the 5-point agreement, file the legal artifacts, and put one working MVP end-to-end in front of Ramesh so he can make the decisions that unblock Phase 2. A runnable reference skeleton of the Phase-1 pipeline (schema + `interview_bot` → `drafter` → `critic` functions, model-ID assertions wired) lives at `iter7/prototype/` and is deploy-ready once env vars land.

**Order matters. The coffee conversation is the gate, not the legal filing.**

**Manual-first is required, not an option.** Ramesh drafts 3–5 posts directly into `/admin/compose` with `source='manual_paste_for_calibration'` before the interview-bot ever runs a real session. This stabilizes the rubric on essay-cadence signal rather than Q&A-cadence signal, and — more load-bearing — it diagnoses which Ramesh you're actually building for. A Ramesh who can't produce 3 manual posts in six weeks is a Ramesh the pipeline cannot rescue; learning that cheaply is the point. The interview-bot activates on post 6.

| # | Task | Build | Ramesh input | Irreversibility |
|---|---|---|---|---|
| 1 | **30-minute coffee with Ramesh.** North Star pick (A/B/C, explicitly not D) + 5-point agreement verbal walk-through. One-sentence North Star in Ramesh's own words captured verbatim. | 0h | **Yes — the one unblocking conversation** | Reversible |
| 2 | §2870 letter drafted, pressure-tested by a CA employment attorney (~1hr, $400–600), filed with Saviynt Legal. **Split from the moonlighting disclosure** — the §2870 letter stays purely IP-scope and does not name Ramesh; the moonlighting disclosure goes to HR the same day and does name him, routed to the desk whose job it is. | 2h draft + 1h attorney | Informational | **High** — once filed, creates a paper trail |
| 3 | Send the 5-point agreement email; require `"I agree"` reply (a bare "yes" is weaker evidence and the plan treats ambiguous replies as a `replied_ambiguous` state with a scripted one-line follow-up). | 0h (already written) | **Yes** | Reversible |
| 4 | Commit `RECUSAL.md` + `RECUSAL_LOG.md` as initial repo commit, signed. Reference it as a binding representation in the §2870 letter so it becomes commitment to Saviynt, not just to self. | 0h (drafted) | No | Low |
| 5 | **Ship `/admin/compose` first**, with `source='manual_paste_for_calibration'` as the primary (not fallback) input surface. Markdown + preview + autosave; no Q&A sidebar yet because there's no Q&A yet. | ~4h | No | Low |
| 6 | Ramesh drafts 3–5 posts directly into `/admin/compose`. Approvals flow to Substack. Each paste trains the rubric and the voice-marker baseline. | 0h build | **Yes — 3–5 posts over 4–6 weeks** | Low (throwaway if he can't) |
| 7 | Add scout dedup: `pgvector` column on `topics` + `published_posts`, 90-day rolling, 0.82/0.70 thresholds. | ~4h | No | Low |
| 8 | Interview-bot MVP gated on post 6: topic-picker email → 4–6 Q&A form → answers in Postgres. Activated only after the manual-paste baseline is stable. | ~8h | Yes — first Q&A | Low |
| 9 | **Ship full `/admin` dashboard**: alerts panel, rubric-delta sign-off view, pipeline-events timeline, OAuth settings. Vanilla JS SPA served from a Butterbase frontend deployment; Google OAuth with email allowlist. | ~6h | No | Low |
| 10 | Model-ID assertion on every IonRouter call. | 1h | No | Low |

**Phase 1 gate:** (a) Ramesh has picked a North Star in his own words, (b) written `"I agree"` to the 5 points, (c) the §2870 letter is countersigned, (d) at least 3 manual posts have shipped through `/admin/compose`. If any is blocked, Phase 2 does not start.

### Phase 2 — weeks 3–6: full pipeline

| # | Task | Build | Ramesh input | Irreversibility |
|---|---|---|---|---|
| 1 | Critic stage (`gpt-oss-120b`, weighted 7-dimension rubric, threshold 65) with 2-round rewriter cap. | ~6h | No | Low |
| 2 | Rubric-recalibration loop: diff detector, LLM-proposed deltas, two-gate approval (Ashish via signed email link, Ramesh via `/admin/rubric`), default-reject on silence, cap 1 shipped delta/week. Rubric-ship auto-pauses pipeline for golden-set revalidation. | ~5h | No (weekly 1-click per delta) | Low |
| 3 | Cold-start seed interview tool: 30-min one-off Q&A, cadence-marker extraction, seed rubric + 5-draft golden set. | ~3h | **Yes — 30 min one-off** | Low |
| 4 | PII/redaction pass: regex + LLM, Saviynt-internal deny-list lives in Ramesh's instance only. | ~4h | **Yes — initial deny-list** | Low |
| 5 | Installer: one-shot script over `mcp__butterbase__*` (schema apply, 13 function deploys, env map, Google + LinkedIn OAuth, RLS, frontend). Smoke-test exercises every credential end-to-end. | ~8h | No (consumed at install) | Low |
| 6 | `docs/ROTATION.md` — per-key 10-line sections, 90-day cadence, explicit Tue/Thu evening support window. | ~3h | No | Low |
| 7 | `fn_weekly_health`: counts, model-assertion pass rate, spend, key-expiry countdowns. | ~3h | No | Low |
| 8 | Cron heartbeat + 26hr watcher. | ~1h | No | Low |
| 9 | Model-eval harness per-stage: Butterbase function + eval prompts + LLM-as-judge; golden-set divergence >1pt on any dimension → pipeline pause + email. | ~5h | No | Low |
| 10 | LinkedIn OAuth integration (`w_member_social`) + auto-syndicate on publish. | ~3h | **Yes — OAuth consent** | Low |
| 11 | X pay-per-use integration. | ~2h | Yes — API key | Low |
| 12 | Synthetic end-to-end post button on `/admin/pipeline`: canned topic + canned Q&A, exercises every real API, stops before publish. Weekly during the manual-first window. Catches the 5-week-silent-rot class of failure (model-alias retirement, OAuth scope bump, DNS drift) before the first real post hits it. | 2h | No | Low |
| 13 | Install Phase 2 on Ramesh's Butterbase account. **Call is 90 min expected, 3 hours booked** — happy path is ~40% probability and the honest per-step sum is 180 min. LinkedIn OAuth round-trip is the single most likely failure point; dry-run against a throwaway account within 48 hours of the real call. **If the install runs past its booked window, Ashish does NOT temp-host.** The agreed phrase is *"Let's stop here. I'll patch and reschedule."* | ~2h + ~90–180 min Ramesh | **Yes — 3-hour block** | **High** |
| 14 | Post-install: rotate service key, delete Ashish staging instance, revoke Ashish 1Password access, commit `HANDOFF.md` with timestamps. | ~1h | No | **High — the handoff commitment** |

**Phase 2 gate:** 5 posts shipped end-to-end on Ramesh's own Butterbase without Ashish touching prod. Weekly health email firing cleanly. Rotation runbook exercised at least once.

### Phase 3 — post first subscriber cohort (~50–200 free subs)

Gated on Phase 2 completion. Tasks conditional on the North Star pick.

| Task | Build | Ramesh input | Irreversibility |
|---|---|---|---|
| Engagement dashboard aligned to North Star: advisory inbound DMs + attribution log (C) / engaged-opens + reply rate + Notes restacks + per-post paid conversion (B) / paid MRR (A). Reply rate, Notes restack count in first 72h, and scroll-depth-weighted read-time replace raw open counts as leading indicators — raw opens are bot-polluted in 2026. | ~6–10h | Possibly reader survey (C) | Low |
| Rubric-recalibration automation: diff detection + digest active; manual kill-switch if 3-week escalation fires. | ~3h | No | Low |
| Founding-member tier (A or B): $100–150/yr capped, Stratechery-style support tier, **no extra content obligation**. | ~4h | **Yes — pricing + Substack tier** | Medium |
| Sponsor-ready audience report generator (B): monthly auto-PDF of engagement stats. | ~5h | No | Low |
| Reader-survey + inbound attribution tagging (C). | ~4h | Yes — survey content | Low |
| Beehiiv analytics integration for per-post opens/clicks/unsubs (secondary surface only; the compose path stays in `/admin`). | ~3h | No | Low |
| **Month-4 checkpoint conversation (calendar-scheduled for 2026-07-20).** 30 min, one-page discussion template: the post-5 honest voice-fidelity read, week-skip accumulation, "is this still fun for you" gut check, scope-creep audit. Written to the tracker the same day. | 0.5h prep | **Yes — 30 min** | Reversible |
| **Month-6 checkpoint conversation (calendar-scheduled for 2026-09-21).** 30 min, one-page discussion template: Phase-3 North Star gate — has the chosen metric actually moved, or has "pipeline health green" become a proxy for "project succeeding"? Options named explicitly: pivot North Star, accept smaller upside, wind down. | 0.5h prep | **Yes — 30 min** | **Medium — this is the designated pivot moment** |

**Phase 3 gate:** honest measurement of the chosen North Star, adjudicated at the Month-6 checkpoint. If the metric hasn't moved by then, the scenario may be wrong — revisit with Ramesh before building more. The two checkpoints exist because silent drift is the class of failure that has no auto-detector; a calendar invite is the mitigation.

---

## Open Questions for Ramesh

Each question has acceptable answers and what it unblocks. All seven fit in a 30-minute coffee.

1. **North Star.** Three Year-1 scenarios are incompatible; the compromise serves none. **Scenario D — using Thedi as a hiring funnel for Ramesh's Saviynt team — is explicitly off-limits.** It detonates the §2870 carve-out by making Thedi directly Saviynt-adjacent (the OSS project would be generating a direct Saviynt benefit, the textbook §2870(a)(1) fact pattern). The brief to Ramesh must rule it out explicitly, not by omission. *Acceptable:* "(A) paid because X"; "(B) sponsor because X"; "(C) advisory-funnel-NOT-into-Saviynt because X"; "between (B) and (C)". *Unacceptable:* anything that says "I want this to help me hire at Saviynt." *Unblocks:* Phase 3 direction; paywall vs. analytics emphasis.

2. **Manual-first cadence: how many posts, over how many weeks?** The plan requires 3–5 Ramesh-authored posts in `/admin/compose` before the interview-bot activates; rubric calibration on Q&A register alone produces invisible essay-voice slop. The question for coffee is pace, not principle. *Acceptable:* "3 posts over 4 weeks"; "5 posts over 6–8 weeks"; "I'll need 2 months to produce 3 — is that okay?" *Unacceptable:* "let's just ship the pipeline on post 1." *Unblocks:* the Phase-1-to-Phase-2 gate timing; the silence-counter threshold during the manual-first window (raised to 30 days); the month-4 checkpoint date.

3. **§2870 carve-out: timeline and attorney review.** The letter goes on file before the next commit, pressure-tested by a CA employment attorney because the "demonstrably anticipated R&D" exception in §2870(a)(1) is the real attack surface — Saviynt's "AI-for-identity" roadmap could be read as overlapping "agentic AI in DevOps/SRE" regardless of product-category distinction. The letter must affirmatively describe the technical subject matter Thedi does *not* touch (identity data, access decisions, authorization graphs, credential vaults) and include the "incidental use of LLMs does not constitute subject-matter overlap" disclaimer. *Acceptable:* "go ahead, file"; "send me the draft first"; "let me run by my attorney, 2 weeks." *Unblocks:* any public OSS repo push.

4. **Existing-corpus availability.** Voice-anchoring assumes a corpus of Ramesh long-form writing. If zero public corpus exists, the cold-start seed interview produces the initial 2,000–3,000-word voice-marker base. *Acceptable:* "I have N public posts at URL"; "private docs I can share"; "nothing — let's do the seed interview." *Unblocks:* Phase 2 rubric seed; Phase 1 post-1 validation.

5. **Frequency target.** *Acceptable:* "weekly"; "biweekly"; "one deep post every 10 days"; "monthly with deeper posts." Note that weekly on a Principal Engineer's schedule is the single most common burnout-quit cadence; one post every 10 days is the sustainable default a seasoned Substacker would pick. *Unblocks:* cron schedule; silence-fallback threshold; topic-picker email template.

6. **Privacy/data-handling comfort.** Ramesh works at an IAM company; his drafts incidentally touch Saviynt-adjacent context. The pipeline passes text through IonRouter (including Chinese-hosted models like Kimi by default) and Resend. *Acceptable:* "fine with US-pinned models + deny-list redaction"; "I need to run the data-flow 1-pager by Saviynt Legal first"; "only on-device transcription — no cloud ASR ever." *Unblocks:* model-pinning config; whether voice-note fallback ships at all.

7. **Name-and-brand.** "Thedi" is Ashish's project on `platformy.org`. If the author-facing sender is `thedi@platformy.org`, it may feel like Ashish's brand; `thedi@nampalli.dev` is cleaner post-handoff. *Acceptable:* "keep Thedi, it's fine"; "rename the sender"; "rename the whole thing." *Unblocks:* Resend sender setup; installer defaults.

---

## Compensation / Arrangement Recommendation

*Load-bearing. Read before writing any more code.*

### The arrangement

1. **MIT-licensed open source** on Ashish's personal GitHub. Not a Saviynt org, not an LLC.
2. **Written §2870 carve-out letter from Saviynt Legal on file before the next commit.** Attorney-reviewed. Filed as two separate documents the same day: the §2870 letter to Legal (IP-scope only, no Ramesh by name) and the Outside Activities / moonlighting disclosure to HR (names Ramesh and the guardrails). Fusing them routes the worst combination of facts to the worst first reader.
3. **Ramesh self-hosts his own Butterbase.** He owns the app, the billing, every upstream key. After the Phase 2 handoff, Ashish holds no standing credentials in production. The only Ashish-owned dependency is the Google OAuth client in the existing `thedi-493804` project, because migrating it costs Ramesh nothing and would force a reconsent.
4. **No money flows between coworkers.** No retainer, no flat fee, no rev-share, no 1099, no LLC. If any dollar ever moves, the Outside Activities disclosure is updated and re-filed in writing before receipt.
5. **OSS-maintainer best-effort support from Ashish**, capped at the ≤2hr/week social norm. GitHub Issues is the documented channel. Support window is Tuesday and Thursday evenings, 19:30–21:00 PT — weekday-default, not weekend-default. Documented in `docs/ROTATION.md` and referenced in `RECUSAL.md`.
6. **Ashish pre-commits to a parallel, career-narrative OSS project before the v2 build starts.** First commit on that second repo lands before the first commit on Thedi v2. Thedi accrues to Ramesh; under every plausible North Star, the honest twelve-month audit shows Thedi as net-zero-or-slightly-negative for Ashish's own career narrative. The parallel project is the structural answer, not a nice-to-have. Thedi cannot be the only pinned repo on Ashish's GitHub when the first job interview or internal promo conversation asks what he's been building.

### Why this, and not each alternative

- **Retainer.** Ongoing monthly fee from Ramesh to Ashish creates a reporting-chain conflict of interest. Every month becomes a potential dispute. Disqualified.
- **Gift-then-host.** Ashish builds free, hosts free, holds keys. Silently becomes unpaid contracting in a reporting chain. The "Ashish silent 4 weeks" test fails at the first expired key. Disqualified.
- **Revenue share.** Ashish's income becomes a function of Ramesh's writing output. Re-negotiation every quarter. Tax mess. Disqualified.
- **Flat fee + 1099.** Mechanically clean but still a direct payment from coworker to coworker needing conflict-of-interest disclosure. Fallback only if Ramesh refuses OSS.
- **LLC contractor.** $800/yr CA franchise tax + admin overhead for a ≤2hr/wk engagement. Only if the dollar amount is material and flat-fee is chosen.
- **"We'll figure it out."** Universally disqualified across every career-advice and employment-law source cited. The failure mode, not an option.

### What the OSS framing supports

Public repo, permissive license, Ramesh self-installs. Ashish's obligation is the obligation of any maintainer to any user: none beyond goodwill. §2870 position maximally preserved — prior-art-by-Ashish, timestamped, public.

### What the OSS framing does NOT support

Ashish holding Ramesh's IonRouter / Resend / LinkedIn / Anthropic keys. Ashish rotating those keys on a schedule. Ashish responding at 2am when the digest didn't send. Ashish debugging an AUP flag on Ramesh's account. All four are contracting. If any persists past the 2-week Phase 2 staging bridge, the arrangement has silently become flat-fee and needs re-papering.

### The one sentence

> "I'll build it, I'll help you install it on your own Butterbase account, and from then on it's yours. I'll keep the repo healthy the same way any OSS maintainer does. I don't hold your keys and I'm not on call."

### What not to say

> "It's just a favor, don't worry about it."

The word "just" is the canonical scope-creep tell in every freelance-contract failure-mode writeup.

### The fallback if Ramesh rejects OSS

Flat fee, one invoice, written contract, frozen scope, Saviynt conflict-of-interest disclosure filed before the invoice. Not the recommendation; the only safe alternative.

---

## Red Flags & Failure Modes

### Risks and mitigations

| Risk | What it looks like | Mitigation (ship-or-skip) |
|---|---|---|
| **Silent model swap on IonRouter** | Drafter returns `gpt-oss-120b` when `kimi-k2.5` was expected; voice drifts for weeks unseen | `response.model == expected` assertion per call site, hard-fail, email Ramesh. 10 LOC. First line of code that ships. |
| **Install slides to Ashish-hosted** | Pair-install runs past booked 3-hour window; LinkedIn OAuth redirect is the likely culprit | If install doesn't complete in its booked session, Ashish does NOT temp-host. Agreed phrase: *"Let's stop here. I'll patch and reschedule."* Dry-run against a throwaway `ramesh-test` account within 48 hours of the real call. |
| **Beehiiv AUP flag on Ramesh's launch account** | Pattern-detectors hit LLM prose regardless of Q&A-as-meaningful-human-input defense; public reputational hit | Compose in `/admin` (Butterbase-hosted markdown). Beehiiv stays out of the compose path entirely. |
| **Rubric drift via Ashish autopilot** | Ashish approves deltas during a Saviynt-busy week; voice shifts without Ramesh authorizing | Two-gate approval: Ashish approves via signed email link, Ramesh confirms via `/admin/rubric` one-line prompt. Default on Ramesh silence: no-change. Cap 1 delta/week. |
| **A3×B4 write collision** | Rubric ships → golden-set revalidates async → critic rewrites mid-window → Ramesh's stale-tab compose save clobbers the rewriter body | Rubric-ship auto-pauses pipeline for revalidation duration. 4 LOC. Ships before Phase 2 critic goes live. |
| **Email-only control plane fails** | Principal Engineer inbox bankrupts; silent-failure emails buried | `/admin` dashboard is the second control surface. 14-day no-login → pipeline auto-pauses; 30-day during manual-first build window. |
| **B2 manual-first window wastes the rubric** | Pipeline installed but idle; Ramesh drafts in Bear; rubric gets zero Ramesh-edit signal; post 6 debuts on seed-rubric slop | `/admin/compose` accepts finished-post paste with `source='manual_paste_for_calibration'` during conservative mode; recalibration loop treats it as real signal. |
| **5-week install→first-real-load rot** | Install completes green; 5 weeks pass under B2; upstream drift silently breaks the stack; post 6 is the first bug | Weekly "synthetic end-to-end post" button on `/admin/pipeline` during the manual-first window. Canned topic + canned Q&A, flows through real APIs, stops before publish. |
| **Ambiguous "yes" from Ramesh** | Reply is warm but doesn't restate commitments; later evidence is mush | Reply must be `"I agree"`, not `"yes"`. The tracker has a `replied_ambiguous` state and a scripted one-line follow-up. Repo stays frozen until the written agreement is in hand. |
| **Ambiguous-yes drifts into silent yes** | Initial agreement holds on paper; months pass; Q&A depth thins; approvals get shorter; nobody has the "is this still fun" conversation | **Month-4 checkpoint conversation, calendar-scheduled 2026-07-20.** 30 min, one-page discussion template. Forcing function — the meeting is the mitigation. |
| **Phase-3 "pipeline green = project healthy" substitution** | North Star metric hasn't moved at month 6; both parties avoid the conversation because six months invested; health email keeps reporting green | **Month-6 checkpoint conversation, calendar-scheduled 2026-09-21.** 30 min, one-page discussion template with three explicit options: pivot North Star, accept smaller upside, wind down. Silent drift has no auto-detector; a calendar invite is the mitigation. |
| **Saviynt-channel contact about Thedi** | Slack ping, work-email DM, hallway ask | One-sentence reply: *"Please open a GitHub issue."* Create the public record. If Ashish forgets and answers on Slack, Ramesh pushes back. |
| **Q&A fatigue / silent voice degradation** | Q&A answer <100 words; cumulative <500 words/week; two consecutive `voice_fidelity` <7 | Pipeline skips the week; email Ramesh *"this week needs more input — voice-note it or skip?"* |
| **Scenario D pitched in month 4** | "Let's use this as a hiring funnel for Saviynt's agentic AI team" | Anti-scenario call-out in the North Star brief. Scripted response in the conversation: Thedi does not process candidate data and isn't used for Saviynt recruiting; public thought leadership is fine, targeted recruiting through the tool is not. |
| **Performance-review-season feature ask** | Any Thedi request within 30 days of a Saviynt perf/comp touchpoint | Decline with *"let me look after the review cycle."* Request stays in GitHub issues. |
| **Revenue asymmetry** | Thedi-attributable revenue >$500/mo sustained 3 months | Pause; re-paper with an attorney. Outside Activities disclosure updated before any dollar moves. |
| **"Just a quick fix" scope creep** | The words "just" or "quick" in a feature request; Ramesh's estimate shorter than Ashish's gut | 14-day cooling-off on GitHub issues before any implementation. |
| **Opportunity-cost narrative** | Ashish asked about Thedi in a job interview or internal promo | Pre-empt: commit to a second, career-narrative OSS project before v2 ships. Thedi cannot be the only pinned repo. |
| **Partner-cost of weekend blocks** | Phase 1 + Phase 2 book 7+ consecutive Saturdays; month 3 the pattern frays | Documented weekday-default support window (Tue/Thu 19:30–21:00 PT) in `docs/ROTATION.md` and `RECUSAL.md`. In writing before Ramesh says "I agree." |
| **Shadow-AI policy review at Saviynt** | All-hands, policy update, or compliance survey mentions shadow AI / personal side projects | Moonlighting disclosure is already on file; refer to it; do not scramble. |

### The single thing that must be true

Ramesh must agree, **in writing, before any v2 code ships**, to five conditions:

1. OSS under Ashish's personal GitHub.
2. Ramesh runs it on his own Butterbase account with his own keys.
3. All support happens in GitHub issues — no Saviynt-channel crossover (Slack, work email, in-person, 1:1s).
4. Thedi pauses if Ramesh becomes Ashish's direct manager or on his comp chain — enforced by `RECUSAL.md`.
5. Re-paper with a lawyer at a pre-stated revenue threshold ($500/mo sustained over 3 months).

If any one is soft, everything else is window-dressing for unpaid contracting in a reporting chain. The compensation section is the ceiling; **this list is the floor, not the ceiling**.

---

## Appendix: Reading Map

The research briefs and iter-2/3/4 deliverables are the primary sources. Read the one that matches what you're about to execute.

- [**Round 1 briefs 01–07**](../round1/) — SOTA pipelines; voice preservation (the load-bearing brief, arXiv 2509.14543); Substack/Beehiiv APIs; newsletter economics; multi-agent orchestration; IonRouter model selection; power dynamics & compensation.
- [**`iter2/D1-interview-bot-and-rubric.md`**](../iter2/D1-interview-bot-and-rubric.md) — paste-ready generator prompt (6 archetypes, 3-stage dedup, 500-word minimum), 7-dimension weighted rubric with 1/5/10 anchor examples, paste-ready `gpt-oss-120b` judge prompt with few-shot exemplars, 22-entry slop ban list v1, golden-set revalidation protocol (>1pt divergence on any dimension → pipeline pause).
- [**`iter2/D2-installer-walkthrough.md`**](../iter2/D2-installer-walkthrough.md) — minute-by-minute install call, full `mcp__butterbase__*` sequence, 20-step dry-run protocol, per-failure branching, `HANDOFF.md` template, honest 3-hour time budget with 2× buffer.
- [**`iter2/D3-paper-artifacts.md`**](../iter2/D3-paper-artifacts.md) — §2870 carve-out letter template (with attorney-review `[verify]` tags intact), 5-point agreement email, `RECUSAL.md` + `RECUSAL_LOG.md`.
- [**`iter3/I3-A-week-1-action-checklist.md`**](../iter3/I3-A-week-1-action-checklist.md) — hour-by-hour checklist. Note the canonical plan inverts its opening move: coffee with Ramesh runs before the attorney consult, not after.
- [**`iter3/I3-B-outside-reviewers.md`**](../iter3/I3-B-outside-reviewers.md) — experienced Substacker + CA employment attorney, independent passes. Substacker wants slow-down (10 manual posts first); attorney wants the legal papering split and tightened. Both independently flagged Scenario D.
- [**`iter3/I3-C-dashboard-and-dedup.md`**](../iter3/I3-C-dashboard-and-dedup.md) — `/admin` 5-screen UX spec with data contracts and state-machine projection; scout pgvector dedup with cosine 0.82/0.70 thresholds and sequel-lineage table.
- [**`iter4/I4-A-final-red-team.md`**](../iter4/I4-A-final-red-team.md) — amendment-interaction risks (A2×B2 empty stage; A3×B4×D1 write collision; install-exercises-nothing under B2; ambiguous-yes handling; partner-cost of weekend blocks). The "what would I actually do" paragraph is the reason coffee runs before letter in this plan.
- [**`iter4/I4-B-ramesh-conversation-script.md`**](../iter4/I4-B-ramesh-conversation-script.md) — literal 30-minute script: North Star pick, 5-point ratification, logistics. Anchor line: *"The reason it's in writing isn't that I don't trust you — it's that I don't trust future us to remember what present us agreed to, on a bad Tuesday, when something's on fire."*

*End of canonical plan.*
