'use client';

import { useMemo, useState } from 'react';
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip, Sector } from 'recharts';
import { Asset } from '@/types/positions';

interface AssetAllocationChartProps {
  assets: Asset[];
  totalValue: number;
}

const COLORS = [
  '#6366f1', // indigo-500
  '#a855f7', // purple-500
  '#ec4899', // pink-500
  '#3b82f6', // blue-500
  '#14b8a6', // teal-500
  '#f59e0b', // amber-500
  '#ef4444', // red-500
  '#8b5cf6', // violet-500
  '#0ea5e9', // sky-500
  '#10b981', // emerald-500
  '#f43f5e', // rose-500
  '#eab308', // yellow-500
];

const renderActiveShape = (props: any) => {
  const { cx, cy, innerRadius, outerRadius, startAngle, endAngle, fill, payload, value } = props;

  return (
    <g>
      <text x={cx} y={cy - 10} dy={8} textAnchor="middle" fill={fill} className="text-xl font-bold font-mono">
        {payload.symbol}
      </text>
      <text x={cx} y={cy + 15} dy={8} textAnchor="middle" fill="currentColor" className="text-xs opacity-70 font-mono">
        {(payload.percent * 100).toFixed(1)}%
      </text>
      <Sector
        cx={cx}
        cy={cy}
        innerRadius={innerRadius}
        outerRadius={outerRadius + 8}
        startAngle={startAngle}
        endAngle={endAngle}
        fill={fill}
        className="transition-all duration-300 drop-shadow-md"
      />
    </g>
  );
};

