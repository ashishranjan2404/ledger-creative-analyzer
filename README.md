# Ledger — Creative Analyzer

Async trigger service for the Ledger DTC attribution demo (MultiModel Hackathon, 2026-04-18).

Given an ad creative (image, video, or landing page URL), it kicks off a background pipeline that runs **MAKER voting** (n=5 parallel VLM samples, per-field majority) against Qwen3.5-122B via **Cumulus / IonRouter**, writes the voted `CreativeFeature` set to **Neo4j**, and tracks every stage in the **Butterbase `jobs`** table.

Callers get a `job_id` immediately and either poll `GET /jobs/{job_id}` or watch Butterbase realtime.

---

## The contract

### Trigger — `POST /analyze_creative`

```json
{
  "creative_id": "cr_042",
  "source_url": "https://example.com/ad.jpg",
  "media_type": "image",
  "platform": "meta",
  "n_samples": 5
}
```

| Field | Type | Notes |
|---|---|---|
| `creative_id` | string | Stable correlation key — joined against Neo4j / jobs rows downstream. |
| `source_url` | string | Direct URL to the asset, OR a landing-page URL. |
| `media_type` | string | `image` \| `video` \| `landing_page` |
| `platform` | string | `meta` \| `google` \| `tiktok` |
| `n_samples` | int | Optional. MAKER voting sample count. Default **5**. Minimum useful `3`. `1` = no voting (trivial 1-of-1 pass). |

### Response — `202 Accepted` (immediate)

```json
{
  "creative_id": "cr_042",
  "job_id": "a9575618-a85b-4e8e-9bf1-979e7e7ef33c",
  "status": "accepted"
}
```

The 202 means the job was queued, not that analysis succeeded. The rich structured output (features, vote_log, confidence, hook_copy, tags) lands in:

1. The **Butterbase `jobs`** row (queryable via `GET /jobs/{job_id}` or the auto-REST API).
2. **Neo4j** as `(:Creative {id: creative_id})-[:HAS_FEATURE]->(:CreativeFeature {type, value})` edges — one per non-null structured key.

### Poll — `GET /jobs/{job_id}`

```json
{
  "id": "a9575618-...",
  "creative_id": "cr_042",
  "status": "completed",
  "current_step": "neo4j_writing",
  "features": {
    "angle": "testimonial", "subject": "ugc", "person": "f_30s_confident",
    "background": "lifestyle_home", "hook_type": "testimonial",
    "offer": "discount_shown", "color_dominant": "warm_yellow", "format": "image"
  },
  "vote_log": {
    "n_samples": 5,
    "n_succeeded": 5,
    "fields_with_disagreement": ["angle", "person"],
    "field_vote_counts": {
      "angle": {"testimonial": 4, "ugc": 1},
      "person": {"f_30s_confident": 4, "f_30s_happy": 1}
    },
    "winner_sample_index": 0,
    "per_sample_confidence": [0.89, 0.84, 0.91, 0.78, 0.87]
  },
  "confidence": 0.86,
  "hook_copy": "I lost 15 lbs in 3 weeks",
  "description": "A woman in her 30s holds the product in a sunlit kitchen, smiling at camera.",
  "discovered_tags": ["UGC-style", "sunlit", "kitchen", "before-after-implied"],
  "retry_count": 0,
  "attempts": [],
  "created_at": "2026-04-18T22:57:42.109Z",
  "updated_at": "2026-04-18T23:01:14.382Z",
  "completed_at": "2026-04-18T23:01:14.382Z"
}
```

`status` progresses: `pending` → `in_progress` → `completed` | `failed`.
`current_step` ticks: `queued` → `resolving_media` → `voting_n5` → `neo4j_writing` → `error` | (cleared on completion).

### Pipeline stages

```
POST /analyze_creative
   │
   ├─▶ create job row  (Butterbase)  → return 202 + job_id
   │
   ▼  (background)
   resolving_media     (httpx / BS4 / ffmpeg first-frame)
   voting_n5           (5 parallel VLM calls, temp 0.3, per-field majority vote)
   neo4j_writing       (MERGE Creative + HAS_FEATURE edges)
   complete_job        (status=completed, features + vote_log persisted)
```

### Errors

Synchronous errors (return before 202):
- `422` — Butterbase unreachable / job row couldn't be created.

Background errors (status=failed, recorded in the `error` column of the job):
- `Could not resolve media from <url>` — no image found (landing-page had no og:image, ffmpeg failed, etc.)
- `All VLM samples failed` — IonRouter 5×failed. Check model ID + base_url.
- `Neo4j write skipped: ...` — pipeline still completes; the error is recorded but doesn't fail the job since Neo4j is best-effort (Ashish owns retry wiring).

---

## MAKER voting

Per-field majority across `n_samples` independent VLM calls, temperature 0.3 for decorrelation. Based on Meyerson et al., *Maximal Agentic Decomposition* (arXiv:2511.09030).

