'use client';

import { useState } from 'react';
import useSWR from 'swr';
import { getHeatmapAction } from '@/actions/screener';
import Link from 'next/link';
import SwingSignals from './components/SwingSignals';

import HighScoreOpportunities from './components/HighScoreOpportunities';
import ValueOpportunities from './components/ValueOpportunities';

export default function ScreenerPage() {
  const [activeTab, setActiveTab] = useState<'fundamental' | 'value' | 'swing'>('fundamental');
  const { data: sectorData, isLoading } = useSWR(
    'heatmap-data',
    async () => {
      const data = await getHeatmapAction();
      return Array.isArray(data) ? data : [];
    },
    { revalidateOnFocus: true }
  );

  if (isLoading) {
    return (
      <div className="flex h-64 items-center justify-center">
        <span className="loading loading-spinner loading-lg text-primary"></span>
        <p className="ml-4 text-lg">Loading Sector Heatmap...</p>
      </div>
    );
  }

  const data = sectorData || [];

  return (
    <div className="flex flex-col gap-6 w-full max-w-full pb-10">
      <div className="flex justify-between items-end">
        <div>
          <h1 className="text-4xl font-bold">Sector Performance Heatmap</h1>
          <p className="text-base-content/60 mt-2">
            1-Year and 1-Day performance of major US Sectors & Industries.
          </p>
        </div>
      </div>

      {data.length === 0 ? (
        <div className="alert alert-info shadow-lg mt-8">
          <span>No sector data available yet. Background sync is running.</span>
        </div>
      ) : (
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-4 mt-8">
          {data
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
      
      <div className="mt-12">
        <div className="tabs tabs-boxed mb-6 p-1 bg-base-200/50 inline-flex rounded-full">
          <button 
            className={`tab rounded-full px-6 transition-all font-semibold ${activeTab === 'fundamental' ? 'tab-active bg-primary text-primary-content shadow-sm' : ''}`}
            onClick={() => setActiveTab('fundamental')}
          >
            Fundamental
          </button>
          <button 
            className={`tab rounded-full px-6 transition-all font-semibold ${activeTab === 'value' ? 'tab-active bg-primary text-primary-content shadow-sm' : ''}`}
            onClick={() => setActiveTab('value')}
          >
            Value / Growth
          </button>
          <button 
            className={`tab rounded-full px-6 transition-all font-semibold ${activeTab === 'swing' ? 'tab-active bg-primary text-primary-content shadow-sm' : ''}`}
            onClick={() => setActiveTab('swing')}
          >
            Swing
          </button>
        </div>

        <div className="animate-fade-in">
          {activeTab === 'fundamental' && <HighScoreOpportunities />}
          {activeTab === 'value' && <ValueOpportunities />}
          {activeTab === 'swing' && <SwingSignals />}
        </div>
      </div>
    </div>
  );
}
