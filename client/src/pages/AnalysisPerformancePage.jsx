import { useState, useEffect, useMemo, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  TrendingUp,
  TrendingDown,
  Award,
  AlertTriangle,
  BarChart3,
  Activity,
  Search,
  Layers,
  Calendar,
  ExternalLink,
  X,
  Sparkles,
  Flame,
  Clock,
  Target,
  Zap,
  RefreshCw,
  Briefcase,
  DollarSign,
} from 'lucide-react';
import {
  createChart,
  CandlestickSeries,
  LineSeries,
  createSeriesMarkers,
  ColorType,
  LineStyle,
  CrosshairMode,
} from 'lightweight-charts';

const HORIZON_CONFIG = [
  { key: '3d', label: '3 Days (3D)', short: '3D', days: 3, desc: 'First 3 trading days post-signal' },
  { key: '1w', label: '1 Week (1W)', short: '1W', days: 5, desc: '5 trading days post-signal' },
  { key: '1m', label: '1 Month (1M)', short: '1M', days: 21, desc: '21 trading days post-signal' },
  { key: '3m', label: '3 Months (3M)', short: '3M', days: 63, desc: '63 trading days post-signal' },
  { key: 'overall', label: 'Overall (Max 3M)', short: 'Overall', days: 63, desc: 'Overall tracking up to 63 trading days' },
];

const RETURN_BUCKETS = [
  { id: 'super_win', label: '🚀 Outlier Winner (≥ +20%)', short: '≥ +20%', min: 20, max: Infinity, color: 'bg-emerald-400', text: 'text-emerald-300', border: 'border-emerald-500/30', bgSoft: 'bg-emerald-500/15' },
  { id: 'strong_win', label: '🔥 Strong Winner (+10% .. +20%)', short: '+10% .. +20%', min: 10, max: 20, color: 'bg-emerald-500', text: 'text-emerald-400', border: 'border-emerald-500/25', bgSoft: 'bg-emerald-500/10' },
  { id: 'mod_win', label: '✅ Positive (+3% .. +10%)', short: '+3% .. +10%', min: 3, max: 10, color: 'bg-teal-500', text: 'text-teal-300', border: 'border-teal-500/25', bgSoft: 'bg-teal-500/10' },
  { id: 'flat', label: '➖ Flat / Neutral (-3% .. +3%)', short: '-3% .. +3%', min: -3, max: 3, color: 'bg-slate-400', text: 'text-slate-300', border: 'border-white/15', bgSoft: 'bg-white/5' },
  { id: 'mod_loss', label: '⚠️ Pullback (-10% .. -3%)', short: '-10% .. -3%', min: -10, max: -3, color: 'bg-amber-500', text: 'text-amber-300', border: 'border-amber-500/25', bgSoft: 'bg-amber-500/10' },
  { id: 'big_loss', label: '🛑 Deep Loss (< -10%)', short: '< -10%', min: -Infinity, max: -10, color: 'bg-rose-500', text: 'text-rose-400', border: 'border-rose-500/30', bgSoft: 'bg-rose-500/15' },
];

function formatPct(val, showPlus = true) {
  if (val === null || val === undefined || Number.isNaN(val)) return '—';
  const num = Number(val);
  const sign = showPlus && num > 0 ? '+' : '';
  return `${sign}${num.toFixed(2)}%`;
}

