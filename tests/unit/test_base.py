import pytest
from spec_lesson.tiers.base import Distillation

def test_distillation_render_markdown():
    d = Distillation(
        topic="Building a voice tool",
        decisions=["1.5h cap", "Use Deepgram"],
        requirements=["macOS first", "HUD optional"],
        open_questions=["PyObjC or Tauri?"],
        recent_verbatim="user: ok ship it",
        updated_at_iso="2026-04-22T14:47:32",
    )
    md = d.render_markdown()
    assert "**Topic:** Building a voice tool" in md
    assert "- 1.5h cap" in md
    assert "- macOS first" in md
    assert "- PyObjC or Tauri?" in md
    assert "user: ok ship it" in md
    assert "2026-04-22T14:47:32" in md

def test_distillation_from_json_tolerates_missing_fields():
    d = Distillation.from_json('{"topic":"t","decisions":[],"requirements":[],"open_questions":[]}')
    assert d.topic == "t"
    assert d.recent_verbatim == ""

def test_distillation_merge_is_append_only():
    old = Distillation(
        topic="old",
        decisions=["d1"],
        requirements=["r1"],
        open_questions=["q1"],
        recent_verbatim="",
        updated_at_iso="",
    )
    new = Distillation(
        topic="new",
        decisions=["d2"],
        requirements=["r1", "r2"],
        open_questions=[],
        recent_verbatim="",
        updated_at_iso="",
    )
    merged = old.merge_append_only(new)
    assert merged.topic == "new"  # topic replaced
    assert merged.decisions == ["d1", "d2"]  # appended, no dup
    assert merged.requirements == ["r1", "r2"]  # appended, no dup
    assert merged.open_questions == ["q1"]  # not removed
