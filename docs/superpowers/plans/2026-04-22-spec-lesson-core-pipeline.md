# spec-lesson Core Pipeline Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the headless core of spec-lesson — a Python daemon that ingests a timestamped transcript, runs three summarization tiers (Thread/Context/Polish), detects the "OK Claude, build that" trigger, updates a managed section of the project's CLAUDE.md, and enforces a 1.5hr hard session cap.

**Architecture:** Async Python daemon. Transcript arrives as JSONL (from stdin in MVP; live audio is Plan 2). Tier scheduler runs Thread/Context/Polish concurrently on independent cadences. Context tier does hierarchical rolling compaction — each run eats the previous distillation + new transcript and emits a distillation covering the whole session. Trigger detector watches each utterance for fuzzy regex match and force-fires the Context tier. A single CLAUDE.md writer owns the atomic rewrite of the managed section.

**Tech Stack:** Python 3.11+ · `anthropic` (Claude API SDK w/ prompt caching) · `typer` (CLI) · `pytest` + `pytest-asyncio` + `respx` + `freezegun` (tests). No audio deps in Plan 1.

**Scope excluded from this plan:**
- Live audio capture (Deepgram + sounddevice) → **Plan 2**
- Immediate tier / feature B (pause-triggered response suggestions) → **Plan 2** (requires audio pauses)
- HUD (PyObjC transparent window) → **Plan 3**
- Cross-session `/schedule` roll-up routine → **Plan 4**

The binary shipped by this plan works like: `spec-lesson start --transcript-stdin < fixture.jsonl`. That's enough to prove the pipeline end-to-end.

---

## File Structure

```
spec_lesson/                       # package root
├── __init__.py
├── cli.py                         # typer entrypoint: spec-lesson start|status|stop
├── lifecycle.py                   # PID file, signal handlers, 1.5hr hard cap
├── session.py                     # Session dataclass (id, started_at, paths)
├── transcript/
│   ├── __init__.py
│   ├── utterance.py               # Utterance dataclass
│   ├── buffer.py                  # RollingTranscript (in-memory, time-windowed)
│   └── persist.py                 # JSONL writer (append-only, fsync-per-line)
├── trigger/
│   ├── __init__.py
│   └── detector.py                # normalize + regex + cooldown
├── tiers/
│   ├── __init__.py
│   ├── base.py                    # Tier protocol + TierScheduler
│   ├── client.py                  # AnthropicClient wrapper w/ prompt caching
│   ├── prompts.py                 # all system prompts in one place
│   ├── thread.py                  # C tier: drift detection every 2 min
│   ├── context.py                 # E tier: rolling compaction every 5 min + on trigger
│   └── polish.py                  # D tier: final artifact at session close
└── writer/
    ├── __init__.py
    └── claude_md.py               # atomic rewrite of managed section

tests/
├── unit/
│   ├── test_utterance.py
│   ├── test_buffer.py
│   ├── test_persist.py
│   ├── test_trigger.py
│   ├── test_claude_md.py
│   ├── test_context_tier.py
│   ├── test_thread_tier.py
│   └── test_polish_tier.py
├── integration/
│   ├── test_scheduler.py
│   ├── test_end_to_end.py
│   └── fixtures/
│       └── meeting_transcript.jsonl
└── conftest.py

pyproject.toml
.gitignore
README.md                          # just a pointer to docs/
```

---

## Task 1: Project scaffolding

**Files:**
- Create: `pyproject.toml`
- Create: `.gitignore`
- Create: `spec_lesson/__init__.py`
- Create: `tests/__init__.py`
- Create: `tests/conftest.py`

- [ ] **Step 1: Write `pyproject.toml`**

```toml
[project]
name = "spec-lesson"
version = "0.1.0"
description = "ADHD live meeting assistant + Claude Code context bridge"
requires-python = ">=3.11"
dependencies = [
    "anthropic>=0.39.0",
    "typer>=0.12.0",
]

[project.optional-dependencies]
dev = [
    "pytest>=8.0",
    "pytest-asyncio>=0.23",
    "respx>=0.21",
    "freezegun>=1.4",
]

[project.scripts]
spec-lesson = "spec_lesson.cli:app"

[build-system]
requires = ["setuptools>=68"]
build-backend = "setuptools.build_meta"

[tool.setuptools.packages.find]
include = ["spec_lesson*"]

[tool.pytest.ini_options]
asyncio_mode = "auto"
testpaths = ["tests"]
```

- [ ] **Step 2: Write `.gitignore`**

```
__pycache__/
*.py[cod]
.pytest_cache/
.venv/
dist/
build/
*.egg-info/
.spec-lesson/
```

- [ ] **Step 3: Create empty package files**

```python
# spec_lesson/__init__.py
__version__ = "0.1.0"
```

```python
# tests/__init__.py
```

```python
# tests/conftest.py
import pytest
```

- [ ] **Step 4: Install and verify**

Run: `python -m venv .venv && source .venv/bin/activate && pip install -e ".[dev]" && pytest`
Expected: PASS with "no tests ran" (or "collected 0 items")

- [ ] **Step 5: Commit**

```bash
git add pyproject.toml .gitignore spec_lesson/__init__.py tests/__init__.py tests/conftest.py
git commit -m "chore(spec-lesson): project scaffolding"
```

---

## Task 2: Utterance dataclass

**Files:**
- Create: `spec_lesson/transcript/__init__.py` (empty)
- Create: `spec_lesson/transcript/utterance.py`
- Create: `tests/unit/__init__.py` (empty)
- Create: `tests/unit/test_utterance.py`

- [ ] **Step 1: Write the failing test**

```python
# tests/unit/test_utterance.py
from spec_lesson.transcript.utterance import Utterance

def test_utterance_from_dict_roundtrip():
    data = {
        "timestamp": 1714000000.5,
        "speaker": "user",
        "text": "OK Claude, build that",
        "is_final": True,
    }
    u = Utterance.from_dict(data)
    assert u.timestamp == 1714000000.5
    assert u.speaker == "user"
    assert u.text == "OK Claude, build that"
    assert u.is_final is True
    assert u.to_dict() == data

def test_utterance_to_jsonl_line():
    u = Utterance(timestamp=1.0, speaker="user", text="hi", is_final=True)
    assert u.to_jsonl() == '{"timestamp": 1.0, "speaker": "user", "text": "hi", "is_final": true}'
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pytest tests/unit/test_utterance.py -v`
Expected: FAIL with `ModuleNotFoundError: spec_lesson.transcript.utterance`

- [ ] **Step 3: Write minimal implementation**

```python
# spec_lesson/transcript/__init__.py
```

```python
# spec_lesson/transcript/utterance.py
import json
from dataclasses import dataclass, asdict

@dataclass(frozen=True)
class Utterance:
    timestamp: float
    speaker: str
    text: str
    is_final: bool

    @classmethod
    def from_dict(cls, data: dict) -> "Utterance":
        return cls(
            timestamp=data["timestamp"],
            speaker=data["speaker"],
            text=data["text"],
            is_final=data["is_final"],
        )

    def to_dict(self) -> dict:
        return asdict(self)

    def to_jsonl(self) -> str:
        return json.dumps(self.to_dict())
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pytest tests/unit/test_utterance.py -v`
Expected: PASS (2 passed)

- [ ] **Step 5: Commit**

```bash
git add spec_lesson/transcript/__init__.py spec_lesson/transcript/utterance.py tests/unit/__init__.py tests/unit/test_utterance.py
git commit -m "feat(spec-lesson): Utterance dataclass"
```

---

## Task 3: JSONL persistence (append + fsync)

**Files:**
- Create: `spec_lesson/transcript/persist.py`
- Create: `tests/unit/test_persist.py`

- [ ] **Step 1: Write the failing test**

```python
# tests/unit/test_persist.py
import json
import os
from pathlib import Path
from spec_lesson.transcript.utterance import Utterance
from spec_lesson.transcript.persist import TranscriptWriter

def test_writer_appends_and_fsyncs(tmp_path: Path):
    path = tmp_path / "session.jsonl"
    writer = TranscriptWriter(path)
    u1 = Utterance(1.0, "user", "hello", True)
    u2 = Utterance(2.0, "user", "world", True)
    writer.append(u1)
    writer.append(u2)
    writer.close()
    lines = path.read_text().splitlines()
    assert len(lines) == 2
    assert json.loads(lines[0]) == u1.to_dict()
    assert json.loads(lines[1]) == u2.to_dict()

def test_writer_creates_parent_dirs(tmp_path: Path):
    path = tmp_path / "nested" / "dir" / "session.jsonl"
    writer = TranscriptWriter(path)
    writer.append(Utterance(1.0, "user", "x", True))
    writer.close()
    assert path.exists()
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pytest tests/unit/test_persist.py -v`
Expected: FAIL with `ModuleNotFoundError: spec_lesson.transcript.persist`

