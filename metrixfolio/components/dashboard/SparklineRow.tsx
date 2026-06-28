import React, { useState, useEffect } from 'react';
import { LineChart, Line, YAxis, Tooltip } from 'recharts';

interface SparklineRowProps {
  label: string;
  value: number | string | null | undefined;
  data: { val: number }[];
  color?: string;
  formatValue?: (val: number | string | null | undefined) => string;
}

export const SparklineRow: React.FC<SparklineRowProps> = ({
  label,
  value,
  data,
  color = '#8884d8',
  formatValue,
}) => {
  const displayValue = formatValue ? formatValue(value) : value?.toString() ?? '-';
  const [chartWidth, setChartWidth] = useState(160);

  useEffect(() => {
    const handleResize = () => {
      // Calculate a nice width based on screen width
      if (window.innerWidth > 768) {
        setChartWidth(350); // Much wider on desktop
      } else {
        setChartWidth(160); // Standard on mobile
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

  // Add slight padding to the domain
  const domainMin = min - (max - min) * 0.1;
  const domainMax = max + (max - min) * 0.1;

  return (
    <div className="flex items-center justify-between py-3 border-b border-base-300 last:border-b-0 group hover:bg-base-200/30 transition-colors px-3 rounded-lg">
      <div className="flex flex-col w-1/4 flex-shrink-0 pr-2">
        <span className="text-xs text-base-content/60 font-medium tracking-wider uppercase">{label}</span>
        <span className="text-sm font-semibold text-base-content mt-0.5">{displayValue}</span>
      </div>
      <div className="w-3/4 h-12 flex justify-end items-center bg-base-200/50 dark:bg-base-300/20 rounded-lg px-2 border border-base-content/5 relative">
        {hasData ? (
          <LineChart width={chartWidth} height={36} data={data} margin={{ top: 2, bottom: 2, left: 2, right: 2 }}>
            <YAxis domain={[domainMin, domainMax]} hide />
            <Tooltip
              contentStyle={{
                backgroundColor: 'rgba(15, 23, 42, 0.9)',
                border: '1px solid rgba(255, 255, 255, 0.1)',
                borderRadius: '6px',
                padding: '4px 8px',
                fontSize: '11px',
                fontWeight: '600',
              }}
              labelStyle={{ display: 'none' }}
              itemStyle={{ color: '#fff', padding: 0 }}
              formatter={(val: any) => [formatValue ? formatValue(val) : val, '']}
            />
            <Line
              type="monotone"
              dataKey="val"
              stroke={color}
              strokeWidth={2.5}
              dot={false}
              activeDot={{ r: 4, strokeWidth: 0, fill: color }}
              isAnimationActive={true}
              animationDuration={1000}
              animationEasing="ease-in-out"
            />
          </LineChart>
        ) : (
          <div className="text-xs text-base-content/30 italic pr-2">
            No history
          </div>
        )}
      </div>
    </div>
  );
};
