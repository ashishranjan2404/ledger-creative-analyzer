import os
from pathlib import Path
from .utterance import Utterance

class TranscriptWriter:
    def __init__(self, path: Path):
        self.path = Path(path)
        self.path.parent.mkdir(parents=True, exist_ok=True)
        self._fh = self.path.open("a", encoding="utf-8")

    def append(self, utterance: Utterance) -> None:
        self._fh.write(utterance.to_jsonl() + "\n")
        self._fh.flush()
        os.fsync(self._fh.fileno())

    def close(self) -> None:
        self._fh.close()

    def __enter__(self) -> "TranscriptWriter":
        return self

    def __exit__(self, *args) -> None:
        self.close()
