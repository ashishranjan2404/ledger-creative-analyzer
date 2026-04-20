/**
 * scout-feedback-submit — user posts feedback on a digest.
 * Stores message + extracts structured prefs via a background IonRouter call.
 *
 * MVP auth: share_token is sufficient (capability-based).
 * Production: layer session auth on top.
 *
 * Fix 2026-04-20: was silently swallowing extraction errors and returning
 * {} when the LLM was unsure. Now: tighter prompt with one-shot, audit_log
 * row capturing the LLM response (or the error), and surfaced failure modes.
 */

const LLM_URL = "https://api.ionrouter.io/v1/chat/completions";
const LLM_MODEL = "qwen3.5-122b-a10b";

const EXTRACT_SYSTEM = `Extract the user's preferences from their feedback on a research digest.

Return STRICT JSON:
{"avoid": [string], "prefer": [string], "weight_changes": {"novelty": -1..1, "depth": -1..1, "applied": -1..1}}

Example input: "Too academic. I want practical CI/CD case studies and less theoretical ML."
Example output: {"avoid": ["theoretical ML papers"], "prefer": ["practical CI/CD case studies"], "weight_changes": {"applied": 0.5, "novelty": 0, "depth": -0.2}}

Example input: "Please crawl X and LinkedIn posts around AI SRE, AI DevOps and AI platform engineering."
Example output: {"avoid": [], "prefer": ["X posts about AI SRE", "LinkedIn posts about AI DevOps", "AI platform engineering posts"], "weight_changes": {"applied": 0.3, "novelty": 0.2, "depth": 0}}

Rules:
- If the user names specific topics, platforms, or sources (to include or exclude), capture them verbatim in prefer/avoid.
- Always return at least one non-empty entry in prefer OR avoid when the user gives any directional signal.
- weight_changes defaults to 0 for dimensions the user didn't mention.
- Return {"avoid": [], "prefer": [], "weight_changes": {}} ONLY if the user's feedback is purely conversational with no directional signal at all.`;

export async function handler(req: Request, ctx: any): Promise<Response> {
  const body = await req.json().catch(() => ({}));
  const { token, message } = body;
  if (!token || !message) return json({ error: "token+message required" }, 400);
  if (message.length > 2000) return json({ error: "message too long" }, 400);

  const d = await ctx.db.query(
    `SELECT id, user_id FROM digests WHERE share_token = $1`,
    [token]
  );
  if (!d.rows.length) return json({ error: "not found" }, 404);
  const { id: digestId, user_id: userId } = d.rows[0];

  // Extract structured prefs inline. Log every outcome to audit_log so
  // future digests can be debugged without re-running the call.
  let prefs: any = {};
  let extractOk = false;
  let extractNote: string | null = null;
  let extractTokens = { prompt: 0, completion: 0 };
  const tExtract = Date.now();

  try {
    const res = await fetch(LLM_URL, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${ctx.env.IONROUTER_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: LLM_MODEL,
        temperature: 0,
        max_tokens: 500,
        response_format: { type: "json_object" },
        messages: [
          { role: "system", content: EXTRACT_SYSTEM },
          { role: "user", content: message },
        ],
      }),
    });
    if (!res.ok) {
      const errText = await res.text();
      extractNote = `http_${res.status}: ${errText.slice(0, 400)}`;
    } else {
      const data: any = await res.json();
      const raw = data.choices?.[0]?.message?.content || "{}";
      extractTokens = {
        prompt: data.usage?.prompt_tokens || 0,
        completion: data.usage?.completion_tokens || 0,
      };
      try {
        prefs = JSON.parse(raw);
        extractOk = true;
        // Capture raw response shape for debuggability (truncated).
        const preview = JSON.stringify(prefs).slice(0, 600);
        extractNote = `tok=${extractTokens.prompt}+${extractTokens.completion} prefs=${preview}`;
      } catch (pe: any) {
        extractNote = `parse_error: ${(pe?.message || String(pe)).slice(0, 200)} raw=${raw.slice(0, 400)}`;
      }
    }
  } catch (e: any) {
    extractNote = `fetch_error: ${(e?.message || String(e)).slice(0, 400)}`;
  }

  // Audit the extraction outcome regardless of success.
  await ctx.db.query(
    `INSERT INTO audit_log (user_id, digest_id, step, model, prompt_tokens, completion_tokens, ms, ok, note)
     VALUES ($1, $2, 'feedback_extract', $3, $4, $5, $6, $7, $8)`,
    [
      userId,
      digestId,
      LLM_MODEL,
      extractTokens.prompt,
      extractTokens.completion,
      Date.now() - tExtract,
      extractOk,
      extractNote,
    ]
  );

  const inserted = await ctx.db.query(
    `INSERT INTO feedback (digest_id, user_id, message, extracted_prefs)
     VALUES ($1, $2, $3, $4) RETURNING id, created_at`,
    [digestId, userId, message, prefs]
  );

  return json({
    ok: true,
    feedback_id: inserted.rows[0].id,
    extracted_prefs: prefs,
    extract_ok: extractOk,
    created_at: inserted.rows[0].created_at,
  });
}

function json(body: any, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "Content-Type": "application/json",
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type",
    },
  });
}
