"""
Ledger chat API client — wraps Alex's GraphRAG chat endpoint.

The endpoint is an LLM-backed "chat with the graph" service. It accepts a
free-form query via `content=<URL-encoded-text>` and returns inference-style
markdown (sometimes with embedded JSON blocks) derived from the Neo4j graph.

Two public functions:
  - get_insights_for_creative(creative_id, n)  → list[dict] of {text, evidence}
        Asks Alex for structured insights; parses JSON out of the response,
        falling back to markdown-bullet extraction if needed.
  - get_raw_inference(query)  → str
        Pass-through. Returns whatever markdown/text Alex's API sent back.
        Use when you want to feed the whole inference into TTS or a prompt.

No auth required — endpoint is internal-network (45.78.200.9:7070).

Env vars (optional):
  LEDGER_CHAT_URL  — override the base URL. Default: the hackathon IP.
"""

import json
import os
import re
import urllib.parse
from typing import Optional

import httpx

# Default: hackathon's internal GraphRAG service. Override via LEDGER_CHAT_URL if it moves.
_DEFAULT_URL = (
    "http://45.78.200.9:7070/api/chat/stream/v5"
    "?content={content}&graphRag=true&neoBrain=false&sreBrain=false"
)
LEDGER_CHAT_URL_TEMPLATE = os.environ.get("LEDGER_CHAT_URL", _DEFAULT_URL)


def _call(query: str, timeout_s: int = 60) -> str:
    """Raw GET to Alex's chat endpoint. Returns the response body as text."""
    encoded = urllib.parse.quote(query)
    url = LEDGER_CHAT_URL_TEMPLATE.replace("{content}", encoded)
    with httpx.stream("GET", url, timeout=timeout_s) as resp:
        resp.raise_for_status()
        chunks = []
        for chunk in resp.iter_text():
            chunks.append(chunk)
    return "".join(chunks).strip()


def get_raw_inference(query: str = "y") -> str:
    """Pass-through. Returns the raw markdown/text the chat API emitted.
    Default query 'y' hits the default "everything" behaviour."""
    return _call(query)


def _extract_json_array(text: str) -> Optional[list]:
    """Find the first top-level JSON array in a block of text. Handles both
    pure-JSON responses and JSON embedded inside markdown (```json ... ```)."""
    # 1. Whole text is JSON (our structured-query path)
    stripped = text.strip()
    if stripped.startswith("["):
        try:
            return json.loads(stripped)
        except json.JSONDecodeError:
            pass

    # 2. JSON inside a ```json ... ``` fence
    fence = re.search(r"```(?:json)?\s*(\[.*?\])\s*```", text, re.DOTALL)
    if fence:
        try:
            return json.loads(fence.group(1))
        except json.JSONDecodeError:
            pass

    # 3. First standalone [ ... ] block in the text
    bracket = re.search(r"(\[\s*\{.*?\}\s*\])", text, re.DOTALL)
    if bracket:
        try:
            return json.loads(bracket.group(1))
        except json.JSONDecodeError:
            pass

    return None


def _parse_markdown_bullets(text: str, n: int) -> list[dict]:
    """Fallback: scrape numbered bullets out of Alex's markdown reply.

    Looks for patterns like:
        1. **Headline** - sentence
        **1.** Headline - sentence
        - bullet text
    Returns up to n dicts shaped {text, evidence}. 'evidence' is empty when
    we can't isolate a metric line."""
    # Numbered bold headers like:  1. **Headline**
    numbered = re.findall(
        r"(?m)^\s*(?:\*{0,2})?(\d+)[\.\)]\s*\*{0,2}([^*\n]+?)\*{0,2}\s*(?:[—\-:]\s*(.+))?$",
        text,
    )
    if numbered:
        out = []
        for _, headline, rest in numbered[:n]:
            headline = headline.strip()
            evidence = (rest or "").strip()
            out.append({"text": headline, "evidence": evidence})
        if out:
            return out

    # Plain dash/bullet lines
    bullets = re.findall(r"(?m)^\s*[-•]\s+(.+)$", text)
    if bullets:
        return [{"text": b.strip(), "evidence": ""} for b in bullets[:n]]

    # Last resort: hand back the whole response as one insight
    return [{"text": text.strip()[:240], "evidence": ""}]


def get_insights_for_creative(
    creative_id: str,
    n: int = 4,
    custom_query: Optional[str] = None,
) -> list[dict]:
    """Fetch up to N insights for a creative from Alex's GraphRAG chat.

    Returns a list of {text, evidence} dicts — shape compatible with Sissi's
    brief_generator.generate_brief(insights=[...]).

    Parsing strategy (robust):
      1. Ask for JSON-only response.
      2. Try to extract a JSON array from the reply.
      3. Fall back to scraping numbered markdown bullets.
      4. Fall back to returning the whole response as one insight.
    """
    query = custom_query or (
        f"For creative_id={creative_id} return the top {n} most actionable "
        f"insights as a pure JSON array. Each element must be "
        f'{{"text": "<one declarative sentence, max 20 words, suitable for TTS narration>", '
        f'"evidence": "<short supporting metric or rationale>"}}. '
        f"Return ONLY valid JSON. No markdown fences, no preamble."
    )

    raw = _call(query)

    parsed = _extract_json_array(raw)
    if parsed and isinstance(parsed, list):
        cleaned: list[dict] = []
        for item in parsed[:n]:
            if isinstance(item, dict) and "text" in item:
                cleaned.append({
                    "text": str(item.get("text", "")).strip(),
                    "evidence": str(item.get("evidence", "")).strip(),
                })
        if cleaned:
            return cleaned

    return _parse_markdown_bullets(raw, n)
