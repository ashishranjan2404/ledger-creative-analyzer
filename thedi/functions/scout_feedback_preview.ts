/**
 * scout-feedback-preview — re-rank today's findings given proposed prefs, without writing.
 * Called from the feedback chat UI to show "here's what tomorrow would look like"
 * after you submit this feedback. Closes the loop visibly inside the demo window.
 */

const LLM_URL = "https://api.ionrouter.io/v1/chat/completions";
const LLM_MODEL = "qwen3.5-122b-a10b";

export async function handler(req: Request, ctx: any): Promise<Response> {
  const body = await req.json().catch(() => ({}));
  const { token, user_message } = body;
  if (!token || !user_message) return json({ error: "token+user_message required" }, 400);

  const d = await ctx.db.query(
    `SELECT d.id, d.user_id, i.keywords
     FROM digests d JOIN interests i ON i.user_id = d.user_id
     WHERE d.share_token = $1`,
    [token]
  );
  if (!d.rows.length) return json({ error: "not found" }, 404);
  const { id: digestId, keywords } = d.rows[0];

  const f = await ctx.db.query(
    `SELECT rank, title, url, source, angle, summary FROM findings
     WHERE digest_id = $1 ORDER BY rank ASC`,
    [digestId]
  );
  const current = f.rows;

  const system = `You are Thedi's live re-ranker. Given the current digest + new user feedback,
re-rank the SAME items to preview what tomorrow's run would prioritize.
User's keywords: ${JSON.stringify(keywords)}
Return STRICT JSON: {"reasoning": "1 sentence why things moved", "top": [{"id": int, "new_rank": int}]}
Only rerank — do NOT drop items from the list.`;

  const catalog = current.map((it: any, idx: number) => ({
    id: idx,
    current_rank: it.rank,
    source: it.source,
    title: it.title.slice(0, 200),
    angle: it.angle,
  }));
  const user = `CURRENT DIGEST:\n${JSON.stringify(catalog, null, 1)}\n\nUSER'S NEW FEEDBACK:\n"${user_message}"`;

  try {
    const res = await fetch(LLM_URL, {
      method: "POST",
      headers: { Authorization: `Bearer ${ctx.env.IONROUTER_API_KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: LLM_MODEL,
        temperature: 0,
        max_tokens: 1200,
        response_format: { type: "json_object" },
        messages: [
          { role: "system", content: system },
          { role: "user", content: user },
        ],
      }),
    });
    if (!res.ok) throw new Error(`LLM ${res.status}: ${(await res.text()).slice(0, 200)}`);
    const data: any = await res.json();
    const parsed = JSON.parse(data.choices?.[0]?.message?.content || "{}");

    // Build preview list with diff
    const idToNewRank = new Map<number, number>();
    for (const p of parsed.top || []) idToNewRank.set(p.id, p.new_rank);

    const preview = current.map((it: any, idx: number) => ({
      title: it.title,
      url: it.url,
      source: it.source,
      angle: it.angle,
      current_rank: it.rank,
      new_rank: idToNewRank.get(idx) ?? it.rank,
      delta: (idToNewRank.get(idx) ?? it.rank) - it.rank,
    })).sort((a, b) => a.new_rank - b.new_rank);

    return json({
      ok: true,
      reasoning: parsed.reasoning || "",
      preview,
    });
  } catch (e: any) {
    return json({ ok: false, error: e?.message || String(e) }, 500);
  }
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
