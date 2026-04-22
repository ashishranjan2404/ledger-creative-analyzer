# Round 9 — Judge: Refactor Execution Report

**Date:** 2026-04-21
**Branch:** feat/spec-lesson
**Executor:** Claude Sonnet 4.6 (autonomous)
**Scope:** Two deferred refactors from Round 6 — F5 (_PauseWatcherState) and F2 (AudioIngress)

---

## Summary

Both refactors were implemented, all tests pass, and two clean commits were produced. No regressions. 13 new tests added.

---

## Refactor 1 — `_PauseWatcherState` inner dataclass (F5)

**Commit:** `d01dc0b`  
**Files changed:** `spec_lesson/orchestrator.py`, `tests/integration/test_live_audio_wiring.py`, `tests/unit/test_pause_watcher_state.py` (new)

### What was done

- Introduced `_PauseWatcherState` dataclass in `orchestrator.py` (lines 51–101, ~51 lines).
- Consolidated 7 scattered `__init__` fields into the dataclass:
  - `_pause_check_interval` → `check_interval`
  - `_pause_threshold` → `pause_threshold`
  - `_immediate_min_utterances` → `min_utterances`
  - `_immediate_min_interval` → `min_interval`
  - `_last_immediate_for_ts` → `last_fired_for_ts`
  - `_last_immediate_fire_monotonic` → `last_fired_monotonic`
  - `_utterance_received_monotonic` → `last_utterance_monotonic`
- `_pause_watcher` simplified from 8 branches to 2: `should_fire()` + `mark_fired()`.
- One test (`test_pause_fires_immediate_tier`) updated to use `orch._pause_watcher_state.check_interval` and `.pause_threshold` instead of the old flat attributes.
- 7 unit tests added in `tests/unit/test_pause_watcher_state.py` covering: no-latest-ts, below-min-utterances, same-timestamp dedupe, within-min-interval, speech-too-recent, happy path, mark-fired state update.

### Line delta

`orchestrator.py`: 284 → 328 lines (+44). The *class* shrank; the file grew because `_PauseWatcherState` is new code (~51 lines).

---

## Refactor 2 — `AudioIngress` class extraction (F2)

**Commit:** `96573c1`  
**Files changed:** `spec_lesson/audio_ingress.py` (new, 111 lines), `spec_lesson/orchestrator.py`, `tests/integration/test_audio_ingress.py` (new)

### What was done

- Created `spec_lesson/audio_ingress.py` (~111 lines) owning:
  - `AudioSource` Protocol (moved from orchestrator; re-exported via `from .audio_ingress import AudioSource` in orchestrator for backward compat)
  - `AudioIngress` class with: `buffer`, `transcript_writer`, `trigger`, `start()`, `stop()`, `close()`, `ingest()`, `on_utterance_from_audio()`
  - `OnTriggerFired` type alias (`Callable[[Utterance], None]`)
- Updated `Orchestrator.__init__` to construct `self.ingress = AudioIngress(...)` and set backward-compat aliases `self.buffer`, `self.transcript_writer`, `self.trigger`.
- Removed from Orchestrator: direct `audio_source` field, `RollingTranscript`/`TranscriptWriter`/`TriggerDetector` init, full `ingest()` body, `_record_trigger_fire()`, `_on_utterance_from_audio()`.
- Added `_on_trigger_fired(u: Utterance)` to Orchestrator — thin callback receiving trigger events from AudioIngress; handles context-runner scheduling (`call_soon_threadsafe` / `create_task` fallback) and HUD observer `on_trigger` dispatch. This preserves exact semantics of the original `ingest()` trigger path.
- `_on_shutdown` calls `self.ingress.stop()` and `self.ingress.close()` instead of directly managing `audio_source.stop()` and `transcript_writer.close()`.
- `run()` calls `self.ingress.start()` instead of wiring `audio_source.on_utterance` / `audio_source.start()` inline.
- `_pause_watcher` passes `last_utterance_mono=self.ingress.last_utterance_monotonic` into `should_fire()` so the pause timer tracks AudioIngress's monotonic marker (the source of truth) rather than a stale copy in `_PauseWatcherState`.
- 6 integration tests in `tests/integration/test_audio_ingress.py`: persist + trigger fire, buffer accumulation, malformed-utterance ignore, non-final trigger suppression, no-source start/stop safety, monotonic update on utterance arrival.

### Backward compatibility

| API | Status |
|-----|--------|
| `orch.ingest(d)` | ✅ thin delegate to `self.ingress.ingest(d)` |
| `orch.buffer` | ✅ alias to `self.ingress.buffer` |
| `orch.transcript_writer` | ✅ alias to `self.ingress.transcript_writer` |
| `orch.trigger` | ✅ alias to `self.ingress.trigger` |
| `AudioSource` import from `spec_lesson.orchestrator` | ✅ re-exported via `from .audio_ingress import AudioSource` |

### Line delta

| File | Before | After |
|------|--------|-------|
| `spec_lesson/orchestrator.py` | 284 (pre-R1 baseline) | 366 |
| `spec_lesson/audio_ingress.py` | — | 111 (new) |
| Net Orchestrator class body | ~222 (lines 63–284) | ~265 (lines 102–366) |

The Orchestrator *class* grew slightly in net line count due to the `_on_trigger_fired` method (+20 lines) and its inline thread-safety comment replacing the old inlined comment in `ingest()`. The file total grew because `_PauseWatcherState` (~51 lines) is new module-level code. The concern-count for the Orchestrator class dropped from 12 to 9 (audio lifecycle, ingest/buffering, persistence, and trigger log write all moved out).

---

## Test results

| Checkpoint | Count |
|------------|-------|
| Baseline (pre-round9) | 184 |
| After Refactor 1 | 191 (+7) |
| After Refactor 2 | 197 (+6) |
| Regressions | 0 |

Full run: `197 passed in 18.81s`

---

## Integration points

1. **Pause-detection monotonic sync:** `_pause_watcher` must read the last-utterance time from `AudioIngress.last_utterance_monotonic`, not from `_PauseWatcherState.last_utterance_monotonic`, since the audio callback now lives inside `AudioIngress`. Solved by adding an optional `last_utterance_mono` parameter to `should_fire()` — the watcher passes `self.ingress.last_utterance_monotonic`; unit tests (which don't have an AudioIngress) fall back to the dataclass field.

2. **Trigger fire thread safety:** The original `ingest()` had a comment about `call_soon_threadsafe` vs `create_task`. This logic moved intact into `_on_trigger_fired`. Because `AudioIngress.ingest()` may be called from the audio pump thread, the `_on_trigger_fired` callback is invoked synchronously from that thread — the thread-safety reasoning is identical to the original and was preserved verbatim.

3. **`audio_source.stop()` exception handling:** The original `_on_shutdown` swallowed exceptions from `audio_source.stop()` with a bare `except: pass`. `AudioIngress.stop()` swallows with `log.warning()` (slightly more informative). The existing test `test_on_shutdown_swallows_audio_source_stop_exception` passes unchanged.

---

## Verdict

Both refactors are behavior-preserving. The code is cleaner in the dimensions that matter: concern count on Orchestrator dropped, `_pause_watcher` is now 2-branch instead of 8-branch, and AudioIngress is a self-contained testable unit. No regressions.
