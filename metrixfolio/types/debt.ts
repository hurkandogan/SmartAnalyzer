export interface Debt {
  id: string;
  name: string;
  amount: number;
  currency: 'USD' | 'EUR';
  created_at: number;
}
