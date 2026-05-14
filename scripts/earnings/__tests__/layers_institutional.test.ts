import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  NOTABLE_FUNDS,
  buildInstitutionalSignals,
  shouldAlertInstitutional,
  type InstitutionalSignal,
} from '../layers/institutional.ts';
import type { FundActivism, FundPositionChange } from '../sources/edgar_13f.ts';
import type { Ticker } from '../_types.ts';
import { toTicker } from '../_watchlist.ts';

const AAPL = toTicker('AAPL');
const NVDA = toTicker('NVDA');
const BERK = '0001067983';
const PERSHING = '0001336528';
const SCION = '0001649339';
const RANDO = '0009999999'; // not in NOTABLE_FUNDS
const day = 86_400_000;

const change = (over: Partial<FundPositionChange> & {
  fundCik: string; ticker: Ticker; changeType: FundPositionChange['changeType'];
  shareDelta: number;
}): FundPositionChange => ({
  fundName: NOTABLE_FUNDS.get(over.fundCik) ?? `cik-${over.fundCik}`,
  pctChange: 0,
  ...over,
});

const activism = (over: Partial<FundActivism> & {
  ticker: Ticker; formType: FundActivism['formType'];
}): FundActivism => ({
  filerName: 'ICAHN ASSOCIATES',
  filerCik: '',
  percentOwnership: 5.4,
  filingDate: new Date(Date.now() - 1 * day),
  accessionNumber: '0001193125-26-000111',
  filingUrl: 'https://x/index.htm',
  ...over,
});

test('NOTABLE_FUNDS — covers original spec + Loops 32-33 additions', () => {
  // Loop 32: +Tiger/Lone Pine (8→10). Loop 33: +Capital Research/T Rowe (10→12).
  assert.equal(NOTABLE_FUNDS.size, 12);
  const names = [...NOTABLE_FUNDS.values()];
  for (const expected of ['Berkshire Hathaway', 'Pershing Square', 'Scion Asset Management',
    'Coatue Management', 'Greenlight Capital', 'Baupost Group', 'Third Point', 'ValueAct Capital',
    'Tiger Global Management', 'Lone Pine Capital',
    'Capital Research Global Investors', 'T. Rowe Price Associates']) {
    assert.ok(names.includes(expected), `missing notable fund: ${expected}`);
  }
});

test('buildInstitutionalSignals — empty inputs return empty array', () => {
  assert.deepEqual(buildInstitutionalSignals([], []), []);
});

test('buildInstitutionalSignals — filters out non-notable funds', () => {
  const sigs = buildInstitutionalSignals(
    [change({ fundCik: RANDO, ticker: AAPL, changeType: 'increased', shareDelta: 50_000 })],
    [],
  );
  assert.deepEqual(sigs, []);
});

test('buildInstitutionalSignals — groups changes + activists per ticker', () => {
  const sigs = buildInstitutionalSignals(
    [
      change({ fundCik: BERK, ticker: AAPL, changeType: 'increased', shareDelta: 10_000 }),
      change({ fundCik: PERSHING, ticker: NVDA, changeType: 'new', shareDelta: 200_000 }),
    ],
    [activism({ ticker: AAPL, formType: '13D' })],
  );
  assert.equal(sigs.length, 2);
  // Sorted alphabetically.
  assert.equal(sigs[0]!.ticker, AAPL);
  assert.equal(sigs[0]!.changes.length, 1);
  assert.equal(sigs[0]!.activists.length, 1);
  assert.equal(sigs[1]!.ticker, NVDA);
  assert.equal(sigs[1]!.activists.length, 0);
});

test('shouldAlertInstitutional — 13D activist triggers alert', () => {
  const signal: InstitutionalSignal = {
    ticker: AAPL,
    changes: [],
    activists: [activism({ ticker: AAPL, formType: '13D', filerName: 'ICAHN', percentOwnership: 5.4 })],
  };
  const reason = shouldAlertInstitutional(signal);
  assert.match(reason ?? '', /13D activist/);
  assert.match(reason ?? '', /ICAHN/);
});

