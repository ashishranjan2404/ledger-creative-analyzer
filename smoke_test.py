"""
End-to-end smoke test: upload intro.mp4 → HF dataset → Photon iMessage → Ashish's phone.

This does NOT exercise the VLM / Neo4j / Sissi's brief generator — it just
proves the HF-upload-then-Photon-send plumbing works. If this lands on your
phone, we can wire the full pipeline on top.

Run from repo root:
    python smoke_test.py
"""

import sys
from pathlib import Path

# ledger-delivery/ has a hyphen so it's not importable as a package — add to sys.path.
sys.path.insert(0, str(Path(__file__).resolve().parent / "ledger-delivery"))

from hf_storage import upload_video  # noqa: E402
from imessage_sender import send_imessage  # noqa: E402

RECIPIENT = "+16692426592"
INTRO = Path(__file__).resolve().parent / "assets" / "intro" / "intro.mp4"


def main() -> None:
    if not INTRO.exists():
        raise SystemExit(f"Missing test asset: {INTRO}")

    print(f"→ Uploading {INTRO.name} ({INTRO.stat().st_size / 1024:.0f} KB) to HF dataset...")
    public_url = upload_video(INTRO, name_in_repo="smoke_test_intro.mp4")
    print(f"  Public URL: {public_url}")

    print(f"→ Sending iMessage to {RECIPIENT}...")
    result = send_imessage(
        recipient=RECIPIENT,
        text="Ledger smoke test — creative-analyzer end-to-end pipeline is wired. If you see this, the plumbing works.",
        attachment_url=public_url,
    )
    print(f"  Photon result: {result}")
    print("✓ Smoke test complete.")


if __name__ == "__main__":
    main()