- [ ] **Step 3: Write minimal implementation**

```python
# spec_lesson/transcript/persist.py
import os
from pathlib import Path
from .utterance import Utterance

class TranscriptWriter:
    def __init__(self, path: Path):
        self.path = Path(path)
        self.path.parent.mkdir(parents=True, exist_ok=True)
        self._fh = self.path.open("a", encoding="utf-8")

    def append(self, utterance: Utterance) -> None:
        self._fh.write(utterance.to_jsonl() + "\n")
        self._fh.flush()
        os.fsync(self._fh.fileno())

    def close(self) -> None:
        self._fh.close()

    def __enter__(self) -> "TranscriptWriter":
        return self

    def __exit__(self, *args) -> None:
        self.close()
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pytest tests/unit/test_persist.py -v`
Expected: PASS (2 passed)

- [ ] **Step 5: Commit**

```bash
git add spec_lesson/transcript/persist.py tests/unit/test_persist.py
git commit -m "feat(spec-lesson): JSONL transcript writer with fsync"
```

---

## Task 4: Rolling transcript buffer

**Files:**
- Create: `spec_lesson/transcript/buffer.py`
- Create: `tests/unit/test_buffer.py`

- [ ] **Step 1: Write the failing test**

```python
# tests/unit/test_buffer.py
from spec_lesson.transcript.utterance import Utterance
from spec_lesson.transcript.buffer import RollingTranscript

def _u(t, text):
    return Utterance(timestamp=t, speaker="user", text=text, is_final=True)

def test_append_and_all():
    buf = RollingTranscript()
    buf.append(_u(1.0, "a"))
    buf.append(_u(2.0, "b"))
    assert [u.text for u in buf.all()] == ["a", "b"]

def test_since_returns_utterances_after_timestamp():
    buf = RollingTranscript()
    buf.append(_u(1.0, "a"))
    buf.append(_u(2.0, "b"))
    buf.append(_u(3.0, "c"))
    assert [u.text for u in buf.since(1.5)] == ["b", "c"]

def test_tail_returns_utterances_within_window():
    buf = RollingTranscript()
    buf.append(_u(10.0, "a"))
    buf.append(_u(100.0, "b"))
    buf.append(_u(110.0, "c"))
    # now=120, window=30 → include utterances >= 90
    assert [u.text for u in buf.tail(seconds=30.0, now=120.0)] == ["b", "c"]

def test_latest_timestamp():
    buf = RollingTranscript()
    assert buf.latest_timestamp() is None
    buf.append(_u(1.0, "a"))
    buf.append(_u(5.0, "b"))
    assert buf.latest_timestamp() == 5.0

def test_only_final_utterances_stored():
    buf = RollingTranscript()
    buf.append(Utterance(1.0, "user", "partial", False))
    buf.append(Utterance(2.0, "user", "done", True))
    assert [u.text for u in buf.all()] == ["done"]
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pytest tests/unit/test_buffer.py -v`
Expected: FAIL with `ModuleNotFoundError: spec_lesson.transcript.buffer`

- [ ] **Step 3: Write minimal implementation**

```python
# spec_lesson/transcript/buffer.py
from typing import Optional
from .utterance import Utterance

class RollingTranscript:
    def __init__(self) -> None:
        self._utterances: list[Utterance] = []

    def append(self, utterance: Utterance) -> None:
        if not utterance.is_final:
            return
        self._utterances.append(utterance)

    def all(self) -> list[Utterance]:
        return list(self._utterances)

    def since(self, timestamp: float) -> list[Utterance]:
        return [u for u in self._utterances if u.timestamp > timestamp]

    def tail(self, seconds: float, now: float) -> list[Utterance]:
        cutoff = now - seconds
        return [u for u in self._utterances if u.timestamp >= cutoff]

    def latest_timestamp(self) -> Optional[float]:
        if not self._utterances:
            return None
        return self._utterances[-1].timestamp

    def as_text(self, utterances: Optional[list[Utterance]] = None) -> str:
        src = utterances if utterances is not None else self._utterances
        return "\n".join(f"[{u.timestamp:.1f}] {u.speaker}: {u.text}" for u in src)
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pytest tests/unit/test_buffer.py -v`
Expected: PASS (5 passed)

- [ ] **Step 5: Commit**

```bash
git add spec_lesson/transcript/buffer.py tests/unit/test_buffer.py
git commit -m "feat(spec-lesson): RollingTranscript buffer"
```

---

## Task 5: Trigger detector

**Files:**
- Create: `spec_lesson/trigger/__init__.py` (empty)
- Create: `spec_lesson/trigger/detector.py`
- Create: `tests/unit/test_trigger.py`

- [ ] **Step 1: Write the failing test**

```python
# tests/unit/test_trigger.py
import pytest
from spec_lesson.trigger.detector import TriggerDetector

@pytest.mark.parametrize("text", [
    "OK Claude, build that",
    "okay claude build this",
    "Ok, Claude. Build it.",
    "OK Claude build that",
    "  ok   claude,,build  that  ",
    "Okay Claude, please... build this.",
])
def test_detects_valid_trigger_variants(text):
    det = TriggerDetector()
    assert det.check(text, now=1.0) is True

@pytest.mark.parametrize("text", [
    "okay claude",
    "build that",
    "claude build",
    "ok clod build that",
    "let's just plan it",
])
def test_rejects_non_triggers(text):
    det = TriggerDetector()
    assert det.check(text, now=1.0) is False

def test_cooldown_suppresses_refire():
    det = TriggerDetector(cooldown_seconds=30.0)
    assert det.check("ok claude build that", now=100.0) is True
    # within cooldown
    assert det.check("ok claude build this", now=120.0) is False
    # after cooldown
    assert det.check("ok claude build it", now=131.0) is True
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pytest tests/unit/test_trigger.py -v`
Expected: FAIL with `ModuleNotFoundError: spec_lesson.trigger.detector`

- [ ] **Step 3: Write minimal implementation**

```python
# spec_lesson/trigger/__init__.py
```

```python
# spec_lesson/trigger/detector.py
import re
from typing import Optional

_TRIGGER_PATTERN = re.compile(
    r"\bok(?:ay)?\s+claude\b[^a-zA-Z]*\bbuild\s+(?:this|that|it)\b",
    re.IGNORECASE,
)

def normalize(text: str) -> str:
    # collapse whitespace, keep lowercase letters + digits + spaces
    lowered = text.lower()
    cleaned = re.sub(r"[^a-z0-9\s]", " ", lowered)
    collapsed = re.sub(r"\s+", " ", cleaned).strip()
    return collapsed

class TriggerDetector:
    def __init__(self, cooldown_seconds: float = 30.0):
        self.cooldown_seconds = cooldown_seconds
        self._last_fire_at: Optional[float] = None

    def check(self, text: str, now: float) -> bool:
        normalized = normalize(text)
        if not _TRIGGER_PATTERN.search(normalized):
            return False
        if self._last_fire_at is not None and now - self._last_fire_at < self.cooldown_seconds:
            return False
        self._last_fire_at = now
        return True
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pytest tests/unit/test_trigger.py -v`
Expected: PASS (all parametrized + cooldown)

- [ ] **Step 5: Commit**

```bash
git add spec_lesson/trigger/__init__.py spec_lesson/trigger/detector.py tests/unit/test_trigger.py
git commit -m "feat(spec-lesson): trigger phrase detector with cooldown"
```

---

## Task 6: CLAUDE.md managed section writer

**Files:**
- Create: `spec_lesson/writer/__init__.py` (empty)
- Create: `spec_lesson/writer/claude_md.py`
- Create: `tests/unit/test_claude_md.py`

- [ ] **Step 1: Write the failing test**

