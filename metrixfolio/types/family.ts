export interface FamilyMember {
  id: string;
  name: string;
  created_at: string;
}

export interface FamilyTransaction {
  id: string;
  symbol: string;
  amount: number;
  price: number;
  currency: string;
  original_price?: number;
  original_currency?: string;
  date: string;
  created_at: string;
}

// Helper interface for calculated views on the frontend
export interface FamilyAssetSummary {
  symbol: string;
  totalAmount: number;
  totalInvested: number;
  averageCost: number;
  currency: string;
  currentPrice: number;
  marketValue: number;
  unrealizedPnl: number;
}

export interface FamilyDeposit {
  id: string;
  amount: number;
  currency: string;
  date: string;
  note?: string;
  amount_usd: number;
  amount_eur: number;
  amount_try: number;
  rates_snapshot?: Record<string, number>;
  created_at: string;
}

