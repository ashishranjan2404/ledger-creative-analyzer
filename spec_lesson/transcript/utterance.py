import json
from dataclasses import dataclass, asdict


@dataclass(frozen=True)
class Utterance:
    timestamp: float
    speaker: str
    text: str
    is_final: bool

    @classmethod
    def from_dict(cls, data: dict) -> "Utterance":
        return cls(
            timestamp=data["timestamp"],
            speaker=data["speaker"],
            text=data["text"],
            is_final=data["is_final"],
        )

    def to_dict(self) -> dict:
        return asdict(self)

    def to_jsonl(self) -> str:
        return json.dumps(self.to_dict())
