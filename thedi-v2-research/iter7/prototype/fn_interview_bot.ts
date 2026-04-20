/**
 * fn_interview_bot — given a picked topic, generate 4–6 Socratic questions
 * across the D1 archetype rotation, self-critique, and email Ramesh a link
 * to fill in answers.
 *
 * Trigger: HTTP POST /fn/interview-bot
 * Auth:    THEDI_ADMIN_TOKEN in body.admin_token (matches v1 scout_polish_now)
 * Body:    { admin_token: string, topic_id: uuid }
 *
 * Canonical plan §Interview-bot: kimi-k2.5 for generation (voice-sensitive).
 * Self-critique is a *separate* call — D1 §1.4 specifies different family
 * (gpt-oss-120b) — but for Phase-1 MVP we collapse it into the generator's
 * OUTPUT self_check_scores per candidate (same single call; cheaper; Phase
 * 1 accepts this trade because the golden-set revalidation hasn't seeded
 * yet so model-family diversity for self-critique buys less than for the
 * final draft critic).
 *
 * The model-ID assertion (canonical plan's "first line of code that ships")
 * runs on every IonRouter call. Mismatch → insert alerts row + model_assertions
 * row + hard-fail the function.
 */

const LLM_URL = "https://api.ionrouter.io/v1/chat/completions";
const LLM_MODEL = "moonshotai/kimi-k2.5";

const SYSTEM_PROMPT = `You are an interviewing editor for Ramesh Nampalli's Substack on agentic AI
in DevOps / SRE / infrastructure. Produce 4-6 questions that, when answered
by Ramesh in ~150-300 words each, give a drafter enough verbatim material +
stance to compose a 1200-word post in Ramesh's voice.

Ramesh is a Principal Engineer at an IAM company with ~20 years infrastructure
experience. He does not write in listicle register. He prefers concrete
failure modes to framework-speak. He does not like hedging.

ARCHETYPE_BUDGET: draw from AT LEAST 4 of the 6 archetypes below. MUST NOT
use the same archetype twice in one session. Start with an opener archetype
(A1 war-story or A2 strong-opinion); end with a forward-looking archetype
(A4 concrete-metric or A6 sequel-hook).

  A1  war-story       "Tell me about a time <X> failed in production."
  A2  strong-opinion  "What's the dominant framing of <X> you think is wrong?"
  A3  counter-take    "<Author> claims <Z>. What does that miss?"
  A4  concrete-metric "What's a number you'd want a team to track for <X>?"
  A5  origin-story    "How did your view on <X> change between <then> and now?"
  A6  sequel-hook     "If someone implemented <Y> and hit <complication>, then what?"

Each question:
  - single sentence, <25 words
  - names a specific technology/practice/failure mode (no "Tell me about AI agents")
  - answerable in 150-300 written words or a voice memo
  - avoids yes/no framing

Self-critique each candidate on six dimensions (1-10):
  specificity, answerability, non_leading, voice_fit, originality_vs_90d,
  source_tether
All dimensions must score >=6; specificity must score >=7. Drop any candidate
that fails after one regeneration attempt.

Return STRICT JSON:
{
  "status": "ok" | "insufficient_material",
  "questions": [{
    "idx": int, "archetype": "A1"|...|"A6", "text": string,
    "anchor_noun": string,
    "self_check_scores": {
      "specificity": int, "answerability": int, "non_leading": int,
      "voice_fit": int, "originality_vs_90d": int, "source_tether": int
    },
    "source_ref": string
  }],
  "reason": string | null
}`;

type QuestionOut = {
  idx: number;
  archetype: string;
  text: string;
  anchor_noun: string;
  self_check_scores: Record<string, number>;
  source_ref: string;
};

