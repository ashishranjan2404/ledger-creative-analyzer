import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';

import { fetchWithTimeout, fetchJson, fetchRss } from '../_http.ts';

let server: Server;
let base: string;

before(async () => {
  server = createServer((req, res) => {
    if (req.url === '/slow') return;
    if (req.url === '/json') {
      res.writeHead(200, { 'content-type': 'application/json' });
      res.end(JSON.stringify({ ok: true, n: 42 }));
      return;
    }
    res.writeHead(404, { 'content-type': 'text/plain' });
    res.end('not found');
  });
  await new Promise<void>((r) => server.listen(0, '127.0.0.1', r));
  const { port } = server.address() as AddressInfo;
  base = `http://127.0.0.1:${port}`;
});

after(async () => {
  await new Promise<void>((resolve, reject) =>
    server.close((err) => (err ? reject(err) : resolve())),
  );
});

test('fetchWithTimeout aborts on slow endpoint', async () => {
  await assert.rejects(
    () => fetchWithTimeout(`${base}/slow`, undefined, 100),
    (err: Error) => {
      assert.match(err.message, /^timeout after \d+ms: /);
      return true;
    },
  );
});

test('fetchJson parses a JSON 200', async () => {
  const data = await fetchJson<{ ok: boolean; n: number }>(`${base}/json`);
  assert.deepEqual(data, { ok: true, n: 42 });
});

test('fetchJson throws on 404', async () => {
  await assert.rejects(
    () => fetchJson(`${base}/missing`),
    /^Error: HTTP 404 Not Found: /,
  );
});

const RSS_FIXTURE = `<?xml version="1.0"?>
<rss version="2.0"><channel>
<item>
  <title><![CDATA[NVDA beats Q1 &amp; raises]]></title>
  <link>https://example.com/a</link>
  <pubDate>Wed, 08 May 2026 12:00:00 GMT</pubDate>
  <description>Strong quarter</description>
</item>
<item>
  <title>AMD guidance</title>
  <link>https://example.com/b</link>
  <pubDate>not-a-real-date</pubDate>
</item>
</channel></rss>`;

test('fetchRss extracts items, decodes entities, drops invalid dates', async () => {
  const items = await fetchRss(`data:application/xml,${encodeURIComponent(RSS_FIXTURE)}`);
  assert.equal(items.length, 2);
  assert.equal(items[0]?.title, 'NVDA beats Q1 & raises');
  assert.equal(items[0]?.link, 'https://example.com/a');
  assert.equal(items[0]?.description, 'Strong quarter');
  assert.ok(items[0]?.pubDate instanceof Date);
  assert.equal(items[0]?.pubDate?.getUTCFullYear(), 2026);
  assert.equal(items[1]?.title, 'AMD guidance');
  assert.equal(items[1]?.pubDate, undefined);
});

test('fetchRss handles Atom <entry> with link href and summary', async () => {
  const xml = `<feed xmlns="http://www.w3.org/2005/Atom">
<entry>
  <title>SEC 8-K NVDA</title>
  <link href="https://sec.gov/x" rel="alternate"/>
  <updated>2026-05-08T12:00:00Z</updated>
  <summary>Filed</summary>
</entry></feed>`;
  const items = await fetchRss(`data:application/xml,${encodeURIComponent(xml)}`);
  assert.equal(items.length, 1);
  assert.equal(items[0]?.title, 'SEC 8-K NVDA');
  assert.equal(items[0]?.link, 'https://sec.gov/x');
  assert.equal(items[0]?.description, 'Filed');
  assert.equal(items[0]?.pubDate?.getUTCFullYear(), 2026);
});

test('fetchRss returns [] for an empty feed', async () => {
  const items = await fetchRss(`data:application/xml,${encodeURIComponent('<feed></feed>')}`);
  assert.deepEqual(items, []);
});
