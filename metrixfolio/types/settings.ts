export enum CollectionType {
  USERS = 'users',
  SETTINGS = 'settings',
  CONFIG = 'configuration',
  ASSETS = 'assets',
  MAIN = 'main',
}

export type CategoryType = 'ASSET' | 'CASH' | 'CRYPTO' | 'LIABILITY' | 'OPTIONS';

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

export const FIXED_CATEGORIES: Category[] = [
  { id: 'defensive', name: 'Defensive', target_percentage: 40, type: 'ASSET', color: '#3b82f6' }, // Blue
  { id: 'growth', name: 'Growth', target_percentage: 40, type: 'ASSET', color: '#10b981' }, // Emerald
  { id: 'cash', name: 'Cash', target_percentage: 20, type: 'CASH', color: '#f59e0b' }, // Amber
  { id: 'crypto', name: 'Crypto', target_percentage: 0, type: 'CRYPTO', color: '#8b5cf6' }, // Violet
  { id: 'others', name: 'Others', target_percentage: 0, type: 'ASSET', color: '#6b7280' }, // Gray
  { id: 'options_sell', name: 'Options Sell', target_percentage: 0, type: 'OPTIONS', color: '#ef4444' }, // Red
  { id: 'options_buy', name: 'Options Buy', target_percentage: 0, type: 'OPTIONS', color: '#84cc16' }, // Lime
];
