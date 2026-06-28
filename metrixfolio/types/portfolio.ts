export interface ConsolidatedAsset {
  id: string;
  symbol: string;
  name: string;
  amount: number;
  value: number;
  source: string;
  native_currency: string;
}

export interface CategoryData {
  name: string;
  value: number;
  target_percentage: number;
  actual_percentage: number;
  assets: ConsolidatedAsset[];
}

export interface PortfolioResponse {
  total_value: number;
  reference_rates: { [key: string]: number };
  categories: { [key: string]: CategoryData };
}
