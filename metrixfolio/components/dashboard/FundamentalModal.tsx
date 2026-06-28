import React, { useEffect, useState, useMemo } from 'react';
import { getAnalysesAction } from '@/actions/watchlist';
import { StockAnalysis } from '@/types/watchlist';
import { SparklineRow } from './SparklineRow';

interface FundamentalModalProps {
  symbol: string;
  isOpen: boolean;
  onClose: () => void;
}

export const FundamentalModal: React.FC<FundamentalModalProps> = ({
  symbol,
  isOpen,
  onClose,
}) => {
  const [data, setData] = useState<StockAnalysis[]>([]);
  const [isLoading, setIsLoading] = useState(false);

  useEffect(() => {
    if (isOpen && symbol) {
      const fetchData = async () => {
        setIsLoading(true);
        try {
          // Fetch up to 1 year of data (365 points)
          const analyses = await getAnalysesAction(symbol, 365);
          // Sort ascending for chart rendering (oldest to newest)
          setData(analyses.reverse());
        } catch (error) {
          console.error('Failed to fetch fundamental data:', error);
        } finally {
          setIsLoading(false);
        }
      };
      fetchData();
    } else {
      setData([]);
    }
  }, [isOpen, symbol]);

  const latest = data.length > 0 ? data[data.length - 1] : null;

  // Format date helper (e.g. 2026-06-28 -> Jun 2026)
  const formatDateLabel = (dateStr?: string) => {
    if (!dateStr) return '';
    const date = new Date(dateStr);
    if (isNaN(date.getTime())) return dateStr;
    return date.toLocaleDateString('en-US', { month: 'short', year: 'numeric' });
  };

  const timelineDates = useMemo(() => {
    if (data.length === 0) return null;
    const start = formatDateLabel(data[0]?.date);
    const end = formatDateLabel(data[data.length - 1]?.date);
    const mid = formatDateLabel(data[Math.floor(data.length / 2)]?.date);
    return { start, mid, end };
  }, [data]);

  // Helper to extract a series for a specific metric
  const getSeries = (key: keyof StockAnalysis) => {
    return data.map((d) => ({ val: d[key] as number }));
  };

  const formatNumber = (val: number | string | null | undefined) => {
    if (val === null || val === undefined) return '-';
    if (typeof val === 'number') {
      if (Math.abs(val) >= 1e9) return `${(val / 1e9).toFixed(2)}B`;
      if (Math.abs(val) >= 1e6) return `${(val / 1e6).toFixed(2)}M`;
      return val.toFixed(2);
    }
    return val;
  };

  const formatPercent = (val: number | string | null | undefined) => {
    if (val === null || val === undefined) return '-';
    if (typeof val === 'number') return `${val.toFixed(2)}%`;
    return val;
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
      <div className="relative max-w-3xl w-full max-h-[85vh] bg-base-100 shadow-2xl rounded-xl p-6 z-50 border border-base-content/10 flex flex-col">
        <button
          onClick={onClose}
          className="btn btn-sm btn-circle btn-ghost absolute right-4 top-4"
        >
          ✕
        </button>
        <h3 className="font-bold text-2xl bg-gradient-to-r from-primary to-secondary bg-clip-text text-transparent mb-6 pr-8 flex-shrink-0">
          {symbol.toUpperCase()} Fundamentals
        </h3>
        
        {isLoading ? (
          <div className="flex flex-col items-center justify-center h-48 space-y-4 flex-grow">
            <span className="loading loading-ring loading-lg text-primary"></span>
            <span className="text-sm text-base-content/70 animate-pulse">Summoning data...</span>
          </div>
        ) : data.length === 0 ? (
          <div className="flex items-center justify-center h-48 text-base-content/50 flex-grow">
            No historical fundamental data found for this ticker.
          </div>
        ) : (
          <div className="flex flex-col flex-grow overflow-hidden">
            {/* Scrollable Metric Rows */}
            <div className="flex-grow overflow-y-auto space-y-2 pr-1 max-h-[50vh]">
              <SparklineRow label="Price" value={latest?.last_price} data={getSeries('last_price')} color="#3abff8" formatValue={(v) => `$${formatNumber(v)}`} />
              <SparklineRow label="Market Cap" value={latest?.market_cap} data={getSeries('market_cap')} color="#36d399" formatValue={formatNumber} />
              <SparklineRow label="P/E Ratio" value={latest?.pe} data={getSeries('pe')} color="#fbbd23" formatValue={(v) => typeof v === 'number' ? v.toFixed(2) : '-'} />
              <SparklineRow label="Forward P/E" value={latest?.forward_pe} data={getSeries('forward_pe')} color="#fbbd23" formatValue={(v) => typeof v === 'number' ? v.toFixed(2) : '-'} />
              <SparklineRow label="EPS" value={latest?.eps} data={getSeries('eps')} color="#f87272" formatValue={(v) => `$${formatNumber(v)}`} />
              <SparklineRow label="EV/EBITDA" value={latest?.ev_to_ebitda} data={getSeries('ev_to_ebitda')} color="#e879f9" formatValue={(v) => typeof v === 'number' ? v.toFixed(2) : '-'} />
              <SparklineRow label="Profit Margin" value={latest?.profit_margin} data={getSeries('profit_margin')} color="#2dd4bf" formatValue={formatPercent} />
              <SparklineRow label="Revenue Growth" value={latest?.revenue_growth} data={getSeries('revenue_growth')} color="#4ade80" formatValue={formatPercent} />
              <SparklineRow label="Dividend Yield" value={latest?.dividend_yield} data={getSeries('dividend_yield')} color="#60a5fa" formatValue={formatPercent} />
              <SparklineRow label="RSI" value={latest?.rsi} data={getSeries('rsi')} color="#c084fc" formatValue={(v) => typeof v === 'number' ? v.toFixed(2) : '-'} />
              <SparklineRow label="Implied Volatility (IV)" value={latest?.iv} data={getSeries('iv')} color="#fb923c" formatValue={formatPercent} />
            </div>

            {/* Shared Timeline Axis */}
            {timelineDates && (
              <div className="flex items-center justify-between mt-4 pt-4 border-t border-base-300 dark:border-base-800 text-[10px] text-base-content/40 px-3 flex-shrink-0">
                <div className="w-1/4 flex-shrink-0 uppercase font-bold tracking-wider">
                  Timeline
                </div>
                <div className="w-3/4 flex justify-between items-center px-4 relative">
                  {/* Subtle dotted line matching the width of the charts */}
                  <div className="absolute left-2 right-2 top-1/2 -translate-y-1/2 h-0 border-t border-dashed border-base-content/10"></div>
                  
                  <span className="bg-base-100 z-10 px-1.5 py-0.5 rounded border border-base-content/5 shadow-sm font-medium">{timelineDates.start}</span>
                  <span className="bg-base-100 z-10 px-1.5 py-0.5 rounded border border-base-content/5 shadow-sm font-medium">{timelineDates.mid}</span>
                  <span className="bg-base-100 z-10 px-1.5 py-0.5 rounded border border-base-content/5 shadow-sm font-medium">{timelineDates.end}</span>
                </div>
              </div>
            )}
          </div>
        )}
      </div>
      {/* Click outside to close */}
      <div className="absolute inset-0 cursor-pointer -z-10" onClick={onClose}></div>
    </div>
  );
};
