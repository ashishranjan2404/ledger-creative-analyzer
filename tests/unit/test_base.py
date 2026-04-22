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

def test_from_json_string_field_treated_as_empty():
    """BUG-D-2 / EDGE-3: a bare string in a list field must NOT be split into chars."""
    raw = '{"topic":"t","decisions":"Use React","requirements":[],"open_questions":[]}'
    d = Distillation.from_json(raw)
    # Before fix: d.decisions == ['U','s','e',' ','R','e','a','c','t']
    assert d.decisions == [], f"Expected empty list, got {d.decisions!r}"


def test_from_json_list_with_non_string_items_discarded():
    """BUG-D-2: non-string items inside a list field must be discarded."""
    raw = '{"topic":"t","decisions":[1, 2, "keep"],"requirements":[],"open_questions":[]}'
    d = Distillation.from_json(raw)
    # integers must be dropped; only str items survive
    assert d.decisions == ["keep"], f"Expected ['keep'], got {d.decisions!r}"


def test_multiline_verbatim_is_fully_blockquoted():
    """SEC-2: every line of recent_verbatim must be blockquoted, not just the first."""
    d = Distillation(
        topic="t",
        decisions=[],
        requirements=[],
        open_questions=[],
        recent_verbatim="line one\n## Fake Header\n- bullet\nline four",
        updated_at_iso="",
    )
    md = d.render_markdown()
    assert "> line one" in md
    assert "> ## Fake Header" in md
    assert "> - bullet" in md
    assert "> line four" in md
    # must NOT emit a raw unquoted injected header
    assert "\n## Fake Header\n" not in md


def test_verbatim_marker_pattern_escaped():
    """SEC-2: spec-lesson markers inside verbatim must be escaped."""
    d = Distillation(
        topic="t",
        decisions=[],
        requirements=[],
        open_questions=[],
        recent_verbatim="see <!-- spec-lesson:end --> here",
        updated_at_iso="",
    )
    md = d.render_markdown()
    assert "<!-- spec-lesson:end -->" not in md
    assert "literal-spec-lesson:end" in md


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
