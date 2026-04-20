# Roadmap — first five issues

These are the issues to open on day one. Each is sized for a sitting or two at a two-hour-per-week cadence. Sizes: S ≈ 1–2 sittings, M ≈ 3–5 sittings, L ≈ 6+ sittings.

---

## #1 — Define the ingest schema

**Description.** Specify the minimal JSONL format `agentspy` consumes. One record per line. Each record is an agent turn with a stable `id`, an optional `parent_id` (enabling tree reconstruction), a role, content blocks (text, tool_call, tool_result), and optional timing and cost fields. Document the schema in `examples/fixture-format.md` and publish a JSON Schema file for validation.

**Acceptance criteria.**
- `examples/fixture-format.md` specifies required vs. optional fields with one full example record.
- A JSON Schema file (`schema/turn.schema.json`) validates the example fixtures.
- One worked example showing how a LangGraph trace would map into the schema.

**Size.** S.
**Dependencies.** None. Blocks #3 and #5.

---

## #2 — Repository scaffolding

**Description.** Set up the TypeScript project: `package.json`, `tsconfig.json`, a linter (`eslint` or `biome`), a formatter, a test runner (`vitest`), and a CI workflow that runs lint and tests on every push. Target Node 20+. Decide up front whether to support Deno as a second runtime or stay Node-only; document the decision.

**Acceptance criteria.**
- `npm install && npm test` works on a clean clone.
- CI passes on GitHub Actions for pushes to `main` and PRs.
- `README.md` badges show build status.

**Size.** S.
**Dependencies.** None. Blocks every code-shipping issue.

---

## #3 — JSONL parser to in-memory turn tree

**Description.** Implement the parser: read a JSONL file line by line, validate each record against the schema from #1, reconstruct the parent-child tree from `id` / `parent_id`, and return an in-memory tree structure with typed nodes. Handle malformed lines by surfacing them as diagnostic nodes rather than aborting; a trace with one bad line should still render the rest.

**Acceptance criteria.**
- Given a valid JSONL fixture, the parser returns a tree whose root-to-leaf traversal matches the turn order.
- Malformed lines are reported in a `diagnostics[]` array on the result, not thrown.
- Unit tests cover: empty file, single-turn trace, deep nested trace (20+ levels), trace with one malformed line, trace with orphan turns (parent_id points at a missing id).

**Size.** M.
**Dependencies.** Blocked by #1 and #2.

---

## #4 — TUI renderer

**Description.** Build the terminal viewer. Input: the parsed tree from #3. Output: an interactive, collapsible tree in the terminal using `ink` (React for CLIs) or a lighter-weight alternative. Keyboard navigation: arrow keys to move, Enter to expand/collapse, `q` to quit. Show role, tool name (if any), and latency per node; full content on demand.

**Acceptance criteria.**
- `agentspy trace.jsonl` renders the tree and accepts keyboard input.
- Expand/collapse works on interior nodes.
- Exits cleanly on `q` or `Ctrl-C`; no orphan processes.

**Size.** M.
**Dependencies.** Blocked by #3.

---

## #5 — Example fixtures

**Description.** Add three real trace fixtures to `examples/`: one from a LangGraph run, one from the OpenAI Agents SDK, and one hand-authored trace representing a small custom agent. Each fixture is checked in as JSONL that validates against the schema. These double as demo material and as parser regression tests.

**Acceptance criteria.**
- Three JSONL files in `examples/`, each 20–200 lines.
- Each validates against the schema from #1.
- Each fixture is referenced by at least one unit test in the parser suite.
- The README's Quick Start command runs against one of the fixtures and produces visible output.

**Size.** S.
**Dependencies.** Blocked by #1.

---

## Ordering for a 2h/wk cadence

1. Week 1 — #1 (schema) and #2 (scaffolding) in the same sitting.
2. Weeks 2–4 — #3 (parser) across three sittings.
3. Week 5 — #5 (fixtures) as a short sitting that unblocks regression tests.
4. Weeks 6–9 — #4 (TUI renderer) across four sittings.
5. End of week 9 — tag `v0.1`, flip the repo to public if it isn't already, publish to npm.

This path ships a usable binary at v0.1 with everything after that (web UI, filters, diff, plugins) queued as v0.2+ issues.
