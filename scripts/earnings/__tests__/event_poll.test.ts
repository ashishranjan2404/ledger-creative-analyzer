import { test } from 'node:test';
import assert from 'node:assert/strict';

import { ENV_VARS, readEnv, runEventPoll } from '../event_poll.ts';
import { RECIPIENT } from '../_recipient.ts';

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

test('runEventPoll: missing env throws (uses real process.env which lacks keys)', async () => {
  const saved: Record<string, string | undefined> = {};
  for (const k of ENV_VARS) { saved[k] = process.env[k]; delete process.env[k]; }
  try {
    await assert.rejects(() => runEventPoll(), /missing env var/);
  } finally {
    for (const k of ENV_VARS) {
      if (saved[k] !== undefined) process.env[k] = saved[k]; else delete process.env[k];
    }
  }
});

test('runEventPoll: wrong RECIPIENT triggers assertPersonalRecipient', async () => {
  const env = fullEnv();
  env.RECIPIENT = 'attacker@example.com';
  const saved: Record<string, string | undefined> = {};
  for (const k of ENV_VARS) { saved[k] = process.env[k]; process.env[k] = env[k]; }
  try {
    await assert.rejects(() => runEventPoll(), /personal tool only/);
  } finally {
    for (const k of ENV_VARS) {
      if (saved[k] !== undefined) process.env[k] = saved[k]; else delete process.env[k];
    }
  }
});
