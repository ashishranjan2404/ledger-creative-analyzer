# spec-lesson — design

**Status:** design approved, pending implementation plan
**Author:** Ash
**Date:** 2026-04-22

## 1. Problem

People with ADHD lose the thread during long meetings. They tangent, miss what was just said, or blank out when asked to respond. The meeting ends and so does the chance to capture what was actually agreed — leaving vague commitments and half-remembered requirements.

The same problem shows up when narrating a build to Claude Code: you talk for 45 minutes working through what you want, then need to compress it into a prompt. The compression loses half the nuance.

`spec-lesson` is an ADHD-first live assistant that:
1. Nudges you when the conversation drifts off-topic (real-time)
2. Offers response candidates when you stall mid-sentence (sub-second)
3. Continuously distills the conversation into a brief that Claude Code can read as soon as you say *"OK Claude, build that."*
4. Produces a polished Obsidian-style note at session close

It is not another post-meeting transcription tool. It works **in the moment** and hands its output to the agent that will act on it.

## 2. Goals / non-goals

### Goals (MVP)

- **C**: Real-time topic-drift nudge via floating HUD (≤10s detection latency)
- **B**: Response-suggestion candidates on speaker pause (<1.5s end-to-end)
- **E**: Auto-updated managed section in project `CLAUDE.md` — Claude Code always has fresh context when invoked in the session directory
- **D**: Polished Obsidian note at session close + hourly cross-session roll-up via Claude Code `/schedule` routine
- **Hard 1.5hr session cap** — process exits automatically, bounding cost
- **Cost envelope:** ≤$0.50 per 1.5hr session at listed Anthropic pricing (see §7)

### Non-goals (v1)

- Auto-invoking Claude Code headlessly on trigger (blast radius; v2 behind flag with dry-run)
- Multi-speaker diarization beyond what Deepgram provides out-of-box
- iOS / mobile / in-person meetings (macOS + virtual meetings only)
- Cross-provider fallback to OpenAI (OPENAI_API_KEY is set locally but not wired in v1 — can add later)
- Non-English transcription
- Meeting calendar integration

## 3. Success criteria

- In a 60-min Zoom meeting, the HUD flags at least one real drift (verified by post-hoc review) without more than one false positive
- At session close, the generated spec in `CLAUDE.md`'s managed section is sufficient for Claude Code to start building without requiring the user to re-explain the brief in their own words
- The append-only `decisions` and `requirements` lists in the distillation contain no forgotten items vs. a manual audit of the raw transcript
- Total Anthropic API spend for 20 1.5hr sessions/month stays under $10

## 4. User experience

### Startup

```bash
cd abc/                # any project directory
spec-lesson start      # daemonizes; HUD appears top-right
```

`abc/` gets a `CLAUDE.md` created or amended with a `<!-- spec-lesson:start -->...<!-- spec-lesson:end -->` managed section. A `.spec-lesson/` subdir is created.

### During session

- HUD (top-right, always-on-top, translucent ~300×200px)
  - Line 1: current topic (1 line, auto-truncated)
  - Line 2: drift badge — 🟢 on-topic / 🟡 drifting: *[original topic]*
  - Panel: last 3 response candidates (dismiss with Esc or click)
  - Timeline: scrollable log of drift alerts + trigger fires
  - Countdown: time remaining before 1.5hr hard stop
- On **"OK Claude, build that"** (fuzzy match):
  - HUD flashes green; managed section in `CLAUDE.md` is refreshed within ~3s
  - Trigger entry appended to `.spec-lesson/triggers.log`

### Mid-session controls

```bash
spec-lesson status     # time remaining, last trigger, drift state
spec-lesson stop       # early close; runs final polish immediately
```

### Session close

Process exits when:
- 1.5hr elapsed (hard cap), or
- User ran `spec-lesson stop`, or
- User hit Ctrl-C

On exit: final polish tier runs; `CLAUDE.md` managed section gets its final state; `.spec-lesson/session-<timestamp>.md` gets the full distillation history; HUD closes.

## 5. Architecture

### Components

