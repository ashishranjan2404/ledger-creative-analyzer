# Round 1 Judge — spec-lesson critique

**Date:** 2026-04-22  
**Branch:** feat/spec-lesson  
**Commit:** c79266a  
**Baseline:** 61 tests  
**After fixes:** 71 tests (10 new), 0 regressions

---

## Findings selected for this round

All three pre-judgement picks were confirmed critical after reading all four reports. No overrides.

---

### Fix 1 — Thread-safe `asyncio.create_task` in `Orchestrator.ingest()` [DONE]

**Validated by:** concurrency critic (BUG-C-1) + errors critic (BUG-E-2)  
**Severity:** Critical — silent failure in live audio mode

**Problem:** `ingest()` calls `asyncio.create_task(self._context_runner.trigger_now())`. When called from the DeepgramStream pump thread (which is not the event-loop thread), this raises `RuntimeError: no running event loop` in Python 3.10+. The pump's `except Exception: continue` guard silently swallows it. Every context-tier trigger in `--audio` mode is silently dropped.

**Fix applied:**
- `Orchestrator.__init__` adds `self._loop: Optional[asyncio.AbstractEventLoop] = None`
- `Orchestrator.run()` captures the running loop: `self._loop = asyncio.get_event_loop()`
- `ingest()` uses `self._loop.call_soon_threadsafe(self._context_runner._trigger.set)` when `self._loop` is set (i.e., after `run()` started). Falls back to `asyncio.create_task(trigger_now())` only for the stdin path (coroutine context, loop is running on the calling thread)

**Files changed:** `spec_lesson/orchestrator.py`  
**Test:** `tests/integration/test_thread_safe_ingest.py` — `FakeThreadedAudio` pushes an utterance from a `threading.Thread`, asserts `triggers.log` is written after `run()` completes.

---

### Fix 2 — `Utterance.from_dict` KeyError crashes the daemon [DONE]

**Validated by:** errors critic (BUG-E-1)  
**Severity:** Critical — any malformed audio frame kills the async event loop

**Problem:** `Utterance.from_dict()` does bare `data["key"]` access. A single missing field (e.g. `{"timestamp": 1.0, "text": "hi"}` — missing `speaker` and `is_final`) raises `KeyError` that propagates out of `ingest()` and crashes the event loop. No distillation is written. The daemon exits with a traceback.

**Fix applied:**
- Added `Utterance.safe_from_dict(data) -> Optional[Utterance]` classmethod: wraps construction in `try/except (KeyError, TypeError, ValueError)`, logs a warning, returns `None` on any error
- `Orchestrator.ingest()` now calls `safe_from_dict` instead of `from_dict`. If `None` is returned, `ingest()` returns early (skipping the bad frame)
- Original `from_dict` is preserved for callers that want strict behaviour

**Files changed:** `spec_lesson/transcript/utterance.py`, `spec_lesson/orchestrator.py`  
**Tests:** `tests/unit/test_ingest_error_handling.py` — 5 unit tests for `safe_from_dict` (missing speaker, missing text, empty dict, valid dict, type-coercion edge case) + 1 integration test confirming the orchestrator continues processing valid utterances after a malformed one and that `triggers.log` is written.

---

### Fix 3 — Polish tier unbounded input + unhandled API error in `_on_shutdown` [DONE]

**Validated by:** errors critic (ISSUE-E-4) + edges critic (EDGE-4)  
**Severity:** Critical (for long sessions) — user gets an empty `session.md` after a 90-min session

**Problem (a):** `self.buffer.as_text()` returns the full session transcript with no cap. At 2 utterances/s × 90 min × ~50 chars = ~540 KB. Anthropic's API rejects requests over ~200k tokens with `400 context_length_exceeded`. This error is unhandled in `_on_shutdown`, preventing the `distillation_md` write.

**Problem (b):** Even without the truncation issue, any exception from `polish_tier.run()` in `_on_shutdown` leaves `session.distillation_md` unwritten — the user gets nothing from a session where the context tier already computed a valid distillation.

**Fix applied:**
- `PolishTier` defines `_MAX_TRANSCRIPT_CHARS = 100_000` (~25k tokens, safe margin below the 200k-token window)
- `PolishTier.run()` truncates `full_transcript` to its *tail* (`[-_MAX_TRANSCRIPT_CHARS:]`) before constructing `fresh_input`, preserving the most recent conversation
- `Orchestrator._on_shutdown()` wraps `polish_tier.run()` in `try/except Exception`. On failure: logs the error and writes `dist.render_markdown()` (the plain context distillation) to `session.distillation_md` as a fallback

**Files changed:** `spec_lesson/tiers/polish.py`, `spec_lesson/orchestrator.py`  
**Tests:** `tests/unit/test_polish_truncation.py` — (a) 1 MB transcript is truncated to ≤200k chars in `fresh_input`; (b) short transcript passes verbatim; (c) integration test: polish raises a `RuntimeError("400 context_length_exceeded")`-equivalent and `session.distillation_md` is still written with the fallback content.

---

## Deferred to Round 2+

Per the pre-judgement deferral list — none of these were attempted:

| ID | Description | Reason deferred |
|----|-------------|-----------------|
| EDGE-1 | WiFi drop — pump exits silently | Needs error-propagation design (health-check on pump thread) |
| EDGE-2 | SIGKILL orphan PID file | Needs separate `session.py` refactor; atomic check-and-set for PID |
| SMELL-1 | `os.fsync` per-utterance blocking event loop | Needs batching design (run_in_executor or timer-based flush) |
| PATTERN-8 | `_on_shutdown` stop-then-use race | Subtle lifecycle contract issue; needs careful comment + design |
| PATTERN-3 | Dead `Tier` Protocol | Stylistic; not a runtime bug |
| PATTERN-5 | Utterance format string DRY | Stylistic |
| BUG-C-3 | `asyncio.Event` created before loop | Unlikely to bite in practice on CPython 3.10+ |
| EDGE-5 | Trigger cooldown on stream-relative time | Edge case on reconnect; lower priority |
| BUG-C-2 | `RollingTranscript` read/write without lock | GIL-protected on CPython; deferred until free-threading migration |
| EDGE-3 | `Distillation.from_json` `list()` on string silently iterates chars | Valid but lower blast-radius than the three selected |
| ISSUE-E-1 | `_atomic_write` temp-file leak on double-OSError | Real but rare (disk-full + unlink failure) |

---

## Additional observations (not acted on)

- **PATTERN-4 / SMELL-2:** `trigger_now()` is `async` but contains no `await` — it should be a plain sync method so callers don't need `create_task`. This is now moot for the thread-safety fix (we call `_trigger.set` directly), but `trigger_now()` is still a misleadingly `async` no-await coroutine. Worth cleaning in round 2 alongside the scheduler refactor.
- **EDGE-3:** `list("Use React")` silently returns `['U','s','e'...]` when Anthropic returns a string for `decisions`. This is silent data corruption but lower blast-radius than the three selected bugs; deferred.

---

## Test suite summary

```
71 passed in 6.11s
```

Previous baseline: 61 passed. Net new: 10 tests across 3 new files.
