-- =============================================================================
-- Thedi v2 — Phase-1 MVP schema
-- =============================================================================
-- Target: Butterbase apply_schema (PostgreSQL + pgvector). This is the
-- minimum-viable table set needed to exercise the interview-bot → drafter →
-- critic path end-to-end. Everything else (rubric_deltas, pipeline_events,
-- draft_sessions, topic_picker_options, system_config, email_prefs,
-- model_stage_config, credentials_metadata, golden_set) lands in Phase 1
-- week 3+ per I3-C §1.2 and D1 §2.4.
--
-- Irreversibility note: every table below is CREATE IF NOT EXISTS or uses
-- ON CONFLICT-safe idempotent patterns so re-running apply_schema is safe.
-- =============================================================================

CREATE EXTENSION IF NOT EXISTS vector;
CREATE EXTENSION IF NOT EXISTS pgcrypto;  -- gen_random_uuid

-- -----------------------------------------------------------------------------
-- Enum types
-- -----------------------------------------------------------------------------

DO $$ BEGIN
  CREATE TYPE draft_stage AS ENUM (
    'drafting',         -- fn_drafter in flight
    'critiquing',       -- fn_critic in flight
    'rewriting',        -- fn_rewriter in flight (Phase 2)
    'review_pending',   -- awaiting Ramesh in /admin/compose (Phase 2)
    'approved',         -- Ramesh approved (Phase 2)
    'published',        -- Ramesh pasted to Substack (Phase 2)
    'discarded'         -- week-skipped or manually killed
  );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE draft_source AS ENUM (
    'interview_bot',              -- normal path: Q&A → drafter
    'voice_note',                 -- silence-fallback: MacWhisper transcript
    'manual_paste_for_calibration' -- conservative mode: Ramesh pastes finished post
  );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE alert_severity AS ENUM ('info', 'warn', 'critical');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- -----------------------------------------------------------------------------
-- topics — scout output; feeds the weekly topic-picker email
-- -----------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS topics (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  week_of         date NOT NULL,                  -- ISO Monday of the topic's week
  title           text NOT NULL,
  summary         text NOT NULL,                  -- ≤400 chars, fed to interview-bot
  source_urls     text[] NOT NULL DEFAULT '{}',   -- arxiv/HN URLs that surfaced it
  embedding       vector(1536),                   -- openai text-embedding-3-small
  rank            int NOT NULL,                   -- 1..3 within week_of
  picked_by_user  boolean NOT NULL DEFAULT false, -- Ramesh clicked the picker link
  picked_at       timestamptz,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT topics_rank_range CHECK (rank BETWEEN 1 AND 5),
  CONSTRAINT topics_title_len  CHECK (char_length(title) BETWEEN 5 AND 300)
);
CREATE UNIQUE INDEX IF NOT EXISTS topics_week_rank_key ON topics (week_of, rank);
CREATE INDEX IF NOT EXISTS topics_picked_idx ON topics (picked_by_user, week_of DESC);
-- pgvector ivfflat needs data before index builds efficiently; leave the
-- cosine-ops index for a Phase-1.5 migration once there are >1000 rows.
-- PHASE_2: CREATE INDEX topics_embed_idx ON topics USING ivfflat (embedding vector_cosine_ops);

-- -----------------------------------------------------------------------------
-- qa_sessions — interview-bot Q&A; one per picked topic
-- -----------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS qa_sessions (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  topic_id        uuid NOT NULL REFERENCES topics(id) ON DELETE CASCADE,
  questions       jsonb NOT NULL DEFAULT '[]'::jsonb,
  -- questions schema: [{idx, archetype, text, anchor_noun, self_check_scores,
  --                     source_ref}]  — matches D1 §1.1 OUTPUT spec
  answers         jsonb NOT NULL DEFAULT '{}'::jsonb,
  -- answers schema: {"1": "Ramesh's verbatim answer text...", "2": "...", ...}
  word_count      int NOT NULL DEFAULT 0,         -- sum of answer words; gates drafter
  submitted_at    timestamptz,                    -- null until Ramesh submits
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT qa_word_count_nonneg CHECK (word_count >= 0)
);
CREATE UNIQUE INDEX IF NOT EXISTS qa_topic_key ON qa_sessions (topic_id);
CREATE INDEX IF NOT EXISTS qa_submitted_idx ON qa_sessions (submitted_at DESC NULLS LAST);

