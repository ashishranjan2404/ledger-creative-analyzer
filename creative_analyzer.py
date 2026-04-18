"""
Ledger creative analyzer — VLM-backed feature extraction for ad creatives.

POST /analyze_creative with { creative_id, source_url, media_type, platform }.
Returns structured Ledger CreativeFeature JSON + freeform tags + confidence.

See README.md for the full contract.
"""

import os
import json
import subprocess
import tempfile
import time
import base64
from pathlib import Path

import httpx
from fastapi import FastAPI, HTTPException
from pydantic import BaseModel
from bs4 import BeautifulSoup
from openai import OpenAI

# ---------------------------------------------------------------------------
# Cumulus / IonRouter config.
# Model ID + base_url verification IN PROGRESS — see README "Pending verification".
# Update CUMULUS_MODEL once the exact API ID lands.
# ---------------------------------------------------------------------------
CUMULUS_BASE_URL = os.environ.get("IONROUTER_BASE_URL", "https://api.ionrouter.io/v1")
CUMULUS_MODEL = os.environ.get("CUMULUS_MODEL", "qwen3.5-122b-a10b")

ion = OpenAI(base_url=CUMULUS_BASE_URL, api_key=os.environ["IONROUTER_KEY"])

app = FastAPI(title="Ledger Creative Analyzer", version="0.1.0")
CACHE = Path("./creative_cache")
CACHE.mkdir(exist_ok=True)


class AnalyzeRequest(BaseModel):
    creative_id: str
    source_url: str
    media_type: str   # "image" | "video" | "landing_page"
    platform: str     # "meta" | "google" | "tiktok"


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


def call_vlm(image_url: str, extra_text: str = "") -> dict:
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
        temperature=0.1,
        response_format={"type": "json_object"},
    )
    return json.loads(resp.choices[0].message.content)


@app.post("/analyze_creative")
def analyze_creative(req: AnalyzeRequest):
    cache_file = CACHE / f"{req.creative_id}.json"
    if cache_file.exists():
        return json.loads(cache_file.read_text())

    t0 = time.time()
    try:
        image_url, extra_text = resolve_to_image_and_text(req.source_url, req.media_type)
        if not image_url:
            raise HTTPException(422, f"Could not resolve media from {req.source_url}")

        vlm_out = call_vlm(image_url, extra_text)
        result = {
            "creative_id": req.creative_id,
            "structured": vlm_out.get("structured", {}),
            "hook_copy": vlm_out.get("hook_copy"),
            "description": vlm_out.get("description", ""),
            "discovered_tags": vlm_out.get("discovered_tags", []),
            "confidence": vlm_out.get("confidence", 0.5),
            "debug": {
                "processing_ms": int((time.time() - t0) * 1000),
                "media_type": req.media_type,
                "platform": req.platform,
                "model": CUMULUS_MODEL,
            },
        }
        cache_file.write_text(json.dumps(result, indent=2))
        return result

    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(500, f"Analysis failed: {e}")


# ---------------------------------------------------------------------------
# Brief generator — Seedance video briefs (Sissi's module)
# ---------------------------------------------------------------------------

from brief_generator import generate_brief


class BriefRequest(BaseModel):
    brief_id: str
    merchant_name: str
    insights: list[dict]
    duration_target_sec: int = 60
    voice: str = "confident_female"


@app.post("/generate_brief")
def generate_brief_endpoint(req: BriefRequest):
    """Generate a ~60s morning brief video: intro + per-insight Seedance visuals + TTS."""
    try:
        result = generate_brief(
            brief_id=req.brief_id,
            merchant_name=req.merchant_name,
            insights=req.insights,
            duration_target_sec=req.duration_target_sec,
            voice=req.voice,
        )
        return result
    except FileNotFoundError as e:
        raise HTTPException(422, str(e))
    except Exception as e:
        raise HTTPException(500, f"Brief generation failed: {e}")


@app.get("/health")
def health():
    return {"ok": True, "model": CUMULUS_MODEL, "base_url": CUMULUS_BASE_URL}
