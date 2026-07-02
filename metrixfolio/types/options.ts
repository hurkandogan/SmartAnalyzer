export type OptionType = 'BUY_PUT' | 'BUY_CALL' | 'SELL_PUT' | 'SELL_CALL';

export interface OptionPosition {
  id: string;
  symbol: string;
  type: OptionType;
  quantity: number;

  buy_date: string | null;
  sell_date: string | null;
  buy_price: number | null;
  sell_price: number | null;
  target: string;
  note: string;
  created_at: number;

  // New fields
  strike_price?: number | null;
  expiry_date?: string | null;
  delta?: number | null;
  theta?: number | null;
  vega?: number | null;
  iv?: number | null;
  current_price?: number | null;
}

