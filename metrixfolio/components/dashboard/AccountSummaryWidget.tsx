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
  const mc = summary.multi_currency;
  const netLiq = mc?.netLiquidation?.[ccy] ?? convert(summary.netLiquidation || 0, 'USD', ccy);
  const excessLiq = mc?.excessLiquidity?.[ccy] ?? convert(summary.excessLiquidity || 0, 'USD', ccy);
  const maintMargin = mc?.maintenanceMargin?.[ccy] ?? convert(summary.maintenanceMargin || 0, 'USD', ccy);
  const initMargin = mc?.initialMargin?.[ccy] ?? convert(summary.initialMargin || 0, 'USD', ccy);
  const buyingPower = mc?.buyingPower?.[ccy] ?? convert(summary.buyingPower || 0, 'USD', ccy);

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
      <div className="stat py-3 px-4 bg-primary/5 border-b lg:border-b-0 lg:border-r border-base-content/10 lg:w-40 shrink-0 flex flex-col justify-center">
        <div className="stat-title text-xs font-bold text-primary flex items-center gap-1.5">
          <span className="badge badge-primary badge-sm font-black tracking-wider uppercase">IBKR</span>
          <span className="text-[10px] font-bold uppercase tracking-wider text-primary opacity-80">Live</span>
        </div>
        <div className="stat-value text-base lg:text-lg font-bold text-base-content mt-0.5">
          Broker Data
        </div>
      </div>

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