```python
# tests/unit/test_claude_md.py
from pathlib import Path
from spec_lesson.writer.claude_md import ClaudeMdWriter

def test_creates_file_with_section_if_missing(tmp_path: Path):
    p = tmp_path / "CLAUDE.md"
    w = ClaudeMdWriter(p)
    w.write_managed_section("hello body")
    text = p.read_text()
    assert "<!-- spec-lesson:start -->" in text
    assert "hello body" in text
    assert "<!-- spec-lesson:end -->" in text

def test_rewrites_section_preserving_surrounding_content(tmp_path: Path):
    p = tmp_path / "CLAUDE.md"
    p.write_text(
        "# Project\n\nSome rules.\n\n<!-- spec-lesson:start -->\nOLD\n<!-- spec-lesson:end -->\n\nFooter.\n"
    )
    w = ClaudeMdWriter(p)
    w.write_managed_section("NEW DISTILLATION")
    text = p.read_text()
    assert "# Project" in text
    assert "Some rules." in text
    assert "Footer." in text
    assert "NEW DISTILLATION" in text
    assert "OLD" not in text

def test_appends_section_when_file_exists_but_no_markers(tmp_path: Path):
    p = tmp_path / "CLAUDE.md"
    p.write_text("# Project\n\nSome rules.\n")
    w = ClaudeMdWriter(p)
    w.write_managed_section("body")
    text = p.read_text()
    assert text.startswith("# Project")
    assert "<!-- spec-lesson:start -->" in text
    assert "body" in text

def test_atomic_rewrite_does_not_leave_tmp_files(tmp_path: Path):
    p = tmp_path / "CLAUDE.md"
    w = ClaudeMdWriter(p)
    w.write_managed_section("a")
    w.write_managed_section("b")
    w.write_managed_section("c")
    tmp_files = list(tmp_path.glob("CLAUDE.md.tmp*"))
    assert tmp_files == []
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pytest tests/unit/test_claude_md.py -v`
Expected: FAIL with `ModuleNotFoundError: spec_lesson.writer.claude_md`

- [ ] **Step 3: Write minimal implementation**

```python
# spec_lesson/writer/__init__.py
```

```python
# spec_lesson/writer/claude_md.py
import os
import re
import tempfile
from pathlib import Path

START_MARKER = "<!-- spec-lesson:start -->"
END_MARKER = "<!-- spec-lesson:end -->"

_SECTION_RE = re.compile(
    rf"{re.escape(START_MARKER)}.*?{re.escape(END_MARKER)}",
    re.DOTALL,
)

class ClaudeMdWriter:
    def __init__(self, path: Path):
        self.path = Path(path)

    def write_managed_section(self, body: str) -> None:
        block = f"{START_MARKER}\n{body}\n{END_MARKER}"
        if self.path.exists():
            existing = self.path.read_text(encoding="utf-8")
            if _SECTION_RE.search(existing):
                new = _SECTION_RE.sub(block, existing)
            else:
                sep = "" if existing.endswith("\n") else "\n"
                new = f"{existing}{sep}\n{block}\n"
        else:
            self.path.parent.mkdir(parents=True, exist_ok=True)
            new = f"{block}\n"
        self._atomic_write(new)

    def _atomic_write(self, content: str) -> None:
        fd, tmp_path = tempfile.mkstemp(
            prefix=f"{self.path.name}.tmp.",
            dir=str(self.path.parent),
        )
        try:
            with os.fdopen(fd, "w", encoding="utf-8") as fh:
                fh.write(content)
                fh.flush()
                os.fsync(fh.fileno())
            os.replace(tmp_path, self.path)
        except Exception:
            try:
                os.unlink(tmp_path)
            except FileNotFoundError:
                pass
            raise
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pytest tests/unit/test_claude_md.py -v`
Expected: PASS (4 passed)

- [ ] **Step 5: Commit**

```bash
git add spec_lesson/writer/__init__.py spec_lesson/writer/claude_md.py tests/unit/test_claude_md.py
git commit -m "feat(spec-lesson): CLAUDE.md managed section atomic rewrite"
```

---

## Task 7: Anthropic client wrapper with prompt caching

**Files:**
- Create: `spec_lesson/tiers/__init__.py` (empty)
- Create: `spec_lesson/tiers/client.py`
- Create: `tests/unit/test_client.py`

- [ ] **Step 1: Write the failing test**

```python
# tests/unit/test_client.py
import pytest
from unittest.mock import AsyncMock, MagicMock
from spec_lesson.tiers.client import AnthropicClient

@pytest.mark.asyncio
async def test_complete_calls_sdk_with_caching_on_transcript():
    mock_sdk = AsyncMock()
    fake_response = MagicMock()
    fake_response.content = [MagicMock(text="distilled")]
    mock_sdk.messages.create = AsyncMock(return_value=fake_response)

    client = AnthropicClient(sdk=mock_sdk)
    out = await client.complete(
        model="claude-haiku-4-5",
        system="You are a helpful summarizer.",
        cached_context="long rolling transcript here" * 100,
        fresh_input="new 30 seconds",
        max_tokens=200,
    )
    assert out == "distilled"
    call_kwargs = mock_sdk.messages.create.await_args.kwargs
    assert call_kwargs["model"] == "claude-haiku-4-5"
    assert call_kwargs["max_tokens"] == 200
    # system is structured with cache control on the cached block
    system = call_kwargs["system"]
    assert isinstance(system, list)
    types = [b["type"] for b in system]
    assert "text" in types
    # at least one block has cache_control = ephemeral
    assert any(b.get("cache_control", {}).get("type") == "ephemeral" for b in system)

@pytest.mark.asyncio
async def test_complete_passes_fresh_input_as_user_message():
    mock_sdk = AsyncMock()
    fake_response = MagicMock()
    fake_response.content = [MagicMock(text="ok")]
    mock_sdk.messages.create = AsyncMock(return_value=fake_response)
    client = AnthropicClient(sdk=mock_sdk)
    await client.complete(
        model="claude-haiku-4-5",
        system="sys",
        cached_context="ctx",
        fresh_input="hello",
        max_tokens=50,
    )
    messages = mock_sdk.messages.create.await_args.kwargs["messages"]
    assert messages == [{"role": "user", "content": "hello"}]
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pytest tests/unit/test_client.py -v`
Expected: FAIL with `ModuleNotFoundError: spec_lesson.tiers.client`

- [ ] **Step 3: Write minimal implementation**

```python
# spec_lesson/tiers/__init__.py
```

```python
# spec_lesson/tiers/client.py
from typing import Any, Optional

class AnthropicClient:
    """Thin wrapper over anthropic.AsyncAnthropic that structures the prompt
    so the rolling transcript is cached (90% discount on subsequent calls).

    The `system` field is sent as a list of two blocks:
      [ {system prompt}, {cached context with cache_control=ephemeral} ]
    The fresh_input is sent as the user message.
    """

    def __init__(self, sdk: Any, api_key: Optional[str] = None):
        if sdk is None:
            from anthropic import AsyncAnthropic
            sdk = AsyncAnthropic(api_key=api_key)
        self._sdk = sdk

    async def complete(
        self,
        *,
        model: str,
        system: str,
        cached_context: str,
        fresh_input: str,
        max_tokens: int,
    ) -> str:
        system_blocks = [
            {"type": "text", "text": system},
            {
                "type": "text",
                "text": cached_context,
                "cache_control": {"type": "ephemeral"},
            },
        ]
        response = await self._sdk.messages.create(
            model=model,
            max_tokens=max_tokens,
            system=system_blocks,
            messages=[{"role": "user", "content": fresh_input}],
        )
        return response.content[0].text
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pytest tests/unit/test_client.py -v`
Expected: PASS (2 passed)

- [ ] **Step 5: Commit**

```bash
git add spec_lesson/tiers/__init__.py spec_lesson/tiers/client.py tests/unit/test_client.py
git commit -m "feat(spec-lesson): Anthropic client wrapper with prompt caching"
```

---

## Task 8: Tier prompts + shared types

**Files:**
- Create: `spec_lesson/tiers/prompts.py`
- Create: `spec_lesson/tiers/base.py`
- Create: `tests/unit/test_base.py`

- [ ] **Step 1: Write the failing test**

```python
# tests/unit/test_base.py
import pytest
from spec_lesson.tiers.base import Distillation

def test_distillation_render_markdown():
    d = Distillation(
        topic="Building a voice tool",
        decisions=["1.5h cap", "Use Deepgram"],
        requirements=["macOS first", "HUD optional"],
        open_questions=["PyObjC or Tauri?"],
        recent_verbatim="user: ok ship it",
        updated_at_iso="2026-04-22T14:47:32",
    )
    md = d.render_markdown()
    assert "**Topic:** Building a voice tool" in md
    assert "- 1.5h cap" in md
    assert "- macOS first" in md
    assert "- PyObjC or Tauri?" in md
    assert "user: ok ship it" in md
    assert "2026-04-22T14:47:32" in md

def test_distillation_from_json_tolerates_missing_fields():
    d = Distillation.from_json('{"topic":"t","decisions":[],"requirements":[],"open_questions":[]}')
    assert d.topic == "t"
    assert d.recent_verbatim == ""

def test_distillation_merge_is_append_only():
    old = Distillation(
        topic="old",
        decisions=["d1"],
        requirements=["r1"],
        open_questions=["q1"],
        recent_verbatim="",
        updated_at_iso="",
    )
    new = Distillation(
        topic="new",
        decisions=["d2"],
        requirements=["r1", "r2"],
        open_questions=[],
        recent_verbatim="",
        updated_at_iso="",
    )
    merged = old.merge_append_only(new)
    assert merged.topic == "new"  # topic replaced
    assert merged.decisions == ["d1", "d2"]  # appended, no dup
    assert merged.requirements == ["r1", "r2"]  # appended, no dup
    assert merged.open_questions == ["q1"]  # not removed
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pytest tests/unit/test_base.py -v`
Expected: FAIL with `ModuleNotFoundError: spec_lesson.tiers.base`

