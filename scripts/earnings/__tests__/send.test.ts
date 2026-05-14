import { test, before, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';

import { sendEmail } from '../send.ts';
import { RECIPIENT } from '../_recipient.ts';

type Captured = { auth?: string | undefined; body?: unknown; method?: string | undefined };
let captured: Captured = {};
let nextStatus = 200;

let server: Server;
let endpoint: string;

before(async () => {
  server = createServer((req, res) => {
    let raw = '';
    req.on('data', (c) => { raw += c; });
    req.on('end', () => {
      captured = {
        method: req.method,
        auth: req.headers['authorization'] as string | undefined,
        body: raw ? JSON.parse(raw) : null,
      };
      if (nextStatus >= 400) { res.writeHead(nextStatus); res.end('boom'); return; }
      res.writeHead(200, { 'content-type': 'application/json' });
      res.end(JSON.stringify({ id: 'em_123' }));
    });
  });
  await new Promise<void>((r) => server.listen(0, '127.0.0.1', r));
  endpoint = `http://127.0.0.1:${(server.address() as AddressInfo).port}/emails`;
});

after(async () => {
  await new Promise<void>((res, rej) => server.close((e) => (e ? rej(e) : res())));
});

beforeEach(() => { captured = {}; nextStatus = 200; });

const ARGS = {
  apiKey: 'rs_test',
  from: 'thedi@platformy.org',
  to: RECIPIENT,
  subject: 'subj',
  text: 'body',
};

test('happy path returns Resend id; Bearer header + body shape', async () => {
  const res = await sendEmail({ ...ARGS, endpoint });
  assert.equal(res.id, 'em_123');
  assert.equal(captured.method, 'POST');
  assert.equal(captured.auth, 'Bearer rs_test');
  assert.deepEqual(captured.body, {
    from: ARGS.from, to: ARGS.to, subject: ARGS.subject, text: ARGS.text,
  });
  // No leakage of apiKey/endpoint into request body.
  assert.deepEqual(Object.keys(captured.body as object).sort(), ['from', 'subject', 'text', 'to']);
});

test('wrong recipient throws and never hits HTTP', async () => {
  await assert.rejects(
    () => sendEmail({ ...ARGS, to: 'someone-else@example.com', endpoint }),
    /personal tool only/,
  );
  assert.equal(captured.method, undefined);
});

test('HTTP 500 propagates', async () => {
  nextStatus = 500;
  await assert.rejects(() => sendEmail({ ...ARGS, endpoint }), /HTTP 500/);
});
