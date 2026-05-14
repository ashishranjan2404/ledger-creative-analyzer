import type { EarningsEvent, RawItem } from './_types.ts';
import type { FrothFlag } from './froth.ts';

export type TacticalDigest = {
  date: Date;
  schedule: readonly EarningsEvent[];
  news: readonly RawItem[];
  froth: readonly FrothFlag[];
};

const ymd = (d: Date): string => d.toISOString().slice(0, 10);

function whenLabel(ev: EarningsEvent, today: Date): string {
  const t = ymd(today);
  const d = ymd(ev.reportDate);
  const day = d === t ? 'today' : 'tmrw';
  return ev.reportTime === 'unknown' ? day : `${day} ${ev.reportTime}`;
}

function fmtMoney(n: number | undefined, suffix = ''): string {
  return n == null ? 'n/a' : `$${n}${suffix}`;
}

// WHY: builder pattern — each section returns lines OR null when empty; outer
// filter drops nulls before joining. Avoids the "did I forget the header?"
// foot-gun of inline conditionals and keeps section logic local.
type Section = readonly string[] | null;

function scheduleSection(events: readonly EarningsEvent[], today: Date): Section {
  if (events.length === 0) return null;
  const rows = events.map((ev) => {
    const eps = fmtMoney(ev.epsEstimate);
    const rev =
      ev.revenueEstimate == null
        ? 'n/a'
        : `$${(ev.revenueEstimate / 1e9).toFixed(1)}B`;
    return `  ${ev.ticker} · ${whenLabel(ev, today)} · EPS est ${eps} · Rev est ${rev} [${ev.source}]`;
  });
  return [`📅 SCHEDULE — today + tomorrow (${events.length})`, ...rows];
}

function newsSection(items: readonly RawItem[], now: Date): Section {
  if (items.length === 0) return null;
  const rows = items.map((it) => {
    const hours = Math.max(0, Math.round((now.getTime() - it.published.getTime()) / 3.6e6));
    return `  • [${it.source}]: "${it.title}" ${hours}h`;
  });
  return [`📰 NEWS — last 24h, watchlist`, ...rows];
}

function frothSection(flags: readonly FrothFlag[]): Section {
  if (flags.length === 0) return null;
  const rows = flags.map((f) => `  ${f.reason}`);
  return [`⚠️ FROTH CHECK (suppressed unless anomalous)`, ...rows];
}

export function renderTacticalText(d: TacticalDigest): string {
  const sections: Section[] = [
    scheduleSection(d.schedule, d.date),
    newsSection(d.news, d.date),
    frothSection(d.froth),
  ];
  const present = sections.filter((s): s is readonly string[] => s !== null);
  if (present.length === 0) return `No watchlist activity for ${ymd(d.date)}.`;
  return present.map((lines) => lines.join('\n')).join('\n\n');
}

export function renderTacticalSubject(d: TacticalDigest): string {
  return `📊 Thedi tactical · ${ymd(d.date)}`;
}