- [ ] **Step 3: Write minimal implementation**

```python
# spec_lesson/tiers/prompts.py
CONTEXT_SYSTEM = """You are spec-lesson, a live distillation engine for a voice meeting.

You receive (A) the previous distillation of the entire session so far, and (B) new transcript since that distillation.

Your job: emit an updated distillation covering the ENTIRE session — the old parts plus the new.

Output strict JSON with these keys, and nothing else:
{
  "topic": "one short sentence describing what is currently being discussed",
  "decisions": ["durable decisions that have been made"],
  "requirements": ["requirements, constraints, specs"],
  "open_questions": ["unresolved questions"],
  "recent_verbatim": "the last ~3 minutes of transcript, quoted as-is"
}

CRITICAL RULES:
- Decisions, requirements, and open_questions are APPEND-ONLY. Never remove an item that appeared in the previous distillation, even if it now seems less relevant.
- It is fine to ADD new items, and to mark items resolved by adding them to decisions.
- Topic is replaced each run — reflect current discussion.
- Keep each list entry to one sentence.
- Output JSON ONLY, no prose around it.
"""

THREAD_SYSTEM = """You watch a live conversation for TOPIC DRIFT.

Given:
- The baseline topic (from the most recent Context-tier distillation)
- The last 2 minutes of transcript

Decide: is the conversation currently on-topic, or has it drifted?

Output strict JSON:
{
  "current_topic": "one short sentence",
  "drift": "on" | "drifting",
  "drift_from": "the baseline topic if drifting, empty string if on"
}

JSON ONLY.
"""

POLISH_SYSTEM = """You are writing the final Obsidian-style note for a meeting session that just ended.

Given:
- The final Context-tier distillation
- Optionally the full raw transcript

Produce a clean Markdown document with frontmatter:

---
date: YYYY-MM-DD
session: spec-lesson
topics: [tag1, tag2]
---

# [Short title]

## Summary
[2-3 sentence summary]

## Decisions
- ...

## Requirements
- ...

## Open questions
- ...

## Action items
- [ ] ...

OUTPUT THE MARKDOWN DOCUMENT ONLY.
"""
```

```python
# spec_lesson/tiers/base.py
import json
from dataclasses import dataclass, field
from typing import Any, Protocol

@dataclass
class Distillation:
    topic: str
    decisions: list[str]
    requirements: list[str]
    open_questions: list[str]
    recent_verbatim: str = ""
    updated_at_iso: str = ""

    @classmethod
    def empty(cls) -> "Distillation":
        return cls(topic="(session just started)", decisions=[], requirements=[], open_questions=[])

    @classmethod
    def from_json(cls, raw: str) -> "Distillation":
        data = json.loads(raw)
        return cls(
            topic=data.get("topic", ""),
            decisions=list(data.get("decisions", [])),
            requirements=list(data.get("requirements", [])),
            open_questions=list(data.get("open_questions", [])),
            recent_verbatim=data.get("recent_verbatim", ""),
            updated_at_iso=data.get("updated_at_iso", ""),
        )

    def to_json(self) -> str:
        return json.dumps({
            "topic": self.topic,
            "decisions": self.decisions,
            "requirements": self.requirements,
            "open_questions": self.open_questions,
            "recent_verbatim": self.recent_verbatim,
        })

    def merge_append_only(self, new: "Distillation") -> "Distillation":
        """Merge with append-only semantics: never drop items from old lists."""
        def _append_unique(old: list[str], fresh: list[str]) -> list[str]:
            seen = set(old)
            merged = list(old)
            for item in fresh:
                if item not in seen:
                    merged.append(item)
                    seen.add(item)
            return merged

        return Distillation(
            topic=new.topic or self.topic,
            decisions=_append_unique(self.decisions, new.decisions),
            requirements=_append_unique(self.requirements, new.requirements),
            open_questions=_append_unique(self.open_questions, new.open_questions),
            recent_verbatim=new.recent_verbatim,
            updated_at_iso=new.updated_at_iso,
        )

    def render_markdown(self) -> str:
        def bullets(items: list[str]) -> str:
            return "\n".join(f"- {x}" for x in items) if items else "- (none yet)"

        return (
            f"## Session context (auto-generated — last updated {self.updated_at_iso})\n\n"
            f"**Topic:** {self.topic}\n\n"
            f"**Decisions so far:**\n{bullets(self.decisions)}\n\n"
            f"**Requirements:**\n{bullets(self.requirements)}\n\n"
            f"**Open questions:**\n{bullets(self.open_questions)}\n\n"
            f"**Recent verbatim (last 3 min):**\n\n> {self.recent_verbatim or '(none)'}\n"
        )


class Tier(Protocol):
    name: str
    async def run(self) -> Any: ...
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pytest tests/unit/test_base.py -v`
Expected: PASS (3 passed)

- [ ] **Step 5: Commit**

```bash
git add spec_lesson/tiers/prompts.py spec_lesson/tiers/base.py tests/unit/test_base.py
git commit -m "feat(spec-lesson): Distillation dataclass + tier prompts"
```

---

## Task 9: Context tier (rolling compaction)

**Files:**
- Create: `spec_lesson/tiers/context.py`
- Create: `tests/unit/test_context_tier.py`

- [ ] **Step 1: Write the failing test**

```python
# tests/unit/test_context_tier.py
import pytest
from unittest.mock import AsyncMock
from spec_lesson.transcript.buffer import RollingTranscript
from spec_lesson.transcript.utterance import Utterance
from spec_lesson.tiers.base import Distillation
from spec_lesson.tiers.context import ContextTier

def _u(t, text): return Utterance(timestamp=t, speaker="user", text=text, is_final=True)

@pytest.mark.asyncio
async def test_first_run_uses_empty_previous_distillation():
    buf = RollingTranscript()
    buf.append(_u(1.0, "we want X"))
    buf.append(_u(2.0, "and Y"))

    fake_json = '{"topic":"X/Y","decisions":["X"],"requirements":["Y"],"open_questions":[],"recent_verbatim":"we want X and Y"}'
    client = AsyncMock()
    client.complete = AsyncMock(return_value=fake_json)

    tier = ContextTier(client=client, buffer=buf)
    out = await tier.run(now=3.0)
    assert out.topic == "X/Y"
    assert "X" in out.decisions
    assert "Y" in out.requirements
    # first call: cached context should be "(no previous distillation)"
    call = client.complete.await_args.kwargs
    assert "no previous distillation" in call["cached_context"].lower()

@pytest.mark.asyncio
async def test_second_run_passes_previous_distillation_as_cached_context():
    buf = RollingTranscript()
    buf.append(_u(1.0, "intro"))
    fake_json_1 = '{"topic":"t1","decisions":["d1"],"requirements":[],"open_questions":[],"recent_verbatim":""}'
    fake_json_2 = '{"topic":"t2","decisions":["d2"],"requirements":[],"open_questions":[],"recent_verbatim":""}'
    client = AsyncMock()
    client.complete = AsyncMock(side_effect=[fake_json_1, fake_json_2])
    tier = ContextTier(client=client, buffer=buf)
    await tier.run(now=2.0)
    buf.append(_u(3.0, "more"))
    merged = await tier.run(now=4.0)
    # append-only merge: d1 from first run preserved even if LLM "forgot" it
    assert "d1" in merged.decisions
    assert "d2" in merged.decisions
    # second call cached_context contains prior distillation topic
    second_call = client.complete.await_args_list[1].kwargs
    assert "t1" in second_call["cached_context"]

@pytest.mark.asyncio
async def test_run_tolerates_malformed_json_and_returns_previous():
    buf = RollingTranscript()
    buf.append(_u(1.0, "x"))
    client = AsyncMock()
    client.complete = AsyncMock(return_value="this is not json")
    tier = ContextTier(client=client, buffer=buf)
    out = await tier.run(now=2.0)
    assert out.topic == "(session just started)"
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pytest tests/unit/test_context_tier.py -v`
Expected: FAIL with `ModuleNotFoundError: spec_lesson.tiers.context`

- [ ] **Step 3: Write minimal implementation**

