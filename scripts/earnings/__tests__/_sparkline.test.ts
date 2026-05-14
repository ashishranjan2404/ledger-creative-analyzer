import { test } from 'node:test';
import assert from 'node:assert/strict';

import { sparkline } from '../_sparkline.ts';

const BLOCKS = '▁▂▃▄▅▆▇█';
const GAP = '·';

test('sparkline([]) returns empty string', () => {
  assert.equal(sparkline([]), '');
});

test('sparkline([5]) returns a single block char (middle level)', () => {
  const s = sparkline([5]);
  assert.equal(s.length, 1);
  assert.ok(BLOCKS.includes(s), `expected a block char, got ${JSON.stringify(s)}`);
});

test('sparkline of monotonic 1..8 is monotonically non-decreasing block chars', () => {
  const s = sparkline([1, 2, 3, 4, 5, 6, 7, 8]);
  assert.equal(s.length, 8);
  for (let i = 0; i < s.length; i++) {
    assert.ok(BLOCKS.includes(s[i] as string), `non-block at ${i}: ${s[i]}`);
  }
  // First should be lowest (▁), last should be highest (█).
  assert.equal(s[0], BLOCKS[0]);
  assert.equal(s[s.length - 1], BLOCKS[BLOCKS.length - 1]);
  // Non-decreasing levels.
  for (let i = 1; i < s.length; i++) {
    const prev = BLOCKS.indexOf(s[i - 1] as string);
    const curr = BLOCKS.indexOf(s[i] as string);
    assert.ok(curr >= prev, `levels decreased at ${i}: ${prev} -> ${curr}`);
  }
});

test('sparkline of all-equal returns same char repeated', () => {
  const s = sparkline([1, 1, 1, 1]);
  assert.equal(s.length, 4);
  assert.equal(new Set(s).size, 1);
  assert.ok(BLOCKS.includes(s[0] as string));
});

test('sparkline of [-5, 0, 5] ascends low → high', () => {
  const s = sparkline([-5, 0, 5]);
  assert.equal(s.length, 3);
  assert.equal(s[0], BLOCKS[0]);
  assert.equal(s[2], BLOCKS[BLOCKS.length - 1]);
});

test('sparkline([1, NaN, 3]) renders gap marker in middle', () => {
  const s = sparkline([1, NaN, 3]);
  assert.equal(s.length, 3);
  assert.equal(s[1], GAP);
  assert.ok(BLOCKS.includes(s[0] as string));
  assert.ok(BLOCKS.includes(s[2] as string));
});

test('sparkline([1, Infinity, 3]) renders gap marker in middle', () => {
  const s = sparkline([1, Infinity, 3]);
  assert.equal(s.length, 3);
  assert.equal(s[1], GAP);
  assert.ok(BLOCKS.includes(s[0] as string));
  assert.ok(BLOCKS.includes(s[2] as string));
});

test('sparkline of all-NaN returns all gap markers', () => {
  const s = sparkline([NaN, NaN, NaN]);
  assert.equal(s, GAP.repeat(3));
});

test('sparkline([NaN]) returns a single gap marker', () => {
  assert.equal(sparkline([NaN]), GAP);
});
