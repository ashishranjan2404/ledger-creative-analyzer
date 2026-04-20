# Vision

## The problem as of 2026

Agent traces are JSONL streams — one line per turn, with tool calls and tool results as nested content blocks, and state that threads across turns. The observability category, as it exists in commercial tooling today, was designed for request-response systems: one span in, one span out, attributes flat. Agent runs break that model. A single user request produces a tree of turns 8–40 deep; a tool call inside a turn has its own latency and cost; a handoff between agents carries context that isn't visible in any individual span.

The OpenTelemetry GenAI semantic conventions are incubating [verify current version], which means a spec exists on paper but no shipped primitive in the common SDKs produces trace data that renders well in an OTel-native UI. The practical state of the art is: `jq` on a JSONL file, or a hosted backend (LangSmith, Langfuse, Helicone, Arize Phoenix, Braintrust) that requires an account and a network upload.

There is a gap between those two. The gap is a local-first, read-only viewer that takes a JSONL file and gives you a tree.

## What `agentspy` is

A viewer. Not a platform. Not a collector. Not an evaluator.

Input: a JSONL file with one agent turn per line. Output: a navigable tree rendered either in the terminal or in a localhost web page. Navigation is expand/collapse, filter, and search. Two traces can be diffed side by side. That is the product.

There is no SDK to install in your agent. There is no background daemon. There is no login. The CLI is a process that reads a file, renders a view, and exits when you close it.

## Design principles

- **Local-first.** Every invocation starts on your laptop and ends on your laptop. The file you point it at never leaves your disk.
- **No network calls, ever.** Not for telemetry. Not for "checking for updates." Not for fetching tool schemas. The binary works offline on an air-gapped machine. This is enforceable and tested.
- **No auth, no accounts, no multi-tenant.** Each user's data is their own, sitting on their own disk, viewed by their own shell. There is no notion of a user record because there is no server that would need one.
- **Minimal surface.** The tool does one thing and exits. Features that grow surface area (sharing, alerting, streaming) are explicit non-goals; they push the product toward the hosted-observability category that already has strong options.
- **Open ingest format.** The JSONL schema is documented, small, and not proprietary. Adapters translate framework-specific traces into it; writing a new adapter is a ~100-line contribution.

The no-auth and no-network properties are not only product differentiators. They also keep `agentspy` structurally clear of any identity-management, access-control, or multi-tenant-data territory. This matters: the author maintains this project alongside day-job work in adjacent infrastructure, and a viewer that cannot reach a network and cannot authenticate anyone is a viewer that cannot drift into IAM-adjacent scope. The safety property is aligned with the product property; there is no tension.

## What it explicitly isn't

- A hosted service.
- A Datadog / Honeycomb / Langfuse / LangSmith competitor.
- An agent-evaluation framework or scoring harness.
- A multi-user or team tool.
- An SDK for anything.

The surface stays small on purpose. Features that would grow the surface past "viewer" get declined, even if they would be useful, because the viewer category is under-served precisely because it's boring and the interesting categories have crowded out investment in it.

## Roadmap shape

- **v0.1** — Reads LangGraph JSONL trace output. Renders as collapsible turn tree in the terminal via `ink` or equivalent. Exit cleanly. Ship on npm.
- **v0.2** — Localhost web viewer. Same data, same tree, mouse-driven expand/collapse. Server binds to loopback only. Shuts down with the parent process.
- **v0.3** — Filter by role or tool name. Search within a trace. Diff two traces side by side.
- **v0.4+** — Format adapters as a plugin surface: OpenAI Agents SDK, Claude Agent SDK, Mastra, whatever. Each adapter is an independent package.

No promise on dates. Work proceeds at the maintainer's available time, which is bounded.

## How it relates to the author's other work

`agentspy` is the tool the author wanted while debugging a real agent pipeline and didn't have. Every trace from that pipeline is a trace the viewer needs to render well, so product feedback is generated as a byproduct of unrelated day-to-day work. That is the sustainability model: the viewer improves because it gets used, and it gets used because the author has agents to debug.

It is intentionally not adjacent to newsletter tooling, writing tooling, content pipelines, or any knowledge-management category. It is developer infrastructure for people debugging agent runs on their own machines, and it stays there.