```python
# spec_lesson/tiers/context.py
import json
from datetime import datetime, timezone
from typing import Optional
from .base import Distillation
from .client import AnthropicClient
from .prompts import CONTEXT_SYSTEM
from ..transcript.buffer import RollingTranscript

class ContextTier:
    name = "context"
    model = "claude-sonnet-4-6"
    max_tokens = 1500

    def __init__(self, client: AnthropicClient, buffer: RollingTranscript):
        self._client = client
        self._buffer = buffer
        self._last: Distillation = Distillation.empty()
        self._last_timestamp_processed: float = 0.0

    @property
    def last(self) -> Distillation:
        return self._last

    async def run(self, now: float) -> Distillation:
        new_utterances = self._buffer.since(self._last_timestamp_processed)
        new_transcript = "\n".join(
            f"[{u.timestamp:.1f}] {u.speaker}: {u.text}" for u in new_utterances
        )
        cached = self._render_cached(self._last)
        fresh = f"NEW TRANSCRIPT SINCE LAST DISTILLATION:\n{new_transcript}" if new_transcript else "(no new transcript)"
        raw = await self._client.complete(
            model=self.model,
            system=CONTEXT_SYSTEM,
            cached_context=cached,
            fresh_input=fresh,
            max_tokens=self.max_tokens,
        )
        try:
            parsed = Distillation.from_json(raw)
        except (json.JSONDecodeError, KeyError, ValueError):
            # malformed output — keep previous distillation
            return self._last
        merged = self._last.merge_append_only(parsed)
        merged.updated_at_iso = datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%S")
        self._last = merged
        latest_ts = self._buffer.latest_timestamp()
        if latest_ts is not None:
            self._last_timestamp_processed = latest_ts
        return merged

    def _render_cached(self, prev: Distillation) -> str:
        if not prev.decisions and not prev.requirements and not prev.open_questions and prev.topic == "(session just started)":
            return "PREVIOUS DISTILLATION: (no previous distillation — this is the first run)"
        return f"PREVIOUS DISTILLATION:\n{prev.to_json()}"
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pytest tests/unit/test_context_tier.py -v`
Expected: PASS (3 passed)

- [ ] **Step 5: Commit**

```bash
git add spec_lesson/tiers/context.py tests/unit/test_context_tier.py
git commit -m "feat(spec-lesson): Context tier with rolling append-only compaction"
```

---

## Task 10: Thread tier (drift detection)

**Files:**
- Create: `spec_lesson/tiers/thread.py`
- Create: `tests/unit/test_thread_tier.py`

- [ ] **Step 1: Write the failing test**

```python
# tests/unit/test_thread_tier.py
import pytest
from unittest.mock import AsyncMock
from spec_lesson.transcript.buffer import RollingTranscript
from spec_lesson.transcript.utterance import Utterance
from spec_lesson.tiers.thread import ThreadTier, DriftState

def _u(t, text): return Utterance(timestamp=t, speaker="user", text=text, is_final=True)

@pytest.mark.asyncio
async def test_detects_on_topic():
    buf = RollingTranscript()
    buf.append(_u(1.0, "still talking about API design"))
    client = AsyncMock()
    client.complete = AsyncMock(return_value='{"current_topic":"API design","drift":"on","drift_from":""}')
    tier = ThreadTier(client=client, buffer=buf)
    state = await tier.run(baseline_topic="API design", now=2.0)
    assert state.drift == "on"
    assert state.current_topic == "API design"
    assert state.drift_from == ""

@pytest.mark.asyncio
async def test_detects_drifting():
    buf = RollingTranscript()
    buf.append(_u(1.0, "what's for dinner tonight"))
    client = AsyncMock()
    client.complete = AsyncMock(return_value='{"current_topic":"dinner plans","drift":"drifting","drift_from":"API design"}')
    tier = ThreadTier(client=client, buffer=buf)
    state = await tier.run(baseline_topic="API design", now=2.0)
    assert state.drift == "drifting"
    assert state.drift_from == "API design"

@pytest.mark.asyncio
async def test_malformed_json_returns_unknown_state():
    buf = RollingTranscript()
    buf.append(_u(1.0, "..."))
    client = AsyncMock()
    client.complete = AsyncMock(return_value="not json")
    tier = ThreadTier(client=client, buffer=buf)
    state = await tier.run(baseline_topic="X", now=2.0)
    assert state.drift == "unknown"
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pytest tests/unit/test_thread_tier.py -v`
Expected: FAIL with `ModuleNotFoundError: spec_lesson.tiers.thread`

- [ ] **Step 3: Write minimal implementation**

```python
# spec_lesson/tiers/thread.py
import json
from dataclasses import dataclass
from typing import Literal
from .client import AnthropicClient
from .prompts import THREAD_SYSTEM
from ..transcript.buffer import RollingTranscript

DriftLabel = Literal["on", "drifting", "unknown"]

@dataclass
class DriftState:
    current_topic: str
    drift: DriftLabel
    drift_from: str

class ThreadTier:
    name = "thread"
    model = "claude-haiku-4-5"
    max_tokens = 200
    TAIL_SECONDS = 120.0  # last 2 minutes

    def __init__(self, client: AnthropicClient, buffer: RollingTranscript):
        self._client = client
        self._buffer = buffer

    async def run(self, baseline_topic: str, now: float) -> DriftState:
        tail = self._buffer.tail(seconds=self.TAIL_SECONDS, now=now)
        tail_text = "\n".join(f"[{u.timestamp:.1f}] {u.speaker}: {u.text}" for u in tail)
        cached = f"BASELINE TOPIC: {baseline_topic}"
        fresh = f"LAST 2 MIN OF TRANSCRIPT:\n{tail_text or '(silence)'}"
        raw = await self._client.complete(
            model=self.model,
            system=THREAD_SYSTEM,
            cached_context=cached,
            fresh_input=fresh,
            max_tokens=self.max_tokens,
        )
        try:
            data = json.loads(raw)
            drift = data.get("drift", "unknown")
            if drift not in ("on", "drifting"):
                drift = "unknown"
            return DriftState(
                current_topic=data.get("current_topic", ""),
                drift=drift,
                drift_from=data.get("drift_from", ""),
            )
        except (json.JSONDecodeError, ValueError):
            return DriftState(current_topic="", drift="unknown", drift_from="")
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pytest tests/unit/test_thread_tier.py -v`
Expected: PASS (3 passed)

- [ ] **Step 5: Commit**

```bash
git add spec_lesson/tiers/thread.py tests/unit/test_thread_tier.py
git commit -m "feat(spec-lesson): Thread tier for topic-drift detection"
```

---

## Task 11: Polish tier (final artifact)

**Files:**
- Create: `spec_lesson/tiers/polish.py`
- Create: `tests/unit/test_polish_tier.py`

- [ ] **Step 1: Write the failing test**

```python
# tests/unit/test_polish_tier.py
import pytest
from unittest.mock import AsyncMock
from spec_lesson.tiers.base import Distillation
from spec_lesson.tiers.polish import PolishTier

@pytest.mark.asyncio
async def test_polish_returns_markdown_from_client():
    client = AsyncMock()
    client.complete = AsyncMock(return_value="---\ndate: 2026-04-22\n---\n# Meeting\n\n## Summary\nok")
    tier = PolishTier(client=client)
    final = Distillation(
        topic="t", decisions=["d1"], requirements=["r1"], open_questions=[],
        recent_verbatim="", updated_at_iso="",
    )
    md = await tier.run(final_distillation=final, full_transcript="user: hi")
    assert md.startswith("---")
    assert "# Meeting" in md

@pytest.mark.asyncio
async def test_polish_passes_final_distillation_as_cached():
    client = AsyncMock()
    client.complete = AsyncMock(return_value="")
    tier = PolishTier(client=client)
    final = Distillation(
        topic="T", decisions=["D"], requirements=[], open_questions=[],
        recent_verbatim="", updated_at_iso="",
    )
    await tier.run(final_distillation=final, full_transcript="transcript body")
    call = client.complete.await_args.kwargs
    assert "T" in call["cached_context"]
    assert "D" in call["cached_context"]
    assert "transcript body" in call["fresh_input"]
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pytest tests/unit/test_polish_tier.py -v`
Expected: FAIL with `ModuleNotFoundError: spec_lesson.tiers.polish`

- [ ] **Step 3: Write minimal implementation**

