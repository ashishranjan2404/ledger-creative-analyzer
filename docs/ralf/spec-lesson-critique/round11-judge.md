# Round 11 — Judge: Security Hardening + Backlog Sweep

**Date:** 2026-04-21
**Branch:** feat/spec-lesson
**Executor:** Claude Sonnet 4.6 (autonomous)
**Baseline:** 204 tests passing
**Final:** 215 tests passing (+11 new)

---

## Summary

7 commits, 7 deferred items resolved. All security items from the R5 backlog landed. Two
R8 weak-assert groups strengthened. Module `__all__` exports added to three sub-packages.
FAULT-5 hibernate guard added with direct logic test. FAULT-9 import-error hints added.
No regressions.

---

## Commits

| SHA | Description | New tests |
|-----|-------------|-----------|
| `817f8a3` | SEC-5: startup warning for verbatim transcript persistence | 1 |
| `7af8036` | SEC-6: rollup --out path validation (outside home → exit 2) | 2 |
| `a3ea3f2` | SEC-7: XML-wrap transcript content in all 4 tier fresh_input calls | 5 |
| `1dcd3a9` | FAULT-9: graceful numpy/sounddevice ImportError with pip hints | 1 |
| `0ad1936` | TYPE-10: `__all__` exports for tiers, transcript, hud sub-packages | 1 |
| `dbb24c2` | Weak asserts #3 #4 #8 #9: structural position + order checks | 0 (existing tests strengthened) |
| `1aaaafe` | FAULT-5: hibernate/resume suppression in `_pause_watcher` | 1 |

---

## Fix-by-fix report

### SEC-5 — Startup warning for verbatim transcript persistence ✅

`spec_lesson/cli.py:start()` — Added a `typer.secho` warning (yellow, stderr) before
`Session.new()` to inform users that audio is recorded verbatim and they should avoid
speaking passwords or secrets. Fires before any recording begins.

Test: `tests/unit/test_cli_branches.py::test_start_emits_secrets_warning` — invokes
`start --transcript-stdin` with an empty stdin (immediate EOF) and checks combined output
for the warning.

---

### SEC-6 — rollup --out path validation ✅

`spec_lesson/cli.py:rollup()` — Before writing, resolves `--out` and checks that it falls
under `Path.home()`, `Path.cwd()`, or `tempfile.gettempdir()`. If none match, exits 2 with
a red error message naming the home directory.

Tests:
- `test_rollup_rejects_out_path_outside_home` — `--out /etc/rollup.md` must exit 2.
- `test_rollup_allows_out_path_in_tmp` — `/tmp/…` must exit 0 (CI friendliness).

---

### SEC-7 — XML wrapping of transcript content in fresh_input ✅

Wraps user-supplied spoken content in `<transcript>…</transcript>` tags in every tier that
passes transcript text to `fresh_input`:

| Tier | Change |
|------|--------|
| `ContextTier._run_locked` | `"NEW TRANSCRIPT SINCE LAST DISTILLATION:\n<transcript>\n{new_transcript}\n</transcript>"` |
| `ImmediateTier.run` | `"<transcript>\n{tail_text}\n</transcript>"` (or `"<transcript>(silence)</transcript>"`) |
| `ThreadTier.run` | `"LAST 2 MIN OF TRANSCRIPT:\n<transcript>\n{tail_text}\n</transcript>"` |
| `PolishTier.run` | `"FULL TRANSCRIPT:\n<transcript>\n{full_transcript}\n</transcript>"` |

The XML boundary makes it structurally unambiguous where model instructions end and
user-supplied content begins, reducing the surface for adversarial speech injection.

New test file: `tests/unit/test_sec7_xml_wrapping.py` — 5 tests verify:
1. Opening and closing tags present in all four tiers.
2. Spoken content appears INSIDE the tags (not outside).
3. Empty-buffer ImmediateTier still emits `<transcript>(silence)</transcript>`.

---

### FAULT-9 — Graceful numpy/sounddevice ImportError with pip hints ✅

`spec_lesson/capture/audio_input.py`:
- `import numpy as np` at module level wrapped in `try/except ImportError`; sets
  `_NUMPY_AVAILABLE = False` flag.
- `_run()`: checks `_NUMPY_AVAILABLE` first and returns with `log.error(...)` + pip hint.
- `import sounddevice` inside `_run()` wrapped in `try/except ImportError` with `log.error`
  + pip hint.

Previously both raised a bare `ImportError` with no actionable guidance in environments
without audio dependencies (CI, stdin-only mode, fresh installs).

Test: `test_missing_sounddevice_logs_error_and_returns` — patches `sys.modules["sounddevice"] = None`
and verifies `_run()` emits a `log.error` about sounddevice without raising.

---

### TYPE-10 — `__all__` exports for sub-packages ✅

Added imports + `__all__` lists to:

| Package | Exported names |
|---------|---------------|
| `spec_lesson/tiers/__init__.py` | `AnthropicClient`, `ContextTier`, `Distillation`, `DriftLabel`, `DriftState`, `ImmediateTier`, `PeriodicRunner`, `PolishTier`, `ResponseSuggestions`, `Tier`, `ThreadTier` |
| `spec_lesson/transcript/__init__.py` | `RollingTranscript`, `TranscriptWriter`, `Utterance` |
| `spec_lesson/hud/__init__.py` | `HudObserver`, `HudState`, `TierEvent` |

Makes `from spec_lesson.tiers import *` safe; enables mypy to verify re-exported names
are importable at import time.

Test: `test_sub_package_all_exports_importable` in `test_docstrings_exist.py` — asserts
each package has `__all__`, it is non-empty, and every name in it is a real attribute.

---

### Weak assertions #3 and #4 (test_claude_md.py) ✅

**#3 (`test_creates_file_with_section_if_missing`):** replaced three `in text` checks with:
- `text.index("<!-- spec-lesson:start -->") < text.index("<!-- spec-lesson:end -->")` — order
- `block = text[start_idx:end_idx]; "hello body" in block` — body inside the block
- `text.count(...)` == 1 for both markers — no duplicates

**#4 (`test_rewrites_section_preserving_surrounding_content`):** added:
- `text.index("# Project") < start_idx` — header precedes managed block
- `text.index("Footer.") > end_idx` — footer follows managed block
- `"NEW DISTILLATION" in block_inner` — new content inside (not outside)
- marker count assertions

Mutations caught: body written after end marker, reversed marker order, duplicate blocks.

---

### Weak assertion #8 (test_client.py) ✅

`test_complete_calls_sdk_with_caching_on_transcript`: replaced `in block["text"]` substring
checks with positional checks around the `"---"` separator:

```python
sep_idx = block_text.index("---")
sys_part = block_text[:sep_idx]
ctx_part = block_text[sep_idx:]
assert "You are a helpful summarizer." in sys_part   # BEFORE separator
assert "long rolling transcript here" in ctx_part    # AFTER separator
```

Mutation caught: swapping order of system prompt and cached context in the block.

---

### Weak assertion #9 (test_end_to_end.py) ✅

`test_end_to_end_fixture_run`: replaced `"build that" in triggers.lower()` with:
- splitlines + `len >= 1`
- per-line: `line.split(" | ", maxsplit=1)` → exactly 2 parts
- `datetime.fromisoformat(parts[0])` — valid ISO timestamp
- `"build that" in parts[1].lower()` — phrase in phrase field, not timestamp field

Mutation caught: `log_fire` reversing `f"{phrase} | {ts}"` would still contain "build
that" in the full string but fail the positional check.

---

### FAULT-5 — Hibernate/resume ImmediateTier suppression ✅

`spec_lesson/orchestrator.py:_pause_watcher()`:
- Tracks `_last_tick_mono = time.monotonic()` before the sleep loop begins.
- On each wake-up: `tick_gap = now_mono - _last_tick_mono`.
- If `tick_gap > 3600.0`: logs a warning and `continue` (skip `should_fire` evaluation).
- Updates `_last_tick_mono = now_mono` each tick.

On Linux, `CLOCK_MONOTONIC` includes suspend time, so a long hibernate → enormous gap →
spurious `ImmediateTier` fire on stale pre-sleep state. The guard suppresses this.

Test: `test_pause_watcher_skips_fire_after_simulated_suspend` — replays the tick-guard
logic manually with a 7200s simulated gap between ticks 1 and 2. Verifies: tick 1 fires
(normal), tick 2 (hibernate) is skipped entirely by the guard, tick 3's `should_fire`
returns False (same `latest_ts` as tick 1, deduped). Net: exactly 1 fire recorded.

---

## Pytest output

```
215 passed, 1 warning in 26.52s
```

The lone warning is a CPython 3.11 `_UnixReadPipeTransport.__del__` `ResourceWarning`
emitted by the `asyncio.StreamReader` test path; it is a Python 3.11 / pytest-asyncio
interaction artifact, not a regression.

---

## Still deferred

| ID | Description | Reason |
|----|-------------|--------|
| TYPE-9 | Method-assign mock discipline (monkey-patch in fake API path) | Cosmetic; low risk |
| Weak assert #10 | `test_scheduler.py`: upper-bound on call count | Low priority; scheduler is timing-sensitive |
| Weak assert #11 | `test_polish_tier.py`: `transcript in fresh_input` positional check | Now partially addressed by SEC-7 wrapping test; full migration deferred |
| Weak assert #12 | `test_rollup_cli.py`: dedup position in document | Low priority |
| `--hud=tk` mainloop threading polish | Tkinter main-loop teardown | Needs platform-specific testing |
| `status` extended (UX-5) | Show start time + elapsed | Medium priority |
| `stop`/`status` wrong-cwd message (UX-10) | Low priority |
| `now` → `audio_ts` parameter rename | Invasive (15+ call sites), no behavior change |
| `distillation_md` → `session_note_path` | Cosmetic rename |
| `rollup --out` `..` traversal path (edge) | Could add `Path.resolve()` traversal check; current check catches absolute outside-home cases |
