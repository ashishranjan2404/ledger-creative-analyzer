import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  renderDeepDiveCard,
  renderDeepDiveSubject,
  renderDeepDiveText,
  type DeepDiveCard,
} from '../render_deepdive.ts';
import type { FundamentalsTrajectory } from '../layers/fundamentals.ts';
import type { ValuationContext } from '../layers/valuation.ts';
import type { NarrativeShift } from '../layers/narrative.ts';
import type { OperationalSignal } from '../layers/operational.ts';
import type { SecularSignal } from '../layers/secular.ts';
import type { Ticker } from '../_types.ts';

const T = (s: string) => s as Ticker;
const ASOF = new Date('2026-05-10T12:00:00Z');

const fund = (over: Partial<FundamentalsTrajectory> = {}): FundamentalsTrajectory => ({
  ticker: T('NVDA'),
  asOf: ASOF,
  metrics: [
    { label: 'Revenue YoY', unit: 'pct', values: [208, 265, 205, 122, 94, 77, 52, 49] },
    { label: 'FCF margin', unit: 'pct', values: [45, 48, 47, 44, 41, 39, 37, 35] },
    { label: 'Net debt / EBITDA', unit: 'ratio', values: [-1.8, NaN, NaN, NaN, NaN, NaN, NaN, -2.1] },
  ],
  ...over,
});

const val = (over: Partial<ValuationContext> = {}): ValuationContext => ({
  ticker: T('NVDA'),
  asOf: ASOF,
  sectorSic: '3674',
  metrics: [
    { label: 'Fwd P/E', current: 31, median5yr: 42, sectorMedian: 28, unit: 'multiple' },
    { label: 'EV/EBITDA', current: 24.5, median5yr: 32, sectorMedian: 18, unit: 'multiple' },
    { label: 'FCF yield', current: 2.8, median5yr: 1.9, sectorMedian: 4.1, unit: 'pct' },
  ],
  ...over,
});

const card = (over: Partial<DeepDiveCard> = {}): DeepDiveCard => ({
  ticker: T('NVDA'),
  asOf: ASOF,
  fundamentals: fund(),
  valuation: val(),
  ...over,
});

test('card renders both required section headers and ticker', () => {
  const out = renderDeepDiveCard(card());
  assert.match(out, /🏢 NVDA/);
  assert.match(out, /▌FUNDAMENTALS \(8q sparklines\)/);
  assert.match(out, /▌VALUATION/);
});

test('NaN values render as n/a, never NaN', () => {
  const out = renderDeepDiveCard(
    card({
      fundamentals: fund({
        metrics: [
          { label: 'Revenue YoY', unit: 'pct', values: Array(8).fill(NaN) },
          { label: 'FCF margin', unit: 'pct', values: [NaN, NaN, NaN, NaN, NaN, NaN, NaN, 12] },
          { label: 'Net debt / EBITDA', unit: 'ratio', values: Array(8).fill(NaN) },
        ],
      }),
      valuation: val({
        metrics: [
          { label: 'Fwd P/E', current: NaN, median5yr: NaN, sectorMedian: NaN, unit: 'multiple' },
          { label: 'EV/EBITDA', current: NaN, median5yr: 32, sectorMedian: NaN, unit: 'multiple' },
          { label: 'FCF yield', current: NaN, median5yr: NaN, sectorMedian: 4.1, unit: 'pct' },
        ],
      }),
    }),
  );
  assert.doesNotMatch(out, /NaN/);
  assert.match(out, /n\/a/);
});

test('pct units render as integer percent, ratio with 1-dec x suffix', () => {
  const out = renderDeepDiveCard(card());
  assert.match(out, /\+208%/); // signed YoY
  assert.match(out, /45%/);    // FCF margin integer pct
  assert.match(out, /-2\.1x/); // ratio 1-dec with x
});

test('valuation pct vs multiple units format correctly', () => {
  const out = renderDeepDiveCard(card());
  assert.match(out, /Fwd P\/E: 31\.0x/);
  assert.match(out, /FCF yield: 2\.8%/);
  assert.match(out, /sector: 18\.0x/);
});

test('valuation header row labels current / 5yr med / sector', () => {
  const out = renderDeepDiveCard(card());
  // Aligned column header appears once on the val section.
  assert.match(out, /current.*5yr med.*sector/);
});