```python
# spec_lesson/tiers/polish.py
from .base import Distillation
from .client import AnthropicClient
from .prompts import POLISH_SYSTEM

class PolishTier:
    name = "polish"
    model = "claude-sonnet-4-6"
    max_tokens = 2000

    def __init__(self, client: AnthropicClient):
        self._client = client

    async def run(self, final_distillation: Distillation, full_transcript: str) -> str:
        cached = f"FINAL DISTILLATION:\n{final_distillation.to_json()}"
        fresh = f"FULL TRANSCRIPT:\n{full_transcript}"
        return await self._client.complete(
            model=self.model,
            system=POLISH_SYSTEM,
            cached_context=cached,
            fresh_input=fresh,
            max_tokens=self.max_tokens,
        )
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pytest tests/unit/test_polish_tier.py -v`
Expected: PASS (2 passed)

- [ ] **Step 5: Commit**

```bash
git add spec_lesson/tiers/polish.py tests/unit/test_polish_tier.py
git commit -m "feat(spec-lesson): Polish tier for session-close artifact"
```

---

## Task 12: Session state + lifecycle (PID, signals, hard cap)

**Files:**
- Create: `spec_lesson/session.py`
- Create: `spec_lesson/lifecycle.py`
- Create: `tests/integration/__init__.py` (empty)
- Create: `tests/integration/test_lifecycle.py`

- [ ] **Step 1: Write the failing test**

```python
# tests/integration/test_lifecycle.py
import asyncio
import pytest
from pathlib import Path
from spec_lesson.lifecycle import SessionLifecycle

@pytest.mark.asyncio
async def test_hard_cap_triggers_shutdown(tmp_path: Path):
    state = tmp_path / ".spec-lesson"
    life = SessionLifecycle(state_dir=state, max_seconds=0.2)
    shutdown_called = []

    async def on_shutdown():
        shutdown_called.append(True)

    life.on_shutdown(on_shutdown)
    await life.run_until_done()
    assert shutdown_called == [True]
    assert not life.pid_file.exists()  # cleaned up

@pytest.mark.asyncio
async def test_stop_triggers_shutdown_before_cap(tmp_path: Path):
    state = tmp_path / ".spec-lesson"
    life = SessionLifecycle(state_dir=state, max_seconds=60.0)
    shutdown_called = []

    async def on_shutdown():
        shutdown_called.append(True)

    life.on_shutdown(on_shutdown)

    async def stopper():
        await asyncio.sleep(0.1)
        life.request_stop()

    await asyncio.gather(life.run_until_done(), stopper())
    assert shutdown_called == [True]

def test_pid_file_written_and_parseable(tmp_path: Path):
    state = tmp_path / ".spec-lesson"
    life = SessionLifecycle(state_dir=state, max_seconds=1.0)
    life.write_pid_file()
    assert life.pid_file.exists()
    assert int(life.pid_file.read_text().strip()) > 0
    life.clear_pid_file()
    assert not life.pid_file.exists()
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pytest tests/integration/test_lifecycle.py -v`
Expected: FAIL with `ModuleNotFoundError: spec_lesson.lifecycle`

- [ ] **Step 3: Write minimal implementation**

```python
# spec_lesson/session.py
from dataclasses import dataclass
from datetime import datetime, timezone
from pathlib import Path

def _iso_now() -> str:
    return datetime.now(timezone.utc).strftime("%Y-%m-%dT%H%M%S")

@dataclass
class Session:
    id: str
    started_at_iso: str
    state_dir: Path
    project_dir: Path

    @property
    def transcript_jsonl(self) -> Path:
        return self.state_dir / f"session-{self.id}.jsonl"

    @property
    def distillation_md(self) -> Path:
        return self.state_dir / f"session-{self.id}.md"

    @property
    def triggers_log(self) -> Path:
        return self.state_dir / "triggers.log"

    @property
    def claude_md(self) -> Path:
        return self.project_dir / "CLAUDE.md"

    @classmethod
    def new(cls, project_dir: Path) -> "Session":
        now_iso = _iso_now()
        sid = now_iso
        state_dir = project_dir / ".spec-lesson"
        state_dir.mkdir(parents=True, exist_ok=True)
        return cls(id=sid, started_at_iso=now_iso, state_dir=state_dir, project_dir=project_dir)
```

```python
# spec_lesson/lifecycle.py
import asyncio
import os
import signal
from pathlib import Path
from typing import Awaitable, Callable, Optional

ShutdownHook = Callable[[], Awaitable[None]]

class SessionLifecycle:
    def __init__(self, state_dir: Path, max_seconds: float):
        self.state_dir = Path(state_dir)
        self.state_dir.mkdir(parents=True, exist_ok=True)
        self.pid_file = self.state_dir / "daemon.pid"
        self.max_seconds = max_seconds
        self._stop_event = asyncio.Event()
        self._shutdown_hooks: list[ShutdownHook] = []

    def write_pid_file(self) -> None:
        self.pid_file.write_text(str(os.getpid()))

    def clear_pid_file(self) -> None:
        try:
            self.pid_file.unlink()
        except FileNotFoundError:
            pass

    def on_shutdown(self, hook: ShutdownHook) -> None:
        self._shutdown_hooks.append(hook)

    def request_stop(self) -> None:
        self._stop_event.set()

    def install_signal_handlers(self) -> None:
        loop = asyncio.get_running_loop()
        for sig in (signal.SIGINT, signal.SIGTERM):
            try:
                loop.add_signal_handler(sig, self.request_stop)
            except NotImplementedError:
                # windows / restricted env
                pass

    async def run_until_done(self) -> None:
        self.write_pid_file()
        try:
            try:
                await asyncio.wait_for(self._stop_event.wait(), timeout=self.max_seconds)
            except asyncio.TimeoutError:
                pass  # hard cap hit
            for hook in self._shutdown_hooks:
                try:
                    await hook()
                except Exception:
                    # hooks must not prevent shutdown
                    pass
        finally:
            self.clear_pid_file()
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pytest tests/integration/test_lifecycle.py -v`
Expected: PASS (3 passed)

- [ ] **Step 5: Commit**

```bash
git add spec_lesson/session.py spec_lesson/lifecycle.py tests/integration/__init__.py tests/integration/test_lifecycle.py
git commit -m "feat(spec-lesson): session state + lifecycle with hard cap"
```

---

## Task 13: Tier scheduler (runs tiers on independent cadences)

**Files:**
- Create: `spec_lesson/tiers/scheduler.py`
- Create: `tests/integration/test_scheduler.py`

- [ ] **Step 1: Write the failing test**

```python
# tests/integration/test_scheduler.py
import asyncio
import pytest
from spec_lesson.tiers.scheduler import PeriodicRunner

@pytest.mark.asyncio
async def test_runs_callback_on_interval_until_stopped():
    calls = []
    async def cb():
        calls.append(True)

    runner = PeriodicRunner(name="test", interval_seconds=0.05, callback=cb)
    task = asyncio.create_task(runner.run())
    await asyncio.sleep(0.17)  # should fire ~3 times
    runner.stop()
    await task
    assert len(calls) >= 2

@pytest.mark.asyncio
async def test_trigger_now_forces_immediate_run():
    calls = []
    async def cb():
        calls.append(True)

    runner = PeriodicRunner(name="test", interval_seconds=10.0, callback=cb)
    task = asyncio.create_task(runner.run())
    await asyncio.sleep(0.02)
    await runner.trigger_now()
    await asyncio.sleep(0.05)
    runner.stop()
    await task
    assert len(calls) >= 1

@pytest.mark.asyncio
async def test_callback_errors_do_not_stop_runner():
    calls = []
    async def cb():
        calls.append(True)
        if len(calls) == 1:
            raise RuntimeError("boom")

    runner = PeriodicRunner(name="test", interval_seconds=0.03, callback=cb)
    task = asyncio.create_task(runner.run())
    await asyncio.sleep(0.12)
    runner.stop()
    await task
    assert len(calls) >= 2
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pytest tests/integration/test_scheduler.py -v`
Expected: FAIL with `ModuleNotFoundError: spec_lesson.tiers.scheduler`

- [ ] **Step 3: Write minimal implementation**

```python
# spec_lesson/tiers/scheduler.py
import asyncio
import logging
from typing import Awaitable, Callable

log = logging.getLogger(__name__)

class PeriodicRunner:
    def __init__(self, name: str, interval_seconds: float, callback: Callable[[], Awaitable[None]]):
        self.name = name
        self.interval = interval_seconds
        self._cb = callback
        self._stop = asyncio.Event()
        self._trigger = asyncio.Event()

    def stop(self) -> None:
        self._stop.set()
        self._trigger.set()

    async def trigger_now(self) -> None:
        self._trigger.set()

    async def run(self) -> None:
        while not self._stop.is_set():
            try:
                await self._cb()
            except Exception as e:
                log.warning("tier %s callback failed: %s", self.name, e)
            # wait up to interval, or until triggered/stopped
            waiters = [
                asyncio.create_task(asyncio.sleep(self.interval)),
                asyncio.create_task(self._stop.wait()),
                asyncio.create_task(self._trigger.wait()),
            ]
            done, pending = await asyncio.wait(waiters, return_when=asyncio.FIRST_COMPLETED)
            for t in pending:
                t.cancel()
            self._trigger.clear()
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pytest tests/integration/test_scheduler.py -v`
Expected: PASS (3 passed)

