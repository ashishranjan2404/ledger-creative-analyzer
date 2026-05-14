import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  ENV_VARS, readEnv, runDeepDive, rotateCards, weekOfYear,
} from '../deepdive.ts';
import { buildLlmClientOrNull, groupTranscriptsByTicker } from '../layers/narrative.ts';
import { RECIPIENT } from '../_recipient.ts';
import { toTicker } from '../_watchlist.ts';
import type { Transcript } from '../sources/transcripts.ts';

function fullEnv(): Record<string, string> {
  return {
    RESEND_KEY: 'rk',
    BUTTERBASE_SERVICE_KEY: 'bk',
    RECIPIENT,
  };
}

test('readEnv: each missing env var produces an error naming that var', () => {
  for (const k of ENV_VARS) {
    const env = fullEnv();
    delete env[k];
    assert.throws(
      () => readEnv(env as NodeJS.ProcessEnv),
      new RegExp(`missing env var.*\\b${k}\\b`),
      `expected error mentioning ${k}`,
    );
  }
});

test('readEnv: empty string treated as missing', () => {
  const env = fullEnv();
  env.RESEND_KEY = '';
  assert.throws(() => readEnv(env as NodeJS.ProcessEnv), /RESEND_KEY/);
});

test('readEnv: all vars present returns object with each key', () => {
  const out = readEnv(fullEnv() as NodeJS.ProcessEnv);
  for (const k of ENV_VARS) assert.equal(typeof out[k], 'string');
  assert.equal(out.RECIPIENT, RECIPIENT);
});

test('readEnv: lists all missing vars in one error message', () => {
  const env = fullEnv();
  delete env.RESEND_KEY;
  delete env.BUTTERBASE_SERVICE_KEY;
  assert.throws(
    () => readEnv(env as NodeJS.ProcessEnv),
    /RESEND_KEY.*BUTTERBASE_SERVICE_KEY|BUTTERBASE_SERVICE_KEY.*RESEND_KEY/,
  );
});

test('runDeepDive: missing env throws (uses real process.env which lacks keys)', async () => {
  const saved: Record<string, string | undefined> = {};
  for (const k of ENV_VARS) { saved[k] = process.env[k]; delete process.env[k]; }
  try {
    await assert.rejects(() => runDeepDive(), /missing env var/);
  } finally {
    for (const k of ENV_VARS) {
      if (saved[k] !== undefined) process.env[k] = saved[k]; else delete process.env[k];
    }
  }
});

test('runDeepDive: wrong RECIPIENT triggers assertPersonalRecipient', async () => {
  const env = fullEnv();
  env.RECIPIENT = 'attacker@example.com';
  const saved: Record<string, string | undefined> = {};
  for (const k of ENV_VARS) { saved[k] = process.env[k]; process.env[k] = env[k]; }
  try {
    await assert.rejects(() => runDeepDive(), /personal tool only/);
  } finally {
    for (const k of ENV_VARS) {
      if (saved[k] !== undefined) process.env[k] = saved[k]; else delete process.env[k];
    }
  }
});

// Unit-test the rotation helper directly so we don't depend on real-time week math
// in the orchestrator integration test.
test('rotateCards: returns all when N <= bucket', () => {
  const cards = ['a', 'b', 'c'];
  assert.deepEqual(rotateCards(cards, new Date('2026-05-10'), 4), cards);
});

test('rotateCards: deterministic per week, 4-card slice', () => {
  const cards = ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h'];
  const out1 = rotateCards(cards, new Date('2026-01-04T12:00:00Z'), 4);
  const out2 = rotateCards(cards, new Date('2026-01-04T12:00:00Z'), 4);
  assert.equal(out1.length, 4);
  assert.deepEqual(out1, out2, 'same date → same rotation');
});

test('rotateCards: different weeks select different slots', () => {
  const cards = ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h'];
  const w1 = rotateCards(cards, new Date('2026-01-04T12:00:00Z'), 4);
  const w2 = rotateCards(cards, new Date('2026-01-11T12:00:00Z'), 4);
  // 8 cards, bucket 4, groups=2 → consecutive weeks should land on different halves.
  assert.notDeepEqual(w1, w2);
});

test('weekOfYear: anchors to ISO 8601 week numbers for known dates', () => {
  // 2026-01-01 is a Thursday → ISO week 1 of 2026.
  assert.equal(weekOfYear(new Date('2026-01-01T12:00:00Z')), 1);
  // Mid-July sanity (mid-July ≈ week 28-29) AND in-range guard.
  const w = weekOfYear(new Date('2026-07-15T12:00:00Z'));
  assert.ok(w >= 1 && w <= 53, `out of ISO range: ${w}`);
  assert.ok(w >= 28 && w <= 29, `mid-July expected ~28-29, got ${w}`);
});