test('subject format matches spec', () => {
  assert.equal(
    renderDeepDiveSubject(new Date('2026-05-10T07:00:00Z'), 5),
    '📈 Thedi deep-dive · 2026-05-10 · 5 tickers',
  );
  // Singular when n === 1.
  assert.match(renderDeepDiveSubject(ASOF, 1), /· 1 ticker$/);
});

test('renderDeepDiveText: header + footer wrap multiple cards', () => {
  const out = renderDeepDiveText([card(), card({ ticker: T('AAPL') })], ASOF);
  assert.match(out, /^📈 Thedi Deep-Dive — 2026-05-10/);
  assert.match(out, /🏢 NVDA/);
  assert.match(out, /🏢 AAPL/);
  // Anchored footer: must be the literal trailing line. Use multiline anchor.
  assert.match(out, /Personal long-term tool\. Sources: SEC EDGAR XBRL\.$/m);
});

test('empty cards array returns sensible empty-state body', () => {
  const out = renderDeepDiveText([], ASOF);
  assert.match(out, /^📈 Thedi Deep-Dive — 2026-05-10/);
  assert.match(out, /No deep-dive cards available\./);
  assert.match(out, /Personal long-term tool\./);
  assert.doesNotMatch(out, /🏢/);
});

test('partial card: missing fundamentals → placeholder, valuation still renders', () => {
  const out = renderDeepDiveCard({ ticker: T('AMD'), valuation: val({ ticker: T('AMD') }) });
  assert.match(out, /🏢 AMD/);
  assert.match(out, /n\/a — no XBRL data/);
  assert.match(out, /Fwd P\/E: 31\.0x/);
});

test('partial card: missing valuation → placeholder, fundamentals still renders', () => {
  const out = renderDeepDiveCard({ ticker: T('AMD'), fundamentals: fund({ ticker: T('AMD') }) });
  assert.match(out, /🏢 AMD/);
  assert.match(out, /n\/a — no valuation data/);
  assert.match(out, /Revenue YoY/);
});

test('sparkline appears next to fundamentals label (Unicode block chars)', () => {
  const out = renderDeepDiveCard(card());
  assert.match(out, /[▁▂▃▄▅▆▇█]/);
});

// -------------------- L4/L6/L7 sections (new) --------------------

const narrative = (over: Partial<NarrativeShift> = {}): NarrativeShift => ({
  ticker: T('NVDA'),
  currentQuarter: { date: ASOF, accessionNumber: '0001045810-26-000004' },
  priorQuarter: { date: new Date('2026-02-10T12:00:00Z'), accessionNumber: '0001045810-26-000001' },
  shifts: [
    'Sovereign-AI framing introduced; positioned as new GTM motion vs prior call.',
    'Inference-workload mix called out as recurring revenue driver, replacing training-only narrative.',
    'Data-center growth softened from "exponential" to "durable".',
  ],
  asOf: ASOF,
  ...over,
});

const operational = (over: Partial<OperationalSignal> = {}): OperationalSignal => ({
  ticker: T('NVDA'),
  asOf: ASOF,
  openJobs: 1247,
  openJobsDelta90d: -8,
  githubStars: 4321,
  githubStarsDelta90d: 18,
  l5Comp: 658_000,
  l5CompDeltaYoY: 4,
  ...over,
});

const secular = (over: Partial<SecularSignal> = {}): SecularSignal => ({
  ticker: T('NVDA'),
  asOf: ASOF,
  arxivMentions90d: 312,
  arxivMentions90dPriorPeriod: 178,
  arxivTrend: 'accelerating',
  hnMentions90d: 12,
  hnMentions90dPriorPeriod: 18,
  hnTrend: 'decelerating',
  ...over,
});

test('L4 narrative section renders date-pair header + bullets when present', () => {
  const out = renderDeepDiveCard(card({ narrative: narrative() }));
  // Header shows prior → current ISO dates so the comparison frame is explicit.
  assert.match(out, /▌NARRATIVE SHIFT \(2026-02-10 → 2026-05-10\)/);
  assert.match(out, /Sovereign-AI framing/);
  assert.match(out, /•/, 'each shift prefixed with a bullet');
});

test('L6 operational section renders header + numeric rows when present', () => {
  const out = renderDeepDiveCard(card({ operational: operational() }));
  assert.match(out, /▌OPERATIONAL VELOCITY/);
  assert.match(out, /Open eng roles:\s+1,247 \(-8% vs 90d ago\)/);
  assert.match(out, /GitHub stars:\s+4,321 \(\+18% qoq\)/);
  assert.match(out, /L5 comp:\s+\$658k \(\+4% YoY\)/);
});

