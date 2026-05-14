import { test } from 'node:test';
import assert from 'node:assert/strict';

import { fetchOperationalSignal, TICKER_OPERATIONAL_MAP } from '../layers/operational.ts';
import { toTicker } from '../_watchlist.ts';

const NVDA = toTicker('NVDA');
const AAPL = toTicker('AAPL');

// Snapshot global fetch and restore between tests so a failure in one does
// not leak a stub into the next.
const realFetch = globalThis.fetch;

type Stub = (url: string, init?: RequestInit) => { status: number; body?: unknown; linkHeader?: string };
function withFetch(stub: Stub, fn: () => Promise<void>): Promise<void> {
  globalThis.fetch = (input: string | URL | Request, init?: RequestInit): Promise<Response> => {
    const url = typeof input === 'string' ? input : input.toString();
    const r = stub(url, init);
    const headers = new Headers();
    if (r.linkHeader) headers.set('link', r.linkHeader);
    return Promise.resolve(new Response(JSON.stringify(r.body ?? {}), { status: r.status, headers }));
  };
  return fn().finally(() => { globalThis.fetch = realFetch; });
}

test('happy path: GitHub repo + contributors → stars and contributor count populated', async () => {
  await withFetch(
    (url) => {
      if (url.includes('/contributors')) {
        return {
          status: 200,
          // page=1 is current, page=42 is rel="last" → 42 contributors.
          linkHeader:
            '<https://api.github.com/repositories/1/contributors?per_page=1&anon=1&page=2>; rel="next", '
            + '<https://api.github.com/repositories/1/contributors?per_page=1&anon=1&page=42>; rel="last"',
          body: [{ login: 'someone' }],
        };
      }
      return { status: 200, body: { stargazers_count: 12345 } };
    },
    async () => {
      const sig = await fetchOperationalSignal(NVDA);
      assert.equal(sig.ticker, NVDA);
      assert.equal(sig.githubStars, 12345);
      assert.equal(sig.githubContributors, 42);
      // V1 stubs are undefined, not null/0:
      assert.equal(sig.openJobs, undefined);
      assert.equal(sig.l5Comp, undefined);
    },
  );
});

test('ticker not in map → all metrics undefined, asOf still set', async () => {
  // No fetch should fire; install a throwing stub to prove it.
  const ZZZZ = toTicker('ZZZZ');
  await withFetch(
    () => { throw new Error('no fetch should occur for unmapped ticker'); },
    async () => {
      const sig = await fetchOperationalSignal(ZZZZ);
      assert.equal(sig.ticker, ZZZZ);
      assert.ok(sig.asOf instanceof Date);
      assert.equal(sig.githubStars, undefined);
      assert.equal(sig.githubContributors, undefined);
      assert.equal(sig.openJobs, undefined);
      assert.equal(sig.l5Comp, undefined);
    },
  );
});

test('GitHub 429 on both endpoints → undefined fields, no throw', async () => {
  await withFetch(
    () => ({ status: 429, body: { message: 'API rate limit exceeded' } }),
    async () => {
      const sig = await fetchOperationalSignal(AAPL);
      assert.equal(sig.ticker, AAPL);
      assert.equal(sig.githubStars, undefined);
      assert.equal(sig.githubContributors, undefined);
    },
  );
});

test('partial failure: stars endpoint 429, contributors OK → stars undef, contribs set', async () => {
  await withFetch(
    (url) => {
      if (url.includes('/contributors')) {
        return {
          status: 200,
          linkHeader: '<https://api.github.com/x?page=7>; rel="last"',
          body: [],
        };
      }
      return { status: 429, body: {} };
    },
    async () => {
      const sig = await fetchOperationalSignal(AAPL);
      assert.equal(sig.githubStars, undefined);
      assert.equal(sig.githubContributors, 7);
    },
  );
});

test('no Link header on contributors → contributors stays undefined (small repo noise floor)', async () => {
  await withFetch(
    (url) => url.includes('/contributors')
      ? { status: 200, body: [{ login: 'one' }] }
      : { status: 200, body: { stargazers_count: 5 } },
    async () => {
      const sig = await fetchOperationalSignal(NVDA);
      assert.equal(sig.githubStars, 5);
      assert.equal(sig.githubContributors, undefined);
    },
  );
});

test('TICKER_OPERATIONAL_MAP covers all 8 watchlist tickers', () => {
  const expected = ['AAPL', 'MSFT', 'GOOGL', 'AMZN', 'NVDA', 'META', 'AMD', 'TSLA'];
  for (const t of expected) {
    assert.ok(TICKER_OPERATIONAL_MAP[t], `missing handles for ${t}`);
    assert.ok(TICKER_OPERATIONAL_MAP[t]!.github, `missing github repo for ${t}`);
  }
});

test('options.handles override → custom map used instead of default', async () => {
  await withFetch(
    (url) => {
      assert.ok(url.includes('custom/repo'), `expected custom repo in URL, got ${url}`);
      return { status: 200, body: { stargazers_count: 99 } };
    },
    async () => {
      const sig = await fetchOperationalSignal(NVDA, {
        handles: { NVDA: { github: 'custom/repo' } },
      });
      assert.equal(sig.githubStars, 99);
    },
  );
});

test('options.githubToken → Authorization: Bearer header set on every GH request', async () => {
  // Capture all calls; assert each carries the bearer header. Both /repos and
  // /contributors must be authenticated to actually unlock the 5000/hr quota.
  const seen: { url: string; auth?: string }[] = [];
  await withFetch(
    (url, init) => {
      const headers = new Headers(init?.headers);
      const auth = headers.get('authorization');
      seen.push(auth !== null ? { url, auth } : { url });
      if (url.includes('/contributors')) {
        return { status: 200, linkHeader: '<https://api.github.com/x?page=3>; rel="last"', body: [] };
      }
      return { status: 200, body: { stargazers_count: 1 } };
    },
    async () => {
      const sig = await fetchOperationalSignal(NVDA, { githubToken: 'ghp_test_token_xyz' });
      assert.equal(sig.githubStars, 1);
      assert.equal(sig.githubContributors, 3);
      assert.ok(seen.length >= 2, `expected ≥2 GH calls, saw ${seen.length}`);
      for (const c of seen) {
        assert.equal(c.auth, 'Bearer ghp_test_token_xyz', `missing/wrong auth on ${c.url}`);
      }
    },
  );
});
