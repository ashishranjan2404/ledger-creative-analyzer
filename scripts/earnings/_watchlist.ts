import type { Ticker } from './_types';

const TICKER_RE = /^[A-Z0-9]{1,5}$/;

export const TICKERS: readonly Ticker[] = [
  'AAPL',
  'MSFT',
  'GOOGL',
  'AMZN',
  'NVDA',
  'META',
  'AMD',
  'TSLA',
] as unknown as readonly Ticker[];

const TICKER_SET: ReadonlySet<string> = new Set(TICKERS);

// WHY: split from toTicker so upstream parsers (Reddit/news scrapers) can brand any
// valid-format symbol without throwing on off-watchlist tickers; membership filtering
// is a separate downstream step via isTrackedTicker.
export function toTicker(s: string): Ticker {
  if (!TICKER_RE.test(s)) {
    throw new Error(`invalid ticker format: ${JSON.stringify(s)}`);
  }
  return s as Ticker;
}

export function isTrackedTicker(s: string): s is Ticker {
  return TICKER_RE.test(s) && TICKER_SET.has(s);
}
