import { test } from 'node:test';
import assert from 'node:assert/strict';

import { detectClusterBuys } from '../layers/insider.ts';
import type { Form4Transaction } from '../sources/edgar_form4.ts';
import { toTicker } from '../_watchlist.ts';

const NVDA = toTicker('NVDA');
const AAPL = toTicker('AAPL');

const tx = (over: Partial<Form4Transaction> & { ticker?: typeof NVDA }): Form4Transaction => ({
  ticker: over.ticker ?? NVDA,
  insiderName: 'Jane Doe',
  insiderTitle: 'CFO',
  transactionDate: new Date('2026-01-10'),
  transactionCode: 'P',
  shares: 1000,
  pricePerShare: 100,
  totalValue: 100_000,
  is10b51Plan: false,
  filingUrl: 'https://sec.gov/x',
  accessionNumber: '0000000000-00-000000',
  ...over,
});

// Cleaner fixture: only specify the date that's load-bearing for the test.
const txOn = (date: string, over: Partial<Form4Transaction> & { ticker?: typeof NVDA } = {}): Form4Transaction =>
  tx({ ...over, transactionDate: new Date(date) });

test('2 distinct insiders within 30 days, both P → cluster emitted', () => {
  const txs = [
    tx({ insiderName: 'A', shares: 1000, pricePerShare: 100, totalValue: 100_000, transactionDate: new Date('2026-01-01') }),
    tx({ insiderName: 'B', shares: 500, pricePerShare: 200, totalValue: 100_000, transactionDate: new Date('2026-01-20') }),
  ];
  const cs = detectClusterBuys(txs);
  assert.equal(cs.length, 1);
  assert.equal(cs[0]!.ticker, NVDA);
  assert.equal(cs[0]!.insiderCount, 2);
  assert.equal(cs[0]!.totalShares, 1500);
  assert.equal(cs[0]!.totalDollarValue, 200_000);
  assert.equal(cs[0]!.insiders.length, 2);
});

test('1 insider with 5 transactions → no cluster', () => {
  const txs = Array.from({ length: 5 }, (_, i) =>
    tx({ insiderName: 'Solo', transactionDate: new Date(`2026-01-${(i + 1).toString().padStart(2, '0')}`) }),
  );
  assert.equal(detectClusterBuys(txs).length, 0);
});

test('2 insiders 35 days apart → no cluster (outside window)', () => {
  const txs = [
    tx({ insiderName: 'A', transactionDate: new Date('2026-01-01') }),
    tx({ insiderName: 'B', transactionDate: new Date('2026-02-05') }),
  ];
  assert.equal(detectClusterBuys(txs).length, 0);
});

test("'A' grants and 'S' sales excluded; only 'P' counted", () => {
  const txs = [
    tx({ insiderName: 'A', transactionCode: 'A', transactionDate: new Date('2026-01-01') }),
    tx({ insiderName: 'B', transactionCode: 'S', transactionDate: new Date('2026-01-10') }),
    tx({ insiderName: 'C', transactionCode: 'P', transactionDate: new Date('2026-01-15') }),
  ];
  assert.equal(detectClusterBuys(txs).length, 0, 'only one P tx ⇒ no cluster');
});

test('10b5-1 plan transactions excluded from cluster detection', () => {
  const txs = [
    tx({ insiderName: 'A', is10b51Plan: true, transactionDate: new Date('2026-01-01') }),
    tx({ insiderName: 'B', is10b51Plan: false, transactionDate: new Date('2026-01-10') }),
  ];
  assert.equal(detectClusterBuys(txs).length, 0);
});

test('multiple tickers → each cluster reported independently', () => {
  const txs = [
    tx({ ticker: NVDA, insiderName: 'A', transactionDate: new Date('2026-01-01') }),
    tx({ ticker: NVDA, insiderName: 'B', transactionDate: new Date('2026-01-15') }),
    tx({ ticker: AAPL, insiderName: 'C', transactionDate: new Date('2026-01-05') }),
    tx({ ticker: AAPL, insiderName: 'D', transactionDate: new Date('2026-01-20') }),
  ];
  const cs = detectClusterBuys(txs);
  assert.equal(cs.length, 2);
  const tickers = cs.map((c) => c.ticker).sort();
  assert.deepEqual(tickers, [AAPL, NVDA].sort());
  for (const c of cs) assert.equal(c.insiderCount, 2);
});

test('shares=0 or price=0 excluded (not real open-market buys)', () => {
  const txs = [
    tx({ insiderName: 'A', shares: 0, transactionDate: new Date('2026-01-01') }),
    tx({ insiderName: 'B', pricePerShare: 0, totalValue: 0, transactionDate: new Date('2026-01-05') }),
    tx({ insiderName: 'C', transactionDate: new Date('2026-01-10') }),
  ];
  assert.equal(detectClusterBuys(txs).length, 0);
});

test('aggregates per-insider shares + value across multiple buys in window', () => {
  const txs = [
    tx({ insiderName: 'A', shares: 100, pricePerShare: 10, totalValue: 1000, transactionDate: new Date('2026-01-01') }),
    tx({ insiderName: 'A', shares: 200, pricePerShare: 10, totalValue: 2000, transactionDate: new Date('2026-01-08') }),
    tx({ insiderName: 'B', shares: 50, pricePerShare: 20, totalValue: 1000, transactionDate: new Date('2026-01-15') }),
  ];
  const [c] = detectClusterBuys(txs);
  assert.ok(c);
  assert.equal(c!.insiderCount, 2);
  const a = c!.insiders.find((i) => i.name === 'A')!;
  assert.equal(a.shares, 300);
  assert.equal(a.value, 3000);
});

test('window bounds: windowStart=earliest, windowEnd=latest tx', () => {
  const txs = [
    tx({ insiderName: 'A', transactionDate: new Date('2026-01-03') }),
    tx({ insiderName: 'B', transactionDate: new Date('2026-01-25') }),
  ];
  const [c] = detectClusterBuys(txs);
  assert.equal(c!.windowStart.toISOString().slice(0, 10), '2026-01-03');
  assert.equal(c!.windowEnd.toISOString().slice(0, 10), '2026-01-25');
});
