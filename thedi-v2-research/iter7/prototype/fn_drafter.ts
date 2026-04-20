/**
 * fn_drafter — given a qa_session_id, produce a 1200-word first draft
 * anchored to Ramesh's verbatim Q&A answers.
 *
 * Trigger: HTTP POST /fn/drafter
 * Auth:    THEDI_ADMIN_TOKEN in body.admin_token
 * Body:    { admin_token: string, qa_session_id: uuid }
 *
 * Model: kimi-k2.5 (canonical plan §Drafter: EQ-Bench Creative top of OSS
 *        pool, ~1/5 cost of Claude Sonnet, voice-sensitive).
 *
 * Guardrails (in order):
 *   1. word_count < 500  → emit qa_underweight alert, do NOT draft.
 *   2. IonRouter response.model == LLM_MODEL  → else insert alert + hard-fail.
 *   3. System prompt instructs verbatim-phrasing preservation; no hallucinated
 *      facts; use only what's in Q&A + topic summary.
 */

const LLM_URL = "https://api.ionrouter.io/v1/chat/completions";
const LLM_MODEL = "moonshotai/kimi-k2.5";
const MIN_WORDS = 500;

const SYSTEM_PROMPT = `You are drafting a ~1200-word Substack post in Ramesh Nampalli's voice.
Ramesh is a Principal Engineer at an IAM company with ~20 years infrastructure
experience. He writes about agentic AI in DevOps / SRE.

VOICE RULES — HARD:
  1. Anchor to Ramesh's verbatim phrasings from QA_VERBATIM. Where a Q&A
     answer contains a concrete anecdote, number, or turn of phrase, quote
     or near-quote it — do NOT paraphrase into generic prose.
  2. Concrete failure modes over framework-speak. No "landscape", "paradigm
     shift", "unleash", "leverage", "in conclusion". No em-dash overuse
     (target <2 per 400 words).
  3. No hedging stacks ("could potentially in some cases may"). Claims
     should be load-bearing.
  4. No fabricated citations. Only reference papers/people explicitly
     surfaced in TOPIC_SOURCES or Q&A answers.
  5. Open with a war-story or strong-opinion sentence pulled from Q&A Q1.
     Close with a sequel hook or concrete-metric from Q4-6 if available.

STRUCTURE:
  - 4-6 sections (## h2 headings), each 150-300 words
  - Markdown only (no HTML)
  - No listicle registers unless Ramesh used one verbatim
  - Byline-safe: nothing in the draft should surprise Ramesh relative to
    what he actually said in Q&A.

Return STRICT JSON:
{
  "body_md": "<full markdown draft, 1000-1400 words>",
  "word_count": int,
  "anchor_quotes": [{"from_q_idx": int, "phrase": "<verbatim from Ramesh>"}]
}`;

async function callDrafter(
  topicTitle: string,
  topicSummary: string,
  sourceUrls: string[],
  questions: any[],
  answers: Record<string, string>,
  ctx: any,
  qaSessionId: string,
): Promise<{ bodyMd: string; wordCount: number; anchorQuotes: any[]; actualModel: string }> {
  const qaBlock = questions.map((q: any, i: number) => {
    const key = String(q.idx ?? i + 1);
    const ans = answers[key] || answers[String(i + 1)] || "(no answer)";
    return `Q${key} [${q.archetype}]: ${q.text}\nA${key}: ${ans}`;
  }).join("\n\n");

  const user = `TOPIC: ${topicTitle}
TOPIC_BLURB: ${topicSummary}

TOPIC_SOURCES:
${sourceUrls.map((u) => `  - ${u}`).join("\n")}

QA_VERBATIM:
${qaBlock}

Draft the post per SYSTEM rules. Return STRICT JSON.`;

  const res = await fetch(LLM_URL, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${ctx.env.IONROUTER_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: LLM_MODEL,
      temperature: 0.5,
      max_tokens: 4000,
      response_format: { type: "json_object" },
      messages: [
        { role: "system", content: SYSTEM_PROMPT },
        { role: "user", content: user },
      ],
    }),
  });
  if (!res.ok) {
    throw new Error(`IonRouter ${res.status}: ${(await res.text()).slice(0, 300)}`);
  }
  const data: any = await res.json();
  const actualModel: string = data.model || "";
  const passed = actualModel === LLM_MODEL;

  // Canonical plan's single highest-leverage control.
  await ctx.db.query(
    `INSERT INTO model_assertions (call_site, expected_model, actual_model, passed, request_id, payload)
     VALUES ('fn_drafter', $1, $2, $3, $4, $5)`,
    [LLM_MODEL, actualModel, passed, data.id || null, { qa_session_id: qaSessionId }],
  );

  if (!passed) {
    await ctx.db.query(
      `INSERT INTO alerts (kind, severity, title, payload) VALUES
       ('model_mismatch', 'critical', $1, $2)`,
      [
        `fn_drafter: expected ${LLM_MODEL}, got ${actualModel || "(none)"}`,
        { call_site: "fn_drafter", expected: LLM_MODEL, actual: actualModel, qa_session_id: qaSessionId },
      ],
    );
    throw new Error(`MODEL_MISMATCH fn_drafter: expected ${LLM_MODEL} got ${actualModel}`);
  }

  const content = data.choices?.[0]?.message?.content || "{}";
  const parsed = JSON.parse(content);
  return {
    bodyMd: parsed.body_md || "",
    wordCount: parsed.word_count || (parsed.body_md || "").split(/\s+/).filter(Boolean).length,
    anchorQuotes: parsed.anchor_quotes || [],
    actualModel,
  };
}

