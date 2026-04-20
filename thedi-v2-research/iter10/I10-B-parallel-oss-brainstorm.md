# I10-B — Parallel career-narrative OSS: candidate brainstorm and pick

*Iter-10 deliverable. Amendment D2 (iter-6 pre-mortem, §12-month audit row; iter-6 trip-wire "Opportunity-cost narrative") requires Ashish to pre-commit to a second OSS project on his own GitHub **before** beginning Thedi v2 build. D2's structural claim: under the success path, Thedi v2 is net-zero to slightly negative for Ashish's external career narrative — it reads as "helpful engineering for a coworker's Substack," not as a pinned repo that advertises platform/agentic-AI chops. This brief picks the parallel project.*

*Binding constraints: ≤2 h/wk sustained (same cap as Thedi); MIT license on Ashish's personal GitHub; zero overlap with Saviynt IAM/IGA/PAM; zero overlap with Ramesh's newsletter tooling; must develop a muscle Thedi does not.*

---

## Section 1 — Brainstorm

### Candidate 1 — `agentspy`: structured-log viewer for LLM agent traces

**Pitch.** A local-first TUI + web viewer that ingests OpenAI/Anthropic/LiteLLM/IonRouter tool-call traces (JSONL) and renders them as a collapsible tree: turn → tool call → tool result → turn, with token/latency/cost per node and a diff view for re-runs of the same prompt. Ships as a single `pip install agentspy` binary and a `docker run` one-liner. No backend, no auth, no SaaS.

**Career-narrative fit.** Directly adjacent to "agentic AI / platform engineering" — every serious agent team in 2026 is re-inventing this viewer in-house. A clean OSS version is a conspicuous signal that Ashish thinks at the platform-infrastructure layer, not the app layer. The ecosystem is crowded enough to validate demand (LangSmith, Helicone, Langfuse, Arize Phoenix) but sparse at the local-first, no-SaaS end — which is the defensible niche.

**2h/wk test.** Plausible. Core viewer is <2 kLOC; the work for months 2–12 is schema adapters (Anthropic tool-use schema; OpenAI Responses API; MCP tool traces; AI SDK), each of which is a 1–2 hr self-contained PR. Crucially, every time Ashish debugs Thedi's IonRouter pipeline he generates a trace he wants to view — so the project *feeds itself* rather than requiring separate dev energy.

**§2870 safety.** Clean. Observability ≠ IAM. Trace viewers are a developer-tools category; Saviynt does not build developer tools. The one risk seam is if `agentspy` grew an auth feature — keep it local-only (no accounts, no multi-tenant), which is also the product differentiator, so the incentives align.

**Audience.** Stars from agent-framework users, ML/infra engineers, DX folks at AI labs. Contributors: people who want a trace adapter for their framework. Interview citation: "I got tired of re-implementing this at work and shipped the minimal version" reads as the kind of thing Principal Engineers do.

---

### Candidate 2 — `tool-call-evals`: benchmark harness for LLM tool-use reliability

**Pitch.** A small, opinionated eval harness that measures one thing well: given a tool schema and 50–200 synthetic user utterances, does the model call the right tool with the right arguments? Ships with reference suites for filesystem, HTTP, and SQL tool schemas; supports any model via LiteLLM; emits a leaderboard JSON that can be committed to a repo and diffed across model versions.

**Career-narrative fit.** Evaluations are the underappreciated career work of 2026 — "I can tell you empirically which model to use for tool-calling, and here's the harness I wrote" is a durable technical credential. Pairs especially well with a Principal-Engineer role because PE-level work is supposed to produce reusable evaluation frameworks, not one-off demos. Distinguishes Ashish from the "I built a chatbot" hackathon surface area his current repos read as.

**2h/wk test.** Tight but workable if Ashish resists the urge to grow suite coverage. The discipline is: ship the harness, publish one leaderboard run per quarter, accept PRs for new suites from contributors. Quarterly cadence is 2h/wk's natural rhythm. Where it breaks: if it takes off and becomes a Papers-With-Code-for-tool-calling, the maintainer burden spikes and he has to hand it off or cap scope.

**§2870 safety.** Clean. LLM capability evaluation is not IAM. No user data, no auth, no enterprise security angle.

**Audience.** AI-lab researchers, AI-SDK maintainers, agent-framework leads. Cited in job interviews by people benchmarking their own tool-calling work against it. Lower star ceiling than `agentspy` but higher-prestige contributors.

---

### Candidate 3 — `dryprose`: Markdown linter for executive/technical writing

