# Changelog

All notable changes to **spec-lesson** are documented here.
Format follows [Keep a Changelog](https://keepachangelog.com/en/1.0.0/).

---

## [0.1.0] — 2026-04-22

### Added

**Plan 1 — Core pipeline**
- `Utterance` dataclass and JSONL transcript writer with fsync guarantees
- `RollingTranscript` append-only buffer with configurable tail window
- Trigger phrase detector with cooldown (`TriggerDetector`)
- Anthropic client wrapper with prompt caching (`AnthropicClient`)
- Distillation dataclass + per-tier system prompts
- Atomic `CLAUDE.md` managed-section rewrite (`ClaudeWriter`)
- Context tier — rolling 30-second compaction → `CLAUDE.md`
- Thread tier — 10-second topic-drift detection with `DriftLabel`
- Immediate tier — per-utterance real-time response suggestions (rate-limited)
- Polish tier — final high-quality distillation at session close
- Session state + lifecycle with hard time cap (`Session`, `SessionLifecycle`)
- Periodic runner with force-trigger support
- Orchestrator — wires tiers, trigger, and writer into an asyncio event loop
- CLI entry point: `start`, `status`, `stop`, `rollup` (Typer, `no_args_is_help`)

**Plan 2 — Live audio capture**
- BlackHole device enumeration (`find_blackhole_device`)
- Deepgram streaming client with reconnect and auth-failure fail-loud callback
- `AudioCapture` — PyAudio mic + loopback mixer
- Background pump thread for Deepgram WebSocket
- Audio-disconnect event wired to HUD observer

**Plan 3 — Floating HUD**
- `HudObserver` — event bus (on_tier_fired, on_drift, on_polish, on_audio_disconnect)
- `StdoutHudRenderer` — plain-terminal live overlay
- `TkinterHudRenderer` — floating Tkinter window
- `AudioIngress` extracted from Orchestrator for cleaner separation

**Plan 4 — `/schedule` daily rollup**
- `find_session_files` / `parse_session` — session directory scanner
- `render_rollup` / `filter_by_window` — Markdown aggregator with dedup
- `rollup --since-hours` — configurable window with validation
- `rollup --out` — safe path restriction to home / cwd / tmp

### Fixed (rounds 3–16)

- **R3** — Serialize concurrent Context tier runs to prevent transcript races; move system prompt into cached block; use context manager for Deepgram connect
- **R4** — Observer callback exceptions don't kill tier runners; parse bulleted sections across empty section boundaries; skip unreadable session files in rollup; call `on_polish` at session close; unify `DriftLabel` across tiers and HUD
- **R5** — Strip marker literals from managed section body (SEC-1); escape multiline `recent_verbatim` in distillation Markdown (SEC-2); PID file header ownership check in `stop` (SEC-3); cap utterance text at 8000 chars (SEC-4); rate-limit Immediate tier with `min_utterances` + `min_interval` (COST-2); move `recent_verbatim` out of cached block (COST-1); pad shorter loopback frame with zeros (TEST-1)
- **R6** — Shutdown context failure falls back to last distillation (FAULT-8); stub `session.md` on no-speech session (FAULT-6); module + class docstrings across 25 files; move trigger log write into `TriggerDetector.log_fire`
- **R7** — Deepgram fail-loud error callback (FAULT-3+10); `AudioCapture` sink guard; `--version` flag; `TriggerDetector.fire_count` property; `rollup --since-hours` validation + empty-output hint; 35 new coverage tests
- **R8** — Typing fixes (TYPE-1/4/5/7); `TierEvent.elapsed_seconds` (unified time domain); rename `_log_trigger` and `_decode_deepgram_result`; strengthen weak assertions (models, log format, events)
- **R9** — Extract `AudioIngress` from Orchestrator (F2); extract `_PauseWatcherState` from Orchestrator (F5)
- **R10** — Remove dead `_PauseWatcherState` fields; `Orchestrator.override_pause_settings` for tests; 7 E2E scenario tests
- **R11** — Suppress spurious `ImmediateTier` fire on hibernate resume (FAULT-5); `__all__` exports to tier/transcript/HUD packages (TYPE-10); graceful import errors for numpy/sounddevice (FAULT-9); XML-wrap transcript content in all tier `fresh_input` (SEC-7); startup warning for verbatim transcript persistence (SEC-5); `rollup --out` safe path restriction (SEC-6)
- **R12** — Rename `now` → `audio_ts` in tier APIs, `reference_ts` in `RollingTranscript.tail`, `wall_clock_ts` in `TriggerDetector.check`; `status` shows session start time + elapsed (UX-5); `stop`/`status` wrong-cwd hint (UX-10); strengthen weak assertions (#10 scheduler upper-bound, #11 polish `use_cache`, #12 rollup dedup section-scoped)
- **R13** — Open-source readiness: package README (pitch, quickstart, arch), MIT LICENSE, CONTRIBUTING.md (test/ralf/style), CI workflow (path-filtered), py.typed marker, examples/basic_usage.sh (FAKE_API fixture)
- **R14** — stdin file redirect fallback (was: pipe-only); test coverage for edge-case input modes
- **R15** — mypy clean pass (0 errors): fixed method-assign, no-redef, attr-defined issues in cli.py and hud/renderer.py; added [tool.mypy] config
- **R16** — Replace deprecated asyncio.get_event_loop() with get_running_loop(); fix audio-error elapsed time computation (session-relative instead of boot-relative); assert-narrows type-ignore on PauseWatcher.mark_fired()

---

## Versioning

spec-lesson uses [Semantic Versioning](https://semver.org/). The `0.x` series is pre-stable — public APIs may change between minor releases.
