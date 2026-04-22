"""Atomic writer for the spec-lesson managed section inside CLAUDE.md.

``ClaudeMdWriter`` maintains a single HTML-comment-delimited block
(``<!-- spec-lesson:start --> … <!-- spec-lesson:end -->``) inside the
project's CLAUDE.md.  Writes are atomic: content goes to a temp file,
fsynced, then ``os.replace``d so a crash never leaves a half-written CLAUDE.md.
"""
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
        # SEC-1: strip literal marker strings from body to prevent the non-greedy
        # regex from terminating early on a fake end marker (e.g. LLM echoes the
        # marker text from a transcript).  Replace with a visually distinct but
        # harmless form so the content is preserved.
        safe_body = body.replace(START_MARKER, START_MARKER.replace("<!-- ", "<!-- literal-"))
        safe_body = safe_body.replace(END_MARKER, END_MARKER.replace("<!-- ", "<!-- literal-"))
        block = f"{START_MARKER}\n{safe_body}\n{END_MARKER}"
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
        """Write *content* to self.path atomically using tempfile + fsync + os.replace.

        why: a plain ``path.write_text()`` call on macOS/Linux is NOT atomic —
        the file is truncated first, then the new bytes are written.  A crash
        between truncate and write leaves the CLAUDE.md empty.  Writing to a
        sibling temp file (same filesystem → same device), fsyncing, then
        calling ``os.replace()`` (which is POSIX-rename, atomic at the kernel
        level) guarantees the file is either the old version or the new version,
        never a partial update.
        """
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
