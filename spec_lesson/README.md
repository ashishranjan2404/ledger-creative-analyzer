# spec-lesson

**ADHD live meeting assistant + Claude Code context bridge.**

spec-lesson listens to your meeting (mic + BlackHole system-audio loopback, or a JSONL transcript stream), runs three LLM tiers in parallel, and writes structured notes directly into your project's `CLAUDE.md` in real time — so your next Claude Code session inherits everything that was decided in the call.

---

## Quickstart

```bash
pip install -e .

# Live audio — requires Deepgram key + BlackHole (brew install blackhole-2ch)
ANTHROPIC_API_KEY=sk-... DEEPGRAM_API_KEY=... spec-lesson start --audio

# Headless replay from a JSONL transcript
cat my-meeting.jsonl | ANTHROPIC_API_KEY=sk-... \
  spec-lesson start --transcript-stdin

# HUD: real-time floating overlay
spec-lesson start --audio --hud stdout     # plain terminal
spec-lesson start --audio --hud tk         # Tkinter overlay

# Session management
spec-lesson status   # is a daemon running in the current directory?
spec-lesson stop     # graceful SIGTERM
spec-lesson rollup   # aggregate last 24 h of sessions into one Markdown doc
```

BlackHole install (macOS):

```bash
brew install blackhole-2ch
# then open Audio MIDI Setup and create a Multi-Output Device
```

---

## Architecture

Three tiers run in parallel inside a single asyncio event loop:

| Tier | Interval | Purpose |
|---|---|---|
| **Context** | 30 s | Rolling compaction → structured distillation written to `CLAUDE.md` |
| **Thread** | 10 s | Topic-drift detection, drift label exposed to HUD |
| **Immediate** | per-utterance (rate-limited) | Real-time response suggestions |

A **TriggerDetector** fires on trigger phrases (e.g. "spec lesson update") and forces an out-of-band Context write. A **PolishTier** runs once at session close for a final high-quality distillation.

Session artefacts are written to `.spec-lesson/` in the current working directory:

```
.spec-lesson/
  sessions/<ISO-date>/
    transcript.jsonl   # verbatim utterances (fsync'd)
    session.md         # final distillation
  daemon.pid           # running daemon PID + start timestamp
```

Full design doc: [`docs/superpowers/specs/2026-04-22-spec-lesson-design.md`](../docs/superpowers/specs/2026-04-22-spec-lesson-design.md)

---

## Contributing

See [`CONTRIBUTING.md`](../CONTRIBUTING.md) at the repo root.

```bash
# Run the full test suite (219 tests)
pip install -e ".[dev]"
pytest -q
```

The refinement history lives in `docs/ralf/spec-lesson-critique/` — each round's judge file records what was fixed and why.

---

## License

MIT — see [`LICENSE`](../LICENSE) at the repo root.
