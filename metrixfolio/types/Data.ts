export interface AssetData {
  asset: string;
  amount: number;
  eur_value: number;
  usd_value: number;
}

export interface PortfolioData {
  total_eur_value: number;
  total_usd_value: number;
  assets: AssetData[];
}
