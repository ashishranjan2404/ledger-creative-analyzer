/**
 * scout_polish_now — synchronous end-to-end pipeline for ONE user.
 *
 * Trigger: HTTP POST /fn/scout-polish-now
 * Auth: THEDI_ADMIN_TOKEN in X-Admin-Token header
 * Role: service (bypasses RLS — intentional, cross-user reads)
 *
 * Body: { user_id: string, run_date?: string (default today), seed_token?: string }
 *
 * Runs the full pipeline synchronously:
 *   INGEST → SELECT → CRITIC → REFINE → RED_FLAG → FINALIZE → RENDER → DELIVER
 *
 * For hackathon demo: 1 LLM iteration (no retry loop). Cost: <$0.05/run on Haiku.
 * Expected wall clock: 30s–3min depending on source latency.
 */

import { randomBytes } from "node:crypto";

// Hosts allowed through red_flag. Exact matches for stable hosts;
// suffix matching (see isHostAllowed) for .substack.com publications.
const ALLOWED_HOSTS = new Set([
  "arxiv.org",
  "www.arxiv.org",
  "news.ycombinator.com",
  "nitter.net",
  "nitter.poast.org",
  "twitter.com",
  "x.com",
  "bsky.app",
  "lobste.rs",
]);
const ALLOWED_HOST_SUFFIXES = [".substack.com"];

function isHostAllowed(hostname: string): boolean {
  if (ALLOWED_HOSTS.has(hostname)) return true;
  return ALLOWED_HOST_SUFFIXES.some((s) => hostname.endsWith(s));
}

const LLM_URL = "https://api.ionrouter.io/v1/chat/completions";
const LLM_MODEL = "qwen3.5-122b-a10b";

// Curated list of senior-IC / agentic-AI / SRE-adjacent Substacks.
// Feel free to expand; each entry should expose a working /feed endpoint.
const SUBSTACK_PUBLICATIONS: string[] = [
  "newsletter.pragmaticengineer.com",
  "blog.bytebytego.com",
  "newsletter.systemdesign.one",
  "read.highgrowthengineer.com",
  "newsletter.engineeringleadership.com",
  "www.aisnakeoil.com",
  "www.oneusefulthing.org",
  "mlops.substack.com",
];

// Small fetch-with-timeout helper so one slow source can't stall the pipeline.
async function fetchWithTimeout(
  url: string,
  timeoutMs: number,
  init?: RequestInit
): Promise<Response> {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    return await fetch(url, { ...init, signal: ctrl.signal });
  } finally {
    clearTimeout(t);
  }
}

// ---------------------------------------------------------------------------
// INGEST — arxiv + HN Algolia (X/RSS skipped for demo reliability)
// ---------------------------------------------------------------------------

type RawItem = {
  source: "arxiv" | "hn" | "x_rss" | "bsky" | "substack" | "lobsters";
  title: string;
  url: string;
  snippet?: string;
  published?: string;
};

async function fetchArxiv(keywords: string[]): Promise<RawItem[]> {
  const q = keywords
    .slice(0, 5)
    .map((k) => `all:${encodeURIComponent(k)}`)
    .join("+OR+");
  const url = `http://export.arxiv.org/api/query?search_query=${q}&sortBy=submittedDate&sortOrder=descending&max_results=25`;
  const res = await fetch(url, { headers: { "User-Agent": "Thedi/0.1" } });
  if (!res.ok) return [];
  const xml = await res.text();
  const entries = xml.split(/<entry>/).slice(1);
  return entries.slice(0, 25).map((e) => {
    const title = (e.match(/<title>([\s\S]*?)<\/title>/)?.[1] || "")
      .replace(/\s+/g, " ")
      .trim();
    const url = (e.match(/<id>([\s\S]*?)<\/id>/)?.[1] || "").trim();
    const snippet = (e.match(/<summary>([\s\S]*?)<\/summary>/)?.[1] || "")
      .replace(/\s+/g, " ")
      .trim()
      .slice(0, 400);
    const published = (e.match(/<published>([\s\S]*?)<\/published>/)?.[1] || "").trim();
    return { source: "arxiv" as const, title, url, snippet, published };
  }).filter((i) => i.title && i.url);
}

