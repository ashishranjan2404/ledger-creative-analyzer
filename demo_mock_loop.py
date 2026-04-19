"""
Mock end-to-end demo — runs the full pipeline RIGHT NOW with synthetic data,
bypassing Seedance (currently blocked by BytePlus account overdue balance).
Good for recording a demo video.

Pipeline (each stage writes to Butterbase jobs row):
  1. create_job(status=in_progress, current_step=voting)
  2. MAKER voting with 5 mock VLM samples → per-field majority + vote_log
  3. Neo4j write via ledger-delivery/neo4j_writer.py (best-effort)
  4. Use cached intro.mp4 as the brief video stand-in
  5. HF dataset upload → public CDN URL
  6. Photon iMessage send to +16692426592 (attachment + caption)
  7. complete_job

Run: python3 demo_mock_loop.py   (~20-40s end-to-end)
"""

import os
import sys
import time
import traceback
from collections import Counter
from pathlib import Path

from dotenv import load_dotenv

ROOT = Path(__file__).resolve().parent
load_dotenv(ROOT / ".env")

if not os.environ.get("ARK_API_KEY") and os.environ.get("SEED_DANCE_API_KEY"):
    os.environ["ARK_API_KEY"] = os.environ["SEED_DANCE_API_KEY"]

sys.path.insert(0, str(ROOT))
sys.path.insert(0, str(ROOT / "ledger-delivery"))

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
INTRO_VIDEO = ROOT / "assets" / "intro" / "intro.mp4"

STRUCTURED_KEYS = [
    "angle", "subject", "person", "background",
    "hook_type", "offer", "color_dominant", "format",
]

# 5 mock VLM samples — unanimous on most fields, realistic disagreement on 2
# (angle: 4 testimonial / 1 ugc ; person: 4 confident / 1 happy).
MOCK_SAMPLES = [
    {
        "angle": "testimonial", "subject": "ugc", "person": "f_30s_confident",
        "background": "lifestyle_home", "hook_type": "testimonial",
        "offer": "discount_shown", "color_dominant": "warm_yellow", "format": "image",
        "hook_copy": "I lost 15 lbs in 3 weeks",
        "description": "A woman in her 30s holds the product in a sunlit kitchen, smiling at camera.",
        "discovered_tags": ["UGC-style", "sunlit", "kitchen", "before-after-implied"],
        "confidence": 0.89,
    },
    {
        "angle": "testimonial", "subject": "ugc", "person": "f_30s_happy",
        "background": "lifestyle_home", "hook_type": "testimonial",
        "offer": "discount_shown", "color_dominant": "warm_yellow", "format": "image",
        "hook_copy": "I lost 15 lbs in 3 weeks",
        "description": "Woman speaking to camera in a home kitchen with product.",
        "discovered_tags": ["UGC", "home-setting", "authentic"],
        "confidence": 0.84,
    },
    {
        "angle": "testimonial", "subject": "ugc", "person": "f_30s_confident",
        "background": "lifestyle_home", "hook_type": "testimonial",
        "offer": "discount_shown", "color_dominant": "warm_yellow", "format": "image",
        "hook_copy": "I lost 15 lbs in 3 weeks",
        "description": "A 30-something woman holding product in a warm kitchen.",
        "discovered_tags": ["UGC", "kitchen", "before-after-implied"],
        "confidence": 0.91,
    },
    {
        "angle": "ugc", "subject": "ugc", "person": "f_30s_confident",
        "background": "lifestyle_home", "hook_type": "testimonial",
        "offer": "discount_shown", "color_dominant": "warm_yellow", "format": "image",
        "hook_copy": "I lost 15 lbs in 3 weeks",
        "description": "Casual UGC-style shot of a woman with the product.",
        "discovered_tags": ["casual", "lifestyle", "warm"],
        "confidence": 0.78,
    },
    {
        "angle": "testimonial", "subject": "ugc", "person": "f_30s_confident",
        "background": "lifestyle_home", "hook_type": "testimonial",
        "offer": "discount_shown", "color_dominant": "warm_yellow", "format": "image",
        "hook_copy": "I lost 15 lbs in 3 weeks",
        "description": "Woman testimonial in kitchen with product, afternoon light.",
        "discovered_tags": ["testimonial", "natural-light", "kitchen"],
        "confidence": 0.87,
    },
]


def maker_vote(samples: list[dict]) -> tuple[dict, dict, dict]:
    """Per-field majority vote across samples. Tiebreak: highest-confidence sample.
    Returns (voted_structured, winner_sample, vote_log)."""
    sorted_by_conf = sorted(samples, key=lambda s: -s.get("confidence", 0))

    voted: dict = {}
    field_vote_counts: dict = {}
    disagreement: list[str] = []

    for key in STRUCTURED_KEYS:
        values = [s.get(key) for s in samples if s.get(key) is not None]
        counter = Counter(values)
        if not counter:
            voted[key] = None
            continue
        top_count = counter.most_common(1)[0][1]
        winners = [v for v, c in counter.items() if c == top_count]
        if len(winners) == 1:
            voted[key] = winners[0]
        else:
            for s in sorted_by_conf:
                if s.get(key) in winners:
                    voted[key] = s.get(key)
                    break
        if len(set(values)) > 1:
            disagreement.append(key)
            field_vote_counts[key] = dict(counter)

    # Pick winner sample: highest count of fields matching the vote result.
    match_counts = [
        sum(1 for k in STRUCTURED_KEYS if s.get(k) == voted.get(k)) for s in samples
    ]
    best_index = match_counts.index(max(match_counts))
    winner = samples[best_index]

    vote_log = {
        "n_samples": len(samples),
        "n_succeeded": len(samples),
        "fields_with_disagreement": disagreement,
        "field_vote_counts": field_vote_counts,
        "winner_sample_index": best_index,
        "per_sample_confidence": [s.get("confidence") for s in samples],
    }
    return voted, winner, vote_log


