"""
Ledger creative analyzer — async trigger service.

POST /analyze_creative { creative_id, source_url, media_type, platform, n_samples? }
  → returns 202 Accepted + job_id immediately.
  → background pipeline:
       resolve media → MAKER voting (n=5 default) → Neo4j write → job complete.
  → every stage writes progress to the Butterbase `jobs` table so callers can
    poll GET /jobs/{job_id} or watch the realtime dashboard.

GET /jobs/{job_id} — poll job state (status, current_step, features, vote_log).
POST /generate_brief — synchronous brief video generation (Sissi's module).
GET /health — model + service metadata.

See README.md for the response contract.
"""

import base64
import json
import os
import subprocess
import sys
import tempfile
import time
from collections import Counter
from concurrent.futures import ThreadPoolExecutor, as_completed
from pathlib import Path
from typing import Optional

import httpx
from bs4 import BeautifulSoup
from fastapi import BackgroundTasks, FastAPI, HTTPException
from openai import OpenAI
from pydantic import BaseModel

# ledger-delivery/ is sibling to this file; add to path so we can import the
# Butterbase + Neo4j helpers without turning it into a package (hyphen blocks that).
_HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(_HERE / "ledger-delivery"))

from butterbase_client import (  # noqa: E402
    complete_job,
    create_job,
    fail_job,
    get_job,
    update_job,
)

# ---------------------------------------------------------------------------
# Cumulus / IonRouter config.
# ---------------------------------------------------------------------------
CUMULUS_BASE_URL = os.environ.get("IONROUTER_BASE_URL", "https://api.ionrouter.io/v1")
CUMULUS_MODEL = os.environ.get("CUMULUS_MODEL", "qwen3.5-122b-a10b")

ion = OpenAI(base_url=CUMULUS_BASE_URL, api_key=os.environ["IONROUTER_KEY"])

app = FastAPI(title="Ledger Creative Analyzer", version="0.2.0")

# 8 structured keys that MAKER voting decides on. Order is stable for the vote_log.
STRUCTURED_KEYS = [
    "angle", "subject", "person", "background",
    "hook_type", "offer", "color_dominant", "format",
]


class AnalyzeRequest(BaseModel):
    creative_id: str
    source_url: str
    media_type: str   # "image" | "video" | "landing_page"
    platform: str     # "meta" | "google" | "tiktok"
    n_samples: int = 5   # MAKER voting sample count; 1 = no voting, ≥3 = real vote


EXTRACTION_PROMPT = """You are analyzing a DTC ecommerce ad creative. Return ONLY valid JSON.

Extract two parts:

PART 1 — STRUCTURED (must use exactly these keys and allowed values):
{
  "angle": one of ["product_showcase","testimonial","demonstration","before_after","aspirational","social_proof","problem_solution","comparison"],
  "subject": one of ["product_only","product_with_person","lifestyle","ugc","founder"],
  "person": null OR "{gender}_{age}_{emotion}" where gender in f|m|nb, age in 20s|30s|40s|50s+, emotion in happy|confident|surprised|neutral|concerned,
  "background": one of ["white_studio","lifestyle_home","outdoor","abstract","branded","other"],
  "hook_type": null OR one of ["question","stat","testimonial","command"],
  "offer": one of ["price_shown","discount_shown","free_shipping","bundle","none"],
  "color_dominant": one of ["warm_yellow","cool_blue","neutral_earth","high_contrast","monochrome"],
  "format": one of ["image","video_6s","video_15s","video_30s","carousel","gif"]
}

PART 2 — FREEFORM:
- hook_copy: main text/headline visible (string or null)
- description: 1-2 sentence plain-English description
- discovered_tags: 4-8 short descriptive tags unique to this ad
- confidence: 0.0-1.0

Return EXACT shape: {"structured": {...}, "hook_copy": "...", "description": "...", "discovered_tags": [...], "confidence": 0.87}"""


# ---------------------------------------------------------------------------
# Media resolution
# ---------------------------------------------------------------------------

def resolve_to_image_and_text(source_url: str, media_type: str) -> tuple[str, str]:
    """Given an ad URL, return (image_url_to_analyze, extra_text)."""
    if media_type == "image":
        return source_url, ""

    if media_type == "landing_page":
        html = httpx.get(
            source_url,
            timeout=15,
            follow_redirects=True,
            headers={"User-Agent": "Mozilla/5.0"},
        ).text
        soup = BeautifulSoup(html, "html.parser")
        og_img = soup.find("meta", property="og:image")
        img_url = og_img["content"] if og_img else ""
        title = soup.find("title").text if soup.find("title") else ""
        h1 = soup.find("h1").text if soup.find("h1") else ""
        desc_meta = soup.find("meta", attrs={"name": "description"})
        desc_text = desc_meta["content"] if desc_meta else ""
        extra = f"Title: {title}\nHeadline: {h1}\nDescription: {desc_text}"[:1000]
        return img_url, extra

    if media_type == "video":
        with tempfile.NamedTemporaryFile(suffix=".jpg", delete=False) as tmp:
            frame_path = tmp.name
        subprocess.run(
            [
                "ffmpeg", "-y", "-i", source_url,
                "-ss", "00:00:01", "-vframes", "1", "-q:v", "2", frame_path,
            ],
            check=True, capture_output=True, timeout=30,
        )
        b64 = base64.b64encode(Path(frame_path).read_bytes()).decode()
        return f"data:image/jpeg;base64,{b64}", ""

    raise ValueError(f"Unknown media_type: {media_type}")


