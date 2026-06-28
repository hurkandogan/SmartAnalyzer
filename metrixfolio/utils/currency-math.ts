import { ExchangeRate } from '@/actions/currency';

export class CurrencyConverter {
  private rates: ExchangeRate[];
  private baseCurrency: string = 'EUR'; // IBKR'ın temel para birimi genelde EUR sende

  constructor(rates: ExchangeRate[]) {
    this.rates = rates;
  }

  // Belirli bir paranın Base Currency (EUR) karşılığını bulur
  private getRateToBase(currency: string): number {
    if (currency === this.baseCurrency) return 1;

    // Örn: USD -> EUR oranını ara
    const direct = this.rates.find(
      (r) => r.from === currency && r.to === this.baseCurrency,
    );
    if (direct) return direct.rate;

    // Tersini ara (EUR -> USD varsa)
    const inverse = this.rates.find(
      (r) => r.from === this.baseCurrency && r.to === currency,
    );
    if (inverse) return 1 / inverse.rate;

    return 0; // Bulunamadı
  }

  convert(amount: number, from: string, target: string): number {
    if (amount === 0) return 0;
    if (from === target) return amount;

    // 1. Önce Base Currency'e (EUR) çevir
    const rateFrom = this.getRateToBase(from);

    // 2. Sonra Hedef Currency'e (USD) çevir
    const rateTarget = this.getRateToBase(target);

    if (rateFrom === 0 || rateTarget === 0) {
      console.warn(`Currency not found: ${from} -> ${target}`);
      return amount;
    }

    // Formül: (Amount * FromRate) / TargetRate
    return (amount * rateFrom) / rateTarget;
  }
}
