# Round 7 — Judge Report

**Date:** 2026-04-21
**Branch:** feat/spec-lesson
**Baseline:** 148 tests passing
**Final:** 183 tests passing (+35)

---

## Summary

All 9 scope items plus the coverage bulk-apply were completed. Three critics covered
network resilience (FAULT-3/10 fail-loud design), 26 paste-ready coverage tests,
and CLI UX polish. Every change applied cleanly with two skeleton adjustments noted below.

---

## Commits

| SHA | Description |
|-----|-------------|
| `6473679` | fix(spec-lesson): round7 — Deepgram fail-loud error callback (FAULT-3+10) |
| `eb64283` | fix(spec-lesson): round7 — AudioCapture sink guard + Deepgram auth failure check |
| `9b7957a` | feat(spec-lesson): round7 — CLI --version flag + logging.basicConfig + session summary + Ctrl+C + improved errors |
| `400e515` | feat(spec-lesson): round7 — TriggerDetector.fire_count property |
| `a078ad0` | feat(spec-lesson): round7 — rollup --since-hours validation + empty output hint |
| `1ff2611` | test(spec-lesson): round7 — coverage fill across 8 new test modules (35 new tests) |

---

## Fix-by-fix status

### Fix 1 — FAULT-3 + FAULT-10 — Deepgram fail-loud callback ✅

Implemented Option B exactly:

- `ErrorCallback = Callable[[str], None]` type alias added to `deepgram_stream.py`.
- `_error_callback: Optional[ErrorCallback]` field on `DeepgramStream`.
- `on_error(callback)` registration method.
- `_connected_ok: bool = False` flag set inside the `with` block (before `_ready.set()`).
  This avoids a race where the pump exits the for-loop and clears `_socket` before
  `start()` can check it — `_connected_ok` stays True even after `_socket` is cleared.
- `_clean_exit` logic in `_pump`: set True if `_stop.is_set()` at any point the for-loop
  exits (break OR exhausted-after-stop). Set False if the for-loop exhausted without stop.
- `start()` raises `RuntimeError("Deepgram stream failed to connect …")` if `_connected_ok`
  is False after `_ready.wait()`.
- `HudState.audio_disconnected: bool = False` and `audio_disconnect_at: float | None = None`
  added.
- `HudObserver.on_audio_disconnect(at, reason)` added; emits `kind="audio_error"` TierEvent.
- CLI `_build_audio_source(observer=None)` wires `stream.on_error(lambda reason: observer.on_audio_disconnect(elapsed, reason))` when observer is present.
- `AudioCapture._run` wraps `_mix_and_emit()` in try/except, logs and breaks on exception.

**Anti-reconnect note:** FAULT-10 is resolved as a side-effect per critic's analysis —
no reconnect means no timestamp reset, no cursor freeze.

### Fix 2 — CLI `--version` flag ✅

Standard Typer `@app.callback()` pattern with `is_eager=True`. Reads
`spec_lesson.__version__` ("0.1.0") and exits 0. Test added in
`test_cli_branches.py::test_version_flag_prints_version`.

### Fix 3 — `logging.basicConfig` in CLI ✅

Added at module level in `cli.py`:
```python
logging.basicConfig(level=logging.WARNING, format="spec-lesson: %(message)s")
```
All `log.warning()` calls across the codebase now emit `spec-lesson: <message>` to stderr
without the raw Python module-path prefix.

### Fix 4 — `rollup --since-hours` validation ✅

Added before `find_session_files()` call. Exits 2 with red error on `<= 0` value.

### Fix 5 — Better empty rollup output ✅

`render_rollup()` now accepts `since_hours` and `root` keyword arguments. When `notes` is
empty, emits a 4-line hints block with `--since-hours` and `--root` examples, and shows the
actual search root path. Backward compatible (defaults keep existing callers working).

### Fix 6 — Session summary on successful exit ✅

After `asyncio.run(...)` returns (both stdin and audio paths), a green secho line prints
elapsed minutes, utterance count, trigger fire count, and the output path.
`TriggerDetector.fire_count` property added; `_fire_count` incremented in `check()`.

### Fix 7 — Ctrl+C handling ✅

Both `asyncio.run(main_stdout())` and `asyncio.run(main_no_stdin())` wrapped in
`try/except KeyboardInterrupt` → `typer.secho("interrupted by user", yellow)` + `Exit(130)`.
The Tk path (thread-based) is unchanged (deferred, per spec).

### Fix 8 — `start` with no flag improved error ✅

Changed from yellow "Choose a source…" warning to red multi-line error message on stderr
with `err=True`, `Exit(2)`. Includes macOS BlackHole install hint and correct flag names.

### Fix 9 — BlackHole warning enriched ✅

`_build_audio_source` catches `DeviceError` and emits a three-line yellow message
explaining the consequence ("system audio will be missed") and requiring a session restart.

### Fix 10 — 26 coverage tests (bulk apply) ✅ (with 2 adjustments)

Applied all 6 skeleton files. Two skeletons needed adjustment:

1. **`test_cli_branches.py`**: The critic's skeleton used `CliRunner(mix_stderr=False)`.
   This Typer version does not support the `mix_stderr` kwarg — removed it. Tests pass
   with `CliRunner()` (stderr is mixed into stdout, which is fine for these assertions).

2. **`test_deepgram_disconnect.py::test_on_error_not_fired_on_clean_stop`**: The critic's
   skeleton used `iter([])` for the socket iterator and pre-set `_stop`. This created a
   race: the pump's for-loop exits due to iterator exhaustion, then checks `_stop.is_set()`
   but the logic only set `_clean_exit = True` via the `break` path (not the exhaustion path).
   Fixed two ways:
   - Logic fix: after the for-loop, `_clean_exit = True if _stop.is_set() else False`
     (covers both break AND exhaustion-after-stop paths).
   - Test fix: use a `BlockingSocket` that blocks `__iter__` until `send_finalize` is called,
     then call `stream.stop()` normally. This tests the real orderly-shutdown path.

---

## Pytest output

```
183 passed in 17.72s
```

New test breakdown:
- `test_deepgram_disconnect.py` — 3 tests (FAULT-3 pump contract, clean stop, HudObserver)
- `test_hud_observer_audio_error.py` — 4 tests (state defaults, flag, reason, thread-safety)
- `test_lifecycle_branches.py` — 5 tests (corrupt pid, lost-race unlink, missing file, signal NotImplementedError, hook exception)
- `test_orchestrator_branches.py` — 6 tests (min_utterances, min_interval, immediate exception, thread observer, immediate observer, audio stop error)
- `test_misc_branches.py` — 7 tests (context manager, empty buffer early return, _coerce_str_list variants, Distillation.from_json non-list)
- `test_claude_md_branches.py` — 2 tests (no-trailing-newline separator, atomic write temp file cleanup)
- `test_cli_branches.py` — 6 tests (stale pid, bad header status, stop refuses bad header, corrupt int, empty file bad_header, --version flag)
- `test_rollup_collector_branches.py` — 2 tests (checked checkbox, missing frontmatter)

---

## Deferred (Round 8+)

- Auto-reconnect for Deepgram (explicitly rejected by resilience critic)
- AudioIngress extraction (still deferred)
- `--hud=tk` mainloop threading polish
- `status` extended with start time + elapsed (UX-5, medium priority)
- `stop`/`status` wrong-cwd message (UX-10, low priority)