# ---------------------------------------------------------------------------
# VLM call (single + parallel)
# ---------------------------------------------------------------------------

def call_vlm(image_url: str, extra_text: str = "", temperature: float = 0.3) -> dict:
    """One VLM call against Qwen3.5-122B. Temperature 0.3 gives enough variance
    for MAKER decorrelation without losing signal on the finite label space."""
    prompt = EXTRACTION_PROMPT + (
        f"\n\nAdditional scraped text:\n{extra_text}" if extra_text else ""
    )
    content = [
        {"type": "image_url", "image_url": {"url": image_url}},
        {"type": "text", "text": prompt},
    ]
    resp = ion.chat.completions.create(
        model=CUMULUS_MODEL,
        messages=[{"role": "user", "content": content}],
        temperature=temperature,
        response_format={"type": "json_object"},
    )
    return json.loads(resp.choices[0].message.content)


def call_vlm_parallel(image_url: str, extra_text: str, n: int, timeout_s: int = 60) -> list[dict]:
    """Fire n VLM calls in parallel via a thread pool.
    Sync OpenAI client is I/O-bound, so threads give genuine parallelism.
    Parse failures are dropped silently (MAKER paper's no-retry, no-repair rule)."""
    if n <= 1:
        return [call_vlm(image_url, extra_text, 0.3)]

    samples: list[dict] = []
    with ThreadPoolExecutor(max_workers=n) as pool:
        futures = [pool.submit(call_vlm, image_url, extra_text, 0.3) for _ in range(n)]
        for f in as_completed(futures, timeout=timeout_s + 10):
            try:
                samples.append(f.result(timeout=timeout_s))
            except Exception as exc:
                print(f"[vlm] sample dropped: {type(exc).__name__}: {exc}", flush=True)
    return samples


# ---------------------------------------------------------------------------
# MAKER voting
# ---------------------------------------------------------------------------

def maker_vote(samples: list[dict]) -> tuple[dict, dict, dict]:
    """Per-field majority across samples. Tiebreak: highest-confidence sample.
    Returns (voted_structured, winner_sample, vote_log)."""
    valid = [s for s in samples if isinstance(s.get("structured"), dict)]
    if not valid:
        raise RuntimeError("All samples failed to produce valid structured output")

    sorted_by_conf = sorted(valid, key=lambda s: -s.get("confidence", 0))

    voted: dict = {}
    field_vote_counts: dict = {}
    disagreement: list[str] = []

    for key in STRUCTURED_KEYS:
        values = [
            s["structured"].get(key)
            for s in valid
            if s["structured"].get(key) is not None
        ]
        counter = Counter(values)
        if not counter:
            voted[key] = None
            continue
        top_count = counter.most_common(1)[0][1]
        winners = [v for v, c in counter.items() if c == top_count]
        if len(winners) == 1:
            voted[key] = winners[0]
        else:
            # Tie — pick value from highest-confidence sample that holds a tied value.
            for s in sorted_by_conf:
                if s["structured"].get(key) in winners:
                    voted[key] = s["structured"].get(key)
                    break
        if len(set(values)) > 1:
            disagreement.append(key)
            field_vote_counts[key] = dict(counter)

    # Winner sample: highest count of structured fields matching the voted result.
    match_counts = [
        sum(1 for k in STRUCTURED_KEYS if s["structured"].get(k) == voted.get(k))
        for s in valid
    ]
    best_index = match_counts.index(max(match_counts))
    winner = valid[best_index]

    vote_log = {
        "n_samples": len(samples),
        "n_succeeded": len(valid),
        "fields_with_disagreement": disagreement,
        "field_vote_counts": field_vote_counts,
        "winner_sample_index": best_index,
        "per_sample_confidence": [s.get("confidence") for s in valid],
    }
    return voted, winner, vote_log


# ---------------------------------------------------------------------------
# Background pipeline — the full async flow after 202 Accepted returns
# ---------------------------------------------------------------------------

def _best_effort_neo4j(creative_id: str, voted: dict, winner: dict, avg_conf: float) -> Optional[str]:
    """Write the Creative + CreativeFeature edges. Returns error string on failure, None on success."""
    try:
        from neo4j_writer import write_creative
        write_creative(
            creative_id=creative_id,
            structured=voted,
            hook_copy=winner.get("hook_copy"),
            description=winner.get("description"),
            confidence=avg_conf,
            discovered_tags=winner.get("discovered_tags"),
        )
        return None
    except Exception as exc:
        return f"{type(exc).__name__}: {exc}"


