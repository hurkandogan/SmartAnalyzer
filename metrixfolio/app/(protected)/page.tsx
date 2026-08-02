'use client';

import { StatCards } from '@/components/dashboard/StatCards';
import { GoalTable } from '@/components/dashboard/GoalTable';
import { usePortfolio } from '@/hooks/usePortfolio';
import { useIBKRSync } from '@/hooks/useIBKRSync';
import { CategoryCards } from '@/components/dashboard/CategoryCards';
import { MagicSearchBar } from '@/components/dashboard/MagicSearchBar';
import { MacroCalendar } from '@/components/dashboard/MacroCalendar';

import { useAuth } from '@/context/AuthProvider';
import { useEffect, useState } from 'react';
import { getUserPreferenceAction, saveUserPreferenceAction } from '@/actions/user';

export default function Dashboard() {
  const { user } = useAuth();
  const [dashboardCurrency, setDashboardCurrency] = useState<string>('USD');

  useEffect(() => {
    if (user) {
      getUserPreferenceAction(user.uid, 'preferredDashboardCurrency').then((val) => {
        if (val) setDashboardCurrency(val);
      });
    }
  }, [user]);

  const handleCurrencyChange = async (currency: string) => {
    setDashboardCurrency(currency);
    if (user) {
      await saveUserPreferenceAction(user.uid, 'preferredDashboardCurrency', currency);
    }
  };
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
        <div className="relative flex flex-col items-center justify-center w-full min-h-[4rem]">
          <div className="w-full max-w-3xl">
            <MagicSearchBar />
          </div>
          {isConfigured && (
            <div className="md:absolute right-0 top-1/2 md:-translate-y-1/2 mt-2 md:mt-0">
              <span className="text-xs opacity-50 flex items-center gap-1">
                {isSyncing ? (
                  <><span className="loading loading-spinner loading-xs" /> IBKR syncing…</>
                ) : lastSync ? (
                  <>IBKR · Last sync {lastSync}</>
                ) : null}
              </span>
            </div>
          )}
        </div>
        <div className="flex justify-end items-center w-full -mb-2">
          <div className="flex bg-base-200 p-1 rounded-full shadow-sm">
            {['USD', 'EUR', 'TRY'].map((currency) => (
              <button
                key={currency}
                className={`px-4 py-1.5 text-sm font-bold rounded-full transition-all ${
                  dashboardCurrency === currency 
                    ? 'bg-primary text-primary-content shadow' 
                    : 'text-base-content/60 hover:text-base-content'
                }`}
                onClick={() => handleCurrencyChange(currency)}
              >
                {currency}
              </button>
            ))}
          </div>
        </div>
        <StatCards
          selectedCurrency={dashboardCurrency}
          totalValue={portfolio?.total_value || 0}
          totalInvested={portfolio?.total_cost || 0}
          totalProfit={portfolio?.total_pnl || 0}
          profitPercentage={portfolio?.pnl_percentage || 0}
          prevTotalValue={lastHistory?.total_market_value}
          prevInvested={lastHistory?.total_cost_basis}
        />

        {portfolio?.categories && (
          <CategoryCards
            selectedCurrency={dashboardCurrency}
            categories={portfolio.categories}
            history={history || []}
          />
        )}

        <div className="w-full grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div className="lg:col-span-2">
            <GoalTable selectedCurrency={dashboardCurrency} currentValue={portfolio?.total_value || 0} />
          </div>
          <div className="lg:col-span-1">
            <MacroCalendar />
          </div>
        </div>
      </div>
    </>
  );
}