```
┌─ capture ──────────────────────────────────────────┐
│  BlackHole (virtual audio loopback for Zoom/Meet)  │
│  + Mic → Deepgram streaming WebSocket (Nova-3)     │
│  Persists: .spec-lesson/session-<ts>.jsonl         │
└──┬─────────────────────────────────────────────────┘
   │ utterances
   ▼
┌─ tier orchestrator ────────────────────────────────┐
│  Python daemon. Reads rolling transcript.          │
│  Fires tiers on independent schedules:             │
│  - Immediate: on pause >1s detection               │
│  - Thread: every 2 min (interval timer)            │
│  - Context: every 5 min + on trigger detection     │
│  - Polish: on session close                        │
└──┬─────────────────────────────────────────────────┘
   │ writes
   ▼
┌─ outputs ──────────────────────────────────────────┐
│  - HUD (Tauri / PyObjC transparent window)         │
│  - CLAUDE.md managed section (atomic rewrite)      │
│  - .spec-lesson/session-<ts>.md (distillation log) │
│  - .spec-lesson/triggers.log                       │
└────────────────────────────────────────────────────┘

Separately, running in Anthropic cloud:
┌─ `/schedule` routine (hourly cross-session) ───────┐
│  Reads ~/Obsidian/claude-vault/spec-lessons/*.md   │
│  Emits daily/weekly roll-up notes                  │
└────────────────────────────────────────────────────┘
```

### Summarization tiers

| Tier | Cadence | Model | Input | Output |
|---|---|---|---|---|
| Immediate | On speaker pause >1s | Haiku 4.5 | last 90s of transcript | 3 response candidates, ≤20 tokens each |
| Thread | Every 2 min | Haiku 4.5 | current topic (from previous Thread) + last 2 min transcript | new current topic + drift signal vs. Context-tier baseline |
| Context | Every 5 min **and** on trigger | Sonnet 4.6 | previous Context output + all transcript since last Context run | updated full-session distillation |
| Polish | On session close | Sonnet 4.6 | final Context output + full transcript | finalized Obsidian note with frontmatter |

**Hierarchical rolling compaction:** Each Context run gets the previous Context output plus only the new transcript. Output always covers the entire session so far, never just the latest window. Structured fields (`decisions`, `requirements`, `open_questions`) are append-only — system prompt forbids removal to prevent forgetting.

### Trigger detection

Normalized (lowercase, punctuation stripped, whitespace collapsed) transcript chunks are matched against:

```
/\bok(ay)?\s+claude[,.]?\s+build\s+(this|that|it)\b/i
```

Matches: "OK Claude, build that" / "okay claude build this" / "Ok, Claude. Build it." / "OK Claude build that".

On match:
1. Cancel any in-flight Context tier call
2. Run Context tier immediately with full session transcript
3. Rewrite `CLAUDE.md` managed section
4. Flash HUD green + append to `triggers.log`
5. 30s cooldown before re-arming (prevents re-fires)

LLM-based fallback classifier (v1.5): if no regex match in 60s after a possible-build phrase, run a small classifier over the last 2 min of transcript asking *"did the user just ask to build something?"* — fires the same refresh if yes.

## 6. Key data structures

### CLAUDE.md managed section

```markdown
<!-- spec-lesson:start -->
## Session context (auto-generated — last updated 14:47:32)

**Topic:** Building a meeting-capture tool with multi-tier summarization

**Decisions so far:**
- Use Deepgram for transcription (faster than ElevenLabs, user has key)
- 1.5hr hard session cap
- macOS-first; iOS deferred

**Requirements:**
- HUD must not steal focus while user is in Zoom
- Trigger phrase is fuzzy: "OK Claude build {this|that|it}"
- Managed section in CLAUDE.md, not sidecar file

**Open questions:**
- Do we want the LLM fallback classifier in MVP or v1.5?

**Recent verbatim (last 3 min):**
> ...raw tail of transcript...
<!-- spec-lesson:end -->
```

### `.spec-lesson/session-<ts>.md`

Append-only log of every Context-tier output over the session. Timestamped. Lets you replay how the understanding evolved.

### `.spec-lesson/session-<ts>.jsonl`

One line per Deepgram utterance: `{timestamp, speaker, text, is_final}`. Raw source of truth.

### `.spec-lesson/triggers.log`

One line per trigger fire: `timestamp | matched_phrase | distillation_length`.

## 7. Model / provider choices

