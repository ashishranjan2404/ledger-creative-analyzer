#!/usr/bin/env python3
"""
Ledger Morning Brief Generator

Produces a full ~60s morning brief video from a set of "shock insights":
  3s cinematic intro (cached) + insight segments (Seedance visual + TTS) + fade-out.

Usage as a module:
    from brief_generator import generate_brief
    result = generate_brief(brief_id=..., merchant_name=..., insights=[...])

Usage standalone:
    python brief_generator.py
"""

import json
import logging
import os
import subprocess
import sys
import tempfile
import textwrap
import time
from concurrent.futures import ThreadPoolExecutor
from dataclasses import dataclass
from pathlib import Path
from typing import Optional

import requests
from dotenv import load_dotenv
from byteplussdkarkruntime import Ark
from PIL import Image, ImageDraw, ImageFont

# ---------------------------------------------------------------------------
# Config
# ---------------------------------------------------------------------------

SEEDANCE_BASE_URL = "https://ark.ap-southeast.bytepluses.com/api/v3"
SEEDANCE_MODEL = "dreamina-seedance-2-0-fast-260128"
SEEDANCE_POLL_TIMEOUT_S = 180
SEEDANCE_MAX_ATTEMPTS = 4

INTRO_PATH = Path("assets/intro/intro.mp4")
BRIEFS_DIR = Path("briefs")

VOICE_MAP = {
    "confident_female": "en-US-AriaNeural",
    "friendly_female": "en-US-JennyNeural",
    "neutral_male": "en-US-GuyNeural",
}

INSIGHT_PADDING_S = 9.0
FADE_OUT_S = 1.0

log = logging.getLogger("brief")

# ---------------------------------------------------------------------------
# Data types
# ---------------------------------------------------------------------------

@dataclass
class TtsSegment:
    index: int
    text: str
    audio_path: Path
    duration_s: float

# ---------------------------------------------------------------------------
# Logging
# ---------------------------------------------------------------------------

def _setup_logging(log_path: Optional[Path] = None):
    if log.handlers:
        return
    log.setLevel(logging.DEBUG)
    fmt = logging.Formatter("%(asctime)s [%(levelname)s] %(message)s", datefmt="%H:%M:%S")

    ch = logging.StreamHandler(sys.stdout)
    ch.setLevel(logging.INFO)
    ch.setFormatter(fmt)
    log.addHandler(ch)

    if log_path:
        log_path.parent.mkdir(parents=True, exist_ok=True)
        fh = logging.FileHandler(log_path, mode="w", encoding="utf-8")
        fh.setLevel(logging.DEBUG)
        fh.setFormatter(fmt)
        log.addHandler(fh)

# ---------------------------------------------------------------------------
# TTS via edge-tts
# ---------------------------------------------------------------------------

def _get_audio_duration(path: Path) -> float:
    proc = subprocess.run(
        ["ffprobe", "-v", "error", "-show_entries", "format=duration",
         "-of", "default=noprint_wrappers=1:nokey=1", str(path)],
        capture_output=True, text=True,
    )
    return float(proc.stdout.strip())


def _run_edge_tts(text: str, voice: str, output_path: Path):
    """Run edge-tts in a subprocess (it's async-native, easiest to shell out)."""
    cmd = ["edge-tts", "--voice", voice, "--text", text, "--write-media", str(output_path)]
    proc = subprocess.run(cmd, capture_output=True, text=True)
    if proc.returncode != 0:
        raise RuntimeError(f"edge-tts failed: {proc.stderr}")


def _generate_tts(insights: list[dict], voice_key: str, work_dir: Path) -> list[TtsSegment]:
    voice = VOICE_MAP.get(voice_key, "en-US-AriaNeural")
    segments = []

    for i, insight in enumerate(insights):
        text = insight["text"]
        audio_path = work_dir / f"tts_{i}.mp3"
        log.info("TTS [%d/%d]: generating audio for '%s'...", i + 1, len(insights), text[:60])
        _run_edge_tts(text, voice, audio_path)
        dur = _get_audio_duration(audio_path)
        log.info("TTS [%d/%d]: %.1fs -> %s", i + 1, len(insights), dur, audio_path.name)
        segments.append(TtsSegment(index=i, text=text, audio_path=audio_path, duration_s=dur))

    return segments

