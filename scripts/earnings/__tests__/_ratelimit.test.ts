import { test, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';

import { acquireToken, _resetRateLimiter } from '../_ratelimit.ts';

beforeEach(() => {
  _resetRateLimiter();
  delete process.env.UPSTASH_REDIS_REST_URL;
  delete process.env.UPSTASH_REDIS_REST_TOKEN;
});

// Bound waits so a regression can't hang the suite for 60s.
const within = async (ms: number, p: Promise<unknown>): Promise<unknown> => {
  let timer: NodeJS.Timeout | undefined;
  const guard = new Promise((_, rej) => {
    timer = setTimeout(() => rej(new Error(`exceeded ${ms}ms`)), ms);
  });
  try {
    return await Promise.race([p, guard]);
  } finally {
    if (timer) clearTimeout(timer);
  }
};

test('first capacity calls return immediately', async () => {
  const opts = { capacity: 3, refillPerMinute: 60 };
  const t0 = Date.now();
  await acquireToken('k1', opts);
  await acquireToken('k1', opts);
  await acquireToken('k1', opts);
  // 3 calls in well under one refill interval (1s at 60/min).
  assert.ok(Date.now() - t0 < 100, `burst took ${Date.now() - t0}ms`);
});

test('(capacity+1)-th call waits until refill', async () => {
  // 600/min => one token every 100ms; sleep helper floors at 100ms.
  const opts = { capacity: 1, refillPerMinute: 600 };
  await acquireToken('k2', opts);
  const t0 = Date.now();
  await within(2000, acquireToken('k2', opts));
  const elapsed = Date.now() - t0;
  assert.ok(elapsed >= 90, `expected to wait ~100ms, got ${elapsed}ms`);
});

test('separate keys have independent buckets', async () => {
  const opts = { capacity: 1, refillPerMinute: 60 };
  await acquireToken('alpha', opts);
  const t0 = Date.now();
  // 'beta' starts full even though 'alpha' is drained.
  await acquireToken('beta', opts);
  assert.ok(Date.now() - t0 < 50);
});

test('time-based refill: tokens come back after a sleep', async () => {
  const opts = { capacity: 1, refillPerMinute: 600 }; // 1 token / 100ms
  await acquireToken('k3', opts);
  await new Promise((r) => setTimeout(r, 200));
  const t0 = Date.now();
  await acquireToken('k3', opts);
  // Should be immediate — a token has refilled during the sleep.
  assert.ok(Date.now() - t0 < 50, `expected immediate, got ${Date.now() - t0}ms`);
});

test('_resetRateLimiter clears all buckets', async () => {
  const opts = { capacity: 1, refillPerMinute: 1 }; // very slow refill
  await acquireToken('k4', opts);
  // Without reset, the next call would block for ~60s. Reset restores capacity.
  _resetRateLimiter();
  const t0 = Date.now();
  await acquireToken('k4', opts);
  assert.ok(Date.now() - t0 < 50, `reset should restore capacity, got ${Date.now() - t0}ms`);
});

// ---- Upstash REST backend wire test ----------------------------------------
// We mock globalThis.fetch and assert URL/body/Authorization. We don't simulate
// real Redis semantics — that's the job of an integration test against Upstash.

type Captured = { url: string; init: RequestInit };

const captureFetch = (result: number): { calls: Captured[]; restore: () => void } => {
  const calls: Captured[] = [];
  const original = globalThis.fetch;
  globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    calls.push({ url: String(input), init: init ?? {} });
    return new Response(JSON.stringify({ result }), {
      status: 200,
      headers: { 'content-type': 'application/json' },
    });
  }) as typeof fetch;
  return { calls, restore: () => { globalThis.fetch = original; } };
};

let restoreFetch: (() => void) | undefined;
afterEach(() => {
  if (restoreFetch) { restoreFetch(); restoreFetch = undefined; }
});

test('upstash backend posts EVAL with auth header and key', async () => {
  process.env.UPSTASH_REDIS_REST_URL = 'https://example.upstash.io';
  process.env.UPSTASH_REDIS_REST_TOKEN = 'secret-token';
  const mock = captureFetch(1);
  restoreFetch = mock.restore;

  await acquireToken('reddit_rss', { capacity: 5, refillPerMinute: 10 });

  assert.equal(mock.calls.length, 1);
  const [c] = mock.calls;
  assert.ok(c);
  assert.equal(c.url, 'https://example.upstash.io');
  assert.equal(c.init.method, 'POST');
  const headers = c.init.headers as Record<string, string>;
  assert.equal(headers['Authorization'], 'Bearer secret-token');
  const body = JSON.parse(c.init.body as string) as string[];
  assert.equal(body[0], 'EVAL');
  assert.equal(body[2], '1'); // numkeys
  assert.equal(body[3], 'thedi:rl:reddit_rss');
  assert.equal(body[5], '5'); // capacity
  assert.equal(body[6], '10'); // refillPerMinute
});
