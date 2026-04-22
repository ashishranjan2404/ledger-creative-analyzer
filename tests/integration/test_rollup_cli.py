import os
import sys
import subprocess
from pathlib import Path


def _run(args, cwd, env=None):
    return subprocess.run(
        [sys.executable, "-m", "spec_lesson.cli", *args],
        cwd=str(cwd),
        env={**os.environ, **(env or {})},
        capture_output=True, text=True, timeout=30,
    )


def test_rollup_cli_aggregates_across_projects(tmp_path: Path):
    # project A: one session
    (tmp_path / "proja/.spec-lesson").mkdir(parents=True)
    (tmp_path / "proja/.spec-lesson/session-1.md").write_text(
        "---\ndate: 2026-04-22\nsession: spec-lesson\ntopics: [voice]\n---\n"
        "# Session A\n\n## Decisions\n- Use Deepgram\n\n"
    )
    # project B: one session
    (tmp_path / "projb/.spec-lesson").mkdir(parents=True)
    (tmp_path / "projb/.spec-lesson/session-2.md").write_text(
        "---\ndate: 2026-04-22\nsession: spec-lesson\ntopics: [voice, hud]\n---\n"
        "# Session B\n\n## Decisions\n- Use Deepgram\n\n## Open questions\n- ship HUD?\n"
    )
    out = tmp_path / "rollup.md"
    r = _run(["rollup", "--since-hours", "168", "--root", str(tmp_path), "--out", str(out)], cwd=tmp_path)
    assert r.returncode == 0, f"stderr: {r.stderr}"
    assert out.exists()
    md = out.read_text()
    assert "Session A" in md
    assert "Session B" in md
    assert "Use Deepgram" in md
    # case-insensitive dedup should have kept only one
    assert md.lower().count("use deepgram") == 1
    assert "ship HUD?" in md
