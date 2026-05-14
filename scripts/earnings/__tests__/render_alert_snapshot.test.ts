// Loop 45: deterministic snapshot tests for renderAlertSubject + renderAlertBody
// across all three alert kinds (form4_cluster, institutional, congressional).
// Each snapshot is a 2-line file: `subject\n---\nbody`. Frozen fixtures only.
//
// To regenerate after intentional renderer changes:
//   UPDATE_SNAPSHOTS=1 node --test --experimental-strip-types __tests__/render_alert_snapshot.test.ts
import { test } from 'node:test';
import { renderAlertSubject, renderAlertBody, type Alert } from '../render_alert.ts';
import type { Ticker } from '../_types.ts';
import type { ClusterBuy } from '../layers/insider.ts';
import type { InstitutionalSignal } from '../layers/institutional.ts';
import type { CongressionalTrade } from '../sources/congress_disclosure.ts';
import type { FundActivism } from '../sources/edgar_13f.ts';
import { assertSnapshot } from './_snapshot_helper.ts';

const T = (s: string) => s as Ticker;

const renderBoth = (a: Alert): string =>
  `${renderAlertSubject(a)}\n---\n${renderAlertBody(a)}`;

// --- form4_cluster ---
const cluster: ClusterBuy = {
  ticker: T('NVDA'),
  insiderCount: 3,
  totalShares: 50_000,
  totalDollarValue: 4_200_000,
  windowStart: new Date('2026-04-15T00:00:00Z'),
  windowEnd:   new Date('2026-05-02T00:00:00Z'),
  insiders: [
    { name: 'Jensen Huang',    title: 'CEO',      shares: 30_000, value: 2_500_000 },
    { name: 'Colette Kress',   title: 'CFO',      shares: 15_000, value: 1_200_000 },
    { name: 'Mark Stevens',    title: 'Director', shares:  5_000, value:   500_000 },
  ],
};
const clusterAlert: Alert = {
  kind: 'form4_cluster', ticker: T('NVDA'),
  sourceId: '0001234567-26-000001', data: cluster,
};

// --- institutional (13D activist) ---
const activist: FundActivism = {
  filerName: 'Elliott Management', filerCik: '0001234567',
  ticker: T('NVDA'), formType: '13D', percentOwnership: 5.4,
  filingDate: new Date('2026-05-01T00:00:00Z'),
  accessionNumber: '0001234567-26-000001',
  filingUrl: 'https://www.sec.gov/Archives/edgar/data/1045810/000123456726000001-index.htm',
};
const instSignal: InstitutionalSignal = {
  ticker: T('NVDA'),
  changes: [
    { fundCik: '0001067983', fundName: 'Berkshire Hathaway', ticker: T('NVDA'),
      changeType: 'increased', shareDelta: 250_000, pctChange: 15 },
    { fundCik: '0001336528', fundName: 'Pershing Square', ticker: T('NVDA'),
      changeType: 'new', shareDelta: 180_000, pctChange: Infinity },
  ],
  activists: [activist],
};
const instAlert: Alert = {
  kind: 'institutional', ticker: T('NVDA'),
  sourceId: 'https://www.sec.gov/x-13d',
  data: instSignal,
  reason: '13D activist position by Elliott Management',
};

// --- congressional ---
const trades: CongressionalTrade[] = [
  { ticker: T('NVDA'), representative: 'Pelosi, Nancy', party: 'D', chamber: 'House',
    transactionDate: new Date('2026-05-10T00:00:00Z'),
    reportedDate:    new Date('2026-05-12T00:00:00Z'),
    transaction: 'Purchase', amount: '$1,000,001 - $5,000,000' },
  { ticker: T('NVDA'), representative: 'Tuberville, Tommy', party: 'R', chamber: 'Senate',
    transactionDate: new Date('2026-05-08T00:00:00Z'),
    reportedDate:    new Date('2026-05-11T00:00:00Z'),
    transaction: 'Purchase', amount: '$15,001 - $50,000' },
];
const congAlert: Alert = {
  kind: 'congressional', ticker: T('NVDA'),
  sourceId: 'cong-2026-05-12', data: { trades },
};

test('render_alert snapshot · form4_cluster', () => {
  assertSnapshot(renderBoth(clusterAlert), 'render_alert_form4_cluster');
});

test('render_alert snapshot · institutional (13D activist)', () => {
  assertSnapshot(renderBoth(instAlert), 'render_alert_institutional');
});

test('render_alert snapshot · congressional', () => {
  assertSnapshot(renderBoth(congAlert), 'render_alert_congressional');
});
