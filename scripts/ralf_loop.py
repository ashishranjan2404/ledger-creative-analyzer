#!/usr/bin/env python3
"""
RALF loop — iterative doc refinement via IonRouter (Qwen 3.5 122B).

Per iteration:
  - 5 parallel "critic" calls with distinct lenses propose changes
  - 1 "judge" call merges accepted changes into the doc
  - Diff written to docs/ralf/<doc-stem>/iter-NN.diff
  - Stop on hitting --max-iters OR 2 consecutive no-op iterations.

Usage:
  export IONROUTER_KEY=sk-...
  python scripts/ralf_loop.py docs/features/yutori-reference.md --max-iters 20

Pre-fetches any URLs listed in docs/features/<doc-stem>.urls.txt once at start
so critics have access to live web content without re-fetching every round.
"""

from __future__ import annotations

import argparse
import concurrent.futures
import difflib
import json
import os
import re
import sys
import time
from pathlib import Path

import httpx

try:
    from dotenv import load_dotenv
    load_dotenv()
except ImportError:
    pass

ROOT = Path(__file__).resolve().parent.parent
IONROUTER_URL = "https://api.ionrouter.io/v1/chat/completions"
MODEL = os.environ.get("RALF_MODEL", "qwen3.5-122b-a10b")

KEY = os.environ.get("IONROUTER_KEY") or os.environ.get("IONROUTER_API_KEY")
if not KEY:
    print("ERROR: IONROUTER_KEY not set", file=sys.stderr)
    sys.exit(1)

# ---------------------------------------------------------------------------
# Critic lenses — rotated across iterations so each round probes a new angle.
# ---------------------------------------------------------------------------
LENSES = [
    # 1. Yutori feature expander
    """You are a product researcher doing deep competitive intelligence on Yutori.
Your job: find Yutori features the CURRENT DOC does NOT cover.
Use the PROVIDED WEB CONTENT (scraped from yutori.com, yutori's blog, and
launch coverage) to extract specific missing features: pricing details,
connector names, scout templates, limitations, founder quotes, recent announcements.
Return a JSON of concrete ADDITIONS to append to the doc — do not paraphrase
content that's already present.""",

    # 2. Competitive analyst
    """You are a competitive analyst. Your job: strengthen the competitive-
landscape sections of the doc. Identify where the doc compares Yutori/Thedi
against competitors vaguely or is missing a relevant competitor entirely.
Propose specific claims with competitor names and features. If the doc already
has a comparison table, propose additional rows or columns.""",

    # 3. Fact-checker / skeptic
    """You are a skeptical fact-checker. Your job: flag any claim in the doc
that lacks a source, appears speculative, or seems internally inconsistent.
For each flagged claim, suggest a fix: add a citation, soften the claim, or
remove it. Be ruthless about unsupported assertions.""",

    # 4. User-value editor
    """You are a product writer. Your job: imagine a reader who is deciding
whether to build on Yutori's model or differentiate. Find sections that are
unclear, too internal, or bury the important insight. Propose tighter rewrites
of specific paragraphs. Prefer cutting to adding.""",

    # 5. Actionability / Thedi-roadmap translator
    """You are Thedi's product lead. Your job: given the Yutori feature set
documented, surface SPECIFIC, implementable actions Thedi should take in the
next 2 weeks — tied to concrete sections of the doc. If the doc already has a
"what Thedi can adopt" table, refine it with sharper priorities and estimates.""",
]

JUDGE_SYSTEM = """You are the RALF judge. You receive the CURRENT DOC and 5 proposed CHANGES.
Your job is to decide which changes to accept, then emit a list of discrete EDIT OPS
that a script will apply in order. Never return the full doc — only the edits.

Rules:
- Prefer concrete, cited, actionable additions.
- Reject duplicates of existing content and pure speculation.
- When proposals contradict, pick the one with better sourcing.
- Preserve existing structure unless a proposal clearly improves it.
- Preserve the doc's direct, sourced tone.
- If a flag has no fixable source, soften or remove rather than keep unsupported.

Return STRICT JSON:
{
  "edits": [
    {"op": "append", "content": "markdown to append to end of doc"},
    {"op": "replace_section", "header": "## Section Header (exact)", "new_body": "replacement body under that header, excluding the header line"},
    {"op": "replace_text", "find": "exact substring from doc", "replace": "new substring"},
    {"op": "insert_after_header", "header": "## Header", "content": "content to insert after the header line"}
  ],
  "change_summary": "<=2 sentences describing what meaningfully changed"
}

If no changes are warranted, return: {"edits": [], "change_summary": "no change"}"""

