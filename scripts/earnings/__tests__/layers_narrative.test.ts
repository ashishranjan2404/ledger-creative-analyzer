import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';

import {
  extractNarrativeShift, defaultLlmClient, type LlmClient,
} from '../layers/narrative.ts';
import type { Transcript } from '../sources/transcripts.ts';
import { toTicker } from '../_watchlist.ts';

function mkTranscript(words: number, label: string, accSuffix: string): Transcript {
  const text = Array.from({ length: words }, (_, i) => `${label}${i}`).join(' ');
  return {
    ticker: toTicker('NVDA'),
    filingDate: new Date(`2026-${accSuffix}-15T12:00:00Z`),
    accessionNumber: `0001045810-26-0000${accSuffix}`,
    text,
    exhibitUrl: 'https://example.invalid/exhibit.htm',
    wordCount: words,
  };
}

function stubLlm(out: string | (() => string | Promise<string>) | Error): LlmClient {
  return async () => {
    if (out instanceof Error) throw out;
    if (typeof out === 'function') return await out();
    return out;
  };
}

test('happy path: parses JSON array, returns ticker + dates + accession + shifts', async () => {
  const current = mkTranscript(800, 'cur', '04');
  const prior = mkTranscript(800, 'pri', '01');
  const shifts = [
    'Strategic emphasis pivots from data-center buildout to inference monetization.',
    'Tone shifts from cautiously optimistic to confidently assertive on full-year guide.',
    'Drops "supply constraints" jargon; introduces "agentic compute" as recurring framing.',
  ];
  const out = await extractNarrativeShift(current, prior, stubLlm(JSON.stringify(shifts)));
  assert.ok(out, 'expected non-null result');
  assert.equal(out.ticker, 'NVDA');
  assert.equal(out.currentQuarter.accessionNumber, current.accessionNumber);
  assert.equal(out.priorQuarter.accessionNumber, prior.accessionNumber);
  assert.deepEqual(out.currentQuarter.date, current.filingDate);
  assert.deepEqual(out.priorQuarter.date, prior.filingDate);
  assert.deepEqual(out.shifts, shifts);
  assert.ok(out.asOf instanceof Date);
});

test('short-transcript guard: <500 words on either side returns null without calling LLM', async () => {
  let called = false;
  const llm: LlmClient = async () => { called = true; return '[]'; };
  const longT = mkTranscript(800, 'cur', '04');
  const shortT = mkTranscript(499, 'pri', '01');
  assert.equal(await extractNarrativeShift(longT, shortT, llm), null);
  assert.equal(await extractNarrativeShift(shortT, longT, llm), null);
  assert.equal(called, false, 'short-circuit must skip the LLM call');
});

test('malformed JSON returns null', async () => {
  const c = mkTranscript(800, 'cur', '04'), p = mkTranscript(800, 'pri', '01');
  assert.equal(await extractNarrativeShift(c, p, stubLlm('not json {')), null);
  assert.equal(await extractNarrativeShift(c, p, stubLlm('')), null);
});

test('non-array (object/number/null) returns null', async () => {
  const c = mkTranscript(800, 'cur', '04'), p = mkTranscript(800, 'pri', '01');
  assert.equal(await extractNarrativeShift(c, p, stubLlm('{"shifts":["a","b","c"]}')), null);
  assert.equal(await extractNarrativeShift(c, p, stubLlm('42')), null);
  assert.equal(await extractNarrativeShift(c, p, stubLlm('null')), null);
  assert.equal(await extractNarrativeShift(c, p, stubLlm('["ok",2,"three"]')), null,
    'mixed-type array must fail string-array check');
});

test('LLM throw returns null (no propagation)', async () => {
  const c = mkTranscript(800, 'cur', '04'), p = mkTranscript(800, 'pri', '01');
  assert.equal(await extractNarrativeShift(c, p, stubLlm(new Error('boom'))), null);
});

test('truncates each bullet to 200 chars at word boundary, caps array at 5', async () => {
  const c = mkTranscript(800, 'cur', '04'), p = mkTranscript(800, 'pri', '01');
  const long = ('lorem ipsum dolor sit amet '.repeat(20)).trim(); // ~540 chars w/ spaces
  const seven = [long, 'short two', 'short three', 'short four', 'short five', 'short six', 'short seven'];
  const out = await extractNarrativeShift(c, p, stubLlm(JSON.stringify(seven)));
  assert.ok(out);
  assert.equal(out.shifts.length, 5, 'caps to 5');
  assert.ok(out.shifts[0]!.length <= 200, `truncated len=${out.shifts[0]!.length}`);
  assert.ok(out.shifts[0]!.endsWith('…'), 'ellipsis marks truncation');
  assert.ok(!/\S…$/.test(out.shifts[0]!.slice(0, -1) + 'X'), 'cuts at a space, no mid-word cut');
  assert.equal(out.shifts[1], 'short two');
});

