"""
Full-flow demo — end-to-end from Alex's GraphRAG insights to Photon iMessage.

Pipeline exercised:
  1. Butterbase job row created (status=in_progress, step=queued)
  2. Fetch insights from Alex's chat API (GraphRAG over Neo4j)
  3. Fan out:
       - Seedance brief video (Sissi's generate_brief, ~5-10 min)
       - Cartesia narration MP3 (fast, ~5-10s; fallback if Seedance fails)
  4. Upload winning media to HF dataset → public URL
  5. Photon iMessage to +16692426592 (video attachment OR audio + caption)
  6. Complete the Butterbase job

Run: python3 demo_full_flow.py
  (optional env overrides: DEMO_CREATIVE_ID, DEMO_RECIPIENT)
"""

import os
import sys
from pathlib import Path

from dotenv import load_dotenv

ROOT = Path(__file__).resolve().parent
load_dotenv(ROOT / ".env")

# Sissi's brief_generator reads ARK_API_KEY; .env uses SEED_DANCE_API_KEY.
if not os.environ.get("ARK_API_KEY") and os.environ.get("SEED_DANCE_API_KEY"):
    os.environ["ARK_API_KEY"] = os.environ["SEED_DANCE_API_KEY"]

sys.path.insert(0, str(ROOT))
sys.path.insert(0, str(ROOT / "ledger-delivery"))

from butterbase_client import create_job  # noqa: E402
from creative_analyzer import BriefDeliveryRequest, run_brief_delivery  # noqa: E402


CREATIVE_ID = os.environ.get("DEMO_CREATIVE_ID", "cr_adlyze_google_dco")
RECIPIENT = os.environ.get("DEMO_RECIPIENT", "+16692426592")


def main() -> None:
    print(f"▶ Full-flow demo")
    print(f"  creative_id: {CREATIVE_ID}")
    print(f"  recipient:   {RECIPIENT}")
    print()

    job = create_job(
        creative_id=CREATIVE_ID,
        platform="demo_full_flow",
        media_type="video_or_audio",
        source_url=f"alex://{CREATIVE_ID}",
        status="in_progress",
        current_step="queued",
    )
    print(f"▶ Butterbase job created: {job['id']}")
    print()

    req = BriefDeliveryRequest(
        creative_id=CREATIVE_ID,
        recipient=RECIPIENT,
        n_insights=4,
        duration_target_sec=60,
        voice="confident_female",
    )

    # Call the orchestration synchronously so we see live stdout.
    run_brief_delivery(job["id"], req)

    print()
    print("✓ Demo complete.")
    print(f"  job_id: {job['id']}")


if __name__ == "__main__":
    main()
