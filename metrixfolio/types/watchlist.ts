export interface WatchlistItem {
  symbol: string;
  name: string;
  exchange: string;
  category: string;
  industry: string;
  currency: string;
  added_at: string;
}

export interface WatchlistComment {
  id: string;
  text: string;
  author_id: string;
  author_name: string;
  created_at: string;
  updated_at?: string;
}

export interface StockAnalysis {
  date: string;
  symbol: string;
  last_price: number | null;
  close_price: number | null;
  open: number | null;
  high: number | null;
  low: number | null;
  volume: number | null;
  avg_volume: number | null;
  market_cap: number | null;
  beta: number | null;
  pe: number | null;
  forward_pe: number | null;
  eps: number | null;
  forward_eps: number | null;
  peg: number | null;
  ev_to_ebitda: number | null;
  ev_to_revenue: number | null;
  dividend_yield: number | null;
  payout_ratio: number | null;
  profit_margin: number | null;
  operating_margin: number | null;
  gross_margin: number | null;
  revenue_growth: number | null;
  earnings_growth: number | null;
  roe: number | null;
  roa: number | null;
  current_ratio: number | null;
  de_ratio: number | null;
  free_cashflow: number | null;
  short_ratio: number | null;
  week52_high: number | null;
  week52_low: number | null;
  rsi: number | null;
  iv: number | null;
}