**Pitch.** A CLI + pre-commit hook that flags hedging, vague quantifiers, unsupported superlatives, and passive-voice-where-active-voice-exists in Markdown — configured by style profile (`--profile=dry-executive` being the default, and the one Ashish writes the Thedi docs in). Not Grammarly; not Vale with 60 style packs. One opinionated profile, auditable rules, sub-100ms on a 10kLOC repo.

**Career-narrative fit.** Weakest of the five on "agentic AI" signal but strongest on "thing Ashish will use every day and therefore maintain for years." The dry-executive prose in the Thedi research docs is a genuine stylistic asset; codifying it is intellectually honest. Signals craft and self-awareness to a technical-writing audience (tech-lead blog readers, Principal-Engineer peers) — but does not build the agentic-AI credential D2 is specifically asking for.

**2h/wk test.** Excellent. Linters are the most 2h/wk-compatible OSS category that exists: a linter ships rules, not features. Each rule is a self-contained PR with a test file.

**§2870 safety.** Trivially safe. Writing tools.

**Audience.** Staff/Principal engineers writing RFCs; technical writers; Substack-adjacent engineering-blog authors. Small but durable. *Caveat: overlaps with Thedi's "voice preservation" subject matter in an awkward way — this brief's §Meta-note explicitly disallows Thedi-adjacent projects, and `dryprose` sits in that gray zone.*

---

### Candidate 4 — `mcp-lab`: Model Context Protocol server scaffolder and test bench

**Pitch.** A `create-mcp-server` CLI (like `create-react-app`, but for MCP) that scaffolds a typed Python or TypeScript MCP server with a test harness, a mock MCP client, a schema validator, and a `lab/` directory for prompt-driven integration tests. Includes a "golden trace" test pattern: record an agent's tool-call sequence against the server, diff on re-run.

**Career-narrative fit.** Maximum agentic-AI-platform signal. MCP is the protocol Anthropic is pushing and the ecosystem is ~12–18 months old — early, credible contributions are disproportionately visible. "I wrote the scaffolder everyone uses to start an MCP server" is the cleanest possible pinned-repo story for a PE moving toward AI platform work.

**2h/wk test.** Risky. MCP spec is moving; keeping the scaffolder current against spec drift could burn 4–6 h/wk in months where Anthropic ships breaking changes. Mitigation: pin to a spec version, bump quarterly. If Ashish can hold the line on "this tracks the latest LTS-ish MCP revision, not every RC," it fits.

**§2870 safety.** Mostly clean with one caveat. MCP servers frequently wrap IAM-adjacent systems (a corporate SSO MCP server, an Okta MCP server, a secrets-manager MCP server). The *scaffolder itself* is neutral infrastructure; the risk is that Ashish is tempted to ship example servers that overlap Saviynt territory. Rule: example servers ship only for non-IAM domains (filesystem, calendar, weather, SQL). Enforceable in `CONTRIBUTING.md`.

**Audience.** MCP-curious engineers at every AI-adopting company in 2026. High star ceiling. Potential contributor pool is large and the space is land-grab-phase.

---

### Candidate 5 — `corpustree`: local-first Git-backed note/research-corpus tool

**Pitch.** A CLI that treats a Markdown notes directory as a first-class research corpus: semantic search over headings, tag-graph traversal, per-file frontmatter schemas, and a `corpustree export` command that produces a deterministic flattened bundle ready for LLM context. Essentially Ashish's own digital-garden tooling, formalized. The thing he'd use for the Thedi research package itself.

**Career-narrative fit.** Solid-but-not-spectacular. Developer-tool for knowledge workers is a respected but saturated category (Obsidian ecosystem, Logseq, Foam, Dendron). The differentiator would have to be the "LLM-context-bundle" angle — which *is* agentic-AI-adjacent but in a minor way. Reads as craft, not as platform chops.

**2h/wk test.** Borderline. Personal-knowledge tools generate scope creep because the author's own usage reveals infinite edge cases. Ashish would have to be ruthless about saying no to feature requests. Most maintainers in this category fail this test.

**§2870 safety.** Clean.

**Audience.** Obsidian power users; researchers; note-taking Twitter. Overlaps awkwardly with the Thedi "Ramesh corpus" problem — meta-note §meta calls that out as disqualifying.

---

## Section 2 — Comparison table

