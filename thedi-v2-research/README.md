# Thedi v2 — Research Package

This folder is the complete research record behind Thedi v2, an agentic newsletter-drafting pipeline being built for Ramesh Nampalli (future Principal Engineer colleague at Saviynt) to support his Substack on agentic AI in DevOps / SRE / infrastructure. The research ran on 2026-04-19 across 22 iterations — ten rounds of agent-dispatched research (round1 through iter15) followed by twelve iterations of direct ground-truth verification via MCP and code reading (iter16 through iter22). It exists because the arrangement (building production software for a future boss at the same company) has more failure modes than the code itself, and most of them are not technical. The research is the answer to "what could go wrong that I haven't thought of yet?"

> **⚠ Read the late-correction banner in [`DECISION.md`](DECISION.md) first.** Iterations 18–22 materially shifted several assumptions the earlier research was built on: Thedi v1 is less than 24 hours old (not established), Ramesh is already a user who gave concrete feedback on digest 1, and the landing page promises sources the scout doesn't yet deliver. The v0-first recommendation survives; the tomorrow-morning action sequence changed.

---

## Folder structure

| Path | What it is |
|---|---|
| `CONTEXT.md` | Project framing, client/builder, Thedi v1 stack, hard constraints. The seed prompt every round-1 agent received. |
| `round1/` | 7 parallel research briefs on independent sub-questions (01 SOTA pipelines, 02 voice preservation, 03 Substack/Beehiiv APIs, 04 newsletter economics, 05 multi-agent orchestration, 06 IonRouter model selection, 07 power dynamics + compensation). |
| `round2/critic-report.md` | Gap and contradiction analysis across the seven round-1 briefs — what they missed, where they disagreed. |
| `round3/` | 3 refinement briefs resolving the critic's top follow-ups (A voice workflow, B North Star conversation, C production ops). |
| `round4/thedi-v2.md` | The iteratively-amended plan with all A-, B-, and C-amendments visible in the text. The full 394-line working document. |
| `round5/red-flag-report.md` | Initial adversarial pass — the first attempt to break the plan. |
| `iter2/` | 3 deep-dive artifacts (D1 interview-bot spec + voice rubric, D2 minute-by-minute installer walkthrough, D3 paper artifact templates — §2870 letter, 5-point email, RECUSAL.md). |
| `iter3/` | 3 final-mile artifacts (I3-A week-1 action checklist, I3-B two simulated outside reviewers, I3-C admin dashboard + dedup spec). |
| `iter4/` | Final red team (I4-A) and the literal 30-minute Ramesh conversation script (I4-B). |
| `iter5/` | Canonical consolidated plan (`thedi-v2-canonical.md`), the exec briefing for Ramesh, and this README. |
| `iter6/` | 12-month pre-mortem timeline (I6-A) and Ramesh archetype sensitivity analysis (I6-B). The pre-mortem walks month-by-month through success and failure paths; the archetype analysis stress-tests the plan against five different Rameshes and concludes manual-first dominates under every one. |
| `iter7/prototype/` | Runnable Phase-1 MVP skeleton: schema + `interview_bot` → `drafter` → `critic` Butterbase Deno functions, model-ID assertions wired, deploy-ready once env vars land. |
| `iterations/` | Timestamped snapshots of the main plan after each iteration — historical record of how the document evolved. |

---

## Recommended reading order

**If you have 5 minutes** — read `iter5/exec-briefing-for-ramesh.md`. That's the plan's core, written for Ramesh, written for a phone.

**If you have 30 minutes** — read `iter5/thedi-v2-canonical.md`. One clean consolidated document. No amendment labels, no archaeology.

**If you have 2 hours** — read `round4/thedi-v2.md` end-to-end (the full amendment trail is part of the value — you see what changed and why), then `iter4/I4-A-final-red-team.md` for the fresh-eyes adversarial pass with everything integrated.

**If you need to execute tomorrow** — open `CHECKLIST.md`. It's the only file you need; every action maps to the specific artifact that holds its template / script / runbook. Tomorrow-morning action is a one-line iMessage text in `iter12/I12-execution-ready-artifacts.md` §1.

**If you need to execute Phase 1** — `CHECKLIST.md` is still the entry point. For the contingent-on-Branch-1 (v2) path, open `iter3/I3-A-week-1-action-checklist.md` with the C1 override applied (coffee before §2870), then `iter2/D2-installer-walkthrough.md` for the install protocol, and `iter4/I4-B-ramesh-conversation-script.md` for the 30-minute conversation script.

