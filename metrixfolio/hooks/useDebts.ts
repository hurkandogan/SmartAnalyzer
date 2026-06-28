import useSWR from 'swr';
import { useAuth } from '@/context/AuthProvider';
import { getDebtsAction } from '@/actions/debts';
import { getExchangeRatesAction } from '@/actions/currency';
import { CurrencyConverter } from '@/utils/currency-math';
import { Debt } from '@/types/debt';

export function useDebts() {
  const { user } = useAuth();

  const { data, error, isLoading, mutate } = useSWR(
    user ? ['debts-data', user.uid] : null,
    async ([_, userId]) => {
      const [debts, rates] = await Promise.all([
        getDebtsAction(userId),
        getExchangeRatesAction(),
      ]);

      const converter = new CurrencyConverter(rates);
      const totalDebtUsd = debts.reduce(
        (sum, debt) => sum + converter.convert(debt.amount, debt.currency, 'USD'),
        0,
      );

      return { debts, totalDebtUsd };
    },
    {
      revalidateOnFocus: false,
      revalidateOnReconnect: false,
      dedupingInterval: 300000,
    },
  );

  return {
    debts: data?.debts || ([] as Debt[]),
    totalDebtUsd: data?.totalDebtUsd ?? 0,
    isLoading,
    isError: error,
    mutate,
  };
}
