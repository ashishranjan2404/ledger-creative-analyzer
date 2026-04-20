/**
 * scout-dispatch-hourly — cron trigger, runs every hour.
 *
 * For each active user whose local delivery hour matches the current hour
 * in their timezone, and who doesn't already have a digest for today,
 * invokes scout-polish-now to produce + deliver their morning brief.
 *
 * This is the MVP of the design doc's §5 scout_dispatch. Simpler than
 * the step-function state machine described there, but honors the same
 * contract: idempotent on (user_id, run_date) and tolerant of per-user
 * failures (Promise.allSettled).
 *
 * Cron: 0 * * * * (every hour on the hour, UTC).
 *
 * Deployed 2026-04-20.
 */

export async function handler(_req: Request, ctx: any): Promise<Response> {
  const nowIso = new Date().toISOString();
  const runDate = nowIso.slice(0, 10); // UTC date — we pin per-user run_date this way for idempotency

  // Eligible users: interests.active = true, local delivery_hour == current
  // local hour in their tz, no digest for run_date yet.
  //
  // IANA timezones are resolved by Postgres (`timezone` cast). Users with
  // an unset / invalid timezone default to UTC (table default).
  const eligible = await ctx.db.query(
    `SELECT u.id, u.email, u.timezone, u.delivery_hour_local
     FROM users u
     JOIN interests i ON i.user_id = u.id
     WHERE i.active = true
       AND u.delivery_hour_local = EXTRACT(HOUR FROM (now() AT TIME ZONE u.timezone))::int
       AND NOT EXISTS (
         SELECT 1 FROM digests d
         WHERE d.user_id = u.id AND d.run_date = $1
       )`,
    [runDate]
  );

  if (eligible.rows.length === 0) {
    return jsonResponse({
      ok: true,
      run_date: runDate,
      eligible_count: 0,
      now: nowIso,
      note: "no eligible users this hour",
    });
  }

  const endpoint =
    ctx.env.THEDI_BASE_URL ||
    "https://api.butterbase.ai/v1/app_36ybfio2fiy7";
  const polishUrl = `${endpoint}/fn/scout-polish-now`;
  const adminToken = ctx.env.THEDI_ADMIN_TOKEN;

  // Dispatch in parallel. Per-user failures are captured, not rethrown.
  const tasks = eligible.rows.map(async (u: any) => {
    const t0 = Date.now();
    try {
      const res = await fetch(polishUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          admin_token: adminToken,
          user_id: u.id,
          run_date: runDate,
        }),
      });
      const body = await res.json().catch(() => ({}));
      const ok = res.ok && body?.ok !== false;

      await ctx.db.query(
        `INSERT INTO audit_log (user_id, step, ms, ok, note)
         VALUES ($1, 'dispatch', $2, $3, $4)`,
        [
          u.id,
          Date.now() - t0,
          ok,
          ok
            ? `digest_id=${body.digest_id || "?"} item_count=${body.item_count || 0}`
            : `http=${res.status} err=${(body.error || "").slice(0, 300)}`,
        ]
      );

      return {
        user_id: u.id,
        email: u.email,
        ok,
        digest_id: body.digest_id,
        item_count: body.item_count,
        total_ms: Date.now() - t0,
      };
    } catch (e: any) {
      const err = (e?.message || String(e)).slice(0, 500);
      await ctx.db.query(
        `INSERT INTO audit_log (user_id, step, ms, ok, note)
         VALUES ($1, 'dispatch', $2, false, $3)`,
        [u.id, Date.now() - t0, `fetch_error: ${err}`]
      );
      return { user_id: u.id, email: u.email, ok: false, error: err };
    }
  });

  const results = await Promise.allSettled(tasks);
  const dispatched = results.map((r) =>
    r.status === "fulfilled" ? r.value : { ok: false, reason: String(r.reason) }
  );

  const okCount = dispatched.filter((d: any) => d.ok).length;

  return jsonResponse({
    ok: true,
    run_date: runDate,
    now: nowIso,
    eligible_count: eligible.rows.length,
    ok_count: okCount,
    failed_count: dispatched.length - okCount,
    dispatched,
  });
}

function jsonResponse(body: any, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}