-- -----------------------------------------------------------------------------
-- drafts — pipeline output; one row per (qa_session, version)
-- -----------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS drafts (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  topic_id        uuid NOT NULL REFERENCES topics(id) ON DELETE CASCADE,
  qa_session_id   uuid REFERENCES qa_sessions(id),  -- null iff source='manual_paste_for_calibration'
  body_md         text NOT NULL,
  version         int NOT NULL DEFAULT 1,           -- 1 = fn_drafter; 2 = first rewriter pass
  stage           draft_stage NOT NULL DEFAULT 'drafting',
  rubric_scores   jsonb,                            -- from fn_critic; null until critiqued
  source          draft_source NOT NULL DEFAULT 'interview_bot',
  drafter_model   text,                             -- actual model returned by IonRouter
  critic_model    text,                             -- actual model returned by IonRouter
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT drafts_version_pos CHECK (version >= 1 AND version <= 3),
  CONSTRAINT drafts_body_nonempty CHECK (char_length(body_md) > 0),
  CONSTRAINT drafts_qa_or_manual CHECK (
    (source = 'manual_paste_for_calibration') OR (qa_session_id IS NOT NULL)
  )
);
CREATE UNIQUE INDEX IF NOT EXISTS drafts_topic_version_key ON drafts (topic_id, version);
CREATE INDEX IF NOT EXISTS drafts_stage_idx ON drafts (stage, updated_at DESC);

-- -----------------------------------------------------------------------------
-- rubric_versions — versioned rubric config; exactly one row has is_active=true
-- -----------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS rubric_versions (
  id                       uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  version                  int NOT NULL UNIQUE,           -- monotonic
  config                   jsonb NOT NULL,                -- see schema below
  -- config schema:
  -- {
  --   "dimensions": {
  --     "voice_fidelity":   {"weight": 2.0, "anchors": {...1/5/10...}},
  --     "factual_accuracy": {"weight": 1.0, ...},
  --     "concreteness":     {"weight": 1.0, ...},
  --     "flow_coherence":   {"weight": 1.0, ...},
  --     "slop_absence":     {"weight": 1.5, ...},
  --     "hedge_density":    {"weight": 1.0, ...},
  --     "topic_coherence":  {"weight": 1.0, ...}
  --   },
  --   "threshold": 65,
  --   "ban_list": [{"pattern": "delve", "type": "literal", "source": "..."}, ...],
  --   "keep_list": ["failure mode", "the operator's seat", ...]
  -- }
  approved_by_ashish_at    timestamptz,
  approved_by_ramesh_at    timestamptz,
  is_active                boolean NOT NULL DEFAULT false,
  created_at               timestamptz NOT NULL DEFAULT now()
);
-- Enforce at most one active rubric (partial unique index)
CREATE UNIQUE INDEX IF NOT EXISTS rubric_one_active
  ON rubric_versions ((is_active)) WHERE is_active = true;