**If you want to see the code before the plan** — `iter7/prototype/` has the runnable Phase-1 MVP skeleton (schema + three Butterbase Deno functions). Read its `README.md` first; the known-limitations section is the honest map of what Phase-1 weeks 3–6 still has to ship.

**If you want to see what Ramesh's first post actually looks like** — `iter14/I14-sample-thedi-post.md` is a fully written 1,223-word post on agent observability in production incident-response, with self-score. It validates that the premise produces interesting content and the dry-executive voice is achievable, not brittle.

**If you're starting the `agentspy` parallel OSS project (D2 requirement)** — `iter15/agentspy-seed/` has the full starter kit: README, VISION, ROADMAP with first 5 issues, fixture-format spec, GitHub issue template, and a private NOTES.md. First issue to tackle is #1 (define the ingest schema) — do NOT gitignore the `agentspy-seed/NOTES.md` file by mistake when you commit; it's specifically marked private and should never be pushed to the public repo.

**If you're planning the 90-day v0 retrospective** — `iter13/I13-90day-retro-template.md` has the tracking sheet columns, the 45-minute meeting agenda, the decision matrix (4 outcomes with quantitative triggers), the biases to watch for, and the pre-meeting solo worksheet. Calendar-block it now for 2026-07-20.

**If you're stress-testing the plan** — read `iter3/I3-B-outside-reviewers.md` first (the two simulated outside reviewers — experienced technical Substacker + CA employment attorney — are the sharpest external pressure-test in the package; they disagree on tempo, which is itself informative). Then `iter6/I6-A-12-month-premortem.md` for the month-by-month failure-mode arc, and `iter6/I6-B-ramesh-archetype-sensitivity.md` for the five-Ramesh stress test that led to the "manual-first is mandatory" call.

---

## The one insight you shouldn't miss

**C1 — invert the execution order. Coffee with Ramesh before the §2870 letter, not after.**

The plan as originally drafted runs: attorney consult → file §2870 letter → wait 14 days for countersignature → have the Ramesh conversation → build. That order is wrong. There is roughly a 40% probability Ramesh's real answer to the North Star question is *"just email me a Friday digest, I don't need a pipeline."* If that's the answer, the attorney fee, the letter filing, the Saviynt HR disclosure, and the seven scheduled weekend blocks are all sunk. The §2870 letter is a hard dependency for **committing code**. It is not a hard dependency for **having coffee**. Ask the question first; build the legal scaffolding in the week after his answer justifies it.

This is the single highest-leverage call in the whole document. The C1 insight is in `iter4/I4-A-final-red-team.md` under "what would I actually do."

**Its nearest rival — and a co-requirement — is the manual-first mandate.** Ramesh drafts 3–5 posts directly into `/admin/compose` before the interview-bot ever activates. Iter-6's archetype analysis (`iter6/I6-B`) shows this dominates under every Ramesh archetype — skeptic, reluctant, over-engaged, disengaged, fully-engaged — because it calibrates the rubric on essay voice rather than Q&A voice, and because it diagnoses which Ramesh you actually have before the expensive scaffolding commits. Coffee-first answers *whether* to build; manual-first answers *what* to build. Paired with a third structural requirement — Ashish pre-commits to a parallel career-narrative OSS project before Thedi v2 starts (see iter-6's pre-mortem month-12 audit) — these are the three load-bearing calls. Every other amendment evaporates in value if any of them is wrong.

---

## What is NOT in this package

No amount of research covers the things Ashish still has to do himself:

- Have the actual coffee with Ramesh. The script in `iter4/I4-B` is a script, not a conversation.
- Choose the California employment attorney. Three names get emailed tonight (per `iter3/I3-A`); the shortlist itself is Ashish's call.
- Pay for the attorney (~$400–600). Real money, Ashish's personal card.
- Get Saviynt Legal to actually countersign the §2870 letter. The template is in `iter2/D3`; the answer from Legal is not.
- Write the code. The plan specifies build-hours per task; none of them write themselves.
- Say "no" when Ramesh asks Ashish to temp-host, or to take a flat fee, or to answer a Slack ping. The scripts are in `iter4/I4-B`; delivering them is still a conversation between two humans.

The research de-risks the first weeks. It does not replace them.
