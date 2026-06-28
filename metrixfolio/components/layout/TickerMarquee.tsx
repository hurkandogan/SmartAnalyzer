'use client';

import { useEffect, useState } from 'react';
import { getHotTickersAction, HotTickerInfo } from '@/actions/watchlist';
import { FiTrendingUp, FiAlertCircle } from 'react-icons/fi';

export const TickerMarquee = () => {
  const [tickers, setTickers] = useState<HotTickerInfo[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const fetchTickers = async () => {
      try {
        const data = await getHotTickersAction();
        // Sort to put HOT tickers first, then regular ones
        const sorted = [...data].sort((a, b) => (b.is_hot ? 1 : 0) - (a.is_hot ? 1 : 0));
        setTickers(sorted);
      } catch (err) {
        console.error('Failed to fetch hot tickers:', err);
      } finally {
        setIsLoading(false);
      }
    };

    fetchTickers();
  }, []);

  if (isLoading) {
    return (
      <div className="w-full bg-base-200/30 border-b border-base-content/5 py-2 px-4 flex items-center justify-center text-xs opacity-50">
        <span className="loading loading-spinner loading-xs mr-2" />
        Loading market radar...
      </div>
    );
  }

  if (tickers.length === 0) {
    return null;
  }

  // Duplicate items for continuous marquee loop
  const marqueeItems = [...tickers, ...tickers, ...tickers];

  return (
    <div className="w-full bg-base-100/50 backdrop-blur-sm border-b border-base-content/5 py-1.5 overflow-hidden relative z-40 select-none">
      {/* Absolute Left Gradient Fade Overlay */}
      <div className="absolute left-0 top-0 bottom-0 w-12 bg-gradient-to-r from-base-100/80 to-transparent z-10 pointer-events-none" />
      {/* Absolute Right Gradient Fade Overlay */}
      <div className="absolute right-0 top-0 bottom-0 w-12 bg-gradient-to-l from-base-100/80 to-transparent z-10 pointer-events-none" />

      {/* Scrolling Track */}
      <div className="w-full overflow-hidden whitespace-nowrap">
        <div className="animate-marquee inline-flex items-center gap-6 pr-6">
          {marqueeItems.map((item, idx) => (
            <div
              key={`${item.symbol}-${idx}`}
              className={`inline-flex items-center gap-2 px-3 py-1 rounded-full text-xs font-semibold transition-all duration-200 ${
                item.is_hot
                  ? 'bg-rose-500/10 border border-rose-500/20 text-rose-500 dark:text-rose-400 shadow-sm shadow-rose-500/5'
                  : 'bg-base-200/50 border border-base-content/5 text-base-content/75 hover:bg-base-200 hover:border-base-content/10'
              }`}
            >
              {item.is_hot ? (
                <span className="flex items-center gap-1">
                  <span className="animate-pulse">🔥</span>
                  <span className="tracking-tight font-black">{item.symbol}</span>
                </span>
              ) : (
                <span className="font-bold text-base-content">{item.symbol}</span>
              )}

              <span className="opacity-80">
                {item.last_price ? `$${item.last_price.toFixed(2)}` : '—'}
              </span>

              <div className="flex items-center gap-1.5 text-[10px] opacity-60">
                <span>RSI: {item.rsi != null ? item.rsi.toFixed(0) : '—'}</span>
                <span>•</span>
                <span>IV: {item.iv != null ? `${item.iv.toFixed(0)}%` : '—'}</span>
              </div>

              {item.cross_signal && (
                <span className={`text-[10px] font-extrabold uppercase px-1.5 py-0.5 rounded-md tracking-wider flex items-center gap-1
                  ${item.cross_signal === 'GC' ? 'bg-amber-500 text-white dark:bg-amber-500/20 dark:text-amber-400' :
                    item.cross_signal === 'DC' ? 'bg-red-600 text-white dark:bg-red-600/20 dark:text-red-400' :
                    item.cross_signal === 'GC_COMING' ? 'bg-yellow-500 text-white dark:bg-yellow-500/20 dark:text-yellow-400' :
                    'bg-orange-600 text-white dark:bg-orange-600/20 dark:text-orange-400'
                  }`}
                >
                  {item.cross_signal === 'GC' && <span>🪙 GC</span>}
                  {item.cross_signal === 'GC_COMING' && <span>🪙⏳ GC Coming</span>}
                  {item.cross_signal === 'DC' && <span>☠️ DC</span>}
                  {item.cross_signal === 'DC_COMING' && <span>📉⏳ DC Coming</span>}
                </span>
              )}

              {item.is_hot && !item.cross_signal && (
                <span className="text-[9px] font-extrabold uppercase bg-rose-500 text-white dark:bg-rose-500/20 dark:text-rose-400 px-1.5 py-0.5 rounded-md tracking-wider">
                  HOT
                </span>
              )}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};
