export interface HistoryAllocation {
  category_id: string;
  name: string;
  percentage: number;
  type: string;
  value: number;
}

export interface PortfolioHistory {
  id: string;
  date: string;
  timestamp: number;
  total_market_value: number;
  total_cost_basis: number;
  total_unrealized_pnl: number;
  asset_count: number;
  daily_transaction_count: number;
  allocation: HistoryAllocation[];
}