# ---------------------------------------------------------------------------
# Seedance visual generation — per-insight
# ---------------------------------------------------------------------------

FALLBACK_PROMPT = (
    "Cinematic abstract motion graphics: soft glowing particles and thin "
    "luminous lines slowly drift across a deep dark background. Cool "
    "neutral tones with subtle amber accents. Shallow depth of field, "
    "gentle rightward camera movement. No speech, no dialogue. "
    "Clean, minimal, premium aesthetic. "
    "--ratio 9:16 --resolution 720p --duration 5"
)


def _build_insight_prompt(insight_text: str) -> str:
    """Convert an insight's text into a Seedance visual scene prompt."""
    lower = insight_text.lower()

    scene_parts = []

    if any(name in lower for name in ["sarah", "mike", "face", "portrait", "person"]):
        scene_parts.append(
            "Cinematic close-up portrait of a confident professional in warm "
            "golden side lighting, looking directly at camera"
        )
    elif any(w in lower for w in ["testimonial", "ugc", "review"]):
        scene_parts.append(
            "Cinematic scene of a person speaking naturally to camera in a "
            "bright, warm lifestyle setting with soft bokeh background"
        )
    elif any(w in lower for w in ["kill", "cut", "remove", "similar", "duplicate"]):
        scene_parts.append(
            "Cinematic top-down view of overlapping translucent cards slowly "
            "separating and fading away, one card glows brighter while others dim"
        )
    elif any(w in lower for w in ["shift", "move", "transfer", "reallocate", "budget"]):
        scene_parts.append(
            "Cinematic visualization of glowing energy streams smoothly "
            "redirecting from one luminous node to another"
        )
    elif any(w in lower for w in ["roas", "revenue", "performance", "$", "beat"]):
        scene_parts.append(
            "Cinematic data visualization with rising luminous bar charts and "
            "flowing upward particle streams indicating growth"
        )
    else:
        scene_parts.append(
            "Cinematic abstract data visualization with softly glowing "
            "geometric shapes and flowing light trails"
        )

    if "meta" in lower:
        scene_parts.append("blue-tinted lighting reminiscent of social media")
    elif "tiktok" in lower:
        scene_parts.append("vibrant dark background with neon accent edges")
    elif "google" in lower:
        scene_parts.append("clean white and multicolor accent lighting")

    scene_parts.append(
        "Dark slate background with soft amber highlights. Shallow depth of "
        "field. Premium fintech aesthetic. No text overlays, no dialogue"
    )

    prompt = ". ".join(scene_parts) + ". --ratio 9:16 --resolution 720p --duration 5"
    return prompt


def _seedance_create_and_poll(client: Ark, prompt: str, output_path: Path, label: str) -> Path:
    """Create a single Seedance task, poll to completion, download result."""
    for attempt in range(1, 3):
        try:
            log.info("[%s] attempt %d: creating task...", label, attempt)
            result = client.content_generation.tasks.create(
                model=SEEDANCE_MODEL,
                content=[{"type": "text", "text": prompt}],
            )
            task_id = result.id
            log.info("[%s] task created: %s", label, task_id)

            start = time.monotonic()
            delay = 5
            while True:
                elapsed = time.monotonic() - start
                if elapsed > SEEDANCE_POLL_TIMEOUT_S:
                    raise TimeoutError(f"Timed out after {SEEDANCE_POLL_TIMEOUT_S}s")
                poll = client.content_generation.tasks.get(task_id=task_id)
                log.info("[%s] poll [%.0fs]: status=%s", label, elapsed, poll.status)
                if poll.status == "succeeded":
                    break
                if poll.status == "failed":
                    raise RuntimeError(f"Failed: {getattr(poll, 'error', None)}")
                time.sleep(delay)
                delay = min(delay * 1.3, 15)

            video_url = getattr(poll.content, "video_url", None)
            if not video_url:
                raise RuntimeError("No video_url in result")

            log.info("[%s] downloading...", label)
            resp = requests.get(video_url, timeout=120)
            resp.raise_for_status()
            output_path.write_bytes(resp.content)
            log.info("[%s] %.2f MB -> %s", label, len(resp.content) / 1e6, output_path.name)
            return output_path

        except (TimeoutError, RuntimeError) as exc:
            log.warning("[%s] attempt %d failed: %s", label, attempt, exc)
            if attempt >= 2:
                raise
    raise RuntimeError(f"[{label}] all attempts failed")


