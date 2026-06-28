'use client';

import { StatCards } from '@/components/dashboard/StatCards';
import { GoalTable } from '@/components/dashboard/GoalTable';
import { usePortfolio } from '@/hooks/usePortfolio';
import { useIBKRSync } from '@/hooks/useIBKRSync';
import { CategoryCards } from '@/components/dashboard/CategoryCards';

export default function Dashboard() {
  const { portfolio, isLoading, isError, history } = usePortfolio();
  const { isConfigured, lastSync, isSyncing } = useIBKRSync();

  const lastHistory =
    history && history.length > 0 ? history[history.length - 2] : undefined;

  if (isLoading) {
    return (
      <div className="flex h-64 items-center justify-center">
        <span className="loading loading-spinner loading-lg text-primary"></span>
        <p className="ml-4 text-lg">Metrixfolio data is loading...</p>
      </div>
    );
  }

  if (isError) {
    return (
      <div role="alert" className="alert alert-error">
        <span>Portfolio fetch error: {isError.message}</span>
      </div>
    );
  }

  return (
    <>
      <div className="flex flex-col gap-6">
        <div className="flex items-center justify-between">
          <h1 className="text-4xl font-bold">Dashboard</h1>
          {isConfigured && (
            <span className="text-xs opacity-50 flex items-center gap-1">
              {isSyncing ? (
                <><span className="loading loading-spinner loading-xs" /> IBKR syncing…</>
              ) : lastSync ? (
                <>IBKR · Last sync {lastSync}</>
              ) : null}
            </span>
          )}
        </div>
        <StatCards
          totalValue={portfolio?.total_value || 0}
          totalInvested={portfolio?.total_cost || 0}
          totalProfit={portfolio?.total_pnl || 0}
          profitPercentage={portfolio?.pnl_percentage || 0}
          prevTotalValue={lastHistory?.total_market_value}
          prevInvested={lastHistory?.total_cost_basis}
        />

        {portfolio?.categories && (
          <CategoryCards
            categories={portfolio.categories}
            history={history || []}
          />
        )}

        <div className="w-full">
          <div className="lg:col-span-2">
            <GoalTable currentValue={portfolio?.total_value || 0} />
          </div>
        </div>
      </div>
    </>
  );
}
