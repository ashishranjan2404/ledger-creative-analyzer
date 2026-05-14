import { TICKERS } from './_watchlist.ts';
import { assertPersonalRecipient } from './_recipient.ts';
import { fetchFundamentalsTrajectory, type FundamentalsTrajectory } from './layers/fundamentals.ts';
import { fetchValuationContext, type ValuationContext } from './layers/valuation.ts';
import {
  buildLlmClientOrNull, groupTranscriptsByTicker, maybeNarrative, type LlmClient,
} from './layers/narrative.ts';
import { fetchOperationalSignal, type OperationalSignal } from './layers/operational.ts';
import { fetchSecularSignal, type SecularSignal } from './layers/secular.ts';
import { fetchRecentTranscripts, type Transcript } from './sources/transcripts.ts';
import { fetchQuoteAndShares } from './sources/finnhub.ts';
import { fetchCongressionalTrades } from './sources/congress_disclosure.ts';
import { fetchLobbying } from './sources/lobbying.ts';
import { fetchGovContracts } from './sources/gov_contracts.ts';
import { renderDeepDiveText, renderDeepDiveSubject, type DeepDiveCard, type GovCapitalSignal } from './render_deepdive.ts';
import { sendEmail, FROM_ADDRESS } from './send.ts';
import { insertRow, type ButterbaseConfig } from './_butterbase.ts';
import { readRequiredEnv } from './_env.ts';
import type { Ticker } from './_types.ts';

export const ENV_VARS = ['RESEND_KEY', 'BUTTERBASE_SERVICE_KEY', 'RECIPIENT'] as const;
type EnvKey = typeof ENV_VARS[number];

const ROTATION_BUCKET = 4; // §8.2: surface 4 tickers/week, rotate by week-of-year.
const TRANSCRIPT_LOOKBACK_DAYS = 180; // 2 quarters of 8-Ks ≥ enough for current+prior.
const GOV_CONGRESS_SINCE_DAYS = 90;   // 1 quarter — long enough to catch infrequent congressional trades.
const GOV_LOBBY_QUARTERS = 4;          // trailing 4 quarters keeps section relevant week-to-week.
const GOV_CONTRACTS_SINCE_DAYS = 180;  // contract awards are sparse; 2 quarters surfaces meaningful flow.

