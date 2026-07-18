'use client';

import { useState, useEffect } from 'react';
import { getHeatmapAction } from '@/actions/screener';
import Link from 'next/link';
import SwingSignals from './components/SwingSignals';

export default function ScreenerPage() {
  const [sectorData, setSectorData] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    setIsLoading(true);
    try {
      const data = await getHeatmapAction();
      if (Array.isArray(data)) {
        setSectorData(data);
      } else {
        setSectorData([]);
      }
    } catch (err) {
      console.error(err);
      setSectorData([]);
    }
    setIsLoading(false);
  };

  if (isLoading) {
    return (
      <div className="flex h-64 items-center justify-center">
        <span className="loading loading-spinner loading-lg text-primary"></span>
        <p className="ml-4 text-lg">Loading Sector Heatmap...</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-6 w-full max-w-full">
      <div className="flex justify-between items-end">
        <div>
          <h1 className="text-4xl font-bold">Sector Performance Heatmap</h1>
          <p className="text-base-content/60 mt-2">
            1-Year and 1-Day performance of major US Sectors & Industries.
          </p>
        </div>
        <div className="flex gap-2">
          <Link href="/screener/opportunities" className="btn btn-secondary">
            High Score Opportunities
          </Link>
        </div>
      </div>

      {sectorData.length === 0 ? (
        <div className="alert alert-info shadow-lg mt-8">
          <span>No sector data available yet. Background sync is running.</span>
        </div>
      ) : (
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-4 mt-8">
          {sectorData
            .sort((a, b) => b.performance_1y - a.performance_1y)
            .map((sector) => {
              const isPos1Y = sector.performance_1y >= 0;
              const bgClass = isPos1Y ? 'bg-success/20 text-success border-success/30' : 'bg-error/20 text-error border-error/30';
              const val1Y = (sector.performance_1y * 100).toFixed(1) + '%';
              
              const isPos1D = sector.performance_1d >= 0;
              const val1D = (sector.performance_1d * 100).toFixed(2) + '%';

              const isPos1W = (sector.performance_1w ?? 0) >= 0;
              const val1W = ((sector.performance_1w ?? 0) * 100).toFixed(1) + '%';

              const isPos1M = (sector.performance_1m ?? 0) >= 0;
              const val1M = ((sector.performance_1m ?? 0) * 100).toFixed(1) + '%';

              return (
                <div key={sector.name} className={`flex flex-col items-center justify-center p-4 rounded-2xl shadow-sm hover:scale-105 transition-transform border ${bgClass}`}>
                  <span className="font-bold text-base text-center mb-0.5 leading-tight">{sector.name}</span>
                  <span className="text-[10px] opacity-70 mb-2 font-mono">{sector.ticker}</span>
                  <div className="flex flex-col items-center w-full">
                    <div className="flex flex-col items-center">
                      <span className="text-[9px] font-semibold opacity-80 uppercase tracking-widest">1 Year</span>
                      <span className="text-2xl font-black">{val1Y}</span>
                    </div>
                    
                    <div className="grid grid-cols-3 gap-1 w-full mt-3 pt-2.5 border-t border-current/10 text-center leading-none">
                      <div className="flex flex-col items-center">
                        <span className="text-[8px] font-bold opacity-75 uppercase tracking-wider mb-1">1 Day</span>
                        <span className={`text-[10px] font-black ${isPos1D ? 'text-success' : 'text-error'}`}>{val1D}</span>
                      </div>
                      <div className="flex flex-col items-center">
                        <span className="text-[8px] font-bold opacity-75 uppercase tracking-wider mb-1">1 Week</span>
                        <span className={`text-[10px] font-black ${isPos1W ? 'text-success' : 'text-error'}`}>{val1W}</span>
                      </div>
                      <div className="flex flex-col items-center">
                        <span className="text-[8px] font-bold opacity-75 uppercase tracking-wider mb-1">1 Month</span>
                        <span className={`text-[10px] font-black ${isPos1M ? 'text-success' : 'text-error'}`}>{val1M}</span>
                      </div>
                    </div>
                  </div>
                </div>
              );
            })}
        </div>
      )}
      
      <SwingSignals />
    </div>
  );
}