CRITIC_JSON_SCHEMA_HINT = """Return STRICT JSON:
{
  "additions": [
    {"section": "section header or 'append'", "content": "markdown to add"}
  ],
  "rewrites": [
    {"find": "exact text from doc", "replace": "new text"}
  ],
  "flags": [
    {"quote": "text in doc", "issue": "problem", "suggestion": "fix"}
  ],
  "summary": "<=1 sentence of what you changed"
}

If you have no changes, return: {"additions": [], "rewrites": [], "flags": [], "summary": "no change"}"""

# ---------------------------------------------------------------------------


def call_qwen(system: str, user: str, json_mode: bool = True, max_tokens: int = 3500) -> str:
    body = {
        "model": MODEL,
        "temperature": 0,
        "max_tokens": max_tokens,
        "messages": [
            {"role": "system", "content": system},
            {"role": "user", "content": user},
        ],
    }
    if json_mode:
        body["response_format"] = {"type": "json_object"}
    with httpx.Client(timeout=120) as c:
        r = c.post(
            IONROUTER_URL,
            headers={"Authorization": f"Bearer {KEY}", "Content-Type": "application/json"},
            json=body,
        )
    if r.status_code >= 400:
        raise httpx.HTTPStatusError(
            f"{r.status_code} from IonRouter: {r.text[:500]}",
            request=r.request, response=r
        )
    return r.json()["choices"][0]["message"]["content"]


def apply_edits(doc: str, edits: list[dict]) -> tuple[str, int]:
    """Apply edit ops in order. Returns (new_doc, n_applied)."""
    out = doc
    applied = 0
    for e in edits:
        op = e.get("op")
        try:
            if op == "append":
                out = out.rstrip() + "\n\n" + e["content"].strip() + "\n"
                applied += 1
            elif op == "replace_text":
                find = e["find"]
                replace = e["replace"]
                if find and find in out:
                    out = out.replace(find, replace, 1)
                    applied += 1
            elif op == "replace_section":
                header = e["header"].rstrip()
                new_body = e["new_body"].rstrip()
                # match the header line then everything up to next `## ` header (or EOF)
                pat = re.compile(
                    rf"({re.escape(header)}\n)(.*?)(?=\n## |\n# |\Z)",
                    re.DOTALL,
                )
                m = pat.search(out)
                if m:
                    out = out[:m.start()] + m.group(1) + "\n" + new_body + "\n" + out[m.end():]
                    applied += 1
            elif op == "insert_after_header":
                header = e["header"].rstrip()
                content = e["content"].strip()
                idx = out.find(header)
                if idx >= 0:
                    end_of_line = out.find("\n", idx)
                    if end_of_line >= 0:
                        out = out[:end_of_line + 1] + "\n" + content + "\n" + out[end_of_line + 1:]
                        applied += 1
        except (KeyError, TypeError, re.error):
            continue
    return out, applied


def fetch_web_context(urls_file: Path) -> str:
    """Pre-fetch URLs listed in the .urls.txt file once. Return concatenated text."""
    if not urls_file.exists():
        return ""
    chunks = []
    with httpx.Client(timeout=30, follow_redirects=True) as c:
        for line in urls_file.read_text().splitlines():
            url = line.strip()
            if not url or url.startswith("#"):
                continue
            try:
                r = c.get(url, headers={"User-Agent": "Thedi/0.1 RALF"})
                text = re.sub(r"<script[\s\S]*?</script>", "", r.text, flags=re.I)
                text = re.sub(r"<style[\s\S]*?</style>", "", text, flags=re.I)
                text = re.sub(r"<[^>]+>", " ", text)
                text = re.sub(r"\s+", " ", text).strip()
                chunks.append(f"=== {url} ===\n{text[:4000]}")
            except Exception as e:
                chunks.append(f"=== {url} === FAILED: {e}")
    return "\n\n".join(chunks)


def critic_call(lens: str, doc: str, web: str) -> dict:
    user = f"""CURRENT DOC:
---
{doc}
---

WEB CONTEXT (live-fetched pages, truncated):
---
{web[:20000] if web else '(no live content)'}
---

{CRITIC_JSON_SCHEMA_HINT}"""
    raw = call_qwen(lens, user, json_mode=True, max_tokens=3500)
    try:
        return json.loads(raw)
    except json.JSONDecodeError:
        return {"additions": [], "rewrites": [], "flags": [], "summary": "parse error"}


