"""Integration tests for AudioIngress (spec_lesson/audio_ingress.py)."""
import pytest
from pathlib import Path
from spec_lesson.audio_ingress import AudioIngress


def test_ingress_persists_utterance_and_fires_trigger(tmp_path: Path):
    transcript = tmp_path / "t.jsonl"
    triggers = tmp_path / "tr.log"
    fired: list = []
    ingress = AudioIngress(
        transcript_path=transcript,
        triggers_log_path=triggers,
        audio_source=None,
        on_trigger_fired=lambda u: fired.append(u),
    )
    ingress.ingest({"timestamp": 1.0, "speaker": "u", "text": "hello", "is_final": True})
    ingress.ingest({"timestamp": 2.0, "speaker": "u", "text": "OK Claude build that", "is_final": True})
    ingress.close()

    assert transcript.exists()
    lines = transcript.read_text().splitlines()
    assert len(lines) == 2

    assert triggers.exists()
    assert len(fired) == 1
    assert fired[0].text == "OK Claude build that"


def test_ingress_buffer_accumulates_utterances(tmp_path: Path):
    transcript = tmp_path / "t.jsonl"
    triggers = tmp_path / "tr.log"
    ingress = AudioIngress(
        transcript_path=transcript,
        triggers_log_path=triggers,
    )
    for i in range(5):
        ingress.ingest({"timestamp": float(i), "speaker": "u", "text": f"word {i}", "is_final": True})
    ingress.close()

    assert len(ingress.buffer.all()) == 5


def test_ingress_ignores_malformed_utterance(tmp_path: Path):
    transcript = tmp_path / "t.jsonl"
    triggers = tmp_path / "tr.log"
    ingress = AudioIngress(
        transcript_path=transcript,
        triggers_log_path=triggers,
    )
    # Missing required fields — should be silently ignored.
    ingress.ingest({"bad": "data"})
    ingress.close()

    assert len(ingress.buffer.all()) == 0


def test_ingress_trigger_not_fired_for_non_final_utterance(tmp_path: Path):
    transcript = tmp_path / "t.jsonl"
    triggers = tmp_path / "tr.log"
    fired: list = []
    ingress = AudioIngress(
        transcript_path=transcript,
        triggers_log_path=triggers,
        on_trigger_fired=lambda u: fired.append(u),
    )
    # is_final=False — trigger should not fire even if phrase matches.
    ingress.ingest({"timestamp": 1.0, "speaker": "u", "text": "OK Claude build that", "is_final": False})
    ingress.close()

    assert len(fired) == 0


def test_ingress_start_stop_with_no_source(tmp_path: Path):
    """start() and stop() must be safe to call with no audio_source configured."""
    transcript = tmp_path / "t.jsonl"
    triggers = tmp_path / "tr.log"
    ingress = AudioIngress(
        transcript_path=transcript,
        triggers_log_path=triggers,
        audio_source=None,
    )
    ingress.start()  # should not raise
    ingress.stop()   # should not raise
    ingress.close()


def test_ingress_on_utterance_from_audio_updates_monotonic(tmp_path: Path):
    """on_utterance_from_audio() should update last_utterance_monotonic."""
    import time
    transcript = tmp_path / "t.jsonl"
    triggers = tmp_path / "tr.log"
    ingress = AudioIngress(
        transcript_path=transcript,
        triggers_log_path=triggers,
    )
    before = ingress.last_utterance_monotonic
    time.sleep(0.01)
    ingress.on_utterance_from_audio({"timestamp": 1.0, "speaker": "u", "text": "hi", "is_final": True})
    after = ingress.last_utterance_monotonic
    ingress.close()

    assert after > before, "last_utterance_monotonic was not updated by on_utterance_from_audio"
