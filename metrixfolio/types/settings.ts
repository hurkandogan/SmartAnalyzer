export enum CollectionType {
  USERS = 'users',
  SETTINGS = 'settings',
  CONFIG = 'configuration',
  ASSETS = 'assets',
  MAIN = 'main',
}

export type CategoryType = 'ASSET' | 'CASH' | 'CRYPTO' | 'LIABILITY';

export interface UserSettings {
  categories: Category[];
}

export interface Category {
  id: string;
  name: string;
  target_percentage: number;
  type: CategoryType;
  color: string;
}

// Rust backend bu yapıyı bekliyor:
export interface PortfolioConfig {
  base_currency: string;
  categories: Category[];
}
