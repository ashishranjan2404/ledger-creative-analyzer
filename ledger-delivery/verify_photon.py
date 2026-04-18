"""Smoke test — confirms the Photon env loads cleanly. No network calls."""

import photon_config as cfg

print(
    f"Workspace: {cfg.mask(cfg.WORKSPACE_ID)}, "
    f"Project: {cfg.mask(cfg.PROJECT_ID)}, "
    f"API key: present (len={len(cfg.API_KEY)})"
)