function formatUsd(val, showPlus = false) {
  if (val === null || val === undefined || Number.isNaN(Number(val))) return '$0.00';
  const num = Number(val);
  const sign = num < 0 ? '-' : showPlus && num > 0 ? '+' : '';
  return `${sign}$${Math.abs(num).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function MyTradeBadge({ myTrade }) {
  if (!myTrade) return null;
  const pnl = Number(myTrade.total_pnl_usd || 0);
  const pct = Number(myTrade.total_return_pct || 0);
  const isPositive = pnl >= 0;

  if (myTrade.has_open) {
    return (
      <span
        className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] font-mono font-bold border ${
          isPositive
            ? 'bg-indigo-500/25 text-indigo-200 border-indigo-400/40'
            : 'bg-amber-500/25 text-amber-200 border-amber-400/40'
        }`}
        title={`Open Swing Position (${myTrade.remaining_shares} sh @ $${myTrade.entry_price}) • Realized: ${formatUsd(myTrade.realized_pnl_usd, true)} • Unrealized: ${formatUsd(myTrade.unrealized_pnl_usd, true)}`}
      >
        <span>📌 Open: {formatUsd(pnl, true)} ({formatPct(pct)})</span>
      </span>
    );
  }

  return (
    <span
      className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] font-mono font-bold border ${
        isPositive
          ? 'bg-emerald-500/25 text-emerald-200 border-emerald-400/40 shadow-xs'
          : 'bg-rose-500/25 text-rose-200 border-rose-400/40'
      }`}
      title={`Closed Swing Trade • Total Realized P&L: ${formatUsd(pnl, true)} (${formatPct(pct)})`}
    >
      <span>{isPositive ? '💰 Profit:' : '🛑 Loss:'} {formatUsd(pnl, true)} ({formatPct(pct)})</span>
    </span>
  );
}

function getPctColor(val) {
  if (val === null || val === undefined || Number.isNaN(val)) return 'text-white/30';
  if (val >= 15) return 'text-emerald-300 font-bold';
  if (val >= 5) return 'text-emerald-400 font-semibold';
  if (val > 0) return 'text-emerald-400/80';
  if (val === 0) return 'text-white/60';
  if (val <= -10) return 'text-rose-400 font-bold';
  if (val <= -5) return 'text-rose-400 font-semibold';
  return 'text-rose-400/80';
}

function getEpisodeHorizonValue(ep, horizonKey, returnMode, includePartial) {
  if (!ep) return null;
  if (horizonKey === 'overall') {
    return returnMode === 'peak' ? ep.mfe : ep.current_return;
  }
  const h = ep.horizons?.[horizonKey];
  if (!h) return null;
  if (returnMode === 'peak') {
    if (!includePartial && !h.completed) return null;
    return h.max_gain;
  }
  if (h.completed) return h.close_return;
  if (includePartial && h.days_available > 0) return h.to_date_return;
  return null;
}

function computeGroupStats(episodes, horizonKey, returnMode, includePartial) {
  const valid = [];
  const mfeList = [];
  const maeList = [];
  const ddList = [];

  for (const ep of episodes) {
    const val = getEpisodeHorizonValue(ep, horizonKey, returnMode, includePartial);
    if (val !== null && val !== undefined && !Number.isNaN(val)) {
      valid.push(val);
    }

    // Horizon-specific peak gain and drawdown
    if (horizonKey === 'overall') {
      if (ep.mfe !== null && ep.mfe !== undefined) mfeList.push(ep.mfe);
      if (ep.mae !== null && ep.mae !== undefined) {
        maeList.push(ep.mae);
        ddList.push(ep.mae);
      }
    } else {
      const h = ep.horizons?.[horizonKey];
      if (h) {
        if (h.max_gain !== null && h.max_gain !== undefined && (includePartial || h.completed)) {
          mfeList.push(h.max_gain);
        }
        if (h.max_dd !== null && h.max_dd !== undefined && (includePartial || h.completed)) {
          maeList.push(h.max_dd);
          ddList.push(h.max_dd);
        }
      }
    }
  }

  const count = valid.length;
  if (count === 0) {
    return {
      totalEpisodes: episodes.length,
      evaluatedCount: 0,
      winRate: 0,
      avgReturn: 0,
      medianReturn: 0,
      hit10Rate: 0,
      hit20Rate: 0,
      loss5Rate: 0,
      loss10Rate: 0,
      avgMfe: 0,
      avgMae: 0,
      buckets: RETURN_BUCKETS.map((b) => ({ ...b, count: 0, pct: 0 })),
    };
  }

  const sorted = [...valid].sort((a, b) => a - b);
  const sum = valid.reduce((a, b) => a + b, 0);
  const avgReturn = sum / count;
  const mid = Math.floor(count / 2);
  const medianReturn = count % 2 !== 0 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;

  const wins = valid.filter((v) => v > 0).length;
  const hit10 = valid.filter((v) => v >= 10).length;
  const hit20 = valid.filter((v) => v >= 20).length;

  // In Peak Gain mode, losses are evaluated by maximum drawdown (dip) during the period
  // In Close Return mode, losses are evaluated by period-end close return
  const loss5 =
    returnMode === 'peak'
      ? ddList.filter((d) => d <= -5).length
      : valid.filter((v) => v <= -5).length;
  const loss10 =
    returnMode === 'peak'
      ? ddList.filter((d) => d <= -10).length
      : valid.filter((v) => v <= -10).length;

  const avgMfe = mfeList.length > 0 ? mfeList.reduce((a, b) => a + b, 0) / mfeList.length : 0;
  const avgMae = maeList.length > 0 ? maeList.reduce((a, b) => a + b, 0) / maeList.length : 0;

  const buckets = RETURN_BUCKETS.map((b) => {
    const c = valid.filter((v) => {
      if (b.id === 'super_win') return v >= 20;
      if (b.id === 'big_loss') return v < -10;
      return v >= b.min && v < b.max;
    }).length;
    return {
      ...b,
      count: c,
      pct: (c / count) * 100,
    };
  });

  return {
    totalEpisodes: episodes.length,
    evaluatedCount: count,
    winRate: (wins / count) * 100,
    avgReturn,
    medianReturn,
    hit10Rate: (hit10 / count) * 100,
    hit20Rate: (hit20 / count) * 100,
    hit10Count: hit10,
    hit20Count: hit20,
    loss5Rate: (loss5 / count) * 100,
    loss10Rate: (loss10 / count) * 100,
    loss10Count: loss10,
    avgMfe,
    avgMae,
    buckets,
  };
}

function EpisodeChartModal({ episode, allSymbolEpisodes, onClose, navigate }) {
  const dialogRef = useRef(null);
  const chartContainerRef = useRef(null);
  const [chartData, setChartData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [showMA, setShowMA] = useState(true);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (dialog && !dialog.open) {
      dialog.showModal();
    }
  }, []);

  useEffect(() => {
    let active = true;
    async function loadSymbolChart() {
      if (!episode?.symbol) return;
      try {
        setLoading(true);
        const res = await fetch(`/api/analysis/performance/${episode.symbol}`);
        if (!res.ok) throw new Error('Failed to load chart data');
        const json = await res.json();
        if (active) setChartData(json);
      } catch (err) {
        console.error(err);
      } finally {
        if (active) setLoading(false);
      }
    }
    loadSymbolChart();
    return () => {
      active = false;
    };
  }, [episode]);

  useEffect(() => {
    if (!chartData?.candles?.length || !chartContainerRef.current) return;

    const container = chartContainerRef.current;
    container.innerHTML = '';

    const chart = createChart(container, {
      width: container.clientWidth || 800,
      height: 400,
      layout: {
        background: { type: ColorType.Solid, color: '#0b0b10' },
        textColor: 'rgba(255, 255, 255, 0.65)',
      },
      grid: {
        vertLines: { color: 'rgba(255, 255, 255, 0.04)' },
        horzLines: { color: 'rgba(255, 255, 255, 0.04)' },
      },
      crosshair: {
        mode: CrosshairMode.Normal,
      },
      rightPriceScale: {
        borderColor: 'rgba(255, 255, 255, 0.1)',
      },
      timeScale: {
        borderColor: 'rgba(255, 255, 255, 0.1)',
        timeVisible: false,
      },
    });

    const candleSeries = chart.addSeries(CandlestickSeries, {
      upColor: '#10b981',
      downColor: '#f43f5e',
      borderVisible: false,
      wickUpColor: '#10b981',
      wickDownColor: '#f43f5e',
    });

    const formattedCandles = chartData.candles.map((c) => ({
      time: c.date,
      open: c.open,
      high: c.high,
      low: c.low,
      close: c.close,
    }));
    candleSeries.setData(formattedCandles);

    if (showMA) {
      const ema10Data = chartData.candles
        .filter((c) => c.ema_10 !== null)
        .map((c) => ({ time: c.date, value: c.ema_10 }));
      const ema20Data = chartData.candles
        .filter((c) => c.ema_20 !== null)
        .map((c) => ({ time: c.date, value: c.ema_20 }));
      const sma50Data = chartData.candles
        .filter((c) => c.sma_50 !== null)
        .map((c) => ({ time: c.date, value: c.sma_50 }));

      if (ema10Data.length > 0) {
        const s10 = chart.addSeries(LineSeries, {
          color: '#38bdf8',
          lineWidth: 1,
          priceLineVisible: false,
          lastValueVisible: false,
        });
        s10.setData(ema10Data);
      }
      if (ema20Data.length > 0) {
        const s20 = chart.addSeries(LineSeries, {
          color: '#a855f7',
          lineWidth: 1,
          priceLineVisible: false,
          lastValueVisible: false,
        });
        s20.setData(ema20Data);
      }
      if (sma50Data.length > 0) {
        const s50 = chart.addSeries(LineSeries, {
          color: '#f59e0b',
          lineWidth: 2,
          priceLineVisible: false,
          lastValueVisible: false,
        });
        s50.setData(sma50Data);
      }
    }

    // Add Entry Price line
    if (episode.entry_price) {
      candleSeries.createPriceLine({
        price: episode.entry_price,
        color: '#6366f1',
        lineWidth: 2,
        lineStyle: LineStyle.Dashed,
        axisLabelVisible: true,
        title: `Entry: $${episode.entry_price}`,
      });
    }

    // Build markers for the active episode signals + other episodes of the same symbol
    const candleDatesSet = new Set(formattedCandles.map((c) => c.time));
    const findClosestCandleDate = (targetDate) => {
      if (candleDatesSet.has(targetDate)) return targetDate;
      const after = formattedCandles.find((c) => c.time >= targetDate);
      if (after) return after.time;
      return formattedCandles[formattedCandles.length - 1]?.time;
    };

    const markersMap = new Map();
    for (const otherEp of allSymbolEpisodes || []) {
      const isCurrent = otherEp.id === episode.id;
      otherEp.signals.forEach((sig, idx) => {
        const cDate = findClosestCandleDate(sig.date);
        if (!cDate) return;
        const isFirst = idx === 0;
        const isCandidate = sig.status === 'candidate';
        markersMap.set(`${cDate}-${otherEp.id}`, {
          time: cDate,
          position: 'belowBar',
          color: isCurrent
            ? isCandidate
              ? '#10b981'
              : '#f59e0b'
            : 'rgba(148, 163, 184, 0.5)',
          shape: isFirst ? 'arrowUp' : 'circle',
          text: isFirst
            ? `Wave #${otherEp.episode_number} (${sig.status === 'candidate' ? 'CAND' : 'WATCH'} ${sig.score})`
            : isCurrent
              ? `${sig.score}`
              : '',
        });
      });
    }

    // Highlight MFE Peak date if available
    if (episode.mfe_date && episode.mfe > 0 && candleDatesSet.has(episode.mfe_date)) {
      markersMap.set(`${episode.mfe_date}-mfe`, {
        time: episode.mfe_date,
        position: 'aboveBar',
        color: '#34d399',
        shape: 'arrowDown',
        text: `Peak +${episode.mfe}% (${episode.mfe_days}d)`,
      });
    }

    const sortedMarkers = [...markersMap.values()].sort((a, b) => a.time.localeCompare(b.time));
    createSeriesMarkers(candleSeries, sortedMarkers);

    // Focus visible range around the episode
    const startIdx = formattedCandles.findIndex((c) => c.time >= episode.base_candle_date);
    if (startIdx !== -1) {
      const fromIdx = Math.max(0, startIdx - 25);
      const toIdx = Math.min(formattedCandles.length - 1, startIdx + 55);
      chart.timeScale().setVisibleRange({
        from: formattedCandles[fromIdx].time,
        to: formattedCandles[toIdx].time,
      });
    } else {
      chart.timeScale().fitContent();
    }

    const handleResize = () => {
      if (container) {
        chart.applyOptions({ width: container.clientWidth });
      }
    };
    window.addEventListener('resize', handleResize);
    return () => {
      window.removeEventListener('resize', handleResize);
      chart.remove();
    };
  }, [chartData, episode, allSymbolEpisodes, showMA]);

  if (!episode) return null;

  const r = episode.initial_reason || {};

  return (
    <dialog
      ref={dialogRef}
      closedby="any"
      onClose={onClose}
      className="backdrop:bg-black/80 backdrop:backdrop-blur-sm bg-transparent p-0 m-auto max-w-5xl w-[95vw] rounded-2xl border border-white/15 shadow-2xl text-white overflow-hidden"
    >
      <div className="bg-[#0d0d12] flex flex-col max-h-[90vh]">
        {/* Modal Header */}
        <div className="flex flex-wrap items-center justify-between gap-4 px-6 py-4 border-b border-white/10 bg-white/[0.02]">
          <div className="flex items-center gap-3">
            <span className="text-2xl font-black tracking-tight text-white">{episode.symbol}</span>
            <span className="px-2.5 py-1 rounded-lg text-xs font-bold bg-indigo-500/20 text-indigo-300 border border-indigo-500/30">
              Wave #{episode.episode_number} / {episode.total_episodes_for_symbol}
            </span>
            <span
              className={`px-2.5 py-1 rounded-lg text-xs font-bold uppercase ${
                episode.peak_status === 'candidate'
                  ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30'
                  : 'bg-amber-500/20 text-amber-300 border border-amber-500/30'
              }`}
            >
              {episode.peak_status} (Max Score: {episode.max_score})
            </span>
            {r.is_tight && (
              <span className="px-2.5 py-1 rounded-lg text-xs font-semibold bg-teal-500/15 text-teal-300 border border-teal-500/25">
                Tight Flag ✅
              </span>
            )}
            {r.is_dry && (
              <span className="px-2.5 py-1 rounded-lg text-xs font-semibold bg-sky-500/15 text-sky-300 border border-sky-500/25">
                Vol Dry-Up ✅
              </span>
            )}
            <span className="text-xs text-white/50 hidden sm:inline">
              {episode.sector} • {episode.market_cap_bucket}
            </span>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={() => navigate(`/analysis/${episode.symbol}`)}
              className="px-3 py-1.5 rounded-lg bg-white/5 hover:bg-white/10 border border-white/10 text-xs font-semibold text-white/80 flex items-center gap-1.5 transition-colors cursor-pointer"
            >
              <span>Full Analysis History</span>
              <ExternalLink size={13} />
            </button>
            <button
              onClick={onClose}
              className="p-1.5 rounded-lg bg-white/5 hover:bg-rose-500/20 text-white/60 hover:text-rose-300 transition-colors cursor-pointer"
            >
              <X size={18} />
            </button>
          </div>
        </div>

        {/* Scrollable Content */}
        <div className="p-6 overflow-y-auto space-y-6 custom-scrollbar">
          {/* Quick Episode Metrics Strip */}
          <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-8 gap-3">
            <div className="bg-white/[0.03] border border-white/10 rounded-xl p-3">
              <div className="text-[11px] text-white/40 uppercase">First Signal</div>
              <div className="text-sm font-bold text-white mt-0.5">{episode.start_date}</div>
              <div className="text-[11px] text-white/40">{episode.alert_days}d active alerts</div>
            </div>
            <div className="bg-white/[0.03] border border-white/10 rounded-xl p-3">
              <div className="text-[11px] text-white/40 uppercase">Entry / Latest</div>
              <div className="text-sm font-mono font-bold text-white mt-0.5">
                ${episode.entry_price ?? '—'} → ${episode.latest_price ?? '—'}
              </div>
              <div className="text-[11px] text-white/40">{episode.trading_days_elapsed} trading days elapsed</div>
            </div>
            <div className="bg-white/[0.03] border border-white/10 rounded-xl p-3">
              <div className="text-[11px] text-white/40 uppercase">3 Days (3D)</div>
              <div className={`text-sm font-mono mt-0.5 ${getPctColor(episode.horizons?.['3d']?.close_return)}`}>
                {formatPct(episode.horizons?.['3d']?.close_return)}
              </div>
              <div className="text-[11px] text-white/40">
                Peak: {formatPct(episode.horizons?.['3d']?.max_gain)}
              </div>
            </div>
            <div className="bg-white/[0.03] border border-white/10 rounded-xl p-3">
              <div className="text-[11px] text-white/40 uppercase">1 Week (1W)</div>
              <div className={`text-sm font-mono mt-0.5 ${getPctColor(episode.horizons?.['1w']?.close_return)}`}>
                {formatPct(episode.horizons?.['1w']?.close_return)}
              </div>
              <div className="text-[11px] text-white/40">
                Peak: {formatPct(episode.horizons?.['1w']?.max_gain)}
              </div>
            </div>
            <div className="bg-white/[0.03] border border-white/10 rounded-xl p-3">
              <div className="text-[11px] text-white/40 uppercase">1 Month (1M)</div>
              <div className={`text-sm font-mono mt-0.5 ${getPctColor(episode.horizons?.['1m']?.close_return ?? episode.horizons?.['1m']?.to_date_return)}`}>
                {formatPct(episode.horizons?.['1m']?.close_return ?? episode.horizons?.['1m']?.to_date_return)}
                {!episode.horizons?.['1m']?.completed && episode.horizons?.['1m']?.days_available > 0 && ' ⏳'}
              </div>
              <div className="text-[11px] text-white/40">
                Peak: {formatPct(episode.horizons?.['1m']?.max_gain)}
              </div>
            </div>
            <div className="bg-white/[0.03] border border-white/10 rounded-xl p-3">
              <div className="text-[11px] text-white/40 uppercase">3 Months (3M)</div>
              <div className={`text-sm font-mono mt-0.5 ${getPctColor(episode.horizons?.['3m']?.close_return ?? episode.horizons?.['3m']?.to_date_return)}`}>
                {formatPct(episode.horizons?.['3m']?.close_return ?? episode.horizons?.['3m']?.to_date_return)}
                {!episode.horizons?.['3m']?.completed && episode.horizons?.['3m']?.days_available > 0 && ' ⏳'}
              </div>
              <div className="text-[11px] text-white/40">
                Peak: {formatPct(episode.horizons?.['3m']?.max_gain)}
              </div>
            </div>
            <div className="bg-emerald-500/10 border border-emerald-500/20 rounded-xl p-3">
              <div className="text-[11px] text-emerald-300/70 uppercase">Max Peak (MFE)</div>
              <div className="text-sm font-mono font-bold text-emerald-300 mt-0.5">
                {formatPct(episode.mfe)}
              </div>
              <div className="text-[11px] text-emerald-300/60">
                {episode.mfe_days ? `Day ${episode.mfe_days}` : '—'}
              </div>
            </div>
            <div className="bg-rose-500/10 border border-rose-500/20 rounded-xl p-3">
              <div className="text-[11px] text-rose-300/70 uppercase">Max Drawdown (MAE)</div>
              <div className="text-sm font-mono font-bold text-rose-300 mt-0.5">
                {formatPct(episode.mae)}
              </div>
              <div className="text-[11px] text-rose-300/60">
                {episode.mae_days ? `Day ${episode.mae_days}` : '—'}
              </div>
            </div>
          </div>

          {/* Interactive Candlestick Chart */}
          <div className="bg-[#0b0b10] border border-white/10 rounded-2xl p-4">
            <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
              <div className="flex items-center gap-3 text-xs text-white/60">
                <span className="font-bold text-white/90">Signal & Post-Entry Price Action</span>
                <span className="inline-flex items-center gap-1">
                  <span className="w-2.5 h-0.5 bg-sky-400 inline-block" /> EMA 10
                </span>
                <span className="inline-flex items-center gap-1">
                  <span className="w-2.5 h-0.5 bg-purple-400 inline-block" /> EMA 20
                </span>
                <span className="inline-flex items-center gap-1">
                  <span className="w-2.5 h-0.5 bg-amber-400 inline-block" /> SMA 50
                </span>
              </div>
              <button
                onClick={() => setShowMA((v) => !v)}
                className={`px-2.5 py-1 rounded text-xs font-medium border transition-colors cursor-pointer ${
                  showMA
                    ? 'bg-indigo-500/20 border-indigo-500/40 text-indigo-200'
                    : 'bg-white/5 border-white/10 text-white/50'
                }`}
              >
                Moving Averages: {showMA ? 'ON' : 'OFF'}
              </button>
            </div>

            {loading ? (
              <div className="h-[400px] flex items-center justify-center text-white/40 text-sm">
                Loading candlestick chart...
              </div>
            ) : (
              <div ref={chartContainerRef} className="w-full h-[400px] rounded-xl overflow-hidden" />
            )}
          </div>

          {/* Signal Wave Breakdown & Initial Setup Factors */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <div className="bg-white/[0.02] border border-white/10 rounded-xl p-4">
              <h4 className="text-xs font-bold uppercase tracking-wider text-white/60 mb-3">
                Initial Technical Setup Breakdown ({episode.start_date})
              </h4>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5 text-xs">
                <div className="bg-white/5 rounded-lg p-2.5 border border-white/5">
                  <span className="text-white/40 block">Trend Score</span>
                  <span className="text-white font-bold text-sm">{r.trend_score ?? '—'} / 35</span>
                </div>
                <div className="bg-white/5 rounded-lg p-2.5 border border-white/5">
                  <span className="text-white/40 block">Relative Strength (RS)</span>
                  <span className="text-white font-bold text-sm">
                    {r.rs_score ?? '—'} / 30 {r.rs_ratio ? `(${r.rs_ratio.toFixed(2)}x)` : ''}
                  </span>
                </div>
                <div className="bg-white/5 rounded-lg p-2.5 border border-white/5">
                  <span className="text-white/40 block">Tightness</span>
                  <span className="text-white font-bold text-sm">
                    {r.tightness_score ?? '—'} ({r.is_tight ? 'Tight ✅' : 'Wide'})
                  </span>
                </div>
                <div className="bg-white/5 rounded-lg p-2.5 border border-white/5">
                  <span className="text-white/40 block">Volume Dry-Up</span>
                  <span className="text-white font-bold text-sm">
                    {r.vol_score ?? '—'} ({r.is_dry ? 'Dry ✅' : 'Normal'})
                  </span>
                </div>
                <div className="bg-white/5 rounded-lg p-2.5 border border-white/5">
                  <span className="text-white/40 block">RVOL / Extension</span>
                  <span className="text-white font-bold text-sm">
                    {r.rvol ? `${r.rvol.toFixed(2)}x` : '—'} /{' '}
                    {r.ext_pct !== undefined ? `${(r.ext_pct * 100).toFixed(1)}%` : '—'}
                  </span>
                </div>
                <div className="bg-white/5 rounded-lg p-2.5 border border-white/5">
                  <span className="text-white/40 block">Highs Spread</span>
                  <span className="text-white font-bold text-sm">
                    {r.highs_spread !== undefined ? `${(r.highs_spread * 100).toFixed(2)}%` : '—'}
                  </span>
                </div>
              </div>
            </div>

            <div className="bg-white/[0.02] border border-white/10 rounded-xl p-4">
              <h4 className="text-xs font-bold uppercase tracking-wider text-white/60 mb-3">
                Daily Alerts in This Wave ({episode.signals.length} Days)
              </h4>
              <div className="max-h-40 overflow-y-auto custom-scrollbar space-y-1.5 pr-1">
                {episode.signals.map((sig, i) => (
                  <div
                    key={i}
                    className="flex items-center justify-between px-3 py-1.5 rounded-lg bg-white/5 border border-white/5 text-xs"
                  >
                    <span className="font-mono text-white/80">
                      #{i + 1} • {sig.date}
                    </span>
                    <span
                      className={`px-2 py-0.5 rounded font-bold uppercase ${
                        sig.status === 'candidate'
                          ? 'bg-emerald-500/20 text-emerald-300'
                          : 'bg-amber-500/20 text-amber-300'
                      }`}
                    >
                      {sig.status} (Score: {sig.score})
                    </span>
                    <span className="font-mono text-white/70">${sig.price ? Number(sig.price).toFixed(2) : '—'}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* Personal Trade Execution Log for this Symbol (if Hurkan traded it) */}
          {episode.my_trade && (
            <div className="bg-emerald-500/[0.06] border border-emerald-500/25 rounded-xl p-4 space-y-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <Briefcase size={15} className="text-emerald-400" />
                  <h4 className="text-xs font-bold uppercase tracking-wider text-emerald-300">
                    My Personal Swing Execution on {episode.symbol} (Hürkan)
                  </h4>
                  <MyTradeBadge myTrade={episode.my_trade} />
                </div>
                <div className="flex items-center gap-3 text-xs font-mono">
                  <span className="text-white/70">
                    Realized:{' '}
                    <strong className={episode.my_trade.realized_pnl_usd >= 0 ? 'text-emerald-300' : 'text-rose-400'}>
                      {formatUsd(episode.my_trade.realized_pnl_usd, true)}
                    </strong>
                  </span>
                  <span className="text-white/70">
                    Unrealized:{' '}
                    <strong className={episode.my_trade.unrealized_pnl_usd >= 0 ? 'text-emerald-300' : 'text-rose-400'}>
                      {formatUsd(episode.my_trade.unrealized_pnl_usd, true)}
                    </strong>
                  </span>
                  <span className="text-white/70">
                    Net P&amp;L:{' '}
                    <strong className={episode.my_trade.total_pnl_usd >= 0 ? 'text-emerald-300' : 'text-rose-400'}>
                      {formatUsd(episode.my_trade.total_pnl_usd, true)} ({formatPct(episode.my_trade.total_return_pct)})
                    </strong>
                  </span>
                </div>
              </div>

              <div className="space-y-2">
                {(episode.my_trade.positions || []).map((pos) => (
                  <div
                    key={pos.id}
                    className="p-2.5 rounded-lg bg-black/40 border border-white/10 text-xs flex flex-col gap-1.5"
                  >
                    <div className="flex flex-wrap items-center justify-between gap-2 font-mono">
                      <div className="flex flex-wrap items-center gap-2">
                        <span
                          className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase ${
                            pos.is_open
                              ? 'bg-indigo-500/25 text-indigo-200 border border-indigo-500/30'
                              : pos.total_pnl_usd >= 0
                                ? 'bg-emerald-500/20 text-emerald-300'
                                : 'bg-rose-500/20 text-rose-300'
                          }`}
                        >
                          {pos.status}
                        </span>
                        <span className="text-white/85">
                          Entry: <b>${pos.entry_price.toFixed(2)}</b> • Shares: <b>{pos.remaining_shares}/{pos.initial_shares}</b> • Stop:{' '}
                          <b className="text-rose-400">${pos.stop_price.toFixed(2)}</b>
                        </span>
                      </div>
                      <span className={pos.total_pnl_usd >= 0 ? 'text-emerald-300 font-bold' : 'text-rose-400 font-bold'}>
                        {formatUsd(pos.total_pnl_usd, true)} ({formatPct(pos.total_return_pct)})
                      </span>
                    </div>
                    {Array.isArray(pos.transactions) && pos.transactions.length > 0 && (
                      <div className="flex flex-wrap gap-1.5 pt-1 border-t border-white/5 font-mono text-[11px]">
                        {pos.transactions.map((tx) => (
                          <span
                            key={tx.id}
                            className="px-2 py-0.5 rounded bg-white/5 border border-white/10 text-white/75"
                          >
                            {tx.type}: {tx.shares} sh @ ${Number(tx.price).toFixed(2)} ({String(tx.date || '').slice(0, 10)})
                            {tx.pnl_usd !== undefined ? ` [${formatUsd(tx.pnl_usd, true)}]` : ''}
                          </span>
                        ))}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </dialog>
  );
}

export default function AnalysisPerformancePage() {
  const navigate = useNavigate();

  // Data state
  const [rawData, setRawData] = useState({
    available_types: [],
    episodes: [],
    total_raw_signals: 0,
    my_portfolio_analysis: null,
  });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  // Controls & Filters
  const [activeStrategyTab, setActiveStrategyTab] = useState('qullamaggie'); // 'qullamaggie' | 'my_portfolio' | 'fundamentals'
  const [gapDays, setGapDays] = useState(10);
  const [statusFilter, setStatusFilter] = useState('all'); // 'all' | 'candidate' | 'watch' | 'upgraded'
  const [traitFilter, setTraitFilter] = useState('all'); // 'all' | 'tight' | 'dry' | 'tight_dry' | 'high_rs'
  const [returnMode, setReturnMode] = useState('close'); // 'close' | 'peak'
  const [activeHorizon, setActiveHorizon] = useState('1w'); // '3d' | '1w' | '1m' | '3m' | 'overall'
  const [includePartial, setIncludePartial] = useState(true);
  const [onlyMultiWave, setOnlyMultiWave] = useState(false);
  const [onlyMyTraded, setOnlyMyTraded] = useState(false);
  const [selectedBucketId, setSelectedBucketId] = useState(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [sortBy, setSortBy] = useState('start_date');
  const [sortDir, setSortDir] = useState('desc');
  const [selectedEpisode, setSelectedEpisode] = useState(null);

  useEffect(() => {
    let active = true;
    async function fetchPerformance() {
      try {
        setLoading(true);
        setError(null);
        const res = await fetch(`/api/analysis/performance?gap_days=${gapDays}`);
        if (!res.ok) throw new Error('Failed to fetch analysis performance data');
        const json = await res.json();
        if (active) {
          setRawData(json);
        }
      } catch (err) {
        if (active) setError(err.message);
      } finally {
        if (active) setLoading(false);
      }
    }
    fetchPerformance();
    return () => {
      active = false;
    };
  }, [gapDays]);

  const myPortfolio = rawData.my_portfolio_analysis || null;

  // 1. Base filtered episodes (Qullamaggie only)
  const filteredEpisodes = useMemo(() => {
    return (rawData.episodes || []).filter((ep) => {
      if (ep.analysis_type !== 'qullamaggie') return false;
      if (statusFilter === 'candidate' && ep.peak_status !== 'candidate') return false;
      if (statusFilter === 'watch' && ep.peak_status !== 'watch') return false;
      if (statusFilter === 'upgraded' && !ep.upgraded_to_candidate) return false;
      if (traitFilter === 'tight' && !ep.initial_reason?.is_tight) return false;
      if (traitFilter === 'dry' && !ep.initial_reason?.is_dry) return false;
      if (traitFilter === 'tight_dry' && !(ep.initial_reason?.is_tight && ep.initial_reason?.is_dry)) return false;
      if (traitFilter === 'high_rs' && !(Number(ep.initial_reason?.rs_score || 0) >= 20)) return false;
      if (onlyMultiWave && ep.total_episodes_for_symbol < 2) return false;
      if (onlyMyTraded && !ep.my_trade) return false;
      return true;
    });
  }, [rawData.episodes, statusFilter, traitFilter, onlyMultiWave, onlyMyTraded]);

  // 2. Main KPI & distribution stats for the active horizon
  const mainStats = useMemo(
    () => computeGroupStats(filteredEpisodes, activeHorizon, returnMode, includePartial),
    [filteredEpisodes, activeHorizon, returnMode, includePartial]
  );

  // 3. Multi-horizon comparison matrix (3D, 1W, 1M, 3M, Overall)
  const horizonMatrix = useMemo(() => {
    return HORIZON_CONFIG.map((h) => ({
      ...h,
      stats: computeGroupStats(filteredEpisodes, h.key, returnMode, includePartial),
    }));
  }, [filteredEpisodes, returnMode, includePartial]);

  // 4. Factor Attribution ("What Works vs What Doesn't")
  const factorAnalysis = useMemo(() => {
    const makeRow = (label, badgeColor, predicate) => {
      const subset = filteredEpisodes.filter(predicate);
      const st = computeGroupStats(subset, activeHorizon, returnMode, includePartial);
      return { label, badgeColor, ...st };
    };

    return {
      byStatus: [
        makeRow('Candidate', 'bg-emerald-500/20 text-emerald-300 border-emerald-500/30', (e) => e.peak_status === 'candidate'),
        makeRow('Watch → Candidate Upgraded', 'bg-indigo-500/20 text-indigo-300 border-indigo-500/30', (e) => e.upgraded_to_candidate),
        makeRow('Watch Only', 'bg-amber-500/20 text-amber-300 border-amber-500/30', (e) => e.peak_status === 'watch'),
      ],
      byScore: [
        makeRow('90 - 100 Score (Elite)', 'bg-emerald-500/20 text-emerald-300 border-emerald-500/30', (e) => e.max_score >= 90),
        makeRow('80 - 89 Score (Strong)', 'bg-teal-500/20 text-teal-300 border-teal-500/30', (e) => e.max_score >= 80 && e.max_score < 90),
        makeRow('70 - 79 Score (Moderate)', 'bg-sky-500/20 text-sky-300 border-sky-500/30', (e) => e.max_score >= 70 && e.max_score < 80),
        makeRow('< 70 Score (Low)', 'bg-slate-500/20 text-slate-300 border-slate-500/30', (e) => e.max_score < 70),
      ],
      bySetupMechanics: [
        makeRow('Tight + Volume Dry-Up Combo', 'bg-emerald-500/20 text-emerald-300 border-emerald-500/30', (e) => e.initial_reason?.is_tight && e.initial_reason?.is_dry),
        makeRow('Tight Flag (is_tight)', 'bg-teal-500/20 text-teal-300 border-teal-500/30', (e) => Boolean(e.initial_reason?.is_tight)),
        makeRow('Volume Dry-Up (is_dry)', 'bg-sky-500/20 text-sky-300 border-sky-500/30', (e) => Boolean(e.initial_reason?.is_dry)),
        makeRow('High Relative Strength (RS ≥ 20)', 'bg-indigo-500/20 text-indigo-300 border-indigo-500/30', (e) => Number(e.initial_reason?.rs_score || 0) >= 20),
      ],
      byPersistence: [
        makeRow('4+ Days Persistent Streak', 'bg-purple-500/20 text-purple-300 border-purple-500/30', (e) => e.alert_days >= 4),
        makeRow('2 - 3 Days Alert Streak', 'bg-indigo-500/20 text-indigo-300 border-indigo-500/30', (e) => e.alert_days >= 2 && e.alert_days <= 3),
        makeRow('Single-Day Alert (1 Day)', 'bg-slate-500/20 text-slate-300 border-slate-500/30', (e) => e.alert_days === 1),
        makeRow('Low Extension (Ext ≤ 3%)', 'bg-emerald-500/20 text-emerald-300 border-emerald-500/30', (e) => e.initial_reason?.ext_pct !== undefined && e.initial_reason.ext_pct <= 0.03),
      ],
    };
  }, [filteredEpisodes, activeHorizon, returnMode, includePartial]);

  // 5. Post-Signal Average Trajectory Curve (Day 1 to Day 25)
  const trajectoryCurve = useMemo(() => {
    const maxDay = 25;
    const points = [];
    for (let d = 1; d <= maxDay; d++) {
      const allVals = [];
      const candVals = [];
      const watchVals = [];

      for (const ep of filteredEpisodes) {
        if (returnMode === 'peak') {
          // Running peak gain (MFE) up to day d
          const slice = (ep.forward_curve || []).filter((p) => p.day <= d && p.high_pct !== null && p.high_pct !== undefined);
          if (slice.length > 0) {
            const peak = Math.max(...slice.map((p) => p.high_pct));
            allVals.push(peak);
            if (ep.peak_status === 'candidate') candVals.push(peak);
            else watchVals.push(peak);
          }
        } else {
          // Cumulative close return on day d
          const pt = ep.forward_curve?.find((p) => p.day === d);
          if (pt && pt.close_pct !== null && pt.close_pct !== undefined) {
            allVals.push(pt.close_pct);
            if (ep.peak_status === 'candidate') candVals.push(pt.close_pct);
            else watchVals.push(pt.close_pct);
          }
        }
      }

      if (allVals.length > 0) {
        const avg = (arr) => (arr.length ? arr.reduce((a, b) => a + b, 0) / arr.length : null);
        points.push({
          day: d,
          sampleCount: allVals.length,
          allAvg: avg(allVals),
          candAvg: avg(candVals),
          watchAvg: avg(watchVals),
        });
      }
    }
    return points;
  }, [filteredEpisodes, returnMode]);

  // 6. Hall of Fame (Best Performers) & Hall of Shame (Worst Performers)
  const { bestPerformers, worstPerformers } = useMemo(() => {
    const withVal = filteredEpisodes
      .map((ep) => ({
        ep,
        val: getEpisodeHorizonValue(ep, activeHorizon, returnMode, includePartial),
      }))
      .filter((x) => x.val !== null && x.val !== undefined && !Number.isNaN(x.val));

    const sortedDesc = [...withVal].sort((a, b) => b.val - a.val);
    const sortedAsc = [...withVal].sort((a, b) => a.val - b.val);

    return {
      bestPerformers: sortedDesc.slice(0, 10),
      worstPerformers: sortedAsc.slice(0, 10),
    };
  }, [filteredEpisodes, activeHorizon, returnMode, includePartial]);

  // 7. Table episodes (with bucket filter, search, and sorting)
  const tableEpisodes = useMemo(() => {
    const activeBucket = RETURN_BUCKETS.find((b) => b.id === selectedBucketId);
    const q = searchQuery.trim().toLowerCase();

    const list = filteredEpisodes.filter((ep) => {
      if (q) {
        const matchSym = ep.symbol.toLowerCase().includes(q);
        const matchSec = (ep.sector || '').toLowerCase().includes(q);
        if (!matchSym && !matchSec) return false;
      }
      if (activeBucket) {
        const v = getEpisodeHorizonValue(ep, activeHorizon, returnMode, includePartial);
        if (v === null || v === undefined) return false;
        if (activeBucket.id === 'super_win' && !(v >= 20)) return false;
        else if (activeBucket.id === 'big_loss' && !(v < -10)) return false;
        else if (
          activeBucket.id !== 'super_win' &&
          activeBucket.id !== 'big_loss' &&
          !(v >= activeBucket.min && v < activeBucket.max)
        )
          return false;
      }
      return true;
    });

    list.sort((a, b) => {
      const dir = sortDir === 'asc' ? 1 : -1;
      if (sortBy === 'symbol') return a.symbol.localeCompare(b.symbol) * dir;
      if (sortBy === 'start_date') return a.start_date.localeCompare(b.start_date) * dir;
      if (sortBy === 'alert_days') return (a.alert_days - b.alert_days) * dir;
      if (sortBy === 'max_score') return (a.max_score - b.max_score) * dir;
      if (sortBy === 'mfe') return ((a.mfe ?? -999) - (b.mfe ?? -999)) * dir;
      if (sortBy === 'mae') return ((a.mae ?? -999) - (b.mae ?? -999)) * dir;
      if (['3d', '1w', '1m', '3m', 'overall'].includes(sortBy)) {
        const va = getEpisodeHorizonValue(a, sortBy, returnMode, includePartial) ?? -999;
        const vb = getEpisodeHorizonValue(b, sortBy, returnMode, includePartial) ?? -999;
        return (va - vb) * dir;
      }
      return 0;
    });

    return list;
  }, [filteredEpisodes, selectedBucketId, searchQuery, sortBy, sortDir, activeHorizon, returnMode, includePartial]);

  const handleSort = (col) => {
    if (sortBy === col) {
      setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortBy(col);
      setSortDir('desc');
    }
  };

  const multiWaveSymbolsCount = useMemo(() => {
    const syms = new Set(filteredEpisodes.filter((e) => e.total_episodes_for_symbol > 1).map((e) => e.symbol));
    return syms.size;
  }, [filteredEpisodes]);

  const activeHorizonLabel = HORIZON_CONFIG.find((h) => h.key === activeHorizon)?.label || '1 Week';

  return (
    <div className="w-full flex flex-col gap-8 animate-in fade-in slide-in-from-bottom-4 duration-500">
      {/* Page Header */}
      <div className="w-full flex flex-col gap-6 border-b border-white/10 pb-6">
        <div className="flex flex-col lg:flex-row lg:items-end justify-between gap-4">
          <div>
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-indigo-500/10 border border-indigo-500/20 text-indigo-300 text-xs font-semibold mb-3">
              <Sparkles size={13} />
              <span>Signal Meta-Analysis • Strategy Backtest Lab</span>
            </div>
            <h2 className="text-3xl md:text-5xl font-bold tracking-tighter bg-clip-text text-transparent bg-gradient-to-br from-white via-white to-white/50">
              Performance Lab
            </h2>
            <p className="text-white/45 text-sm md:text-base font-medium mt-1.5 max-w-2xl">
              Track how Watch and Candidate swing-trade waves perform across 3D, 1W, 1M, and 3M horizons, inspect return distributions, and evaluate which technical criteria deliver the highest edge.
            </p>
          </div>

          {/* Episode Gap Selector (Single-row non-wrapping) */}
          {activeStrategyTab === 'qullamaggie' && (
            <div className="flex items-center gap-3 flex-nowrap shrink-0 whitespace-nowrap bg-white/[0.03] border border-white/10 rounded-xl px-4 py-2.5 self-start lg:self-end">
              <div className="text-xs font-semibold text-white/60 flex items-center gap-2">
                <Clock size={15} className="text-indigo-400 shrink-0" />
                <span>Wave Cooldown (Business Days):</span>
              </div>
              <div className="flex items-center gap-1.5 flex-nowrap">
                {[
                  { days: 10, label: '10 Days (2W)' },
                  { days: 15, label: '15 Days (3W)' },
                ].map((g) => (
                  <button
                    key={g.days}
                    onClick={() => setGapDays(g.days)}
                    className={`px-3.5 py-1.5 rounded-lg text-xs font-bold whitespace-nowrap transition-all cursor-pointer ${
                      gapDays === g.days
                        ? 'bg-indigo-600 text-white shadow-lg shadow-indigo-600/30'
                        : 'text-white/60 hover:text-white hover:bg-white/5'
                    }`}
                    title={`Signals separated by more than ${g.days} business/trading days are evaluated as a new independent analysis wave`}
                  >
                    {g.label}
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Top Strategy Tabs */}
        <div className="flex flex-wrap items-center gap-2 bg-black/40 p-1.5 rounded-xl border border-white/10 w-fit">
          <button
            onClick={() => setActiveStrategyTab('qullamaggie')}
            className={`px-5 py-2 rounded-lg text-sm font-bold transition-all cursor-pointer flex items-center gap-2 ${
              activeStrategyTab === 'qullamaggie'
                ? 'bg-indigo-600 text-white shadow-lg shadow-indigo-600/25'
                : 'text-white/60 hover:text-white hover:bg-white/5'
            }`}
          >
            <Zap size={15} />
            <span>Qullamaggie</span>
          </button>
          <button
            onClick={() => setActiveStrategyTab('my_portfolio')}
            className={`px-5 py-2 rounded-lg text-sm font-bold transition-all cursor-pointer flex items-center gap-2 ${
              activeStrategyTab === 'my_portfolio'
                ? 'bg-emerald-600 text-white shadow-lg shadow-emerald-600/25'
                : 'text-white/60 hover:text-white hover:bg-white/5'
            }`}
          >
            <Briefcase size={15} />
            <span>My Portfolio &amp; Swing Trades (Hürkan)</span>
            {myPortfolio && (
              <span
                className={`px-2 py-0.5 rounded-md text-[11px] font-mono font-bold ${
                  myPortfolio.total_combined_pnl_usd >= 0
                    ? 'bg-black/30 text-emerald-300'
                    : 'bg-black/30 text-rose-300'
                }`}
              >
                {myPortfolio.total_trades_count} Trades • {formatUsd(myPortfolio.total_combined_pnl_usd, true)}
              </span>
            )}
          </button>
          <button
            onClick={() => setActiveStrategyTab('fundamentals')}
            className={`px-5 py-2 rounded-lg text-sm font-bold transition-all cursor-pointer flex items-center gap-2 ${
              activeStrategyTab === 'fundamentals'
                ? 'bg-indigo-600 text-white shadow-lg shadow-indigo-600/25'
                : 'text-white/60 hover:text-white hover:bg-white/5'
            }`}
          >
            <BarChart3 size={15} />
            <span>Fundamentals</span>
          </button>
        </div>
      </div>

      {activeStrategyTab === 'my_portfolio' ? (
        <MyPortfolioAnalyticsView
          myPortfolio={myPortfolio}
          episodes={rawData.episodes || []}
          onSelectEpisode={setSelectedEpisode}
        />
      ) : activeStrategyTab === 'fundamentals' ? (
        <div className="w-full py-28 bg-white/[0.02] border border-dashed border-white/10 rounded-2xl flex flex-col items-center justify-center text-center px-6">
          <div className="w-12 h-12 rounded-2xl bg-indigo-500/10 border border-indigo-500/20 flex items-center justify-center text-indigo-400 mb-4">
            <BarChart3 size={24} />
          </div>
          <h3 className="text-xl font-bold text-white">Fundamentals Performance Lab</h3>
          <p className="text-sm text-white/45 max-w-md mt-2">
            Monthly, quarterly, and annual fundamental valuation performance tracking will be configured here.
          </p>
        </div>
      ) : (
        <>
          {/* Compact Personal Portfolio & Swing Trades Summary Strip inside Qullamaggie Lab */}
          {myPortfolio && (
            <div className="bg-emerald-500/[0.05] border border-emerald-500/20 rounded-2xl p-4 flex flex-wrap items-center justify-between gap-4">
              <div className="flex flex-wrap items-center gap-4">
                <div className="flex items-center gap-2.5">
                  <div className="w-9 h-9 rounded-xl bg-emerald-500/20 border border-emerald-500/30 flex items-center justify-center text-emerald-300">
                    <Briefcase size={18} />
                  </div>
                  <div>
                    <div className="text-xs font-bold uppercase tracking-wider text-emerald-300">
                      Hürkan&apos;s Swing Trade Execution Summary
                    </div>
                    <div className="text-xs text-white/50">
                      Portfolio Value: <strong className="text-white font-mono">{formatUsd(myPortfolio.total_portfolio_usd)}</strong> • Risk Limit:{' '}
                      <strong className="text-amber-300 font-mono">{myPortfolio.risk_limit_pct}% ({formatUsd(myPortfolio.max_risk_budget_usd)})</strong> • Open Risk:{' '}
                      <strong className="text-white font-mono">{formatUsd(myPortfolio.total_open_risk_usd)} ({myPortfolio.portfolio_risk_pct}%)</strong>
                    </div>
                  </div>
                </div>

                <div className="flex flex-wrap items-center gap-2 text-xs font-mono">
                  <span className="px-2.5 py-1 rounded-lg bg-black/40 border border-white/10 text-white/80">
                    Trades: <b>{myPortfolio.total_trades_count}</b> ({myPortfolio.open_trades_count} Open / {myPortfolio.closed_trades_count} Closed)
                  </span>
                  <span className="px-2.5 py-1 rounded-lg bg-black/40 border border-white/10 text-white/80">
                    Realized:{' '}
                    <b className={myPortfolio.total_realized_pnl_usd >= 0 ? 'text-emerald-300' : 'text-rose-400'}>
                      {formatUsd(myPortfolio.total_realized_pnl_usd, true)}
                    </b>
                  </span>
                  <span className="px-2.5 py-1 rounded-lg bg-black/40 border border-white/10 text-white/80">
                    Unrealized:{' '}
                    <b className={myPortfolio.total_unrealized_pnl_usd >= 0 ? 'text-emerald-300' : 'text-rose-400'}>
                      {formatUsd(myPortfolio.total_unrealized_pnl_usd, true)}
                    </b>
                  </span>
                  <span className="px-2.5 py-1 rounded-lg bg-emerald-500/15 border border-emerald-500/30 text-white">
                    Net P&amp;L:{' '}
                    <b className={myPortfolio.total_combined_pnl_usd >= 0 ? 'text-emerald-300' : 'text-rose-400'}>
                      {formatUsd(myPortfolio.total_combined_pnl_usd, true)}
                    </b>
                  </span>
                </div>
              </div>

              <button
                onClick={() => setActiveStrategyTab('my_portfolio')}
                className="px-3.5 py-1.5 rounded-xl bg-emerald-500/20 hover:bg-emerald-500/30 text-emerald-200 border border-emerald-500/30 text-xs font-bold transition-all cursor-pointer"
              >
                Open Full Trade Analytics &rarr;
              </button>
            </div>
          )}

          {/* Main Control & Filter Bar */}
          <div className="bg-white/[0.03] border border-white/10 rounded-2xl p-4 flex flex-col gap-4">
            <div className="flex flex-wrap items-center justify-between gap-4">
              {/* Horizon Selector */}
              <div className="flex flex-col gap-1.5">
                <span className="text-[11px] font-bold uppercase tracking-wider text-white/40">
                  Target Horizon
                </span>
                <div className="flex flex-wrap gap-1 bg-black/40 p-1 rounded-xl border border-white/5">
                  {HORIZON_CONFIG.map((h) => (
                    <button
                      key={h.key}
                      onClick={() => setActiveHorizon(h.key)}
                      className={`px-3.5 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                        activeHorizon === h.key
                          ? 'bg-indigo-600 text-white shadow'
                          : 'text-white/60 hover:text-white hover:bg-white/5'
                      }`}
                    >
                      {h.label}
                    </button>
                  ))}
                </div>
              </div>

              {/* Return Mode Toggle (Close vs Peak MFE) */}
              <div className="flex flex-col gap-1.5">
                <span className="text-[11px] font-bold uppercase tracking-wider text-white/40">
                  Return Calculation Mode
                </span>
                <div className="flex gap-1 bg-black/40 p-1 rounded-xl border border-white/5">
                  <button
                    onClick={() => setReturnMode('close')}
                    className={`px-3.5 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer flex items-center gap-1.5 ${
                      returnMode === 'close'
                        ? 'bg-emerald-600 text-white shadow'
                        : 'text-white/60 hover:text-white hover:bg-white/5'
                    }`}
                  >
                    <Target size={13} />
                    <span>Period-End Close</span>
                  </button>
                  <button
                    onClick={() => setReturnMode('peak')}
                    className={`px-3.5 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer flex items-center gap-1.5 ${
                      returnMode === 'peak'
                        ? 'bg-amber-600 text-white shadow'
                        : 'text-white/60 hover:text-white hover:bg-white/5'
                    }`}
                  >
                    <Flame size={13} />
                    <span>Max Peak Gain (MFE)</span>
                  </button>
                </div>
              </div>

              {/* Completed vs In-Progress Toggle */}
              <div className="flex flex-col gap-1.5">
                <span className="text-[11px] font-bold uppercase tracking-wider text-white/40">
                  In-Progress Signals
                </span>
                <div className="flex gap-1 bg-black/40 p-1 rounded-xl border border-white/5">
                  <button
                    onClick={() => setIncludePartial(true)}
                    className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                      includePartial
                        ? 'bg-white/15 text-white'
                        : 'text-white/50 hover:text-white'
                    }`}
                  >
                    Include To-Date
                  </button>
                  <button
                    onClick={() => setIncludePartial(false)}
                    className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                      !includePartial
                        ? 'bg-white/15 text-white'
                        : 'text-white/50 hover:text-white'
                    }`}
                  >
                    Completed Only
                  </button>
                </div>
              </div>
            </div>

            {/* Second Row: Status & Technical Trait Filters */}
            <div className="flex flex-wrap items-center justify-between gap-3 pt-3 border-t border-white/5">
              <div className="flex flex-wrap items-center gap-3">
                {/* Signal Status */}
                <div className="flex items-center gap-1 bg-black/40 p-1 rounded-lg border border-white/5">
                  {[
                    { id: 'all', label: 'All (Watch + Candidate)' },
                    { id: 'candidate', label: '🔥 Candidate' },
                    { id: 'watch', label: '👀 Watch Only' },
                    { id: 'upgraded', label: '⬆️ Watch → Candidate' },
                  ].map((s) => (
                    <button
                      key={s.id}
                      onClick={() => setStatusFilter(s.id)}
                      className={`px-2.5 py-1 rounded-md text-xs font-semibold transition-all cursor-pointer ${
                        statusFilter === s.id
                          ? 'bg-white/15 text-white shadow'
                          : 'text-white/55 hover:text-white'
                      }`}
                    >
                      {s.label}
                    </button>
                  ))}
                </div>

                {/* Technical Setup Trait Filter */}
                <div className="flex items-center gap-1 bg-black/40 p-1 rounded-lg border border-white/5">
                  {[
                    { id: 'all', label: 'All Setups' },
                    { id: 'tight', label: 'Tight Flag' },
                    { id: 'dry', label: 'Vol Dry-Up' },
                    { id: 'tight_dry', label: 'Tight + Dry' },
                    { id: 'high_rs', label: 'High RS (≥20)' },
                  ].map((t) => (
                    <button
                      key={t.id}
                      onClick={() => setTraitFilter(t.id)}
                      className={`px-2.5 py-1 rounded-md text-xs font-semibold transition-all cursor-pointer ${
                        traitFilter === t.id
                          ? 'bg-indigo-500/30 text-indigo-200 border border-indigo-500/40'
                          : 'text-white/55 hover:text-white'
                      }`}
                    >
                      {t.label}
                    </button>
                  ))}
                </div>
              </div>

              <div className="flex flex-wrap items-center gap-2">
                <button
                  onClick={() => setOnlyMyTraded((v) => !v)}
                  className={`px-3 py-1.5 rounded-lg text-xs font-bold border transition-all cursor-pointer flex items-center gap-1.5 ${
                    onlyMyTraded
                      ? 'bg-emerald-500/25 border-emerald-500/45 text-emerald-200'
                      : 'bg-white/5 border-white/10 text-white/60 hover:text-white'
                  }`}
                >
                  <Briefcase size={13} />
                  <span>My Traded Setups Only</span>
                </button>

                <button
                  onClick={() => setOnlyMultiWave((v) => !v)}
                  className={`px-3 py-1.5 rounded-lg text-xs font-bold border transition-all cursor-pointer flex items-center gap-1.5 ${
                    onlyMultiWave
                      ? 'bg-purple-500/20 border-purple-500/40 text-purple-200'
                      : 'bg-white/5 border-white/10 text-white/60 hover:text-white'
                  }`}
                >
                  <Layers size={13} />
                  <span>Multi-Wave Symbols Only ({multiWaveSymbolsCount} Tickers)</span>
                </button>
              </div>
            </div>
          </div>

      {error && (
        <div className="bg-rose-500/10 border border-rose-500/20 text-rose-200 p-4 rounded-xl">
          {error}
        </div>
      )}

      {loading ? (
        <div className="w-full py-24 flex flex-col items-center justify-center gap-3 text-white/50">
          <RefreshCw className="animate-spin text-indigo-400" size={32} />
          <p className="text-sm font-medium">Computing signal waves and forward candle trajectories...</p>
        </div>
      ) : (
        <>
          {/* Executive KPI Strip */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-6 gap-4">
            <div className="bg-white/[0.03] border border-white/10 rounded-2xl p-4 min-h-[135px] flex flex-col justify-between">
              <div className="flex items-center justify-between text-white/45 text-xs font-semibold uppercase">
                <span>Signal Waves</span>
                <Layers size={15} className="text-indigo-400" />
              </div>
              <div className="mt-2 flex flex-col justify-end">
                <div className="h-9 flex items-baseline">
                  <span className="text-3xl font-black text-white tracking-tight">{mainStats.evaluatedCount}</span>
                </div>
                <div className="text-xs text-white/45 mt-1 truncate">
                  {filteredEpisodes.length} total waves ({rawData.total_raw_signals} alerts)
                </div>
              </div>
            </div>

            <div className="bg-white/[0.03] border border-white/10 rounded-2xl p-4 min-h-[135px] flex flex-col justify-between">
              <div className="flex items-center justify-between text-white/45 text-xs font-semibold uppercase">
                <span>Win Rate ({HORIZON_CONFIG.find((h) => h.key === activeHorizon)?.short})</span>
                <Award size={15} className="text-emerald-400" />
              </div>
              <div className="mt-2 flex flex-col justify-end">
                <div className="h-9 flex items-baseline">
                  <span className="text-3xl font-black text-emerald-400 tracking-tight">
                    {mainStats.winRate.toFixed(1)}%
                  </span>
                </div>
                <div className="w-full h-1.5 bg-rose-500/30 rounded-full overflow-hidden mt-2">
                  <div
                    className="h-full bg-emerald-400 rounded-full"
                    style={{ width: `${Math.min(100, Math.max(0, mainStats.winRate))}%` }}
                  />
                </div>
              </div>
            </div>

            <div className="bg-white/[0.03] border border-white/10 rounded-2xl p-4 min-h-[135px] flex flex-col justify-between">
              <div className="flex items-center justify-between text-white/45 text-xs font-semibold uppercase">
                <span>Avg / Median Return</span>
                <TrendingUp size={15} className="text-sky-400" />
              </div>
              <div className="mt-2 flex flex-col justify-end">
                <div className="h-9 flex items-baseline">
                  <span className={`text-3xl font-black tracking-tight ${getPctColor(mainStats.avgReturn)}`}>
                    {formatPct(mainStats.avgReturn)}
                  </span>
                </div>
                <div className="text-xs text-white/50 mt-1">
                  Median: <span className={getPctColor(mainStats.medianReturn)}>{formatPct(mainStats.medianReturn)}</span>
                </div>
              </div>
            </div>

            <div className="bg-emerald-500/[0.06] border border-emerald-500/20 rounded-2xl p-4 min-h-[135px] flex flex-col justify-between">
              <div className="flex items-center justify-between text-emerald-300/70 text-xs font-semibold uppercase">
                <span>Big Winners (≥ +10%)</span>
                <Flame size={15} className="text-emerald-400" />
              </div>
              <div className="mt-2 flex flex-col justify-end">
                <div className="h-9 flex items-baseline">
                  <span className="text-3xl font-black text-emerald-300 tracking-tight">
                    {mainStats.hit10Rate.toFixed(1)}%
                  </span>
                </div>
                <div className="text-xs text-emerald-200/60 mt-1 truncate">
                  {mainStats.hit10Count || 0} waves ≥+10% • {mainStats.hit20Rate.toFixed(1)}% (≥+20%)
                </div>
              </div>
            </div>

            <div className="bg-rose-500/[0.06] border border-rose-500/20 rounded-2xl p-4 min-h-[135px] flex flex-col justify-between">
              <div className="flex items-center justify-between text-rose-300/70 text-xs font-semibold uppercase">
                <span>{returnMode === 'peak' ? 'Deep Drawdown (≤ -10%)' : 'Deep Losses (≤ -10%)'}</span>
                <AlertTriangle size={15} className="text-rose-400" />
              </div>
              <div className="mt-2 flex flex-col justify-end">
                <div className="h-9 flex items-baseline">
                  <span className="text-3xl font-black text-rose-300 tracking-tight">
                    {mainStats.loss10Rate.toFixed(1)}%
                  </span>
                </div>
                <div className="text-xs text-rose-200/60 mt-1 truncate">
                  {mainStats.loss10Count || 0} waves ≤-10% • {mainStats.loss5Rate.toFixed(1)}% (≤-5%)
                </div>
              </div>
            </div>

            <div className="bg-white/[0.03] border border-white/10 rounded-2xl p-4 min-h-[135px] flex flex-col justify-between">
              <div className="flex items-center justify-between text-white/45 text-xs font-semibold uppercase">
                <span>Avg Peak / Drawdown</span>
                <Activity size={15} className="text-purple-400" />
              </div>
              <div className="mt-2 flex flex-col justify-end">
                <div className="h-9 flex items-baseline gap-1.5 overflow-hidden">
                  <span className="text-2xl font-black text-emerald-400 tracking-tight">
                    +{mainStats.avgMfe.toFixed(1)}%
                  </span>
                  <span className="text-white/30 text-lg">/</span>
                  <span className="text-2xl font-black text-rose-400 tracking-tight">
                    {mainStats.avgMae.toFixed(1)}%
                  </span>
                </div>
                <div className="text-xs text-white/45 mt-1 truncate">
                  MFE/MAE Asymmetry:{' '}
                  <span className="text-white font-bold">
                    {mainStats.avgMae < 0 ? (mainStats.avgMfe / Math.abs(mainStats.avgMae)).toFixed(2) : '—'}x
                  </span>
                </div>
              </div>
            </div>
          </div>

          {/* Section 1: Return Distribution & Multi-Horizon Matrix */}
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
            {/* Return Distribution Histogram (5 cols) */}
            <div className="lg:col-span-5 bg-white/[0.03] border border-white/10 rounded-2xl p-6 flex flex-col justify-between">
              <div>
                <div className="flex items-center justify-between gap-2 mb-1">
                  <h3 className="text-lg font-bold text-white flex items-center gap-2">
                    <BarChart3 size={18} className="text-indigo-400" />
                    <span>Return Distribution ({activeHorizonLabel})</span>
                  </h3>
                  {selectedBucketId && (
                    <button
                      onClick={() => setSelectedBucketId(null)}
                      className="text-xs text-indigo-300 hover:text-indigo-200 underline cursor-pointer"
                    >
                      Clear Filter
                    </button>
                  )}
                </div>
                <p className="text-xs text-white/45 mb-5">
                  Percentage of analyses landing in each return bucket. Click any bar to filter the episode table below.
                </p>

                <div className="space-y-3.5">
                  {mainStats.buckets.map((b) => {
                    const isSelected = selectedBucketId === b.id;
                    return (
                      <div
                        key={b.id}
                        onClick={() => setSelectedBucketId(isSelected ? null : b.id)}
                        className={`p-3 rounded-xl border transition-all cursor-pointer ${
                          isSelected
                            ? `${b.bgSoft} ${b.border} ring-1 ring-indigo-400`
                            : 'bg-black/30 border-white/5 hover:border-white/15'
                        }`}
                      >
                        <div className="flex items-center justify-between text-xs mb-1.5">
                          <span className={`font-bold ${b.text}`}>{b.label}</span>
                          <span className="font-mono text-white/90 font-bold">
                            {b.pct.toFixed(1)}%{' '}
                            <span className="text-white/40 font-normal">({b.count} waves)</span>
                          </span>
                        </div>
                        <div className="w-full h-2.5 bg-white/5 rounded-full overflow-hidden">
                          <div
                            className={`h-full ${b.color} rounded-full transition-all duration-500`}
                            style={{ width: `${Math.max(b.count > 0 ? 2 : 0, b.pct)}%` }}
                          />
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>

              <div className="mt-5 pt-4 border-t border-white/10 text-xs text-white/60 flex items-center justify-between">
                <span>
                  Summary: <strong className="text-emerald-300">{mainStats.hit10Rate.toFixed(1)}%</strong> of signals gained +10% or more, while{' '}
                  <strong className="text-rose-300">{mainStats.loss10Rate.toFixed(1)}%</strong> dropped -10% or worse.
                </span>
              </div>
            </div>

            {/* Multi-Horizon Comparison Matrix (7 cols) */}
            <div className="lg:col-span-7 bg-white/[0.03] border border-white/10 rounded-2xl p-6 flex flex-col justify-between">
              <div>
                <h3 className="text-lg font-bold text-white flex items-center gap-2 mb-1">
                  <Calendar size={18} className="text-indigo-400" />
                  <span>Multi-Horizon Performance Matrix (3D • 1W • 1M • 3M)</span>
                </h3>
                <p className="text-xs text-white/45 mb-5">
                  Side-by-side comparison of win rate, average/median return, and outlier hit rates across all forward holding periods.
                </p>

                <div className="overflow-x-auto">
                  <table className="w-full text-left border-collapse">
                    <thead>
                      <tr className="border-b border-white/10 text-[11px] uppercase text-white/45">
                        <th className="py-3 px-3">Horizon</th>
                        <th className="py-3 px-3 text-right">Waves</th>
                        <th className="py-3 px-3 text-right">Win Rate</th>
                        <th className="py-3 px-3 text-right">Avg Return</th>
                        <th className="py-3 px-3 text-right">Median</th>
                        <th className="py-3 px-3 text-right text-emerald-300">≥ +10% Hit</th>
                        <th className="py-3 px-3 text-right text-emerald-300">≥ +20% Hit</th>
                        <th className="py-3 px-3 text-right text-rose-300">≤ -10% Drop</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-white/5 text-sm">
                      {horizonMatrix.map((row) => {
                        const st = row.stats;
                        const isCurrent = activeHorizon === row.key;
                        return (
                          <tr
                            key={row.key}
                            onClick={() => setActiveHorizon(row.key)}
                            className={`transition-colors cursor-pointer ${
                              isCurrent ? 'bg-indigo-500/15' : 'hover:bg-white/5'
                            }`}
                          >
                            <td className="py-3.5 px-3 font-bold text-white flex items-center gap-2">
                              <span
                                className={`w-2 h-2 rounded-full ${
                                  isCurrent ? 'bg-indigo-400' : 'bg-white/20'
                                }`}
                              />
                              <span>{row.label}</span>
                            </td>
                            <td className="py-3.5 px-3 text-right font-mono text-white/70">
                              {st.evaluatedCount}
                            </td>
                            <td className="py-3.5 px-3 text-right font-mono font-bold text-white">
                              {st.winRate.toFixed(1)}%
                            </td>
                            <td className={`py-3.5 px-3 text-right font-mono ${getPctColor(st.avgReturn)}`}>
                              {formatPct(st.avgReturn)}
                            </td>
                            <td className={`py-3.5 px-3 text-right font-mono ${getPctColor(st.medianReturn)}`}>
                              {formatPct(st.medianReturn)}
                            </td>
                            <td className="py-3.5 px-3 text-right font-mono font-bold text-emerald-300">
                              {st.hit10Rate.toFixed(1)}%{' '}
                              <span className="text-[11px] text-white/35 font-normal">({st.hit10Count || 0})</span>
                            </td>
                            <td className="py-3.5 px-3 text-right font-mono font-semibold text-emerald-400/90">
                              {st.hit20Rate.toFixed(1)}%{' '}
                              <span className="text-[11px] text-white/35 font-normal">({st.hit20Count || 0})</span>
                            </td>
                            <td className="py-3.5 px-3 text-right font-mono font-semibold text-rose-400">
                              {st.loss10Rate.toFixed(1)}%{' '}
                              <span className="text-[11px] text-white/35 font-normal">({st.loss10Count || 0})</span>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>

              {/* Post-Signal Average Trajectory Curve SVG */}
              {trajectoryCurve.length > 1 && (
                <div className="mt-6 pt-5 border-t border-white/10">
                  <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
                    <div>
                      <h4 className="text-xs font-bold uppercase tracking-wider text-white/70">
                        Average Post-Signal Trajectory Curve — {returnMode === 'peak' ? 'Running Peak Gain (MFE)' : 'Close Return'} (Day 1 to Day 25)
                      </h4>
                      <p className="text-[11px] text-white/40">
                        {returnMode === 'peak'
                          ? 'Average cumulative highest peak gain reached up to each trading day post-signal'
                          : 'Average cumulative close return path across trading days following initial signal detection'}
                      </p>
                    </div>
                    <div className="flex items-center gap-3 text-[11px]">
                      <span className="flex items-center gap-1 text-emerald-300">
                        <span className="w-2.5 h-0.5 bg-emerald-400 inline-block" /> Candidate Avg
                      </span>
                      <span className="flex items-center gap-1 text-indigo-300">
                        <span className="w-2.5 h-0.5 bg-indigo-400 inline-block" /> All Signals Avg
                      </span>
                      <span className="flex items-center gap-1 text-amber-300">
                        <span className="w-2.5 h-0.5 bg-amber-400 inline-block" /> Watch Avg
                      </span>
                    </div>
                  </div>

                  <TrajectoryChart points={trajectoryCurve} />
                </div>
              )}
            </div>
          </div>

          {/* Section 2: What Works vs What Doesn't (Factor Attribution Matrix) */}
          <div className="bg-white/[0.03] border border-white/10 rounded-2xl p-6">
            <div className="mb-5">
              <h3 className="text-xl font-bold text-white flex items-center gap-2">
                <Zap size={20} className="text-amber-400" />
                <span>What Works vs What Doesn&apos;t — Technical Factor Attribution ({activeHorizonLabel})</span>
              </h3>
              <p className="text-xs text-white/45 mt-1">
                Compare win rates, average returns, and +10% outlier rates across signal statuses, score tiers, technical setup mechanics, and alert persistence.
              </p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <FactorCard
                title="1. Signal Status (Candidate vs Watch)"
                subtitle="Performance comparison between full Candidates, upgraded setups, and Watch-only alerts"
                rows={factorAnalysis.byStatus}
              />
              <FactorCard
                title="2. Analysis Score Tiers (Setup Quality)"
                subtitle="Do higher setup scores translate into stronger forward returns?"
                rows={factorAnalysis.byScore}
              />
              <FactorCard
                title="3. Technical Setup Mechanics (Tightness, Volume & RS)"
                subtitle="Impact of price tightness, volume dry-up, and high relative strength on swing returns"
                rows={factorAnalysis.bySetupMechanics}
              />
              <FactorCard
                title="4. Alert Persistence & Moving Average Extension"
                subtitle="Multi-day persistent alert streaks vs single-day alerts & low-extension entries"
                rows={factorAnalysis.byPersistence}
              />
            </div>
          </div>

          {/* Section 3: Hall of Fame (Best) & Hall of Shame (Worst) */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Best Performers */}
            <div className="bg-emerald-950/15 border border-emerald-500/20 rounded-2xl p-6">
              <div className="flex items-center justify-between mb-4">
                <div>
                  <h3 className="text-lg font-bold text-emerald-300 flex items-center gap-2">
                    <Award size={18} />
                    <span>Best Performers (Hall of Fame • {activeHorizonLabel})</span>
                  </h3>
                  <p className="text-xs text-white/45">
                    Top-performing signal waves for the selected horizon and return mode
                  </p>
                </div>
              </div>

              <div className="space-y-2.5 max-h-[620px] overflow-y-auto custom-scrollbar pr-1">
                {bestPerformers.map(({ ep, val }, idx) => (
                  <div
                    key={ep.id}
                    onClick={() => setSelectedEpisode(ep)}
                    className="flex items-center justify-between p-3 rounded-xl bg-black/40 hover:bg-emerald-500/10 border border-white/5 hover:border-emerald-500/30 transition-all cursor-pointer"
                  >
                    <div className="flex items-center gap-3">
                      <span className="w-6 h-6 rounded-lg bg-emerald-500/20 text-emerald-300 text-xs font-black flex items-center justify-center">
                        #{idx + 1}
                      </span>
                      <div>
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="font-black text-white">{ep.symbol}</span>
                          {ep.total_episodes_for_symbol > 1 && (
                            <span className="text-[10px] px-1.5 py-0.5 rounded bg-purple-500/20 text-purple-300 font-bold">
                              Wave #{ep.episode_number}/{ep.total_episodes_for_symbol}
                            </span>
                          )}
                          <span
                            className={`text-[10px] px-1.5 py-0.5 rounded font-bold uppercase ${
                              ep.peak_status === 'candidate'
                                ? 'bg-emerald-500/20 text-emerald-300'
                                : 'bg-amber-500/20 text-amber-300'
                            }`}
                          >
                            {ep.peak_status} ({ep.max_score})
                          </span>
                          {ep.initial_reason?.is_tight && (
                            <span className="text-[10px] text-teal-300/80">Tight</span>
                          )}
                          {ep.initial_reason?.is_dry && (
                            <span className="text-[10px] text-sky-300/80">Dry</span>
                          )}
                          <MyTradeBadge myTrade={ep.my_trade} />
                        </div>
                        <div className="text-xs text-white/45 mt-0.5">
                          {ep.start_date} ({ep.alert_days}d alerts) • Entry: ${ep.entry_price}
                        </div>
                      </div>
                    </div>

                    <div className="text-right">
                      <div className="text-base font-mono font-black text-emerald-300">
                        {formatPct(val)}
                      </div>
                      <div className="text-[11px] font-mono text-white/45">
                        Max Peak: +{ep.mfe ?? 0}% ({ep.mfe_days ?? '—'}d)
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Worst Performers */}
            <div className="bg-rose-950/15 border border-rose-500/20 rounded-2xl p-6">
              <div className="flex items-center justify-between mb-4">
                <div>
                  <h3 className="text-lg font-bold text-rose-300 flex items-center gap-2">
                    <TrendingDown size={18} />
                    <span>Worst Performers (Hall of Shame • {activeHorizonLabel})</span>
                  </h3>
                  <p className="text-xs text-white/45">
                    Lowest-performing / failed signal waves for the selected horizon
                  </p>
                </div>
              </div>

              <div className="space-y-2.5 max-h-[620px] overflow-y-auto custom-scrollbar pr-1">
                {worstPerformers.map(({ ep, val }, idx) => (
                  <div
                    key={ep.id}
                    onClick={() => setSelectedEpisode(ep)}
                    className="flex items-center justify-between p-3 rounded-xl bg-black/40 hover:bg-rose-500/10 border border-white/5 hover:border-rose-500/30 transition-all cursor-pointer"
                  >
                    <div className="flex items-center gap-3">
                      <span className="w-6 h-6 rounded-lg bg-rose-500/20 text-rose-300 text-xs font-black flex items-center justify-center">
                        #{idx + 1}
                      </span>
                      <div>
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="font-black text-white">{ep.symbol}</span>
                          {ep.total_episodes_for_symbol > 1 && (
                            <span className="text-[10px] px-1.5 py-0.5 rounded bg-purple-500/20 text-purple-300 font-bold">
                              Wave #{ep.episode_number}/{ep.total_episodes_for_symbol}
                            </span>
                          )}
                          <span
                            className={`text-[10px] px-1.5 py-0.5 rounded font-bold uppercase ${
                              ep.peak_status === 'candidate'
                                ? 'bg-emerald-500/20 text-emerald-300'
                                : 'bg-amber-500/20 text-amber-300'
                            }`}
                          >
                            {ep.peak_status} ({ep.max_score})
                          </span>
                          {ep.initial_reason?.is_tight && (
                            <span className="text-[10px] text-teal-300/80">Tight</span>
                          )}
                          {ep.initial_reason?.is_dry && (
                            <span className="text-[10px] text-sky-300/80">Dry</span>
                          )}
                          <MyTradeBadge myTrade={ep.my_trade} />
                        </div>
                        <div className="text-xs text-white/45 mt-0.5">
                          {ep.start_date} ({ep.alert_days}d alerts) • Entry: ${ep.entry_price}
                        </div>
                      </div>
                    </div>

                    <div className="text-right">
                      <div className="text-base font-mono font-black text-rose-400">
                        {formatPct(val)}
                      </div>
                      <div className="text-[11px] font-mono text-white/45">
                        Max DD: {formatPct(ep.mae)} ({ep.mae_days ?? '—'}d)
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* Section 4: Full Interactive Episode Explorer Table */}
          <div className="bg-white/[0.03] border border-white/10 rounded-2xl overflow-hidden">
            <div className="p-5 border-b border-white/10 flex flex-wrap items-center justify-between gap-4">
              <div>
                <h3 className="text-lg font-bold text-white flex items-center gap-2">
                  <span>All Signal Waves ({tableEpisodes.length} Episodes)</span>
                  {selectedBucketId && (
                    <span className="px-2.5 py-0.5 rounded-full text-xs bg-indigo-500/20 text-indigo-300 border border-indigo-500/30">
                      Bucket: {RETURN_BUCKETS.find((b) => b.id === selectedBucketId)?.short}
                    </span>
                  )}
                </h3>
                <p className="text-xs text-white/45 mt-0.5">
                  Click any row to open the interactive candlestick chart with signal markers, moving averages, and factor breakdown.
                </p>
              </div>

              <div className="flex items-center gap-3">
                <div className="relative">
                  <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-white/40" />
                  <input
                    type="text"
                    placeholder="Search symbol or sector (e.g. AAPL)..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="pl-9 pr-4 py-1.5 rounded-xl bg-black/40 border border-white/10 text-xs text-white placeholder:text-white/35 focus:outline-none focus:border-indigo-500 w-64"
                  />
                </div>
              </div>
            </div>

            <div className="overflow-x-auto max-h-[680px] custom-scrollbar">
              <table className="w-full text-left border-collapse whitespace-nowrap">
                <thead className="sticky top-0 bg-[#101016]/95 backdrop-blur z-10 text-[11px] uppercase tracking-wider text-white/45 border-b border-white/10">
                  <tr>
                    <th
                      onClick={() => handleSort('symbol')}
                      className="py-3.5 px-4 cursor-pointer hover:text-white"
                    >
                      Symbol / Wave
                    </th>
                    <th
                      onClick={() => handleSort('start_date')}
                      className="py-3.5 px-4 cursor-pointer hover:text-white"
                    >
                      Signal Window
                    </th>
                    <th
                      onClick={() => handleSort('max_score')}
                      className="py-3.5 px-4 cursor-pointer hover:text-white"
                    >
                      Status & Score
                    </th>
                    <th className="py-3.5 px-4">Setup Traits</th>
                    <th className="py-3.5 px-4 text-right">Entry → Latest</th>
                    <th
                      onClick={() => handleSort('3d')}
                      className="py-3.5 px-4 text-right cursor-pointer hover:text-white"
                    >
                      3 Days (3D)
                    </th>
                    <th
                      onClick={() => handleSort('1w')}
                      className="py-3.5 px-4 text-right cursor-pointer hover:text-white"
                    >
                      1 Week (1W)
                    </th>
                    <th
                      onClick={() => handleSort('1m')}
                      className="py-3.5 px-4 text-right cursor-pointer hover:text-white"
                    >
                      1 Month (1M)
                    </th>
                    <th
                      onClick={() => handleSort('3m')}
                      className="py-3.5 px-4 text-right cursor-pointer hover:text-white"
                    >
                      3 Months (3M)
                    </th>
                    <th
                      onClick={() => handleSort('mfe')}
                      className="py-3.5 px-4 text-right cursor-pointer hover:text-emerald-300"
                    >
                      Max Peak (MFE)
                    </th>
                    <th
                      onClick={() => handleSort('mae')}
                      className="py-3.5 px-4 text-right cursor-pointer hover:text-rose-300"
                    >
                      Max DD (MAE)
                    </th>
                    <th className="py-3.5 px-4 text-center">Chart</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-white/5 text-xs">
                  {tableEpisodes.map((ep) => {
                    const v3d = getEpisodeHorizonValue(ep, '3d', returnMode, includePartial);
                    const v1w = getEpisodeHorizonValue(ep, '1w', returnMode, includePartial);
                    const v1m = getEpisodeHorizonValue(ep, '1m', returnMode, includePartial);
                    const v3m = getEpisodeHorizonValue(ep, '3m', returnMode, includePartial);
                    const r = ep.initial_reason || {};

                    return (
                      <tr
                        key={ep.id}
                        onClick={() => setSelectedEpisode(ep)}
                        className="hover:bg-white/[0.04] transition-colors cursor-pointer"
                      >
                        <td className="py-3 px-4">
                          <div className="flex items-center gap-2">
                            <span className="font-black text-sm text-white">{ep.symbol}</span>
                            {ep.total_episodes_for_symbol > 1 ? (
                              <span className="px-2 py-0.5 rounded-md text-[10px] font-bold bg-purple-500/20 text-purple-300 border border-purple-500/30">
                                Wave #{ep.episode_number}/{ep.total_episodes_for_symbol}
                              </span>
                            ) : (
                              <span className="text-[10px] text-white/30">Wave #1</span>
                            )}
                            <MyTradeBadge myTrade={ep.my_trade} />
                          </div>
                          <div className="text-[11px] text-white/40 truncate max-w-[160px]">
                            {ep.sector}
                          </div>
                        </td>

                        <td className="py-3 px-4">
                          <div className="font-mono text-white/90 font-semibold">
                            {ep.start_date}
                            {ep.end_date !== ep.start_date ? ` → ${ep.end_date.slice(5)}` : ''}
                          </div>
                          <div className="text-[11px] text-white/45 flex items-center gap-1.5 mt-0.5">
                            <span>{ep.alert_days}d alerts</span>
                            <span>•</span>
                            <span>{ep.trading_days_elapsed}d elapsed</span>
                          </div>
                        </td>

                        <td className="py-3 px-4">
                          <div className="flex items-center gap-1.5">
                            <span
                              className={`px-2 py-0.5 rounded font-bold uppercase text-[10px] ${
                                ep.peak_status === 'candidate'
                                  ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30'
                                  : 'bg-amber-500/20 text-amber-300 border border-amber-500/30'
                              }`}
                            >
                              {ep.peak_status}
                            </span>
                            <span className="font-mono font-bold text-white">{ep.max_score}</span>
                            {ep.upgraded_to_candidate && (
                              <span
                                className="px-1.5 py-0.5 rounded bg-indigo-500/20 text-indigo-300 text-[10px] font-bold"
                                title="Started as Watch and upgraded to Candidate"
                              >
                                ⬆️ Upgraded
                              </span>
                            )}
                          </div>
                        </td>

                        <td className="py-3 px-4">
                          <div className="flex items-center gap-1.5">
                            {r.is_tight && (
                              <span className="px-1.5 py-0.5 rounded text-[10px] font-semibold bg-teal-500/15 text-teal-300 border border-teal-500/25">
                                Tight
                              </span>
                            )}
                            {r.is_dry && (
                              <span className="px-1.5 py-0.5 rounded text-[10px] font-semibold bg-sky-500/15 text-sky-300 border border-sky-500/25">
                                Dry
                              </span>
                            )}
                            {r.rs_score !== undefined && (
                              <span className="px-1.5 py-0.5 rounded text-[10px] font-mono bg-white/5 text-white/70 border border-white/10">
                                RS:{r.rs_score}
                              </span>
                            )}
                          </div>
                        </td>

                        <td className="py-3 px-4 text-right font-mono text-white/80">
                          ${ep.entry_price ?? '—'} → ${ep.latest_price ?? '—'}
                        </td>

                        <td className={`py-3 px-4 text-right font-mono ${getPctColor(v3d)}`}>
                          {formatPct(v3d)}
                          {!ep.horizons?.['3d']?.completed && v3d !== null && (
                            <span className="text-[10px] text-white/35 ml-0.5" title="3 trading days not yet completed">⏳</span>
                          )}
                        </td>

                        <td className={`py-3 px-4 text-right font-mono ${getPctColor(v1w)}`}>
                          {formatPct(v1w)}
                          {!ep.horizons?.['1w']?.completed && v1w !== null && (
                            <span className="text-[10px] text-white/35 ml-0.5" title="5 trading days not yet completed">⏳</span>
                          )}
                        </td>

                        <td className={`py-3 px-4 text-right font-mono ${getPctColor(v1m)}`}>
                          {formatPct(v1m)}
                          {!ep.horizons?.['1m']?.completed && v1m !== null && (
                            <span className="text-[10px] text-white/35 ml-0.5" title="21 trading days not yet completed">⏳</span>
                          )}
                        </td>

                        <td className={`py-3 px-4 text-right font-mono ${getPctColor(v3m)}`}>
                          {formatPct(v3m)}
                          {!ep.horizons?.['3m']?.completed && v3m !== null && (
                            <span className="text-[10px] text-white/35 ml-0.5" title="63 trading days not yet completed">⏳</span>
                          )}
                        </td>

                        <td className="py-3 px-4 text-right font-mono text-emerald-300 font-bold">
                          {formatPct(ep.mfe)}
                          {ep.mfe_days ? (
                            <span className="text-[10px] text-white/35 font-normal ml-1">({ep.mfe_days}d)</span>
                          ) : null}
                        </td>

                        <td className="py-3 px-4 text-right font-mono text-rose-400">
                          {formatPct(ep.mae)}
                        </td>

                        <td className="py-3 px-4 text-center">
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              setSelectedEpisode(ep);
                            }}
                            className="px-2.5 py-1 rounded-lg bg-indigo-500/20 hover:bg-indigo-500/35 text-indigo-300 border border-indigo-500/30 text-[11px] font-bold transition-colors cursor-pointer"
                          >
                            Inspect
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}
        </>
      )}

      {/* Interactive Episode Candlestick Chart Modal */}
      {selectedEpisode && (
        <EpisodeChartModal
          episode={selectedEpisode}
          allSymbolEpisodes={(rawData.episodes || []).filter(
            (e) => e.symbol === selectedEpisode.symbol && e.analysis_type === selectedEpisode.analysis_type
          )}
          onClose={() => setSelectedEpisode(null)}
          navigate={navigate}
        />
      )}
    </div>
  );
}

function FactorCard({ title, subtitle, rows }) {
  return (
    <div className="bg-black/30 border border-white/10 rounded-xl p-4">
      <h4 className="text-sm font-bold text-white">{title}</h4>
      <p className="text-[11px] text-white/40 mb-3">{subtitle}</p>

      <div className="space-y-2.5">
        {rows.map((r, i) => (
          <div key={i} className="p-2.5 rounded-lg bg-white/[0.02] border border-white/5">
            <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
              <div className="flex items-center gap-2">
                <span className={`px-2 py-0.5 rounded border text-[11px] font-bold ${r.badgeColor}`}>
                  {r.label}
                </span>
                <span className="text-white/40 text-[11px]">({r.evaluatedCount} waves)</span>
              </div>

              <div className="flex items-center gap-3 font-mono text-xs">
                <span className="text-white/70">
                  Win: <strong className="text-white">{r.winRate.toFixed(0)}%</strong>
                </span>
                <span className="text-white/70">
                  Avg: <strong className={getPctColor(r.avgReturn)}>{formatPct(r.avgReturn)}</strong>
                </span>
                <span className="text-emerald-300/90">
                  ≥+10%: <strong>{r.hit10Rate.toFixed(0)}%</strong>
                </span>
              </div>
            </div>

            {/* Mini visual win-rate bar */}
            <div className="w-full h-1.5 bg-white/5 rounded-full overflow-hidden mt-2 flex">
              <div
                className="h-full bg-emerald-400"
                style={{ width: `${Math.min(100, Math.max(0, r.winRate))}%` }}
                title={`Win Rate: ${r.winRate.toFixed(1)}%`}
              />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function TrajectoryChart({ points }) {
  const width = 640;
  const height = 170;
  const padLeft = 42;
  const padRight = 16;
  const padTop = 14;
  const padBottom = 24;

  const allNumbers = points
    .flatMap((p) => [p.allAvg, p.candAvg, p.watchAvg, 0])
    .filter((v) => v !== null && v !== undefined && !Number.isNaN(v));

  const minY = Math.min(-2, ...allNumbers);
  const maxY = Math.max(4, ...allNumbers);
  const rangeY = maxY - minY || 1;

  const toX = (day) =>
    padLeft + ((day - 1) / Math.max(1, points.length - 1)) * (width - padLeft - padRight);
  const toY = (val) =>
    padTop + ((maxY - val) / rangeY) * (height - padTop - padBottom);

  const buildPath = (key) => {
    const validPts = points.filter((p) => p[key] !== null && p[key] !== undefined);
    if (validPts.length < 2) return '';
    return validPts
      .map((p, idx) => `${idx === 0 ? 'M' : 'L'} ${toX(p.day).toFixed(1)} ${toY(p[key]).toFixed(1)}`)
      .join(' ');
  };

  const zeroY = toY(0);

  return (
    <div className="w-full overflow-x-auto">
      <svg viewBox={`0 0 ${width} ${height}`} className="w-full h-44 bg-black/30 rounded-xl border border-white/5">
        {/* Zero baseline */}
        <line
          x1={padLeft}
          y1={zeroY}
          x2={width - padRight}
          y2={zeroY}
          stroke="rgba(255,255,255,0.18)"
          strokeDasharray="4 4"
          strokeWidth="1"
        />
        <text x={padLeft - 6} y={zeroY + 3} textAnchor="end" className="fill-white/40 text-[9px] font-mono">
          0%
        </text>
        <text x={padLeft - 6} y={padTop + 6} textAnchor="end" className="fill-emerald-400/70 text-[9px] font-mono">
          +{maxY.toFixed(1)}%
        </text>
        <text
          x={padLeft - 6}
          y={height - padBottom}
          textAnchor="end"
          className="fill-rose-400/70 text-[9px] font-mono"
        >
          {minY.toFixed(1)}%
        </text>

        {/* X axis day markers */}
        {[1, 3, 5, 10, 15, 21, 25]
          .filter((d) => d <= points.length)
          .map((d) => (
            <g key={d}>
              <line
                x1={toX(d)}
                y1={padTop}
                x2={toX(d)}
                y2={height - padBottom}
                stroke="rgba(255,255,255,0.04)"
              />
              <text
                x={toX(d)}
                y={height - 7}
                textAnchor="middle"
                className="fill-white/45 text-[9px] font-mono"
              >
                {d === 3 ? '3D' : d === 5 ? '1W (5D)' : d === 21 ? '1M (21D)' : `${d}D`}
              </text>
            </g>
          ))}

        {/* Watch curve */}
        <path d={buildPath('watchAvg')} fill="none" stroke="#f59e0b" strokeWidth="1.75" strokeOpacity="0.8" />
        {/* All episodes curve */}
        <path d={buildPath('allAvg')} fill="none" stroke="#6366f1" strokeWidth="2.25" />
        {/* Candidate curve */}
        <path d={buildPath('candAvg')} fill="none" stroke="#10b981" strokeWidth="2.5" />
      </svg>
    </div>
  );
}

function MyPortfolioAnalyticsView({ myPortfolio, episodes, onSelectEpisode }) {
  if (!myPortfolio) {
    return (
      <div className="w-full py-20 bg-white/[0.02] border border-white/10 rounded-2xl text-center text-white/50 text-sm">
        Loading Hürkan&apos;s portfolio &amp; swing trade analytics from Firebase...
      </div>
    );
  }

  const positions = myPortfolio.positions || [];
  const transactions = myPortfolio.all_transactions || [];

  const handleInspectSymbol = (symbol, waveStartDate) => {
    const symEpisodes = episodes.filter((e) => e.symbol === symbol && e.analysis_type === 'qullamaggie');
    if (symEpisodes.length === 0) return;
    const matched =
      symEpisodes.find((e) => waveStartDate && e.start_date === waveStartDate) || symEpisodes[0];
    if (matched) onSelectEpisode(matched);
  };

  return (
    <div className="space-y-6">
      {/* Top 6 KPI Cards for Hürkan's Personal Portfolio */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-6 gap-4">
        <div className="bg-white/[0.03] border border-white/10 rounded-2xl p-4 min-h-[135px] flex flex-col justify-between">
          <div className="flex items-center justify-between text-white/45 text-xs font-semibold uppercase">
            <span>Account Value (USD)</span>
            <DollarSign size={15} className="text-indigo-400" />
          </div>
          <div className="mt-2 flex flex-col justify-end">
            <div className="h-9 flex items-baseline">
              <span className="text-2xl font-black text-white font-mono tracking-tight">
                {formatUsd(myPortfolio.total_portfolio_usd)}
              </span>
            </div>
            <div className="text-xs text-white/45 mt-1 truncate">
              User: <strong className="text-white/80">{myPortfolio.user_name}</strong> (Personal Account)
            </div>
          </div>
        </div>

        <div className="bg-white/[0.03] border border-white/10 rounded-2xl p-4 min-h-[135px] flex flex-col justify-between">
          <div className="flex items-center justify-between text-white/45 text-xs font-semibold uppercase">
            <span>Open Risk vs Budget</span>
            <AlertTriangle size={15} className="text-amber-400" />
          </div>
          <div className="mt-2 flex flex-col justify-end">
            <div className="h-9 flex items-baseline gap-1.5">
              <span className="text-2xl font-black text-amber-300 font-mono tracking-tight">
                {formatUsd(myPortfolio.total_open_risk_usd)}
              </span>
              <span className="text-xs text-white/40 font-mono">
                / {formatUsd(myPortfolio.max_risk_budget_usd)}
              </span>
            </div>
            <div className="text-xs text-white/45 mt-1 truncate">
              Risk Limit: <strong className="text-white">{myPortfolio.risk_limit_pct}%</strong> ({myPortfolio.budget_used_pct}% used)
            </div>
          </div>
        </div>

        <div className="bg-emerald-500/[0.06] border border-emerald-500/20 rounded-2xl p-4 min-h-[135px] flex flex-col justify-between">
          <div className="flex items-center justify-between text-emerald-300/70 text-xs font-semibold uppercase">
            <span>Realized P&amp;L</span>
            <Award size={15} className="text-emerald-400" />
          </div>
          <div className="mt-2 flex flex-col justify-end">
            <div className="h-9 flex items-baseline">
              <span
                className={`text-2xl font-black font-mono tracking-tight ${
                  myPortfolio.total_realized_pnl_usd >= 0 ? 'text-emerald-300' : 'text-rose-400'
                }`}
              >
                {formatUsd(myPortfolio.total_realized_pnl_usd, true)}
              </span>
            </div>
            <div className="text-xs text-white/45 mt-1 truncate">
              Locked in from partial sells &amp; stops
            </div>
          </div>
        </div>

        <div className="bg-white/[0.03] border border-white/10 rounded-2xl p-4 min-h-[135px] flex flex-col justify-between">
          <div className="flex items-center justify-between text-white/45 text-xs font-semibold uppercase">
            <span>Unrealized Open P&amp;L</span>
            <TrendingUp size={15} className="text-sky-400" />
          </div>
          <div className="mt-2 flex flex-col justify-end">
            <div className="h-9 flex items-baseline">
              <span
                className={`text-2xl font-black font-mono tracking-tight ${
                  myPortfolio.total_unrealized_pnl_usd >= 0 ? 'text-emerald-400' : 'text-rose-400'
                }`}
              >
                {formatUsd(myPortfolio.total_unrealized_pnl_usd, true)}
              </span>
            </div>
            <div className="text-xs text-white/45 mt-1 truncate">
              Allocated: <strong className="text-white/80 font-mono">{formatUsd(myPortfolio.total_open_allocated_usd)}</strong>
            </div>
          </div>
        </div>

        <div className="bg-indigo-500/[0.08] border border-indigo-500/25 rounded-2xl p-4 min-h-[135px] flex flex-col justify-between">
          <div className="flex items-center justify-between text-indigo-300/80 text-xs font-semibold uppercase">
            <span>Net Combined P&amp;L</span>
            <Flame size={15} className="text-indigo-400" />
          </div>
          <div className="mt-2 flex flex-col justify-end">
            <div className="h-9 flex items-baseline">
              <span
                className={`text-2xl font-black font-mono tracking-tight ${
                  myPortfolio.total_combined_pnl_usd >= 0 ? 'text-emerald-300' : 'text-rose-400'
                }`}
              >
                {formatUsd(myPortfolio.total_combined_pnl_usd, true)}
              </span>
            </div>
            <div className="text-xs text-indigo-200/60 mt-1 truncate">
              Realized + Open Unrealized P&amp;L
            </div>
          </div>
        </div>

        <div className="bg-white/[0.03] border border-white/10 rounded-2xl p-4 min-h-[135px] flex flex-col justify-between">
          <div className="flex items-center justify-between text-white/45 text-xs font-semibold uppercase">
            <span>Swing Trade Win Rate</span>
            <Activity size={15} className="text-purple-400" />
          </div>
          <div className="mt-2 flex flex-col justify-end">
            <div className="h-9 flex items-baseline gap-2">
              <span className="text-3xl font-black text-emerald-400 tracking-tight">
                {myPortfolio.win_rate_pct}%
              </span>
              <span className="text-xs text-white/50 font-mono">
                ({myPortfolio.win_count}W / {myPortfolio.loss_count}L)
              </span>
            </div>
            <div className="text-xs text-white/45 mt-1 truncate">
              {myPortfolio.total_trades_count} total positions ({myPortfolio.open_trades_count} open)
            </div>
          </div>
        </div>
      </div>

      {/* Positions List */}
      <div className="bg-white/[0.03] border border-white/10 rounded-2xl p-6 space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-white/10 pb-3">
          <div>
            <h3 className="text-lg font-bold text-white flex items-center gap-2">
              <Briefcase size={18} className="text-emerald-400" />
              <span>My Swing Positions &amp; Stock-by-Stock P&amp;L ({positions.length} Positions)</span>
            </h3>
            <p className="text-xs text-white/45">
              All positions opened by Hürkan in Metrixfolio Analysis, enriched with live local candle prices and transaction history.
            </p>
          </div>
        </div>

        {positions.length === 0 ? (
          <div className="py-16 text-center text-white/45 text-sm">
            No swing positions recorded yet in Firebase (`users/{myPortfolio.user_uid}/analysis_positions`). Open a trade on the Metrixfolio Analysis page to see full analytics here.
          </div>
        ) : (
          <div className="space-y-3">
            {positions.map((pos) => (
              <div
                key={pos.id}
                className={`rounded-xl border p-4 space-y-2.5 text-xs ${
                  pos.is_open
                    ? 'bg-indigo-500/[0.06] border-indigo-500/30'
                    : pos.total_pnl_usd >= 0
                      ? 'bg-emerald-500/[0.05] border-emerald-500/25'
                      : 'bg-rose-500/[0.05] border-rose-500/25'
                }`}
              >
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div className="flex flex-wrap items-center gap-2.5">
                    <span className="text-base font-black text-white">{pos.symbol}</span>
                    <span
                      className={`px-2 py-0.5 rounded font-bold text-[10px] uppercase ${
                        pos.is_open
                          ? 'bg-indigo-500/25 text-indigo-200 border border-indigo-500/40'
                          : pos.status === 'CLOSED_WIN' || pos.total_pnl_usd >= 0
                            ? 'bg-emerald-500/20 text-emerald-300'
                            : 'bg-rose-500/20 text-rose-300'
                      }`}
                    >
                      {pos.status}
                    </span>
                    <span className="font-mono text-white/80">
                      Entry: <b>${pos.entry_price.toFixed(2)}</b> • Latest: <b>${pos.current_price.toFixed(2)}</b> • Stop:{' '}
                      <b className="text-rose-400">${pos.stop_price.toFixed(2)}</b>
                    </span>
                    <span className="font-mono text-white/70">
                      Shares: <b>{pos.remaining_shares} / {pos.initial_shares}</b> (Cost: {formatUsd(pos.initial_cost_usd)})
                    </span>
                    {pos.is_open && (
                      <span className="px-2 py-0.5 rounded bg-amber-500/15 border border-amber-500/30 text-amber-300 font-mono">
                        Open Risk: <b>{formatUsd(pos.open_risk_usd)}</b>
                      </span>
                    )}
                  </div>

                  <div className="flex flex-wrap items-center gap-3 font-mono">
                    <span className="text-white/70">
                      Realized:{' '}
                      <strong className={pos.realized_pnl_usd >= 0 ? 'text-emerald-300' : 'text-rose-400'}>
                        {formatUsd(pos.realized_pnl_usd, true)}
                      </strong>
                    </span>
                    {pos.is_open && (
                      <span className="text-white/70">
                        Unrealized:{' '}
                        <strong className={pos.unrealized_pnl_usd >= 0 ? 'text-emerald-300' : 'text-rose-400'}>
                          {formatUsd(pos.unrealized_pnl_usd, true)}
                        </strong>
                      </span>
                    )}
                    <span
                      className={`px-2.5 py-1 rounded-lg font-black ${
                        pos.total_pnl_usd >= 0
                          ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30'
                          : 'bg-rose-500/20 text-rose-300 border border-rose-500/30'
                      }`}
                    >
                      Net: {formatUsd(pos.total_pnl_usd, true)} ({formatPct(pos.total_return_pct)})
                    </span>
                    <button
                      onClick={() => handleInspectSymbol(pos.symbol, pos.wave_start_date)}
                      className="px-2.5 py-1 rounded-lg bg-white/10 hover:bg-white/20 text-white text-[11px] font-sans font-bold cursor-pointer"
                    >
                      Inspect Chart
                    </button>
                  </div>
                </div>

                {Array.isArray(pos.transactions) && pos.transactions.length > 0 && (
                  <div className="flex flex-wrap gap-1.5 pt-2 border-t border-white/10 font-mono text-[11px]">
                    {pos.transactions.map((tx) => (
                      <span
                        key={tx.id}
                        className="px-2.5 py-0.5 rounded bg-black/40 border border-white/10 text-white/80"
                      >
                        <strong
                          className={
                            tx.type === 'BUY'
                              ? 'text-indigo-300'
                              : tx.type === 'PARTIAL_SELL'
                                ? 'text-emerald-300'
                                : 'text-rose-300'
                          }
                        >
                          {tx.type}
                        </strong>
                        : {tx.shares} sh @ ${Number(tx.price).toFixed(2)} ({String(tx.date || '').slice(0, 10)})
                        {tx.pnl_usd !== undefined ? ` • P&L: ${formatUsd(tx.pnl_usd, true)}` : ''}
                        {tx.note ? ` • "${tx.note}"` : ''}
                      </span>
                    ))}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Chronological Transaction Ledger */}
      <div className="bg-white/[0.03] border border-white/10 rounded-2xl overflow-hidden">
        <div className="p-5 border-b border-white/10">
          <h3 className="text-lg font-bold text-white">
            Chronological Execution &amp; Transaction Ledger ({transactions.length} Executions)
          </h3>
          <p className="text-xs text-white/45 mt-0.5">
            Every BUY entry, PARTIAL_SELL profit-taking execution, and STOP_HIT exit recorded under your account.
          </p>
        </div>

        {transactions.length === 0 ? (
          <div className="py-12 text-center text-white/40 text-sm">
            No transactions recorded yet.
          </div>
        ) : (
          <div className="overflow-x-auto max-h-[500px] custom-scrollbar">
            <table className="w-full text-left border-collapse whitespace-nowrap text-xs">
              <thead className="sticky top-0 bg-[#101016]/95 backdrop-blur z-10 text-[11px] uppercase tracking-wider text-white/45 border-b border-white/10">
                <tr>
                  <th className="py-3 px-4">Date</th>
                  <th className="py-3 px-4">Symbol</th>
                  <th className="py-3 px-4">Action Type</th>
                  <th className="py-3 px-4 text-right">Shares</th>
                  <th className="py-3 px-4 text-right">Execution Price</th>
                  <th className="py-3 px-4 text-right">Realized P&amp;L</th>
                  <th className="py-3 px-4">Notes</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/5">
                {transactions.map((tx, i) => (
                  <tr key={tx.id || i} className="hover:bg-white/[0.03]">
                    <td className="py-3 px-4 font-mono text-white/75">
                      {String(tx.date || '').slice(0, 16).replace('T', ' ')}
                    </td>
                    <td className="py-3 px-4 font-black text-white">{tx.symbol}</td>
                    <td className="py-3 px-4">
                      <span
                        className={`px-2 py-0.5 rounded font-bold text-[10px] uppercase ${
                          tx.type === 'BUY'
                            ? 'bg-indigo-500/20 text-indigo-300 border border-indigo-500/30'
                            : tx.type === 'PARTIAL_SELL'
                              ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30'
                              : 'bg-rose-500/20 text-rose-300 border border-rose-500/30'
                        }`}
                      >
                        {tx.type}
                      </span>
                    </td>
                    <td className="py-3 px-4 text-right font-mono text-white/90">{tx.shares}</td>
                    <td className="py-3 px-4 text-right font-mono text-white">
                      ${Number(tx.price || 0).toFixed(2)}
                    </td>
                    <td className="py-3 px-4 text-right font-mono font-bold">
                      {tx.pnl_usd !== undefined ? (
                        <span className={tx.pnl_usd >= 0 ? 'text-emerald-300' : 'text-rose-400'}>
                          {formatUsd(tx.pnl_usd, true)}
                        </span>
                      ) : (
                        <span className="text-white/30">—</span>
                      )}
                    </td>
                    <td className="py-3 px-4 text-white/60">{tx.note || '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}

