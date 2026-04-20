# Thedi v2 — Phase-1 MVP prototype

This directory holds the minimum runnable skeleton of the Thedi v2 pipeline:
schema + three Butterbase Deno functions (`interview_bot` → `drafter` → `critic`).
It is deploy-ready once the env vars below land in the Butterbase app.

**Scope:** happy-path interview → draft → score. Everything beyond that (rewriter,
`/admin` dashboard, Google OAuth allowlist, weekly cron topic-picker email, pgvector
dedup, pipeline state machine) is Phase-1 week 3-6 — see the **Known limitations**
section below and `iter2/D2-installer-walkthrough.md`.

## Files

- `schema.sql` — apply once. 7 tables, 3 enums, 1 seeded rubric_versions row.
- `fn_interview_bot.ts` — POST `/fn/interview-bot` → 4-6 Socratic questions, email Ramesh.
- `fn_drafter.ts`       — POST `/fn/drafter`        → 1200-word draft from Q&A.
- `fn_critic.ts`        — POST `/fn/critic`         → 7-dimension rubric score.

## Deploy

### 1. Schema

```
butterbase apply_schema --app thedi-ramesh --file ./schema.sql
```

Butterbase's MCP equivalent: `mcp__butterbase__apply_schema` with the file contents
as the `schema` arg. `dry_run_schema` first to preview.

### 2. Functions

```
butterbase deploy_function --app thedi-ramesh --name interview-bot --file ./fn_interview_bot.ts
butterbase deploy_function --app thedi-ramesh --name drafter       --file ./fn_drafter.ts
butterbase deploy_function --app thedi-ramesh --name critic        --file ./fn_critic.ts
```

MCP equivalent: `mcp__butterbase__deploy_function` per file.

### 3. Env vars

Set via `mcp__butterbase__update_function_env` on each function (they all need the same set):

| Var                       | Purpose                                                      |
|---------------------------|--------------------------------------------------------------|
| `THEDI_ADMIN_TOKEN`       | Shared secret for `admin_token` body auth (matches v1).      |
| `IONROUTER_API_KEY`       | Bearer for `api.ionrouter.io`.                               |
| `RESEND_API_KEY`          | Email delivery. See `.resend.credentials`.                   |
| `RESEND_FROM`             | Sender (default `thedi@platformy.org`).                      |
| `RAMESH_EMAIL`            | Recipient; falls back to `RESEND_TO`.                        |
| `THEDI_BASE_URL`          | Public URL for admin links (default `https://thedi.platformy.org`). |

**Phase-2 additions (not used yet):**
- `GOOGLE_OAUTH_CLIENT_ID` / `GOOGLE_OAUTH_CLIENT_SECRET` — from `.secrets/google_oauth_client.json`;
  wired via `mcp__butterbase__configure_oauth_provider` for the `/admin` SPA.
- `ANTHROPIC_API_KEY` — escape-hatch model in Settings UI.
- `LINKEDIN_OAUTH_*` — syndication.

## Test

Seed a topic, invoke the interview bot against it:

```bash
# Seed a test topic (once)
butterbase insert_row --app thedi-ramesh --table topics \
  --values '{"week_of":"2026-04-20","title":"kubernetes operator reconciliation under partial failure","summary":"when an operator reconciling LLM autoscaler replicas gets 429s for 30s then recovers, what should it actually do","source_urls":["https://arxiv.org/abs/2511.04432"],"rank":1}'

# Fetch the topic id
TOPIC_ID=$(butterbase select_rows --app thedi-ramesh --table topics \
  --where "title LIKE 'kubernetes operator%'" --limit 1 | jq -r '.[0].id')

# Invoke interview-bot
curl -X POST https://thedi-ramesh.butterbase.dev/fn/interview-bot \
  -H 'Content-Type: application/json' \
  -d "{\"admin_token\":\"$THEDI_ADMIN_TOKEN\",\"topic_id\":\"$TOPIC_ID\"}"
# → {"ok":true, "qa_session_id":"<uuid>", "question_count":5, "email_id":"..."}
```

Then submit synthetic answers directly (normally done via the `/admin/qa/:id` UI
which is Phase 2):