// Aggregate-throw via shared _env.ts. ANTHROPIC_API_KEY + FINNHUB_KEY stay
// OPTIONAL and are read inline at the call site.
export function readEnv(env: NodeJS.ProcessEnv = process.env): Record<EnvKey, string> {
  return readRequiredEnv(ENV_VARS, env);
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

// L4 helpers (buildLlmClientOrNull/groupTranscriptsByTicker/maybeNarrative) live in layers/narrative.ts.
// L8 GOV: always-on, keyless. Per-ticker fan-out via Promise.allSettled — empty in all 3 → null.
async function maybeGovCapital(ticker: Ticker): Promise<GovCapitalSignal | null> {
  const [cR, lR, gR] = await Promise.allSettled([
    fetchCongressionalTrades([ticker], GOV_CONGRESS_SINCE_DAYS),
    fetchLobbying([ticker], GOV_LOBBY_QUARTERS),
    fetchGovContracts([ticker], GOV_CONTRACTS_SINCE_DAYS),
  ] as const);
  const congressional = cR.status === 'fulfilled' ? cR.value : [];
  const lobbying = lR.status === 'fulfilled' ? lR.value : [];
  const contracts = gR.status === 'fulfilled' ? gR.value : [];
  for (const [r, k] of [[cR, 'congress'], [lR, 'lobbying'], [gR, 'contracts']] as const)
    if (r.status === 'rejected') console.warn(`[gov/${k} ${ticker}] ${String(r.reason)}`);
  if (congressional.length === 0 && lobbying.length === 0 && contracts.length === 0) return null;
  return { congressional, lobbying, contracts };
}

// Named destructure of allSettled tuple — avoids fragile settled[0]/[1] index swaps.
async function buildCard(
  ticker: Ticker, asOf: Date,
  transcriptsByTicker: ReadonlyMap<Ticker, readonly Transcript[]>, llm: LlmClient | null,
  finnhubKey: string | null, cfg: ButterbaseConfig | null,
): Promise<DeepDiveCard> {
  // L5 quote: optional. No FINNHUB_KEY (or fetch failure) ⇒ NaN/NaN ⇒ renderer prints
  // 'n/a' for `current` multiples; 5yr median + sector context still populate.
  const q = finnhubKey ? await fetchQuoteAndShares(ticker, finnhubKey) : null;
  const [fundR, valR, opR, secR] = await Promise.allSettled([
    fetchFundamentalsTrajectory(ticker, undefined, cfg),
    fetchValuationContext(ticker, q?.price ?? Number.NaN, q?.sharesOutstanding ?? Number.NaN, undefined, undefined, finnhubKey),
    fetchOperationalSignal(ticker),
    fetchSecularSignal(ticker),
  ] as const);
  const narrative = await maybeNarrative(ticker, transcriptsByTicker.get(ticker), llm);
  const govCapital = await maybeGovCapital(ticker);
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
  if (govCapital) card.govCapital = govCapital;
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
  // FINNHUB_KEY: OPTIONAL — mirrors ANTHROPIC_API_KEY gating. Absent ⇒ L5 `current` = n/a.
  const finnhubKey = process.env['FINNHUB_KEY'] ?? null;
  let transcriptsByTicker: ReadonlyMap<Ticker, readonly Transcript[]> = new Map();
  // Phase timings — surfaced via audit_log.note so operator can spot a slow phase
  // without digging into per-call latency. Granularity is intentionally coarse:
  // 3 numbers track which third of the run owns the wall-clock.
  let transcriptsMs = 0;
  if (llm) {
    const t0 = Date.now();
    try {
      const all = await fetchRecentTranscripts(slate, TRANSCRIPT_LOOKBACK_DAYS);
      transcriptsByTicker = groupTranscriptsByTicker(all);
    } catch (e) { console.warn(`[transcripts] ${String(e)} — narrative skipped this run`); }
    transcriptsMs = Date.now() - t0;
  }

  // Parallel per-ticker: 4 × ~6 EDGAR calls = 24 in flight, within SEC's 10/sec.
  const bb: ButterbaseConfig = { serviceKey: env.BUTTERBASE_SERVICE_KEY };
  const tCards = Date.now();
  const cards = await Promise.all(slate.map((t) => buildCard(t, today, transcriptsByTicker, llm, finnhubKey, bb)));
  const cardsMs = Date.now() - tCards;

  const subject = renderDeepDiveSubject(today, cards.length);
  const text = renderDeepDiveText(cards, today);

  let sent = false;
  let emailNote: string | null = null;
  const tSend = Date.now();
  try {
    await sendEmail({ apiKey: env.RESEND_KEY, from: FROM_ADDRESS, to: env.RECIPIENT, subject, text });
    sent = true;
  } catch (e) {
    emailNote = `email failed: ${e instanceof Error ? e.message : String(e)}`;
    console.warn(`[send] ${emailNote}`);
  }
  const sendMs = Date.now() - tSend;

  const ms = Date.now() - start;
  const phaseNote = `phases: transcripts=${transcriptsMs}ms cards=${cardsMs}ms send=${sendMs}ms`;
  // audit_log regardless: a Resend outage MUST NOT silently drop the run; the
  // ok=false + note row makes the failure reason visible on next read.
  try {
    await insertRow('audit_log', {
      step: 'deepdive_run', ok: sent, ms, findings_count: cards.length,
      note: emailNote
        ? `${emailNote} | ${phaseNote}`
        : `sent ${cards.length} deep-dive card(s) to ${env.RECIPIENT} | ${phaseNote}`,
    }, { serviceKey: env.BUTTERBASE_SERVICE_KEY });
  } catch (e) { console.warn(`[butterbase audit] ${String(e)}`); }

  return { sent, cards: cards.length, ms };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  await (async () => { try { console.log(await runDeepDive()); } catch (e) { console.error(e); process.exit(1); } })();
}