-- -----------------------------------------------------------------------------
-- model_assertions — audit trail for response.model == expected_model checks
-- This is the single highest-leverage control in the canonical plan.
-- -----------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS model_assertions (
  id              bigserial PRIMARY KEY,
  call_site       text NOT NULL,         -- 'fn_interview_bot' | 'fn_drafter' | 'fn_critic' | ...
  expected_model  text NOT NULL,
  actual_model    text,                  -- null iff response had no model field
  passed          boolean NOT NULL,
  request_id      text,                  -- IonRouter response id for cross-ref
  payload         jsonb,                 -- {draft_id?, qa_session_id?, topic_id?, ...}
  ts              timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS model_assertions_failed_idx
  ON model_assertions (passed, ts DESC) WHERE passed = false;
CREATE INDEX IF NOT EXISTS model_assertions_site_idx ON model_assertions (call_site, ts DESC);

-- -----------------------------------------------------------------------------
-- alerts — dashboard display queue (I3-C §1.2)
-- -----------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS alerts (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  kind            text NOT NULL,         -- 'model_mismatch' | 'qa_underweight' | 'key_expiry' | ...
  severity        alert_severity NOT NULL DEFAULT 'info',
  title           text NOT NULL,
  payload         jsonb NOT NULL DEFAULT '{}'::jsonb,
  acknowledged_at timestamptz,
  acknowledged_by text,
  created_at      timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS alerts_open_idx
  ON alerts (created_at DESC) WHERE acknowledged_at IS NULL;
CREATE INDEX IF NOT EXISTS alerts_kind_idx ON alerts (kind, created_at DESC);

-- -----------------------------------------------------------------------------
-- health_heartbeats — cron liveness log (26hr watcher reads this)
-- -----------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS health_heartbeats (
  id          bigserial PRIMARY KEY,
  job_name    text NOT NULL,            -- 'scout_daily' | 'topic_picker_weekly' | ...
  ok          boolean NOT NULL DEFAULT true,
  note        text,                     -- optional one-liner; error string on !ok
  ts          timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS heartbeats_job_idx ON health_heartbeats (job_name, ts DESC);

-- -----------------------------------------------------------------------------
-- updated_at triggers — keep updated_at fresh without trusting callers
-- -----------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION touch_updated_at() RETURNS trigger AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END $$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS topics_touch ON topics;
CREATE TRIGGER topics_touch BEFORE UPDATE ON topics
  FOR EACH ROW EXECUTE FUNCTION touch_updated_at();

DROP TRIGGER IF EXISTS qa_sessions_touch ON qa_sessions;
CREATE TRIGGER qa_sessions_touch BEFORE UPDATE ON qa_sessions
  FOR EACH ROW EXECUTE FUNCTION touch_updated_at();

DROP TRIGGER IF EXISTS drafts_touch ON drafts;
CREATE TRIGGER drafts_touch BEFORE UPDATE ON drafts
  FOR EACH ROW EXECUTE FUNCTION touch_updated_at();

-- =============================================================================
-- Seed: a minimal active rubric v1 so fn_critic has something to score against.
-- Ramesh approval is intentionally NULL — the Phase-1 flow is: Ashish seeds
-- this, Ramesh confirms via /admin/rubric in Phase 2.
-- =============================================================================

INSERT INTO rubric_versions (version, config, approved_by_ashish_at, is_active)
VALUES (
  1,
  jsonb_build_object(
    'dimensions', jsonb_build_object(
      'voice_fidelity',   jsonb_build_object('weight', 2.0),
      'factual_accuracy', jsonb_build_object('weight', 1.0),
      'concreteness',     jsonb_build_object('weight', 1.0),
      'flow_coherence',   jsonb_build_object('weight', 1.0),
      'slop_absence',     jsonb_build_object('weight', 1.5),
      'hedge_density',    jsonb_build_object('weight', 1.0),
      'topic_coherence',  jsonb_build_object('weight', 1.0)
    ),
    'threshold', 65,
    'ban_list', jsonb_build_array(
      jsonb_build_object('pattern', 'delve',                      'type', 'literal'),
      jsonb_build_object('pattern', 'tapestry',                   'type', 'literal'),
      jsonb_build_object('pattern', 'nuanced',                    'type', 'literal'),
      jsonb_build_object('pattern', 'in the realm of',            'type', 'literal'),
      jsonb_build_object('pattern', 'paradigm shift',             'type', 'literal'),
      jsonb_build_object('pattern', 'leverage',                   'type', 'literal'),
      jsonb_build_object('pattern', 'unleash',                    'type', 'literal'),
      jsonb_build_object('pattern', 'synergy',                    'type', 'literal'),
      jsonb_build_object('pattern', 'in conclusion,',             'type', 'literal'),
      jsonb_build_object('pattern', 'at the end of the day',      'type', 'literal'),
      jsonb_build_object('pattern', 'transformative',             'type', 'literal'),
      jsonb_build_object('pattern', 'game-changing',              'type', 'literal'),
      jsonb_build_object('pattern', 'revolutionary',              'type', 'literal'),
      jsonb_build_object('pattern', 'it''s not X it''s Y',        'type', 'construction'),
      jsonb_build_object('pattern', 'on the one hand',            'type', 'construction')
    ),
    'keep_list', jsonb_build_array(
      'failure mode', 'the operator''s seat', '3am pager', 'blast radius'
    )
  ),
  now(),
  true
)
ON CONFLICT (version) DO NOTHING;
