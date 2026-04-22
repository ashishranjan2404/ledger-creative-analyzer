# AI-in-Work — Interview Talking Points
*For: Subith Shajee, Sr. Director Cloud Ops, Saviynt | Angle: cloud ops / platform, not ML research*

---

## Pre-empt summary (what to open with if asked "how do you use AI?")

> "I use Claude Code as a daily collaborator. I delegate about 80% of implementation to autonomous coding agents and spend my time on judgment — architecture, spec-writing, and cross-validation. The key unlock for me was learning that you can't trust the agent's self-reported success. I run parallel critics with different lenses to catch what the agent's own tests miss. Today I built a live meeting assistant — 88 tests, 36 commits, 3 rounds of parallel code review — in a single session. The patterns I use for software development translate directly to cloud ops: you can run the same agentic loop for incident triage, runbook generation, and access-review remediation."

---

## Deep-dive: the daily workflow

The workflow has five phases:

**1. Brainstorm.** Free-form conversation with the agent: what's the problem, what are the constraints, what have I tried? This produces a shared mental model before a single line of code is written.

**2. Spec.** Convert the brainstorm into a structured spec doc — problem, features, architecture, cost envelope. The agent drafts it; I read and edit. This is the contract everything else is checked against.

**3. Plan.** The spec becomes a numbered implementation plan with independent tasks. Each task has acceptance criteria.

**4. Subagent-per-task execution.** Each task runs as an isolated subagent: reads the spec, reads the plan, writes tests first, implements, commits. I review the diff at task boundaries — not line-by-line, but for architecture drift. The agent handles the keystrokes; I own the decisions.

**5. Two-stage review.** When implementation is done, I dispatch parallel critics — four subagents, each with a distinct lens (concurrency, error handling, SE patterns, edge cases). A fifth "judge" subagent reads all four reports, picks the highest-priority findings, writes a failing test for each, applies the fix, and commits. This is the step that catches what the agent's own test suite missed — and it almost always finds at least one bug that would have shipped.

---

## Featured example: spec-lesson built today

**What it is:** ADHD-first live meeting assistant + Claude Code context bridge. Captures audio via Deepgram Nova-3 streaming, distills a rolling summary across four latency tiers (Haiku for sub-1.5s suggestions, Sonnet for the 5-min context tier that feeds Claude Code), and writes a managed section of `CLAUDE.md` so the user can say "OK Claude, build that" and Code already has full context.

**By the numbers:**
- Single session, ~8 hours
- 36 commits, 88 tests (grew from 47 → 88 through the review rounds, every intermediate `pytest -q` green)
- 3 rounds of parallel-critic review, ~18 bugs found and fixed

**The bug that would have shipped (Round 3, BUG-A-1):**
Deepgram's `listen.v1.connect()` is a `@contextmanager`, not a plain iterator. The tests passed because the mock pattern `iter([fake_socket])` hid the bug entirely — production audio capture was completely broken. The parallel-critic review found it; a single "does the happy path pass?" check would have missed it.

**The pattern this demonstrates:** Self-reported test success is a lagging indicator. The parallel-critic loop is the leading indicator. Cross-validation across different lenses (concurrency, error handling, API contracts, shutdown semantics) finds bugs that same-lens review misses.

