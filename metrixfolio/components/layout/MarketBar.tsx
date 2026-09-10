'use client';

import React, { useEffect, useState } from 'react';
import { getMarketBarDataAction, MarketBarData } from '@/actions/market-bar';
import { FiArrowUp, FiArrowDown } from 'react-icons/fi';

export const MarketBar = () => {
  const [data, setData] = useState<MarketBarData | null>(null);

  useEffect(() => {
    async function fetchData() {
      const res = await getMarketBarDataAction();
      if (res) {
        setData(res);
      }
    }
    fetchData();
    // Re-fetch every 30 minutes
    const interval = setInterval(fetchData, 30 * 60 * 1000);
    return () => clearInterval(interval);
  }, []);

  if (!data) return null;

  const renderItem = (label: string, item?: { price: number; change_pct: number }, isCurrency = false) => {
    if (!item) return null;
    const isPos = item.change_pct >= 0;
    return (
      <div className="flex items-center gap-1.5 px-3 border-r border-base-content/10 last:border-0 whitespace-nowrap">
        <span className="font-bold text-xs opacity-70">{label}</span>
        <span className="font-mono text-sm">{isCurrency ? item.price.toFixed(4) : item.price.toFixed(2)}</span>
        <span className={`flex items-center text-xs font-bold ${isPos ? 'text-success' : 'text-error'}`}>
          {isPos ? <FiArrowUp /> : <FiArrowDown />}
          {Math.abs(item.change_pct).toFixed(2)}%
        </span>
      </div>
    );
  };

  return (
    <div className="w-full bg-base-200/50 backdrop-blur-md border-b border-base-content/5 py-2.5 overflow-x-auto hide-scrollbar">
      <div className="flex items-center justify-center min-w-max mx-auto h-full">
        {renderItem('SPY', data.indices?.SPY)}
        {renderItem('QQQ', data.indices?.QQQ)}
        {renderItem('DIA', data.indices?.DIA)}
        {renderItem('USD/EUR', data.currencies?.['USD/EUR'], true)}
        {renderItem('USD/TRY', data.currencies?.['USD/TRY'], true)}
      </div>
    </div>
  );
};
