import { TICKERS } from './_watchlist.ts';
import { assertPersonalRecipient } from './_recipient.ts';
import { fetchFundamentalsTrajectory, type FundamentalsTrajectory } from './layers/fundamentals.ts';
import { fetchValuationContext, type ValuationContext } from './layers/valuation.ts';
import {
  extractNarrativeShift, defaultLlmClient, type NarrativeShift, type LlmClient,
} from './layers/narrative.ts';
import { fetchOperationalSignal, type OperationalSignal } from './layers/operational.ts';
import { fetchSecularSignal, type SecularSignal } from './layers/secular.ts';
import { fetchRecentTranscripts, type Transcript } from './sources/transcripts.ts';
import { fetchCongressionalTrades } from './sources/congress_disclosure.ts';
import { fetchLobbying } from './sources/lobbying.ts';
import { fetchGovContracts } from './sources/gov_contracts.ts';
import { renderDeepDiveText, renderDeepDiveSubject, type DeepDiveCard, type QuiverSignal } from './render_deepdive.ts';
import { sendEmail } from './send.ts';
import { insertRow } from './_butterbase.ts';
import type { Ticker } from './_types.ts';

export const ENV_VARS = ['RESEND_KEY', 'BUTTERBASE_SERVICE_KEY', 'RECIPIENT'] as const;
type EnvKey = typeof ENV_VARS[number];

const FROM = 'thedi@platformy.org';
const ROTATION_BUCKET = 4; // §8.2: surface 4 tickers/week, rotate by week-of-year.
const TRANSCRIPT_LOOKBACK_DAYS = 180; // 2 quarters of 8-Ks ≥ enough for current+prior.
const GOV_CONGRESS_SINCE_DAYS = 90;   // 1 quarter — long enough to catch infrequent congressional trades.
const GOV_LOBBY_QUARTERS = 4;          // trailing 4 quarters keeps section relevant week-to-week.
const GOV_CONTRACTS_SINCE_DAYS = 180;  // contract awards are sparse; 2 quarters surfaces meaningful flow.

// WHY aggregate-throw: matches tactical.readEnv — operator fixes all gaps in one
// cron edit. ANTHROPIC_API_KEY stays OPTIONAL: missing key just disables L4.
export function readEnv(env: NodeJS.ProcessEnv = process.env): Record<EnvKey, string> {
  const out = {} as Record<EnvKey, string>;
  const missing: string[] = [];
  for (const k of ENV_VARS) { const v = env[k]; if (!v) missing.push(k); else out[k] = v; }
  if (missing.length) throw new Error(`missing env var(s): ${missing.join(', ')}`);
  return out;
}

// ISO 8601 week-of-year (1..53). Matches `date -V` / Postgres EXTRACT(week).
// Deterministically rotates the watchlist; every ticker resurfaces every ceil(N/4) weeks.
export function weekOfYear(d: Date): number {
  const t = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
  t.setUTCDate(t.getUTCDate() + 4 - (t.getUTCDay() || 7)); // Thursday-of-week decides the year.
  const yearStart = new Date(Date.UTC(t.getUTCFullYear(), 0, 1));
  return Math.ceil(((t.getTime() - yearStart.getTime()) / 86_400_000 + 1) / 7);
}

// Rotate by (week % ceil(N/bucket)) so all tickers cycle in. Stable index order.
export function rotateCards<T>(cards: readonly T[], date: Date, bucket = ROTATION_BUCKET): T[] {
  if (cards.length <= bucket) return [...cards];
  const groups = Math.ceil(cards.length / bucket);
  const start = (weekOfYear(date) % groups) * bucket;
  const out = cards.slice(start, start + bucket);
  if (out.length < bucket) out.push(...cards.slice(0, bucket - out.length)); // wrap
  return out;
}

// WHY env-injectable + null-on-absent: missing ANTHROPIC_API_KEY must NOT crash
// the run — we just skip L4. Injectable env makes both branches unit-testable.
export function buildLlmClientOrNull(env: NodeJS.ProcessEnv = process.env): LlmClient | null {
  if (!env.ANTHROPIC_API_KEY) return null;
  try { return defaultLlmClient({ apiKey: env.ANTHROPIC_API_KEY }); }
  catch (e) { console.warn(`[narrative] LLM client init failed: ${String(e)}`); return null; }
}

// Group flat transcript list by ticker, sort newest→oldest. O(1) per-card lookup.
export function groupTranscriptsByTicker(
  rows: readonly Transcript[],
): ReadonlyMap<Ticker, readonly Transcript[]> {
  const map = new Map<Ticker, Transcript[]>();
  for (const r of rows) { const arr = map.get(r.ticker) ?? []; arr.push(r); map.set(r.ticker, arr); }
  for (const arr of map.values()) arr.sort((a, b) => b.filingDate.getTime() - a.filingDate.getTime());
  return map;
}

// WHY narrative kept off Promise.allSettled: distinct LLM failure path we want
// surfaced as `[narrative TICKER]` (qualitatively different from EDGAR errors).
async function maybeNarrative(
  ticker: Ticker, transcripts: readonly Transcript[] | undefined, llm: LlmClient | null,
): Promise<NarrativeShift | null> {
  if (!llm || !transcripts || transcripts.length < 2) return null;
  const [current, prior] = transcripts;
  if (!current || !prior) return null;
  try { return await extractNarrativeShift(current, prior, llm); }
  catch (e) { console.warn(`[narrative ${ticker}] ${String(e)}`); return null; }
}

