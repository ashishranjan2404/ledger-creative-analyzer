// L4 narrative-shift extractor: ask Claude to compare two earnings transcripts
// and emit 3-5 short bullets capturing strategic, tonal, and lexical drift.
// Returns null on short transcripts, network/LLM failure, or malformed JSON —
// never throws, so the surrounding fan-out (Promise.allSettled) keeps shipping
// a partial signal.
import type { Ticker } from '../_types.ts';
import type { Transcript } from '../sources/transcripts.ts';
import { fetchWithTimeout } from '../_http.ts';

export type NarrativeShift = {
  ticker: Ticker;
  currentQuarter: { date: Date; accessionNumber: string };
  priorQuarter: { date: Date; accessionNumber: string };
  shifts: readonly string[];   // 3-5 bullet points; each ≤200 chars
  asOf: Date;
};

export type LlmClient = (args: { systemPrompt: string; userPrompt: string }) => Promise<string>;

const MIN_WORDS = 500, MAX_BULLETS = 5, MIN_BULLETS = 3, MAX_BULLET_CHARS = 200;
const ANTHROPIC_DEFAULT = 'https://api.anthropic.com/v1/messages';
const ANTHROPIC_VERSION = '2023-06-01';
const DEFAULT_MODEL = 'claude-sonnet-4-6';

// Distinct lenses are baked into the prompt so the model returns a focused mix
// (not five tonal restatements). Output contract is intentionally rigid: a bare
// JSON array — anything else gets nulled at parse time, no salvage attempts.
const SYSTEM_PROMPT = [
  'You compare two earnings call transcripts (current vs prior quarter) for one company.',
  'Identify NARRATIVE SHIFTS along these lenses: strategic emphasis, tonal/confidence',
  'change, terminology/lexical drift (new buzzwords, dropped jargon).',
  '',
  'OUTPUT CONTRACT (strict):',
  `- Return ONLY a JSON array of ${MIN_BULLETS}-${MAX_BULLETS} strings.`,
  '- Each string is one self-contained shift, present-tense, prior→current framing.',
  `- Keep each string under ${MAX_BULLET_CHARS} characters.`,
  '- No prose, no preamble, no markdown fences, no trailing commentary.',
].join('\n');

function buildUserPrompt(current: Transcript, prior: Transcript): string {
  const c = current.filingDate.toISOString().slice(0, 10);
  const p = prior.filingDate.toISOString().slice(0, 10);
  return `Ticker: ${current.ticker}\n===== PRIOR QUARTER (filed ${p}) =====\n${prior.text}\n` +
    `===== CURRENT QUARTER (filed ${c}) =====\n${current.text}\n===== END =====\nEmit the JSON array now.`;
}

// Word-boundary truncation: cut at the last space in the cap window so we don't
// chop a word in half; fall back to a hard slice if no space sits past the
// halfway mark (e.g. a runaway URL). Single-char ellipsis signals trim.
function truncate(s: string): string {
  if (s.length <= MAX_BULLET_CHARS) return s;
  const window = s.slice(0, MAX_BULLET_CHARS - 1);
  const lastSpace = window.lastIndexOf(' ');
  return (lastSpace > MAX_BULLET_CHARS / 2 ? window.slice(0, lastSpace) : window) + '…';
}

// Some models wrap JSON in ```json fences despite instructions; strip a single
// outer fence pair before parsing. Other framings stay malformed by design.
const FENCE_RE = /^\s*```(?:json)?\s*([\s\S]*?)\s*```\s*$/i;
const stripFence = (raw: string): string => raw.match(FENCE_RE)?.[1]?.trim() ?? raw.trim();
const isStringArray = (v: unknown): v is readonly string[] =>
  Array.isArray(v) && v.every((x) => typeof x === 'string');

export async function extractNarrativeShift(
  current: Transcript, prior: Transcript, llm: LlmClient,
): Promise<NarrativeShift | null> {
  if (current.wordCount < MIN_WORDS || prior.wordCount < MIN_WORDS) return null;
  let raw: string;
  try { raw = await llm({ systemPrompt: SYSTEM_PROMPT, userPrompt: buildUserPrompt(current, prior) }); }
  catch { return null; }
  let parsed: unknown;
  try { parsed = JSON.parse(stripFence(raw)); } catch { return null; }
  if (!isStringArray(parsed)) return null;
  const cleaned = parsed.map((s) => s.trim()).filter((s) => s.length > 0);
  if (cleaned.length < MIN_BULLETS) return null;
  return {
    ticker: current.ticker,
    currentQuarter: { date: current.filingDate, accessionNumber: current.accessionNumber },
    priorQuarter: { date: prior.filingDate, accessionNumber: prior.accessionNumber },
    shifts: cleaned.slice(0, MAX_BULLETS).map(truncate),
    asOf: new Date(),
  };
}

export type DefaultLlmClientOptions = {
  apiKey?: string; endpoint?: string; model?: string; maxTokens?: number;
};
type AnthropicResponse = { content?: ReadonlyArray<{ type?: string; text?: string }> };

export function defaultLlmClient(opts: DefaultLlmClientOptions = {}): LlmClient {
  const apiKey = opts.apiKey ?? process.env.ANTHROPIC_API_KEY;
  if (!apiKey) throw new Error('ANTHROPIC_API_KEY is required for defaultLlmClient');
  const endpoint = opts.endpoint ?? ANTHROPIC_DEFAULT;
  const model = opts.model ?? DEFAULT_MODEL;
  const maxTokens = opts.maxTokens ?? 1024;
  return async ({ systemPrompt, userPrompt }) => {
    const res = await fetchWithTimeout(endpoint, {
      method: 'POST',
      headers: {
        authorization: `Bearer ${apiKey}`,
        'anthropic-version': ANTHROPIC_VERSION,
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        model, max_tokens: maxTokens, system: systemPrompt,
        messages: [{ role: 'user', content: userPrompt }],
      }),
    }, 30_000);
    if (!res.ok) throw new Error(`anthropic ${res.status}: ${await res.text().catch(() => '')}`);
    const j = (await res.json()) as AnthropicResponse;
    const text = j.content?.[0]?.text;
    if (typeof text !== 'string') throw new Error('anthropic: missing text in content');
    return text;
  };
}
