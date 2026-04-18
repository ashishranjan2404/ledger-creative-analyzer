"""
Photon iMessage sender — Python wrapper that subprocess-calls the
spectrum-ts Node shim at photon-node/send_imessage.mjs.

spectrum-ts has no documented HTTP API, so we shell out to Node.
Requires: node >= 18 and `npm install` completed in photon-node/.

Env vars (loaded from repo-root .env, passed through to Node):
  PHOTON_PROJECT_ID, PHOTON_API_KEY
"""

import json
import os
import subprocess
from pathlib import Path

from dotenv import load_dotenv

_ROOT = Path(__file__).resolve().parent.parent
load_dotenv(_ROOT / ".env")

_NODE_DIR = _ROOT / "ledger-delivery" / "photon-node"
_SEND_SCRIPT = _NODE_DIR / "send_imessage.mjs"


def _require(name: str) -> str:
    value = os.environ.get(name, "").strip()
    if not value:
        raise RuntimeError(f"{name} missing; check .env")
    return value


def send_imessage(
    recipient: str,
    text: str,
    attachment_url: str | None = None,
    timeout_s: int = 180,
) -> dict:
    """
    Send an iMessage with optional URL-hosted video attachment.

    recipient: E.164 phone (e.g. "+16692426592")
    text: message body
    attachment_url: publicly fetchable URL (no auth headers); downloaded by
                    the Node shim, attached as a Buffer.
    """
    project_id = _require("PHOTON_PROJECT_ID")
    project_secret = _require("PHOTON_API_KEY")

    if not _SEND_SCRIPT.exists():
        raise FileNotFoundError(
            f"Node shim missing: {_SEND_SCRIPT}. Run `npm install` in {_NODE_DIR}."
        )

    args = ["node", str(_SEND_SCRIPT), recipient, text]
    if attachment_url:
        args.append(attachment_url)

    env = {
        **os.environ,
        "PHOTON_PROJECT_ID": project_id,
        "PHOTON_API_KEY": project_secret,
    }

    proc = subprocess.run(
        args,
        cwd=_NODE_DIR,
        env=env,
        capture_output=True,
        text=True,
        timeout=timeout_s,
    )

    if proc.returncode != 0:
        raise RuntimeError(
            f"iMessage send failed (exit {proc.returncode}).\n"
            f"stderr: {proc.stderr.strip()}\n"
            f"stdout: {proc.stdout.strip()}"
        )

    stdout = proc.stdout.strip()
    try:
        return json.loads(stdout)
    except json.JSONDecodeError:
        return {"ok": True, "raw_stdout": stdout}
