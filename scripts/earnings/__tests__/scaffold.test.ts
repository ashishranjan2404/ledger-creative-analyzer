import { test } from 'node:test';
import assert from 'node:assert/strict';

import { isTrackedTicker, toTicker } from '../_watchlist.ts';
import { RECIPIENT, assertPersonalRecipient } from '../_recipient.ts';

test('toTicker throws on empty string', () => {
  assert.throws(() => toTicker(''), /invalid ticker format/);
});

test('toTicker throws on lowercase', () => {
  assert.throws(() => toTicker('tsla'), /invalid ticker format/);
});

test('toTicker throws on >5 chars', () => {
  assert.throws(() => toTicker('TOOLONG'), /invalid ticker format/);
});

test('toTicker accepts valid format even when off-watchlist (MSTR)', () => {
  // WHY: toTicker is parse+brand only; membership is isTrackedTicker's job.
  const t = toTicker('MSTR');
  assert.equal(t, 'MSTR');
});

test('toTicker accepts on-watchlist ticker', () => {
  assert.equal(toTicker('NVDA'), 'NVDA');
});

test('isTrackedTicker returns true for NVDA', () => {
  assert.equal(isTrackedTicker('NVDA'), true);
});

test('isTrackedTicker returns false for XYZ (valid format, off-watchlist)', () => {
  assert.equal(isTrackedTicker('XYZ'), false);
});

test('isTrackedTicker returns false for invalid format', () => {
  assert.equal(isTrackedTicker('tsla'), false);
});

test('assertPersonalRecipient accepts the personal address', () => {
  assert.doesNotThrow(() => assertPersonalRecipient(RECIPIENT));
});

test('assertPersonalRecipient throws with "personal tool only" on other addresses', () => {
  assert.throws(
    () => assertPersonalRecipient('attacker@example.com'),
    /personal tool only/,
  );
});
