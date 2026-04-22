"""Session identity and path resolution.

A ``Session`` is a lightweight value object created once per run; it holds
the session ID (ISO timestamp), the ``.spec-lesson/`` state directory, and
the project directory.  All file paths (transcript JSONL, distillation MD,
CLAUDE.md) are derived from these two roots.
"""
from dataclasses import dataclass
from datetime import datetime, timezone
from pathlib import Path


def _iso_now() -> str:
    return datetime.now(timezone.utc).strftime("%Y-%m-%dT%H%M%S")


class SessionSetupError(RuntimeError):
    """Raised by Session.new() when the state directory cannot be created."""


@dataclass
class Session:
    """Lightweight value object that holds all path state for one session.

    ``claude_md`` points to ``project_dir / "CLAUDE.md"`` (not the state dir)
    because CLAUDE.md is a project-level file that persists across sessions.
    """
    id: str
    started_at_iso: str
    state_dir: Path
    project_dir: Path

    @property
    def transcript_jsonl(self) -> Path:
        return self.state_dir / f"session-{self.id}.jsonl"

    @property
    def distillation_md(self) -> Path:
        return self.state_dir / f"session-{self.id}.md"

    @property
    def triggers_log(self) -> Path:
        return self.state_dir / "triggers.log"

    @property
    def claude_md(self) -> Path:
        # why: CLAUDE.md lives at the project root, not inside .spec-lesson/,
        # so it is visible to Claude Code when the user opens the project.
        return self.project_dir / "CLAUDE.md"

    @classmethod
    def new(cls, project_dir: Path) -> "Session":
        now_iso = _iso_now()
        sid = now_iso
        state_dir = project_dir / ".spec-lesson"
        try:
            state_dir.mkdir(parents=True, exist_ok=True)
        except FileExistsError:
            raise SessionSetupError(
                f"{state_dir} exists but is not a directory. Remove it and retry."
            )
        except PermissionError as e:
            raise SessionSetupError(
                f"Cannot create {state_dir}: {e}. Check project directory permissions."
            )
        return cls(id=sid, started_at_iso=now_iso, state_dir=state_dir, project_dir=project_dir)