- [ ] **Step 5: Commit**

```bash
git add spec_lesson/tiers/scheduler.py tests/integration/test_scheduler.py
git commit -m "feat(spec-lesson): periodic runner with force-trigger"
```

---

## Task 14: Orchestrator (wires everything together)

**Files:**
- Create: `spec_lesson/orchestrator.py`
- Create: `tests/integration/fixtures/meeting_transcript.jsonl`
- Create: `tests/integration/test_end_to_end.py`

- [ ] **Step 1: Write the fixture**

```jsonl
{"timestamp": 1.0, "speaker": "user", "text": "Let's design a voice assistant for ADHD meetings", "is_final": true}
{"timestamp": 12.0, "speaker": "user", "text": "It should detect drift and help with responses", "is_final": true}
{"timestamp": 25.0, "speaker": "user", "text": "We need a hard 1.5 hour cap per session", "is_final": true}
{"timestamp": 40.0, "speaker": "user", "text": "OK Claude, build that", "is_final": true}
{"timestamp": 55.0, "speaker": "user", "text": "And log triggers to a file", "is_final": true}
```

- [ ] **Step 2: Write the failing end-to-end test**

```python
# tests/integration/test_end_to_end.py
import asyncio
import json
import pytest
from pathlib import Path
from unittest.mock import AsyncMock
from spec_lesson.orchestrator import Orchestrator, OrchestratorConfig
from spec_lesson.session import Session
from spec_lesson.tiers.client import AnthropicClient

FIXTURE = Path(__file__).parent / "fixtures" / "meeting_transcript.jsonl"

@pytest.mark.asyncio
async def test_end_to_end_fixture_run(tmp_path: Path):
    # arrange: mock client returns a valid distillation JSON each call
    def _mk_response(*, model, system, cached_context, fresh_input, max_tokens):
        if "thread" in system.lower():
            return '{"current_topic":"voice tool","drift":"on","drift_from":""}'
        # context
        return json.dumps({
            "topic": "ADHD voice assistant",
            "decisions": ["1.5h hard cap"],
            "requirements": ["drift detection", "response suggestions"],
            "open_questions": [],
            "recent_verbatim": "OK Claude, build that",
        })

    client = AsyncMock(spec=AnthropicClient)
    client.complete = AsyncMock(side_effect=lambda **kw: _mk_response(**kw))

    project_dir = tmp_path / "proj"
    project_dir.mkdir()
    session = Session.new(project_dir=project_dir)

    cfg = OrchestratorConfig(
        thread_interval=999.0,   # effectively disabled
        context_interval=999.0,  # only fires from trigger
        max_seconds=0.5,
    )
    orch = Orchestrator(session=session, client=client, config=cfg)

    # feed utterances from fixture
    lines = FIXTURE.read_text().strip().splitlines()

    async def feed():
        await asyncio.sleep(0.05)
        for line in lines:
            orch.ingest(json.loads(line))
            await asyncio.sleep(0.02)

    await asyncio.gather(orch.run(), feed())

    # assert CLAUDE.md has the managed section
    claude_md = (project_dir / "CLAUDE.md").read_text()
    assert "<!-- spec-lesson:start -->" in claude_md
    assert "ADHD voice assistant" in claude_md
    assert "1.5h hard cap" in claude_md

    # assert trigger was logged
    triggers = (session.state_dir / "triggers.log").read_text()
    assert "build that" in triggers.lower()

    # assert JSONL transcript persisted all finals
    jsonl = session.transcript_jsonl.read_text().strip().splitlines()
    assert len(jsonl) == 5
```

- [ ] **Step 3: Write orchestrator implementation**

```python
# spec_lesson/orchestrator.py
import asyncio
import logging
from dataclasses import dataclass, field
from datetime import datetime, timezone
from pathlib import Path

from .lifecycle import SessionLifecycle
from .session import Session
from .tiers.client import AnthropicClient
from .tiers.context import ContextTier
from .tiers.thread import ThreadTier
from .tiers.polish import PolishTier
from .tiers.scheduler import PeriodicRunner
from .transcript.buffer import RollingTranscript
from .transcript.persist import TranscriptWriter
from .transcript.utterance import Utterance
from .trigger.detector import TriggerDetector
from .writer.claude_md import ClaudeMdWriter

log = logging.getLogger(__name__)

@dataclass
class OrchestratorConfig:
    thread_interval: float = 120.0    # 2 minutes
    context_interval: float = 300.0   # 5 minutes
    max_seconds: float = 5400.0       # 1.5 hours

class Orchestrator:
    def __init__(self, session: Session, client: AnthropicClient, config: OrchestratorConfig):
        self.session = session
        self.client = client
        self.cfg = config

        self.buffer = RollingTranscript()
        self.transcript_writer = TranscriptWriter(session.transcript_jsonl)
        self.claude_md_writer = ClaudeMdWriter(session.claude_md)

        self.context_tier = ContextTier(client=client, buffer=self.buffer)
        self.thread_tier = ThreadTier(client=client, buffer=self.buffer)
        self.polish_tier = PolishTier(client=client)
        self.trigger = TriggerDetector()

        self._context_runner = PeriodicRunner(
            name="context",
            interval_seconds=config.context_interval,
            callback=self._run_context,
        )
        self._thread_runner = PeriodicRunner(
            name="thread",
            interval_seconds=config.thread_interval,
            callback=self._run_thread,
        )
        self._lifecycle = SessionLifecycle(
            state_dir=session.state_dir,
            max_seconds=config.max_seconds,
        )
        self._lifecycle.on_shutdown(self._on_shutdown)

    def ingest(self, utterance_dict: dict) -> None:
        u = Utterance.from_dict(utterance_dict)
        self.buffer.append(u)
        self.transcript_writer.append(u)
        if u.is_final and self.trigger.check(u.text, now=u.timestamp):
            self._log_trigger(u)
            # fire-and-forget: force context refresh now
            asyncio.get_event_loop().call_soon_threadsafe(
                lambda: asyncio.ensure_future(self._context_runner.trigger_now())
            )

    def _log_trigger(self, u: Utterance) -> None:
        line = f"{datetime.now(timezone.utc).isoformat()} | {u.text}\n"
        self.session.triggers_log.parent.mkdir(parents=True, exist_ok=True)
        with self.session.triggers_log.open("a", encoding="utf-8") as fh:
            fh.write(line)

    async def _run_context(self) -> None:
        if self.buffer.latest_timestamp() is None:
            return  # nothing yet
        dist = await self.context_tier.run(now=self.buffer.latest_timestamp() or 0.0)
        self.claude_md_writer.write_managed_section(dist.render_markdown())

    async def _run_thread(self) -> None:
        baseline = self.context_tier.last.topic
        latest = self.buffer.latest_timestamp()
        if latest is None:
            return
        await self.thread_tier.run(baseline_topic=baseline, now=latest)
        # HUD integration is Plan 3; Plan 1 just logs
        log.info("thread tier ran")

    async def _on_shutdown(self) -> None:
        self._context_runner.stop()
        self._thread_runner.stop()
        # final context pass
        if self.buffer.latest_timestamp() is not None:
            dist = await self.context_tier.run(now=self.buffer.latest_timestamp())
            self.claude_md_writer.write_managed_section(dist.render_markdown())
            # polish
            all_text = self.buffer.as_text()
            polished = await self.polish_tier.run(final_distillation=dist, full_transcript=all_text)
            self.session.distillation_md.write_text(polished, encoding="utf-8")
        self.transcript_writer.close()

    async def run(self) -> None:
        self._lifecycle.install_signal_handlers()
        runners = asyncio.gather(
            self._context_runner.run(),
            self._thread_runner.run(),
        )
        await self._lifecycle.run_until_done()
        # after lifecycle exits, stop runners
        self._context_runner.stop()
        self._thread_runner.stop()
        try:
            await runners
        except Exception:
            pass
```

- [ ] **Step 4: Run the end-to-end test**

Run: `pytest tests/integration/test_end_to_end.py -v`
Expected: PASS (1 passed)

- [ ] **Step 5: Commit**

```bash
git add spec_lesson/orchestrator.py tests/integration/fixtures/meeting_transcript.jsonl tests/integration/test_end_to_end.py
git commit -m "feat(spec-lesson): orchestrator wires tiers + trigger + CLAUDE.md writer"
```

