"""
Cartesia TTS client — synthesizes narration audio for the brief delivery
pipeline. Used as the audio-only fallback when Seedance fails (BytePlus
account blocked, timeouts, etc.), and potentially as the primary narration
source replacing edge-tts.

Env vars:
  CARTESIA_API_KEY   (required) — get from https://play.cartesia.ai/console
  CARTESIA_VOICE_ID  (optional) — defaults to a warm professional female voice
  CARTESIA_MODEL_ID  (optional) — defaults to "sonic-2" (current Cartesia SOTA)

Public API:
  synthesize(text, out_path, voice_id=None, model_id=None) -> Path
      Writes MP3 audio to out_path; returns the Path.

  synthesize_insights(insights, out_path) -> Path
      Convenience wrapper — stitches each insight's `text` into a single
      narration (with natural pauses) and synthesizes it as one MP3.
"""

import os
from pathlib import Path
from typing import Optional

import httpx

CARTESIA_API_BASE = "https://api.cartesia.ai"

# Auto-load CARTESIA_API_KEY from .cartesia.env (sibling of repo root) if the
# env var isn't already set. The file may hold a plain raw key on one line OR
# a standard KEY=VALUE line — we handle both. .cartesia.env is gitignored.
_KEY_FILE = Path(__file__).resolve().parent.parent / ".cartesia.env"
if _KEY_FILE.exists() and not os.environ.get("CARTESIA_API_KEY"):
    _content = _KEY_FILE.read_text().strip()
    if "\n" in _content:
        _content = _content.splitlines()[0].strip()
    if _content.startswith("CARTESIA_API_KEY="):
        _content = _content.split("=", 1)[1].strip()
    if _content:
        os.environ["CARTESIA_API_KEY"] = _content

DEFAULT_VOICE_ID = os.environ.get(
    "CARTESIA_VOICE_ID",
    # Cartesia preset: "Professional Woman" — calm, warm, corporate narration.
    "a0e99841-438c-4a64-b679-ae501e7d6091",
)
DEFAULT_MODEL_ID = os.environ.get("CARTESIA_MODEL_ID", "sonic-2")


def _require_key() -> str:
    key = os.environ.get("CARTESIA_API_KEY", "").strip()
    if not key:
        raise RuntimeError(
            "CARTESIA_API_KEY not set. Grab one from https://play.cartesia.ai/console "
            "and add it to .env as CARTESIA_API_KEY=..."
        )
    return key


def synthesize(
    text: str,
    out_path: Path,
    voice_id: Optional[str] = None,
    model_id: Optional[str] = None,
    timeout_s: int = 60,
) -> Path:
    """Synthesize `text` to an MP3 at `out_path`. Returns the Path."""
    api_key = _require_key()
    out_path = Path(out_path)
    out_path.parent.mkdir(parents=True, exist_ok=True)

    body = {
        "model_id": model_id or DEFAULT_MODEL_ID,
        "transcript": text,
        "voice": {"mode": "id", "id": voice_id or DEFAULT_VOICE_ID},
        "output_format": {
            "container": "mp3",
            "bit_rate": 128000,
            "sample_rate": 44100,
        },
    }
    headers = {
        "X-API-Key": api_key,
        "Cartesia-Version": "2024-11-13",
        "Content-Type": "application/json",
    }

    with httpx.stream(
        "POST",
        f"{CARTESIA_API_BASE}/tts/bytes",
        json=body,
        headers=headers,
        timeout=timeout_s,
    ) as resp:
        resp.raise_for_status()
        with out_path.open("wb") as f:
            for chunk in resp.iter_bytes():
                f.write(chunk)

    return out_path


def synthesize_insights(insights: list[dict], out_path: Path) -> Path:
    """Stitch insight texts into one narration and synthesize as a single MP3.
    Each insight gets its own sentence terminator + a short pause cue."""
    parts = []
    for i, ins in enumerate(insights, start=1):
        text = str(ins.get("text", "")).strip()
        if not text:
            continue
        if not text.endswith((".", "!", "?")):
            text += "."
        parts.append(f"Insight {i}. {text}")
    transcript = "  ".join(parts)
    return synthesize(transcript, out_path)
