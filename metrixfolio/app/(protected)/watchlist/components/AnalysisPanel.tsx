'use client';

import { FC, useRef, useState } from 'react';
import { StockAnalysis } from '@/types/watchlist';
import {
  FiTrendingUp,
  FiTrendingDown,
  FiBarChart2,
  FiInfo,
} from 'react-icons/fi';

interface AnalysisPanelProps {
  analyses: StockAnalysis[];
  isLoading: boolean;
}

const fmt = (
  val: number | null,
  opts?: { prefix?: string; suffix?: string; decimals?: number },
) => {
  if (val == null) return '—';
  const d = opts?.decimals ?? 2;
  const num = val.toFixed(d);
  return `${opts?.prefix || ''}${num}${opts?.suffix || ''}`;
};

const fmtCompact = (val: number | null) => {
  if (val == null) return '—';
  const abs = Math.abs(val);
  if (abs >= 1e12) return `$${(val / 1e12).toFixed(2)}T`;
  if (abs >= 1e9) return `$${(val / 1e9).toFixed(2)}B`;
  if (abs >= 1e6) return `$${(val / 1e6).toFixed(2)}M`;
  if (abs >= 1e3) return `$${(val / 1e3).toFixed(1)}K`;
  return `$${val.toFixed(2)}`;
};

const fmtVolume = (val: number | null) => {
  if (val == null) return '—';
  if (val >= 1e6) return `${(val / 1e6).toFixed(2)}M`;
  if (val >= 1e3) return `${(val / 1e3).toFixed(1)}K`;
  return val.toString();
};

const fmtPct = (val: number | null) => {
  if (val == null) return '—';
  return `${(val * 100).toFixed(2)}%`;
};

const fmtDate = (dateStr: string) => {
  if (!dateStr) return '';
  const [y, m, d] = dateStr.split('-');
  if (!y || !m || !d) return dateStr;
  return `${d}.${m}.${y}`;
};

const MetricCard: FC<{ label: string; value: string; color?: string }> = ({
  label,
  value,
  color,
}) => (
  <div className="bg-base-200 flex flex-col items-center rounded-lg px-3 py-2">
    <span className="text-[10px] font-medium tracking-wide uppercase opacity-50">
      {label}
    </span>
    <span className={`text-sm font-bold ${color || ''}`}>{value}</span>
  </div>
);