async function fetchHN(keywords: string[]): Promise<RawItem[]> {
  const query = encodeURIComponent(keywords.slice(0, 5).join(" OR "));
  const url = `https://hn.algolia.com/api/v1/search_by_date?query=${query}&tags=story&hitsPerPage=25`;
  const res = await fetch(url);
  if (!res.ok) return [];
  const data: any = await res.json();
  return (data.hits || []).map((h: any) => ({
    source: "hn" as const,
    title: h.title || h.story_title || "(untitled)",
    url: h.url || `https://news.ycombinator.com/item?id=${h.objectID}`,
    snippet: (h.story_text || "").slice(0, 400),
    published: h.created_at,
  })).filter((i: any) => i.title && i.url);
}

// ---------------------------------------------------------------------------
// New sources added 2026-04-20 — addresses Ramesh's "crawl X and LinkedIn"
// feedback and the landing-page promise of non-academic coverage.
//
// Design intent: landing page pitches arxiv + HN + X; the first-ship scout
// only did arxiv + HN. We now add X (via RSSHub, fragile but tried),
// Bluesky (full public API, reliable), Substack (curated publication RSS,
// reliable), and Lobsters (tag RSS, reliable). Failures are per-source and
// do not fail the whole ingest (ingest() uses Promise.allSettled).
// ---------------------------------------------------------------------------

// Minimal RSS 2.0 / Atom parser — no XML library available in Deno-serverless.
// Returns items by matching <item> or <entry> blocks via regex.
function parseRssLike(xml: string, source: RawItem["source"]): RawItem[] {
  const out: RawItem[] = [];
  const itemBlocks = xml.match(/<(?:item|entry)[\s\S]*?<\/(?:item|entry)>/g) || [];
  for (const block of itemBlocks.slice(0, 25)) {
    const titleMatch = block.match(/<title[^>]*>([\s\S]*?)<\/title>/);
    const linkMatch =
      block.match(/<link[^>]*href=["']([^"']+)["']/) ||
      block.match(/<link[^>]*>([\s\S]*?)<\/link>/);
    const descMatch =
      block.match(/<description[^>]*>([\s\S]*?)<\/description>/) ||
      block.match(/<summary[^>]*>([\s\S]*?)<\/summary>/) ||
      block.match(/<content[^>]*>([\s\S]*?)<\/content>/);
    const dateMatch =
      block.match(/<pubDate[^>]*>([\s\S]*?)<\/pubDate>/) ||
      block.match(/<published[^>]*>([\s\S]*?)<\/published>/) ||
      block.match(/<updated[^>]*>([\s\S]*?)<\/updated>/);

    const title = stripMarkup(titleMatch?.[1] || "").slice(0, 300);
    const url = (linkMatch?.[1] || "").trim();
    const snippet = stripMarkup(descMatch?.[1] || "")
      .replace(/\s+/g, " ")
      .trim()
      .slice(0, 400);
    const published = (dateMatch?.[1] || "").trim();

    if (title && url) {
      out.push({ source, title, url, snippet, published });
    }
  }
  return out;
}

