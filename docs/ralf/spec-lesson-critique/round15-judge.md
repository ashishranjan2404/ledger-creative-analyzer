# Round 15 Judge — mypy clean pass on spec_lesson/

## Summary

**Starting errors:** 5 (all in `spec_lesson/cli.py`)
**Ending errors:** 0
**Files changed:** `spec_lesson/cli.py`, `spec_lesson/hud/renderer.py`, `pyproject.toml`
**Tests:** 219 passed, 0 failed (no regressions)

---

## Errors fixed

### 1. `method-assign` — line 70 of `cli.py`

```python
client.complete = AsyncMock(side_effect=lambda **kw: _canned_response(**kw))
```

`AnthropicClient.complete` is an `async def` method; mypy forbids assigning over it.
Fix: added `# type: ignore[method-assign]` with an explanatory comment — the fake
client pattern is intentional (SPEC_LESSON_FAKE_API mode) and cannot be restructured
without changing runtime behaviour.

### 2. `no-redef` — lines 189 and 192 of `cli.py`

```python
renderer = None
...
renderer: HudRenderer | None = StdoutHudRenderer()   # first annotation
...
renderer: HudRenderer | None = TkinterHudRenderer()  # second annotation → no-redef
```

Mypy treats a second `var: Type = ...` annotation on the same name as a re-definition.
Fix: declare `renderer: HudRenderer | None = None` once before the if-elif block and
drop the inline type annotations on the reassignments.

### 3. `attr-defined` — lines 249 and 271 of `cli.py` (`renderer.mainloop()`)

Two causes:

a. `renderer` was typed as `HudRenderer | None`, and mypy (correctly) couldn't prove it
   was non-None inside the `if hud == "tk":` blocks.
   Fix: `assert renderer is not None` immediately before each call — a narrowing assertion
   that is semantically correct (the renderer is always built when `hud == "tk"`).

b. `HudRenderer` Protocol did not declare `mainloop`, so even after narrowing away `None`,
   `HudRenderer.mainloop()` would be `attr-defined` error.
   Fix: added `mainloop(self) -> None: ...` to the `HudRenderer` Protocol, and a matching
   no-op `mainloop` to `StdoutHudRenderer` so it still satisfies the Protocol structurally.

---

## `type: ignore` added

| Location | Tag | Reason |
|---|---|---|
| `cli.py:70` | `method-assign` | Fake client overrides `complete` with AsyncMock in SPEC_LESSON_FAKE_API mode; cannot avoid without changing runtime structure |

---

## pyproject.toml change

Added `[tool.mypy]` section scoped to `spec_lesson/` only:

```toml
[tool.mypy]
files = ["spec_lesson"]
ignore_missing_imports = true
warn_unused_ignores = true
```

`warn_unused_ignores = true` ensures the single `# type: ignore[method-assign]` will
surface a warning if a future mypy version resolves the method-assign issue natively,
so it can be removed at that point. Tests remain outside mypy scope intentionally.

---

## Verification

```
mypy spec_lesson/ → Success: no issues found in 35 source files
pytest -q        → 219 passed in 29.10s
```
