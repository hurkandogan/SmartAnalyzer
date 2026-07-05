'use client';

import { useState, useEffect } from 'react';
import { getHeatmapAction } from '@/actions/screener';
import Link from 'next/link';

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

              return (
                <div key={sector.name} className={`flex flex-col items-center justify-center p-6 rounded-2xl shadow-sm hover:scale-105 transition-transform border ${bgClass}`}>
                  <span className="font-bold text-lg text-center mb-1">{sector.name}</span>
                  <span className="text-xs opacity-70 mb-3">{sector.ticker}</span>
                  <div className="flex flex-col items-center gap-1">
                    <div className="flex flex-col items-center">
                      <span className="text-xs font-semibold opacity-80 uppercase tracking-widest">1 Year</span>
                      <span className="text-2xl font-black">{val1Y}</span>
                    </div>
                    <div className={`flex flex-col items-center mt-2 ${isPos1D ? 'text-success' : 'text-error'}`}>
                      <span className="text-[10px] font-semibold opacity-80 uppercase tracking-widest">1 Day</span>
                      <span className="text-sm font-bold">{val1D}</span>
                    </div>
                  </div>
                </div>
              );
            })}
        </div>
      )}
    </div>
  );
}
