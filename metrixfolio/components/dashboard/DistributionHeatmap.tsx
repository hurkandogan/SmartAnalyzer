'use client';

import { useState, useEffect } from 'react';
import { Asset } from '@/types/positions';

interface DistributionHeatmapProps {
  assets: Asset[];
}

interface GroupedData {
  name: string;
  totalValue: number;
  weight: number;
  assets: { symbol: string; amount: number; value: number }[];
}

export default function DistributionHeatmap({ assets }: DistributionHeatmapProps) {
  const [sectorsOpen, setSectorsOpen] = useState(true);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    const savedSectors = localStorage.getItem('heatmap_sectors_open');
    if (savedSectors !== null) setSectorsOpen(savedSectors === 'true');
    
    setMounted(true);
  }, []);

  const toggleSectors = () => {
    const newVal = !sectorsOpen;
    setSectorsOpen(newVal);
    localStorage.setItem('heatmap_sectors_open', String(newVal));
  };

  if (!mounted) return null;

  // Filter out options and cash
  const validAssets = assets.filter(
    (a) => a.category_id !== 'options_buy' && a.category_id !== 'options_sell' && a.category_id !== 'cash' && a.category_id !== 'crypto' && a.type !== 'CASH'
  );

  const BASE_SECTORS = [
    'Technology', 'Healthcare', 'Financial Services', 'Consumer Cyclical',
    'Communication Services', 'Industrials', 'Consumer Defensive',
    'Energy', 'Utilities', 'Real Estate', 'Basic Materials'
  ];

  // Group by Sector
  const sectorsMap = new Map<string, GroupedData>();
  BASE_SECTORS.forEach(sec => sectorsMap.set(sec, { name: sec, totalValue: 0, weight: 0, assets: [] }));

  validAssets.forEach((a) => {
    const val = a.amount * a.current_price;
    if (val <= 0) return;

    const rawSector = a.sector || 'Other';

    if (rawSector === 'ETF') {
      // Split equally among the 11 BASE_SECTORS
      const splitVal = val / BASE_SECTORS.length;
      BASE_SECTORS.forEach(sec => {
        const sData = sectorsMap.get(sec)!;
        sData.totalValue += splitVal;
        sData.assets.push({ symbol: `${a.symbol} (ETF Split)`, amount: Number((a.amount / BASE_SECTORS.length).toFixed(2)), value: splitVal });
      });
    } else {
      let sectorName = rawSector;
      if (rawSector === 'Unknown') sectorName = 'Other';

      if (!sectorsMap.has(sectorName)) {
        sectorsMap.set(sectorName, { name: sectorName, totalValue: 0, weight: 0, assets: [] });
      }
      const sData = sectorsMap.get(sectorName)!;
      sData.totalValue += val;
      sData.assets.push({ symbol: a.symbol, amount: a.amount, value: val });
    }
  });

  const totalValidValue = Array.from(sectorsMap.values()).reduce((sum, s) => sum + s.totalValue, 0);

  const calculateWeights = (map: Map<string, GroupedData>) => {
    const result = Array.from(map.values());
    result.forEach((item) => {
      item.weight = totalValidValue > 0 ? (item.totalValue / totalValidValue) * 100 : 0;
      item.assets.sort((a, b) => b.value - a.value);
    });
    return result.sort((a, b) => b.weight - a.weight);
  };

  const sectors = calculateWeights(sectorsMap);

  // Targets based on global counts
  const TARGET_SECTOR_WEIGHT = 100 / 11; // ~9.09% for 11 sectors
  const THRESHOLD = 0.3; // 30% margin for "balanced"

  const renderGrid = (data: GroupedData[], targetWeight: number) => {
    return (
      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-4 mt-4">
        {data.map((item) => {
          let bgClass = 'bg-base-200/50 text-base-content/70 border-base-content/10'; // Grayish
          
          if (item.weight > targetWeight * (1 + THRESHOLD)) {
            bgClass = 'bg-error/20 text-error border-error/30'; // Overweight
          } else if (item.weight >= targetWeight * (1 - THRESHOLD) && item.weight <= targetWeight * (1 + THRESHOLD)) {
            bgClass = 'bg-success/20 text-success border-success/30'; // Balanced
          } else if (item.weight > 0) {
            bgClass = 'bg-warning/20 text-warning border-warning/30'; // Underweight
          }

          return (
            <div key={item.name} className={`flex flex-col p-4 rounded-2xl shadow-sm border ${bgClass} transition-transform hover:scale-105`}>
              <div className="flex flex-col items-center border-b border-current/10 pb-2 mb-2">
                <span className="font-bold text-sm text-center mb-1 leading-tight line-clamp-2 h-10 flex items-center">{item.name}</span>
                <span className="text-2xl font-black">{item.weight.toFixed(1)}%</span>
                <span className="text-xs font-semibold opacity-80">${item.totalValue.toLocaleString(undefined, { maximumFractionDigits: 0 })}</span>
              </div>
              <div className="flex flex-col gap-1 overflow-y-auto max-h-32 pr-1 custom-scrollbar">
                {item.assets.map(a => (
                  <div key={a.symbol} className="flex justify-between items-center text-[10px]">
                    <span className="font-mono font-bold truncate max-w-[60%]">{a.symbol}</span>
                    <span className="opacity-80">{a.amount}</span>
                  </div>
                ))}
              </div>
            </div>
          );
        })}
      </div>
    );
  };

  return (
    <div className="flex flex-col gap-4 w-full mt-8">
      {/* Sectors Accordion */}
      <div className="collapse bg-base-100 rounded-3xl shadow-sm border border-base-200 overflow-visible">
        <input type="checkbox" checked={sectorsOpen} onChange={toggleSectors} /> 
        <div className="collapse-title text-xl font-bold flex items-center gap-3">
          Sectors Distribution
          <span className="text-sm font-normal text-base-content/60 bg-base-200 px-2 py-1 rounded-full">Target: {TARGET_SECTOR_WEIGHT.toFixed(1)}%</span>
        </div>
        <div className="collapse-content overflow-visible">
          {sectors.length === 0 ? (
            <div className="text-center py-4 text-base-content/60">No sector data available. Try syncing IBKR.</div>
          ) : (
            renderGrid(sectors, TARGET_SECTOR_WEIGHT)
          )}
        </div>
      </div>
    </div>
  );
}