- **Tiebreak:** value from the highest-confidence surviving sample.
- **Parse failures dropped:** no retries, no JSON repair (the paper's red-flag rule).
- **Freeform winner-takes-all:** `hook_copy`, `description`, `discovered_tags` come from the sample whose structured block matched the voted result on the most fields (ties broken by confidence).
- **Confidence:** mean across surviving samples.
- **Raw per-sample structured outputs** are logged to stdout for post-demo analysis (not stored in Butterbase).

Ties are rare at n=5 except on high-cardinality fields (`person` has 45+ allowed values; `hook_type` has 5). At ≤2 surviving samples the code still votes but the result is effectively "highest-confidence wins."

---

## Run locally

```bash
pip install -r requirements.txt
cp .env.example .env   # fill in IONROUTER_KEY, BUTTERBASE_*, NEO4J_*, etc.
uvicorn creative_analyzer:app --port 8001 --reload
```

The service reads `.env` via `python-dotenv` at import time; no `export $(cat .env)` dance needed.

### Smoke test

```bash
curl -X POST http://localhost:8001/analyze_creative \
  -H 'Content-Type: application/json' \
  -d '{
    "creative_id": "cr_test",
    "source_url": "https://example.com/ad.jpg",
    "media_type": "image",
    "platform": "meta",
    "n_samples": 5
  }'
# → 202 {"creative_id":"cr_test","job_id":"...","status":"accepted"}

# Poll:
curl http://localhost:8001/jobs/<job_id>
```

Health: `GET /health` → model + base URL + voting default.

### Mock demo (no VLM / no Seedance)

```bash
python3 demo_mock_loop.py
```

Runs the full pipeline with synthetic VLM samples and `intro.mp4` as the video — good for offline demo recording while API deps are down.

### Real demo (full Seedance brief)

```bash
python3 demo_e2e.py
```

Requires a funded BytePlus Seedance account; takes 5–10 min to generate a real 60s brief.

---

## Dependencies & deploy

- **Python 3.11+** for the FastAPI service.
- **Node 18+** for the Photon iMessage shim (`ledger-delivery/photon-node/`, installed via `npm install`).
- **ffmpeg + ffprobe** for video frame extraction and brief composition (`brew install ffmpeg`).
- **Butterbase** for `jobs` persistence + realtime dashboard (MCP provisioning documented in `docs/butterbase_jobs_schema.json`).
- **Neo4j Aura** for `(:Creative)-[:HAS_FEATURE]` edges.
- **Hugging Face** (`HF_TOKEN` in `~/.zshrc`) for hosting brief videos on `quantranger/ledger-briefs`.
- **Photon Spectrum** for iMessage delivery (cloud mode, via `spectrum-ts`).

For the demo: `uvicorn` on localhost:8001 + `ngrok` for Alex's calls.
**Not** deployed "on Butterbase" — Butterbase's Edge Functions are TS/JS only; the Python service runs elsewhere.

---

## Persistence & caching

There is no filesystem cache anymore. Every trigger creates a row in the Butterbase `jobs` table (schema in `docs/butterbase_jobs_schema.json`). To reuse a prior analysis, query the `jobs` table by `creative_id`:

```
GET /v1/app_48wmae61krkf/jobs?creative_id=eq.<id>&order=created_at.desc&limit=1
```

**Demo safety net:** pre-warm every demo creative by triggering it once; the job row will persist features + vote_log so a re-trigger is cheap. If you actually want to short-circuit, add a "cache-hit" check at the top of `run_pipeline` that queries `jobs` first — it's ~5 lines.

---

## Three real-world gotchas

1. **Meta / TikTok page URLs aren't media URLs.** Use `media_type: "landing_page"` so the scraper pulls the og:image.
2. **Video mode needs `ffmpeg`.** Falls back to 500 on the background task if it's missing — ship with `brew install ffmpeg` documented.
3. **BytePlus Seedance account goes into 403 AccountOverdueError on unpaid balance.** Check `retry_seedance.sh` log if briefs stop generating.

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

## Repo layout

```
creative_analyzer.py          # FastAPI service (this doc's contract)
brief_generator.py            # Sissi — Seedance 60s briefs (POST /generate_brief)
generate_intro.py             # Sissi — 3s cinematic intro generator
demo_mock_loop.py             # Offline demo: synthetic samples + cached intro
demo_e2e.py                   # Full demo: real Seedance brief → HF → Photon
smoke_test.py                 # HF upload + Photon iMessage plumbing check
retry_seedance.sh             # Retry demo_e2e.py every 10 min (Seedance recovery)
ledger-delivery/
  butterbase_client.py        # Python REST wrapper for jobs table
  hf_storage.py               # HF dataset upload for brief videos
  imessage_sender.py          # Photon iMessage sender (wraps Node shim)
  neo4j_writer.py             # Creative + HAS_FEATURE edge writer
  photon_config.py            # Photon Spectrum credential loader
  photon-node/                # spectrum-ts Node shim (via npm install)
docs/
  butterbase_jobs_schema.json # apply_schema payload for the jobs table
  seedance_corporate_debriefer_prompt.md  # Seedance prompt template
```

---

## Owners

- **Service:** Ashish (`@ashishranjan2404`)
- **Consumer / Neo4j writes into Ledger graph:** Alex
- **Brief generator (Seedance + edge-tts):** Sissi (`@sissississi-013`)

Open a PR or ping in iMessage if the contract needs to flex.