---

## Task 15: CLI (start / status / stop)

**Files:**
- Create: `spec_lesson/cli.py`
- Create: `tests/integration/test_cli.py`

- [ ] **Step 1: Write the failing test**

```python
# tests/integration/test_cli.py
import json
import os
import signal
import subprocess
import sys
import time
from pathlib import Path

def _run(args, cwd, env=None, input_text=None):
    return subprocess.run(
        [sys.executable, "-m", "spec_lesson.cli", *args],
        cwd=str(cwd),
        env={**os.environ, **(env or {})},
        input=input_text,
        capture_output=True,
        text=True,
        timeout=30,
    )

def test_status_reports_not_running(tmp_path: Path):
    (tmp_path / ".spec-lesson").mkdir()
    r = _run(["status"], cwd=tmp_path)
    assert r.returncode == 0
    assert "not running" in r.stdout.lower()

def test_start_with_stdin_transcript_updates_claude_md(tmp_path: Path):
    fixture_lines = [
        '{"timestamp": 1.0, "speaker": "user", "text": "we want a tool", "is_final": true}',
        '{"timestamp": 10.0, "speaker": "user", "text": "OK Claude build that", "is_final": true}',
    ]
    fixture = "\n".join(fixture_lines) + "\n"

    # Use fake-mode via env var so CLI skips real API and uses canned responses
    env = {"SPEC_LESSON_FAKE_API": "1", "SPEC_LESSON_MAX_SECONDS": "0.5"}
    r = _run(["start", "--transcript-stdin"], cwd=tmp_path, env=env, input_text=fixture)
    assert r.returncode == 0, f"stderr: {r.stderr}"

    claude_md = (tmp_path / "CLAUDE.md").read_text()
    assert "<!-- spec-lesson:start -->" in claude_md
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pytest tests/integration/test_cli.py -v`
Expected: FAIL with `ModuleNotFoundError: spec_lesson.cli` (or similar)

- [ ] **Step 3: Write CLI implementation**

```python
# spec_lesson/cli.py
import asyncio
import json
import os
import sys
from pathlib import Path
from unittest.mock import AsyncMock

import typer

from .orchestrator import Orchestrator, OrchestratorConfig
from .session import Session
from .tiers.client import AnthropicClient

app = typer.Typer(help="spec-lesson: ADHD live meeting assistant", no_args_is_help=True)

def _canned_response(*, model, system, cached_context, fresh_input, max_tokens) -> str:
    if "thread" in system.lower():
        return '{"current_topic":"fake","drift":"on","drift_from":""}'
    return json.dumps({
        "topic": "(fake) captured session",
        "decisions": ["decision from fake api"],
        "requirements": ["req from fake api"],
        "open_questions": [],
        "recent_verbatim": fresh_input[-200:],
    })

def _build_client() -> AnthropicClient:
    if os.environ.get("SPEC_LESSON_FAKE_API") == "1":
        sdk = AsyncMock()
        client = AnthropicClient(sdk=sdk)
        client.complete = AsyncMock(side_effect=lambda **kw: _canned_response(**kw))
        return client
    return AnthropicClient(sdk=None, api_key=os.environ.get("ANTHROPIC_API_KEY"))

def _build_cfg() -> OrchestratorConfig:
    cfg = OrchestratorConfig()
    override = os.environ.get("SPEC_LESSON_MAX_SECONDS")
    if override:
        cfg.max_seconds = float(override)
    return cfg

@app.command()
def start(
    transcript_stdin: bool = typer.Option(False, "--transcript-stdin", help="Read JSONL utterances from stdin instead of live audio (Plan 1 only)"),
):
    """Start a spec-lesson session in the current directory."""
    project_dir = Path.cwd()
    session = Session.new(project_dir=project_dir)
    client = _build_client()
    cfg = _build_cfg()
    orch = Orchestrator(session=session, client=client, config=cfg)

    if not transcript_stdin:
        typer.secho(
            "Plan 1 has no audio capture. Run with --transcript-stdin and pipe utterances.\n"
            "Live audio ships in Plan 2.",
            fg=typer.colors.YELLOW,
        )
        raise typer.Exit(2)

    async def feed_stdin():
        loop = asyncio.get_running_loop()
        reader = asyncio.StreamReader()
        protocol = asyncio.StreamReaderProtocol(reader)
        await loop.connect_read_pipe(lambda: protocol, sys.stdin)
        while True:
            line = await reader.readline()
            if not line:
                break
            line_s = line.decode("utf-8").strip()
            if not line_s:
                continue
            try:
                payload = json.loads(line_s)
            except json.JSONDecodeError:
                continue
            orch.ingest(payload)

    async def main():
        await asyncio.gather(orch.run(), feed_stdin())

    asyncio.run(main())

@app.command()
def status():
    """Report whether a spec-lesson daemon is running in the current directory."""
    pid_file = Path.cwd() / ".spec-lesson" / "daemon.pid"
    if not pid_file.exists():
        typer.echo("spec-lesson: not running")
        return
    pid = int(pid_file.read_text().strip())
    try:
        os.kill(pid, 0)
    except ProcessLookupError:
        typer.echo(f"spec-lesson: stale pid file (pid {pid} gone) — run again to recover")
        return
    typer.echo(f"spec-lesson: running (pid {pid})")

@app.command()
def stop():
    """Request graceful shutdown of the running daemon."""
    pid_file = Path.cwd() / ".spec-lesson" / "daemon.pid"
    if not pid_file.exists():
        typer.echo("spec-lesson: not running")
        raise typer.Exit(1)
    pid = int(pid_file.read_text().strip())
    import signal
    os.kill(pid, signal.SIGTERM)
    typer.echo(f"spec-lesson: sent SIGTERM to pid {pid}")

if __name__ == "__main__":
    app()
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pytest tests/integration/test_cli.py -v`
Expected: PASS (2 passed)

- [ ] **Step 5: Full regression + commit**

```bash
pytest -q
```
Expected: ALL tests pass.

```bash
git add spec_lesson/cli.py tests/integration/test_cli.py
git commit -m "feat(spec-lesson): CLI with start/status/stop commands"
```

---

## Deferred (explicit) — not in this plan

| Item | Plan | Reason |
|---|---|---|
| Live audio capture (BlackHole + sounddevice) | Plan 2 | Keeps Plan 1 pure-logic, test-driven |
| Deepgram streaming client | Plan 2 | Coupled to audio capture |
| Immediate tier / feature B (response suggestions) | Plan 2 | Pause-triggered → needs audio events |
| Floating HUD | Plan 3 | Swap logger output for NSWindow |
| `/schedule` cross-session roll-up routine | Plan 4 | Runs on Anthropic cloud; independent |
| Orphan session recovery on next start | Plan 4 | Polish nice-to-have |

---

## Self-review (run by author before handoff)

**Spec coverage:**
- §2 goal C (drift nudge) → Tasks 10, 14 (Thread tier + orchestrator wiring)
- §2 goal B (response suggestions) → explicitly deferred to Plan 2
- §2 goal E (CLAUDE.md managed section) → Tasks 6, 9, 14
- §2 goal D (session-close polish) → Tasks 11, 14 (on-shutdown hook)
- §2 hard cap → Task 12
- §5 hierarchical rolling compaction → Task 9
- §5 trigger detection + cooldown → Task 5
- §5 append-only decisions/requirements → Task 8
- §6 CLAUDE.md managed section format → Task 6 (`render_markdown` in Task 8)
- §7 prompt caching → Task 7
- §8 session lifecycle + PID + SIGTERM → Task 12
- §9 `DEEPGRAM_API_KEY` check → deferred to Plan 2 (no audio in Plan 1)
- CLI `spec-lesson start|status|stop` → Task 15

**Placeholder scan:** no TBD / TODO / "handle edge cases" in task bodies. Every code step contains complete code.

**Type consistency:**
- `Distillation` fields: `topic`, `decisions`, `requirements`, `open_questions`, `recent_verbatim`, `updated_at_iso` — consistent across Tasks 8, 9, 11, 14.
- `AnthropicClient.complete(model, system, cached_context, fresh_input, max_tokens)` — consistent across Tasks 7, 9, 10, 11.
- `TriggerDetector.check(text, now)` — consistent across Tasks 5, 14.
- `ClaudeMdWriter.write_managed_section(body)` — consistent across Tasks 6, 14.

**Testability:**
- Every tier test mocks `AnthropicClient.complete` directly (no real API calls needed).
- Integration test `test_end_to_end.py` uses fixture + mocked client — runs in <1s.
- CLI test uses `SPEC_LESSON_FAKE_API=1` to avoid API dependency in CI.

All gaps are explicitly deferred with the plan number that covers them.
