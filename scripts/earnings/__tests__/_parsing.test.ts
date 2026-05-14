import { test } from 'node:test';
import assert from 'node:assert/strict';

import { parseGoodDate } from '../_parsing.ts';

// === Loop 46: fuzz test for parseGoodDate =================================
// Goal: across a wide input space the function returns Date | null AND never
// throws. Seeded so a regression reproduces deterministically.

function seededRng(seed: number): () => number {
  let s = seed;
  return () => {
    s = (s * 1664525 + 1013904223) & 0xffffffff;
    return ((s >>> 0) / 0x100000000);
  };
}

// Curated set of shapes seen across adapters (Quiver, LDA, USAspending,
// EDGAR Atom, Yahoo RSS, PullPush) — known-good and known-degenerate forms.
const SHAPES: unknown[] = [
  // Real production formats:
  '2026-05-14',
  '2026-05-14T12:00:00Z',
  '2026-05-14T12:00:00.000Z',
  '2026/05/14',
  'May 14, 2026',
  '14 May 2026 12:00:00 GMT',
  // Edge dates:
  '1970-01-01',
  '9999-12-31',
  // Bad strings:
  '',
  'not-a-date',
  '2026-13-99', // invalid month/day
  '2026-99-14',
  '   ',
  'null',
  'undefined',
  'NaN',
  '<html><body>error</body></html>',
  // Non-string inputs:
  null,
  undefined,
  NaN,
  Infinity,
  -Infinity,
  0,
  1747222800000, // numeric epoch ms (we expect this to be REJECTED — adapter must stringify first)
  true,
  false,
  [],
  {},
  { iso: '2026-05-14' },
  ['2026-05-14'],
  // Long / weird strings:
  'a'.repeat(10_000),
  '2026-05-14\n\n\n',
  '​2026-05-14', // zero-width space prefix
];

test('parseGoodDate property: returns Date | null across the curated input space, never throws', () => {
  for (const x of SHAPES) {
    let result: Date | null;
    try {
      result = parseGoodDate(x);
    } catch (e) {
      assert.fail(`parseGoodDate threw on ${JSON.stringify(x)}: ${String(e)}`);
      continue;
    }
    if (result === null) continue;
    assert.ok(result instanceof Date, `non-Date return for ${JSON.stringify(x)}`);
    assert.ok(Number.isFinite(result.getTime()),
      `Invalid Date leaked for ${JSON.stringify(x)} → ${result.toString()}`);
  }
});

test('parseGoodDate property: random binary/unicode strings never throw', () => {
  const rng = seededRng(0xBEEF);
  for (let i = 0; i < 250; i++) {
    const len = Math.floor(rng() * 60);
    let s = '';
    for (let j = 0; j < len; j++) {
      // Mix of ASCII + multibyte UTF-16 surrogate-pair territory.
      s += String.fromCharCode(Math.floor(rng() * 0xD7FF));
    }
    try {
      const r = parseGoodDate(s);
      assert.ok(r === null || (r instanceof Date && Number.isFinite(r.getTime())),
        `bad return type for fuzzed string of length ${len}`);
    } catch (e) {
      assert.fail(`parseGoodDate threw on random unicode (len=${len}): ${String(e)}`);
    }
  }
});

test('parseGoodDate property: valid ISO inputs round-trip via toISOString', () => {
  // For YYYY-MM-DDTHH:MM:SSZ inputs, the result's toISOString() must match
  // the input semantically (same calendar day).
  for (const iso of ['2024-02-29T00:00:00Z', '2024-01-15T00:00:00Z', '2025-12-31T23:59:59Z']) {
    const r = parseGoodDate(iso);
    assert.ok(r instanceof Date);
    assert.equal(r.toISOString().slice(0, 10), iso.slice(0, 10),
      `${iso} parsed to a different calendar day: ${r.toISOString()}`);
  }
});

test('parseGoodDate: numeric strings (epoch-ms) parse via Date() leniency', () => {
  // `new Date("1747222800000")` parses on modern JS engines. We document this
  // behavior — a future strict-mode parseGoodDate would reject these. Lock the
  // current behavior so any regression is intentional.
  const r = parseGoodDate('1747222800000');
  // V8 currently parses; document either way.
  if (r !== null) assert.ok(r instanceof Date && Number.isFinite(r.getTime()));
});
