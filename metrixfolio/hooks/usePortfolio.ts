import useSWR from 'swr';
import { useMemo } from 'react';
import { useAuth } from '@/context/AuthProvider';
import { getCategoriesAction } from '@/actions/categories';
import { getAssetsAction, getPortfolioSummaryAction } from '@/actions/positions';
import { getTransactionsAction } from '@/actions/transactions';
import { getPortfolioHistoryAction } from '@/actions/history';
import { Category } from '@/types/settings';
import { Asset, MultiCurrencyValue } from '@/types/positions';
import { Transaction } from '@/types/transaction';
import { PortfolioHistory } from '@/types/history';

export interface PortfolioSummary {
  total_value: number;
  total_cost: number;
  total_pnl: number;
  pnl_percentage: number;
  unrealized_pnl: number;
  base_currency: string;
  totals?: {
    total_value: MultiCurrencyValue;
    total_cost: MultiCurrencyValue;
    total_pnl: MultiCurrencyValue;
    unrealized_pnl: MultiCurrencyValue;
    cash_balance?: MultiCurrencyValue;
  };
  categories: {
    id: string;
    name: string;
    value: number;
    values?: MultiCurrencyValue;
    actual_percentage: number;
    target_percentage: number;
    color?: string;
    type?: string;
  }[];
  asset_allocation?: {
    symbol: string;
    name: string;
    type: string;
    value: number;
    values?: MultiCurrencyValue;
    percent: number;
  }[];
}

export function usePortfolio() {
  const { user } = useAuth();

  const {
    data: rawData,
    error,
    isLoading,
    mutate,
  } = useSWR(
    user ? ['portfolio-data', user.uid] : null,
    async ([_, userId]) => {
      const [backendSummary, categories, assets, transactions, history] = await Promise.all([
        getPortfolioSummaryAction(userId),
        getCategoriesAction(userId),
        getAssetsAction(userId),
        getTransactionsAction(userId),
        getPortfolioHistoryAction(userId),
      ]);

      return { backendSummary, categories, assets, transactions, history };
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
    const { backendSummary, categories, assets } = rawData;

    // If backend pre-calculated summary exists, use its pre-computed 3-currency totals and allocation,
    // while keeping category assignments/targets live if user just edited a category in UI.
    const rates = backendSummary?.rates || { USD: 1, EUR: 1.08, TRY: 0.0292 };
    const to3Ccy = (usdVal: number): MultiCurrencyValue => ({
      USD: Number(usdVal.toFixed(2)),
      EUR: Number((rates.EUR > 0 ? usdVal / rates.EUR : usdVal * 0.92).toFixed(2)),
      TRY: Number((rates.TRY > 0 ? usdVal / rates.TRY : usdVal * 34.2).toFixed(2)),
    });

    let totalValueUsd = 0;
    let totalUnrealizedPnlUsd = 0;
    const categoryValuesUsd = new Map<string, number>();

    assets.forEach((asset) => {
      const mvUsd = asset.metrics?.market_value?.USD ?? (asset.market_value || 0);
      const pnlUsd = asset.metrics?.unrealized_pnl?.USD ?? (asset.unrealized_pnl || 0);

      totalValueUsd += mvUsd;
      totalUnrealizedPnlUsd += pnlUsd;

      const catId = asset.category_id || 'uncategorized';
      categoryValuesUsd.set(catId, (categoryValuesUsd.get(catId) || 0) + mvUsd);
    });

    const totalInvestedUsd = backendSummary?.total_cost ?? 0;
    const totalPnlUsd = totalValueUsd - totalInvestedUsd;
    const pnlPercentage =
      totalInvestedUsd !== 0 ? (totalPnlUsd / totalInvestedUsd) * 100 : 0;

    let totalPositiveValue = 0;
    for (const val of categoryValuesUsd.values()) {
      if (val > 0) totalPositiveValue += val;
    }

    const categoryAnalysis = categories.map((cat) => {
      const val = categoryValuesUsd.get(cat.id) || 0;
      let actualPct = 0;
      if (val > 0 && totalPositiveValue > 0) {
        actualPct = (val / totalPositiveValue) * 100;
      } else if (val < 0 && totalValueUsd > 0) {
        actualPct = (val / totalValueUsd) * 100;
      }
      return {
        id: cat.id,
        name: cat.name,
        value: val,
        values: to3Ccy(val),
        actual_percentage: actualPct,
        target_percentage: cat.target_percentage,
        color: cat.color,
        type: cat.type,
      };
    });

    return {
      total_value: totalValueUsd,
      total_cost: totalInvestedUsd,
      total_pnl: totalPnlUsd,
      pnl_percentage: pnlPercentage,
      unrealized_pnl: totalUnrealizedPnlUsd,
      base_currency: 'USD',
      totals: {
        total_value: to3Ccy(totalValueUsd),
        total_cost: backendSummary?.totals?.total_cost || to3Ccy(totalInvestedUsd),
        total_pnl: to3Ccy(totalPnlUsd),
        unrealized_pnl: to3Ccy(totalUnrealizedPnlUsd),
        cash_balance: backendSummary?.totals?.cash_balance,
      },
      categories: categoryAnalysis,
      asset_allocation: backendSummary?.asset_allocation,
    };
  }, [rawData]);

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