test('strips ```json``` fences before parsing', async () => {
  const c = mkTranscript(800, 'cur', '04'), p = mkTranscript(800, 'pri', '01');
  const wrapped = '```json\n["a shift","b shift","c shift"]\n```';
  const out = await extractNarrativeShift(c, p, stubLlm(wrapped));
  assert.ok(out);
  assert.deepEqual(out.shifts, ['a shift', 'b shift', 'c shift']);
});

test('fewer than 3 valid bullets returns null', async () => {
  const c = mkTranscript(800, 'cur', '04'), p = mkTranscript(800, 'pri', '01');
  assert.equal(await extractNarrativeShift(c, p, stubLlm('["only one","two"]')), null);
  assert.equal(await extractNarrativeShift(c, p, stubLlm('["", "  ", "real"]')), null,
    'empty/whitespace bullets are filtered before count check');
});

// ---------------------- defaultLlmClient via fixture server ----------------------

let server: Server, endpoint = '', lastBody: any = null, lastHeaders: Record<string, string | string[] | undefined> = {};

before(async () => {
  server = createServer((req, res) => {
    const chunks: Buffer[] = [];
    req.on('data', (c) => chunks.push(c));
    req.on('end', () => {
      lastHeaders = req.headers;
      try { lastBody = JSON.parse(Buffer.concat(chunks).toString('utf8')); }
      catch { lastBody = null; }
      const url = new URL(req.url ?? '/', 'http://x');
      if (url.pathname === '/messages-fail') {
        res.writeHead(500, { 'content-type': 'text/plain' }); res.end('upstream'); return;
      }
      res.writeHead(200, { 'content-type': 'application/json' });
      res.end(JSON.stringify({
        content: [{ type: 'text', text: '["alpha","beta","gamma"]' }],
      }));
    });
  });
  await new Promise<void>((r) => server.listen(0, '127.0.0.1', r));
  endpoint = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});

after(async () => { await new Promise<void>((r, j) => server.close((e) => e ? j(e) : r())); });

test('defaultLlmClient: posts bearer + anthropic-version, parses content[0].text', async () => {
  const llm = defaultLlmClient({ apiKey: 'sk-test', endpoint: `${endpoint}/messages`, model: 'claude-test' });
  const text = await llm({ systemPrompt: 'sys', userPrompt: 'usr' });
  assert.equal(text, '["alpha","beta","gamma"]');
  assert.equal(lastHeaders['authorization'], 'Bearer sk-test');
  assert.equal(lastHeaders['anthropic-version'], '2023-06-01');
  assert.equal(lastBody.model, 'claude-test');
  assert.equal(lastBody.system, 'sys');
  assert.deepEqual(lastBody.messages, [{ role: 'user', content: 'usr' }]);
});

test('defaultLlmClient: throws on non-2xx', async () => {
  const llm = defaultLlmClient({ apiKey: 'sk-test', endpoint: `${endpoint}/messages-fail` });
  await assert.rejects(llm({ systemPrompt: 's', userPrompt: 'u' }), /anthropic 500/);
});

test('defaultLlmClient: missing ANTHROPIC_API_KEY throws at construction', () => {
  const orig = process.env.ANTHROPIC_API_KEY;
  delete process.env.ANTHROPIC_API_KEY;
  try { assert.throws(() => defaultLlmClient(), /ANTHROPIC_API_KEY/); }
  finally { if (orig !== undefined) process.env.ANTHROPIC_API_KEY = orig; }
});

test('defaultLlmClient: maxTokens option overrides default', async () => {
  const llm = defaultLlmClient({
    apiKey: 'sk-test', endpoint: `${endpoint}/messages`, model: 'claude-test', maxTokens: 4096,
  });
  await llm({ systemPrompt: 'sys', userPrompt: 'usr' });
  assert.equal(lastBody.max_tokens, 4096);
});

test('end-to-end: extractNarrativeShift via defaultLlmClient against fixture server', async () => {
  const llm = defaultLlmClient({ apiKey: 'sk-test', endpoint: `${endpoint}/messages` });
  const c = mkTranscript(800, 'cur', '04'), p = mkTranscript(800, 'pri', '01');
  const out = await extractNarrativeShift(c, p, llm);
  assert.ok(out);
  assert.deepEqual(out.shifts, ['alpha', 'beta', 'gamma']);
});