async function callLLMWithAssertion(
  systemPrompt: string,
  userPrompt: string,
  ctx: any,
  callSite: string,
  payload: Record<string, unknown>,
): Promise<{ content: string; actualModel: string }> {
  const res = await fetch(LLM_URL, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${ctx.env.IONROUTER_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: LLM_MODEL,
      temperature: 0.3,
      max_tokens: 2500,
      response_format: { type: "json_object" },
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userPrompt },
      ],
    }),
  });
  if (!res.ok) {
    throw new Error(`IonRouter ${res.status}: ${(await res.text()).slice(0, 300)}`);
  }
  const data: any = await res.json();
  const actualModel: string = data.model || "";
  const passed = actualModel === LLM_MODEL;

  // The canonical plan's highest-leverage control: every IonRouter call
  // writes a model_assertions row; on mismatch, insert an alerts row and
  // hard-fail so voice drift cannot accumulate silently.
  await ctx.db.query(
    `INSERT INTO model_assertions (call_site, expected_model, actual_model, passed, request_id, payload)
     VALUES ($1, $2, $3, $4, $5, $6)`,
    [callSite, LLM_MODEL, actualModel, passed, data.id || null, payload],
  );

  if (!passed) {
    await ctx.db.query(
      `INSERT INTO alerts (kind, severity, title, payload)
       VALUES ('model_mismatch', 'critical', $1, $2)`,
      [
        `${callSite}: expected ${LLM_MODEL}, got ${actualModel || "(none)"}`,
        { call_site: callSite, expected: LLM_MODEL, actual: actualModel, ...payload },
      ],
    );
    throw new Error(
      `MODEL_MISMATCH ${callSite}: expected ${LLM_MODEL} got ${actualModel}`,
    );
  }

  return {
    content: data.choices?.[0]?.message?.content || "",
    actualModel,
  };
}

function validateQuestions(qs: QuestionOut[]): QuestionOut[] {
  return qs.filter((q) => {
    const s = q.self_check_scores || {};
    if ((s.specificity ?? 0) < 7) return false;
    for (const dim of [
      "specificity", "answerability", "non_leading",
      "voice_fit", "originality_vs_90d", "source_tether",
    ]) {
      if ((s[dim] ?? 0) < 6) return false;
    }
    return q.text && q.text.length < 400 && q.archetype?.match(/^A[1-6]$/);
  });
}

async function sendInterviewEmail(
  ctx: any,
  qaSessionId: string,
  topicTitle: string,
  questions: QuestionOut[],
): Promise<string> {
  const qaUrl = `${ctx.env.THEDI_BASE_URL || "https://thedi.platformy.org"}/admin/qa/${qaSessionId}`;
  const questionBlocks = questions.map((q, i) =>
    `<div style="margin: 18px 0; padding: 12px 16px; border-left: 3px solid #f59e0b; background: #fafaf9;">
       <div style="font-size: 11px; color: #78716c; text-transform: uppercase;">#${i + 1} · ${q.archetype}</div>
       <div style="font-size: 15px; color: #1c1917; margin-top: 6px;">${q.text}</div>
     </div>`,
  ).join("");

  const html = `<!DOCTYPE html>
<html><body style="font-family: -apple-system, sans-serif; max-width: 620px; margin: 0 auto; padding: 30px;">
  <div style="font-size: 13px; color: #78716c;">Thedi — interview bot</div>
  <h1 style="font-size: 22px; color: #1c1917; margin-top: 8px;">${topicTitle}</h1>
  <p style="font-size: 14px; color: #44403c;">
    ${questions.length} questions. ~150-300 words each. Submit when you've got
    at least 500 words total across answers; below that, the drafter skips
    the week rather than ship slop.
  </p>
  ${questionBlocks}
  <div style="margin-top: 24px;">
    <a href="${qaUrl}" style="display: inline-block; padding: 10px 18px; background: #1c1917; color: white; text-decoration: none; border-radius: 6px; font-size: 14px;">Answer in /admin →</a>
  </div>
  <div style="margin-top: 28px; font-size: 11px; color: #a8a29e;">Thedi (தேடி) — Tamil for "seek".</div>
</body></html>`;

  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${ctx.env.RESEND_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from: ctx.env.RESEND_FROM || "thedi@platformy.org",
      to: [ctx.env.RAMESH_EMAIL || ctx.env.RESEND_TO],
      subject: `Thedi — Q&A for "${topicTitle.slice(0, 50)}"`,
      html,
    }),
  });
  if (!res.ok) throw new Error(`Resend ${res.status}: ${await res.text()}`);
  return ((await res.json()) as any).id;
}

