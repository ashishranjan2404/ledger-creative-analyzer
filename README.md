# Ledger — Creative Analyzer

VLM-backed feature extraction service for the Ledger DTC attribution demo (MultiModel Hackathon, 2026-04-18).

Given an ad creative (image, video, or landing page URL), it returns the structured `CreativeFeature` JSON that maps directly to the Ledger Neo4j schema, plus freeform tags and confidence.

Backed by **Cumulus / IonRouter** with the **Qwen3.5-122B-A10B** vision-language model.

---

## The contract

### Request — `POST /analyze_creative`

```json
{
  "creative_id": "cr_042",
  "source_url": "https://example.com/ad.jpg",
  "media_type": "image",
  "platform": "meta"
}
```

| Field | Type | Allowed values |
|---|---|---|
| `creative_id` | string | Stable ID — used as cache key. |
| `source_url` | string | Direct URL to the asset, OR a landing-page URL. |
| `media_type` | string | `image` \| `video` \| `landing_page` |
| `platform` | string | `meta` \| `google` \| `tiktok` |

### Response — `200 OK`

```json
{
  "creative_id": "cr_042",
  "structured": {
    "angle": "testimonial",
    "subject": "ugc",
    "person": "f_30s_confident",
    "background": "lifestyle_home",
    "hook_type": "testimonial",
    "offer": "discount_shown",
    "color_dominant": "warm_yellow",
    "format": "image"
  },
  "hook_copy": "I lost 15 lbs in 3 weeks",
  "description": "A woman in her 30s holds the product in a sunlit kitchen, smiling at camera.",
  "discovered_tags": ["UGC-style", "sunlit", "kitchen", "before-after-implied"],
  "confidence": 0.87,
  "debug": { "processing_ms": 2143, "media_type": "image", "platform": "meta", "model": "qwen3.5-122b-a10b" }
}
```

The `structured` block conforms exactly to the Ledger `CreativeFeature` taxonomy — Alex maps each key/value pair straight to a `(:Creative)-[:HAS_FEATURE]->(:CreativeFeature {type, value})` edge in Neo4j.

### Errors

- `422` — couldn't resolve media from `source_url` (e.g. landing page had no `og:image`).
- `500` — VLM call failed or returned malformed JSON.

---

## Run locally

```bash
pip install -r requirements.txt
cp .env.example .env  # then paste your IONROUTER_KEY
export $(cat .env | xargs)
uvicorn creative_analyzer:app --port 8001 --reload
```

Smoke test:

```bash
curl -X POST http://localhost:8001/analyze_creative \
  -H 'Content-Type: application/json' \
  -d '{
    "creative_id": "cr_test",
    "source_url": "https://example.com/ad.jpg",
    "media_type": "image",
    "platform": "meta"
  }'
```

Health: `GET /health` → returns the active model + base URL.

---

## Production URL

Once wired through Butterbase: **`https://ledger.butterbase.dev/analyze_creative`** (same contract).

---

## Cache

Every successful response writes to `./creative_cache/<creative_id>.json`. Subsequent requests with the same `creative_id` hit the cache and skip the VLM. **Pre-warm the cache before the demo** by running every demo creative through once during dev — this is the demo safety net if Wi-Fi dies.

---

## Three real-world gotchas

1. **Meta / TikTok page URLs aren't media URLs.** They're player pages. For the demo, either stage direct image URLs (the og:image of the player page often works) OR use `media_type: "landing_page"` and let the scraper pull the og:image automatically.
2. **Video mode needs `ffmpeg` installed locally** (`brew install ffmpeg` on macOS). If it's missing, fall back to `landing_page` mode for that asset.
3. **The cache is the demo safety net.** Pre-warm every demo creative.

---

## IonRouter spec — verified 2026-04-18

| Field | Value |
|---|---|
| `base_url` | `https://api.ionrouter.io/v1` (`/v1/chat/completions` for chat) |
| `model` | `qwen3.5-122b-a10b` (lowercase, dotted — matches docs + live `/v1/models`) |
| Auth | `Authorization: Bearer sk-...` — standard OpenAI SDK works |
| Vision | YES — standard OpenAI `image_url` content block |
| Pricing | $0.20 / 1M input tokens, $1.60 / 1M output tokens, ~120 tok/s |

**Gotcha:** Cumulus runs three separate base URLs — `api.ionrouter.io/v1` (default fleet, where this model lives), `kimi.ionrouter.io/v1` (Kimi only), `minimax.ionrouter.io/v1` (MiniMax only). If you hit the wrong endpoint with `qwen3.5-122b-a10b`, it 404s.

**Known risk:** `response_format={"type": "json_object"}` is **undocumented** in IonRouter's API reference. Their OpenAI-compat claim suggests it likely passes through to the underlying runtime, but this is not guaranteed. If your first smoke test errors with an "unknown parameter" message, drop the `response_format` arg and rely on the prompt to enforce JSON shape (the prompt already ends with "Return ONLY valid JSON" + an exact shape spec, so this should still work).

---

## Owners

- **Service:** Ashish (`@ashishranjan2404`)
- **Consumer / Neo4j integration:** Sissi (`@sissississi-013`)

Open a PR or ping in iMessage if the contract needs to flex.