def _generate_insight_visuals(insights: list[dict], work_dir: Path) -> list[Path]:
    """Generate one Seedance clip per insight, 2 in parallel at a time."""
    load_dotenv()
    api_key = os.getenv("ARK_API_KEY")
    if not api_key:
        raise RuntimeError("ARK_API_KEY not set")

    client = Ark(base_url=SEEDANCE_BASE_URL, api_key=api_key)
    visual_paths: list[Optional[Path]] = [None] * len(insights)
    prompts = [_build_insight_prompt(ins["text"]) for ins in insights]

    for i, p in enumerate(prompts):
        log.debug("Insight %d prompt: %s", i, p)

    # Process in batches of 2 (API allows max 3 concurrent)
    for batch_start in range(0, len(insights), 2):
        batch_end = min(batch_start + 2, len(insights))
        batch_indices = list(range(batch_start, batch_end))
        log.info("Seedance batch: insights %s", [i + 1 for i in batch_indices])

        errors = {}
        def gen_one(idx):
            out = work_dir / f"visual_{idx}.mp4"
            label = f"insight-{idx + 1}"
            try:
                _seedance_create_and_poll(client, prompts[idx], out, label)
                visual_paths[idx] = out
            except Exception as e:
                errors[idx] = e
                log.warning("[insight-%d] failed, will use fallback: %s", idx + 1, e)
                try:
                    _seedance_create_and_poll(client, FALLBACK_PROMPT, out, f"fallback-{idx + 1}")
                    visual_paths[idx] = out
                except Exception as e2:
                    errors[idx] = e2

        with ThreadPoolExecutor(max_workers=2) as pool:
            for idx in batch_indices:
                pool.submit(gen_one, idx)

    missing = [i for i, p in enumerate(visual_paths) if p is None]
    if missing:
        raise RuntimeError(f"Failed to generate visuals for insights: {[i+1 for i in missing]}")

    return visual_paths

# ---------------------------------------------------------------------------
# FFmpeg video composition
# ---------------------------------------------------------------------------

def _make_text_image(text: str, width: int = 720, height: int = 1280, out_path: Path = None) -> Path:
    """Render insight text as a subtitle bar in the bottom 20% of the frame."""
    img = Image.new("RGBA", (width, height), (0, 0, 0, 0))
    draw = ImageDraw.Draw(img)

    font_size = 34
    try:
        font = ImageFont.truetype("/System/Library/Fonts/Helvetica.ttc", font_size)
    except (OSError, IOError):
        font = ImageFont.load_default(size=font_size)

    wrapped = textwrap.fill(text, width=32)
    bbox = draw.multiline_textbbox((0, 0), wrapped, font=font)
    tw, th = bbox[2] - bbox[0], bbox[3] - bbox[1]

    bar_padding = 28
    bar_height = th + bar_padding * 2
    bar_top = height - int(height * 0.22)
    draw.rectangle(
        [(0, bar_top), (width, bar_top + bar_height)],
        fill=(0, 0, 0, 160),
    )

    x = (width - tw) // 2
    y = bar_top + bar_padding
    draw.multiline_text((x, y), wrapped, fill=(255, 255, 255, 240), font=font, align="center")

    img.save(out_path, "PNG")
    return out_path


