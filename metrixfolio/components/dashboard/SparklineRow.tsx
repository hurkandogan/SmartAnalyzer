import React, { useState, useEffect } from 'react';
import dynamic from 'next/dynamic';

const SparklineChart = dynamic(() => import('./charts/SparklineChart'), { ssr: false });

interface SparklineRowProps {
  label: string;
  value: number | string | null | undefined;
  data: { val: number }[];
  color?: string;
  formatValue?: (val: number | string | null | undefined) => string;
  timeline?: { start: string; mid: string; end: string } | null;
}

export const SparklineRow: React.FC<SparklineRowProps> = ({
  label,
  value,
  data,
  color = '#8884d8',
  formatValue,
  timeline,
}) => {
  const displayValue = formatValue ? formatValue(value) : value?.toString() ?? '-';
  const [chartWidth, setChartWidth] = useState(160);

  useEffect(() => {
    const handleResize = () => {
      if (window.innerWidth > 768) {
        setChartWidth(350);
      } else {
        setChartWidth(160);
      }
    };
    handleResize();
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  const vals = data.map((d) => d.val).filter((v) => v !== null && v !== undefined && !isNaN(v));
  const hasData = vals.length > 0;
  const min = hasData ? Math.min(...vals) : 0;
  const max = hasData ? Math.max(...vals) : 100;

  const domainMin = min - (max - min) * 0.1;
  const domainMax = max + (max - min) * 0.1;

  return (
    <div className="flex flex-col py-3 border-b border-base-300 last:border-b-0 group hover:bg-base-200/30 transition-colors px-3 rounded-lg">
      <div className="flex items-center justify-between w-full">
        <div className="flex flex-col w-1/4 flex-shrink-0 pr-2">
          <span className="text-xs text-base-content/60 font-medium tracking-wider uppercase">{label}</span>
          <span className="text-sm font-semibold text-base-content mt-0.5">{displayValue}</span>
        </div>
        <div className="w-3/4 h-12 flex justify-end items-center bg-base-200/50 dark:bg-base-300/20 rounded-lg px-2 border border-base-content/5 relative">
          {hasData ? (
            <SparklineChart 
              data={data} 
              width={chartWidth} 
              domainMin={domainMin} 
              domainMax={domainMax} 
              color={color} 
              formatValue={formatValue} 
            />
          ) : (
            <div className="text-xs text-base-content/30 italic pr-2">
              No history
            </div>
          )}
        </div>
      </div>
      {timeline && hasData && (
        <div className="w-full flex justify-end text-[9px] text-base-content/40 mt-1.5 select-none pr-2 animate-fade-in">
          <div className="w-3/4 flex justify-between items-center px-4 relative">
            <div className="absolute left-2 right-2 top-1/2 -translate-y-1/2 h-0 border-t border-dashed border-base-content/10"></div>
            <span className="bg-base-100 dark:bg-base-900 z-10 px-1.5 py-0.5 rounded border border-base-content/5 shadow-xs font-mono">{timeline.start}</span>
            <span className="bg-base-100 dark:bg-base-900 z-10 px-1.5 py-0.5 rounded border border-base-content/5 shadow-xs font-mono">{timeline.mid}</span>
            <span className="bg-base-100 dark:bg-base-900 z-10 px-1.5 py-0.5 rounded border border-base-content/5 shadow-xs font-mono">{timeline.end}</span>
          </div>
        </div>
      )}
    </div>
  );
};
