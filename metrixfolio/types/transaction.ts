export type TransactionType = 'DEPOSIT' | 'WITHDRAWAL';

export interface Transaction {
  id: string;
  type: TransactionType;
  amount: number;
  currency: string;
  date: string; // ISO String (YYYY-MM-DD)
  note?: string;
  created_at?: number;
}
