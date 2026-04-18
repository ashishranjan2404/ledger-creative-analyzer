"""
HuggingFace dataset storage — uploads brief videos to a public dataset
and returns the CDN-backed resolve URL for Photon iMessage delivery.

Env vars (read from ~/.zshrc or the shell):
  HF_TOKEN      (required) — Hugging Face personal access token
  HF_USER       (optional, default "quantranger")
  HF_DATASET    (optional, default "ledger-briefs")

Videos are uploaded to a PUBLIC dataset so Photon can fetch without auth.
"""

import os
from pathlib import Path

from huggingface_hub import HfApi, create_repo

_HF_TOKEN = os.environ.get("HF_TOKEN")
_HF_USER = os.environ.get("HF_USER", "quantranger")
_HF_DATASET = os.environ.get("HF_DATASET", "ledger-briefs")
REPO_ID = f"{_HF_USER}/{_HF_DATASET}"

_api = HfApi(token=_HF_TOKEN)


def _require_token() -> None:
    if not _HF_TOKEN:
        raise RuntimeError(
            "HF_TOKEN not set. Add it to ~/.zshrc "
            "(export HF_TOKEN=hf_...) and reload your shell."
        )


def ensure_repo() -> None:
    """Idempotently create the public dataset. Safe to call every time."""
    _require_token()
    create_repo(
        repo_id=REPO_ID,
        repo_type="dataset",
        private=False,
        token=_HF_TOKEN,
        exist_ok=True,
    )


def upload_video(local_path: Path, name_in_repo: str | None = None) -> str:
    """
    Upload a video to the HF dataset and return its public URL.
    Photon can fetch this URL directly with no auth headers.
    """
    _require_token()
    local_path = Path(local_path)
    if not local_path.exists():
        raise FileNotFoundError(f"Video not found: {local_path}")

    ensure_repo()
    name = name_in_repo or local_path.name
    _api.upload_file(
        path_or_fileobj=str(local_path),
        path_in_repo=name,
        repo_id=REPO_ID,
        repo_type="dataset",
        token=_HF_TOKEN,
    )
    return f"https://huggingface.co/datasets/{REPO_ID}/resolve/main/{name}"