def _compose_video(
    intro_path: Path,
    visual_paths: list[Path],
    tts_segments: list[TtsSegment],
    insights: list[dict],
    output_path: Path,
) -> float:
    """
    Compose the full brief:
      1. Each insight gets its own Seedance visual as background
      2. Subtitle bar overlay + TTS audio per segment
      3. Prepend the intro (with native Seedance audio)
      4. Fade to black at the end
    """
    work_dir = visual_paths[0].parent
    segment_files = []

    for seg in tts_segments:
        seg_duration = seg.duration_s + INSIGHT_PADDING_S
        seg_file = work_dir / f"segment_{seg.index}.mp4"
        segment_files.append(seg_file)

        vis = visual_paths[seg.index]
        text_img = work_dir / f"text_{seg.index}.png"
        _make_text_image(seg.text, out_path=text_img)

        tts_start = 1.5
        fade_in_d = 0.5
        fade_out_start = seg_duration - 0.8

        filter_complex = (
            f"[0:v]loop=loop=-1:size=9999:start=0,"
            f"trim=duration={seg_duration},setpts=PTS-STARTPTS[bg];"
            f"[2:v]fade=t=in:st=0:d={fade_in_d}:alpha=1,"
            f"fade=t=out:st={fade_out_start}:d=0.8:alpha=1[txt];"
            f"[bg][txt]overlay=0:0:shortest=0[v];"
            f"[1:a]adelay={int(tts_start * 1000)}|{int(tts_start * 1000)},"
            f"apad=whole_dur={seg_duration}[a]"
        )

        cmd = [
            "ffmpeg", "-y",
            "-stream_loop", "-1", "-i", str(vis),
            "-i", str(seg.audio_path),
            "-loop", "1", "-framerate", "24", "-i", str(text_img),
            "-filter_complex", filter_complex,
            "-map", "[v]", "-map", "[a]",
            "-t", str(seg_duration),
            "-c:v", "libx264", "-preset", "fast", "-crf", "20", "-pix_fmt", "yuv420p",
            "-c:a", "aac", "-b:a", "128k", "-ar", "44100",
            str(seg_file),
        ]
        log.info("Composing segment %d (%.1fs) with %s...", seg.index, seg_duration, vis.name)
        proc = subprocess.run(cmd, capture_output=True, text=True)
        if proc.returncode != 0:
            log.error("FFmpeg segment %d failed:\n%s", seg.index, proc.stderr[-2000:])
            raise RuntimeError(f"FFmpeg segment {seg.index} failed")

    # Normalize intro: ensure it has an audio track for concat compatibility
    intro_norm = work_dir / "intro_norm.mp4"
    # Probe whether the intro already has audio
    probe = subprocess.run(
        ["ffprobe", "-v", "error", "-select_streams", "a", "-show_entries",
         "stream=codec_type", "-of", "csv=p=0", str(intro_path)],
        capture_output=True, text=True,
    )
    has_audio = "audio" in probe.stdout

    if has_audio:
        cmd_intro = [
            "ffmpeg", "-y", "-i", str(intro_path),
            "-c:v", "libx264", "-preset", "fast", "-crf", "20", "-pix_fmt", "yuv420p",
            "-c:a", "aac", "-b:a", "128k", "-ar", "44100",
            str(intro_norm),
        ]
    else:
        cmd_intro = [
            "ffmpeg", "-y", "-i", str(intro_path),
            "-f", "lavfi", "-i", "anullsrc=channel_layout=stereo:sample_rate=44100",
            "-c:v", "libx264", "-preset", "fast", "-crf", "20", "-pix_fmt", "yuv420p",
            "-c:a", "aac", "-b:a", "128k", "-shortest",
            str(intro_norm),
        ]
    log.info("Normalizing intro (%s audio)...", "with" if has_audio else "adding silent")
    proc = subprocess.run(cmd_intro, capture_output=True, text=True)
    if proc.returncode != 0:
        log.error("Intro normalization failed:\n%s", proc.stderr[-2000:])
        raise RuntimeError("Intro normalization failed")

    # Build concat list
    concat_list = work_dir / "concat.txt"
    lines = [f"file '{intro_norm.resolve()}'\n"]
    for sf in segment_files:
        lines.append(f"file '{sf.resolve()}'\n")
    concat_list.write_text("".join(lines))

    # Concatenate all segments
    pre_fade = work_dir / "pre_fade.mp4"
    cmd_concat = [
        "ffmpeg", "-y",
        "-f", "concat", "-safe", "0", "-i", str(concat_list),
        "-c:v", "libx264", "-preset", "fast", "-crf", "20", "-pix_fmt", "yuv420p",
        "-c:a", "aac", "-b:a", "128k",
        str(pre_fade),
    ]
    log.info("Concatenating intro + %d segments...", len(segment_files))
    proc = subprocess.run(cmd_concat, capture_output=True, text=True)
    if proc.returncode != 0:
        log.error("Concat failed:\n%s", proc.stderr[-2000:])
        raise RuntimeError("Concat failed")

    # Get total duration, add fade-to-black at end
    total_dur = _get_audio_duration(pre_fade)
    fade_start = total_dur - FADE_OUT_S

    cmd_fade = [
        "ffmpeg", "-y",
        "-i", str(pre_fade),
        "-vf", f"fade=t=out:st={fade_start}:d={FADE_OUT_S}",
        "-af", f"afade=t=out:st={fade_start}:d={FADE_OUT_S}",
        "-c:v", "libx264", "-preset", "fast", "-crf", "20", "-pix_fmt", "yuv420p",
        "-c:a", "aac", "-b:a", "128k",
        str(output_path),
    ]
    log.info("Adding fade-to-black (starts at %.1fs)...", fade_start)
    proc = subprocess.run(cmd_fade, capture_output=True, text=True)
    if proc.returncode != 0:
        log.error("Fade failed:\n%s", proc.stderr[-2000:])
        raise RuntimeError("Fade pass failed")

    final_dur = _get_audio_duration(output_path)
    log.info("Final video: %.1fs -> %s", final_dur, output_path)
    return final_dur

