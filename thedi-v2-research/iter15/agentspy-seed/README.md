# agentspy

A local-first viewer for LLM agent traces.

## What it does

`agentspy` reads a JSONL file of agent turns — tool calls, tool results, model responses, handoffs — and renders it as a collapsible turn tree. Two front-ends: a terminal UI for pipe-friendly debugging, and a minimal localhost web viewer for the same data. It ingests a small, open JSONL schema and ships with adapters for common agent-framework trace formats.

It is a viewer. It does not collect, forward, store, index, or evaluate traces. It reads the file you give it and prints a tree.

## Why it exists

As of early 2026, nobody can introspect their own agents. Observability tooling is built around request-response services; agent runs are deeply nested tool-call trees with long tail latencies and state that carries across turns. The OTel GenAI semantic conventions are incubating but no shipped primitives have landed in the common SDKs. Practitioners debug by greping JSONL or by paying for a hosted backend. This project is the viewer that should exist on your laptop, at no cost, without an account.

Local-first is the design constraint, not a footnote. Every invocation starts and ends on your machine. There is no network call at any point in the happy path.

## Quick start

```
npx agentspy trace.jsonl              # TUI tree view
npx agentspy --web trace.jsonl        # opens http://localhost:7357
npx agentspy --format=langgraph t.jsonl
```

The CLI exits when you exit. The web server binds to loopback only and shuts down when the process ends.

## Scope

**In scope.** JSONL ingest. Turn-tree rendering. Expand/collapse. Filter by role or tool name. Diff two traces. Format adapters as plugins.

**Not in scope.** Trace collection. SDK instrumentation. Live streaming from a running agent. Uploading anywhere. Accounts. Multi-user views. Team sharing. Evaluation or scoring. Metrics backends. Alerting. An SDK for anything.

If you want those, the category has well-funded hosted options. `agentspy` is the viewer you reach for when you have a trace on disk and a question about it.

## Status

Pre-alpha. Repository seeded 2026-04-19. v0.1 target: a working parser and TUI against one trace format. See [`docs/ROADMAP.md`](docs/ROADMAP.md) for the first five issues.

## Contributing

Issues welcome, particularly format-adapter contributions and schema feedback. This is a side project maintained on personal time at roughly two hours a week; expect async review windows, not on-call responsiveness.

## License

MIT. See `LICENSE`.
