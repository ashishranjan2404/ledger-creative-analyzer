# Round 12 Judge — spec-lesson

**Date:** 2026-04-21
**Branch:** `feat/spec-lesson`
**Baseline:** 215 tests, 0 failures
**Final:** 218 tests, 0 failures (+3 new, 0 regressions)

---

## Status: COMPLETE — all items shipped

---

## Part 1: `now` → semantic rename (tier public APIs)

### Changes made

| Symbol | Old param | New param | Rationale |
|---|---|---|---|
| `ContextTier.run` | `now: float` | `audio_ts: float` | audio-stream timestamp, not wall-clock |
| `ContextTier._run_locked` | `now: float` | `audio_ts: float` | internal helper, consistent |
| `ThreadTier.run` | `now: float` | `audio_ts: float` | audio-stream timestamp |
| `ImmediateTier.run` | `now: float` | `audio_ts: float` | audio-stream timestamp |
| `RollingTranscript.tail` | `now: float` | `reference_ts: float` | semantically neutral (used by both audio and wall-clock callers) |
| `TriggerDetector.check` | `now: float` | `wall_clock_ts: float` | explicitly wall-clock monotonic (unlike tier APIs) |

### Files touched
- `spec_lesson/tiers/context.py` — signature + `_run_locked` internal
- `spec_lesson/tiers/thread.py` — signature + `.tail()` call site
- `spec_lesson/tiers/immediate.py` — signature + `.tail()` call site
- `spec_lesson/transcript/buffer.py` — `.tail()` signature + docstring
- `spec_lesson/trigger/detector.py` — `.check()` signature + docstring
- `spec_lesson/audio_ingress.py` — `.check()` call site
- `spec_lesson/orchestrator.py` — `_run_context`, `_run_thread`, `_run_immediate`, `_on_shutdown` call sites

### Test files updated (call sites)
- `tests/unit/test_context_tier.py` — all `now=` → `audio_ts=` (8 sites)
- `tests/unit/test_thread_tier.py` — all `now=` → `audio_ts=` (3 sites)
- `tests/unit/test_immediate_tier.py` — all `now=` → `audio_ts=` (3 sites)
- `tests/unit/test_buffer.py` — `now=` → `reference_ts=` (1 site)
- `tests/unit/test_trigger.py` — all `now=` → `wall_clock_ts=` (7 sites)
- `tests/unit/test_sec7_xml_wrapping.py` — 4 sites across ContextTier/ImmediateTier/ThreadTier
- `tests/unit/test_misc_branches.py` — 1 site
- `tests/integration/test_context_tier_concurrency.py` — 1 site (gather call)

### Commits
- `e370ac2` — `refactor(spec-lesson): round12 — rename now → audio_ts in tier APIs`
- `e1ca72a` — `refactor(spec-lesson): round12 — rename now → wall_clock_ts in TriggerDetector`

---

## Part 2a: `status` shows session start time + elapsed (UX-5)

### Changes made
**`spec_lesson/lifecycle.py`**
- Added `from datetime import datetime, timezone` import
- `write_pid_file()` now writes 3 lines: header / pid / `started_at_iso`
- Docstring updated to describe 3-line format

**`spec_lesson/cli.py`**
- Added `from datetime import datetime, timezone` import
- `_read_pid_file()` returns 3-tuple `(pid, err, started_at_iso)` — backward-compatible with `None` for old 2-line files
- New `_format_elapsed(started_at_iso)` helper → `"Xm00s"` or `"Xh00m00s"`
- `status` command shows: `spec-lesson: running (pid N, started <ISO>, elapsed Xm00s)`
- `stop` command updated to unpack 3-tuple (no behavior change)

**`tests/unit/test_cli_branches.py`**
- Updated `_read_pid_file` test call sites to unpack 3-tuple
- **New:** `test_status_shows_started_at_and_elapsed` — verifies "running", "started", "elapsed", and "m" all appear

### Commit
- `075de51` — `feat(spec-lesson): round12 — status shows session start time and elapsed (UX-5)`

---

## Part 2b: `stop`/`status` wrong-cwd hint (UX-10)