```bash
QA_ID=<from above>
butterbase insert_row --app thedi-ramesh --table qa_sessions \
  --where "id='$QA_ID'" --values \
  '{"answers":{"1":"<600 words verbatim Ramesh answer>", "2":"..."},"word_count":620,"submitted_at":"now()"}'

# Kick drafter
curl -X POST https://thedi-ramesh.butterbase.dev/fn/drafter \
  -H 'Content-Type: application/json' \
  -d "{\"admin_token\":\"$THEDI_ADMIN_TOKEN\",\"qa_session_id\":\"$QA_ID\"}"
# → {"ok":true, "draft_id":"<uuid>", "word_count":1240, "stage":"drafting"}

# Kick critic
DRAFT_ID=<from above>
curl -X POST https://thedi-ramesh.butterbase.dev/fn/critic \
  -H 'Content-Type: application/json' \
  -d "{\"admin_token\":\"$THEDI_ADMIN_TOKEN\",\"draft_id\":\"$DRAFT_ID\"}"
# → {"ok":true, "weighted_sum":71.5, "threshold":65, "stage":"review_pending", ...}
```

**Sanity check the model-ID assertion:**

```sql
SELECT call_site, expected_model, actual_model, passed, ts
FROM model_assertions ORDER BY ts DESC LIMIT 20;
```

Every row should have `passed=true`. A `passed=false` row is the single
highest-leverage failure signal in the system — it means IonRouter silently
routed a call to the wrong model, which is the risk the canonical plan calls
out as #1. Every mismatch also auto-inserts an `alerts` row with
`kind='model_mismatch'`, `severity='critical'`.

## Known limitations (what isn't built — Phase-1 weeks 3-6)

1. **No `fn_rewriter`.** If `fn_critic` drops a draft to `stage='rewriting'`,
   the pipeline stalls there. An alert is logged so the draft isn't lost, but
   there's no automatic round-2 pass. Canonical plan §Rewriter specifies
   `kimi-k2.5`, max 2 rounds per Self-Refine + Reflexion evidence.
2. **No `/admin` SPA.** No compose editor, no alerts panel, no rubric-delta
   approval UI, no pipeline timeline, no Google OAuth allowlist. I3-C specifies
   6 hours to build; shipping separate from this prototype.
3. **No weekly topic-picker email cron.** Topics must be seeded manually
   (or by the reused v1 scout) until `fn_topic_picker_weekly` lands.
4. **No pgvector dedup on topics.** `topics.embedding` column exists but
   no index and no embed pipeline. I3-C §Part 2 has the spec (cosine 0.82/0.70).
5. **No PII/redaction pass** before IonRouter calls. Canonical §PII/redaction
   is a Phase-2 4h task; Saviynt-internal deny-list stays in Ramesh's instance.
6. **No golden-set revalidation.** Table not created; fn_revalidate_golden_set
   is Phase 2.
7. **No cron heartbeat watcher.** `health_heartbeats` gets rows but no job
   reads them and alerts on 26hr silence.
8. **No silence-counter / pipeline auto-pause.** I3-C §1.4 14-day check.
9. **Self-critique model family collapsed.** D1 §1.4 calls for the interview-bot
   self-critique to use a different model family (`gpt-oss-120b`) than the
   generator (`kimi-k2.5`). Phase 1 MVP uses the same call for both — saves
   one LLM roundtrip; revisit if specificity scores cluster low.
10. **Rubric v1 is seeded by Ashish only.** `approved_by_ramesh_at` is NULL
    until Phase 2's `/admin/rubric` UI ships. Drafts critique against it anyway;
    the whole point is to have concrete data for Ramesh's eventual review.
11. **No retry on LLM calls.** Single-shot. IonRouter 429/5xx fails the
    function and returns 500 to the caller. Caller (or cron) retries.

## Design trade-off vs. canonical plan

The plan's single largest simplification here: **the interview-bot's self-critique
runs in the same LLM call as generation, not as a separate `gpt-oss-120b` pass.**
D1 §1.4 argues for model-family diversity to avoid self-consistency bias. For
Phase 1 the trade is: we save one call's latency + cost, lose some critique
independence, and the downstream `fn_critic` is still on a different family —
so the "big" self-consistency risk (drafter grading its own draft) is unaffected.
If specificity scores stay clustered high (>=9) for 10+ sessions, the skip is
defensible; if they cluster 6-7 the separate call should be added.
