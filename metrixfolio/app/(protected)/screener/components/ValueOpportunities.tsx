'use client';

import useSWR from 'swr';
import { getValueOpportunitiesAction } from '@/actions/screener';
import Link from 'next/link';

function formatCurrency(value: number) {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
  }).format(value);
}

export default function ValueOpportunities() {
  const { data, isLoading } = useSWR(
    'value-opportunities',
    async () => {
      const ops = await getValueOpportunitiesAction();
      return Array.isArray(ops) ? ops : [];
    },
    { revalidateOnFocus: true }
  );

  if (isLoading) {
    return (
      <div className="flex justify-center p-8">
        <span className="loading loading-spinner text-primary"></span>
      </div>
    );
  }

  const ops = data || [];

  if (ops.length === 0) {
    return (
      <div className="alert alert-info shadow-lg mt-4">
        <span>No value opportunities found today.</span>
      </div>
    );
  }

  return (
    <div className="mt-8">
      <h2 className="text-2xl font-bold mb-4">Value & Growth Opportunities</h2>
      <p className="text-sm opacity-70 mb-6">Stocks with consistent 5-year growth, strong profitability, and current price disconnects.</p>

      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
        {ops.map((op: any, i: number) => {
          const discount = op.target_mean_price && op.last_price 
            ? ((op.target_mean_price - op.last_price) / op.target_mean_price) * 100 
            : null;
            
          return (
            <Link key={op.symbol + i} href={`/search?q=${op.symbol}`}>
              <div className="card bg-base-100 shadow-xl hover:scale-[1.02] transition-transform cursor-pointer border border-base-200">
                <div className="card-body p-5">
                  <div className="flex justify-between items-start mb-2">
                    <div>
                      <h3 className="card-title text-xl font-black">{op.symbol}</h3>
                      <div className="badge badge-primary badge-sm">Score: {op.score}</div>
                    </div>
                    <div className="text-right">
                      <div className="text-lg font-bold">{formatCurrency(op.last_price || 0)}</div>
                      {op.target_mean_price && (
                        <div className="text-xs opacity-70">Target: {formatCurrency(op.target_mean_price)}</div>
                      )}
                    </div>
                  </div>

                  {discount !== null && discount > 0 && (
                    <div className="alert alert-success shadow-sm p-2 mb-3">
                      <span className="text-xs font-bold">{discount.toFixed(1)}% Below Target Price</span>
                    </div>
                  )}

                  <div className="grid grid-cols-2 gap-y-3 gap-x-2 mt-2">
                    <div>
                      <div className="text-[10px] opacity-70 uppercase font-bold tracking-wider">5y Rev CAGR</div>
                      <div className={`font-mono text-sm ${(op.revenue_cagr_5y || 0) > 0 ? 'text-success' : 'text-error'}`}>
                        {op.revenue_cagr_5y ? (op.revenue_cagr_5y * 100).toFixed(1) + '%' : 'N/A'}
                      </div>
                    </div>
                    <div>
                      <div className="text-[10px] opacity-70 uppercase font-bold tracking-wider">5y Net Inc CAGR</div>
                      <div className={`font-mono text-sm ${(op.net_income_cagr_5y || 0) > 0 ? 'text-success' : 'text-error'}`}>
                        {op.net_income_cagr_5y ? (op.net_income_cagr_5y * 100).toFixed(1) + '%' : 'N/A'}
                      </div>
                    </div>
                    <div>
                      <div className="text-[10px] opacity-70 uppercase font-bold tracking-wider">Fwd Rev Gr</div>
                      <div className={`font-mono text-sm ${(op.revenue_growth_fwd || 0) > 0 ? 'text-success' : 'text-error'}`}>
                        {op.revenue_growth_fwd ? (op.revenue_growth_fwd * 100).toFixed(1) + '%' : 'N/A'}
                      </div>
                    </div>
                    <div>
                      <div className="text-[10px] opacity-70 uppercase font-bold tracking-wider">Fwd EPS Gr</div>
                      <div className={`font-mono text-sm ${(op.earnings_growth_fwd || 0) > 0 ? 'text-success' : 'text-error'}`}>
                        {op.earnings_growth_fwd ? (op.earnings_growth_fwd * 100).toFixed(1) + '%' : 'N/A'}
                      </div>
                    </div>
                    <div>
                      <div className="text-[10px] opacity-70 uppercase font-bold tracking-wider">ROIC</div>
                      <div className="font-mono text-sm font-semibold">
                        {op.roic ? (op.roic * 100).toFixed(1) + '%' : 'N/A'}
                      </div>
                    </div>
                    <div>
                      <div className="text-[10px] opacity-70 uppercase font-bold tracking-wider">RSI</div>
                      <div className={`font-mono text-sm ${(op.rsi || 50) < 40 ? 'text-error font-bold' : ''}`}>
                        {op.rsi ? op.rsi.toFixed(1) : 'N/A'}
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </Link>
          );
        })}
      </div>
    </div>
  );
}
