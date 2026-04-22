from dataclasses import dataclass
from datetime import datetime, timezone
from pathlib import Path


def _iso_now() -> str:
    return datetime.now(timezone.utc).strftime("%Y-%m-%dT%H%M%S")


@dataclass
class Session:
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
        return self.project_dir / "CLAUDE.md"

    @classmethod
    def new(cls, project_dir: Path) -> "Session":
        now_iso = _iso_now()
        sid = now_iso
        state_dir = project_dir / ".spec-lesson"
        state_dir.mkdir(parents=True, exist_ok=True)
        return cls(id=sid, started_at_iso=now_iso, state_dir=state_dir, project_dir=project_dir)
