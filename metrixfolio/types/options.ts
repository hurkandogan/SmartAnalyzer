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
}

