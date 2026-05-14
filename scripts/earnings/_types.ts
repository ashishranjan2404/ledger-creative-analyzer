declare const TickerBrand: unique symbol;
export type Ticker = string & { readonly [TickerBrand]: true };

export type RawItem = {
  source: string;
  ticker?: Ticker;
  title: string;
  url: string;
  snippet?: string;
  published: Date;
};

export type Finding = {
  ticker: Ticker;
  layer: 'schedule' | 'sentiment' | 'news_context';
  rank: number;
  title: string;
  url: string;
  summary: string;
  source: string;
};

export type EarningsEvent = {
  ticker: Ticker;
  companyName: string;
  reportDate: Date;
  reportTime: 'BMO' | 'AMC' | 'unknown';
  epsEstimate?: number;
  revenueEstimate?: number;
  source: string;
};