function stripMarkup(s: string): string {
  // Strip CDATA, HTML tags, and common entities.
  return s
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1")
    .replace(/<[^>]+>/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&nbsp;/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

async function fetchX(keywords: string[]): Promise<RawItem[]> {
  // RSSHub public instance. Fragile as of 2026 — rate-limited, occasionally down.
  // Conservative: 2 keywords, short timeout, silent per-query failure.
  const items: RawItem[] = [];
  for (const kw of keywords.slice(0, 2)) {
    try {
      const url = `https://rsshub.app/twitter/keyword/${encodeURIComponent(kw)}?limit=10`;
      const res = await fetchWithTimeout(url, 8000, {
        headers: { "User-Agent": "Thedi/0.2" },
      });
      if (!res.ok) continue;
      const xml = await res.text();
      items.push(...parseRssLike(xml, "x_rss"));
    } catch {
      // swallowed by design — one source failure must not fail the whole run
    }
  }
  // Dedup by URL and cap.
  const seen = new Set<string>();
  return items.filter((i) => (seen.has(i.url) ? false : (seen.add(i.url), true))).slice(0, 15);
}

async function fetchBluesky(keywords: string[]): Promise<RawItem[]> {
  // Bluesky public search API — no auth required.
  // Docs: https://docs.bsky.app/docs/api/app-bsky-feed-search-posts
  const items: RawItem[] = [];
  for (const kw of keywords.slice(0, 3)) {
    try {
      const url =
        `https://public.api.bsky.app/xrpc/app.bsky.feed.searchPosts` +
        `?q=${encodeURIComponent(kw)}&sort=latest&limit=10`;
      const res = await fetchWithTimeout(url, 6000, {
        headers: { "User-Agent": "Thedi/0.2" },
      });
      if (!res.ok) continue;
      const data: any = await res.json();
      for (const post of data.posts || []) {
        const text = post?.record?.text || "";
        if (!text || text.length < 20) continue;
        const handle = post?.author?.handle || "unknown";
        const rkey = (post?.uri || "").split("/").pop() || "";
        const url = `https://bsky.app/profile/${handle}/post/${rkey}`;
        const firstLine = text.split("\n")[0].slice(0, 280);
        items.push({
          source: "bsky" as any,
          title: `@${handle}: ${firstLine}`,
          url,
          snippet: text.slice(0, 400),
          published: post?.record?.createdAt,
        });
      }
    } catch {
      // ignored per contract
    }
  }
  return items.slice(0, 12);
}

async function fetchSubstack(_keywords: string[]): Promise<RawItem[]> {
  // Per-publication RSS. Curated list is senior-IC / agentic-AI / SRE-adjacent.
  // Keyword filtering happens in the select stage — the RSS items are the pool.
  const items: RawItem[] = [];
  const tasks = SUBSTACK_PUBLICATIONS.map(async (host) => {
    try {
      const url = `https://${host}/feed`;
      const res = await fetchWithTimeout(url, 6000, {
        headers: { "User-Agent": "Thedi/0.2" },
      });
      if (!res.ok) return [];
      const xml = await res.text();
      // Tag parsed items with the source=substack and keep only recent-ish entries.
      const parsed = parseRssLike(xml, "substack" as any);
      return parsed.slice(0, 3); // cap per-publication to keep the pool balanced
    } catch {
      return [];
    }
  });
  const results = await Promise.allSettled(tasks);
  for (const r of results) {
    if (r.status === "fulfilled") items.push(...r.value);
  }
  return items.slice(0, 24);
}

async function fetchLobsters(keywords: string[]): Promise<RawItem[]> {
  // Lobsters: search RSS feed. Smaller community, higher signal/noise than HN.
  const items: RawItem[] = [];
  for (const kw of keywords.slice(0, 3)) {
    try {
      const url = `https://lobste.rs/search.rss?q=${encodeURIComponent(kw)}&what=stories`;
      const res = await fetchWithTimeout(url, 5000, {
        headers: { "User-Agent": "Thedi/0.2" },
      });
      if (!res.ok) continue;
      const xml = await res.text();
      items.push(...parseRssLike(xml, "lobsters" as any));
    } catch {
      // ignored
    }
  }
  const seen = new Set<string>();
  return items.filter((i) => (seen.has(i.url) ? false : (seen.add(i.url), true))).slice(0, 10);
}

async function ingest(keywords: string[]): Promise<RawItem[]> {
  // Six sources in parallel. Each has its own timeout + swallow-on-error,
  // so a single outage can't collapse the run.
  const results = await Promise.allSettled([
    fetchArxiv(keywords),
    fetchHN(keywords),
    fetchX(keywords),
    fetchBluesky(keywords),
    fetchSubstack(keywords),
    fetchLobsters(keywords),
  ]);
  const items: RawItem[] = [];
  for (const r of results) {
    if (r.status === "fulfilled") items.push(...r.value);
  }
  return items;
}

// ---------------------------------------------------------------------------
// LLM — OpenRouter (OpenAI-compatible) using Haiku
// ---------------------------------------------------------------------------

async function callLLM(
  systemPrompt: string,
  userPrompt: string,
  env: Record<string, string>,
  jsonMode = true
): Promise<{ content: string; tokens: { prompt: number; completion: number } }> {
  const body: any = {
    model: LLM_MODEL,
    temperature: 0,
    max_tokens: 2000,
    messages: [
      { role: "system", content: systemPrompt },
      { role: "user", content: userPrompt },
    ],
  };
  if (jsonMode) body.response_format = { type: "json_object" };

  const res = await fetch(LLM_URL, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${env.IONROUTER_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`LLM ${res.status}: ${errText.slice(0, 300)}`);
  }
  const data: any = await res.json();
  return {
    content: data.choices?.[0]?.message?.content || "",
    tokens: {
      prompt: data.usage?.prompt_tokens || 0,
      completion: data.usage?.completion_tokens || 0,
    },
  };
}

// ---------------------------------------------------------------------------
// SELECT — rank raw items → top 10 with score + angle
// ---------------------------------------------------------------------------

type ScoredItem = RawItem & { rank: number; score: number; angle: string };

async function selectTop(
  items: RawItem[],
  keywords: string[],
  angleHint: string,
  env: Record<string, string>
): Promise<{ top: ScoredItem[]; tokens: any }> {
  const catalog = items.slice(0, 40).map((it, idx) => ({
    id: idx,
    source: it.source,
    title: it.title.slice(0, 200),
    snippet: (it.snippet || "").slice(0, 300),
  }));

  const system = `You are Thedi, a research scout. Rank items for relevance to the user's research interests.
User's keywords: ${JSON.stringify(keywords)}
User's angle: ${angleHint || "(none)"}
Return STRICT JSON: {"top": [{"id": int, "score": 1-10 float, "angle": "why this matters for the user (one sentence)"}]}
Pick up to 10 items. Skip duplicates and obvious noise.`;

  const user = `CATALOG:\n${JSON.stringify(catalog, null, 1)}`;

  const { content, tokens } = await callLLM(system, user, env, true);
  const parsed = JSON.parse(content);
  const top: ScoredItem[] = [];
  for (let i = 0; i < Math.min(parsed.top?.length || 0, 10); i++) {
    const pick = parsed.top[i];
    const src = items[pick.id];
    if (!src) continue;
    top.push({
      ...src,
      rank: i + 1,
      score: typeof pick.score === "number" ? pick.score : 5,
      angle: pick.angle || "",
    });
  }
  return { top, tokens };
}

// ---------------------------------------------------------------------------
// CRITIC — 1 pass: critique the top-10 against prefs
// ---------------------------------------------------------------------------

async function runCritic(
  top: ScoredItem[],
  keywords: string[],
  angleHint: string,
  recentPrefs: any[],
  env: Record<string, string>
): Promise<{ critique: string; accepted: boolean; tokens: any }> {
  const system = `You are the Thedi Critic. Evaluate a ranked top-10 list for a research scout.
User's keywords: ${JSON.stringify(keywords)}
User's angle: ${angleHint || "(none)"}
User's recent feedback (may be empty): ${JSON.stringify(recentPrefs)}
If list already optimally serves user: accepted=true, empty critique.
Else: accepted=false, 1-3 sentence critique naming specific items to drop or angle changes needed.
Return STRICT JSON: {"accepted": bool, "critique": string}`;

  const user = `TOP 10:\n${top
    .map((it) => `#${it.rank} [${it.source}] ${it.title} — ${it.angle}`)
    .join("\n")}`;

  const { content, tokens } = await callLLM(system, user, env, true);
  const parsed = JSON.parse(content);
  return {
    critique: parsed.critique || "",
    accepted: !!parsed.accepted,
    tokens,
  };
}

// ---------------------------------------------------------------------------
// REFINE — re-rank given critique
// ---------------------------------------------------------------------------

async function runRefine(
  top: ScoredItem[],
  pool: RawItem[],
  critique: string,
  keywords: string[],
  angleHint: string,
  env: Record<string, string>
): Promise<{ top: ScoredItem[]; tokens: any }> {
  const ids = new Set(top.map((t) => t.url));
  const extraPool = pool.filter((p) => !ids.has(p.url)).slice(0, 20);
  const catalog = [...top, ...extraPool].map((it, idx) => ({
    id: idx,
    source: it.source,
    title: it.title.slice(0, 200),
    snippet: (it.snippet || "").slice(0, 200),
  }));

  const system = `You are Thedi's Refiner. Re-rank items given a critique.
User's keywords: ${JSON.stringify(keywords)}
User's angle: ${angleHint || "(none)"}
Critic said: "${critique}"
Return STRICT JSON: {"top": [{"id": int, "score": 1-10, "angle": "one sentence why this matters"}]} up to 10.`;

  const user = `CATALOG:\n${JSON.stringify(catalog, null, 1)}`;
  const { content, tokens } = await callLLM(system, user, env, true);
  const parsed = JSON.parse(content);
  const resultItems: RawItem[] = [...top, ...extraPool];
  const refined: ScoredItem[] = [];
  for (let i = 0; i < Math.min(parsed.top?.length || 0, 10); i++) {
    const pick = parsed.top[i];
    const src = resultItems[pick.id];
    if (!src) continue;
    refined.push({
      ...src,
      rank: i + 1,
      score: typeof pick.score === "number" ? pick.score : 5,
      angle: pick.angle || "",
    });
  }
  return { top: refined, tokens };
}

// ---------------------------------------------------------------------------
// RED FLAG — URL allowlist + title sanity
// ---------------------------------------------------------------------------

function redFlag(items: ScoredItem[]): ScoredItem[] {
  return items.filter((it) => {
    try {
      const u = new URL(it.url);
      if (!isHostAllowed(u.hostname)) return false;
    } catch {
      return false;
    }
    if (!it.title || it.title.length < 10 || it.title.length > 300) return false;
    if (it.title === it.title.toUpperCase() && it.title.length > 20) return false;
    return true;
  });
}

// ---------------------------------------------------------------------------
// RENDER EMAIL — templated HTML for Resend
// ---------------------------------------------------------------------------

function renderEmailHtml(
  findings: ScoredItem[],
  merchantName: string,
  shareToken: string
): { subject: string; html: string } {
  const top = findings[0];
  const subject = top
    ? `Thedi: ${top.title.slice(0, 60)}${top.title.length > 60 ? "…" : ""} (+${findings.length - 1} more)`
    : `Thedi: your ${findings.length}-item scout`;

  const findingsUrl = `https://thedi.butterbase.dev/#/f/${shareToken}`;
  const chatUrl = `https://thedi.butterbase.dev/#/chat/${shareToken}`;

  const itemsHtml = findings
    .slice(0, 3)
    .map(
      (f, i) => `
<div style="margin: 20px 0; padding: 16px; border-left: 3px solid #f59e0b; background: #fafaf9;">
  <div style="font-size: 12px; color: #78716c; text-transform: uppercase; letter-spacing: 0.5px;">#${i + 1} · ${f.source}</div>
  <div style="font-size: 16px; font-weight: 600; margin: 6px 0 8px; color: #1c1917;">
    <a href="${f.url}" style="color: #1c1917; text-decoration: none;">${f.title}</a>
  </div>
  <div style="font-size: 14px; color: #44403c; line-height: 1.5;">${f.angle}</div>
  <div style="margin-top: 10px;">
    <a href="${chatUrl}?seed=more_like_${i + 1}" style="font-size: 12px; color: #78716c; text-decoration: none; margin-right: 12px;">More like this</a>
    <a href="${chatUrl}?seed=less_like_${i + 1}" style="font-size: 12px; color: #78716c; text-decoration: none;">Less like this</a>
  </div>
</div>`
    )
    .join("");

  const html = `<!DOCTYPE html>
<html><body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; max-width: 600px; margin: 0 auto; padding: 30px; background: #fefefe;">
<div style="font-size: 14px; color: #78716c;">Thedi (தேடி) — your daily scout. Here's what seek'd your way:</div>
<h1 style="font-size: 22px; color: #1c1917; margin-top: 20px;">Morning brief — ${new Date().toISOString().slice(0, 10)}</h1>
${itemsHtml}
<div style="margin-top: 30px; padding-top: 20px; border-top: 1px solid #e7e5e4;">
  <a href="${findingsUrl}" style="display: inline-block; padding: 10px 18px; background: #1c1917; color: white; text-decoration: none; border-radius: 6px; font-size: 14px;">See all ${findings.length} items →</a>
  <a href="${chatUrl}" style="display: inline-block; margin-left: 12px; padding: 10px 18px; color: #1c1917; text-decoration: none; border-radius: 6px; font-size: 14px; border: 1px solid #e7e5e4;">Tell Thedi what missed</a>
</div>
<div style="margin-top: 30px; font-size: 11px; color: #a8a29e;">
  Thedi (தேடி) — Tamil for "seek".
</div>
</body></html>`;

  return { subject, html };
}

// ---------------------------------------------------------------------------
// DELIVER — Resend
// ---------------------------------------------------------------------------

async function sendEmail(
  to: string,
  subject: string,
  html: string,
  env: Record<string, string>
): Promise<string> {
  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${env.RESEND_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from: env.RESEND_FROM || "onboarding@resend.dev",
      to: [to],
      subject,
      html,
    }),
  });
  if (!res.ok) throw new Error(`Resend ${res.status}: ${await res.text()}`);
  const data: any = await res.json();
  return data.id;
}