def run_pipeline(job_id: str, req: AnalyzeRequest) -> None:
    """Full async pipeline — runs after /analyze_creative returns 202."""
    t0 = time.time()
    try:
        # Stage 1 — resolve media to a URL/data-URI the VLM can see
        update_job(job_id, current_step="resolving_media")
        image_url, extra_text = resolve_to_image_and_text(req.source_url, req.media_type)
        if not image_url:
            raise RuntimeError(f"Could not resolve media from {req.source_url}")

        # Stage 2 — MAKER voting
        update_job(job_id, current_step=f"voting_n{req.n_samples}")
        samples = call_vlm_parallel(image_url, extra_text, req.n_samples)
        if not samples:
            raise RuntimeError("All VLM samples failed")

        voted, winner, vote_log = maker_vote(samples)
        avg_conf = (
            sum(s.get("confidence", 0) for s in samples) / len(samples)
            if samples else 0.0
        )

        update_job(
            job_id,
            current_step="neo4j_writing",
            features=voted,
            vote_log=vote_log,
            confidence=avg_conf,
            hook_copy=winner.get("hook_copy"),
            description=winner.get("description"),
            discovered_tags=winner.get("discovered_tags"),
        )

        # Stage 3 — Neo4j write (best-effort; Ashish owns wiring, this is the helper)
        neo4j_err = _best_effort_neo4j(req.creative_id, voted, winner, avg_conf)

        # Stage 4 — complete. Server-side log of the raw samples (vote_log has counts,
        # raw samples go to stdout for post-demo analysis).
        print(f"[pipeline] {req.creative_id} raw samples:\n{json.dumps(samples, indent=2)}", flush=True)

        completion_fields = {}
        if neo4j_err:
            completion_fields["error"] = f"Neo4j write skipped: {neo4j_err}"
        complete_job(job_id, **completion_fields)

        print(
            f"[pipeline] {req.creative_id} done in {time.time() - t0:.1f}s "
            f"(n={len(samples)}/{req.n_samples}, "
            f"disagreement={vote_log['fields_with_disagreement']})",
            flush=True,
        )

    except Exception as exc:
        err = f"{type(exc).__name__}: {exc}"
        print(f"[pipeline] {req.creative_id} FAILED: {err}", flush=True)
        try:
            fail_job(job_id, error=err[:1000], current_step="error")
        except Exception as log_exc:
            print(f"[pipeline] also failed to mark job failed: {log_exc}", flush=True)


# ---------------------------------------------------------------------------
# Routes
# ---------------------------------------------------------------------------

@app.post("/analyze_creative", status_code=202)
def analyze_creative(req: AnalyzeRequest, background_tasks: BackgroundTasks) -> dict:
    """Async trigger. Creates a job, returns 202 immediately, runs pipeline in background."""
    job = create_job(
        creative_id=req.creative_id,
        platform=req.platform,
        media_type=req.media_type,
        source_url=req.source_url,
        status="in_progress",
        current_step="queued",
    )
    background_tasks.add_task(run_pipeline, job["id"], req)
    return {
        "creative_id": req.creative_id,
        "job_id": job["id"],
        "status": "accepted",
    }


@app.get("/jobs/{job_id}")
def get_job_status(job_id: str) -> dict:
    """Poll a job's current state — status, current_step, features, vote_log."""
    try:
        return get_job(job_id)
    except httpx.HTTPStatusError as exc:
        if exc.response.status_code == 404:
            raise HTTPException(404, f"Job {job_id} not found") from exc
        raise HTTPException(502, f"Butterbase lookup failed: {exc}") from exc


# ---------------------------------------------------------------------------
# Brief generator — Seedance video briefs (Sissi's module)
# ---------------------------------------------------------------------------

from brief_generator import generate_brief  # noqa: E402


class BriefRequest(BaseModel):
    brief_id: str
    merchant_name: str
    insights: list[dict]
    duration_target_sec: int = 60
    voice: str = "confident_female"


@app.post("/generate_brief")
def generate_brief_endpoint(req: BriefRequest) -> dict:
    """Generate a ~60s morning brief video: intro + per-insight Seedance visuals + TTS."""
    try:
        return generate_brief(
            brief_id=req.brief_id,
            merchant_name=req.merchant_name,
            insights=req.insights,
            duration_target_sec=req.duration_target_sec,
            voice=req.voice,
        )
    except FileNotFoundError as exc:
        raise HTTPException(422, str(exc)) from exc
    except Exception as exc:
        raise HTTPException(500, f"Brief generation failed: {exc}") from exc


@app.get("/health")
def health() -> dict:
    return {
        "ok": True,
        "version": "0.2.0",
        "model": CUMULUS_MODEL,
        "base_url": CUMULUS_BASE_URL,
        "voting_default_n": 5,
    }
