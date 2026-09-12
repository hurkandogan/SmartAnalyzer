'use client';

import { useState, useEffect } from 'react';
import useSWR from 'swr';
import { getHeatmapAction } from '@/actions/screener';
import DistributionHeatmap from './DistributionHeatmap';

export function HeatmapTabs({ assets }: { assets: any[] }) {
  const [activeTab, setActiveTab] = useState<'portfolio' | 'sectors'>('portfolio');
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    const saved = localStorage.getItem('heatmap_active_tab');
    if (saved === 'sectors') {
      setActiveTab('sectors');
    }
    setMounted(true);
  }, []);

  const handleTabChange = (tab: 'portfolio' | 'sectors') => {
    setActiveTab(tab);
    localStorage.setItem('heatmap_active_tab', tab);
  };


  const { data: sectorData, isLoading } = useSWR(
    activeTab === 'sectors' ? 'heatmap-data' : null,
    async () => {
      const data = await getHeatmapAction();
      return Array.isArray(data) ? data : [];
    },
    { revalidateOnFocus: false }
  );

  const data = sectorData || [];

  if (!mounted) return null;

  return (
    <div className="w-full flex flex-col gap-6 mt-2 mb-6">
      <div className="tabs tabs-boxed mb-2 p-1 bg-base-200/50 inline-flex rounded-full w-fit">
        <button 
          className={`tab rounded-full px-6 transition-all font-semibold ${activeTab === 'portfolio' ? 'tab-active bg-primary text-primary-content shadow-sm' : ''}`}
          onClick={() => handleTabChange('portfolio')}
        >
          Portfolio Allocation
        </button>
        <button 
          className={`tab rounded-full px-6 transition-all font-semibold ${activeTab === 'sectors' ? 'tab-active bg-primary text-primary-content shadow-sm' : ''}`}
          onClick={() => handleTabChange('sectors')}
        >
          Sector Performance
        </button>
      </div>

      <div className="animate-fade-in">
        {activeTab === 'portfolio' && (
          <DistributionHeatmap assets={assets} />
        )}
        
        {activeTab === 'sectors' && (
          <div className="card bg-base-100 shadow-xl overflow-hidden">
            <div className="card-body p-6">
              <h2 className="card-title text-xl mb-4">Sector Performance Heatmap</h2>
              
              {isLoading ? (
                <div className="flex h-32 items-center justify-center">
                  <span className="loading loading-spinner loading-lg text-primary"></span>
                </div>
              ) : data.length === 0 ? (
                <div className="alert alert-info shadow-sm">
                  <span>No sector data available yet. Background sync is running.</span>
                </div>
              ) : (
                <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-4">
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
                          <span className="font-bold text-sm text-center mb-0.5 leading-tight">{sector.name}</span>
                          <span className="text-[10px] opacity-70 mb-2 font-mono">{sector.ticker}</span>
                          <div className="flex flex-col items-center w-full">
                            <div className="flex flex-col items-center">
                              <span className="text-[9px] font-semibold opacity-80 uppercase tracking-widest">1 Year</span>
                              <span className="text-xl font-black">{val1Y}</span>
                            </div>
                            
                            <div className="grid grid-cols-3 gap-1 w-full mt-3 pt-2.5 border-t border-current/10 text-center leading-none">
                              <div className="flex flex-col items-center">
                                <span className="text-[7px] font-bold opacity-75 uppercase tracking-wider mb-1">1 Day</span>
                                <span className={`text-[9px] font-black ${isPos1D ? 'text-success' : 'text-error'}`}>{val1D}</span>
                              </div>
                              <div className="flex flex-col items-center">
                                <span className="text-[7px] font-bold opacity-75 uppercase tracking-wider mb-1">1 Wk</span>
                                <span className={`text-[9px] font-black ${isPos1W ? 'text-success' : 'text-error'}`}>{val1W}</span>
                              </div>
                              <div className="flex flex-col items-center">
                                <span className="text-[7px] font-bold opacity-75 uppercase tracking-wider mb-1">1 Mo</span>
                                <span className={`text-[9px] font-black ${isPos1M ? 'text-success' : 'text-error'}`}>{val1M}</span>
                              </div>
                            </div>
                          </div>
                        </div>
                      );
                    })}
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
