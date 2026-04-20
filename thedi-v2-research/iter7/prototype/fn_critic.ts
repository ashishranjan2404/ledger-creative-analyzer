/**
 * fn_critic — score a draft against the active rubric_versions row.
 *
 * Trigger: HTTP POST /fn/critic
 * Auth:    THEDI_ADMIN_TOKEN in body.admin_token
 * Body:    { admin_token: string, draft_id: uuid }
 *
 * Model: gpt-oss-120b (canonical plan §Critic: separate model family from
 *        drafter; ~20x cheaper; different-family-for-evidence pattern per
 *        LangChain reflection agents + Nature npj AI 2025 self-consistency).
 *
 * On rubric evaluation:
 *   weighted_sum >= threshold (default 65)  → stage='review_pending'
 *   weighted_sum <  threshold                → stage='rewriting'
 *
 * Every call writes a model_assertions row. Mismatch → alert + hard-fail.
 * PHASE_2: fn_rewriter is not implemented; stage='rewriting' is a terminal
 * state here and requires manual kick or Phase-2 deployment.
 */

const LLM_URL = "https://api.ionrouter.io/v1/chat/completions";
const LLM_MODEL = "openai/gpt-oss-120b";
const DEFAULT_THRESHOLD = 65;
const RUBRIC_DIMENSIONS = [
  "voice_fidelity", "factual_accuracy", "concreteness",
  "flow_coherence", "slop_absence", "hedge_density", "topic_coherence",
] as const;

function buildSystemPrompt(rubricConfig: any): string {
  const weights = rubricConfig.dimensions || {};
  const banList = rubricConfig.ban_list || [];
  const keepList = rubricConfig.keep_list || [];
  const threshold = rubricConfig.threshold ?? DEFAULT_THRESHOLD;

  const weightsLine = RUBRIC_DIMENSIONS
    .map((d) => `${d} (weight ${weights[d]?.weight ?? 1.0})`)
    .join(", ");

  return `You are a style editor scoring a draft post for Ramesh Nampalli's
Substack on agentic AI in DevOps / SRE. You do NOT rewrite. You score and
cite specific lines as evidence.

BAN_LIST (any hit lowers slop_absence sharply): ${JSON.stringify(banList)}
KEEP_LIST (usage raises voice_fidelity): ${JSON.stringify(keepList)}

RUBRIC (7 dimensions, each 1-10). Weights: ${weightsLine}.
Weighted sum threshold = ${threshold} (max = 85).

Anchors:
  voice_fidelity 10 = Ramesh's concrete-3am-pager cadence; 1 = generic AI-hype opener
  factual_accuracy 10 = every specific claim traces to QA_VERBATIM or sources; 1 = fabricated citations
  concreteness 10 = specific failure modes + numbers + named tools; 1 = no nouns
  flow_coherence 10 = each paragraph advances a claim; 1 = reorderable paragraphs
  slop_absence 10 = zero ban-list hits; 1 = 3+ hits or em-dashes everywhere
  hedge_density 10 = <5% hedged claims; 1 = >25% hedge rate
  topic_coherence 10 = every section maps back to picked topic; 1 = off-topic by paragraph 3

Scoring is integer 1-10 per dimension. Recommendation:
  weighted_sum >= ${threshold}  → "APPROVE"
  ${threshold - 10} <= weighted_sum < ${threshold}     → "REWRITE"
  weighted_sum < ${threshold - 10}        → "REWRITE_FROM_QA"

Return STRICT JSON:
{
  "scores": { "voice_fidelity": int, "factual_accuracy": int,
              "concreteness": int, "flow_coherence": int,
              "slop_absence": int, "hedge_density": int,
              "topic_coherence": int },
  "weighted_sum": float,
  "recommendation": "APPROVE" | "REWRITE" | "REWRITE_FROM_QA",
  "evidence": "<2-4 sentence summary citing specific lines>",
  "edits": [{"loc": "<section or line>", "dim": "<rubric dim>",
             "issue": "<short>", "suggest": "<specific rewrite or cut>"}]
}`;
}

function computeWeightedSum(
  scores: Record<string, number>,
  config: any,
): number {
  const weights = config.dimensions || {};
  let sum = 0;
  for (const dim of RUBRIC_DIMENSIONS) {
    const w = weights[dim]?.weight ?? 1.0;
    const s = scores[dim] ?? 0;
    sum += w * s;
  }
  return Math.round(sum * 10) / 10;
}

