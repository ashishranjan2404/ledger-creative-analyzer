# Round 6 — Judge Report

**Date:** 2026-04-21
**Branch:** `feat/spec-lesson`
**Baseline:** 132 tests passing
**After fixes:** 148 tests passing (+16 new, 0 regressions)

---

## Fixes applied — 8 commits

| Commit | SHA | Fix | Tests added |
|--------|-----|-----|-------------|
| 1 | `1ea98b1` | FAULT-1 — TranscriptWriter degraded mode on fsync errors | 3 |
| 2 | `9013d4c` | FAULT-2 — Session.new friendly errors for read-only dirs | 4 |
| 3 | `5a49bbd` | FAULT-4 — clear_pid_file tolerates PermissionError | 1 |
| 4 | `67e229a` | FAULT-6 — stub session.md on no-speech session | 2 |
| 5 | `626a4d2` | FAULT-8 — shutdown context failure falls back to last distillation | 2 |
| 6 | `dd2bcaa` | Docstrings — module + class docstrings across 25 files + 7 __init__.py | 1 |
| 7 | `475ab6d` | README — spec-lesson sub-project section | 0 |
| 8 | `a8a500e` | Refactor — TriggerDetector.log_fire + orchestrator cleanup | 3 |

---

## Fix-by-fix summary

### Fix 1 — FAULT-1 (Critical): TranscriptWriter degraded mode

`spec_lesson/transcript/persist.py` — wrapped `flush/fsync` in `try/except OSError`. On first
failure: log warning, set `self._degraded = True`, set `self._degradation_reason`. Subsequent
writes still attempted (the file handle is still valid even after a failed fsync; later flushes
may succeed if space frees up). Added `.degraded` and `.degradation_reason` properties.
At shutdown, `_on_shutdown` prepends a warning to the polished output if
`transcript_writer.degraded` is True. Tests verify: degraded flag set on OSError, only
logged once, not set on success.

### Fix 2 — FAULT-2 (Critical): Session.new friendly errors

`spec_lesson/session.py` — added `SessionSetupError(RuntimeError)`. `Session.new()` catches
`PermissionError` and `FileExistsError` from `mkdir()` and re-raises with actionable messages.
`cli.py start()` catches `SessionSetupError` and exits 1 with a red `typer.secho`.
Also added module docstring, class docstring, and `# why:` comment on `claude_md` property
explaining why it points at `project_dir/CLAUDE.md` (not state_dir).

### Fix 3 — FAULT-4 (High): clear_pid_file tolerates PermissionError

`spec_lesson/lifecycle.py` — added `except OSError` branch in `clear_pid_file()`; logs a
warning rather than propagating. Prevents the daemon from leaving users unable to restart
after a read-only filesystem event. Also added module docstring + `SessionLifecycle` class
docstring.

### Fix 4 — FAULT-6 (High): no-speech session stub

`spec_lesson/orchestrator.py:_on_shutdown` — when `buffer.latest_timestamp()` is None, writes
a stub `session.md` with actionable guidance ("Check that audio capture is configured"),
logs a warning, and returns early without calling any LLM tier. Previously: silent empty
`.spec-lesson/` directory after a muted-mic session.

### Fix 5 — FAULT-8 (Medium): shutdown context failure

`spec_lesson/orchestrator.py:_on_shutdown` — split the monolithic `if latest is not None:` block:

1. `context_tier.run(now=latest)` is now wrapped in its own `try/except`; on failure falls
   back to `context_tier.last` (last successful distillation).
2. `claude_md_writer.write_managed_section()` is wrapped in `try/except OSError`; its failure
   no longer skips Polish.
3. Polish fallback `write_text` is also wrapped in `try/except OSError` so a disk error
   during fallback write doesn't raise into the lifecycle hook.

Before: a context 500 at shutdown silently left `session.md` unwritten. After: `session.md`
is always written (either polished, fallback distillation, or stub).

### Fix 6 — Docstrings (mechanical)

Applied all pre-written docstrings from `round6-docstrings-draft.md`:
- Module docstrings on 25 source files and 7 sub-package `__init__.py` files
- Class docstrings: `Orchestrator`, `AudioSource`, `Distillation`, `PeriodicRunner`,
  `SessionLifecycle`, `TierEvent`, `HudState`, `HudObserver`
- `# why:` comments: fsync in `TranscriptWriter.append`, atomic rewrite in
  `ClaudeMdWriter._atomic_write`, `_trigger.set()` in `PeriodicRunner.stop()`
- `status` and `stop` commands now have non-blank `--help` text

Test: `test_docstrings_exist.py` verifies every importable `spec_lesson.*` module has a
module-level docstring of at least 10 characters.

### Fix 7 — README

Appended a `## spec-lesson (sub-project)` section to the root `README.md` after the "Prior art"
section. Includes the three-tier table, quick start bash commands, other commands,
session artefacts description, source layout, and test invocation line.

### Fix 8 — F6 opportunistic: TriggerDetector.log_fire

`spec_lesson/trigger/detector.py` — added `log_fire(log_path: Path, phrase: str) -> None`.
Owns UTC timestamp formatting, `log_path.parent.mkdir(parents=True, exist_ok=True)`, and
the `open/write`. `orchestrator.py:_log_trigger` delegates to `trigger.log_fire()`, retaining
only the `observer.on_trigger()` dispatch call. Removed now-unused `datetime`/`timezone`
imports from `orchestrator.py`.

---

## Deferred (confirmed carry to Round 7)

| ID | Reason |
|----|--------|
| FAULT-3 | Deepgram reconnect needs broader design decision (auto-reconnect vs fail-loud HUD alert) |
| FAULT-5 | Hibernate/resume edge case — low impact on macOS; only spurious single LLM call on Linux |
| FAULT-9 | numpy missing — cosmetic; dependency listed in pyproject.toml |
| FAULT-10 | Post-reconnect timestamp freeze — tied to FAULT-3 reconnect design |
| F2 (AudioIngress) | Full extraction deferred per refactor critic (do after SEC-5/SEC-7) |
| F5 (_PauseWatcher inner class) | Opportunistic; safe to do in Round 7 with the AudioIngress split |

---

## Test matrix

```
148 passed in 14.26s  (0 failed, 0 skipped)
```

New tests by file:
- `tests/unit/test_persist.py` — +3 (degraded mode, single-log, no-degraded-on-success)
- `tests/unit/test_session.py` — +4 (new file: mkdir success, readonly, file-shaped dir, paths)
- `tests/integration/test_lifecycle.py` — +1 (clear_pid_file tolerates PermissionError)
- `tests/integration/test_no_speech_session.py` — +2 (new file: stub written, no LLM calls)
- `tests/integration/test_shutdown_context_failure.py` — +2 (new file: fallback path, never-ran path)
- `tests/unit/test_docstrings_exist.py` — +1 (new file: all modules have docstrings)
- `tests/unit/test_trigger.py` — +3 (log_fire creates+appends, parent dirs, UTC timestamp)

Total new: **+16 tests** (132 → 148)
