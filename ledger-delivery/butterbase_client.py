"""
Butterbase Python client — thin REST wrapper for the `jobs` table.
Uses the platform service key (bb_sk_...) so RLS is bypassed.

Env vars (required, loaded from repo-root .env):
  BUTTERBASE_API_URL   (e.g. "https://api.butterbase.ai", no /v1 suffix)
  BUTTERBASE_APP_ID    (e.g. "app_48wmae61krkf")
  BUTTERBASE_API_KEY   (e.g. "bb_sk_...")
"""

import os
from datetime import datetime, timezone
from pathlib import Path

import httpx
from dotenv import load_dotenv

_ENV_PATH = Path(__file__).resolve().parent.parent / ".env"
load_dotenv(_ENV_PATH)


def _require(name: str) -> str:
    value = os.environ.get(name, "").strip()
    if not value:
        raise RuntimeError(f"{name} missing in {_ENV_PATH}")
    return value


# Strip a trailing "/v1/app_xxx" so callers can set the bare host or the
# full api_url returned by init_app — both work.
_RAW_URL = _require("BUTTERBASE_API_URL").rstrip("/")
if "/v1/app_" in _RAW_URL:
    _RAW_URL = _RAW_URL.split("/v1/app_")[0]

API_URL = _RAW_URL
APP_ID = _require("BUTTERBASE_APP_ID")
API_KEY = _require("BUTTERBASE_API_KEY")

_HEADERS = {"Authorization": f"Bearer {API_KEY}"}
_BASE = f"{API_URL}/v1/{APP_ID}"


def _now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def create_job(creative_id: str, **fields) -> dict:
    """POST /v1/{app_id}/jobs — returns the full inserted row with generated id."""
    data = {"creative_id": creative_id, **fields}
    r = httpx.post(f"{_BASE}/jobs", headers=_HEADERS, json=data, timeout=15)
    r.raise_for_status()
    return r.json()


def update_job(job_id: str, **fields) -> dict:
    """PATCH /v1/{app_id}/jobs/{id} — merges fields; stamps updated_at."""
    fields["updated_at"] = _now_iso()
    r = httpx.patch(f"{_BASE}/jobs/{job_id}", headers=_HEADERS, json=fields, timeout=15)
    r.raise_for_status()
    return r.json()


def complete_job(job_id: str, **fields) -> dict:
    """Convenience — sets status=completed and stamps completed_at."""
    return update_job(
        job_id,
        status="completed",
        completed_at=_now_iso(),
        **fields,
    )


def fail_job(job_id: str, error: str, **fields) -> dict:
    """Convenience — sets status=failed with the error message."""
    return update_job(job_id, status="failed", error=error, **fields)


def get_job(job_id: str) -> dict:
    r = httpx.get(f"{_BASE}/jobs/{job_id}", headers=_HEADERS, timeout=15)
    r.raise_for_status()
    return r.json()


def find_by_creative_id(creative_id: str, limit: int = 10) -> list[dict]:
    """Find recent jobs for a creative_id (most-recent first)."""
    r = httpx.get(
        f"{_BASE}/jobs",
        headers=_HEADERS,
        params={
            "creative_id": f"eq.{creative_id}",
            "order": "created_at.desc",
            "limit": str(limit),
        },
        timeout=15,
    )
    r.raise_for_status()
    return r.json()