### Changes made (in same commit as UX-5)
Both `status` and `stop` now output when PID file not found:
```
spec-lesson: not running in /Users/mei/current-dir
Hint: spec-lesson reads the daemon from .spec-lesson/daemon.pid in the current directory.
If you started it elsewhere, cd into that directory first.
```
(hint goes to stderr via `err=True`; main message goes to stdout)

**`tests/unit/test_cli_branches.py`**
- **New:** `test_status_shows_wrong_cwd_hint_when_not_running`
- **New:** `test_stop_shows_wrong_cwd_hint_when_not_running`

---

## Part 2c: Strengthen weak assertions (#10, #11, #12)

### #10 — Scheduler upper bound
`tests/integration/test_scheduler.py::test_runs_callback_on_interval_until_stopped`
```python
# Before:
assert len(calls) >= 2
# After:
assert 2 <= len(calls) <= 10, f"expected 2-10 calls in 0.17s at 0.05s interval, got {len(calls)}"
```

### #11 — Polish tier use_cache + structural content
`tests/unit/test_polish_tier.py::test_polish_passes_final_distillation_as_cached`

Added:
- `assert call.get("use_cache", True) is False` — verifies one-shot cost optimization
- `assert "FINAL DISTILLATION:" in call["cached_context"]` — verifies section prefix present
- `assert "FULL TRANSCRIPT:" in call["fresh_input"] or "<transcript>" in call["fresh_input"]` — verifies transcript section routing

### #12 — Rollup dedup within Decisions section
`tests/integration/test_rollup_cli.py::test_rollup_cli_aggregates_across_projects`

Replaced document-wide `md.lower().count("use deepgram") == 1` with:
1. Locate `## Decisions` header by line scan
2. Walk forward to next `## ` header (section boundary)
3. Assert `decisions_section.lower().count("use deepgram") == 1`
4. Assert at least one session attribution in the decisions section

### Commit
- `9af0b70` — `test(spec-lesson): round12 — strengthen remaining weak assertions (#10, #11, #12)`

---

## Test summary

| Category | Before | After | Delta |
|---|---|---|---|
| Total tests | 215 | 218 | +3 |
| Failures | 0 | 0 | 0 |
| New tests added | — | 3 | +3 |
| Existing tests strengthened | — | 3 | 0 (same count, stronger assertions) |

Warning in output: pre-existing `PytestUnraisableExceptionWarning` in `test_client.py` (unclosed async transport in Python 3.11 asyncio internals) — not introduced by this round, not actionable.

---

## Tests that needed adjustment after the rename (invasive)

The rename was invasive — 19 call sites across 8 test files required updating. All were mechanical keyword-argument substitutions. No test logic changed. Summary:

- `test_context_tier.py` — 8 `now=` → `audio_ts=`
- `test_thread_tier.py` — 3 `now=` → `audio_ts=`
- `test_immediate_tier.py` — 3 `now=` → `audio_ts=`
- `test_buffer.py` — 1 `now=` → `reference_ts=`
- `test_trigger.py` — 7 `now=` → `wall_clock_ts=`
- `test_sec7_xml_wrapping.py` — 4 mixed sites
- `test_misc_branches.py` — 1 site
- `test_context_tier_concurrency.py` — 1 site

Plus production code: `audio_ingress.py` (trigger call site) and all 4 Orchestrator internal method call sites.

---

## Deferred items for Round 13+

| Priority | Item | Source |
|---|---|---|
| High | Add `--format json` to `status` for scripting / CI health-checks | UX backlog |
| High | `status` backward-compat: handle 2-line PID files from pre-R12 daemons (currently outputs no elapsed — benign, but could add "(started: unknown)" fallback) | UX-5 follow-up |
| Medium | `HudObserver.tick` elapsed param — consider renaming to `elapsed_sec` for clarity (minor but consistent with R12 principle) | R8 naming critic |
| Medium | `_PauseWatcherState.should_fire` `now_mono` / `last_utterance_mono` — could rename to `wall_mono` to mirror `wall_clock_ts` convention | R8 naming critic |
| Medium | Add `test_read_pid_file_returns_started_at_on_3line_file` — explicit positive test for 3-line parse path | Coverage gap |
| Low | `_format_elapsed` negative-duration guard (already present) — add explicit test for future-dated ISO (clock skew edge) | Edge case |
| Low | Rollup `## Decisions` attribution: currently only checks "Session A or Session B", should check BOTH appear | R8 #12 follow-up |
