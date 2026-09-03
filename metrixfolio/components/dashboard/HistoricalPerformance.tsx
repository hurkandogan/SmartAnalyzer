'use client';

import React from 'react';
import { PortfolioHistory } from '@/types/history';
import { FiArrowUp, FiArrowDown, FiMinus } from 'react-icons/fi';

interface HistoricalPerformanceProps {
  history: PortfolioHistory[];
  currentTotalValue: number; // in USD (base)
}

export const HistoricalPerformance: React.FC<HistoricalPerformanceProps> = ({
  history,
  currentTotalValue,
}) => {
  if (!history || history.length === 0) {
    return null;
  }

  const now = new Date();
  
  // Helper to find the closest history record at or before a target date
  const findRecord = (daysAgo: number): PortfolioHistory | undefined => {
    const targetDate = new Date();
    targetDate.setDate(now.getDate() - daysAgo);
    const targetTimestamp = targetDate.getTime();
    
    // History is presumably ordered ascending by date/timestamp
    // Iterate backwards to find the latest record that is <= target timestamp
    for (let i = history.length - 1; i >= 0; i--) {
      if (history[i].timestamp <= targetTimestamp) {
        return history[i];
      }
    }
    
    // If we didn't find one <= target (e.g. 1 year ago but account is 3 months old)
    // return the oldest record we have (index 0)
    return history[0];
  };

  const records = {
    '1D': findRecord(1),
    '1W': findRecord(7),
    '1M': findRecord(30),
    '1Y': findRecord(365),
  };

  const calculateChange = (pastRecord?: PortfolioHistory) => {
    if (!pastRecord || pastRecord.total_market_value === 0) return 0;
    return ((currentTotalValue - pastRecord.total_market_value) / pastRecord.total_market_value) * 100;
  };

  const periods = [
    { label: '1D', change: calculateChange(records['1D']) },
    { label: '1W', change: calculateChange(records['1W']) },
    { label: '1M', change: calculateChange(records['1M']) },
    { label: '1Y', change: calculateChange(records['1Y']) },
  ];

  return (
    <div className="w-full mt-1">
      <div className="grid grid-cols-4 gap-2 md:gap-4">
        {periods.map((period) => {
          const isPositive = period.change > 0;
          const isNegative = period.change < 0;

          return (
            <div key={period.label} className="bg-base-100 shadow-sm border border-base-200/50 rounded-2xl p-3 flex flex-col items-center justify-center transition-all hover:shadow-md">
              <span className="text-[10px] uppercase font-bold tracking-wider opacity-50 mb-1">{period.label} Change</span>
              <div
                className={`flex items-center text-sm md:text-base font-bold ${
                  isPositive
                    ? 'text-success'
                    : isNegative
                    ? 'text-error'
                    : 'text-base-content/70'
                }`}
              >
                {isPositive ? (
                  <FiArrowUp className="mr-0.5" />
                ) : isNegative ? (
                  <FiArrowDown className="mr-0.5" />
                ) : (
                  <FiMinus className="mr-0.5" />
                )}
                <span>{Math.abs(period.change).toFixed(2)}%</span>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};
