// Distributed token-bucket rate limiter. Falls back to in-process bucket
// when no Redis URL is set; uses Upstash REST API when
// UPSTASH_REDIS_REST_URL + UPSTASH_REDIS_REST_TOKEN env vars are present so
// multiple Routines (tactical, deepdive, event_poll) can share a single
// rate budget per source.
//
// Why Upstash REST: no driver package needed, no connection management;
// every call is a stateless HTTPS POST. Fits the Routine model where each
// fire is a fresh process.

import { fetchJson } from './_http.ts';

export type RateLimitOpts = {
  capacity: number; // max burst (tokens)
  refillPerMinute: number; // sustained rate (tokens/minute)
};

// Legacy alias preserved so existing callers (sources/*.ts) keep compiling.
export type AcquireOpts = RateLimitOpts;

type Bucket = { tokens: number; lastRefillMs: number };
const buckets = new Map<string, Bucket>();

const sleep = (ms: number): Promise<void> =>
  new Promise((r) => setTimeout(r, Math.max(100, ms)));

const useRedis = (): boolean =>
  Boolean(process.env.UPSTASH_REDIS_REST_URL && process.env.UPSTASH_REDIS_REST_TOKEN);

// Lua runs atomically inside Redis: refill by elapsed time, deduct if
// possible, return 1 (got) or 0 (wait).
const LUA = `local b=redis.call('GET',KEYS[1])
local now=tonumber(ARGV[1])
local cap=tonumber(ARGV[2])
local refill=tonumber(ARGV[3])
local tokens,last
if b then local d=cjson.decode(b) tokens,last=d.tokens,d.last
else tokens,last=cap,now end
tokens=math.min(cap,tokens+(now-last)/60000*refill)
if tokens>=1 then
  redis.call('SET',KEYS[1],cjson.encode({tokens=tokens-1,last=now}))
  return 1
end
return 0`;

function refill(b: Bucket, opts: RateLimitOpts, now: number): void {
  const elapsed = now - b.lastRefillMs;
  const add = (elapsed / 60_000) * opts.refillPerMinute;
  b.tokens = Math.min(opts.capacity, b.tokens + add);
  b.lastRefillMs = now;
}

// Returns 0 if a token was acquired, or ms to wait before retrying.
function tryLocal(key: string, opts: RateLimitOpts): number {
  const now = Date.now();
  let b = buckets.get(key);
  if (!b) {
    b = { tokens: opts.capacity, lastRefillMs: now };
    buckets.set(key, b);
  }
  refill(b, opts, now);
  if (b.tokens >= 1) {
    b.tokens -= 1;
    return 0;
  }
  return (60_000 / opts.refillPerMinute) * (1 - b.tokens);
}

async function tryRedis(key: string, opts: RateLimitOpts): Promise<boolean> {
  const url = process.env.UPSTASH_REDIS_REST_URL!;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN!;
  const body = [
    'EVAL',
    LUA,
    '1',
    `thedi:rl:${key}`,
    String(Date.now()),
    String(opts.capacity),
    String(opts.refillPerMinute),
  ];
  const res = await fetchJson<{ result: number }>(url, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'content-type': 'application/json',
    },
    body: JSON.stringify(body),
  });
  return res.result === 1;
}

async function acquireImpl(key: string, opts: RateLimitOpts): Promise<void> {
  for (;;) {
    if (useRedis()) {
      if (await tryRedis(key, opts)) return;
      await sleep(60_000 / opts.refillPerMinute);
      continue;
    }
    const wait = tryLocal(key, opts);
    if (wait === 0) return;
    await sleep(wait);
  }
}

// Test seam: callers override `__test.impl` to bypass the real limiter
// (see sources_arcticshift.test.ts). Defaults to the real implementation.
export const __test = { impl: acquireImpl };

// Acquire one token for the given key. Resolves when a token is available.
// If the bucket is exhausted, sleeps until the next refill, then retries.
export function acquireToken(key: string, opts: RateLimitOpts): Promise<void> {
  return __test.impl(key, opts);
}

// For tests: reset all in-process buckets and restore the default impl.
export function _resetRateLimiter(): void {
  buckets.clear();
  __test.impl = acquireImpl;
}
