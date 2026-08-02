import React from 'react';
import { LineChart, Line, YAxis, Tooltip, ResponsiveContainer } from 'recharts';

interface SparklineChartProps {
  data: any[];
  width: number;
  domainMin: number;
  domainMax: number;
  color: string;
  formatValue?: (val: any) => string;
}

export default function SparklineChart({ data, width, domainMin, domainMax, color, formatValue }: SparklineChartProps) {
  return (
    <ResponsiveContainer width={width} height={36}>
      <LineChart data={data} margin={{ top: 2, right: 2, left: 2, bottom: 2 }}>
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
          itemStyle={{ color: '#fff', padding: 0 }}
          labelStyle={{ display: 'none' }}
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
    </ResponsiveContainer>
  );
}