export const AssetAllocationChart = ({ assets, totalValue }: AssetAllocationChartProps) => {
  const [activeIndex, setActiveIndex] = useState(0);

  const data = useMemo(() => {
    if (!assets || assets.length === 0) return [];
    
    // Filter out options as they distort the underlying asset allocation
    const nonOptionAssets = assets.filter(a => {
      const isOption = 
        a.type === 'OPTION' ||
        Boolean(a.strike) ||
        Boolean(a.expiry) ||
        Boolean(a.right) ||
        a.category_id === 'options' ||
        a.category_id === 'options_buy' ||
        a.category_id === 'options_sell' ||
        (typeof a.id === 'string' && a.id.includes('_OPT_'));
      return !isOption;
    });

    if (nonOptionAssets.length === 0) return [];

    // Calculate value for each asset properly using amount, current_price, and multiplier
    const calculatedAssets = nonOptionAssets.map(a => {
      // Avoid NaN issues by defaulting to 0 or 1
      const amt = a.amount || 0;
      const price = a.current_price || 0;
      const mult = a.multiplier || 1;
      
      // Calculate true market value, taking absolute value to handle short positions in the donut chart
      let val = Math.abs(amt * price * mult);
      
      // If there's a pre-calculated market_value property, you can also use that
      if (a.market_value !== undefined) {
        val = Math.abs(a.market_value);
      }
      
      return {
        ...a,
        calculatedValue: val
      };
    });

    const positiveAssets = calculatedAssets.filter(a => a.calculatedValue > 0);
    if (positiveAssets.length === 0) return [];

    // Base the distribution percentages on the actual sum of displayed assets so it sums to 100%
    const totalAllocatedValue = positiveAssets.reduce((sum, item) => sum + item.calculatedValue, 0);
    const denominator = totalAllocatedValue > 0 ? totalAllocatedValue : totalValue;

    // Sort by value descending
    positiveAssets.sort((a, b) => b.calculatedValue - a.calculatedValue);
    
    let chartData = positiveAssets.map(a => {
      return {
        name: a.name || a.symbol,
        symbol: a.symbol,
        value: a.calculatedValue,
        percent: denominator > 0 ? a.calculatedValue / denominator : 0
      };
    });
    
    // Group small assets into "Other" if there are more than 12
    if (chartData.length > 12) {
      const top11 = chartData.slice(0, 11);
      const others = chartData.slice(11);
      const othersValue = others.reduce((sum, item) => sum + item.value, 0);
      
      chartData = [
        ...top11,
        {
          name: 'Other Assets',
          symbol: 'OTHER',
          value: othersValue,
          percent: denominator > 0 ? othersValue / denominator : 0
        }
      ];
    }
    
    return chartData;
  }, [assets, totalValue]);

  if (data.length === 0) return null;

  const onPieEnter = (_: any, index: number) => {
    setActiveIndex(index);
  };

  return (
    <div className="card bg-base-100/50 backdrop-blur-md border border-base-content/5 shadow-sm overflow-hidden mb-6">
      <div className="card-body p-4 md:p-6">
        <div className="flex items-center gap-3 mb-6">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-indigo-500/20 to-purple-500/20 flex items-center justify-center">
            <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 text-indigo-500" viewBox="0 0 20 20" fill="currentColor">
              <path d="M2 11a1 1 0 011-1h2a1 1 0 011 1v5a1 1 0 01-1 1H3a1 1 0 01-1-1v-5zM8 7a1 1 0 011-1h2a1 1 0 011 1v9a1 1 0 01-1 1H9a1 1 0 01-1-1V7zM14 4a1 1 0 011-1h2a1 1 0 011 1v12a1 1 0 01-1 1h-2a1 1 0 01-1-1V4z" />
            </svg>
          </div>
          <div>
            <h2 className="text-xl font-bold tracking-tight">Asset Allocation</h2>
            <p className="text-xs text-base-content/60 font-medium">Portfolio weight distribution</p>
          </div>
        </div>

        <div className="flex flex-col lg:flex-row items-center gap-8 lg:gap-12 w-full">
          {/* Chart Section */}
          <div className="w-full lg:w-1/2 h-[300px] flex items-center justify-center relative">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie
                  {...({ activeIndex, activeShape: renderActiveShape } as any)}
                  data={data}
                  cx="50%"
                  cy="50%"
                  innerRadius={80}
                  outerRadius={110}
                  dataKey="value"
                  onMouseEnter={onPieEnter}
                  stroke="none"
                  paddingAngle={2}
                >
                  {data.map((entry, index) => (
                    <Cell 
                      key={`cell-${index}`} 
                      fill={COLORS[index % COLORS.length]} 
                      className="transition-all duration-300 hover:opacity-80 cursor-pointer"
                    />
                  ))}
                </Pie>
                <Tooltip 
                  formatter={(value: any, name: any, props: any) => [
                    `${(props.payload.percent * 100).toFixed(2)}%`, 
                    props.payload.symbol
                  ]}
                  contentStyle={{
                    backgroundColor: 'rgba(0, 0, 0, 0.8)',
                    borderRadius: '12px',
                    border: 'none',
                    color: '#fff',
                    boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.1), 0 2px 4px -1px rgba(0, 0, 0, 0.06)'
                  }}
                  itemStyle={{ color: '#fff', fontWeight: 'bold' }}
                />
              </PieChart>
            </ResponsiveContainer>
          </div>

          {/* Legend Boxes Section */}
          <div className="w-full lg:w-1/2 grid grid-cols-2 sm:grid-cols-3 gap-3">
            {data.map((entry, index) => (
              <div 
                key={entry.symbol}
                className={`flex flex-col gap-1 p-3 rounded-xl border transition-all duration-300 cursor-pointer ${
                  activeIndex === index 
                    ? 'bg-base-200 border-base-content/20 shadow-sm scale-[1.02]' 
                    : 'bg-base-100/50 border-base-content/5 hover:bg-base-200/50 hover:border-base-content/10'
                }`}
                onMouseEnter={() => setActiveIndex(index)}
              >
                <div className="flex items-center gap-2">
                  <div 
                    className="w-3 h-3 rounded-full shadow-sm" 
                    style={{ backgroundColor: COLORS[index % COLORS.length] }}
                  />
                  <span className="font-bold text-sm truncate" title={entry.name}>
                    {entry.symbol}
                  </span>
                </div>
                <div className="flex items-end justify-between pl-5">
                  <span className="text-xs text-base-content/60 truncate max-w-[60px]" title={entry.name}>
                    {entry.name !== entry.symbol ? entry.name : ''}
                  </span>
                  <span className="font-mono font-medium text-sm">
                    {(entry.percent * 100).toFixed(1)}%
                  </span>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
};