export const AnalysisPanel: FC<AnalysisPanelProps> = ({
  analyses,
  isLoading,
}) => {
  const modalRef = useRef<HTMLDialogElement>(null);
  const [selectedDay, setSelectedDay] = useState<StockAnalysis | null>(null);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-4">
        <span className="loading loading-dots loading-sm text-primary"></span>
      </div>
    );
  }

  if (analyses.length === 0) {
    return (
      <p className="py-2 text-center text-sm opacity-40">
        No analysis data available yet.
      </p>
    );
  }

  const latest = analyses[0];
  const prev = analyses[1];

  const priceChange =
    latest.last_price != null && prev?.close_price != null
      ? latest.last_price - prev.close_price
      : null;
  const priceChangePct =
    priceChange != null && prev?.close_price
      ? (priceChange / prev.close_price) * 100
      : null;

  const openModal = (day: StockAnalysis) => {
    setSelectedDay(day);
    modalRef.current?.showModal();
  };

  return (
    <>
      {/* Detail Modal */}
      <dialog ref={modalRef} className="modal modal-bottom sm:modal-middle">
        <div className="modal-box max-w-2xl">
          {selectedDay && (
            <>
              <h3 className="mb-4 flex items-center gap-2 text-lg font-bold">
                <FiBarChart2 className="text-primary" />
                {selectedDay.symbol} — {fmtDate(selectedDay.date)}
              </h3>

              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                {/* Trading */}
                <div className="border-base-300 rounded-lg border p-3">
                  <h4 className="mb-2 text-xs font-bold tracking-wide uppercase opacity-60">
                    Trading
                  </h4>
                  <div className="grid grid-cols-2 gap-2 text-sm">
                    <div>
                      <span className="opacity-50">Open:</span>{' '}
                      {fmt(selectedDay.open, { prefix: '$' })}
                    </div>
                    <div>
                      <span className="opacity-50">Close:</span>{' '}
                      {fmt(selectedDay.close_price, { prefix: '$' })}
                    </div>
                    <div>
                      <span className="opacity-50">High:</span>{' '}
                      {fmt(selectedDay.high, { prefix: '$' })}
                    </div>
                    <div>
                      <span className="opacity-50">Low:</span>{' '}
                      {fmt(selectedDay.low, { prefix: '$' })}
                    </div>
                    <div>
                      <span className="opacity-50">Last:</span>{' '}
                      {fmt(selectedDay.last_price, { prefix: '$' })}
                    </div>
                    <div>
                      <span className="opacity-50">Volume:</span>{' '}
                      {fmtVolume(selectedDay.volume)}
                    </div>
                    <div>
                      <span className="opacity-50">Avg Vol:</span>{' '}
                      {fmtVolume(selectedDay.avg_volume)}
                    </div>
                    <div>
                      <span className="opacity-50">52W H:</span>{' '}
                      {fmt(selectedDay.week52_high, { prefix: '$' })}
                    </div>
                    <div>
                      <span className="opacity-50">52W L:</span>{' '}
                      {fmt(selectedDay.week52_low, { prefix: '$' })}
                    </div>
                  </div>
                </div>

                {/* Valuation */}
                <div className="border-base-300 rounded-lg border p-3">
                  <h4 className="mb-2 text-xs font-bold tracking-wide uppercase opacity-60">
                    Valuation
                  </h4>
                  <div className="grid grid-cols-2 gap-2 text-sm">
                    <div>
                      <span className="opacity-50">Mkt Cap:</span>{' '}
                      {fmtCompact(selectedDay.market_cap)}
                    </div>
                    <div>
                      <span className="opacity-50">P/E:</span>{' '}
                      {fmt(selectedDay.pe)}
                    </div>
                    <div>
                      <span className="opacity-50">Fwd P/E:</span>{' '}
                      {fmt(selectedDay.forward_pe)}
                    </div>
                    <div>
                      <span className="opacity-50">PEG:</span>{' '}
                      {fmt(selectedDay.peg)}
                    </div>
                    <div>
                      <span className="opacity-50">EV/EBITDA:</span>{' '}
                      {fmt(selectedDay.ev_to_ebitda)}
                    </div>
                    <div>
                      <span className="opacity-50">EV/Rev:</span>{' '}
                      {fmt(selectedDay.ev_to_revenue)}
                    </div>
                    <div>
                      <span className="opacity-50">EPS:</span>{' '}
                      {fmt(selectedDay.eps, { prefix: '$' })}
                    </div>
                    <div>
                      <span className="opacity-50">Fwd EPS:</span>{' '}
                      {fmt(selectedDay.forward_eps, { prefix: '$' })}
                    </div>
                  </div>
                </div>

                {/* Profitability */}
                <div className="border-base-300 rounded-lg border p-3">
                  <h4 className="mb-2 text-xs font-bold tracking-wide uppercase opacity-60">
                    Profitability
                  </h4>
                  <div className="grid grid-cols-2 gap-2 text-sm">
                    <div>
                      <span className="opacity-50">Gross:</span>{' '}
                      {fmtPct(selectedDay.gross_margin)}
                    </div>
                    <div>
                      <span className="opacity-50">Operating:</span>{' '}
                      {fmt(selectedDay.operating_margin, { suffix: '%' })}
                    </div>
                    <div>
                      <span className="opacity-50">Profit:</span>{' '}
                      {fmt(selectedDay.profit_margin, { suffix: '%' })}
                    </div>
                    <div>
                      <span className="opacity-50">ROE:</span>{' '}
                      {fmtPct(selectedDay.roe)}
                    </div>
                    <div>
                      <span className="opacity-50">ROA:</span>{' '}
                      {fmtPct(selectedDay.roa)}
                    </div>
                    <div>
                      <span className="opacity-50">FCF:</span>{' '}
                      {fmtCompact(selectedDay.free_cashflow)}
                    </div>
                  </div>
                </div>

                {/* Growth & Risk */}
                <div className="border-base-300 rounded-lg border p-3">
                  <h4 className="mb-2 text-xs font-bold tracking-wide uppercase opacity-60">
                    Growth & Risk
                  </h4>
                  <div className="grid grid-cols-2 gap-2 text-sm">
                    <div>
                      <span className="opacity-50">Rev Growth:</span>{' '}
                      {fmt(selectedDay.revenue_growth, { suffix: '%' })}
                    </div>
                    <div>
                      <span className="opacity-50">Earn Growth:</span>{' '}
                      {fmt(selectedDay.earnings_growth, { suffix: '%' })}
                    </div>
                    <div>
                      <span className="opacity-50">Beta:</span>{' '}
                      {fmt(selectedDay.beta)}
                    </div>
                    <div>
                      <span className="opacity-50">D/E:</span>{' '}
                      {fmt(selectedDay.de_ratio)}
                    </div>
                    <div>
                      <span className="opacity-50">Current:</span>{' '}
                      {fmt(selectedDay.current_ratio)}
                    </div>
                    <div>
                      <span className="opacity-50">Short Ratio:</span>{' '}
                      {fmt(selectedDay.short_ratio)}
                    </div>
                    <div>
                      <span className="opacity-50">Div Yield:</span>{' '}
                      {fmtPct(selectedDay.dividend_yield)}
                    </div>
                    <div>
                      <span className="opacity-50">Payout:</span>{' '}
                      {fmt(selectedDay.payout_ratio, { suffix: '%' })}
                    </div>
                    <div>
                      <span className="opacity-50">RSI:</span>{' '}
                      <span
                        className={
                          selectedDay.rsi != null
                            ? selectedDay.rsi < 30
                              ? 'text-success font-bold'
                              : selectedDay.rsi > 70
                                ? 'text-error font-bold'
                                : ''
                            : ''
                        }
                      >
                        {fmt(selectedDay.rsi, { decimals: 1 })}
                        {selectedDay.rsi != null &&
                        selectedDay.rsi < 30 &&
                        selectedDay.iv != null &&
                        selectedDay.iv > 90
                          ? ' 🔥'
                          : ''}
                      </span>
                    </div>
                    <div>
                      <span className="opacity-50">IV:</span>{' '}
                      <span
                        className={
                          selectedDay.iv != null && selectedDay.iv > 90
                            ? 'text-warning font-bold'
                            : ''
                        }
                      >
                        {fmt(selectedDay.iv, { decimals: 1, suffix: '%' })}
                        {selectedDay.rsi != null &&
                        selectedDay.rsi < 30 &&
                        selectedDay.iv != null &&
                        selectedDay.iv > 90
                          ? ' 🔥'
                          : ''}
                      </span>
                    </div>
                  </div>
                </div>
              </div>
            </>
          )}
          <div className="modal-action">
            <form method="dialog">
              <button className="btn btn-ghost">Close</button>
            </form>
          </div>
        </div>
        <form method="dialog" className="modal-backdrop">
          <button>close</button>
        </form>
      </dialog>

      {/* Latest Day Summary Stats */}
      <div className="mb-3">
        <div className="flex flex-wrap gap-2">
          <MetricCard
            label="Price"
            value={fmt(latest.last_price, { prefix: '$' })}
            color={
              priceChange != null
                ? priceChange >= 0
                  ? 'text-success'
                  : 'text-error'
                : ''
            }
          />
          {priceChangePct != null && (
            <MetricCard
              label="Change"
              value={`${priceChange! >= 0 ? '+' : ''}${priceChangePct.toFixed(2)}%`}
              color={priceChange! >= 0 ? 'text-success' : 'text-error'}
            />
          )}
          <MetricCard label="Mkt Cap" value={fmtCompact(latest.market_cap)} />
          <MetricCard label="P/E" value={fmt(latest.pe)} />
          <MetricCard label="Beta" value={fmt(latest.beta)} />
          <MetricCard
            label="RSI"
            value={`${fmt(latest.rsi, { decimals: 1 })}${latest.rsi != null && latest.rsi < 30 && latest.iv != null && latest.iv > 90 ? ' 🔥' : ''}`}
            color={
              latest.rsi != null
                ? latest.rsi < 30
                  ? 'text-success'
                  : latest.rsi > 70
                    ? 'text-error'
                    : ''
                : ''
            }
          />
          <MetricCard
            label="IV"
            value={`${fmt(latest.iv, { decimals: 1, suffix: '%' })}${latest.rsi != null && latest.rsi < 30 && latest.iv != null && latest.iv > 90 ? ' 🔥' : ''}`}
            color={latest.iv != null && latest.iv > 90 ? 'text-warning' : ''}
          />
          <MetricCard
            label="52W Range"
            value={`${fmt(latest.week52_low, { prefix: '$', decimals: 0 })} – ${fmt(latest.week52_high, { prefix: '$', decimals: 0 })}`}
          />
        </div>
      </div>

      {/* Recent History Table */}
      <div className="overflow-x-auto">
        <table className="table-xs table">
          <thead>
            <tr>
              <th>Date</th>
              <th>Close</th>
              <th>High</th>
              <th>Low</th>
              <th>Volume</th>
              <th>Mkt Cap</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {analyses.map((day, idx) => {
              const prevDay = analyses[idx + 1];
              const dayChange =
                day.close_price != null && prevDay?.close_price != null
                  ? day.close_price - prevDay.close_price
                  : null;

              return (
                <tr
                  key={day.date}
                  className="hover cursor-pointer"
                  onClick={() => openModal(day)}
                >
                  <td className="font-mono text-xs">{fmtDate(day.date)}</td>
                  <td className="font-mono">
                    <span
                      className={
                        dayChange != null
                          ? dayChange >= 0
                            ? 'text-success'
                            : 'text-error'
                          : ''
                      }
                    >
                      {fmt(day.close_price, { prefix: '$' })}
                    </span>
                  </td>
                  <td className="font-mono">
                    {fmt(day.high, { prefix: '$' })}
                  </td>
                  <td className="font-mono">{fmt(day.low, { prefix: '$' })}</td>
                  <td className="font-mono">{fmtVolume(day.volume)}</td>
                  <td className="font-mono">{fmtCompact(day.market_cap)}</td>
                  <td>
                    <button
                      className="btn btn-ghost btn-xs"
                      title="View details"
                    >
                      <FiInfo className="h-3 w-3" />
                    </button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </>
  );
};
