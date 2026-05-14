import { test } from 'node:test';
import assert from 'node:assert/strict';

import { parseAmount } from '../_parsing.ts';

// === Loop 47: fuzz test for parseAmount ===================================
// Centralized USD-amount parser. Adapters used to handle this inconsistently
// (quiver.pickNum, lobbying.parseAmount); contract is now:
//   number → number   (finite)
//   string → number   (strip $/, then parseFloat; ranges take lower bound)
//   null   → on failure (NOT 0, so callers distinguish "missing" from "zero")

function seededRng(seed: number): () => number {
  let s = seed;
  return () => {
    s = (s * 1664525 + 1013904223) & 0xffffffff;
    return ((s >>> 0) / 0x100000000);
  };
}

const CURATED: Array<{ in: unknown; out: number | null; reason: string }> = [
  // Real production shapes:
  { in: 1000, out: 1000, reason: 'plain number' },
  { in: 1234.56, out: 1234.56, reason: 'decimal number' },
  { in: 0, out: 0, reason: 'literal zero (NOT null)' },
  { in: '1000', out: 1000, reason: 'numeric string' },
  { in: '$1,000', out: 1000, reason: '$ + comma' },
  { in: '$1,234,567', out: 1234567, reason: 'multi-comma thousands' },
  { in: '$1,234.56', out: 1234.56, reason: '$ + comma + decimal' },
  { in: '150000.00', out: 150000, reason: 'LDA-style decimal string' },
  // PTR range form:
  { in: '$1,001 - $15,000', out: 1001, reason: 'PTR range → lower bound' },
  { in: '$50,001 - $100,000', out: 50001, reason: 'PTR range → lower bound' },
  // Edge:
  { in: '', out: null, reason: 'empty string' },
  { in: '  ', out: null, reason: 'whitespace only' },
  { in: '$', out: null, reason: 'lone $' },
  { in: ',', out: null, reason: 'lone comma' },
  // Non-string/number:
  { in: null, out: null, reason: 'null' },
  { in: undefined, out: null, reason: 'undefined' },
  { in: NaN, out: null, reason: 'NaN number' },
  { in: Infinity, out: null, reason: 'Infinity' },
  { in: -Infinity, out: null, reason: '-Infinity' },
  { in: true, out: null, reason: 'boolean true' },
  { in: false, out: null, reason: 'boolean false' },
  { in: [], out: null, reason: 'array' },
  { in: {}, out: null, reason: 'object' },
  { in: { amount: 100 }, out: null, reason: 'object with amount key' },
  // Garbage strings:
  { in: 'not a number', out: null, reason: 'pure garbage' },
  // Negative amounts (uncommon but possible — refunds/contras):
  { in: '-500', out: -500, reason: 'negative number' },
  { in: '-$500', out: -500, reason: 'minus before $ (sometimes seen)' },
];

test('parseAmount: curated cases match expected', () => {
  for (const { in: input, out: expected, reason } of CURATED) {
    const actual = parseAmount(input);
    if (expected === null) {
      assert.equal(actual, null, `${reason}: ${JSON.stringify(input)} → ${actual}`);
    } else {
      assert.equal(actual, expected,
        `${reason}: ${JSON.stringify(input)} → expected ${expected}, got ${actual}`);
    }
  }
});

test('parseAmount property: random strings never throw and return number|null', () => {
  const rng = seededRng(0xA177);
  for (let i = 0; i < 300; i++) {
    const len = Math.floor(rng() * 30);
    let s = '';
    for (let j = 0; j < len; j++) {
      // Bias toward valid amount characters (mostly) so we exercise the parser hot path.
      const which = rng();
      if (which < 0.6) s += String.fromCharCode(0x30 + Math.floor(rng() * 10)); // digit
      else if (which < 0.75) s += ',';
      else if (which < 0.85) s += '$';
      else if (which < 0.9) s += '.';
      else if (which < 0.95) s += ' ';
      else s += String.fromCharCode(Math.floor(rng() * 128));
    }
    let r: number | null;
    try { r = parseAmount(s); }
    catch (e) { assert.fail(`parseAmount threw on "${s}": ${String(e)}`); continue; }
    assert.ok(r === null || (typeof r === 'number' && Number.isFinite(r)),
      `bad return for "${s}": ${r}`);
  }
});

test('parseAmount property: number inputs round-trip (finite in → same out)', () => {
  const rng = seededRng(0xC0FFEE);
  for (let i = 0; i < 100; i++) {
    const n = (rng() - 0.5) * 1e10;
    if (!Number.isFinite(n)) continue;
    assert.equal(parseAmount(n), n);
  }
});

test('parseAmount property: numeric strings parse to their numeric value (ignoring $,)', () => {
  const rng = seededRng(13);
  for (let i = 0; i < 100; i++) {
    const n = Math.floor(rng() * 1e9);
    // Build comma-separated form like 1,234,567
    const s = '$' + n.toLocaleString('en-US');
    assert.equal(parseAmount(s), n);
  }
});