def try_neo4j_write(creative_id: str, voted: dict, winner: dict, avg_confidence: float) -> bool:
    """Best-effort Neo4j write. Returns True on success; logs + swallows errors."""
    try:
        from neo4j_writer import verify_connection, write_creative
        verify_connection()
        write_creative(
            creative_id=creative_id,
            structured=voted,
            hook_copy=winner.get("hook_copy"),
            description=winner.get("description"),
            confidence=avg_confidence,
            discovered_tags=winner.get("discovered_tags"),
        )
        return True
    except Exception as exc:
        print(f"  [neo4j] SKIPPED (best-effort): {type(exc).__name__}: {exc}")
        return False


def main() -> None:
    t0 = time.time()
    creative_id = f"mock_{int(t0)}"

    print(f"▶ Creating Butterbase job (creative_id={creative_id})...")
    job = create_job(
        creative_id=creative_id,
        merchant_name=MERCHANT,
        platform="meta",
        media_type="image",
        source_url="mock://hackathon-demo-creative.jpg",
        status="in_progress",
        current_step="voting",
    )
    job_id = job["id"]
    print(f"  job.id = {job_id}")

    try:
        print(f"\n▶ MAKER voting (n={len(MOCK_SAMPLES)} samples)...")
        voted, winner, vote_log = maker_vote(MOCK_SAMPLES)
        avg_conf = sum(s["confidence"] for s in MOCK_SAMPLES) / len(MOCK_SAMPLES)
        print(f"  voted: {voted}")
        print(f"  disagreement on: {vote_log['fields_with_disagreement']}")
        for field, counts in vote_log["field_vote_counts"].items():
            print(f"    {field}: {counts}")
        print(f"  winner sample: #{vote_log['winner_sample_index']} (conf={winner['confidence']})")

        update_job(
            job_id,
            current_step="neo4j_writing",
            features=voted,
            vote_log=vote_log,
            confidence=avg_conf,
            hook_copy=winner["hook_copy"],
            description=winner["description"],
            discovered_tags=winner["discovered_tags"],
        )

        print(f"\n▶ Neo4j write (best-effort)...")
        neo4j_ok = try_neo4j_write(creative_id, voted, winner, avg_conf)
        print(f"  neo4j: {'✓ written' if neo4j_ok else '✗ skipped'}")

        update_job(job_id, current_step="video_staging")

        print(f"\n▶ Video stand-in: cached intro.mp4 (Seedance bypass)...")
        if not INTRO_VIDEO.exists():
            raise FileNotFoundError(f"Missing {INTRO_VIDEO}")
        size_mb = INTRO_VIDEO.stat().st_size / 1e6
        print(f"  {INTRO_VIDEO.name}: {size_mb:.1f} MB")

        update_job(job_id, current_step="uploading_to_hf")
        print(f"\n▶ Uploading to HF dataset...")
        public_url = upload_video(INTRO_VIDEO, name_in_repo=f"{creative_id}.mp4")
        print(f"  public URL: {public_url}")

        update_job(
            job_id,
            current_step="sending_imessage",
            video_download_url=public_url,
        )

        caption = (
            f"Ledger morning brief — {MERCHANT}. "
            f"MAKER voted {vote_log['n_samples']}/5 samples: "
            f"disagreement on {', '.join(vote_log['fields_with_disagreement']) or 'none'}. "
            f"Avg confidence {avg_conf:.2f}. "
            f"Hook: \"{winner['hook_copy']}\"."
        )
        print(f"\n▶ Sending iMessage to {RECIPIENT}...")
        print(f"  caption: {caption}")
        sent = send_imessage(recipient=RECIPIENT, text=caption, attachment_url=public_url)
        print(f"  photon: {sent}")

        complete_job(job_id, hook_copy=winner["hook_copy"])

        total = time.time() - t0
        print(f"\n✓ MOCK DEMO DONE in {total:.1f}s.")
        print(f"  creative_id: {creative_id}")
        print(f"  job_id:      {job_id}")
        print(f"  neo4j:       {'✓ written' if neo4j_ok else '✗ skipped'}")
        print(f"  video URL:   {public_url}")
        print(f"  iMessage:    sent to {RECIPIENT}")

    except Exception as exc:
        err = f"{type(exc).__name__}: {exc}"
        print(f"\n✗ FAILED: {err}", file=sys.stderr)
        traceback.print_exc()
        try:
            fail_job(job_id, error=err[:1000], current_step="error")
        except Exception:
            pass
        raise


if __name__ == "__main__":
    main()
