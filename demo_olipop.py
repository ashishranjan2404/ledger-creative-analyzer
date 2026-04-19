"""
demo_olipop.py — Adlyze/Olipop hackathon demo (2026-04-18).

Reuses the cached Seedance brief at ~/Downloads/brief_20260418_0900.mp4
(today's Seedance account is blocked by AccountOverdueError, so we're NOT
hitting the Seedance API). Replaces its audio track with a freshly
Cartesia-narrated script derived from today's 4 Olipop mock insights,
uploads the muxed video to HF, and delivers via Photon iMessage.

Tracks every stage in a Butterbase jobs row so the dashboard shows live
progress and the error trail (if any).

Run:
    python3 demo_olipop.py
"""

import json
import os
import shutil
import subprocess
import sys
import time
import traceback
from pathlib import Path

from dotenv import load_dotenv

ROOT = Path(__file__).resolve().parent
load_dotenv(ROOT / ".env")

sys.path.insert(0, str(ROOT / "ledger-delivery"))

from butterbase_client import complete_job, create_job, fail_job, update_job  # noqa: E402
from cartesia_client import synthesize  # noqa: E402
from hf_storage import upload_video  # noqa: E402
from imessage_sender import send_imessage  # noqa: E402


MOCK_FIXTURE = ROOT / "demo" / "mock_olipop.json"
CACHED_VIDEO = Path.home() / "Downloads" / "brief_20260418_0900.mp4"
RECIPIENT = "+16692426592"
IMESSAGE_CAPTION = "Your Adlyze morning brief ☕️"


NARRATION_TEMPLATE = (
    "Good morning. Today's Adlyze brief for {merchant}.\n\n"
    "First: {ins1}\n\n"
    "Second: {ins2}\n\n"
    "Third: {ins3}\n\n"
    "Fourth: {ins4}\n\n"
    "That's your brief. Go make the numbers move."
)


def ffprobe_duration(path: Path) -> float:
    r = subprocess.run(
        [
            "ffprobe", "-v", "error",
            "-show_entries", "format=duration",
            "-of", "default=noprint_wrappers=1:nokey=1",
            str(path),
        ],
        check=True, capture_output=True, text=True,
    )
    return float(r.stdout.strip())


def mux_audio(video_in: Path, audio_in: Path, video_out: Path, duration: float) -> None:
    """Replace video's audio track with audio_in, padded with silence to
    match the original video duration. Video is stream-copied (no re-encode)."""
    cmd = [
        "ffmpeg", "-y",
        "-i", str(video_in),
        "-i", str(audio_in),
        "-filter_complex", "[1:a]apad[a]",
        "-map", "0:v:0",
        "-map", "[a]",
        "-c:v", "copy",
        "-c:a", "aac",
        "-b:a", "192k",
        "-t", f"{duration:.3f}",
        str(video_out),
    ]
    proc = subprocess.run(cmd, capture_output=True, text=True)
    if proc.returncode != 0:
        raise RuntimeError(
            f"ffmpeg mux failed (exit {proc.returncode}):\n"
            f"stderr tail:\n{proc.stderr[-2000:]}"
        )


def compress_for_imessage(video_in: Path, video_out: Path, target_mb: float = 3.5) -> None:
    """Re-encode to fit Photon's ~4 MB gRPC frame cap.

    Uses h264_videotoolbox (Apple Silicon hardware encoder) when available — it's
    fast and ships with macOS ffmpeg by default (x264 requires --enable-gpl, which
    the brew/default builds usually lack). Falls back to libopenh264 on failure.
    """
    duration = ffprobe_duration(video_in)
    audio_kbps = 96
    total_kbps = int((target_mb * 1024 * 8) / max(duration, 1))
    video_kbps = max(200, total_kbps - audio_kbps)
    maxrate_kbps = int(video_kbps * 1.15)

    def _run(encoder: str) -> subprocess.CompletedProcess:
        cmd = [
            "ffmpeg", "-y",
            "-i", str(video_in),
            "-c:v", encoder,
            "-b:v", f"{video_kbps}k",
            "-maxrate", f"{maxrate_kbps}k",
            "-c:a", "aac",
            "-b:a", f"{audio_kbps}k",
            "-movflags", "+faststart",
            str(video_out),
        ]
        return subprocess.run(cmd, capture_output=True, text=True)

    for encoder in ("h264_videotoolbox", "libopenh264"):
        proc = _run(encoder)
        if proc.returncode == 0:
            return
        # else: try next encoder
    raise RuntimeError(
        f"ffmpeg compress failed with both encoders. Last stderr tail:\n"
        f"{proc.stderr[-2000:]}"
    )


def build_narration(mock: dict) -> str:
    insights = mock["insights"]
    if len(insights) < 4:
        raise ValueError(f"Expected 4 insights in fixture, got {len(insights)}")
    return NARRATION_TEMPLATE.format(
        merchant=mock["merchant_name"],
        ins1=insights[0]["text"],
        ins2=insights[1]["text"],
        ins3=insights[2]["text"],
        ins4=insights[3]["text"],
    )


