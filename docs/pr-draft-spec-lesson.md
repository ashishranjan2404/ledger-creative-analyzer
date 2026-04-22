# feat: spec-lesson — ADHD live meeting assistant + Claude Code context bridge

## Summary

spec-lesson captures meeting audio (mic + BlackHole loopback) or JSONL transcript stream, runs three LLM tiers in parallel (context distillation, topic-drift detection, real-time response suggestions), and writes structured notes directly to your project's `CLAUDE.md` in real time. At session end, a polish tier produces a final high-quality distillation. Includes HUD (stdout and Tkinter), session management (`start`/`status`/`stop`), and daily rollup aggregation (`rollup --since-hours`).

**Outcome:** 219 passing tests (mypy clean), ~122 commits, 16 rounds of parallel-critic hardening. Ready for open-source release.

## What ships

- **Plan 1 — Core pipeline (47 tests):** Utterance/transcript models, trigger detection, three tiers (Context/Thread/Immediate/Polish), session lifecycle, Orchestrator, managed `CLAUDE.md` writes, CLI (`start`/`status`/`stop`)
- **Plan 2 — Live audio (14 tests):** BlackHole device enumeration, Deepgram streaming with reconnect logic, audio error handling, PyAudio mixer, background pump thread
- **Plan 3 — HUD (13 tests):** Event bus (on_tier_fired, on_drift, on_polish, on_audio_disconnect), stdout and Tkinter renderers
- **Plan 4 — /schedule rollup (6 tests):** Session file scanner, Markdown aggregator with dedup, `rollup --since-hours` with safe path restriction
- **+139 tests** from 16 rounds of parallel-critic hardening (R3–R16): concurrency, edge cases, error recovery, security, cost optimization, typing, CLI UX, resilience

**Total: 219 passing tests, mypy clean, ~112 commits ahead of main.**

## Architecture highlights

- **Three tiers, three time horizons:** Context (5 min), Thread (2 min), Immediate (per-utterance, rate-limited), Polish (on close)
- **Orchestrator** wires tiers + trigger detector + writer into a single asyncio event loop with proper lifecycle (startup → running → shutdown)
- **Transcript persistence:** Atomic JSONL writes with fsync for raw utterances; managed section in `CLAUDE.md` for polished output
- **Audio capture:** Integrated mic + loopback mixer with error-fault handling; Deepgram streaming with fail-loud auth callback
- **HUD observer:** Decoupled event bus; multiple renderer backends (stdout, Tkinter)
- **Session safety:** PID file with ownership check, hard time cap, graceful SIGTERM handling
- **Cost optimization:** Prompt caching, rate-limiting, selective verbatim persistence, cached block management

## Test plan

- [ ] `source .venv/bin/activate && pytest -q` → 219 passing
- [ ] `mypy --ignore-missing-imports spec_lesson/` → 0 errors
- [ ] `echo '{"role":"user","text":"hello"}' | spec-lesson start --transcript-stdin` → writes `.spec-lesson/sessions/<date>/session.md`
- [ ] `spec-lesson status` → "not running in this directory"
- [ ] `spec-lesson rollup --root=~ --since-hours=24` → aggregates last 24h, writes to stdout
- [ ] CI: `.github/workflows/test.yml` triggers on spec_lesson/**, tests/**, pyproject.toml changes

## Known limitations (deferred)

- Deepgram API key required for live audio (mock available via `SPEC_LESSON_FAKE_API=1` for testing)
- BlackHole loopback setup is macOS-only (Linux users can route via pavcontrol; Windows users must use Voicemeeter)
- HUD Tkinter renderer requires display (headless CI uses stdout by default)
- Session rollup is best-effort (skips unreadable files with logged warnings)
- No multi-project aggregation yet (phase 2: cross-workspace view)

## CI & release

- Workflow: `.github/workflows/test.yml` (path-filtered, runs on push/PR to spec_lesson/**, tests/**, pyproject.toml)
- Install: `pip install -e ".[dev]"` or `pip install spec-lesson` from PyPI (phase 2)
- Version: `spec_lesson/__init__.py` = `"0.1.0"` (matches pyproject.toml and CHANGELOG.md)
- Docs: spec_lesson/README.md (quickstart + arch), CONTRIBUTING.md (test/style), LICENSE (MIT), examples/basic_usage.sh (FAKE_API demo)

## Checklist

- [x] `git log main..HEAD --stat` → 122 commits, no unexpected files
- [x] `git merge-base --is-ancestor main HEAD` → clean merge path
- [x] `pytest -q` → 219 passing
- [x] `mypy --ignore-missing-imports spec_lesson/` → 0 errors
- [x] `.github/workflows/test.yml` syntax + path filters correct
- [x] `pyproject.toml` valid (requires-python >=3.11, test + install work)
- [x] `__version__` in `spec_lesson/__init__.py` = "0.1.0"
- [x] `CHANGELOG.md` has [0.1.0] entry (R3–R16 documented)
- [x] Root README has spec-lesson section; test counts updated (219)
- [x] spec_lesson/README.md accurate (quickstart, arch, tests)
- [x] No stale TODO/FIXME in code
- [x] Fixtures in use (meeting_transcript.jsonl)
- [x] No orphaned code

---

**Ready to merge to main after this PR review.**
