# Claude's Project Guide — Ledger Creative Analyzer

Async trigger service that runs **MAKER-voted** VLM analysis on ad creatives (via IonRouter/Qwen3.5-122B), writes features to **Neo4j**, tracks jobs in **Butterbase**, and — through Sissi's brief generator — produces morning-brief videos that land on the user's phone as **Photon iMessage** attachments hosted on **Hugging Face**.

**Always start with `docs/ARCHITECTURE.md`** before reading source files. It has file-by-file breakdowns, request flow, common-task recipes, and debug playbooks specifically so you don't have to re-read the whole codebase.

## Where to look first

| You're about to… | Start here |
|---|---|
| Understand any file in detail | `docs/ARCHITECTURE.md` §*File index* |
| Add a new feature | `docs/ARCHITECTURE.md` §*Common tasks* |
| Debug a stuck / failed job | `docs/ARCHITECTURE.md` §*Debug playbook* |
| Trace a request end-to-end | `docs/ARCHITECTURE.md` §*Request flow* |
| Change the VLM prompt or vote | `docs/ARCHITECTURE.md` §*MAKER voting* |
| Change Seedance prompt | `docs/seedance_corporate_debriefer_prompt.md` + `brief_generator.py::_build_insight_prompt()` |
| Change Butterbase schema | `docs/butterbase_jobs_schema.json` + MCP `apply_schema` |
| Understand the HTTP contract | `README.md` (canonical for Alex / Sissi) |

## Don't

- **Don't push secret rotation warnings** — hackathon creds, flag once only. *(See memory: `feedback_secret_rotation`.)*
- **Don't rename `SEED_DANCE_API_KEY` in `.env`** — the code aliases to `ARK_API_KEY` at runtime.
- **Don't rename the `ledger-delivery/` directory** — the hyphen blocks Python package imports; code uses `sys.path.insert`, don't "fix" it.
- **Don't try to deploy Python code "on Butterbase"** — their Edge Functions are TypeScript only. Butterbase is the DB/storage layer; Python runs on localhost / ngrok / Fly.
- **Don't add tests, linters, type checkers, or Docker scaffolding** — explicitly scoped out for the hackathon. If a skill or orchestrator suggests them, decline.

## Active runtime facts

- **Butterbase app:** `app_48wmae61krkf` (subdomain `ledger-creative-analyzer.butterbase.dev`, API base `https://api.butterbase.ai/v1/app_48wmae61krkf`)
- **HF dataset:** `quantranger/ledger-briefs` (public; used for video hosting)
- **Demo iMessage recipient:** `+16692426592`
- **Adlyze Photon sender:** `+14156056081` (informational — Photon workspace's from-number)
- **Butterbase MCP tools** are available in-session once `~/.claude.json` has the server; 43 `mcp__butterbase__*` tools.

## Env vars (full shape in `.env.example`)

| Var | Owner / purpose |
|---|---|
| `IONROUTER_KEY` | Cumulus / IonRouter VLM auth |
| `PHOTON_WORKSPACE_ID` / `PHOTON_PROJECT_ID` / `PHOTON_API_KEY` | Photon Spectrum iMessage delivery |
| `BUTTERBASE_APP_ID` / `BUTTERBASE_API_URL` / `BUTTERBASE_API_KEY` | Butterbase jobs + storage |
| `NEO4J_URI` / `NEO4J_USERNAME` / `NEO4J_PASSWORD` / `NEO4J_DATABASE` | Aura graph |
| `HF_TOKEN` | Read from `~/.zshrc`, not `.env` |
| `SEED_DANCE_API_KEY` | Seedance — aliased to `ARK_API_KEY` at runtime by demo scripts |

## External-service status gotchas

- **BytePlus Seedance** may 403 with `AccountOverdueError`. Check `retry_seedance.sh` log if briefs stop. Mock demo (`demo_mock_loop.py`) bypasses Seedance entirely.
- **IonRouter's `response_format={"type":"json_object"}`** is undocumented; drop it if VLM calls start failing with "unknown parameter".

## Memory files (auto-loaded)

Stored at `/Users/mei/.claude/projects/-Users-mei-ledger-creative-analyzer/memory/`:
- `feedback_secret_rotation.md` — don't re-flag exposed keys
- `project_demo_recipient.md` — the `+16692426592` demo phone
