import { test, before, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';

import { fetchPatentGrants } from '../sources/uspto.ts';

let server: Server;
let endpoint = '';
let mode: 'happy' | 'empty' | '500' | 'malformed' = 'happy';
let lastBody = '';

before(async () => {
  server = createServer((req, res) => {
    let chunks = '';
    req.on('data', (c) => { chunks += c; });
    req.on('end', () => {
      lastBody = chunks;
      if (mode === '500') {
        res.writeHead(500); res.end('boom'); return;
      }
      if (mode === 'malformed') {
        res.writeHead(200, { 'content-type': 'application/json' });
        res.end(JSON.stringify({ unexpected: 'shape', count: 42 }));
        return;
      }
      if (mode === 'empty') {
        res.writeHead(200, { 'content-type': 'application/json' });
        res.end(JSON.stringify({ patents: [] }));
        return;
      }
      // happy: 3 grants, descending by patent_date
      res.writeHead(200, { 'content-type': 'application/json' });
      res.end(JSON.stringify({
        patents: [
          { patent_id: '11111111', patent_title: 'Tensor core scheduling', patent_date: '2026-04-20' },
          { patent_id: '22222222', patent_title: 'Heterogeneous memory fabric', patent_date: '2026-03-15' },
          { patent_id: '33333333', patent_title: 'Inference pipeline cache', patent_date: '2026-02-01' },
        ],
      }));
    });
  });
  await new Promise<void>((r) => server.listen(0, '127.0.0.1', r));
  const { port } = server.address() as AddressInfo;
  endpoint = `http://127.0.0.1:${port}/api/v1/patent/`;
});

after(async () => new Promise<void>((res, rej) => server.close((e) => (e ? rej(e) : res()))));

beforeEach(() => { mode = 'happy'; lastBody = ''; });

test('happy path: 3 grants → count=3, titles preserved in order', async () => {
  const out = await fetchPatentGrants('NVIDIA Corporation', 180, endpoint);
  assert.ok(out);
  assert.equal(out.count, 3);
  assert.deepEqual(out.recentTitles, [
    'Tensor core scheduling',
    'Heterogeneous memory fabric',
    'Inference pipeline cache',
  ]);
});

test('happy path: POST body includes _gte patent_date + assignee _contains', async () => {
  await fetchPatentGrants('Apple Inc.', 180, endpoint);
  const body = JSON.parse(lastBody) as Record<string, unknown>;
  // q._and[0]._gte.patent_date is a YYYY-MM-DD string
  const q = body['q'] as { _and: Array<Record<string, Record<string, string>>> };
  assert.ok(q._and[0]?._gte?.['patent_date']);
  assert.match(q._and[0]!._gte!['patent_date']!, /^\d{4}-\d{2}-\d{2}$/);
  // assignee mention
  const assigneeClause = q._and[1] as { _contains: Record<string, string> };
  assert.equal(assigneeClause._contains['assignees_at_grant.assignee_organization'], 'Apple Inc.');
  // f/s/o fields present
  assert.deepEqual(body['f'], ['patent_id', 'patent_title', 'patent_date']);
  assert.deepEqual(body['s'], [{ patent_date: 'desc' }]);
});

test('empty results: 0 grants → count=0, titles=[]', async () => {
  mode = 'empty';
  const out = await fetchPatentGrants('Nobody Corp', 180, endpoint);
  assert.deepEqual(out, { count: 0, recentTitles: [] });
});

test('network 500 → null (graceful), warning logged', async () => {
  mode = '500';
  const warns: string[] = [];
  const orig = console.warn;
  console.warn = (msg: string) => { warns.push(msg); };
  try {
    const out = await fetchPatentGrants('Apple Inc.', 180, endpoint);
    assert.equal(out, null);
    assert.ok(warns.length >= 1);
    assert.match(warns[0]!, /\[uspto\] Apple Inc\.:/);
  } finally {
    console.warn = orig;
  }
});

test('malformed body (no patents array) → degrade to empty, warn', async () => {
  mode = 'malformed';
  const warns: string[] = [];
  const orig = console.warn;
  console.warn = (msg: string) => { warns.push(msg); };
  try {
    const out = await fetchPatentGrants('Apple Inc.', 180, endpoint);
    assert.deepEqual(out, { count: 0, recentTitles: [] });
    assert.ok(warns.length >= 1);
    assert.match(warns[0]!, /unrecognized response shape/);
  } finally {
    console.warn = orig;
  }
});

test('empty assignee string → immediate empty (no HTTP)', async () => {
  const out = await fetchPatentGrants('', 180, endpoint);
  assert.deepEqual(out, { count: 0, recentTitles: [] });
});