All in-session summarization goes via the Anthropic SDK (direct API, not `claude --print`). Reason: `claude --print` cold-start is 3–8s per call — cannot hit the <1.5s latency target for the Immediate tier.

- Haiku 4.5 for Immediate + Thread tiers (fast, cheap, adequate quality for these jobs)
- Sonnet 4.6 for Context + Polish tiers (quality matters; Context output is what Claude Code reads)
- Prompt caching enabled on the rolling transcript across all tiers (~90% discount on cached input)

The hourly cross-session roll-up runs as a Claude Code `/schedule` routine on the user's Max plan — no incremental API spend.

### Cost envelope per 1.5hr session (conservative)

| Tier | Calls | Tokens/call (fresh + cached + out) | Subtotal |
|---|---|---|---|
| Immediate | 30 | 500 + 5k + 100 | ~$0.05 |
| Thread | 45 | 500 + 5k + 100 | ~$0.07 |
| Context | 18 | 500 + 10k + 500 | ~$0.22 |
| Polish | 1 | 15k + 0 + 2k | ~$0.05 |
| **Total** | | | **~$0.40** |

## 8. Session lifecycle & safety

- Hard stop at 1.5hr from `spec-lesson start`. Signal: SIGTERM to daemon → Polish tier runs → HUD closes.
- Countdown is visible in HUD from 5 min before hard stop.
- Daemon writes PID file to `.spec-lesson/daemon.pid`. `spec-lesson status` and `spec-lesson stop` use it.
- Process crash: `.spec-lesson/session-<ts>.jsonl` is fsync'd per utterance, so raw transcript is durable. On next `start`, prompt to recover orphaned session (run Polish over it).
- `DEEPGRAM_API_KEY` and `ANTHROPIC_API_KEY` read from environment at start. Missing key → refuse to start with a clear error.

## 9. Implementation notes

### macOS audio capture

- Assumes user has installed BlackHole 2ch (`brew install blackhole-2ch`) as a virtual audio device
- Audio routing: Zoom/Meet/Teams output → Multi-Output Device (BlackHole + speakers) so user still hears the call
- Input: mic (built-in or external) + BlackHole, mixed via `sounddevice` or `pyaudio` before streaming to Deepgram

### Deepgram streaming

- Use Nova-3 endpoint with `diarize=true`, `smart_format=true`, `interim_results=true`
- Non-interim (finalized) utterances drive Thread/Context tiers
- Interim results optional for Immediate tier if latency allows

### HUD

- Prototype: Python + PyObjC transparent NSWindow (no packaging overhead, fits the "python script" framing)
- If UX needs grow beyond what PyObjC comfortably supports, migrate to Tauri (Rust + web frontend) in v2

### Trigger regex + cooldown

Small module; pure string matching. Tested against a corpus of ~30 variations collected during MVP testing.

## 10. Deferred to v2 (explicit non-goals above)

- E-trigger v2: auto-invoke `claude --print` or Agent SDK on trigger with dry-run mode
- OpenAI fallback provider (key is present but unused in v1)
- Topic-shift detection refinements using clustering of rolling Thread outputs
- Tauri-based HUD with richer interactions
- iOS companion with haptic nudges
- Diarization improvements

## 11. Prior art & differentiation

- **Otter / Fireflies / Fathom / Granola / Jamie**: post-meeting summaries; none target working-memory re-entry or ADHD drift
- **Microsoft Teams Live Captions / Wordly / Caption.Ed**: captions only, no rolling distillation
- **"Understood" (UIST 2025, arxiv 2507.18151)**: closest academic prior art — real-time summary + topic-drift + word suggestions for ADHD — but requires HoloLens 2 hardware. spec-lesson is software-only, laptop-native, and adds the Claude Code context bridge which no prior work does.
- **"Neurodivergent-Aware Productivity Framework" (arxiv 2507.06864)**: design principles adopted — co-regulation over correction, soft-touch nudges, local-first where possible.

## 12. Open questions (to settle during planning)

- HUD stack: PyObjC vs. Tauri for MVP? (Favor PyObjC for speed of first build.)
- Where does raw transcript JSONL live long-term? `.spec-lesson/` only, or also archived to `~/Obsidian/claude-vault/spec-lessons/`?
- Should the `/schedule` roll-up routine be created as part of the MVP ship, or manually configured by user after first session?
