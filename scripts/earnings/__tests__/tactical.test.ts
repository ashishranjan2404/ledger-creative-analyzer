import { test } from 'node:test';
import assert from 'node:assert/strict';

import { ENV_VARS, readEnv, runTactical } from '../tactical.ts';
import { RECIPIENT } from '../_recipient.ts';
import { __test as rlTest, _resetRateLimiter } from '../_ratelimit.ts';

// Build a complete env shape so we can knock out one var at a time.
function fullEnv(): Record<string, string> {
  return {
    FINNHUB_KEY: 'f', POLYGON_KEY: 'p', BENZINGA_KEY: 'b',
    REDDIT_CLIENT_ID: 'rid', REDDIT_CLIENT_SECRET: 'rs',
    RESEND_KEY: 'rk', BUTTERBASE_SERVICE_KEY: 'bk',
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
  env.FINNHUB_KEY = '';
  assert.throws(() => readEnv(env as NodeJS.ProcessEnv), /FINNHUB_KEY/);
});

test('readEnv: all vars present returns object with each key', () => {
  const out = readEnv(fullEnv() as NodeJS.ProcessEnv);
  for (const k of ENV_VARS) assert.equal(typeof out[k], 'string');
  assert.equal(out.RECIPIENT, RECIPIENT);
});

test('readEnv: REDDIT_CLIENT_ID/SECRET are optional — missing does NOT throw', () => {
  const env = fullEnv();
  delete env.REDDIT_CLIENT_ID;
  delete env.REDDIT_CLIENT_SECRET;
  const out = readEnv(env as NodeJS.ProcessEnv);
  assert.equal(out.REDDIT_CLIENT_ID, undefined);
  assert.equal(out.REDDIT_CLIENT_SECRET, undefined);
  assert.equal(out.RECIPIENT, RECIPIENT);
});

test('readEnv: lists all missing vars in one error message', () => {
  const env = fullEnv();
  delete env.FINNHUB_KEY;
  delete env.RESEND_KEY;
  assert.throws(
    () => readEnv(env as NodeJS.ProcessEnv),
    /FINNHUB_KEY.*RESEND_KEY|RESEND_KEY.*FINNHUB_KEY/,
  );
});

test('runTactical: missing env throws (uses real process.env which lacks keys)', async () => {
  const saved: Record<string, string | undefined> = {};
  for (const k of ENV_VARS) { saved[k] = process.env[k]; delete process.env[k]; }
  try {
    await assert.rejects(() => runTactical(), /missing env var/);
  } finally {
    for (const k of ENV_VARS) {
      if (saved[k] !== undefined) process.env[k] = saved[k]; else delete process.env[k];
    }
  }
});

test('runTactical: wrong RECIPIENT triggers assertPersonalRecipient', async () => {
  const env = fullEnv();
  env.RECIPIENT = 'attacker@example.com';
  const saved: Record<string, string | undefined> = {};
  for (const k of ENV_VARS) { saved[k] = process.env[k]; process.env[k] = env[k]; }
  try {
    await assert.rejects(() => runTactical(), /personal tool only/);
  } finally {
    for (const k of ENV_VARS) {
      if (saved[k] !== undefined) process.env[k] = saved[k]; else delete process.env[k];
    }
  }
});

// WHY: a Resend outage MUST NOT abort the run. The contract: runTactical
// returns { sent: false }, findings + audit_log are still written. We stub
// globalThis.fetch so Resend POSTs fail and Butterbase POSTs see captured
// calls — proving the audit row was attempted with ok:false.
test('runTactical: email failure → sent:false, audit_log still written with ok:false', async () => {
  const env = fullEnv();
  const saved: Record<string, string | undefined> = {};
  for (const k of ENV_VARS) { saved[k] = process.env[k]; process.env[k] = env[k]; }
  // Reddit-RSS + Arctic-Shift gate calls through the rate limiter. With 8
  // tickers × 4 subs = 32 calls / source, the real bucket would serialize
  // this test for minutes. Bypass to keep e2e snappy; restored in finally.
  rlTest.impl = () => Promise.resolve();
  const originalFetch = globalThis.fetch;
  const calls: { url: string; body: unknown }[] = [];
  globalThis.fetch = (async (input: string | URL | Request, init?: RequestInit) => {
    const url = typeof input === 'string' ? input : input.toString();
    let body: unknown = null;
    try { body = init?.body ? JSON.parse(String(init.body)) : null; } catch { /* not JSON */ }
    calls.push({ url, body });
    if (url.startsWith('https://api.resend.com')) {
      return new Response(JSON.stringify({ message: 'service unavailable' }), { status: 503 });
    }
    if (url.includes('butterbase.dev')) {
      // Echo a row shape with id so insertRow/insertRows resolve cleanly.
      return new Response(JSON.stringify({ id: 'row_test', ...((body as object) ?? {}) }), { status: 200 });
    }
    // Source fan-out (finnhub, polygon, yahoo, benzinga, reddit, stocktwits):
    // return empty bodies so the orchestrator proceeds with zero findings.
    return new Response('{}', { status: 200 });
  }) as typeof fetch;
  try {
    const result = await runTactical();
    assert.equal(result.sent, false, 'sent must be false when Resend fails');
    assert.equal(typeof result.findings, 'number');
    assert.equal(typeof result.ms, 'number');
    const auditCall = calls.find((c) => c.url.includes('/api/data/audit_log'));
    assert.ok(auditCall, 'expected an audit_log POST even when email failed');
    const row = auditCall.body as { ok: boolean; note: string; step: string };
    assert.equal(row.step, 'tactical_run');
    assert.equal(row.ok, false, 'audit row ok must be false on email failure');
    assert.match(row.note, /email failed/, 'audit note must explain the email failure');
  } finally {
    globalThis.fetch = originalFetch;
    _resetRateLimiter();
    for (const k of ENV_VARS) {
      if (saved[k] !== undefined) process.env[k] = saved[k]; else delete process.env[k];
    }
  }
});
