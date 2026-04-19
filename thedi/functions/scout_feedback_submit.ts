/**
 * scout-feedback-submit — user posts feedback on a digest.
 * Stores message + extracts structured prefs via a background IonRouter call.
 *
 * MVP auth: share_token is sufficient (capability-based).
 * Production: layer session auth on top.
 */

const LLM_URL = "https://api.ionrouter.io/v1/chat/completions";
const LLM_MODEL = "qwen3.5-122b-a10b";

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

  // Extract structured prefs inline (acceptable latency — single call, ~2s)
  let prefs: any = {};
  try {
    const res = await fetch(LLM_URL, {
      method: "POST",
      headers: { Authorization: `Bearer ${ctx.env.IONROUTER_API_KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: LLM_MODEL,
        temperature: 0,
        max_tokens: 500,
        response_format: { type: "json_object" },
        messages: [
          {
            role: "system",
            content: `Extract the user's preferences from their feedback on a research digest.
Return STRICT JSON: {"avoid": [string], "prefer": [string], "weight_changes": {"novelty": -1..1, "depth": -1..1, "applied": -1..1}}
Keep avoid/prefer concise (short phrases). weight_changes defaults to 0 for absent dimensions.`,
          },
          { role: "user", content: message },
        ],
      }),
    });
    if (res.ok) {
      const data: any = await res.json();
      prefs = JSON.parse(data.choices?.[0]?.message?.content || "{}");
    }
  } catch {}

  const inserted = await ctx.db.query(
    `INSERT INTO feedback (digest_id, user_id, message, extracted_prefs)
     VALUES ($1, $2, $3, $4) RETURNING id, created_at`,
    [digestId, userId, message, prefs]
  );

  return json({
    ok: true,
    feedback_id: inserted.rows[0].id,
    extracted_prefs: prefs,
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
