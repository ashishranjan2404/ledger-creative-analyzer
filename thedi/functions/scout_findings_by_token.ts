/**
 * scout-findings-by-token — read-only fetch of a digest's findings + metadata.
 * Used by /f/:token (findings page) and /r/:token (replay page).
 * Public read via share_token (unguessable 32B urlsafe).
 */

export async function handler(req: Request, ctx: any): Promise<Response> {
  const url = new URL(req.url);
  const token = url.searchParams.get("token") || (await req.json().catch(() => ({}))).token;
  if (!token) return json({ error: "token required" }, 400);

  const d = await ctx.db.query(
    `SELECT d.id, d.run_date, d.status, d.item_count, d.critique_text, d.critic_accepted,
            d.share_token, d.sent_at, d.created_at, u.email, i.keywords
     FROM digests d
     JOIN users u ON u.id = d.user_id
     LEFT JOIN interests i ON i.user_id = d.user_id
     WHERE d.share_token = $1`,
    [token]
  );
  if (!d.rows.length) return json({ error: "not found" }, 404);
  const digest = d.rows[0];

  const f = await ctx.db.query(
    `SELECT rank, source, title, url, score, angle, summary, initial_rank
     FROM findings WHERE digest_id = $1 ORDER BY rank ASC`,
    [digest.id]
  );

  return json({
    digest: {
      id: digest.id,
      run_date: digest.run_date,
      status: digest.status,
      item_count: digest.item_count,
      critique: digest.critique_text,
      critic_accepted: digest.critic_accepted,
      user_email: digest.email,
      keywords: digest.keywords,
      created_at: digest.created_at,
      sent_at: digest.sent_at,
    },
    findings: f.rows,
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
