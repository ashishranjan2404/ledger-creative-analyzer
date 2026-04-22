import os
import stat
import pytest
from pathlib import Path
from spec_lesson.session import Session, SessionSetupError


def test_session_new_creates_state_dir(tmp_path: Path):
    proj = tmp_path / "p"
    proj.mkdir()
    session = Session.new(project_dir=proj)
    assert session.state_dir.is_dir()
    assert session.state_dir == proj / ".spec-lesson"


def test_session_new_raises_friendly_on_readonly(tmp_path: Path):
    proj = tmp_path / "p"
    proj.mkdir()
    original = proj.stat().st_mode
    proj.chmod(0o555)
    try:
        with pytest.raises(SessionSetupError) as excinfo:
            Session.new(project_dir=proj)
        assert "permissions" in str(excinfo.value).lower()
    finally:
        proj.chmod(original)


def test_session_new_raises_friendly_when_state_dir_is_file(tmp_path: Path):
    proj = tmp_path / "p"
    proj.mkdir()
    # Create .spec-lesson as a regular file instead of a directory
    fake = proj / ".spec-lesson"
    fake.write_text("oops")
    with pytest.raises(SessionSetupError) as excinfo:
        Session.new(project_dir=proj)
    # FileExistsError path — message mentions "not a directory"
    assert "not a directory" in str(excinfo.value).lower()


def test_session_paths_derived_correctly(tmp_path: Path):
    proj = tmp_path / "p"
    proj.mkdir()
    session = Session.new(project_dir=proj)
    assert session.claude_md == proj / "CLAUDE.md"
    assert session.distillation_md.suffix == ".md"
    assert session.transcript_jsonl.suffix == ".jsonl"
