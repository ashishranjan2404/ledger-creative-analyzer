# Ingest format

`agentspy` reads JSONL. One JSON object per line. Each object is one agent turn.

## Example record

```json
{
  "id": "turn_019",
  "parent_id": "turn_018",
  "ts": "2026-04-19T14:22:03.481Z",
  "role": "assistant",
  "agent": "planner",
  "content": [
    {"type": "text", "text": "Calling the search tool."},
    {"type": "tool_call", "name": "search", "args": {"q": "pgvector cosine distance"}, "call_id": "call_abc"}
  ],
  "model": "claude-sonnet-4-5",
  "latency_ms": 812,
  "tokens": {"in": 1204, "out": 87},
  "cost_usd": 0.00341
}
```

## Required fields

- `id` — string. Unique within the file.
- `role` — one of `user`, `assistant`, `system`, `tool`.
- `content` — array of content blocks. Each block has a `type` and type-specific fields. Recognized types: `text`, `tool_call`, `tool_result`, `reasoning`. Unknown types are preserved and rendered as opaque nodes.

## Optional fields

- `parent_id` — string. If present, must reference another record's `id`. Absent means the record is a root.
- `ts` — ISO 8601 timestamp. Used for ordering and latency derivation.
- `agent` — string. Agent name in multi-agent runs.
- `model` — string. Model identifier used to produce the turn.
- `latency_ms` — integer.
- `tokens` — object with `in` and `out` integer fields.
- `cost_usd` — number.
- `metadata` — free-form object. Pass-through; rendered in a details pane.

## Notes

- Ordering in the file is not load-bearing. Parent-child structure comes from `id` / `parent_id`; records may appear in any order.
- Records with a `parent_id` that does not resolve are surfaced as diagnostics, not silently dropped.
- The schema is open. Unknown top-level fields are preserved and round-trip cleanly through the parser.