def judge_call(doc: str, proposals: list[dict]) -> dict:
    # Truncate doc and proposals for the judge's context; it only needs the shape.
    doc_trunc = doc if len(doc) < 15000 else doc[:15000] + "\n...[truncated]..."
    props_trunc = json.dumps(proposals, indent=1)
    if len(props_trunc) > 8000:
        props_trunc = props_trunc[:8000] + "\n...[truncated]..."
    user = f"""CURRENT DOC:
---
{doc_trunc}
---

5 PROPOSALS (JSON):
---
{props_trunc}
---

Emit the edit ops per the system instructions. Be specific with exact header strings and find-text."""
    raw = call_qwen(JUDGE_SYSTEM, user, json_mode=True, max_tokens=3500)
    try:
        return json.loads(raw)
    except json.JSONDecodeError as e:
        print(f"  [judge] parse error: {e}", file=sys.stderr)
        return {"edits": [], "change_summary": "judge parse error"}


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("doc", type=Path, help="Path to markdown doc to refine")
    ap.add_argument("--max-iters", type=int, default=20)
    ap.add_argument("--min-delta", type=int, default=60,
                    help="Min char-delta to count as a real change")
    args = ap.parse_args()

    doc_path: Path = args.doc.resolve()
    if not doc_path.exists():
        print(f"doc not found: {doc_path}", file=sys.stderr)
        sys.exit(1)

    ralf_dir = ROOT / "docs" / "ralf" / doc_path.stem
    ralf_dir.mkdir(parents=True, exist_ok=True)

    urls_file = doc_path.parent / f"{doc_path.stem}.urls.txt"
    print(f"▶ RALF loop on {doc_path.relative_to(ROOT)}")
    print(f"  max-iters={args.max_iters}")
    print(f"  out-dir={ralf_dir.relative_to(ROOT)}")
    print(f"  urls-file={urls_file.relative_to(ROOT) if urls_file.exists() else '(none)'}")

    web = fetch_web_context(urls_file) if urls_file.exists() else ""
    if web:
        print(f"  pre-fetched web context: {len(web)} chars")

    doc = doc_path.read_text()
    consecutive_noops = 0

    for i in range(1, args.max_iters + 1):
        t0 = time.time()
        print(f"\n━━━ iter {i:02d}/{args.max_iters} ━━━")

        # 5 parallel critics
        proposals = []
        with concurrent.futures.ThreadPoolExecutor(max_workers=5) as pool:
            futures = [pool.submit(critic_call, lens, doc, web) for lens in LENSES]
            for idx, fut in enumerate(futures, 1):
                try:
                    p = fut.result()
                    n_adds = len(p.get("additions", []))
                    n_rewrites = len(p.get("rewrites", []))
                    n_flags = len(p.get("flags", []))
                    print(f"  critic {idx}: +{n_adds} ~{n_rewrites} !{n_flags} — {p.get('summary','')[:80]}")
                    proposals.append(p)
                except Exception as e:
                    print(f"  critic {idx} FAILED: {e}")
                    proposals.append({"additions": [], "rewrites": [], "flags": [], "summary": f"error: {e}"})

        # judge emits edit ops; Python applies them
        result = judge_call(doc, proposals)
        edits = result.get("edits", [])
        new_doc, n_applied = apply_edits(doc, edits)
        delta = abs(len(new_doc) - len(doc))
        print(f"  judge: {len(edits)} ops proposed, {n_applied} applied")

        diff = "\n".join(difflib.unified_diff(
            doc.splitlines(), new_doc.splitlines(),
            fromfile=f"iter-{i-1:02d}", tofile=f"iter-{i:02d}", lineterm=""
        ))
        (ralf_dir / f"iter-{i:02d}.diff").write_text(diff)
        (ralf_dir / f"iter-{i:02d}.summary.txt").write_text(
            result.get("change_summary", "") + "\n\nPROPOSALS:\n" + json.dumps(proposals, indent=2)
        )

        ms = int((time.time() - t0) * 1000)
        print(f"  summary: Δ{delta:+d} chars in {ms}ms — {result.get('change_summary','')[:120]}")

        if delta < args.min_delta:
            consecutive_noops += 1
            print(f"  (no-op #{consecutive_noops})")
            if consecutive_noops >= 2:
                print(f"  ✓ converged at iter {i}")
                break
        else:
            consecutive_noops = 0
            doc = new_doc
            doc_path.write_text(doc)

    print(f"\n✓ done — final doc: {doc_path}")
    print(f"  changelogs: {ralf_dir}")


if __name__ == "__main__":
    main()