// L4 narrative is OPTIONAL: ANTHROPIC_API_KEY missing must NOT reject. readEnv
// only validates the 3 hard-required vars; the deepdive run silently downgrades
// L4 to skipped when the LLM key isn't configured.
test('readEnv: ANTHROPIC_API_KEY is NOT required (L4 is optional)', () => {
  const env = fullEnv();           // intentionally no ANTHROPIC_API_KEY
  const out = readEnv(env as NodeJS.ProcessEnv);
  for (const k of ENV_VARS) assert.equal(typeof out[k], 'string');
  // ENV_VARS list itself must not include ANTHROPIC_API_KEY.
  assert.ok(!(ENV_VARS as readonly string[]).includes('ANTHROPIC_API_KEY'),
    'ANTHROPIC_API_KEY must stay out of the required-env aggregate');
});

// === buildLlmClientOrNull: env-injectable, null on missing key ============
// Direct unit tests on the gating helper — both branches stay reachable
// without process.env mutation. defaultLlmClient returns a closure (typeof
// 'function') when the key is present, null when it's absent or init throws.
test('buildLlmClientOrNull: returns null when ANTHROPIC_API_KEY is missing', () => {
  const env = { RESEND_KEY: 'rk' } as NodeJS.ProcessEnv;
  assert.equal(buildLlmClientOrNull(env), null);
});

test('buildLlmClientOrNull: returns a client when ANTHROPIC_API_KEY is set', () => {
  const env = { ANTHROPIC_API_KEY: 'sk-test' } as NodeJS.ProcessEnv;
  const client = buildLlmClientOrNull(env);
  assert.equal(typeof client, 'function', 'expected an LlmClient function');
});

// === groupTranscriptsByTicker: O(1) lookup helper =========================
function mkT(ticker: string, ymd: string, accSuffix: string): Transcript {
  return {
    ticker: toTicker(ticker),
    filingDate: new Date(`${ymd}T12:00:00Z`),
    accessionNumber: `0000000000-26-00${accSuffix}`,
    text: 'placeholder body',
    exhibitUrl: 'https://example.invalid/x.htm',
    wordCount: 800,
  };
}

test('groupTranscriptsByTicker: groups by ticker, sorts newest→oldest within group', () => {
  const rows: Transcript[] = [
    mkT('NVDA', '2026-01-15', '01'),
    mkT('AAPL', '2026-02-20', '02'),
    mkT('NVDA', '2026-04-15', '03'),
    mkT('NVDA', '2025-10-15', '04'),
  ];
  const map = groupTranscriptsByTicker(rows);
  const nvda = map.get(toTicker('NVDA'));
  assert.ok(nvda, 'NVDA group present');
  assert.equal(nvda.length, 3);
  assert.equal(nvda[0]!.accessionNumber, '0000000000-26-0003', 'newest first');
  assert.equal(nvda[2]!.accessionNumber, '0000000000-26-0004', 'oldest last');
  const aapl = map.get(toTicker('AAPL'));
  assert.equal(aapl?.length, 1);
});

test('groupTranscriptsByTicker: empty input returns empty map', () => {
  const map = groupTranscriptsByTicker([]);
  assert.equal(map.size, 0);
});

test('runDeepDive does not fail env-validation when ANTHROPIC_API_KEY is absent', async () => {
  // Wire up the 3 required env vars but leave ANTHROPIC_API_KEY unset. We expect
  // env-validation to PASS (no `missing env var` throw); the test asserts the
  // assertion stops being the cause of failure, not that the network run completes.
  const env = fullEnv();
  const saved: Record<string, string | undefined> = {};
  for (const k of ENV_VARS) { saved[k] = process.env[k]; process.env[k] = env[k]; }
  const savedKey = process.env.ANTHROPIC_API_KEY;
  delete process.env.ANTHROPIC_API_KEY;
  try {
    let envFail = false;
    try { await runDeepDive(); }
    catch (e) {
      envFail = /missing env var/.test(e instanceof Error ? e.message : String(e));
    }
    assert.equal(envFail, false, 'missing ANTHROPIC_API_KEY must not throw `missing env var`');
  } finally {
    for (const k of ENV_VARS) {
      if (saved[k] !== undefined) process.env[k] = saved[k]; else delete process.env[k];
    }
    if (savedKey !== undefined) process.env.ANTHROPIC_API_KEY = savedKey;
  }
});
