# Architecture — Ledger Creative Analyzer

Navigation map for Claude sessions. Start here before reading source. Sections:

1. [Subsystems at a glance](#1-subsystems-at-a-glance)
2. [Request flow](#2-request-flow-post-analyze_creative)
3. [File index](#3-file-index)
4. [MAKER voting](#4-maker-voting)
5. [Data schemas](#5-data-schemas)
6. [External services](#6-external-services)
7. [Common tasks](#7-common-tasks)
8. [Debug playbook](#8-debug-playbook)

---

## 1. Subsystems at a glance

```
┌──────────────────────────────────────────────────────────────────────────┐
│  Alex's service ──POST /analyze_creative──▶ creative_analyzer.py (FastAPI)│
│                                                 │                        │
│                                                 ▼                        │
│                                          BackgroundTask                  │
│                                                 │                        │
│       ┌─────────────────┬──────────────────────┬────────────┐            │
│       ▼                 ▼                      ▼            ▼            │
│  resolve_media    call_vlm_parallel       maker_vote   neo4j_writer      │
│  (httpx/BS4/      (n=5 threaded →         (per-field   (Aura graph)      │
│   ffmpeg)          IonRouter/Qwen)         majority)                     │
│                                                                          │
│  state @ each stage ──▶ butterbase_client ──▶ Butterbase jobs table      │
│                                                                          │
│                                                                          │
│  (Separate sync endpoint, Sissi's module)                                │
│  POST /generate_brief ──▶ brief_generator.py                             │
│    │                        │                                            │
│    │                        ├─ edge-tts  (audio per insight)             │
│    │                        ├─ Seedance  (per-insight 5s visuals)        │
│    │                        ├─ PIL       (subtitle overlays)             │
│    │                        └─ ffmpeg    (composition + fade)            │
│    │                                                                     │
│    └──▶ ./briefs/{brief_id}.mp4                                          │
│                                                                          │
│  Demo scripts glue everything:                                           │
│    demo_e2e.py       — real Seedance brief → HF → Photon iMessage        │
│    demo_mock_loop.py — synthetic samples + cached intro (no Seedance)    │
│    smoke_test.py     — intro.mp4 → HF → Photon (plumbing check only)     │
└──────────────────────────────────────────────────────────────────────────┘
```

**Three independent concerns**, keep them separated mentally:
- **Analyze** = creative → features (fast, VLM + voting + Neo4j).
- **Brief** = list of insights → 60s video (slow, Seedance + TTS + FFmpeg).
- **Deliver** = video → HF dataset URL → Photon iMessage.

Demo scripts chain all three; the HTTP service currently only exposes `/analyze_creative` (async) and `/generate_brief` (sync). There is no `POST /deliver_brief` yet — delivery is script-driven.

---

## 2. Request flow (`POST /analyze_creative`)

```
client ──POST {creative_id, source_url, media_type, platform, n_samples=5}──▶
  │
  creative_analyzer.py::analyze_creative
  │   │
  │   ├─ create_job() → Butterbase POST /v1/{app}/jobs   (status=in_progress, step=queued)
  │   └─ background_tasks.add_task(run_pipeline, job_id, req)
  │
  ◀── 202 {creative_id, job_id, status:"accepted"}
  │
  (background, no HTTP response)
  │
  run_pipeline:
    update_job(step="resolving_media")
    resolve_to_image_and_text(source_url, media_type)
        ├─ image        → source_url as-is
        ├─ landing_page → httpx + BS4 → og:image URL + title/h1/desc snippet
        └─ video        → ffmpeg first-frame → base64 data URI
    
    update_job(step="voting_n5")
    call_vlm_parallel(image_url, extra_text, n=5)
        └─ ThreadPoolExecutor → 5× call_vlm(temp=0.3) against IonRouter
    
    maker_vote(samples)
        ├─ per-field majority across STRUCTURED_KEYS
        ├─ tiebreak: value from highest-confidence sample
        ├─ winner sample: max match count vs voted result
        └─ returns (voted, winner, vote_log)
    
    update_job(step="neo4j_writing",
               features=voted, vote_log=vote_log, confidence=avg_conf,
               hook_copy / description / discovered_tags from winner)
    
    _best_effort_neo4j(creative_id, voted, winner, avg_conf)
        └─ neo4j_writer.write_creative() — failures logged, don't fail the job
    
    complete_job(job_id)
```

**Log per-sample raw structured outputs** go to stdout (not Butterbase) for post-demo forensic analysis — search for `[pipeline] <creative_id> raw samples:`.

---

## 3. File index

Each entry: purpose, key symbols, imports, consumers.

### Service layer

#### `creative_analyzer.py`
- **Purpose:** FastAPI service. 4 routes: `POST /analyze_creative` (async), `GET /jobs/{id}`, `POST /generate_brief`, `GET /health`.
- **Key symbols:** `AnalyzeRequest`, `EXTRACTION_PROMPT`, `STRUCTURED_KEYS`, `resolve_to_image_and_text`, `call_vlm`, `call_vlm_parallel`, `maker_vote`, `run_pipeline`, `_best_effort_neo4j`, `analyze_creative` (route), `get_job_status` (route), `generate_brief_endpoint`, `health`.
- **Imports (local):** `butterbase_client`, `neo4j_writer` (via `sys.path.insert` to `ledger-delivery/`), `brief_generator`.
- **Env read:** `IONROUTER_KEY`, `IONROUTER_BASE_URL`, `CUMULUS_MODEL`.
- **Consumers:** Alex's service calls `/analyze_creative`; humans call `/generate_brief` and `/jobs/{id}`.

#### `brief_generator.py` (Sissi's module)
- **Purpose:** Turns a list of `{text}` insights into a ~60s morning brief MP4. Cached intro + per-insight Seedance visual + edge-tts audio + PIL subtitle overlays + FFmpeg composition + fade-out.
- **Key symbols:** `generate_brief(brief_id, merchant_name, insights, duration_target_sec, voice)`, `_build_insight_prompt`, `_seedance_create_and_poll`, `_generate_insight_visuals`, `_compose_video`, `VOICE_MAP`, `FALLBACK_PROMPT`, `SEEDANCE_MODEL`.
- **Imports:** `byteplussdkarkruntime.Ark`, `PIL`, `dotenv`, `edge-tts` (CLI subprocess).
- **Env read:** `ARK_API_KEY` (NB: repo stores as `SEED_DANCE_API_KEY`; demo scripts alias).
- **Writes:** `./briefs/{brief_id}.mp4`, `./briefs/{brief_id}.log`.
- **Depends on:** `assets/intro/intro.mp4` (cached, 1 MB, generated by `generate_intro.py`).

#### `generate_intro.py`
- **Purpose:** One-shot Seedance call → cinematic 3s intro clip with fade. Regenerate only if you want a different intro.
- **Key symbols:** `create_task`, `poll_task`, `download_video`, `postprocess`, `PROMPT_TEXT`, `MODEL_ID`.
- **Writes:** `assets/intro/intro.mp4`, `assets/intro/prompt.txt`, `assets/intro/seedance.log`.

### Brief-delivery orchestration

Lives inside `creative_analyzer.py` (not its own file) because it's another FastAPI route wired into the same app. Shape:

- **Route:** `POST /trigger_brief_delivery` → 202 + `job_id`.
- **Request model:** `BriefDeliveryRequest { creative_id, recipient="+16692426592", n_insights=4, duration_target_sec=60, voice="confident_female" }`.
- **Background function:** `run_brief_delivery(job_id, req)`.
- **Stages (each ticks `current_step` in Butterbase):**
  1. `fetching_insights_from_alex` — `ledger_client.get_insights_for_creative()`.
  2. `generating_media_parallel` — ThreadPoolExecutor fans out Sissi's `generate_brief()` *and* `cartesia_client.synthesize_insights()` concurrently; Cartesia finishes in ~5s, Seedance takes 5-10 min (or fails fast with 403).
  3. `uploading_video` | `uploading_audio` — whichever won goes to HF.
  4. `sending_imessage` — Photon attachment + caption with 3 insight headlines.
  5. `complete_job` (with `error` column carrying the Seedance failure message when we fell back).
- **Fallback priority:** prefer Seedance video (richer content, has Sissi's edge-tts narration baked in). Use Cartesia MP3 only if Seedance fails or produces no file. If both fail → `fail_job` with the combined error.

### Delivery helpers (`ledger-delivery/`)

Directory has a **hyphen** → not an importable package. Callers use `sys.path.insert(…/"ledger-delivery")`, then import modules directly (`from hf_storage import upload_video`).

#### `ledger-delivery/ledger_client.py`
- **Purpose:** Wraps Alex's GraphRAG chat endpoint (`45.78.200.9:7070/api/chat/stream/v5`). The endpoint is a chat-style LLM that queries the Neo4j graph and returns inference markdown.
- **Key symbols:** `get_insights_for_creative(creative_id, n, custom_query=None)`, `get_raw_inference(query)`, `_extract_json_array`, `_parse_markdown_bullets`, `LEDGER_CHAT_URL_TEMPLATE`.
- **Env read:** `LEDGER_CHAT_URL` (optional override; default hardcoded to hackathon IP).
- **Parser:** tries JSON-first (whole text → JSON array, then ```json fence, then first `[...]` block), falls back to numbered/bulleted markdown scrape, finally returns whole text as a single insight.
- **No auth** — internal-network endpoint.
- **Consumers:** `creative_analyzer.run_brief_delivery`, `demo_full_flow.py`.

#### `ledger-delivery/cartesia_client.py`
- **Purpose:** Cartesia TTS client. Synthesizes narration MP3 for the audio-fallback delivery path. Used by `run_brief_delivery` when Seedance is unavailable.
- **Key symbols:** `synthesize(text, out_path, voice_id, model_id)`, `synthesize_insights(insights, out_path)`, `DEFAULT_VOICE_ID`, `DEFAULT_MODEL_ID`, `CARTESIA_API_BASE`.
- **Env read:** `CARTESIA_API_KEY` (auto-loaded from `.cartesia.env` at module import if missing from env), `CARTESIA_VOICE_ID`, `CARTESIA_MODEL_ID`.
- **Defaults:** Sonic-2 model + "Professional Woman" preset voice (warm corporate narration).
- **Format:** 128 kbps mono MP3 at 44.1 kHz.
- **Fails loudly** on missing `CARTESIA_API_KEY` (no silent degradation).

#### `ledger-delivery/butterbase_client.py`
- **Purpose:** Thin REST wrapper over Butterbase auto-CRUD for the `jobs` table. Uses the platform API key → `butterbase_service` role → bypasses RLS.
- **Key symbols:** `create_job`, `update_job`, `complete_job`, `fail_job`, `get_job`, `find_by_creative_id`, `_now_iso`.
- **Env read:** `BUTTERBASE_API_URL`, `BUTTERBASE_APP_ID`, `BUTTERBASE_API_KEY` (loaded via python-dotenv from repo-root `.env`).
- **URL normalization:** strips `/v1/app_xxx` if accidentally included in `BUTTERBASE_API_URL`.

#### `ledger-delivery/hf_storage.py`
- **Purpose:** Upload a video file to the public HF dataset and return its CDN-backed resolve URL (so Photon can fetch it unauthenticated).
- **Key symbols:** `upload_video(local_path, name_in_repo)`, `ensure_repo`, `REPO_ID`.
- **Env read:** `HF_TOKEN` (from `~/.zshrc`, not `.env`), `HF_USER` (default `quantranger`), `HF_DATASET` (default `ledger-briefs`).
- **Note:** Dataset is public to enable Photon URL fetching. Do not switch to private without rewriting the delivery path.

#### `ledger-delivery/imessage_sender.py`
- **Purpose:** Python wrapper that subprocess-calls the Node shim. Passes `PHOTON_*` env vars through.
- **Key symbols:** `send_imessage(recipient, text, attachment_url, timeout_s=180)`.
- **Spawns:** `node photon-node/send_imessage.mjs …`

#### `ledger-delivery/neo4j_writer.py`
- **Purpose:** Writes `(:Creative {id, hook_copy, description, confidence, tags, updated_at})-[:HAS_FEATURE]->(:CreativeFeature {type, value})`. Idempotent via MERGE.
- **Key symbols:** `write_creative`, `verify_connection`, `close`, `_WRITE_QUERY`.
- **Env read:** `NEO4J_URI`, `NEO4J_USERNAME`, `NEO4J_PASSWORD`, `NEO4J_DATABASE`.
- **Behavior:** Null / "null" feature values are skipped (no empty CreativeFeature nodes).

#### `ledger-delivery/photon_config.py`
- **Purpose:** Fail-loudly loader for `PHOTON_*` env vars. Masks the key when logging. Not used by `imessage_sender.py` directly — leftover from earlier scaffolding, still useful for `verify_photon.py`.
- **Key symbols:** `WORKSPACE_ID`, `PROJECT_ID`, `API_KEY`, `mask(value)`.

#### `ledger-delivery/verify_photon.py`
- **Purpose:** Standalone smoke test that confirms env loads cleanly. Does NOT hit Photon.

#### `ledger-delivery/photon-node/`
- `package.json` — declares `spectrum-ts` dependency (`"type": "module"`).
- `send_imessage.mjs` — Node shim. Calls `Spectrum()` in cloud mode, then `imessage(app).user(phone)` → `.space(user)` → `space.send(text(…), attachment(buffer, {…}))`. Downloads the attachment URL into a Buffer before sending (spectrum-ts `attachment()` accepts file path or Buffer, not URL).
- `node_modules/` — gitignored; run `npm install` from this directory to populate.
- **Not to confuse:** spectrum-ts v0.4.0 *does* have a `whatsapp-business` provider in its dependencies, but the README doesn't document it. iMessage-only for this project.

### Demo scripts (root)

#### `demo_e2e.py`
- **Purpose:** Full end-to-end demo: mock insights → real Seedance brief → HF upload → Photon iMessage. Tracks every stage in a Butterbase job.
- **Runtime:** 5–10 min. Hard-dependency on a funded BytePlus account.
- **Mock insights** are the 4 "Sarah's face / Testimonials / Kill duplicates / Shift budget" lines matching Sissi's `__main__` sample.

#### `demo_mock_loop.py`
- **Purpose:** Full pipeline with synthetic VLM samples and cached `intro.mp4` as the brief stand-in. Runs in ~10s. Good when Seedance is blocked.
- **Shows:** MAKER voting disagreement + Neo4j write + HF upload + iMessage send + complete Butterbase job.

#### `smoke_test.py`
- **Purpose:** Minimum plumbing check — HF upload of `intro.mp4` + Photon iMessage. No analysis, no voting, no Neo4j.

#### `demo_full_flow.py`
- **Purpose:** Exercises `run_brief_delivery()` synchronously so stdout shows live progress. Creates a Butterbase job, calls the orchestration, reports final state. Best demo when Seedance is blocked — it falls back to Cartesia automatically and delivers an audio brief in ~10-15 seconds.
- **Env overrides:** `DEMO_CREATIVE_ID`, `DEMO_RECIPIENT`.

#### `retry_seedance.sh`
- **Purpose:** Fires `demo_e2e.py` every 10 min × 18 attempts. Run detached so Seedance auto-recovers once a BytePlus bill is paid.

### Infra & docs

- `docs/butterbase_jobs_schema.json` — paste-ready payload for MCP `apply_schema`. Source of truth for the `jobs` table shape.
- `docs/seedance_corporate_debriefer_prompt.md` — "corporate lady explaining insights" Seedance prompt template with `{INSIGHT_*}` placeholders and rationale.
- `docs/MAKER_VOTING.md` — *(not yet written; planned document for Sissi describing voting contract.)*
- `docs/ARCHITECTURE.md` — this file.
- `.env.example` — env var inventory (names only, placeholders).
- `.gitignore` — ignores `.env`, `node_modules/`, `briefs/`, `creative_cache/`, `__pycache__/`.
- `requirements.txt` — all Python deps (service + delivery helpers + Sissi's brief module).
- `README.md` — human-facing HTTP contract (what Alex + Sissi read).

---

## 4. MAKER voting

Implemented in `creative_analyzer.py::maker_vote()`.

### Algorithm

```
1. Drop samples without valid "structured" dict.
2. For each key in STRUCTURED_KEYS:
    values = [s["structured"][key] for s in valid if not None]
    Counter(values) → most_common
    if single winner → take it
    else (tie)       → pick value from highest-confidence sample that holds a tied value
    if len(set(values)) > 1 → record in fields_with_disagreement + field_vote_counts
3. Winner sample index = arg max over (count of fields matching voted result)
4. Return (voted, winner_sample, vote_log)
```

### vote_log shape

```json
{
  "n_samples": 5,
  "n_succeeded": 5,
  "fields_with_disagreement": ["angle", "person"],
  "field_vote_counts": {
    "angle":  {"testimonial": 4, "ugc": 1},
    "person": {"f_30s_confident": 4, "f_30s_happy": 1}
  },
  "winner_sample_index": 0,
  "per_sample_confidence": [0.89, 0.84, 0.91, 0.78, 0.87]
}
```

### Design decisions (locked in via brainstorm)

- **Sync calls, thread pool** — ThreadPoolExecutor gives real parallelism for the blocking OpenAI client. No asyncio.
- **Temperature 0.3** — decorrelation without losing signal on the finite label space.
- **No retries / no JSON repair** — parse failures are dropped (MAKER paper's red-flag rule).
- **Confidence-based tiebreaks everywhere** — both per-field ties and winner-sample ties. Self-reported confidence is a weak signal but acceptable for hackathon.
- **n=1 still goes through voting** — trivial 1-of-1 vote, `vote_log` still present in response. Contract stability over slightly smaller response bodies.
- **Fields_with_disagreement + field_vote_counts** are the pitch surface ("2 of 5 disagreed on angle — MAKER picked the majority").

---

## 5. Data schemas

### Butterbase `jobs` table

See `docs/butterbase_jobs_schema.json` for the canonical payload. Key columns:
- **Identity:** `id` (uuid pk), `creative_id` (text, NOT NULL, indexed).
- **State:** `status` (in_progress | completed | failed), `current_step` (free text), `retry_count`, `attempts` (jsonb array).
- **Inputs:** `platform`, `media_type`, `source_url`, `merchant_name`.
- **Outputs:** `features` (jsonb — the voted structured block), `vote_log` (jsonb — see §4), `confidence` (numeric), `hook_copy`, `description`, `discovered_tags` (text[]).
- **Delivery:** `video_object_id`, `video_download_url` (populated when delivery pipeline runs).
- **Error state:** `error` (text).
- **Timestamps:** `created_at`, `updated_at`, `completed_at` — all `timestamptz`.
- **Indexes:** `creative_id`, `status`, `created_at`.

### Neo4j schema

```
(:Creative {id, hook_copy, description, confidence, tags, updated_at})
  -[:HAS_FEATURE]->
(:CreativeFeature {type, value})
```

- `Creative` MERGEd by `id`.
- `CreativeFeature` MERGEd by `(type, value)` — identical feature values are shared across creatives (allows "all creatives with `angle=testimonial`" queries).
- Null / "null" structured fields are skipped (no empty CreativeFeature nodes).

### HTTP contract

Canonical in `README.md`. 202-accept shape vs job-poll shape documented with examples there.

---

## 6. External services

| Service | Role | Auth | Gotcha |
|---|---|---|---|
| IonRouter / Cumulus | VLM for MAKER voting | `IONROUTER_KEY` (Bearer) | Base URL matters — `api.ionrouter.io/v1` for Qwen; `kimi.ionrouter.io/v1` only serves Kimi. `response_format:{type:"json_object"}` is undocumented. |
| Butterbase | jobs DB + storage + realtime | `BUTTERBASE_API_KEY` (Bearer bb_sk_) | DSL uses `primaryKey` (not `primary`). Defaults are normalized at display (e.g. `'pending'` → `pending`) but apply correctly at INSERT. REST: `GET /v1/{app}/{table}?col=op.val&order=…&limit=…`. |
| Neo4j Aura | graph for CreativeFeature edges | `NEO4J_URI` (`neo4j+s://…`) + user/pass | `NEO4J_USERNAME` (not `_USER`). |
| Hugging Face | video + audio hosting (public dataset) | `HF_TOKEN` from `~/.zshrc` | Dataset must be public so Photon can fetch the resolve URL unauthenticated. Reused for both MP4 and MP3. |
| Photon Spectrum | iMessage delivery | `PHOTON_PROJECT_ID` + `PHOTON_API_KEY` | `PHOTON_WORKSPACE_ID` is not used by the SDK — ignore. spectrum-ts v0.4.0 is TS-only; Python shells out to Node. Mime detection in the shim is URL-extension-based (so .mp3 lands as audio/mpeg, not octet-stream). |
| BytePlus Seedance | video generation (visuals for briefs) | `ARK_API_KEY` (aliased from `SEED_DANCE_API_KEY`) | 403 `AccountOverdueError` on unpaid balance. Tasks may queue indefinitely before rejecting. `run_brief_delivery` falls back to Cartesia audio. |
| Cartesia | TTS narration (fallback when Seedance blocked) | `CARTESIA_API_KEY` (X-API-Key header) | Key stored in `.cartesia.env` (raw single-line), gitignored, auto-loaded. Sonic-2 model + Professional Woman preset voice. |
| Alex's GraphRAG chat | insight aggregation from Neo4j | none (internal-network IP) | Endpoint is `/api/chat/stream/v5`. Pass the question as URL-encoded `content=…`. Returns text/markdown — parser tries JSON-first. |
| ngrok / Fly / Railway | exposing localhost:8001 to Alex | — | Butterbase doesn't host Python. |

### Butterbase MCP tools

When the server is registered (`claude mcp add butterbase … --scope user`), 43 `mcp__butterbase__*` tools become available. The ones actually used here:
- `init_app`, `apply_schema`, `get_schema`, `get_app_config`, `list_apps` — provisioning.
- `insert_row`, `select_rows` — data ops (mostly for dev/debug — production code goes via REST).
- `generate_upload_url`, `generate_download_url` — not currently used (delivery uses HF).
- `deploy_function`, `create_frontend_deployment` — only relevant if you want the stretch dashboard.

---

## 7. Common tasks

### Add a new structured feature to the VLM vote
1. `creative_analyzer.py::EXTRACTION_PROMPT` — add the key + allowed values.
2. `creative_analyzer.py::STRUCTURED_KEYS` — add the key to the list.
3. `maker_vote()` auto-handles any new key in `STRUCTURED_KEYS`.
4. No schema change needed (features live in `jobs.features` jsonb; Neo4j MERGEs whatever type/value arrives).

### Add a new pipeline stage
1. `creative_analyzer.py::run_pipeline` — add `update_job(job_id, current_step="your_stage")` and the work between existing stages.
2. If external dep, new helper file under `ledger-delivery/`. Mirror the style of `hf_storage.py` / `butterbase_client.py` (env load via dotenv, `_require()` for env vars).
3. Document the new step in `README.md` §Pipeline stages.

### Change MAKER voting behavior
- Parallelism / temperature → `call_vlm_parallel()`.
- Tiebreak rule → `maker_vote()`, comment labeled "Tie —".
- Per-field logic → `maker_vote()` main loop.
- `vote_log` shape → `maker_vote()` return value (also persisted to `jobs.vote_log` and the polling response — update `README.md` poll example if you change it).

### Add a new messaging provider (e.g. Twilio WhatsApp)
1. New helper `ledger-delivery/whatsapp_sender.py` mirroring `imessage_sender.py`.
2. If SDK is Node-only, add to `ledger-delivery/photon-node/` or a parallel `whatsapp-node/`.
3. Add env vars to `.env.example` + `CLAUDE.md` table.
4. Delivery scripts (`demo_e2e.py`, `demo_mock_loop.py`) get a new option or a parallel send.

### Change the Seedance "corporate lady" prompt
- Template: `docs/seedance_corporate_debriefer_prompt.md`.
- Per-insight prompt builder: `brief_generator.py::_build_insight_prompt()` — dispatches on keywords.
- Fallback: `brief_generator.py::FALLBACK_PROMPT`.
- Intro clip prompt: `generate_intro.py::PROMPT_TEXT`.

### Change the Butterbase jobs schema
1. Edit `docs/butterbase_jobs_schema.json`.
2. Apply via MCP `apply_schema` (include the full table definition with any new/changed columns; Butterbase diffs).
3. Update `butterbase_client.py` if a new column needs a helper.
4. Update `creative_analyzer.py::run_pipeline` if a new column should be populated at a stage.

### Add a dashboard
1. New subdirectory `dashboard/` with Vite React + `@butterbase/sdk`.
2. Subscribe to jobs realtime via WebSocket (see `mcp__butterbase__configure_realtime` + SDK `realtime` docs).
3. Build + upload bundle via MCP `create_frontend_deployment` → `start_frontend_deployment`.
4. Update CORS (`mcp__butterbase__update_cors`) to add the deployed origin.

---

## 8. Debug playbook

### "A job is stuck in `in_progress`"
1. Find it: MCP `select_rows(table='jobs', filter={creative_id: 'eq.<id>', order: 'created_at.desc', limit: 1})`.
2. Check `current_step`:
   - `queued` — background task never fired. Check uvicorn stderr for startup errors.
   - `resolving_media` — `source_url` is unreachable or ffmpeg is missing. Check pipeline stdout for the resolve error.
   - `voting_nN` — IonRouter is slow / blocked. Check stdout for `[vlm] sample dropped` warnings.
   - `neo4j_writing` — Neo4j unreachable. Best-effort wrap should have moved on; if it didn't, look at `[pipeline]` stdout line.
3. If the process died, `error` column is empty (because `fail_job` never ran). Need to manually clean up.

### "Photon iMessage send fails with `space.send is not a function`"
Was my own bug — I constructed a raw `{id, type:"dm"}` plain object. The API is `imessage(app).user(phone)` → `.space(user)` → `.send(…)`. `send_imessage.mjs` has the correct pattern; don't revert.

### "Seedance failures"
- `AccountOverdueError` (403): BytePlus balance due. `retry_seedance.sh` will keep trying.
- `Timed out after 180s` with status `queued`: account is suspended — the task queues but never schedules. Same root cause.
- `No video_url in result`: Seedance API changed. Inspect `result` object; may be under `content.video_url` or `content[0].url`.

### "Butterbase apply_schema rejects my payload"
- Use `primaryKey` not `primary` (DSL quirk).
- For arrays, type is `text[]` (with brackets).
- For jsonb defaults: `"default": "'[]'::jsonb"` — the platform normalizes this to `[]` in `get_schema` output but applies correctly at INSERT.
- Always `dry_run: true` first if you're unsure — shows the SQL without executing.

### "Neo4j write silently skipped"
The pipeline catches Neo4j errors (best-effort). Check the `error` column of the job — if it starts with `Neo4j write skipped:` the write failed but the rest of the pipeline succeeded. Check creds in `.env`; `verify_connection()` helper in `neo4j_writer.py` for a quick reachability test.

### "HF upload says `403 Forbidden`"
- `HF_TOKEN` missing or expired. It's in `~/.zshrc`, not `.env`. `echo $HF_TOKEN` to verify.
- If rotating: update both `~/.zshrc` and reload the shell before re-running.

### "Imports broken — `ModuleNotFoundError: No module named 'butterbase_client'`"
The `ledger-delivery/` directory has a hyphen. Caller must `sys.path.insert(0, "ledger-delivery")` before importing. `creative_analyzer.py` and the demo scripts all do this. Don't rename the directory.

### "`SEED_DANCE_API_KEY` not found" when running `brief_generator.py` standalone
Sissi's code reads `ARK_API_KEY`. The repo's `.env` has it under `SEED_DANCE_API_KEY`. Demo scripts alias at runtime; direct Sissi invocations don't. Either:
- Run via `demo_e2e.py` / `demo_mock_loop.py` (they alias).
- Or `export ARK_API_KEY=$SEED_DANCE_API_KEY` before running.
- Do **NOT** rename the `.env` key per user feedback.

---

## 9. Commit history outline

High-level arc of this project (most recent first). Full detail: `git log --oneline`.

1. **CLAUDE.md + ARCHITECTURE.md** — *this commit*, for navigation.
2. **Async /analyze_creative + MAKER voting + README** (`b2322b4`) — core contract shift.
3. **Mock demo loop + Seedance retry** (`b9328da`) — hackathon fallback.
4. **End-to-end demo script** (`b3a8a23`).
5. **Photon iMessage sender** (`ae64724`) — Node shim + Python wrapper.
6. **Neo4j writer** (`b6ff3a0`).
7. **HF storage + Butterbase client** (`ec327b4`).
8. **Doc commits** — Butterbase schema + Seedance prompt + env docs.
9. **PR #1 merge** (`9f4ead0`) — Sissi's brief generator.
10. **Photon config scaffolding** (`f957734`).
11. **Initial FastAPI service** (`6dea625`).
