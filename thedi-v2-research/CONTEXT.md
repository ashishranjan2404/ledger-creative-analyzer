# Thedi v2 — Shared Context for Research Agents

You are one of 7 parallel research agents contributing to a Thedi v2 design doc.
Read this file to understand the project, the client, and the constraints.
DO NOT cross-reference other agents' briefs — write yours independently.

## The Client

**Ramesh Nampalli** — future Principal Engineer colleague/boss at Saviynt.
Starting a Substack on **agentic AI in DevOps, SRE, and infrastructure**.

Stated goal (his words):
> "Build follower network through meaningful blogs in this space.
> Overtime make some money through paid subscribers."

Desired automation scope (his words):
> "Automate some of these processes and make it easier for you to pick and
> choose directions or research and schedule publishing and editing."

## The Builder

**Ashish Ranjan** — the person building Thedi for Ramesh. About to start a
Principal Engineer role at Saviynt. **Ongoing commitment after build ≤ 2 hrs/week.**
Building for a future boss — compensation/arrangement is explicitly unsolved.

## Thedi v1 — Already Shipped

- Daily cron research scout (arxiv + HN, scoring rubric tuned to agentic AI/DevOps/SRE)
- Email digest delivery via Resend (sender: `thedi@platformy.org`)
- Feedback UI at `/#/f` that feeds next selection round
- Stack: **Butterbase** (Deno serverless functions + Postgres) + **IonRouter** (LLM gateway) + **Resend** (email)

IonRouter details:
- OpenAI-compatible endpoint: `https://api.ionrouter.io/v1/chat/completions`
- Current pipeline uses `qwen3.5-122b-a10b`
- API key lives in Butterbase function env as `IONROUTER_API_KEY` (not on local filesystem)
- Auth: `Bearer ${IONROUTER_API_KEY}`

## Hard Constraints on v2

- **Voice preservation is load-bearing**: Ramesh cannot edit LLM slop; his voice must stay authentic. An AI-dilution failure would kill the Substack before it starts.
- **≤2 hrs/week ongoing from Ashish** after build. Any design requiring persistent engineering babysitting is disqualified.
- **Power dynamic**: Ashish is building this for a future boss at the same company. Financial/arrangement design matters; "it's just a favor" has failure modes.
- **Substack TOS** on AI-assisted content must be verified — not assumed.

## Your Output

- 1–2 page markdown brief, written for a senior engineer audience.
- **Every claim cited or marked `[assumption]`.** Citations as inline links.
- End with a **"Signals to watch"** section: what would change your recommendation.
- Write to the exact file path specified in your agent prompt. Return a <200-word summary of your key findings.
- You may use WebSearch / WebFetch freely. You have access to the IonRouter API for synthesis if helpful (OpenAI-compatible, but no local key — describe what you'd use it for rather than calling it).
- Today's date: **2026-04-19**. Prefer sources from 2025–2026.
