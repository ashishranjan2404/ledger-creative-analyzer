// Loop 44: deterministic snapshot test for renderDeepDiveText with EVERY
// section populated (fundamentals, valuation, narrative, operational, secular
// incl. patents, govCapital with all three sub-feeds).
//
// Fixture is fully frozen. On intentional renderer change, refresh via:
//   UPDATE_SNAPSHOTS=1 node --test --experimental-strip-types __tests__/render_deepdive_snapshot.test.ts
import { test } from 'node:test';
import { renderDeepDiveText, type DeepDiveCard } from '../render_deepdive.ts';
import type { FundamentalsTrajectory } from '../layers/fundamentals.ts';
import type { ValuationContext } from '../layers/valuation.ts';
import type { NarrativeShift } from '../layers/narrative.ts';
import type { OperationalSignal } from '../layers/operational.ts';
import type { SecularSignal } from '../layers/secular.ts';
import type { CongressionalTrade } from '../sources/congress_disclosure.ts';
import type { LobbyingRecord } from '../sources/lobbying.ts';
import type { GovContract } from '../sources/gov_contracts.ts';
import type { Ticker } from '../_types.ts';
import { assertSnapshot } from './_snapshot_helper.ts';

const T = (s: string) => s as Ticker;
const ASOF = new Date('2026-05-14T12:00:00Z');

const fundamentals: FundamentalsTrajectory = {
  ticker: T('NVDA'),
  asOf: ASOF,
  metrics: [
    { label: 'Revenue YoY', unit: 'pct', values: [208, 265, 205, 122, 94, 77, 52, 49] },
    { label: 'FCF margin', unit: 'pct', values: [45, 48, 47, 44, 41, 39, 37, 35] },
    { label: 'Net debt/EBITDA', unit: 'ratio', values: [-1.8, -1.9, -2.0, -2.0, -2.1, -2.1, -2.1, -2.1] },
  ],
};

const valuation: ValuationContext = {
  ticker: T('NVDA'),
  asOf: ASOF,
  sectorSic: '3674',
  metrics: [
    { label: 'Fwd P/E', current: 31, median5yr: 42, sectorMedian: 28, unit: 'multiple' },
    { label: 'EV/EBITDA', current: 24.5, median5yr: 32, sectorMedian: 18, unit: 'multiple' },
    { label: 'FCF yield', current: 2.8, median5yr: 1.9, sectorMedian: 4.1, unit: 'pct' },
  ],
};

const narrative: NarrativeShift = {
  ticker: T('NVDA'),
  currentQuarter: { date: new Date('2026-04-30T00:00:00Z'), accessionNumber: '0001045810-26-000123' },
  priorQuarter:   { date: new Date('2026-01-31T00:00:00Z'), accessionNumber: '0001045810-26-000045' },
  shifts: [
    'Strategic emphasis pivots from data-center buildout to sovereign-AI customer wins.',
    'Tone shifts from cautious about export controls to confident on diversified geography.',
    'New lexicon: "agentic workloads", "physical AI"; "crypto demand" dropped entirely.',
  ],
  asOf: ASOF,
};

const operational: OperationalSignal = {
  ticker: T('NVDA'),
  asOf: ASOF,
  openJobs: 1820,
  openJobsDelta90d: 12,
  githubStars: 4620,
  githubStarsDelta90d: 8,
  githubContributors: 217,
  l5Comp: 412_000,
  l5CompDeltaYoY: 9,
};

const secular: SecularSignal = {
  ticker: T('NVDA'),
  asOf: ASOF,
  arxivMentions90d: 184, arxivMentions90dPriorPeriod: 121, arxivTrend: 'accelerating',
  hnMentions90d: 92,     hnMentions90dPriorPeriod: 104,    hnTrend: 'decelerating',
  patents: {
    count: 47,
    recentTitles: [
      'Tensor core scheduling for sparse mixture-of-experts inference',
      'Cache hierarchy for transformer KV-stores',
    ],
  },
};

const congTrades: CongressionalTrade[] = [
  {
    ticker: T('NVDA'), representative: 'Pelosi, Nancy', party: 'D', chamber: 'House',
    transactionDate: new Date('2026-05-10T00:00:00Z'),
    reportedDate: new Date('2026-05-12T00:00:00Z'),
    transaction: 'Purchase', amount: '$1,000,001 - $5,000,000',
  },
  {
    ticker: T('NVDA'), representative: 'Tuberville, Tommy', party: 'R', chamber: 'Senate',
    transactionDate: new Date('2026-05-05T00:00:00Z'),
    reportedDate: new Date('2026-05-08T00:00:00Z'),
    transaction: 'Sale', amount: '$50,001 - $100,000',
  },
];

const lobbying: LobbyingRecord[] = [
  { ticker: T('NVDA'), year: 2026, quarter: 1, amount: 1_200_000, client: 'NVIDIA Corporation', issue: 'AI export policy' },
  { ticker: T('NVDA'), year: 2026, quarter: 1, amount:   800_000, client: 'NVIDIA Corporation', issue: 'Semiconductor tariffs' },
  { ticker: T('NVDA'), year: 2025, quarter: 4, amount:   500_000, client: 'NVIDIA Corporation', issue: 'AI export policy' },
];

const contracts: GovContract[] = [
  { ticker: T('NVDA'), date: new Date('2026-05-12T00:00:00Z'), amount: 24_000_000, agency: 'DOE',     description: 'GPU cluster for national lab' },
  { ticker: T('NVDA'), date: new Date('2026-04-22T00:00:00Z'), amount:  3_500_000, agency: 'NASA',    description: 'Edge inference hardware' },
  { ticker: T('NVDA'), date: new Date('2026-03-15T00:00:00Z'), amount:    750_000, agency: 'NIH',     description: 'Genomics compute' },
];

const card: DeepDiveCard = {
  ticker: T('NVDA'),
  asOf: ASOF,
  fundamentals,
  valuation,
  narrative,
  operational,
  secular,
  govCapital: { congressional: congTrades, lobbying, contracts },
};

test('render_deepdive snapshot (full card, all sections)', () => {
  assertSnapshot(renderDeepDiveText([card], ASOF), 'render_deepdive_full');
});