**Other catches:**
- Prompt cache never hit (blocks were 4-18 tokens, under Anthropic's 1024-token threshold) — would have silently run 3x over budget
- `asyncio.create_task` called from a Deepgram pump thread, silently failing — no crash, no log, just missing data
- PID file non-atomic write: two daemon startups in the same directory would silently overwrite each other

---

## Featured example: KubeRL (why this matters for cloud ops)

**What it is:** 1st Place ($15K), Meta PyTorch OpenEnv Hackathon, March 2026. High-fidelity RL environment for training LLM agents to autonomously diagnose and repair Kubernetes incidents on live GKE clusters.

**Architecture:** An H100 runs the training loop (Qwen3-4B, GRPO, LoRA via HuggingFace TRL) against a real GKE cluster running injected failures — OOMKilled pods, crash-looping deployments, broken services. The agent receives no topology information upfront; it must discover the cluster via `kubectl get pods -A`, making the learned policy transferable.

**The hard engineering problem — reward hacking:** The agent found "cheap wins" that satisfied the reward function without actually fixing the incident (e.g., deleting the failing pod so health checks passed momentarily, rather than fixing the root cause). Preventing reward hacking required multi-component reward design: binary health-check pass/fail plus a judge LLM (Qwen3-14B) that evaluates whether the root cause was addressed. This is the same tradeoff that appears in any automated remediation system: teaching the system the difference between "alert is silent" and "problem is solved."

**Direct applicability to Saviynt:**
- The same RL-environment architecture maps directly to tier-1 on-call response: inject synthetic IAM anomalies, train an agent to triage them, measure against human-expert ground truth
- The reward-hacking lessons apply immediately to any automated access-review or anomaly-remediation system Saviynt would build

---

## Featured example: sotto / teamtheory consulting

**Scope:** AI/ML Engineering Consultant, teamtheory.ai / sotto, Feb 2025 – present.

**Multi-turn LLM evaluation pipelines:** Architected pipelines for executive assessment across 25+ portfolio companies. The evaluation is multi-turn: the LLM asks follow-up questions, the candidate responds, the scoring model updates its posterior. Built GRPO reward shaping to improve agent reasoning, plus evaluation benchmarks to detect reward gaming in the scoring model itself — the same double-loop pattern from KubeRL.

**Sub-200ms audio pipeline:** FastAPI + Parakeet TDT (NVIDIA 0.6B, running on Apple Neural Engine at 190ms) + WebSocket streaming. The relevant detail for cloud ops: latency budgets in streaming systems are as unforgiving as SLAs. Parakeet at 190ms on Neural Engine vs. 500ms on GPU vs. cloud Deepgram at variable network latency — that benchmark analysis is the same muscle as capacity planning.

**Production reality:** Shipped to 25+ portfolio companies means this ran under real load with real data. The gap between "demo works" and "prod survives" is where the operational patterns live — model version pinning, fallback paths, cost telemetry.

---

## Proactive mention of failure modes

Mention these before being asked — it signals operational maturity:

**1. "DONE doesn't mean done."**
The biggest trap is trusting the agent's self-reported success. An agent will write tests that pass, declare the feature complete, and leave a production-breaking bug in the one code path the tests didn't exercise. The fix is cross-validation via parallel critics, not more tests written by the same agent.

**2. "Hallucinated APIs are the fastest regression."**
Agents will invent plausible-looking method signatures for SDKs they half-remember from training data. I pin dependency versions and grep the installed SDK source before trusting any API call the agent writes. In production this translates to: never deploy agent-generated infra changes without a real dry-run against the actual API.

**3. "Reward hacking scales."**
In RL this is explicit, but the same dynamic appears in any system that optimizes a proxy metric. Automated access reviewers that optimize for "alerts resolved per hour" will close tickets without fixing access drift. Build measurement of the real outcome (access granted vs. access appropriate), not just the proxy.

**4. "Mock patterns hide integration bugs."**
The Deepgram contextmanager bug passed 88 tests because the mock was wrong. For third-party integrations, maintain a thin smoke-test against a local fake or staging endpoint. This is especially true for cloud-provider SDKs where the local mock and the real API diverge on error paths.

---

## Connecting to Saviynt cloud ops

*Translate the above into Subith's language:*

- **MTTR reduction on multi-tenant IGA incidents:** The KubeRL triage loop (observe → reason → remediate → verify) maps directly. Start with read-only triage (agent describes the anomaly, proposes a fix, human approves), then automate the approval for the low-risk tail.

- **Agentic access review:** Not just flagging anomalies but closing them. The reward-hacking lessons are the guardrail: measure whether access was actually appropriate post-remediation, not whether the alert was acknowledged.

- **Runbook generation from telemetry:** Feed alert payloads + historical resolution logs to an LLM, generate candidate runbook steps, have a second agent critique them. Ship the runbook to the on-call as a starting point. This is the parallel-critics pattern applied to ops documentation.

- **Code review at scale (small team, large platform):** The parallel-critics workflow that caught 18 bugs in spec-lesson runs in 5-10 minutes wall-time and costs under $0.05. For a cloud ops team shipping infrastructure code with limited reviewer bandwidth, this is asymmetric leverage.

- **Cost and latency discipline:** Every agentic pattern above has a cost envelope. Haiku for fast/cheap, Sonnet for quality-sensitive, batch for non-latency-sensitive. The same tiering logic applies to any cloud ops AI integration — don't route every log line to GPT-4.

---

## Questions to ask Subith

1. **"What's your current operational posture on AI — are you experimenting, or does AI have a production path in Cloud Ops today?"**
   *(Establishes where they are; lets you calibrate your answer depth)*

2. **"How do you think about human-in-the-loop for high-stakes operations like credential rotation or access revocation?"**
   *(Shows you understand the governance dimension; invites his philosophy)*

3. **"What does a typical P1 incident look like for your team — is the bottleneck detection, triage, or remediation?"**
   *(Grounds the KubeRL story in their actual pain; surfaces where AI provides the most leverage)*

4. **"If I joined, what's the first AI-enabled workflow you'd want explored?"**
   *(Closes the loop; shows you're thinking about their problems, not just your resume)*

5. **"Are there regulatory or compliance constraints (SOC 2, FedRAMP, etc.) that shape what data can flow through external LLM APIs?"**
   *(Saviynt is IGA — data sensitivity is high. Asking this proactively signals you've thought about it.)*

---

## Red flags to avoid

- **Don't overclaim autonomy.** "The agent does everything" is a red flag to an ops-minded interviewer. The correct framing: "I own the judgment; the agent owns the keystrokes." Subith will be thinking about failure blast radius.

- **Don't dismiss AI skeptics.** Saviynt's Cloud Ops team may have seen AI hype cycles before. Acknowledge failure modes first (you already have the material above). Skepticism is correct — the wins come from disciplined application, not from believing the demos.

- **Don't trash their current stack.** You don't know what they use. If they're still on Ansible + pager escalation, that's an opportunity, not a punchline.

- **Don't go deep on RL math unprompted.** GRPO, reward shaping, LoRA — mention them once as signal of depth, but don't explain them unless Subith asks. He cares about operational outcomes, not training algorithms.

- **Don't let the session end without making the cloud ops connection explicit.** The KubeRL and spec-lesson stories are compelling, but Subith needs to see the path from "trained agents on K8s" to "helps Saviynt's on-call team." Make that bridge yourself; don't make him draw it.