// L8 GOV: always-on. Each adapter pulls from a free, keyless gov source
// (Senate/House stock-watcher GitHub mirrors, LDA, USAspending) and uses
// Promise.allSettled internally per-ticker, so a single-ticker call returns
// [] on miss without throwing. Empty in all 3 → null suppresses the block.
async function maybeGovCapital(ticker: Ticker): Promise<QuiverSignal | null> {
  const [cR, lR, gR] = await Promise.allSettled([
    fetchCongressionalTrades([ticker], GOV_CONGRESS_SINCE_DAYS),
    fetchLobbying([ticker], GOV_LOBBY_QUARTERS),
    fetchGovContracts([ticker], GOV_CONTRACTS_SINCE_DAYS),
  ] as const);
  const congressional = cR.status === 'fulfilled' ? cR.value : [];
  const lobbying = lR.status === 'fulfilled' ? lR.value : [];
  const contracts = gR.status === 'fulfilled' ? gR.value : [];
  if (cR.status === 'rejected') console.warn(`[gov/congress ${ticker}] ${String(cR.reason)}`);
  if (lR.status === 'rejected') console.warn(`[gov/lobbying ${ticker}] ${String(lR.reason)}`);
  if (gR.status === 'rejected') console.warn(`[gov/contracts ${ticker}] ${String(gR.reason)}`);
  if (congressional.length === 0 && lobbying.length === 0 && contracts.length === 0) return null;
  return { congressional, lobbying, contracts };
}

// Named destructure of allSettled tuple — avoids fragile settled[0]/[1] index swaps.
async function buildCard(
  ticker: Ticker, asOf: Date,
  transcriptsByTicker: ReadonlyMap<Ticker, readonly Transcript[]>, llm: LlmClient | null,
): Promise<DeepDiveCard> {
  // V1 (spec §6 L5): price/shares feed deferred — NaN → renderer prints 'n/a'.
  const NAN = Number.NaN;
  const [fundR, valR, opR, secR] = await Promise.allSettled([
    fetchFundamentalsTrajectory(ticker),
    fetchValuationContext(ticker, NAN, NAN),
    fetchOperationalSignal(ticker),
    fetchSecularSignal(ticker),
  ] as const);
  const narrative = await maybeNarrative(ticker, transcriptsByTicker.get(ticker), llm);
  const quiver = await maybeGovCapital(ticker);
  const card: DeepDiveCard = { ticker, asOf };
  if (fundR.status === 'fulfilled') card.fundamentals = fundR.value as FundamentalsTrajectory;
  else console.warn(`[fundamentals ${ticker}] ${String(fundR.reason)}`);
  if (valR.status === 'fulfilled') card.valuation = valR.value as ValuationContext;
  else console.warn(`[valuation ${ticker}] ${String(valR.reason)}`);
  if (opR.status === 'fulfilled') card.operational = opR.value as OperationalSignal;
  else console.warn(`[operational ${ticker}] ${String(opR.reason)}`);
  if (secR.status === 'fulfilled') card.secular = secR.value as SecularSignal;
  else console.warn(`[secular ${ticker}] ${String(secR.reason)}`);
  if (narrative) card.narrative = narrative;
  if (quiver) card.quiver = quiver;
  return card;
}

export async function runDeepDive(): Promise<{ sent: boolean; cards: number; ms: number }> {
  const start = Date.now();
  const env = readEnv();
  assertPersonalRecipient(env.RECIPIENT);

  const today = new Date();
  // Rotate first so we only fetch what we'll send (≤4 tickers/week).
  const slate = rotateCards(TICKERS, today);

  // L4 prereqs: build LLM first → skip EDGAR transcript round-trip when key
  // absent. fetchRecentTranscripts fans per-ticker via allSettled internally.
  const llm = buildLlmClientOrNull();
  let transcriptsByTicker: ReadonlyMap<Ticker, readonly Transcript[]> = new Map();
  if (llm) {
    try {
      const all = await fetchRecentTranscripts(slate, TRANSCRIPT_LOOKBACK_DAYS);
      transcriptsByTicker = groupTranscriptsByTicker(all);
    } catch (e) { console.warn(`[transcripts] ${String(e)} — narrative skipped this run`); }
  }

  // L8 GOV: always attempted via free keyless sources. Empty across all 3
  // adapters → maybeGovCapital returns null → renderer suppresses the
  // ▌GOVERNMENT & CAPITAL block, same UX as the prior key-gated path.
  // Parallel per-ticker: 4 × ~6 EDGAR calls = 24 in flight, within SEC's 10/sec.
  const cards = await Promise.all(slate.map(
    (t) => buildCard(t, today, transcriptsByTicker, llm),
  ));

  const subject = renderDeepDiveSubject(today, cards.length);
  const text = renderDeepDiveText(cards, today);

  let sent = false;
  let emailNote: string | null = null;
  try {
    await sendEmail({ apiKey: env.RESEND_KEY, from: FROM, to: env.RECIPIENT, subject, text });
    sent = true;
  } catch (e) {
    emailNote = `email failed: ${e instanceof Error ? e.message : String(e)}`;
    console.warn(`[send] ${emailNote}`);
  }

  const ms = Date.now() - start;
  // audit_log regardless: a Resend outage MUST NOT silently drop the run; the
  // ok=false + note row makes the failure reason visible on next read.
  try {
    await insertRow('audit_log', {
      step: 'deepdive_run', ok: sent, ms, findings_count: cards.length,
      note: emailNote ?? `sent ${cards.length} deep-dive card(s) to ${env.RECIPIENT}`,
    }, { serviceKey: env.BUTTERBASE_SERVICE_KEY });
  } catch (e) { console.warn(`[butterbase audit] ${String(e)}`); }

  return { sent, cards: cards.length, ms };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  await (async () => { try { console.log(await runDeepDive()); } catch (e) { console.error(e); process.exit(1); } })();
}