def main() -> None:
    t0 = time.time()
    if not MOCK_FIXTURE.exists():
        raise SystemExit(f"Missing fixture: {MOCK_FIXTURE}")
    if not CACHED_VIDEO.exists():
        raise SystemExit(
            f"Missing cached video: {CACHED_VIDEO}. "
            f"Run Seedance once (or restore from Downloads) before retrying."
        )

    mock = json.loads(MOCK_FIXTURE.read_text())

    print(f"▶ Creating Butterbase job (creative_id={mock['creative_id']})...")
    job = create_job(
        creative_id=mock["creative_id"],
        merchant_name=mock["merchant_name"],
        platform=mock["platform"],
        media_type=mock["media_type"],
        source_url=mock["source_url"],
        status="in_progress",
        current_step="analyzed",
        features=mock.get("features"),
        confidence=mock.get("confidence"),
        hook_copy=mock.get("hook_copy"),
        description=mock.get("description"),
        discovered_tags=mock.get("discovered_tags"),
    )
    job_id = job["id"]
    print(f"  job.id = {job_id}")

    work_dir = ROOT / "briefs" / job_id
    work_dir.mkdir(parents=True, exist_ok=True)

    try:
        # ── 1. Cartesia narration ────────────────────────────────────────
        update_job(job_id, current_step="cartesia_narration")
        script = build_narration(mock)
        print(f"\n▶ Narration script ({len(script)} chars):")
        for line in script.splitlines():
            if line.strip():
                print(f"    > {line}")

        narration_path = work_dir / "narration.mp3"
        synthesize(script, narration_path)
        narration_dur = ffprobe_duration(narration_path)
        print(
            f"\n▶ Cartesia output: {narration_path.name} "
            f"({narration_path.stat().st_size/1024:.0f} KB, {narration_dur:.1f}s)"
        )

        # ── 2. Copy cached video preserving the original ─────────────────
        print(f"\n▶ Copying cached brief video...")
        brief_mp4 = work_dir / "brief.mp4"
        shutil.copy(CACHED_VIDEO, brief_mp4)
        video_dur = ffprobe_duration(brief_mp4)
        print(
            f"  {brief_mp4.name}: {brief_mp4.stat().st_size/1e6:.1f} MB, {video_dur:.1f}s"
        )

        # ── 3. Mux narration onto video (silence-padded, video stream-copied) ─
        update_job(job_id, current_step="ffmpeg_mux")
        brief_cartesia = work_dir / "brief_cartesia.mp4"
        print(f"\n▶ ffmpeg mux → {brief_cartesia.name}")
        mux_audio(brief_mp4, narration_path, brief_cartesia, video_dur)
        final_dur = ffprobe_duration(brief_cartesia)
        print(
            f"  {brief_cartesia.name}: "
            f"{brief_cartesia.stat().st_size/1e6:.1f} MB, {final_dur:.1f}s"
        )

        # ── 4. Compress for Photon's 4 MB iMessage frame limit ───────────
        update_job(job_id, current_step="compressing")
        brief_small = work_dir / "brief_cartesia_small.mp4"
        print(f"\n▶ Compressing for iMessage (Photon gRPC cap ~4 MB)...")
        compress_for_imessage(brief_cartesia, brief_small, target_mb=3.5)
        small_size_mb = brief_small.stat().st_size / 1e6
        print(f"  {brief_small.name}: {small_size_mb:.1f} MB ({ffprobe_duration(brief_small):.1f}s)")
        if small_size_mb > 3.9:
            print(f"  ⚠ still above 3.9 MB — Photon may reject. Continuing anyway.")

        # ── 5. HF upload (compressed version) ────────────────────────────
        update_job(job_id, current_step="uploading_to_hf")
        print(f"\n▶ Uploading to HF dataset...")
        public_url = upload_video(brief_small, name_in_repo=f"{mock['creative_id']}.mp4")
        print(f"  URL: {public_url}")
        update_job(job_id, video_download_url=public_url)

        # ── 6. Photon iMessage ───────────────────────────────────────────
        update_job(job_id, current_step="sending_imessage")
        print(f"\n▶ Sending iMessage to {RECIPIENT}...")
        sent = send_imessage(
            recipient=RECIPIENT,
            text=IMESSAGE_CAPTION,
            attachment_url=public_url,
        )
        print(f"  photon: {sent}")

        # ── 7. Complete ──────────────────────────────────────────────────
        complete_job(
            job_id,
            video_download_url=public_url,
            hook_copy=mock.get("hook_copy"),
        )

        total = time.time() - t0
        print(f"\n✓ Olipop demo complete in {total:.1f}s.")
        print(f"  job_id:      {job_id}")
        print(f"  creative_id: {mock['creative_id']}")
        print(f"  final video: {brief_cartesia}")
        print(f"  public URL:  {public_url}")
        print(f"  recipient:   {RECIPIENT}")

    except Exception as exc:
        err = f"{type(exc).__name__}: {exc}"
        print(f"\n✗ FAILED: {err}", file=sys.stderr)
        traceback.print_exc()
        try:
            fail_job(job_id, error=err[:1000], current_step="error")
        except Exception as log_exc:
            print(f"  (also failed to mark job: {log_exc})", file=sys.stderr)
        raise


if __name__ == "__main__":
    main()
