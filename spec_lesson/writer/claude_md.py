import os
import re
import tempfile
from pathlib import Path

START_MARKER = "<!-- spec-lesson:start -->"
END_MARKER = "<!-- spec-lesson:end -->"

_SECTION_RE = re.compile(
    rf"{re.escape(START_MARKER)}.*?{re.escape(END_MARKER)}",
    re.DOTALL,
)

class ClaudeMdWriter:
    def __init__(self, path: Path):
        self.path = Path(path)

    def write_managed_section(self, body: str) -> None:
        block = f"{START_MARKER}\n{body}\n{END_MARKER}"
        if self.path.exists():
            existing = self.path.read_text(encoding="utf-8")
            if _SECTION_RE.search(existing):
                new = _SECTION_RE.sub(block, existing)
            else:
                sep = "" if existing.endswith("\n") else "\n"
                new = f"{existing}{sep}\n{block}\n"
        else:
            self.path.parent.mkdir(parents=True, exist_ok=True)
            new = f"{block}\n"
        self._atomic_write(new)

    def _atomic_write(self, content: str) -> None:
        fd, tmp_path = tempfile.mkstemp(
            prefix=f"{self.path.name}.tmp.",
            dir=str(self.path.parent),
        )
        try:
            with os.fdopen(fd, "w", encoding="utf-8") as fh:
                fh.write(content)
                fh.flush()
                os.fsync(fh.fileno())
            os.replace(tmp_path, self.path)
        except Exception:
            try:
                os.unlink(tmp_path)
            except FileNotFoundError:
                pass
            raise
