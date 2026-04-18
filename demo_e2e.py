"""
End-to-end demo pipeline — mock insights → Sissi's Seedance brief generator
→ HF dataset upload → Photon iMessage delivery to Ashish's phone.

Tracks every stage in Butterbase `jobs` so the dashboard shows live progress.

Run from repo root:
    python demo_e2e.py

Runtime: ~5-10 minutes (dominated by 4 Seedance visual generations at
2-at-a-time concurrency, plus FFmpeg composition + HF upload).
"""

import os
import sys
import time
import traceback
from pathlib import Path

from dotenv import load_dotenv

ROOT = Path(__file__).resolve().parent
load_dotenv(ROOT / ".env")

# Sissi's brief_generator reads ARK_API_KEY, but Ashish stored the BytePlus
# Seedance secret under SEED_DANCE_API_KEY. Alias before importing.
if not os.environ.get("ARK_API_KEY") and os.environ.get("SEED_DANCE_API_KEY"):
    os.environ["ARK_API_KEY"] = os.environ["SEED_DANCE_API_KEY"]

sys.path.insert(0, str(ROOT))
sys.path.insert(0, str(ROOT / "ledger-delivery"))

from brief_generator import generate_brief  # noqa: E402
from butterbase_client import (  # noqa: E402
    complete_job,
    create_job,
    fail_job,
    update_job,
)
from hf_storage import upload_video  # noqa: E402
from imessage_sender import send_imessage  # noqa: E402

RECIPIENT = "+16692426592"
MERCHANT = "Adlyze Demo Merchant"

# Same sample insights Sissi tested with — already tuned for the "Ledger
# morning brief" narrative (face swap, testimonials, kill duplicates, reallocate).
MOCK_INSIGHTS = [
    {"text": "Sarah's face drove 3.2x ROAS vs Mike last week."},
    {"text": "Testimonials beat product-only by $42K this month."},
    {"text": "Kill 2 of your 3 similar-looking ads — similarity 0.87."},
    {"text": "Shift $8K from Meta to TikTok retargeting."},
]


def main() -> None:
    t0 = time.time()
    brief_id = f"demo_{int(t0)}"

    print(f"▶ Creating Butterbase job row (creative_id={brief_id})...")
    job = create_job(
        creative_id=brief_id,
        merchant_name=MERCHANT,
        platform="adlyze_demo",
        media_type="brief",
        source_url="mock://hackathon-demo",
        status="in_progress",
        current_step="generating_brief",
    )
    job_id = job["id"]
    print(f"  job.id = {job_id}")

    try:
        print(f"\n▶ Generating brief ({len(MOCK_INSIGHTS)} insights, ~60s target)...")
        print("   (5-10 min — 4 Seedance calls, TTS, FFmpeg composition)")
        brief = generate_brief(
            brief_id=brief_id,
            merchant_name=MERCHANT,
            insights=MOCK_INSIGHTS,
            duration_target_sec=60,
            voice="confident_female",
        )
        gen_elapsed = time.time() - t0
        print(f"  brief ready in {gen_elapsed/60:.1f} min: {brief}")

        video_path = Path(brief["video_path"])
        size_mb = video_path.stat().st_size / 1e6

        update_job(job_id, current_step="uploading_to_hf", description=f"Generated {brief['duration_sec']}s brief, {size_mb:.1f} MB")

        print(f"\n▶ Uploading {video_path.name} ({size_mb:.1f} MB) to HF dataset...")
        public_url = upload_video(video_path, name_in_repo=f"{brief_id}.mp4")
        print(f"  public URL: {public_url}")

        update_job(job_id, current_step="sending_imessage", video_download_url=public_url)

        caption = (
            f"Ledger morning brief — {MERCHANT}. "
            f"{len(MOCK_INSIGHTS)} insights, {brief['duration_sec']}s. "
            f"Tap to play."
        )
        print(f"\n▶ Sending iMessage to {RECIPIENT}...")
        sent = send_imessage(recipient=RECIPIENT, text=caption, attachment_url=public_url)
        print(f"  photon: {sent}")

        complete_job(
            job_id,
            hook_copy=caption,
            discovered_tags=[i["text"][:40] for i in MOCK_INSIGHTS],
            confidence=1.0,
        )

        total = time.time() - t0
        print(f"\n✓ DONE in {total/60:.1f} min.")
        print(f"  Video:      {video_path}")
        print(f"  Public URL: {public_url}")
        print(f"  Job row:    {job_id}")

    except Exception as exc:
        err = f"{type(exc).__name__}: {exc}"
        print(f"\n✗ FAILED: {err}", file=sys.stderr)
        traceback.print_exc()
        try:
            fail_job(job_id, error=err[:1000], current_step="error")
        except Exception as fail_exc:
            print(f"  (also failed to mark job: {fail_exc})", file=sys.stderr)
        raise


if __name__ == "__main__":
    main()
