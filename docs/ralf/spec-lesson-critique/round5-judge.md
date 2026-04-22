# Round 5 Judge — spec-lesson

**Date:** 2026-04-21
**Branch:** feat/spec-lesson
**Baseline:** 115 tests
**Final count:** 132 tests passed, 0 failed, 0 regressions

---

## Status: All 7 fixes shipped

| Fix | ID | Severity | Commit | Result |
|-----|-----|----------|--------|--------|
| 1 | SEC-1 | HIGH | `4aa22df` | Marker injection into CLAUDE.md blocked |
| 2 | SEC-2 | HIGH | `bb8b9d8` | Multiline verbatim fully blockquoted |
| 3 | COST-1 | CRITICAL | `27adabc` | Cache now stable; use_cache flag added |
| 4 | COST-2 | HIGH | `612c47b` | Immediate tier rate-limited |
| 5 | TEST-1 | HIGH | `d4acd6c` | Audio frame padding — no more data loss |
| 6 | SEC-4 | MEDIUM | `b641446` | Utterance text capped at 8000 chars |
| 7 | SEC-3 | MEDIUM | `d9c07c8` | PID file header; stop validates ownership |

Regression-fix commit: `f4b4da0` (updated 4 existing tests whose assumptions changed).

---

## New tests added (+17)

| Test file | New tests |
|-----------|-----------|
| `tests/unit/test_claude_md.py` | `test_body_containing_end_marker_does_not_corrupt`, `test_body_containing_start_marker_does_not_nest` |
| `tests/unit/test_base.py` | `test_multiline_verbatim_is_fully_blockquoted`, `test_verbatim_marker_pattern_escaped` |
| `tests/unit/test_client.py` | `test_use_cache_false_omits_cache_control`, `test_use_cache_true_includes_cache_control` |
| `tests/unit/test_context_tier.py` | `test_context_cached_context_excludes_recent_verbatim` |
| `tests/unit/test_audio_input.py` | `test_mix_pads_shorter_loop_with_zeros`, `test_mix_pads_shorter_mic_with_zeros` |
| `tests/unit/test_utterance.py` | `test_safe_from_dict_truncates_huge_text`, `test_safe_from_dict_accepts_normal_text` |
| `tests/integration/test_pause_rate_limit.py` | `test_immediate_tier_respects_min_utterances`, `test_immediate_tier_fires_once_min_utterances_met` |
| `tests/integration/test_pid_file_safety.py` | `test_stop_refuses_pid_file_without_header`, `test_stop_refuses_pid_file_with_wrong_header`, `test_stop_not_running_when_no_pid_file`, `test_status_ignores_pid_file_without_header` |

---

## Key implementation notes

### Fix 1 — SEC-1 (claude_md.py)
Replaced the proposed "strip" approach with a lighter-weight "rename" approach:
markers in body are rewritten to `<!-- literal-spec-lesson:start -->` / `<!-- literal-spec-lesson:end -->` so content is preserved rather than silently dropped. Applied in `write_managed_section` before the body is wrapped.

### Fix 2 — SEC-2 (tiers/base.py)
Added module-level `_escape_verbatim(text)` helper that:
- Splits on `\n`, joins with `\n> ` so every line is blockquoted
- Replaces `<!-- spec-lesson:` with `<!-- literal-spec-lesson:` to close the marker-injection path via the verbatim field as well (defence-in-depth with Fix 1)

### Fix 3 — COST-1 (multiple files)
Three-part change:
- `AnthropicClient.complete` gains `use_cache: bool = True`; when False, `cache_control` is omitted from the system block
- `Distillation.to_json_stable()` serialises topic/decisions/requirements/open_questions WITHOUT `recent_verbatim` — used by `ContextTier._render_cached`
- Thread, Immediate, Polish pass `use_cache=False` (all below Haiku 2048-token threshold or one-shot); Context passes `use_cache=True` with the stable JSON

### Fix 4 — COST-2 (orchestrator.py)
`OrchestratorConfig` gains `immediate_min_utterances: int = 3` and `immediate_min_interval: float = 10.0`.
`_pause_watcher` checks both before firing:
1. `len(buffer.all()) < immediate_min_utterances` → skip
2. `now_mono - _last_immediate_fire_monotonic < immediate_min_interval` → skip

Existing `test_pause_fires_immediate_tier` was updated to pass `immediate_min_utterances=1, immediate_min_interval=0.0` so the single-utterance pause test still works (that test verifies the wiring, not the rate-limiting).

### Fix 5 — TEST-1 (audio_input.py)
`_mix_and_emit` now uses `max(len(mic), len(loop))` and `np.pad` on both arrays before mixing.
The shorter stream is zero-padded so no mic samples are silently dropped on loopback under-run.

### Fix 6 — SEC-4 (transcript/utterance.py)
Added `MAX_UTTERANCE_TEXT_CHARS = 8_000` constant.
`safe_from_dict` logs a warning and truncates when exceeded.

### Fix 7 — SEC-3 (lifecycle.py + cli.py)
PID file format changed from `<pid>\n` to `spec-lesson\n<pid>\n` (mode 0o600).
`write_pid_file` parses the new two-line format when deciding if an existing lock is live.
`stop` and `status` both call `_read_pid_file()` which validates the header before returning a PID; if the header is wrong, `stop` exits with code 2 and prints "refusing to signal".

### Regression fixes
Four existing tests needed updating after the above changes:
- `test_lifecycle.py:test_pid_file_written_and_parseable` — reads new two-line format
- `test_live_audio_wiring.py:test_pause_fires_immediate_tier` — cfg lowered to min_utterances=1
- `test_end_to_end.py:_mk_response` — accepts `use_cache` kwarg
- `cli.py:_canned_response` — accepts `use_cache` kwarg

---

## Deferred (Round 6+)

- SEC-5: startup warning for secret exposure in JSONL transcripts
- SEC-6: `rollup --out` path restriction
- SEC-7: XML wrapping of transcript to reduce prompt injection surface
- SEC-8: state-dir mode 0o700 (world-readable dir still exposes PID file on some systems)
- Testing gaps 2–10 from the testing critic (DeepgramStream pump failure modes, atomic-write cleanup, Unicode NFC/NFD dedupe, etc.)
- Module docstrings and root README
