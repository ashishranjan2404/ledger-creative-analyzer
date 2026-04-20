#!/usr/bin/env python3
"""
Dedup pass on a markdown doc after the RALF loop. The judge's append-heavy
output creates duplicate section headers; this script consolidates them.

For every `## Header` that appears more than once:
  - Collects all bodies
  - Sends them to Qwen with instructions to merge into one non-duplicate
    section, preserving all unique facts
  - Replaces all duplicates with the merged version

Usage: python scripts/ralf_dedup.py docs/features/yutori-reference.md
"""

from __future__ import annotations
import argparse
import json
import os
import re
import sys
from pathlib import Path

import httpx

try:
    from dotenv import load_dotenv
    load_dotenv()
except ImportError:
    pass

IONROUTER_URL = "https://api.ionrouter.io/v1/chat/completions"
MODEL = os.environ.get("RALF_MODEL", "qwen3.5-122b-a10b")
KEY = os.environ.get("IONROUTER_KEY") or os.environ.get("IONROUTER_API_KEY")
if not KEY:
    print("ERROR: IONROUTER_KEY not set", file=sys.stderr)
    sys.exit(1)

MERGE_SYSTEM = """You merge duplicated markdown sections into a single non-duplicate
section. Input: N versions of the same section (same header). Your job:
- Produce ONE coherent body that keeps every unique fact from all versions
- Remove duplicate sentences / bullets
- Preserve all citations / URLs
- Keep the tone factual and direct
- Do NOT include the `## Header` line itself — only the body

Return STRICT JSON: {"body": "merged markdown body"}"""


def call_qwen(system: str, user: str, max_tokens: int = 3000) -> str:
    body = {
        "model": MODEL,
        "temperature": 0,
        "max_tokens": max_tokens,
        "response_format": {"type": "json_object"},
        "messages": [
            {"role": "system", "content": system},
            {"role": "user", "content": user},
        ],
    }
    with httpx.Client(timeout=120) as c:
        r = c.post(
            IONROUTER_URL,
            headers={"Authorization": f"Bearer {KEY}", "Content-Type": "application/json"},
            json=body,
        )
    if r.status_code >= 400:
        raise httpx.HTTPStatusError(
            f"{r.status_code}: {r.text[:400]}", request=r.request, response=r
        )
    return r.json()["choices"][0]["message"]["content"]


def split_sections(doc: str) -> list[tuple[str | None, str]]:
    """Return [(header_or_None, body), ...] preserving pre-first-header preamble."""
    # Split on `## Header` lines (not `### `, not `#`). Keep the header in the section.
    parts = re.split(r"(?m)^(?=## [^\n]+)", doc)
    out = []
    for p in parts:
        if not p.strip():
            continue
        m = re.match(r"(## [^\n]+)\n(.*)", p, re.DOTALL)
        if m:
            out.append((m.group(1).strip(), m.group(2)))
        else:
            # preamble before any `##` header
            out.append((None, p))
    return out


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("doc", type=Path)
    ap.add_argument("--dry-run", action="store_true")
    args = ap.parse_args()

    doc = args.doc.read_text()
    sections = split_sections(doc)

    # Group sections by header
    by_header: dict[str, list[str]] = {}
    for h, body in sections:
        if h is None:
            continue
        by_header.setdefault(h, []).append(body)

    dups = {h: bodies for h, bodies in by_header.items() if len(bodies) > 1}
    if not dups:
        print("no duplicates found")
        return

    print(f"found {len(dups)} duplicated sections:")
    for h, bodies in dups.items():
        print(f"  {h} — {len(bodies)}×")

    if args.dry_run:
        return

    # Merge each duplicate group
    merged: dict[str, str] = {}
    for h, bodies in dups.items():
        print(f"\nmerging {h} ({len(bodies)} versions)...", end=" ", flush=True)
        versions = "\n\n--- version separator ---\n\n".join(bodies)
        raw = call_qwen(MERGE_SYSTEM, f"Header: {h}\n\nVersions:\n{versions}")
        try:
            result = json.loads(raw)
            merged[h] = result.get("body", "").strip() + "\n"
            print(f"ok ({len(merged[h])} chars)")
        except json.JSONDecodeError:
            print("parse error, skipping")

    # Rebuild doc, using merged body for first occurrence of each dup header and
    # dropping subsequent occurrences entirely.
    used = set()
    rebuilt = []
    for h, body in sections:
        if h is None:
            rebuilt.append(body)
            continue
        if h in merged:
            if h in used:
                continue  # drop subsequent dup
            rebuilt.append(f"{h}\n{merged[h]}\n")
            used.add(h)
        else:
            rebuilt.append(f"{h}\n{body}")

    new_doc = "".join(rebuilt).rstrip() + "\n"
    args.doc.write_text(new_doc)
    print(f"\nwrote {args.doc} ({len(doc)} → {len(new_doc)} chars, Δ{len(new_doc)-len(doc):+d})")


if __name__ == "__main__":
    main()
