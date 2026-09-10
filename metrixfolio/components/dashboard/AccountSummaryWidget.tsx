'use client';

import React from 'react';
import useSWR from 'swr';
import { useAuth } from '@/context/AuthProvider';
import { getIBKRSummaryAction } from '@/actions/ibkr';
import { useCurrencyConverter } from '@/hooks/useCurrencyConverter';

interface AccountSummaryWidgetProps {
  selectedCurrency?: string;
}

export const AccountSummaryWidget: React.FC<AccountSummaryWidgetProps> = ({
  selectedCurrency = 'USD'
}) => {
  const { user } = useAuth();
  const { convert } = useCurrencyConverter();

  const { data: summary, isLoading } = useSWR(
    user ? ['ibkr-summary', user.uid] : null,
    ([, userId]) => getIBKRSummaryAction(userId),
    { refreshInterval: 60000 }
  );

  if (isLoading) {
    return <div className="skeleton w-full h-24 mt-4"></div>;
  }

  // Only render if we have some data
  if (!summary || (summary.netLiquidation === 0 && summary.buyingPower === 0)) return null;

  const ccy = selectedCurrency;
  const netLiq = convert(summary.netLiquidation || 0, 'USD', ccy);
  const excessLiq = convert(summary.excessLiquidity || 0, 'USD', ccy);
  const maintMargin = convert(summary.maintenanceMargin || 0, 'USD', ccy);
  const initMargin = convert(summary.initialMargin || 0, 'USD', ccy);
  const buyingPower = convert(summary.buyingPower || 0, 'USD', ccy);

  const formatCurrency = (val: number) => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: ccy,
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    }).format(val);
  };

  return (
    <div className="stats stats-vertical lg:stats-horizontal bg-base-100/50 backdrop-blur-md w-full shadow mt-4">
      <div className="stat py-3 px-4">
        <div className="stat-title text-xs opacity-70">Net Liquidation</div>
        <div className="stat-value text-xl lg:text-2xl font-bold">{formatCurrency(netLiq)}</div>
      </div>
      
      <div className="stat py-3 px-4">
        <div className="stat-title text-xs opacity-70">Excess Liquidity</div>
        <div className="stat-value text-xl lg:text-2xl font-bold text-success">{formatCurrency(excessLiq)}</div>
      </div>

      <div className="stat py-3 px-4">
        <div className="stat-title text-xs opacity-70">Maint. Margin</div>
        <div className="stat-value text-xl lg:text-2xl font-bold text-warning">{formatCurrency(maintMargin)}</div>
      </div>
      
      <div className="stat py-3 px-4">
        <div className="stat-title text-xs opacity-70">Initial Margin</div>
        <div className="stat-value text-xl lg:text-2xl font-bold text-error">{formatCurrency(initMargin)}</div>
      </div>

      <div className="stat py-3 px-4">
        <div className="stat-title text-xs opacity-70">Buying Power</div>
        <div className="stat-value text-xl lg:text-2xl font-bold text-primary">{formatCurrency(buyingPower)}</div>
      </div>
    </div>
  );
};