test('L7 secular section renders mention counts + trend arrows when present', () => {
  const out = renderDeepDiveCard(card({ secular: secular() }));
  assert.match(out, /▌SECULAR/);
  assert.match(out, /arxiv mentions\/90d:\s+312 \(was 178\)\s+↑ accelerating/);
  assert.match(out, /HN mentions\/90d:\s+12 \(was 18\)\s+↓ decelerating/);
});

test('all three L4/L6/L7 sections appear together in the right order', () => {
  const out = renderDeepDiveCard(card({
    narrative: narrative(), operational: operational(), secular: secular(),
  }));
  const iF = out.indexOf('▌FUNDAMENTALS');
  const iN = out.indexOf('▌NARRATIVE SHIFT');
  const iO = out.indexOf('▌OPERATIONAL VELOCITY');
  const iS = out.indexOf('▌SECULAR');
  const iV = out.indexOf('▌VALUATION');
  // Spec ordering: FUND → NARRATIVE → VAL → OPERATIONAL → SECULAR. Narrative
  // interprets fundamentals BEFORE the valuation snapshot lands.
  assert.ok(iF < iN && iN < iV && iV < iO && iO < iS,
    `unexpected section order: F=${iF} N=${iN} V=${iV} O=${iO} S=${iS}`);
});

test('L4 skipped entirely when narrative undefined (no header, no bullets)', () => {
  const out = renderDeepDiveCard(card({ operational: operational() }));
  assert.doesNotMatch(out, /NARRATIVE SHIFT/);
});

test('L6 skipped entirely when operational undefined', () => {
  const out = renderDeepDiveCard(card({ narrative: narrative() }));
  assert.doesNotMatch(out, /OPERATIONAL VELOCITY/);
});

test('L7 skipped entirely when secular undefined', () => {
  const out = renderDeepDiveCard(card({ narrative: narrative() }));
  assert.doesNotMatch(out, /▌SECULAR/);
});

test('L6 skipped when operational has only undefined fields (no useful data)', () => {
  const out = renderDeepDiveCard(card({
    operational: { ticker: T('NVDA'), asOf: ASOF }, // no metrics at all
  }));
  assert.doesNotMatch(out, /OPERATIONAL VELOCITY/);
});

test('L7 skipped when secular has no current-bucket data', () => {
  const out = renderDeepDiveCard(card({
    secular: { ticker: T('NVDA'), asOf: ASOF }, // no arxiv/HN at all
  }));
  assert.doesNotMatch(out, /▌SECULAR/);
});

test('L4 skipped when narrative has empty shifts array', () => {
  const empty: NarrativeShift = { ...narrative(), shifts: [] };
  const out = renderDeepDiveCard(card({ narrative: empty }));
  assert.doesNotMatch(out, /NARRATIVE SHIFT/);
});

test('L6 partial: only GitHub data renders just that row', () => {
  const out = renderDeepDiveCard(card({
    operational: { ticker: T('NVDA'), asOf: ASOF, githubStars: 100, githubStarsDelta90d: 5 },
  }));
  assert.match(out, /GitHub stars:\s+100/);
  assert.doesNotMatch(out, /Open eng roles/);
  assert.doesNotMatch(out, /L5 comp/);
});

test('L7 partial: only arxiv (no HN) renders just the arxiv row', () => {
  const out = renderDeepDiveCard(card({
    secular: { ticker: T('NVDA'), asOf: ASOF, arxivMentions90d: 50, arxivMentions90dPriorPeriod: 25, arxivTrend: 'accelerating' },
  }));
  assert.match(out, /arxiv mentions\/90d:\s+50/);
  assert.doesNotMatch(out, /HN mentions/);
});

test('L6/L7 numeric n/a guard: missing deltas render as n/a, never NaN', () => {
  // Deliberately omit delta/prior-period fields to exercise the undefined branch
  // without colliding with exactOptionalPropertyTypes.
  const out = renderDeepDiveCard(card({
    operational: { ticker: T('NVDA'), asOf: ASOF, githubStars: 7 },
    secular: { ticker: T('NVDA'), asOf: ASOF, arxivMentions90d: 10, arxivTrend: 'flat' },
  }));
  assert.doesNotMatch(out, /NaN/);
  assert.match(out, /n\/a/);
});
