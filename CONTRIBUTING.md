# Contributing to spec-lesson

Thank you for your interest in contributing. This document covers the development workflow.

---

## Running the tests

```bash
# Install the package in editable mode with dev dependencies
pip install -e ".[dev]"

# Run the full test suite
pytest -q

# Run a specific file
pytest tests/unit/test_cli.py -q

# Run with verbose output
pytest -v
```

The suite currently has 218 tests across `tests/unit/` and `tests/integration/`. All tests must pass before a PR is merged.

---

## Repository layout

```
spec_lesson/        # package source
  tiers/            # Context, Thread, Immediate, Polish
  capture/          # BlackHole + Deepgram + AudioCapture
  hud/              # HudObserver, StdoutHudRenderer, TkinterHudRenderer
  transcript/       # RollingTranscript, JSONL writer
  rollup/           # session collector + Markdown aggregator
  trigger/          # TriggerDetector
  writer/           # ClaudeWriter (atomic CLAUDE.md rewrite)
tests/
  unit/             # isolated unit tests (no filesystem, no network)
  integration/      # end-to-end scenarios + fixtures
docs/
  superpowers/specs/2026-04-22-spec-lesson-design.md   # full design doc
  ralf/spec-lesson-critique/                            # refinement history
examples/
  basic_usage.sh    # headless end-to-end demo via JSONL fixture
```

---

## The parallel critics + judge-fixer pattern

spec-lesson was refined over 12 rounds using a structured critique loop:

1. **Critics** — multiple independent LLM reviewers each focus on one dimension (correctness, security, performance, naming, coverage, …).
2. **Judge** — a single LLM synthesises the critics into a ranked action list and applies the highest-priority fixes.
3. **Repeat** — until two consecutive rounds produce no-ops.

The full history is in `docs/ralf/spec-lesson-critique/`. Each `round<N>-judge.md` records what was fixed and why. Reading through these gives the fastest orientation to the design decisions in the codebase.

To run a refinement pass on a document yourself:

```bash
python3 scripts/ralf_loop.py <doc.md> --max-iters 20
```

---

## Branch naming

```
feat(spec-lesson): <short description>
fix(spec-lesson): <short description>
refactor(spec-lesson): <short description>
test(spec-lesson): <short description>
docs(spec-lesson): <short description>
```

Use the same prefix in commit messages. Example:

```
feat(spec-lesson): add --format json to status command
```

---

## Commit message style

- **Type prefix** from the list above.
- **Imperative mood** in the subject line: "add", "fix", "rename", not "added", "fixed".
- **Reference the round** when a commit implements a critique item: `round13 — SEC-3 fix`.
- Keep subject lines under 72 characters.
- Add a body paragraph when the change is non-obvious.

---

## What makes a good PR

- All 218 existing tests still pass.
- New behaviour is covered by at least one test.
- No secrets, user-specific paths, or machine-specific configuration committed.
- PR description references the critique item (if applicable) or explains the motivation.