// ---------------------------------------------------------------------------
// HANDLER
// ---------------------------------------------------------------------------

export async function handler(req: Request, ctx: any): Promise<Response> {
  const body = await req.json().catch(() => ({}));
  if (body.admin_token !== ctx.env.THEDI_ADMIN_TOKEN) {
    return new Response(JSON.stringify({ error: "unauthorized" }), {
      status: 401,
      headers: { "Content-Type": "application/json" },
    });
  }

  const userId = body.user_id;
  const runDate = body.run_date || new Date().toISOString().slice(0, 10);
  if (!userId) {
    return new Response(JSON.stringify({ error: "user_id required" }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    });
  }

  const t0 = Date.now();
  const log = async (step: string, ms: number, ok: boolean, note: string | null) => {
    await ctx.db.query(
      `INSERT INTO audit_log (user_id, digest_id, step, model, ms, ok, note)
       VALUES ($1, $2, $3, $4, $5, $6, $7)`,
      [userId, digestId, step, LLM_MODEL, ms, ok, note]
    );
  };

  // Load user + interests
  const u = await ctx.db.query(
    `SELECT u.*, i.keywords, i.sources
     FROM users u JOIN interests i ON i.user_id = u.id
     WHERE u.id = $1`,
    [userId]
  );
  if (!u.rows.length) {
    return new Response(JSON.stringify({ error: "user not found" }), { status: 404 });
  }
  const { email, keywords } = u.rows[0];
  const angleHint = body.angle_hint || "";

  // Create digest row (idempotent)
  const shareToken = body.seed_token || randomBytes(24).toString("base64url");
  const dg = await ctx.db.query(
    `INSERT INTO digests (user_id, run_date, status, share_token, polish_started_at, last_step_at)
     VALUES ($1, $2, 'polishing', $3, now(), now())
     ON CONFLICT (user_id, run_date) DO UPDATE SET status='polishing', last_step_at=now()
     RETURNING id, share_token`,
    [userId, runDate, shareToken]
  );
  const digestId = dg.rows[0].id;
  const token = dg.rows[0].share_token;

  try {
    // 1. Ingest
    const tIngest = Date.now();
    const raw = await ingest(keywords);
    await log("ingest", Date.now() - tIngest, raw.length > 0, raw.length === 0 ? "no items" : null);
    if (raw.length === 0) throw new Error("no items from any source");

    // 2. Select
    const tSel = Date.now();
    const { top: initial, tokens: selTok } = await selectTop(raw, keywords, angleHint, ctx.env);
    await log("select", Date.now() - tSel, true, `in=${raw.length} out=${initial.length} tok=${selTok.prompt}+${selTok.completion}`);

    // 3. Critic
    const tCrit = Date.now();
    const recentFeedback = await ctx.db.query(
      `SELECT extracted_prefs FROM feedback
       WHERE user_id=$1 AND extracted_prefs != '{}'::jsonb
       ORDER BY created_at DESC LIMIT 3`,
      [userId]
    );
    const prefs = recentFeedback.rows.map((r: any) => r.extracted_prefs);
    const { critique, accepted, tokens: critTok } = await runCritic(
      initial, keywords, angleHint, prefs, ctx.env
    );
    await log("critic", Date.now() - tCrit, true, `accepted=${accepted} tok=${critTok.prompt}+${critTok.completion}`);

    // 4. Refine (only if not accepted)
    let final = initial;
    if (!accepted && critique) {
      const tRef = Date.now();
      const { top: refined, tokens: refTok } = await runRefine(
        initial, raw, critique, keywords, angleHint, ctx.env
      );
      if (refined.length > 0) final = refined;
      await log("refine", Date.now() - tRef, true, `tok=${refTok.prompt}+${refTok.completion}`);
    }

    // 5. Red-flag
    const tRF = Date.now();
    final = redFlag(final);
    await log("red_flag", Date.now() - tRF, final.length > 0, `survivors=${final.length}`);
    if (final.length < 3) {
      throw new Error(`insufficient items after red_flag: ${final.length}`);
    }

    // Stash initial_rank for replay
    const initialRankMap = new Map(initial.map((it) => [it.url, it.rank]));

    // 6. Finalize — write findings + digest metadata
    await ctx.db.query(`DELETE FROM findings WHERE digest_id = $1`, [digestId]);
    for (const it of final) {
      await ctx.db.query(
        `INSERT INTO findings (digest_id, rank, source, title, url, score, angle, summary, initial_rank)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
         ON CONFLICT (digest_id, url) DO NOTHING`,
        [digestId, it.rank, it.source, it.title, it.url,
         it.score, it.angle, it.snippet || null, initialRankMap.get(it.url) || null]
      );
    }

    const renderUrl = `https://thedi.butterbase.dev/#/f/${token}`;
    await ctx.db.query(
      `UPDATE digests SET item_count=$1, render_url=$2, deliverable=true,
         critique_text=$3, critic_accepted=$4, status='rendering', last_step_at=now()
       WHERE id=$5`,
      [final.length, renderUrl, critique, accepted, digestId]
    );

    // 7. Deliver
    if (!body.skip_email) {
      const tDel = Date.now();
      const { subject, html } = renderEmailHtml(final, "Thedi", token);
      const messageId = await sendEmail(email, subject, html, ctx.env);
      await log("deliver", Date.now() - tDel, true, `resend=${messageId}`);
      await ctx.db.query(
        `UPDATE digests SET status='sent', sent_at=now(), last_step_at=now() WHERE id=$1`,
        [digestId]
      );
    } else {
      await ctx.db.query(
        `UPDATE digests SET status='rendering', last_step_at=now() WHERE id=$1`,
        [digestId]
      );
    }

    return new Response(
      JSON.stringify({
        ok: true,
        digest_id: digestId,
        share_token: token,
        item_count: final.length,
        accepted,
        total_ms: Date.now() - t0,
        render_url: renderUrl,
      }),
      { status: 200, headers: { "Content-Type": "application/json" } }
    );
  } catch (e: any) {
    await log("error", Date.now() - t0, false, (e?.message || String(e)).slice(0, 1000));
    await ctx.db.query(
      `UPDATE digests SET status='failed', last_step_at=now() WHERE id=$1`,
      [digestId]
    );
    return new Response(
      JSON.stringify({ ok: false, error: e?.message || String(e), digest_id: digestId }),
      { status: 500, headers: { "Content-Type": "application/json" } }
    );
  }
}
