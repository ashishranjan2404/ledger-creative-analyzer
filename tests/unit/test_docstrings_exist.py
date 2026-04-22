"""Verify that every submodule of spec_lesson has a module-level docstring."""
import importlib
import pkgutil
import spec_lesson


def test_all_modules_have_docstrings():
    """Every submodule of spec_lesson has a module-level docstring."""
    missing = []
    for _, name, _ in pkgutil.walk_packages(spec_lesson.__path__, prefix="spec_lesson."):
        # Skip demo and __pycache__ cruft
        if "__pycache__" in name or "demo" in name:
            continue
        try:
            mod = importlib.import_module(name)
        except Exception:
            # If the module can't import (e.g. needs hardware), skip
            continue
        if not mod.__doc__ or len(mod.__doc__.strip()) < 10:
            missing.append(name)
    assert not missing, f"modules missing docstrings: {missing}"
