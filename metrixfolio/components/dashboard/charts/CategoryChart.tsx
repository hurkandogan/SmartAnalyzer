import React from 'react';
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  CartesianGrid,
} from 'recharts';
import { formatCurrency } from '@/utils/functions';

interface CategoryChartProps {
  chartData: any[];
  color: string;
}

export default function CategoryChart({ chartData, color }: CategoryChartProps) {
  return (
    <ResponsiveContainer width="100%" height="100%">
      <LineChart data={chartData}>
        <CartesianGrid
          strokeDasharray="3 3"
          vertical={false}
          opacity={0.3}
        />
        <XAxis
          dataKey="date"
          tick={{ fontSize: 12 }}
          minTickGap={30}
        />
        <YAxis
          tick={{ fontSize: 12 }}
          tickFormatter={(val) => `$${val}`}
          width={60}
        />
        <Tooltip
          formatter={(value: any) => [
            formatCurrency(value),
            'Value',
          ]}
          labelStyle={{ color: 'black' }}
        />
        <Line
          type="monotone"
          dataKey="value"
          stroke={color || '#3ABFF8'}
          strokeWidth={3}
          dot={false}
          activeDot={{ r: 6 }}
        />
      </LineChart>
    </ResponsiveContainer>
  );
}
