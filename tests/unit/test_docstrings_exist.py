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


def test_sub_package_all_exports_importable():
    """TYPE-10: __all__ names in sub-package __init__ files must all be importable.

    Verifies that spec_lesson.tiers, spec_lesson.transcript, and spec_lesson.hud
    each declare __all__ and that every name in __all__ can actually be imported.
    """
    sub_packages = [
        "spec_lesson.tiers",
        "spec_lesson.transcript",
        "spec_lesson.hud",
    ]
    for pkg_name in sub_packages:
        mod = importlib.import_module(pkg_name)
        assert hasattr(mod, "__all__"), f"{pkg_name} is missing __all__"
        all_names = mod.__all__
        assert len(all_names) > 0, f"{pkg_name}.__all__ is empty"
        for name in all_names:
            assert hasattr(mod, name), (
                f"{pkg_name}.__all__ lists '{name}' but it is not importable from the package"
            )
