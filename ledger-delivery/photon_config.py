"""
Photon Spectrum config — credentials for the Ledger delivery pipeline.

All three env vars are REQUIRED and live in the repo-root .env (one level up
from this file). Import fails loudly if any is missing or empty — the
pipeline must never run with nulls.
"""

import os
from pathlib import Path

from dotenv import load_dotenv

_ENV_PATH = Path(__file__).resolve().parent.parent / ".env"
load_dotenv(_ENV_PATH)


def _require(name: str) -> str:
    value = os.environ.get(name, "").strip()
    if not value:
        raise RuntimeError(
            f"{name} is missing or empty. Set it in {_ENV_PATH} and re-run."
        )
    return value


def mask(value: str) -> str:
    if len(value) <= 12:
        return "***"
    return value[:8] + "..." + value[-4:]


WORKSPACE_ID = _require("PHOTON_WORKSPACE_ID")
PROJECT_ID = _require("PHOTON_PROJECT_ID")
API_KEY = _require("PHOTON_API_KEY")
