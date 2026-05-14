import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';

import {
  fetchStocktwitsForTicker,
  fetchStocktwitsForTickers,
} from '../sources/stocktwits.ts';
import { toTicker } from '../_watchlist.ts';

let server: Server;
let endpoint: string;
const seen: { url: string }[] = [];

const mk = (id: number, body: string, hh: string, user: string, basic?: string | null) => ({
  id, body, created_at: `2026-05-01T${hh}:00:00Z`, user: { username: user },
  ...(basic === undefined ? {} : { entities: { sentiment: basic === null ? null : { basic } } }),
});
const FIXTURES: Record<string, unknown> = {
  AAPL: {
    messages: [
      mk(111, 'to the moon', '12', 'alice', 'Bullish'),
      mk(112, 'puts loaded', '13', 'bob', 'Bearish'),
      mk(113, 'just curious', '14', 'carol', null),
      mk(114, 'no entities at all', '15', 'dave'),
      mk(115, 'reserved chars', '16', 'weird user/name', 'Bullish'),
      // dropped: malformed
      { body: 'no id' },
      { id: 999, body: 'no user', created_at: '2026-05-01T17:00:00Z' },
    ],
  },
  MSFT: { messages: [] },
  EMPTY: {},
};

before(async () => {
  server = createServer((req, res) => {
    seen.push({ url: req.url ?? '' });
    const m = /\/streams\/symbol\/([^.]+)\.json$/.exec(req.url ?? '');
    if (!m) { res.writeHead(404); res.end(); return; }
    const sym = decodeURIComponent(m[1]!);
    if (sym === 'TSLA') { res.writeHead(500); res.end('boom'); return; }
    if (sym in FIXTURES) {
      res.writeHead(200, { 'content-type': 'application/json' });
      res.end(JSON.stringify(FIXTURES[sym]));
      return;
    }
    res.writeHead(404); res.end();
  });
  await new Promise<void>((r) => server.listen(0, '127.0.0.1', r));
  const { port } = server.address() as AddressInfo;
  endpoint = `http://127.0.0.1:${port}`;
});

after(async () => {
  await new Promise<void>((resolve, reject) =>
    server.close((err) => (err ? reject(err) : resolve())),
  );
});

test('extracts Bullish/Bearish/null sentiment; drops malformed messages', async () => {
  const items = await fetchStocktwitsForTicker(toTicker('AAPL'), endpoint);
  assert.equal(items.length, 5);
  assert.equal(items[0]?.sentiment, 'Bullish');
  assert.equal(items[1]?.sentiment, 'Bearish');
  assert.equal(items[2]?.sentiment, null);
  assert.equal(items[3]?.sentiment, null);
  assert.equal(items[0]?.body, 'to the moon');
  assert.ok(items[0]?.published instanceof Date);
  assert.equal(items[0]?.published.toISOString(), '2026-05-01T12:00:00.000Z');
});

test('synthesizes URL from username + id, encoding reserved chars', async () => {
  const items = await fetchStocktwitsForTicker(toTicker('AAPL'), endpoint);
  assert.equal(items[0]?.url, 'https://stocktwits.com/alice/message/111');
  assert.equal(items[1]?.url, 'https://stocktwits.com/bob/message/112');
  assert.equal(items[4]?.url, 'https://stocktwits.com/weird%20user%2Fname/message/115');
});

test('missing messages key returns []', async () => {
  const items = await fetchStocktwitsForTicker(toTicker('EMPTY'), endpoint);
  assert.deepEqual(items, []);
});

test('empty messages array returns []', async () => {
  const items = await fetchStocktwitsForTicker(toTicker('MSFT'), endpoint);
  assert.deepEqual(items, []);
});

test('per-ticker error swallowed with [stocktwits] prefix; siblings still return', async () => {
  const warns: string[] = [];
  const orig = console.warn;
  console.warn = (msg: string) => { warns.push(msg); };
  try {
    const items = await fetchStocktwitsForTickers(
      [toTicker('TSLA'), toTicker('AAPL')],
      endpoint,
    );
    assert.equal(items.length, 5);
    assert.equal(items[0]?.ticker, 'AAPL');
    assert.equal(warns.length, 1);
    assert.match(warns[0]!, /^\[stocktwits\] TSLA:/);
  } finally {
    console.warn = orig;
  }
});

test('empty tickers array returns [] with no HTTP', async () => {
  const before = seen.length;
  const items = await fetchStocktwitsForTickers([], endpoint);
  assert.deepEqual(items, []);
  assert.equal(seen.length, before);
});