export async function handler(req: Request, ctx: any): Promise<Response> {
  const body = await req.json().catch(() => ({}));
  if (body.admin_token !== ctx.env.THEDI_ADMIN_TOKEN) {
    return json({ error: "unauthorized" }, 401);
  }
  const draftId = body.draft_id;
  if (!draftId) return json({ error: "draft_id required" }, 400);

  // Load draft + its qa_session (for QA_VERBATIM context) + active rubric.
  const d = await ctx.db.query(
    `SELECT d.id, d.body_md, d.topic_id, d.qa_session_id, d.version, d.stage,
            t.title, t.summary,
            qs.questions, qs.answers
     FROM drafts d
     JOIN topics t ON t.id = d.topic_id
     LEFT JOIN qa_sessions qs ON qs.id = d.qa_session_id
     WHERE d.id = $1`,
    [draftId],
  );
  if (!d.rows.length) return json({ error: "draft not found" }, 404);
  const draft = d.rows[0];

  const r = await ctx.db.query(
    `SELECT id, version, config FROM rubric_versions WHERE is_active = true LIMIT 1`,
  );
  if (!r.rows.length) {
    return json({ error: "no active rubric_versions row" }, 500);
  }
  const rubric = r.rows[0];
  const threshold = rubric.config.threshold ?? DEFAULT_THRESHOLD;

  const qaBlock = (draft.questions || []).map((q: any, i: number) => {
    const key = String(q.idx ?? i + 1);
    const ans = (draft.answers || {})[key] || "(no answer)";
    return `Q${key}: ${q.text}\nA${key}: ${ans}`;
  }).join("\n\n");

  const userPrompt = `TOPIC: ${draft.title}
TOPIC_BLURB: ${draft.summary}

QA_VERBATIM:
${qaBlock || "(no Q&A — manual paste calibration draft)"}

DRAFT TO SCORE:
---
${draft.body_md}
---

Score per RUBRIC and return STRICT JSON.`;

  const res = await fetch(LLM_URL, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${ctx.env.IONROUTER_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: LLM_MODEL,
      temperature: 0,
      max_tokens: 2000,
      response_format: { type: "json_object" },
      messages: [
        { role: "system", content: buildSystemPrompt(rubric.config) },
        { role: "user", content: userPrompt },
      ],
    }),
  });
  if (!res.ok) {
    return json({ error: `IonRouter ${res.status}: ${(await res.text()).slice(0, 300)}` }, 500);
  }
  const data: any = await res.json();
  const actualModel: string = data.model || "";
  const passed = actualModel === LLM_MODEL;

  // Model-ID assertion — canonical plan's single highest-leverage control.
  await ctx.db.query(
    `INSERT INTO model_assertions (call_site, expected_model, actual_model, passed, request_id, payload)
     VALUES ('fn_critic', $1, $2, $3, $4, $5)`,
    [LLM_MODEL, actualModel, passed, data.id || null, { draft_id: draftId }],
  );
  if (!passed) {
    await ctx.db.query(
      `INSERT INTO alerts (kind, severity, title, payload) VALUES
       ('model_mismatch', 'critical', $1, $2)`,
      [
        `fn_critic: expected ${LLM_MODEL}, got ${actualModel || "(none)"}`,
        { call_site: "fn_critic", expected: LLM_MODEL, actual: actualModel, draft_id: draftId },
      ],
    );
    return json({ error: `MODEL_MISMATCH fn_critic: expected ${LLM_MODEL} got ${actualModel}` }, 500);
  }

  let parsed: any;
  try {
    parsed = JSON.parse(data.choices?.[0]?.message?.content || "{}");
  } catch (e: any) {
    return json({ error: `critic JSON parse failed: ${e.message}` }, 500);
  }
  const scores = parsed.scores || {};
  for (const dim of RUBRIC_DIMENSIONS) {
    if (typeof scores[dim] !== "number") scores[dim] = 0;
  }
  // Recompute weighted sum server-side; the model's self-reported number
  // disagrees with weights ~5% of the time and we trust the weights.
  const weightedSum = computeWeightedSum(scores, rubric.config);
  const passedThreshold = weightedSum >= threshold;
  const nextStage = passedThreshold ? "review_pending" : "rewriting";

  const rubricScoresOut = {
    rubric_version: rubric.version,
    scores,
    weighted_sum: weightedSum,
    threshold,
    recommendation: parsed.recommendation || (passedThreshold ? "APPROVE" : "REWRITE"),
    evidence: parsed.evidence || "",
    edits: parsed.edits || [],
    model_scores_self_report: parsed.weighted_sum,  // audit: did model compute the same?
  };

  await ctx.db.query(
    `UPDATE drafts SET
       stage          = $1::draft_stage,
       rubric_scores  = $2::jsonb,
       critic_model   = $3,
       updated_at     = now()
     WHERE id = $4`,
    [nextStage, JSON.stringify(rubricScoresOut), actualModel, draftId],
  );

  await ctx.db.query(
    `INSERT INTO health_heartbeats (job_name, ok, note) VALUES ('fn_critic', true, $1)`,
    [`draft=${draftId} score=${weightedSum}/${threshold} stage=${nextStage}`],
  );

  // If we dropped into rewriting and the rewriter isn't deployed (Phase 1),
  // surface an alert so the draft doesn't vanish into a state nobody watches.
  if (!passedThreshold) {
    await ctx.db.query(
      `INSERT INTO alerts (kind, severity, title, payload) VALUES
       ('draft_below_threshold', 'warn', $1, $2)`,
      [
        `Draft ${draftId.slice(0, 8)} scored ${weightedSum}/${threshold}; needs rewrite`,
        { draft_id: draftId, weighted_sum: weightedSum, threshold, scores },
      ],
    );
  }

  return json({
    ok: true,
    draft_id: draftId,
    weighted_sum: weightedSum,
    threshold,
    stage: nextStage,
    scores,
    edits_count: (parsed.edits || []).length,
  });
}

function json(body: any, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "Content-Type": "application/json",
      "Access-Control-Allow-Origin": "*",
    },
  });
}