test('shouldAlertInstitutional — 13G alone does NOT trigger', () => {
  const signal: InstitutionalSignal = {
    ticker: AAPL,
    changes: [],
    activists: [activism({ ticker: AAPL, formType: '13G' })],
  };
  assert.equal(shouldAlertInstitutional(signal), null);
});

test('shouldAlertInstitutional — 2+ notable funds increasing same ticker triggers consensus alert', () => {
  const signal: InstitutionalSignal = {
    ticker: AAPL,
    changes: [
      change({ fundCik: BERK, ticker: AAPL, changeType: 'increased', shareDelta: 10_000 }),
      change({ fundCik: PERSHING, ticker: AAPL, changeType: 'increased', shareDelta: 5_000 }),
    ],
    activists: [],
  };
  const reason = shouldAlertInstitutional(signal);
  assert.match(reason ?? '', /2 notable funds accumulating/);
  assert.match(reason ?? '', /Berkshire/);
  assert.match(reason ?? '', /Pershing/);
});

test('shouldAlertInstitutional — single fund increasing alone does NOT trigger consensus', () => {
  const signal: InstitutionalSignal = {
    ticker: AAPL,
    changes: [change({ fundCik: BERK, ticker: AAPL, changeType: 'increased', shareDelta: 10_000 })],
    activists: [],
  };
  assert.equal(shouldAlertInstitutional(signal), null);
});

test('shouldAlertInstitutional — single notable exit does NOT trigger', () => {
  const signal: InstitutionalSignal = {
    ticker: AAPL,
    changes: [change({ fundCik: BERK, ticker: AAPL, changeType: 'exit', shareDelta: -50_000 })],
    activists: [],
  };
  assert.equal(shouldAlertInstitutional(signal), null);
});

test('shouldAlertInstitutional — new position >100k shares from notable fund triggers', () => {
  const signal: InstitutionalSignal = {
    ticker: NVDA,
    changes: [change({ fundCik: SCION, ticker: NVDA, changeType: 'new', shareDelta: 250_000 })],
    activists: [],
  };
  const reason = shouldAlertInstitutional(signal);
  assert.match(reason ?? '', /new 250,000-share position/);
  assert.match(reason ?? '', /Scion/);
});

test('shouldAlertInstitutional — new position below 100k threshold does NOT trigger', () => {
  const signal: InstitutionalSignal = {
    ticker: NVDA,
    changes: [change({ fundCik: SCION, ticker: NVDA, changeType: 'new', shareDelta: 50_000 })],
    activists: [],
  };
  assert.equal(shouldAlertInstitutional(signal), null);
});

test('shouldAlertInstitutional — new position EXACTLY 100k does NOT trigger (strict >)', () => {
  // Spec says ">100k", so 100,000 is the boundary that must NOT alert.
  const signal: InstitutionalSignal = {
    ticker: NVDA,
    changes: [change({ fundCik: SCION, ticker: NVDA, changeType: 'new', shareDelta: 100_000 })],
    activists: [],
  };
  assert.equal(shouldAlertInstitutional(signal), null);
});

test('shouldAlertInstitutional — 13D wins priority over consensus + new-large', () => {
  const signal: InstitutionalSignal = {
    ticker: AAPL,
    changes: [
      change({ fundCik: BERK, ticker: AAPL, changeType: 'increased', shareDelta: 10_000 }),
      change({ fundCik: PERSHING, ticker: AAPL, changeType: 'new', shareDelta: 500_000 }),
    ],
    activists: [activism({ ticker: AAPL, formType: '13D', filerName: 'ICAHN' })],
  };
  const reason = shouldAlertInstitutional(signal);
  assert.match(reason ?? '', /13D/);
});

test('shouldAlertInstitutional — same-fund duplicate increases do NOT inflate consensus count', () => {
  // E.g. an amended 13F from Berkshire showing up twice for the same ticker.
  const signal: InstitutionalSignal = {
    ticker: AAPL,
    changes: [
      change({ fundCik: BERK, ticker: AAPL, changeType: 'increased', shareDelta: 10_000 }),
      change({ fundCik: BERK, ticker: AAPL, changeType: 'increased', shareDelta: 5_000 }),
    ],
    activists: [],
  };
  assert.equal(shouldAlertInstitutional(signal), null);
});