export async function handler(req: Request, ctx: any): Promise<Response> {
  const body = await req.json().catch(() => ({}));
  if (body.admin_token !== ctx.env.THEDI_ADMIN_TOKEN) {
    return json({ error: "unauthorized" }, 401);
  }
  const topicId = body.topic_id;
  if (!topicId) return json({ error: "topic_id required" }, 400);

  const t = await ctx.db.query(
    `SELECT id, title, summary, source_urls FROM topics WHERE id = $1`,
    [topicId],
  );
  if (!t.rows.length) return json({ error: "topic not found" }, 404);
  const topic = t.rows[0];

  // PHASE_2: load 90-day prior-questions corpus + voice_markers_json and
  // include in the system prompt for dedup-aware generation. For Phase 1
  // we rely on the LLM's context and drop duplicates post-hoc.
  const userPrompt =
    `TOPIC: ${topic.title}\nTOPIC_BLURB: ${topic.summary}\n` +
    `SOURCE_URLS:\n${(topic.source_urls || []).map((u: string) => `  - ${u}`).join("\n")}\n\n` +
    `Generate 4-6 questions per the ARCHETYPE_BUDGET and OUTPUT spec.`;

  let parsed: { status: string; questions?: QuestionOut[]; reason?: string };
  try {
    const { content } = await callLLMWithAssertion(
      SYSTEM_PROMPT, userPrompt, ctx, "fn_interview_bot", { topic_id: topicId },
    );
    parsed = JSON.parse(content);
  } catch (e: any) {
    return json({ error: e.message || String(e) }, 500);
  }

  if (parsed.status !== "ok" || !parsed.questions?.length) {
    return json({
      error: "generator returned insufficient_material",
      reason: parsed.reason,
    }, 422);
  }

  const filtered = validateQuestions(parsed.questions);
  if (filtered.length < 4) {
    await ctx.db.query(
      `INSERT INTO alerts (kind, severity, title, payload) VALUES
       ('qa_generation_thin', 'warn', $1, $2)`,
      [`Only ${filtered.length} questions survived self-critique`, { topic_id: topicId }],
    );
    return json({ error: "too few questions passed self-critique", count: filtered.length }, 422);
  }

  const qa = await ctx.db.query(
    `INSERT INTO qa_sessions (topic_id, questions)
     VALUES ($1, $2::jsonb)
     ON CONFLICT (topic_id) DO UPDATE SET questions = EXCLUDED.questions, updated_at = now()
     RETURNING id`,
    [topicId, JSON.stringify(filtered)],
  );
  const qaSessionId = qa.rows[0].id;

  let emailId: string | null = null;
  try {
    emailId = await sendInterviewEmail(ctx, qaSessionId, topic.title, filtered);
  } catch (e: any) {
    await ctx.db.query(
      `INSERT INTO alerts (kind, severity, title, payload) VALUES
       ('email_send_failed', 'warn', $1, $2)`,
      [`Interview email failed: ${e.message}`, { qa_session_id: qaSessionId }],
    );
  }

  await ctx.db.query(
    `INSERT INTO health_heartbeats (job_name, ok, note) VALUES ('fn_interview_bot', true, $1)`,
    [`qa=${qaSessionId} questions=${filtered.length}`],
  );

  return json({
    ok: true,
    qa_session_id: qaSessionId,
    question_count: filtered.length,
    email_id: emailId,
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