| # | Name | Build time to v0.1 | Pinned-repo signal (1–5) | 2h/wk sustainability (1–5) | Saviynt adjacency risk (1 safe – 5 risky) | Overlap with Thedi learnings (1 independent – 5 overlapping) |
|---|---|---|---|---|---|---|
| 1 | `agentspy` | ~15–20 h | **5** | **4** | 1 | 3 |
| 2 | `tool-call-evals` | ~10–15 h | **5** | 4 | 1 | 3 |
| 3 | `dryprose` | ~8–10 h | 2 | **5** | 1 | **4** (voice-prose overlap) |
| 4 | `mcp-lab` | ~25–30 h | **5** | 2 (spec-drift risk) | 2 (IAM-example temptation) | 2 |
| 5 | `corpustree` | ~20–25 h | 3 | 2 (scope creep) | 1 | **4** (research-corpus overlap) |

Reminder: high Thedi-overlap is *bad* for D2's purpose. Candidates 3 and 5 are disqualified or penalized on that axis.

---

## Section 3 — Recommendation

**Pick: Candidate 1, `agentspy` — the local-first LLM agent trace viewer.**

It is the only candidate that scores 5 on pinned-repo signal, 4+ on sustainability, 1 on Saviynt adjacency, and ≤3 on Thedi overlap simultaneously. The critical property is the self-feeding work loop: every hour Ashish spends debugging Thedi's IonRouter pipeline produces a trace he wants to view in `agentspy`, which means `agentspy` improvements are a byproduct of Thedi work rather than a competitor for the same 2 hours. This is the structural answer to the 2h/wk sustainability problem that kills most parallel OSS efforts.

On career narrative: trace viewers are the kind of infrastructure a Principal Engineer ships — they read as "this person thinks about the platform layer" rather than "this person built a chatbot." The Saviynt adjacency is cleanly zero because observability is not IAM and the product's local-first commitment (no accounts, no SaaS) both strengthens the differentiation and closes off the single seam that could drift into Saviynt territory. Candidate 4 (`mcp-lab`) was the serious alternative and would generate higher peak visibility, but the 2 h/wk sustainability risk from MCP spec drift violates D2's standing ≤2 h/wk cap — and a parallel project that blows past its time budget defeats the whole point of D2, which is that Thedi's opportunity cost must be bounded. The explicit reject is Candidate 3 (`dryprose`): it is the most sustainable and the one Ashish would most enjoy, but its prose-style focus overlaps the voice-preservation problem at the heart of Thedi, which violates the meta-note's "not a byproduct of helping Ramesh" rule.

---

## Section 4 — Day-1 action

Tomorrow (2026-04-20), alongside texting Ramesh the coffee invite, Ashish spends **30–45 minutes** on exactly this:

1. **Init the repo (5 min).** `github.com/<ashish>/agentspy`, MIT license, Python 3.11+, `pyproject.toml` scaffold, empty `src/agentspy/` and `tests/`. Private is fine for day 1; flip public at v0.1.

2. **Write the 500-word README (25 min).** Five sections, executive register:
   - *What it is.* One paragraph: local-first viewer for LLM agent traces; no SaaS; `pip install agentspy; agentspy view trace.jsonl`.
   - *Why.* Two sentences on the gap between LangSmith-class hosted tools and the `jq`-in-a-terminal status quo.
   - *Non-goals.* Explicit: no accounts, no cloud, no multi-tenant, no metrics backend, no eval harness (that's a different project).
   - *Trace format.* One JSONL line per agent turn; schema-stable across Anthropic/OpenAI/LiteLLM via adapters.
   - *Status.* "v0.1 in progress. See [ROADMAP.md]."

3. **Commit `ROADMAP.md` with three v0.1 tasks (10 min):**
   - **T1.** Anthropic tool-use trace adapter: parse a JSONL of `messages.create` calls with `tool_use`/`tool_result` content blocks into the internal turn-tree schema. Target: 30 LOC + fixture.
   - **T2.** TUI tree viewer: `agentspy view trace.jsonl` opens a Textual-based collapsible tree of turns with token counts at each node. Target: 150 LOC.
   - **T3.** Cost/latency annotation: per-node $-cost from Anthropic's published prices + wall-clock latency. Target: 50 LOC + a prices table.

4. **Signal of commitment.** Push the three commits (init, README, ROADMAP) to the personal GitHub with MIT license visible in the repo root. This is the artifact that exists *before* Ashish writes any Thedi v2 code — D2's precondition is met.

That is the whole day-1 surface. v0.1 ships from here at 2 h/wk over 4–6 weekends. No further planning is required in iter-10.