async function sendQaUnderweightEmail(
  ctx: any,
  qaSessionId: string,
  wordCount: number,
): Promise<void> {
  const continueUrl = `${ctx.env.THEDI_BASE_URL || "https://thedi.platformy.org"}/admin/qa/${qaSessionId}`;
  const html = `<div style="font-family: -apple-system, sans-serif; max-width: 560px; margin: 0 auto; padding: 30px;">
<h2 style="color: #1c1917;">Thedi — skip this week?</h2>
<p>This week's Q&amp;A has <b>${wordCount} words</b> of answers so far
(&lt;${MIN_WORDS}). At that level the drafter generates more slop than
signal, so I'd rather skip than ship something you'd rewrite.</p>
<p>Three options — reply with the letter:</p>
<p><b>(a)</b> Skip this week. Next topic-picker Thursday.<br/>
<b>(b)</b> 5-min voice memo (MacWhisper, local-only). Paste transcript at:
<a href="${continueUrl}">${continueUrl}</a><br/>
<b>(c)</b> Extend Q&amp;A by 48 hours. Just reply to any question.</p>
<p style="color: #78716c; font-size: 13px;">Default on no reply by 48h: option (a).</p>
</div>`;

  await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${ctx.env.RESEND_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from: ctx.env.RESEND_FROM || "thedi@platformy.org",
      to: [ctx.env.RAMESH_EMAIL || ctx.env.RESEND_TO],
      subject: "Thedi — skip this week? (takes 30 seconds)",
      html,
    }),
  });
}

export async function handler(req: Request, ctx: any): Promise<Response> {
  const body = await req.json().catch(() => ({}));
  if (body.admin_token !== ctx.env.THEDI_ADMIN_TOKEN) {
    return json({ error: "unauthorized" }, 401);
  }
  const qaSessionId = body.qa_session_id;
  if (!qaSessionId) return json({ error: "qa_session_id required" }, 400);

  const q = await ctx.db.query(
    `SELECT qs.id, qs.topic_id, qs.questions, qs.answers, qs.word_count,
            t.title, t.summary, t.source_urls
     FROM qa_sessions qs JOIN topics t ON t.id = qs.topic_id
     WHERE qs.id = $1`,
    [qaSessionId],
  );
  if (!q.rows.length) return json({ error: "qa_session not found" }, 404);
  const row = q.rows[0];

  // Guardrail 1: minimum-input threshold (D1 §1.5)
  if ((row.word_count || 0) < MIN_WORDS) {
    await ctx.db.query(
      `INSERT INTO alerts (kind, severity, title, payload) VALUES
       ('qa_underweight', 'warn', $1, $2)`,
      [
        `Q&A has ${row.word_count} words (<${MIN_WORDS}); drafter skipped`,
        { qa_session_id: qaSessionId, word_count: row.word_count, topic_id: row.topic_id },
      ],
    );
    try {
      await sendQaUnderweightEmail(ctx, qaSessionId, row.word_count || 0);
    } catch (e: any) {
      // Non-fatal: alert already logged.
    }
    return json({
      ok: false,
      skipped: true,
      reason: "qa_underweight",
      word_count: row.word_count,
      threshold: MIN_WORDS,
    });
  }

  let drafted;
  try {
    drafted = await callDrafter(
      row.title, row.summary, row.source_urls || [],
      row.questions || [], row.answers || {},
      ctx, qaSessionId,
    );
  } catch (e: any) {
    return json({ error: e.message || String(e) }, 500);
  }
  if (!drafted.bodyMd || drafted.bodyMd.length < 500) {
    return json({ error: "draft too short", word_count: drafted.wordCount }, 500);
  }

  const ins = await ctx.db.query(
    `INSERT INTO drafts (topic_id, qa_session_id, body_md, version, stage,
                         source, drafter_model)
     VALUES ($1, $2, $3, 1, 'drafting', 'interview_bot', $4)
     ON CONFLICT (topic_id, version) DO UPDATE SET
       body_md       = EXCLUDED.body_md,
       drafter_model = EXCLUDED.drafter_model,
       stage         = 'drafting',
       updated_at    = now()
     RETURNING id`,
    [row.topic_id, qaSessionId, drafted.bodyMd, drafted.actualModel],
  );
  const draftId = ins.rows[0].id;

  await ctx.db.query(
    `INSERT INTO health_heartbeats (job_name, ok, note) VALUES ('fn_drafter', true, $1)`,
    [`draft=${draftId} words=${drafted.wordCount}`],
  );

  return json({
    ok: true,
    draft_id: draftId,
    word_count: drafted.wordCount,
    anchor_count: drafted.anchorQuotes.length,
    stage: "drafting",
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