# ---------------------------------------------------------------------------
# Public API
# ---------------------------------------------------------------------------

def generate_brief(
    brief_id: str,
    merchant_name: str,
    insights: list[dict],
    duration_target_sec: int = 60,
    voice: str = "confident_female",
) -> dict:
    """
    Generate a full morning brief video.

    Returns:
        {"brief_id": ..., "video_path": ..., "duration_sec": ..., "status": "ready"}
    """
    load_dotenv()
    BRIEFS_DIR.mkdir(parents=True, exist_ok=True)
    output_path = BRIEFS_DIR / f"{brief_id}.mp4"
    log_path = BRIEFS_DIR / f"{brief_id}.log"
    _setup_logging(log_path)

    log.info("=" * 60)
    log.info("Ledger Morning Brief Generator")
    log.info("brief_id=%s  merchant=%s  insights=%d  voice=%s",
             brief_id, merchant_name, len(insights), voice)
    log.info("=" * 60)

    if not INTRO_PATH.exists():
        raise FileNotFoundError(
            f"Cached intro not found at {INTRO_PATH}. Run generate_intro.py first."
        )

    with tempfile.TemporaryDirectory(prefix="brief_") as tmp:
        work_dir = Path(tmp)

        # TTS runs fast (~5s), start it first
        log.info("Generating TTS audio...")
        tts_segments = _generate_tts(insights, voice, work_dir)

        # Generate per-insight Seedance visuals (2 at a time in parallel)
        log.info("Generating per-insight Seedance visuals (2 parallel)...")
        t0 = time.monotonic()
        visual_paths = _generate_insight_visuals(insights, work_dir)
        elapsed = time.monotonic() - t0
        log.info("All Seedance visuals done in %.1fs", elapsed)

        # Compose the final video
        duration = _compose_video(INTRO_PATH, visual_paths, tts_segments, insights, output_path)

    log.info("SUCCESS — brief ready at %s (%.1fs)", output_path, duration)

    return {
        "brief_id": brief_id,
        "video_path": str(output_path),
        "duration_sec": round(duration),
        "status": "ready",
    }

# ---------------------------------------------------------------------------
# Standalone runner
# ---------------------------------------------------------------------------

if __name__ == "__main__":
    sample_payload = {
        "brief_id": "brief_20260418_0900",
        "merchant_name": "Acme DTC",
        "insights": [
            {"text": "Sarah's face drove 3.2x ROAS vs Mike last week.", "evidence": "verified"},
            {"text": "Testimonials beat product-only by $42K this month.", "evidence": "verified"},
            {"text": "Kill 2 of your 3 similar-looking ads — similarity 0.87.", "evidence": "verified"},
            {"text": "Shift $8K from Meta to TikTok retargeting.", "evidence": "verified"},
        ],
        "duration_target_sec": 60,
        "voice": "confident_female",
    }

    print(json.dumps(sample_payload, indent=2))
    print()

    result = generate_brief(**{k: v for k, v in sample_payload.items() if k != "evidence"})
    print()
    print(json.dumps(result, indent=2))
