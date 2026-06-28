import useSWR from 'swr';
import { useMemo } from 'react';
import { useAuth } from '@/context/AuthProvider';
import { getCategoriesAction } from '@/actions/categories';
import { getAssetsAction } from '@/actions/positions';
import { getTransactionsAction } from '@/actions/transactions';
import { getPortfolioHistoryAction } from '@/actions/history';
import { useCurrencyConverter } from '@/hooks/useCurrencyConverter';
import { Category } from '@/types/settings';
import { Asset } from '@/types/positions';
import { Transaction } from '@/types/transaction';
import { PortfolioHistory } from '@/types/history';

export interface PortfolioSummary {
  total_value: number;
  total_cost: number;
  total_pnl: number;
  pnl_percentage: number;
  unrealized_pnl: number;
  base_currency: string;
  categories: {
    id: string;
    name: string;
    value: number;
    actual_percentage: number;
    target_percentage: number;
    color?: string;
  }[];
}

export function usePortfolio() {
  const { user } = useAuth();
  const { convert } = useCurrencyConverter();

  const {
    data: rawData,
    error,
    isLoading,
    mutate,
  } = useSWR(
    user ? ['portfolio-data', user.uid] : null,
    async ([_, userId]) => {
      const [categories, assets, transactions, history] = await Promise.all([
        getCategoriesAction(userId),
        getAssetsAction(userId),
        getTransactionsAction(userId),
        getPortfolioHistoryAction(userId),
      ]);

      return { categories, assets, transactions, history };
    },
    {
      revalidateOnFocus: true,
      revalidateOnReconnect: true,
      refreshInterval: 0,
      dedupingInterval: 60000,
      keepPreviousData: true,
    },
  );

  const summary = useMemo<PortfolioSummary | undefined>(() => {
    if (!rawData) return undefined;
    const { categories, assets, transactions } = rawData;

    let totalValue = 0;
    let totalUnrealizedPnl = 0;
    const categoryValues = new Map<string, number>();

    assets.forEach((asset) => {
      const assetCurrency = asset.currency || 'USD';
      const marketValueUsd = convert(asset.market_value || 0, assetCurrency);
      const unrealizedPnlUsd = convert(
        asset.unrealized_pnl || 0,
        assetCurrency,
      );

      totalValue += marketValueUsd;
      totalUnrealizedPnl += unrealizedPnlUsd;

      const catId = asset.category_id || 'uncategorized';
      categoryValues.set(
        catId,
        (categoryValues.get(catId) || 0) + marketValueUsd,
      );
    });

    let totalInvested = 0;
    transactions.forEach((t) => {
      const amount = Number(t.amount) || 0;
      const valInUsd = convert(amount, t.currency || 'USD');

      if (t.type === 'DEPOSIT') {
        totalInvested += valInUsd;
      } else if (t.type === 'WITHDRAWAL') {
        totalInvested -= valInUsd;
      }
    });

    const totalPnl = totalValue - totalInvested;
    const pnlPercentage =
      totalInvested !== 0 ? (totalPnl / totalInvested) * 100 : 0;

    const categoryAnalysis = categories.map((cat) => {
      const val = categoryValues.get(cat.id) || 0;
      const actualPct = totalValue !== 0 ? (val / totalValue) * 100 : 0;
      return {
        id: cat.id,
        name: cat.name,
        value: val,
        actual_percentage: actualPct,
        target_percentage: cat.target_percentage,
        color: cat.color,
      };
    });

    return {
      total_value: totalValue,
      total_cost: totalInvested,
      total_pnl: totalPnl,
      pnl_percentage: pnlPercentage,
      unrealized_pnl: totalUnrealizedPnl,
      base_currency: 'USD',
      categories: categoryAnalysis,
    };
  }, [rawData, convert]);

  return {
    portfolio: summary,
    assets: rawData?.assets || ([] as Asset[]),
    categories: rawData?.categories || ([] as Category[]),
    transactions: rawData?.transactions || ([] as Transaction[]),
    history: rawData?.history || ([] as PortfolioHistory[]),
    isLoading,
    isError: error,
    mutate,
  };
}
