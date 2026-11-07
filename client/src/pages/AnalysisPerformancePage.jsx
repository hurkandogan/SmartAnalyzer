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
  Radio,
} from 'lucide-react';
import MarketStatusCockpit from '../components/MarketStatusCockpit';
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

const MONTHS_CONFIG = [
  { num: 1, label: 'Jan', full: 'January' },
  { num: 2, label: 'Feb', full: 'February' },
  { num: 3, label: 'Mar', full: 'March' },
  { num: 4, label: 'Apr', full: 'April' },
  { num: 5, label: 'May', full: 'May' },
  { num: 6, label: 'Jun', full: 'June' },
  { num: 7, label: 'Jul', full: 'July' },
  { num: 8, label: 'Aug', full: 'August' },
  { num: 9, label: 'Sep', full: 'September' },
  { num: 10, label: 'Oct', full: 'October' },
  { num: 11, label: 'Nov', full: 'November' },
  { num: 12, label: 'Dec', full: 'December' },
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

function ConvictionBadge({ ep }) {
  const conv = ep?.conviction || ep?.initial_reason?.conviction;
  const tier = ep?.conviction_tier || conv?.tier;
  const score = ep?.conviction_score ?? conv?.score;
  if (!tier || score === undefined || score === null) return null;

  const b = conv?.breakdown || {};
  const tooltip = `5-Pillar Conviction: ${score}/100 (${tier})\n• Sector Wind: ${b.sector?.score ?? 0}/20 (${b.sector?.label || ''})\n• ADR% Fuel: ${b.adr?.score ?? 0}/20 (${b.adr?.label || ''})\n• Tight + Vol: ${b.tight_vol?.score ?? 0}/25 (${b.tight_vol?.label || ''})\n• Stop & R:R: ${b.risk?.score ?? 0}/20 (${b.risk?.label || ''})\n• Catalyst & RS: ${b.catalyst?.score ?? 0}/15 (${b.catalyst?.label || ''})`;

  const style =
    tier === 'A+'
      ? 'bg-amber-500/25 text-amber-200 border-amber-400/50 shadow-[0_0_10px_rgba(245,158,11,0.2)]'
      : tier === 'A'
        ? 'bg-emerald-500/20 text-emerald-200 border-emerald-500/40'
        : tier === 'B'
          ? 'bg-sky-500/15 text-sky-200 border-sky-500/30'
          : 'bg-white/5 text-white/45 border-white/10';

  const icon = tier === 'A+' ? '🏆' : tier === 'A' ? '🔥' : tier === 'B' ? '⚡' : '•';

  return (
    <span
      className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] font-mono font-black border ${style}`}
      title={tooltip}
    >
      <span>{icon}</span>
      <span>{tier}</span>
      <span className="opacity-60">•</span>
      <span>{score}</span>
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

function getEpisodeTrajectory(ep, entryBasis = 'first_alert') {
  if (!ep) return null;
  if (entryBasis === 'candidate_trigger' && ep.candidate_entry) {
    return ep.candidate_entry;
  }
  return ep;
}

function getEpisodeHorizonValue(ep, horizonKey, returnMode, includePartial, entryBasis = 'first_alert') {
  const traj = getEpisodeTrajectory(ep, entryBasis);
  if (!traj) return null;
  if (!traj.trading_days_elapsed || traj.trading_days_elapsed <= 0) return null;

  if (horizonKey === 'overall') {
    if (!includePartial && traj.trading_days_elapsed < 5) return null;
    return returnMode === 'peak' ? traj.mfe : traj.current_return;
  }
  const h = traj.horizons?.[horizonKey];
  if (!h) return null;
  if (returnMode === 'peak') {
    if (!includePartial && !h.completed) return null;
    return h.days_available > 0 ? h.max_gain : null;
  }
  if (h.completed) return h.close_return;
  if (includePartial && h.days_available > 0) return h.to_date_return;
  return null;
}

function computeGroupStats(episodes, horizonKey, returnMode, includePartial, entryBasis = 'first_alert') {
  const valid = [];
  const mfeList = [];
  const maeList = [];
  const ddList = [];

  for (const ep of episodes) {
    const val = getEpisodeHorizonValue(ep, horizonKey, returnMode, includePartial, entryBasis);
    if (val === null || val === undefined || Number.isNaN(val)) {
      continue;
    }
    valid.push(val);

    const traj = getEpisodeTrajectory(ep, entryBasis);
    if (!traj) continue;

    // Horizon-specific peak gain and drawdown for evaluated episodes only
    if (horizonKey === 'overall') {
      if (traj.mfe !== null && traj.mfe !== undefined) mfeList.push(traj.mfe);
      if (traj.mae !== null && traj.mae !== undefined) {
        const clampedMae = Math.min(0, traj.mae);
        maeList.push(clampedMae);
        ddList.push(clampedMae);
      }
    } else {
      const h = traj.horizons?.[horizonKey];
      if (h) {
        if (h.max_gain !== null && h.max_gain !== undefined) {
          mfeList.push(h.max_gain);
        }
        if (h.max_dd !== null && h.max_dd !== undefined) {
          const clampedDd = Math.min(0, h.max_dd);
          maeList.push(clampedDd);
          ddList.push(clampedDd);
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
      hit10Count: 0,
      hit20Count: 0,
      loss5Rate: 0,
      loss10Rate: 0,
      loss10Count: 0,
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

    // If upgraded from Watch to Candidate, also show Candidate Upgrade Entry Price line
    if (
      episode.upgraded_to_candidate &&
      episode.candidate_entry?.entry_price &&
      episode.candidate_entry.entry_price !== episode.entry_price
    ) {
      candleSeries.createPriceLine({
        price: episode.candidate_entry.entry_price,
        color: '#10b981',
        lineWidth: 1,
        lineStyle: LineStyle.Dotted,
        axisLabelVisible: true,
        title: `Cand Upgrade: $${episode.candidate_entry.entry_price}`,
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
        const markerKey = `${cDate}-${otherEp.id}`;
        // Never overwrite an initial Wave # arrow marker if multiple signals fall on the latest candle
        if (markersMap.has(markerKey) && !isFirst) return;
        markersMap.set(markerKey, {
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
        text: `Peak ${formatPct(episode.mfe)} (${episode.mfe_days}d)`,
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
  const isEarlySurf = episode.analysis_type === 'early_surf';
  const esMetrics = r.metrics || {};
  const esBreakdown = r.breakdown || {};
  const esTrade = r.trade_params || {};

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
          <div className="flex flex-wrap items-center gap-3">
            <span className="text-2xl font-black tracking-tight text-white">{episode.symbol}</span>
            <span
              className={`px-2.5 py-1 rounded-lg text-xs font-bold border ${
                isEarlySurf
                  ? 'bg-cyan-500/20 text-cyan-300 border-cyan-500/30'
                  : 'bg-indigo-500/20 text-indigo-300 border-indigo-500/30'
              }`}
            >
              {isEarlySurf ? 'Early Surf' : 'Qullamaggie'} • Wave #{episode.episode_number} / {episode.total_episodes_for_symbol}
            </span>
            <span
              className={`px-2.5 py-1 rounded-lg text-xs font-bold uppercase ${
                episode.peak_status === 'candidate'
                  ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30'
                  : 'bg-amber-500/20 text-amber-300 border border-amber-500/30'
              }`}
            >
              {episode.peak_status} (Entry: {episode.initial_score} • Max: {episode.max_score})
            </span>
            <ConvictionBadge ep={episode} />
            {!isEarlySurf && r.is_tight && (
              <span className="px-2.5 py-1 rounded-lg text-xs font-semibold bg-teal-500/15 text-teal-300 border border-teal-500/25">
                Tight Flag ✅
              </span>
            )}
            {!isEarlySurf && r.is_dry && (
              <span className="px-2.5 py-1 rounded-lg text-xs font-semibold bg-sky-500/15 text-sky-300 border border-sky-500/25">
                Vol Dry-Up ✅
              </span>
            )}
            {isEarlySurf && esMetrics.ext_sma50_pct !== undefined && (
              <span className="px-2.5 py-1 rounded-lg text-xs font-semibold bg-cyan-500/15 text-cyan-300 border border-cyan-500/25">
                SMA50 Pinch: {esMetrics.ext_sma50_pct}%
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
              <div className={`text-sm font-mono mt-0.5 ${getPctColor(episode.horizons?.['3d']?.close_return ?? episode.horizons?.['3d']?.to_date_return)}`}>
                {formatPct(episode.horizons?.['3d']?.close_return ?? episode.horizons?.['3d']?.to_date_return)}
                {!episode.horizons?.['3d']?.completed && episode.horizons?.['3d']?.days_available > 0 && ' ⏳'}
              </div>
              <div className="text-[11px] text-white/40">
                Peak: {formatPct(episode.horizons?.['3d']?.max_gain)}
              </div>
            </div>
            <div className="bg-white/[0.03] border border-white/10 rounded-xl p-3">
              <div className="text-[11px] text-white/40 uppercase">1 Week (1W)</div>
              <div className={`text-sm font-mono mt-0.5 ${getPctColor(episode.horizons?.['1w']?.close_return ?? episode.horizons?.['1w']?.to_date_return)}`}>
                {formatPct(episode.horizons?.['1w']?.close_return ?? episode.horizons?.['1w']?.to_date_return)}
                {!episode.horizons?.['1w']?.completed && episode.horizons?.['1w']?.days_available > 0 && ' ⏳'}
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

          {/* Upgraded Watch -> Candidate Comparison Banner */}
          {episode.upgraded_to_candidate && episode.candidate_entry && (
            <div className="bg-indigo-500/10 border border-indigo-500/25 rounded-xl p-3.5 flex flex-wrap items-center justify-between gap-3 text-xs">
              <div className="flex items-center gap-2">
                <span className="px-2 py-0.5 rounded bg-indigo-500/25 text-indigo-200 font-bold uppercase text-[10px]">
                  ⬆️ Watch → Candidate Upgrade
                </span>
                <span className="text-white/75">
                  Started as <b>Watch ({episode.initial_score})</b> on <b>{episode.start_date}</b> @ <b>${episode.entry_price}</b>, then upgraded to{' '}
                  <b>Candidate ({episode.candidate_entry.score})</b> on <b>{episode.candidate_entry.start_date}</b> @{' '}
                  <b>${episode.candidate_entry.entry_price}</b>.
                </span>
              </div>
              <div className="flex items-center gap-3 font-mono">
                <span className="text-white/60">
                  Pre-Upgrade Move:{' '}
                  <strong className={getPctColor(episode.candidate_entry.pre_upgrade_return_pct)}>
                    {formatPct(episode.candidate_entry.pre_upgrade_return_pct)}
                  </strong>
                </span>
                <span className="text-white/60">
                  Post-Candidate 1W:{' '}
                  <strong
                    className={getPctColor(
                      episode.candidate_entry.horizons?.['1w']?.close_return ??
                        episode.candidate_entry.horizons?.['1w']?.to_date_return
                    )}
                  >
                    {formatPct(
                      episode.candidate_entry.horizons?.['1w']?.close_return ??
                        episode.candidate_entry.horizons?.['1w']?.to_date_return
                    )}
                  </strong>
                </span>
                <span className="text-white/60">
                  Post-Candidate MFE:{' '}
                  <strong className="text-emerald-300">{formatPct(episode.candidate_entry.mfe)}</strong>
                </span>
              </div>
            </div>
          )}

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
                Initial {isEarlySurf ? 'Early Surf' : 'Qullamaggie'} Setup Breakdown ({episode.start_date})
              </h4>
              {isEarlySurf ? (
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5 text-xs">
                  <div className="bg-white/5 rounded-lg p-2.5 border border-white/5">
                    <span className="text-white/40 block">SMA50 Pinch Score</span>
                    <span className="text-white font-bold text-sm">
                      {esBreakdown.sma50_pinch ?? '—'} / 25 ({esMetrics.ext_sma50_pct ?? '—'}%)
                    </span>
                  </div>
                  <div className="bg-white/5 rounded-lg p-2.5 border border-white/5">
                    <span className="text-white/40 block">EMA10 &gt; EMA20 Surf</span>
                    <span className="text-white font-bold text-sm">
                      {esBreakdown.ema_surf ?? '—'} / 20 ({esMetrics.ema10_gt_20_days ?? 0}d)
                    </span>
                  </div>
                  <div className="bg-white/5 rounded-lg p-2.5 border border-white/5">
                    <span className="text-white/40 block">Volume &amp; Pockets</span>
                    <span className="text-white font-bold text-sm">
                      {esBreakdown.volume_pocket ?? '—'} / 20 (PP:{esMetrics.pocket_pivots_10d ?? 0})
                    </span>
                  </div>
                  <div className="bg-white/5 rounded-lg p-2.5 border border-white/5">
                    <span className="text-white/40 block">RSI Sweetspot</span>
                    <span className="text-white font-bold text-sm">
                      {esBreakdown.rsi_sweetspot ?? '—'} / 15 (RSI {esMetrics.rsi ?? '—'})
                    </span>
                  </div>
                  <div className="bg-white/5 rounded-lg p-2.5 border border-white/5">
                    <span className="text-white/40 block">Coiling &amp; ADR20</span>
                    <span className="text-white font-bold text-sm">
                      {esBreakdown.coiling ?? '—'} / 10 (ADR {esMetrics.adr20 ?? '—'}%)
                    </span>
                  </div>
                  <div className="bg-white/5 rounded-lg p-2.5 border border-white/5">
                    <span className="text-white/40 block">Suggested Stop / Risk</span>
                    <span className="text-white font-bold text-sm">
                      ${esTrade.suggested_stop ?? '—'} ({esTrade.risk_pct ? `-${esTrade.risk_pct}%` : '—'})
                    </span>
                  </div>
                </div>
              ) : (
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5 text-xs">
                  <div className="bg-white/5 rounded-lg p-2.5 border border-white/5">
                    <span className="text-white/40 block">Trend Score</span>
                    <span className="text-white font-bold text-sm">
                      {r.trend_score ?? '—'} / {r.pole_return_pct !== undefined ? 30 : 35}
                    </span>
                  </div>
                  <div className="bg-white/5 rounded-lg p-2.5 border border-white/5">
                    <span className="text-white/40 block">Relative Strength (RS)</span>
                    <span className="text-white font-bold text-sm">
                      {r.rs_score ?? '—'} / 30 {r.rs_ratio ? `(${r.rs_ratio.toFixed(2)}x)` : ''}
                    </span>
                  </div>
                  <div className="bg-white/5 rounded-lg p-2.5 border border-white/5">
                    <span className="text-white/40 block">Tightness / Base</span>
                    <span className="text-white font-bold text-sm">
                      {r.tightness_score ?? '—'} / 25 ({r.is_tight ? 'Tight ✅' : 'Wide'})
                    </span>
                  </div>
                  <div className="bg-white/5 rounded-lg p-2.5 border border-white/5">
                    <span className="text-white/40 block">Volume Dry-Up</span>
                    <span className="text-white font-bold text-sm">
                      {r.vol_score ?? '—'} / 15 ({r.is_dry ? 'Dry ✅' : 'Normal'})
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
                    <span className="text-white/40 block">
                      {r.pole_return_pct !== undefined ? 'Pole / Base DD' : 'Highs Spread'}
                    </span>
                    <span className="text-white font-bold text-sm">
                      {r.pole_return_pct !== undefined
                        ? `+${Number(r.pole_return_pct).toFixed(1)}% / -${Number(r.drawdown_pct ?? 0).toFixed(1)}%`
                        : r.highs_spread !== undefined
                          ? `${(r.highs_spread * 100).toFixed(2)}%`
                          : '—'}
                    </span>
                  </div>
                </div>
              )}
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
  const [activeStrategyTab, setActiveStrategyTab] = useState('status'); // 'status' | 'qullamaggie' | 'early_surf' | 'my_portfolio' | 'fundamentals'
  const [gapDays, setGapDays] = useState(10);
  const [statusFilter, setStatusFilter] = useState('all'); // 'all' | 'candidate' | 'watch' | 'upgraded' | 'direct_candidate'
  const [convictionFilter, setConvictionFilter] = useState('all'); // 'all' | 'a_plus' | 'a_and_up'
  const [traitFilter, setTraitFilter] = useState('all');
  const [returnMode, setReturnMode] = useState('close'); // 'close' | 'peak'
  const [entryBasis, setEntryBasis] = useState('first_alert'); // 'first_alert' | 'candidate_trigger'
  const [activeHorizon, setActiveHorizon] = useState('1w'); // '3d' | '1w' | '1m' | '3m' | 'overall'
  const [includePartial, setIncludePartial] = useState(true);
  const [onlyMultiWave, setOnlyMultiWave] = useState(false);
  const [onlyMyTraded, setOnlyMyTraded] = useState(false);
  const [selectedBucketId, setSelectedBucketId] = useState(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [sortBy, setSortBy] = useState('start_date');
  const [sortDir, setSortDir] = useState('desc');
  const [selectedEpisode, setSelectedEpisode] = useState(null);

  const strategyEpisodeType = activeStrategyTab === 'early_surf' ? 'early_surf' : 'qullamaggie';

  // Current calendar boundaries & Year/Multi-Month Filter State
  const now = useMemo(() => new Date(), []);
  const currentYear = now.getFullYear();
  const currentMonth = now.getMonth() + 1; // 1-12

  const [selectedYear, setSelectedYear] = useState(() => currentYear);
  const [selectedMonths, setSelectedMonths] = useState(() => [currentMonth]);

  // Group episodes counts by year and month for the active strategy
  const { availableYears, episodesCountByYear, episodesCountByMonth } = useMemo(() => {
    const yearCounts = {};
    const monthCounts = {};

    for (const ep of rawData.episodes || []) {
      if (ep.analysis_type !== strategyEpisodeType || !ep.start_date) continue;
      const y = parseInt(ep.start_date.slice(0, 4), 10);
      const m = parseInt(ep.start_date.slice(5, 7), 10);

      // Only count up to current year (prevent future years like 2027)
      if (y && y <= currentYear) {
        yearCounts[y] = (yearCounts[y] || 0) + 1;
        if (y === selectedYear) {
          monthCounts[m] = (monthCounts[m] || 0) + 1;
        }
      }
    }

    const years = Object.keys(yearCounts).map(Number).sort((a, b) => b - a);
    if (years.length === 0) {
      years.push(currentYear);
    }

    return {
      availableYears: years,
      episodesCountByYear: yearCounts,
      episodesCountByMonth: monthCounts,
    };
  }, [rawData.episodes, strategyEpisodeType, currentYear, selectedYear]);

  const handleSelectStrategyTab = (tab) => {
    setActiveStrategyTab(tab);
    setTraitFilter('all');
    setSelectedBucketId(null);
    if (tab === 'qullamaggie' || tab === 'early_surf') {
      // Check if current selectedYear/selectedMonths has episodes for this strategy; if not, select active months
      const epsForTab = (rawData.episodes || []).filter((e) => e.analysis_type === tab && e.start_date);
      const hasInCurrentSelection = epsForTab.some((e) => {
        const y = parseInt(e.start_date.slice(0, 4), 10);
        const m = parseInt(e.start_date.slice(5, 7), 10);
        return y === selectedYear && selectedMonths.includes(m);
      });
      if (!hasInCurrentSelection && epsForTab.length > 0) {
        const monthsWithData = Array.from(
          new Set(
            epsForTab
              .filter((e) => parseInt(e.start_date.slice(0, 4), 10) === currentYear)
              .map((e) => parseInt(e.start_date.slice(5, 7), 10))
              .filter((m) => m <= currentMonth)
          )
        ).sort((a, b) => a - b);
        if (monthsWithData.length > 0) {
          setSelectedYear(currentYear);
          setSelectedMonths(monthsWithData);
        }
      }
    }
  };

  const handleToggleMonth = (m) => {
    setSelectedMonths((prev) => {
      if (prev.includes(m)) {
        return prev.filter((x) => x !== m);
      } else {
        return [...prev, m].sort((a, b) => a - b);
      }
    });
  };

  const handleSelectAllAvailableMonths = () => {
    const active = [];
    for (let m = 1; m <= 12; m++) {
      const isFuture = selectedYear === currentYear && m > currentMonth;
      if (!isFuture && (episodesCountByMonth[m] || 0) > 0) {
        active.push(m);
      }
    }
    setSelectedMonths(active);
  };

  const handleSelectCurrentMonth = () => {
    setSelectedYear(currentYear);
    setSelectedMonths([currentMonth]);
  };

  const handleClearMonths = () => {
    setSelectedMonths([]);
  };

  const handleSelectYear = (year) => {
    setSelectedYear(year);
    if (year === currentYear) {
      setSelectedMonths([currentMonth]);
    } else {
      const active = [];
      for (const ep of rawData.episodes || []) {
        if (ep.analysis_type !== strategyEpisodeType || !ep.start_date) continue;
        const ey = parseInt(ep.start_date.slice(0, 4), 10);
        const em = parseInt(ep.start_date.slice(5, 7), 10);
        if (ey === year && !active.includes(em)) {
          active.push(em);
        }
      }
      setSelectedMonths(active.sort((a, b) => a - b));
    }
  };

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

  // 1. Base filtered episodes (Strategy + Year & Month date filter + Status/Trait/Conviction filters)
  const filteredEpisodes = useMemo(() => {
    return (rawData.episodes || []).filter((ep) => {
      if (ep.analysis_type !== strategyEpisodeType) return false;

      // Start date year & month filter
      if (!ep.start_date) return false;
      const epYear = parseInt(ep.start_date.slice(0, 4), 10);
      const epMonth = parseInt(ep.start_date.slice(5, 7), 10);

      if (selectedYear && epYear !== selectedYear) return false;
      if (selectedMonths.length === 0) return false; // No months selected
      if (!selectedMonths.includes(epMonth)) return false;

      if (statusFilter === 'candidate' && ep.peak_status !== 'candidate') return false;
      if (statusFilter === 'direct_candidate' && ep.initial_status !== 'candidate') return false;
      if (statusFilter === 'watch' && ep.peak_status !== 'watch') return false;
      if (statusFilter === 'upgraded' && !ep.upgraded_to_candidate) return false;

      const cTier = ep.conviction_tier || ep.conviction?.tier || 'C';
      if (convictionFilter === 'a_plus' && cTier !== 'A+') return false;
      if (convictionFilter === 'a_and_up' && cTier !== 'A+' && cTier !== 'A') return false;

      if (strategyEpisodeType === 'qullamaggie') {
        if (traitFilter === 'tight' && !ep.initial_reason?.is_tight) return false;
        if (traitFilter === 'dry' && !ep.initial_reason?.is_dry) return false;
        if (traitFilter === 'tight_dry' && !(ep.initial_reason?.is_tight && ep.initial_reason?.is_dry)) return false;
        if (traitFilter === 'high_rs' && !(Number(ep.initial_reason?.rs_score || 0) >= 20)) return false;
      } else {
        // early_surf trait filters
        if (traitFilter === 'surfing_ema' && !(Number(ep.initial_reason?.ema10_gt_20_days || 0) >= 3)) return false;
        if (traitFilter === 'sweet_rsi' && !(Number(ep.initial_reason?.rsi_14 || 0) >= 48 && Number(ep.initial_reason?.rsi_14 || 0) <= 58)) return false;
        if (traitFilter === 'tight_candle' && !(Number(ep.initial_reason?.candle_tightness_pct ?? 99) <= 0.7)) return false;
        if (traitFilter === 'pinched_sma50' && !(Number(ep.initial_reason?.ext_sma50_pct ?? 99) >= -1.0 && Number(ep.initial_reason?.ext_sma50_pct ?? 99) <= 3.0)) return false;
      }

      if (onlyMultiWave && ep.total_episodes_for_symbol < 2) return false;
      if (onlyMyTraded && !ep.my_trade) return false;
      return true;
    });
  }, [rawData.episodes, strategyEpisodeType, selectedYear, selectedMonths, statusFilter, convictionFilter, traitFilter, onlyMultiWave, onlyMyTraded]);

  // Top 3 Trigger Candidates from the latest active session for the current strategy
  const topConvictionCandidates = useMemo(() => {
    const allForStrategy = (rawData.episodes || []).filter((e) => e.analysis_type === strategyEpisodeType);
    if (allForStrategy.length === 0) return [];
    const latestEnd = allForStrategy.reduce((max, e) => (e.end_date > max ? e.end_date : max), '');
    const activeWaves = allForStrategy.filter((e) => e.end_date === latestEnd);
    const pool = activeWaves.length > 0 ? activeWaves : filteredEpisodes;
    const cands = pool.filter((e) => e.peak_status === 'candidate');
    return [...(cands.length > 0 ? cands : pool)]
      .sort((a, b) => Number(b.conviction_score ?? b.conviction?.score ?? 0) - Number(a.conviction_score ?? a.conviction?.score ?? 0))
      .slice(0, 3);
  }, [rawData.episodes, filteredEpisodes, strategyEpisodeType]);

  // Raw signal alert count & pending 0d count within filteredEpisodes
  const filteredSignalAlertCount = useMemo(
    () => filteredEpisodes.reduce((sum, ep) => sum + (ep.alert_days || 1), 0),
    [filteredEpisodes]
  );
  const pendingZeroDayCount = useMemo(
    () =>
      filteredEpisodes.filter((ep) => {
        const traj = getEpisodeTrajectory(ep, entryBasis);
        return (traj.trading_days_elapsed ?? 0) === 0;
      }).length,
    [filteredEpisodes, entryBasis]
  );

  // 2. Main KPI & distribution stats for the active horizon
  const mainStats = useMemo(
    () => computeGroupStats(filteredEpisodes, activeHorizon, returnMode, includePartial, entryBasis),
    [filteredEpisodes, activeHorizon, returnMode, includePartial, entryBasis]
  );

  // 3. Multi-horizon comparison matrix (3D, 1W, 1M, 3M, Overall)
  const horizonMatrix = useMemo(() => {
    return HORIZON_CONFIG.map((h) => ({
      ...h,
      stats: computeGroupStats(filteredEpisodes, h.key, returnMode, includePartial, entryBasis),
    }));
  }, [filteredEpisodes, returnMode, includePartial, entryBasis]);

  // 4. Factor Attribution ("What Works vs What Doesn't") — Unbiased by entry day & status
  const factorAnalysis = useMemo(() => {
    const makeRow = (label, badgeColor, predicate, customBasis = entryBasis) => {
      const subset = filteredEpisodes.filter(predicate);
      const st = computeGroupStats(subset, activeHorizon, returnMode, includePartial, customBasis);
      return { label, badgeColor, ...st };
    };

    const byStatus = [
      makeRow(
        'Direct Candidate (Day 1)',
        'bg-emerald-500/20 text-emerald-300 border-emerald-500/30',
        (e) => e.initial_status === 'candidate',
        'first_alert'
      ),
      makeRow(
        'All Initial Watch (Unbiased)',
        'bg-sky-500/20 text-sky-300 border-sky-500/30',
        (e) => e.initial_status === 'watch',
        'first_alert'
      ),
      makeRow(
        'Watch → Candidate (From Upgrade Day)',
        'bg-indigo-500/20 text-indigo-300 border-indigo-500/30',
        (e) => e.upgraded_to_candidate,
        'candidate_trigger'
      ),
      makeRow(
        'Watch → Candidate (From Watch Day ⚠️)',
        'bg-purple-500/20 text-purple-300 border-purple-500/30',
        (e) => e.upgraded_to_candidate,
        'first_alert'
      ),
      makeRow(
        'Watch Only (Never Upgraded)',
        'bg-amber-500/20 text-amber-300 border-amber-500/30',
        (e) => e.peak_status === 'watch',
        'first_alert'
      ),
    ];

    const byScore = [
      makeRow(
        '90 - 100 Entry Score (Elite)',
        'bg-emerald-500/20 text-emerald-300 border-emerald-500/30',
        (e) => e.initial_score >= 90
      ),
      makeRow(
        '80 - 89 Entry Score (Strong)',
        'bg-teal-500/20 text-teal-300 border-teal-500/30',
        (e) => e.initial_score >= 80 && e.initial_score < 90
      ),
      makeRow(
        '70 - 79 Entry Score (Sweet Spot)',
        'bg-sky-500/20 text-sky-300 border-sky-500/30',
        (e) => e.initial_score >= 70 && e.initial_score < 80
      ),
      makeRow(
        '< 70 Entry Score (Watch Zone)',
        'bg-slate-500/20 text-slate-300 border-slate-500/30',
        (e) => e.initial_score < 70
      ),
    ];

    const byConviction = [
      makeRow(
        '🏆 A+ Prime Conviction (≥ 85 pts)',
        'bg-amber-500/25 text-amber-200 border-amber-400/50',
        (e) => (e.conviction_tier || e.conviction?.tier) === 'A+'
      ),
      makeRow(
        '🔥 A Strong Conviction (74 - 84 pts)',
        'bg-emerald-500/20 text-emerald-300 border-emerald-500/35',
        (e) => (e.conviction_tier || e.conviction?.tier) === 'A'
      ),
      makeRow(
        '⚡ B Solid Conviction (62 - 73 pts)',
        'bg-sky-500/20 text-sky-300 border-sky-500/30',
        (e) => (e.conviction_tier || e.conviction?.tier) === 'B'
      ),
      makeRow(
        '• C Lower Conviction (< 62 pts)',
        'bg-slate-500/20 text-slate-300 border-slate-500/30',
        (e) => !['A+', 'A', 'B'].includes(e.conviction_tier || e.conviction?.tier)
      ),
    ];

    if (strategyEpisodeType === 'early_surf') {
      return {
        byStatus,
        byScore,
        byConviction,
        bySetupMechanics: [
          makeRow(
            'Tight SMA50 Pinch (-1% to +2.5%)',
            'bg-emerald-500/20 text-emerald-300 border-emerald-500/30',
            (e) => Number(e.initial_reason?.ext_sma50_pct ?? 99) >= -1.0 && Number(e.initial_reason?.ext_sma50_pct ?? 99) <= 2.5
          ),
          makeRow(
            'EMA10 > EMA20 Surf (≥ 3 Days)',
            'bg-teal-500/20 text-teal-300 border-teal-500/30',
            (e) => Number(e.initial_reason?.ema10_gt_20_days || 0) >= 3
          ),
          makeRow(
            'Sweet Spot RSI (48 - 58)',
            'bg-sky-500/20 text-sky-300 border-sky-500/30',
            (e) => Number(e.initial_reason?.rsi_14 || 0) >= 48 && Number(e.initial_reason?.rsi_14 || 0) <= 58
          ),
          makeRow(
            'Inside Compression (Candle ≤ 0.65x ADR)',
            'bg-indigo-500/20 text-indigo-300 border-indigo-500/30',
            (e) => Number(e.initial_reason?.candle_tightness_pct ?? 99) <= 0.65
          ),
        ],
        byPersistence: [
          makeRow(
            'High Fuel ADR (3.5% - 6.5%)',
            'bg-emerald-500/20 text-emerald-300 border-emerald-500/30',
            (e) => Number(e.initial_reason?.adr20_pct || 0) >= 3.5 && Number(e.initial_reason?.adr20_pct || 0) <= 6.5
          ),
          makeRow(
            'Quiet RVOL Dry-Up (0.45x - 0.90x)',
            'bg-teal-500/20 text-teal-300 border-teal-500/30',
            (e) => Number(e.initial_reason?.rvol || 0) >= 0.45 && Number(e.initial_reason?.rvol || 0) <= 0.9
          ),
          makeRow(
            'Multi-Day Alert Streak (2+ Days)',
            'bg-purple-500/20 text-purple-300 border-purple-500/30',
            (e) => e.alert_days >= 2
          ),
          makeRow(
            'Single-Day Alert (1 Day)',
            'bg-slate-500/20 text-slate-300 border-slate-500/30',
            (e) => e.alert_days === 1
          ),
        ],
      };
    }

    return {
      byStatus,
      byScore,
      byConviction,
      bySetupMechanics: [
        makeRow(
          'Tight + Volume Dry-Up Combo',
          'bg-emerald-500/20 text-emerald-300 border-emerald-500/30',
          (e) => e.initial_reason?.is_tight && e.initial_reason?.is_dry
        ),
        makeRow(
          'Tight Flag (is_tight)',
          'bg-teal-500/20 text-teal-300 border-teal-500/30',
          (e) => Boolean(e.initial_reason?.is_tight)
        ),
        makeRow(
          'Volume Dry-Up (is_dry)',
          'bg-sky-500/20 text-sky-300 border-sky-500/30',
          (e) => Boolean(e.initial_reason?.is_dry)
        ),
        makeRow(
          'High Relative Strength (RS ≥ 20)',
          'bg-indigo-500/20 text-indigo-300 border-indigo-500/30',
          (e) => Number(e.initial_reason?.rs_score || 0) >= 20
        ),
      ],
      byPersistence: [
        makeRow(
          '4+ Days Persistent Streak',
          'bg-purple-500/20 text-purple-300 border-purple-500/30',
          (e) => e.alert_days >= 4
        ),
        makeRow(
          '2 - 3 Days Alert Streak',
          'bg-indigo-500/20 text-indigo-300 border-indigo-500/30',
          (e) => e.alert_days >= 2 && e.alert_days <= 3
        ),
        makeRow(
          'Single-Day Alert (1 Day)',
          'bg-slate-500/20 text-slate-300 border-slate-500/30',
          (e) => e.alert_days === 1
        ),
        makeRow(
          'Low Extension (Ext ≤ 3%)',
          'bg-emerald-500/20 text-emerald-300 border-emerald-500/30',
          (e) => e.initial_reason?.ext_pct !== undefined && e.initial_reason.ext_pct <= 0.03
        ),
      ],
    };
  }, [filteredEpisodes, strategyEpisodeType, activeHorizon, returnMode, includePartial, entryBasis]);

  // 5. Post-Signal Average Trajectory Curve (Day 1 to Day 25)
  const trajectoryCurve = useMemo(() => {
    const maxDay = 25;
    const points = [];
    for (let d = 1; d <= maxDay; d++) {
      const allVals = [];
      const candVals = [];
      const watchVals = [];

      for (const ep of filteredEpisodes) {
        const traj = getEpisodeTrajectory(ep, entryBasis);
        const curve = traj.forward_curve || [];
        if (returnMode === 'peak') {
          // Running peak gain (MFE) up to day d
          const slice = curve.filter((p) => p.day <= d && p.high_pct !== null && p.high_pct !== undefined);
          if (slice.length > 0) {
            const peak = Math.max(...slice.map((p) => p.high_pct));
            allVals.push(peak);
            if (ep.peak_status === 'candidate') candVals.push(peak);
            else watchVals.push(peak);
          }
        } else {
          // Cumulative close return on day d
          const pt = curve.find((p) => p.day === d);
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
  }, [filteredEpisodes, returnMode, entryBasis]);

  // 6. Hall of Fame (Best Performers) & Hall of Shame (Worst Performers)
  const { bestPerformers, worstPerformers } = useMemo(() => {
    const withVal = filteredEpisodes
      .map((ep) => ({
        ep,
        traj: getEpisodeTrajectory(ep, entryBasis),
        val: getEpisodeHorizonValue(ep, activeHorizon, returnMode, includePartial, entryBasis),
      }))
      .filter((x) => x.val !== null && x.val !== undefined && !Number.isNaN(x.val));

    const sortedDesc = [...withVal].sort((a, b) => b.val - a.val);
    const sortedAsc = [...withVal].sort((a, b) => a.val - b.val);

    return {
      bestPerformers: sortedDesc.slice(0, 10),
      worstPerformers: sortedAsc.slice(0, 10),
    };
  }, [filteredEpisodes, activeHorizon, returnMode, includePartial, entryBasis]);

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
        const v = getEpisodeHorizonValue(ep, activeHorizon, returnMode, includePartial, entryBasis);
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
      const ta = getEpisodeTrajectory(a, entryBasis);
      const tb = getEpisodeTrajectory(b, entryBasis);
      if (sortBy === 'symbol') return a.symbol.localeCompare(b.symbol) * dir;
      if (sortBy === 'start_date') return a.start_date.localeCompare(b.start_date) * dir;
      if (sortBy === 'alert_days') return (a.alert_days - b.alert_days) * dir;
      if (sortBy === 'max_score') return (a.initial_score - b.initial_score) * dir;
      if (sortBy === 'conviction_score') {
        const ca = Number(a.conviction_score ?? a.conviction?.score ?? 0);
        const cb = Number(b.conviction_score ?? b.conviction?.score ?? 0);
        return (ca - cb) * dir;
      }
      if (sortBy === 'mfe') return ((ta.mfe ?? -999) - (tb.mfe ?? -999)) * dir;
      if (sortBy === 'mae') return ((ta.mae ?? -999) - (tb.mae ?? -999)) * dir;
      if (['3d', '1w', '1m', '3m', 'overall'].includes(sortBy)) {
        const va = getEpisodeHorizonValue(a, sortBy, returnMode, includePartial, entryBasis) ?? -999;
        const vb = getEpisodeHorizonValue(b, sortBy, returnMode, includePartial, entryBasis) ?? -999;
        return (va - vb) * dir;
      }
      return 0;
    });

    return list;
  }, [filteredEpisodes, selectedBucketId, searchQuery, sortBy, sortDir, activeHorizon, returnMode, includePartial, entryBasis]);

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
          {(activeStrategyTab === 'qullamaggie' || activeStrategyTab === 'early_surf') && (
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
            onClick={() => handleSelectStrategyTab('status')}
            className={`px-5 py-2 rounded-lg text-sm font-bold transition-all cursor-pointer flex items-center gap-2 ${
              activeStrategyTab === 'status'
                ? 'bg-gradient-to-r from-emerald-600 to-teal-600 text-white shadow-lg shadow-emerald-600/25'
                : 'text-white/60 hover:text-white hover:bg-white/5'
            }`}
          >
            <Radio size={15} />
            <span>Status</span>
          </button>
          <button
            onClick={() => handleSelectStrategyTab('qullamaggie')}
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
            onClick={() => handleSelectStrategyTab('early_surf')}
            className={`px-5 py-2 rounded-lg text-sm font-bold transition-all cursor-pointer flex items-center gap-2 ${
              activeStrategyTab === 'early_surf'
                ? 'bg-cyan-600 text-white shadow-lg shadow-cyan-600/25'
                : 'text-white/60 hover:text-white hover:bg-white/5'
            }`}
          >
            <Activity size={15} />
            <span>Early Surf</span>
          </button>
          <button
            onClick={() => handleSelectStrategyTab('my_portfolio')}
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
            onClick={() => handleSelectStrategyTab('fundamentals')}
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

      {activeStrategyTab === 'status' ? (
        <MarketStatusCockpit onNavigateStrategy={handleSelectStrategyTab} />
      ) : activeStrategyTab === 'my_portfolio' ? (
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
          {/* Compact Personal Portfolio & Swing Trades Summary Strip inside Strategy Lab */}
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
                onClick={() => handleSelectStrategyTab('my_portfolio')}
                className="px-3.5 py-1.5 rounded-xl bg-emerald-500/20 hover:bg-emerald-500/30 text-emerald-200 border border-emerald-500/30 text-xs font-bold transition-all cursor-pointer"
              >
                Open Full Trade Analytics &rarr;
              </button>
            </div>
          )}

          {/* Analysis Start Period Filter (Year & Multi-Month Selector) */}
          <div className="bg-white/[0.03] border border-white/10 rounded-2xl p-4 flex flex-col gap-3.5">
            {/* Header: Title, Description & Action Shortcuts */}
            <div className="flex flex-wrap items-center justify-between gap-3 border-b border-white/5 pb-3">
              <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 rounded-xl bg-indigo-500/15 border border-indigo-500/30 flex items-center justify-center text-indigo-400 shrink-0">
                  <Calendar size={16} />
                </div>
                <div>
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-sm font-bold text-white">Analysis Start Period</span>
                    <span className="text-[11px] font-semibold text-white/40 uppercase tracking-wider">
                      ({activeStrategyTab === 'early_surf' ? 'Early Surf Waves' : 'Qullamaggie Waves'})
                    </span>
                    {/* Active Period Summary Badge */}
                    <span className="px-2.5 py-0.5 rounded-full text-xs font-mono font-bold bg-indigo-500/20 text-indigo-300 border border-indigo-500/30">
                      {selectedYear} •{' '}
                      {selectedMonths.length === 0
                        ? 'No Months Selected (0)'
                        : selectedMonths.length === 1
                        ? `${MONTHS_CONFIG.find((m) => m.num === selectedMonths[0])?.full} (${filteredEpisodes.length} Waves)`
                        : `${selectedMonths.length} Months Selected (${filteredEpisodes.length} Waves)`}
                    </span>
                  </div>
                  <p className="text-xs text-white/45 mt-0.5">
                    Only signal waves starting in the selected year and months are evaluated across performance metrics and the table.
                  </p>
                </div>
              </div>

              {/* Action Buttons: This Month, Select All Active Months, Clear */}
              <div className="flex flex-wrap items-center gap-2 text-xs">
                <button
                  type="button"
                  onClick={handleSelectCurrentMonth}
                  className={`px-3 py-1.5 rounded-lg border font-semibold transition-all cursor-pointer flex items-center gap-1.5 ${
                    selectedYear === currentYear &&
                    selectedMonths.length === 1 &&
                    selectedMonths[0] === currentMonth
                      ? 'bg-indigo-600 border-indigo-500 text-white shadow-sm'
                      : 'bg-white/5 border-white/10 text-white/70 hover:text-white hover:bg-white/10'
                  }`}
                  title={`Reset to current month (${MONTHS_CONFIG.find((m) => m.num === currentMonth)?.full} ${currentYear})`}
                >
                  <Sparkles size={12} className="text-amber-300" />
                  <span>This Month ({MONTHS_CONFIG.find((m) => m.num === currentMonth)?.full} {currentYear})</span>
                </button>

                <button
                  type="button"
                  onClick={handleSelectAllAvailableMonths}
                  className="px-3 py-1.5 rounded-lg bg-white/5 hover:bg-white/10 border border-white/10 text-white/70 hover:text-white font-semibold transition-all cursor-pointer"
                  title={`Select all months with wave data in ${selectedYear}`}
                >
                  Select All Active Months
                </button>

                {selectedMonths.length > 0 && (
                  <button
                    type="button"
                    onClick={handleClearMonths}
                    className="px-2.5 py-1.5 rounded-lg bg-rose-500/10 hover:bg-rose-500/20 border border-rose-500/25 text-rose-300 text-xs font-semibold transition-all cursor-pointer flex items-center gap-1"
                    title="Clear selected months"
                  >
                    <X size={12} />
                    <span>Clear</span>
                  </button>
                )}
              </div>
            </div>

            {/* Year & Months Selector Grid */}
            <div className="flex flex-col lg:flex-row items-start lg:items-center gap-4">
              {/* Year Selector */}
              <div className="flex items-center gap-2 shrink-0">
                <span className="text-[11px] font-bold uppercase tracking-wider text-white/40 shrink-0">
                  Year:
                </span>
                <div className="flex items-center gap-1.5 bg-black/40 p-1 rounded-xl border border-white/5">
                  {availableYears.map((yr) => {
                    const count = episodesCountByYear[yr] || 0;
                    const isSel = selectedYear === yr;
                    return (
                      <button
                        key={yr}
                        type="button"
                        onClick={() => handleSelectYear(yr)}
                        className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer flex items-center gap-1.5 ${
                          isSel
                            ? 'bg-indigo-600 text-white shadow-md shadow-indigo-600/30'
                            : 'text-white/60 hover:text-white hover:bg-white/5'
                        }`}
                      >
                        <span>{yr}</span>
                        <span
                          className={`text-[10px] px-1.5 py-0.2 rounded-md font-mono ${
                            isSel ? 'bg-black/30 text-indigo-100' : 'bg-white/5 text-white/40'
                          }`}
                        >
                          {count}
                        </span>
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Month Selector Pills (Multiple Selection) */}
              <div className="flex-1 w-full flex flex-col gap-1">
                <div className="flex items-center justify-between text-[11px] font-bold uppercase tracking-wider text-white/40">
                  <span>Months (Multi-Select):</span>
                  <span className="text-[10px] text-white/35 lowercase font-normal">
                    Click multiple months to expand or narrow the evaluation period
                  </span>
                </div>

                <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-6 lg:grid-cols-12 gap-1.5">
                  {MONTHS_CONFIG.map((m) => {
                    const isFuture = selectedYear === currentYear && m.num > currentMonth;
                    const count = episodesCountByMonth[m.num] || 0;
                    const hasData = count > 0;
                    const isAvailable = !isFuture && hasData;
                    const isSelected = selectedMonths.includes(m.num);

                    return (
                      <button
                        key={m.num}
                        type="button"
                        disabled={!isAvailable}
                        onClick={() => handleToggleMonth(m.num)}
                        title={
                          isFuture
                            ? `${m.full} ${selectedYear}: Future month (not yet reached)`
                            : !hasData
                            ? `${m.full} ${selectedYear}: No wave episodes recorded`
                            : `${m.full} ${selectedYear}: ${count} wave episodes (${isSelected ? 'Selected - click to unselect' : 'Click to select'})`
                        }
                        className={`px-2 py-1.5 rounded-xl text-xs font-bold transition-all flex flex-col items-center justify-center gap-0.5 border ${
                          !isAvailable
                            ? 'opacity-25 bg-black/20 border-white/5 text-white/30 cursor-not-allowed'
                            : isSelected
                            ? 'bg-emerald-500/25 border-emerald-500/50 text-emerald-200 shadow-sm shadow-emerald-500/20 cursor-pointer ring-1 ring-emerald-400/40'
                            : 'bg-black/40 border-white/10 text-white/60 hover:text-white hover:bg-white/10 cursor-pointer'
                        }`}
                      >
                        <span className="leading-tight">{m.label}</span>
                        <span
                          className={`text-[10px] font-mono leading-tight ${
                            !isAvailable
                              ? 'text-white/20'
                              : isSelected
                              ? 'text-emerald-300 font-extrabold'
                              : 'text-white/40'
                          }`}
                        >
                          {isFuture ? '—' : count > 0 ? count : '0'}
                        </span>
                      </button>
                    );
                  })}
                </div>
              </div>
            </div>
          </div>

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

              {/* Entry Price Basis Toggle (First Alert vs Candidate Upgrade Trigger) */}
              <div className="flex flex-col gap-1.5">
                <span className="text-[11px] font-bold uppercase tracking-wider text-white/40">
                  Entry Price Basis (Look-Ahead Control)
                </span>
                <div className="flex gap-1 bg-black/40 p-1 rounded-xl border border-white/5">
                  <button
                    onClick={() => setEntryBasis('first_alert')}
                    title="Measure forward returns from Day 1 of the wave (initial Watch or Candidate alert price)"
                    className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                      entryBasis === 'first_alert'
                        ? 'bg-indigo-600 text-white shadow'
                        : 'text-white/60 hover:text-white hover:bg-white/5'
                    }`}
                  >
                    Day 1 Alert Entry
                  </button>
                  <button
                    onClick={() => setEntryBasis('candidate_trigger')}
                    title="For Watch → Candidate upgraded waves, measure returns starting from the Candidate upgrade day price (eliminates pre-upgrade look-ahead gain)"
                    className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                      entryBasis === 'candidate_trigger'
                        ? 'bg-indigo-600 text-white shadow'
                        : 'text-white/60 hover:text-white hover:bg-white/5'
                    }`}
                  >
                    Candidate Trigger Entry
                  </button>
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
                <div className="flex flex-wrap items-center gap-1 bg-black/40 p-1 rounded-lg border border-white/5">
                  {[
                    { id: 'all', label: 'All (Watch + Candidate)' },
                    { id: 'candidate', label: '🔥 All Candidate' },
                    { id: 'direct_candidate', label: '⚡ Direct Candidate (Day 1)' },
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

                {/* 5-Pillar Conviction Filter */}
                <div className="flex flex-wrap items-center gap-1 bg-black/40 p-1 rounded-lg border border-white/5">
                  {[
                    { id: 'all', label: 'All Conviction Tiers' },
                    { id: 'a_plus', label: '🏆 A+ Prime (≥85)' },
                    { id: 'a_and_up', label: '🔥 A+ & A Tiers (≥74)' },
                  ].map((c) => (
                    <button
                      key={c.id}
                      onClick={() => setConvictionFilter(c.id)}
                      className={`px-2.5 py-1 rounded-md text-xs font-semibold transition-all cursor-pointer ${
                        convictionFilter === c.id
                          ? 'bg-amber-500/25 text-amber-200 border border-amber-400/50 shadow'
                          : 'text-white/55 hover:text-white'
                      }`}
                    >
                      {c.label}
                    </button>
                  ))}
                </div>

                {/* Technical Setup Trait Filter */}
                <div className="flex flex-wrap items-center gap-1 bg-black/40 p-1 rounded-lg border border-white/5">
                  {(strategyEpisodeType === 'early_surf'
                    ? [
                        { id: 'all', label: 'All Early Surf' },
                        { id: 'pinched_sma50', label: 'SMA50 Pinch (-1%..+3%)' },
                        { id: 'surfing_ema', label: 'EMA10>20 (≥3d)' },
                        { id: 'sweet_rsi', label: 'RSI 48-58' },
                        { id: 'tight_candle', label: 'Tight Bar (≤0.7x)' },
                      ]
                    : [
                        { id: 'all', label: 'All Setups' },
                        { id: 'tight', label: 'Tight Flag' },
                        { id: 'dry', label: 'Vol Dry-Up' },
                        { id: 'tight_dry', label: 'Tight + Dry' },
                        { id: 'high_rs', label: 'High RS (≥20)' },
                      ]
                  ).map((t) => (
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
                      ? 'bg-emerald-500/25 border-emerald-500/50 text-emerald-200'
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
          {/* Today's Top 3 Trigger Candidates Spotlight (5-Pillar Conviction Ranker) */}
          {topConvictionCandidates.length > 0 && (
            <div className="bg-gradient-to-br from-amber-500/[0.08] via-[#121218] to-emerald-500/[0.05] border border-amber-500/25 rounded-2xl p-5">
              <div className="flex flex-wrap items-center justify-between gap-2 mb-3.5">
                <div className="flex items-center gap-2.5">
                  <span className="text-xl">🏆</span>
                  <div>
                    <h3 className="text-sm font-black uppercase tracking-wider text-amber-300">
                      Today&apos;s Top 3 Trigger Candidates — 5-Pillar Conviction Ranker ({strategyEpisodeType === 'early_surf' ? 'Early Surf' : 'Qullamaggie'})
                    </h3>
                    <p className="text-xs text-white/50">
                      Highest-probability setups scored across Sector Wind (20), ADR% Fuel (20), Tightness &amp; Vol Dry-Up (25), Stop R:R (20), and Catalyst/RS (15)
                    </p>
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-1 lg:grid-cols-3 gap-3.5">
                {topConvictionCandidates.map((ep, idx) => {
                  const conv = ep.conviction || {};
                  const b = conv.breakdown || {};
                  return (
                    <div
                      key={ep.id}
                      onClick={() => setSelectedEpisode(ep)}
                      className="bg-black/45 hover:bg-black/60 border border-white/10 hover:border-amber-400/40 rounded-xl p-4 flex flex-col justify-between gap-3 transition-all cursor-pointer"
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div>
                          <div className="flex flex-wrap items-center gap-2">
                            <span className="text-xs font-mono font-bold text-amber-400">#{idx + 1}</span>
                            <span className="text-lg font-black text-white">{ep.symbol}</span>
                            <ConvictionBadge ep={ep} />
                            <MyTradeBadge myTrade={ep.my_trade} />
                          </div>
                          <div className="text-xs text-white/50 mt-0.5">
                            {ep.sector}
                            {conv.sector_rank ? ` (Sector Rank #${conv.sector_rank})` : ''} • Algo Score: <b>{ep.max_score}</b>
                          </div>
                        </div>

                        <div className="text-right font-mono">
                          <div className="text-sm font-bold text-white">${ep.latest_price ?? ep.entry_price ?? '—'}</div>
                          <div className="text-[10px] text-emerald-300">
                            Stop: ${conv.suggested_stop ?? '—'} ({conv.risk_pct ?? '—'}% risk)
                          </div>
                        </div>
                      </div>

                      <div className="grid grid-cols-5 gap-1.5 text-[10px] font-mono text-center">
                        <div className="bg-white/5 rounded-lg py-1.5 border border-white/5">
                          <div className="text-white/40">Sector</div>
                          <div className="text-white font-bold">{b.sector?.score ?? 0}/20</div>
                        </div>
                        <div className="bg-white/5 rounded-lg py-1.5 border border-white/5">
                          <div className="text-white/40">ADR%</div>
                          <div className="text-white font-bold">{b.adr?.score ?? 0}/20</div>
                        </div>
                        <div className="bg-white/5 rounded-lg py-1.5 border border-white/5">
                          <div className="text-white/40">Tight+Vol</div>
                          <div className="text-white font-bold">{b.tight_vol?.score ?? 0}/25</div>
                        </div>
                        <div className="bg-white/5 rounded-lg py-1.5 border border-white/5">
                          <div className="text-white/40">Stop/R:R</div>
                          <div className="text-white font-bold">{b.risk?.score ?? 0}/20</div>
                        </div>
                        <div className="bg-white/5 rounded-lg py-1.5 border border-white/5">
                          <div className="text-white/40">RS/Cat</div>
                          <div className="text-white font-bold">{b.catalyst?.score ?? 0}/15</div>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* Executive KPI Strip */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-6 gap-4">
            <div className="bg-white/[0.03] border border-white/10 rounded-2xl p-4 min-h-[135px] flex flex-col justify-between">
              <div className="flex items-center justify-between text-white/45 text-xs font-semibold uppercase">
                <span>Evaluated Waves</span>
                <Layers size={15} className="text-indigo-400" />
              </div>
              <div className="mt-2 flex flex-col justify-end">
                <div className="h-9 flex items-baseline gap-2">
                  <span className="text-3xl font-black text-white tracking-tight">{mainStats.evaluatedCount}</span>
                  {pendingZeroDayCount > 0 && (
                    <span className="text-xs font-mono text-amber-300/80" title="New signals from latest session awaiting 1+ forward trading days">
                      (+{pendingZeroDayCount} new 0d)
                    </span>
                  )}
                </div>
                <div className="text-xs text-white/45 mt-1 truncate">
                  {filteredEpisodes.length} waves ({filteredSignalAlertCount} daily alerts)
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
                    {formatPct(mainStats.avgMfe, 1)}
                  </span>
                  <span className="text-white/30 text-lg">/</span>
                  <span className="text-2xl font-black text-rose-400 tracking-tight">
                    {formatPct(mainStats.avgMae, 1)}
                  </span>
                </div>
                <div className="text-xs text-white/45 mt-1 truncate">
                  MFE/MAE Asymmetry:{' '}
                  <span className="text-white font-bold">
                    {mainStats.avgMae < 0 && mainStats.avgMfe > 0
                      ? `${(mainStats.avgMfe / Math.abs(mainStats.avgMae)).toFixed(2)}x`
                      : '—'}
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
                Unbiased entry-day factor attribution across signal statuses, 5-Pillar Conviction tiers, initial entry score tiers, and technical criteria.
              </p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div className="md:col-span-2">
                <FactorCard
                  title="1. 5-Pillar Conviction Ranker Tiers (A+ Prime • A Strong • B Solid • C Watch)"
                  subtitle="Forward returns grouped by composite 5-Pillar Conviction Tier (Sector Wind + ADR% Fuel + Tightness/Vol + Stop R:R + Catalyst/RS)"
                  rows={factorAnalysis.byConviction}
                />
              </div>
              <FactorCard
                title="2. Signal Status & Upgrade Bias Audit"
                subtitle="Direct Candidates vs Initial Watch vs Watch → Candidate (measured both from Upgrade Day and Day 1)"
                rows={factorAnalysis.byStatus}
              />
              <FactorCard
                title="3. Entry-Day Score Tiers (Unbiased Initial Score)"
                subtitle="Forward returns grouped strictly by the score on Day 1 of the wave (no future peak-score leakage)"
                rows={factorAnalysis.byScore}
              />
              <FactorCard
                title={
                  strategyEpisodeType === 'early_surf'
                    ? '4. Early Surf Mechanics (SMA50 Pinch, EMA Surf & RSI)'
                    : '4. Technical Setup Mechanics (Tightness, Volume & RS)'
                }
                subtitle={
                  strategyEpisodeType === 'early_surf'
                    ? 'Impact of SMA50 proximity, EMA10 > EMA20 streak, RSI sweet spot, and tight candles'
                    : 'Impact of price tightness, volume dry-up, and high relative strength on swing returns'
                }
                rows={factorAnalysis.bySetupMechanics}
              />
              <FactorCard
                title={
                  strategyEpisodeType === 'early_surf'
                    ? '5. ADR Fuel, RVOL Quietness & Alert Persistence'
                    : '5. Alert Persistence & Moving Average Extension'
                }
                subtitle={
                  strategyEpisodeType === 'early_surf'
                    ? 'Performance by ADR% fuel capacity, quiet RVOL contraction, and multi-day persistence'
                    : 'Multi-day persistent alert streaks vs single-day alerts & low-extension entries'
                }
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
                {bestPerformers.map(({ ep, traj, val }, idx) => (
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
                          <ConvictionBadge ep={ep} />
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
                            {ep.peak_status} ({ep.initial_score})
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
                          {traj.entry_date} ({ep.alert_days}d alerts) • Entry: ${traj.entry_price}
                        </div>
                      </div>
                    </div>

                    <div className="text-right">
                      <div className="text-base font-mono font-black text-emerald-300">
                        {formatPct(val)}
                      </div>
                      <div className="text-[11px] font-mono text-white/45">
                        Max Peak: {formatPct(traj.mfe)} ({traj.mfe_days ?? '—'}d)
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
                {worstPerformers.map(({ ep, traj, val }, idx) => (
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
                          <ConvictionBadge ep={ep} />
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
                            {ep.peak_status} ({ep.initial_score})
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
                          {traj.entry_date} ({ep.alert_days}d alerts) • Entry: ${traj.entry_price}
                        </div>
                      </div>
                    </div>

                    <div className="text-right">
                      <div className="text-base font-mono font-black text-rose-400">
                        {formatPct(val)}
                      </div>
                      <div className="text-[11px] font-mono text-white/45">
                        Max DD: {formatPct(Math.min(0, traj.mae ?? 0))} ({traj.mae_days ?? '—'}d)
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
                      onClick={() => handleSort('conviction_score')}
                      className="py-3.5 px-4 cursor-pointer hover:text-amber-300"
                    >
                      Conviction &amp; Score
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
                    const traj = getEpisodeTrajectory(ep, entryBasis);
                    const v3d = getEpisodeHorizonValue(ep, '3d', returnMode, includePartial, entryBasis);
                    const v1w = getEpisodeHorizonValue(ep, '1w', returnMode, includePartial, entryBasis);
                    const v1m = getEpisodeHorizonValue(ep, '1m', returnMode, includePartial, entryBasis);
                    const v3m = getEpisodeHorizonValue(ep, '3m', returnMode, includePartial, entryBasis);
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
                            {traj.entry_date}
                            {ep.end_date !== traj.entry_date ? ` → ${ep.end_date.slice(5)}` : ''}
                          </div>
                          <div className="text-[11px] text-white/45 flex items-center gap-1.5 mt-0.5">
                            <span>{ep.alert_days}d alerts</span>
                            <span>•</span>
                            <span>{traj.trading_days_elapsed}d elapsed</span>
                          </div>
                        </td>

                        <td className="py-3 px-4">
                          <div className="flex items-center gap-1.5">
                            <ConvictionBadge ep={ep} />
                            <span
                              className={`px-2 py-0.5 rounded font-bold uppercase text-[10px] ${
                                ep.peak_status === 'candidate'
                                  ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30'
                                  : 'bg-amber-500/20 text-amber-300 border border-amber-500/30'
                              }`}
                            >
                              {ep.peak_status}
                            </span>
                            <span className="font-mono font-bold text-white" title={`Initial Score: ${ep.initial_score} • Peak Score: ${ep.max_score}`}>
                              {ep.initial_score}
                              {ep.max_score > ep.initial_score ? (
                                <span className="text-[10px] text-white/45 font-normal">→{ep.max_score}</span>
                              ) : null}
                            </span>
                            {ep.upgraded_to_candidate && (
                              <span
                                className="px-1.5 py-0.5 rounded bg-indigo-500/20 text-indigo-300 text-[10px] font-bold"
                                title={`Started as Watch ($${ep.entry_price}) and upgraded to Candidate on ${ep.candidate_entry?.entry_date || ''} ($${ep.candidate_entry?.entry_price || ''})`}
                              >
                                ⬆️ Upgraded
                              </span>
                            )}
                          </div>
                        </td>

                        <td className="py-3 px-4">
                          {ep.analysis_type === 'early_surf' ? (
                            <div className="flex items-center gap-1.5">
                              {r.ext_sma50_pct !== undefined && (
                                <span className="px-1.5 py-0.5 rounded text-[10px] font-mono bg-cyan-500/15 text-cyan-300 border border-cyan-500/25">
                                  50d:{r.ext_sma50_pct > 0 ? `+${r.ext_sma50_pct}` : r.ext_sma50_pct}%
                                </span>
                              )}
                              {r.rsi_14 !== undefined && (
                                <span className="px-1.5 py-0.5 rounded text-[10px] font-mono bg-indigo-500/15 text-indigo-300 border border-indigo-500/25">
                                  RSI:{r.rsi_14}
                                </span>
                              )}
                              {r.ema10_gt_20_days !== undefined && (
                                <span className="px-1.5 py-0.5 rounded text-[10px] font-mono bg-white/5 text-white/70 border border-white/10">
                                  Surf:{r.ema10_gt_20_days}d
                                </span>
                              )}
                            </div>
                          ) : (
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
                          )}
                        </td>

                        <td className="py-3 px-4 text-right font-mono text-white/80">
                          ${traj.entry_price ?? '—'} → ${traj.latest_price ?? '—'}
                        </td>

                        <td className={`py-3 px-4 text-right font-mono ${getPctColor(v3d)}`}>
                          {formatPct(v3d)}
                          {!traj.horizons?.['3d']?.completed && v3d !== null && (
                            <span className="text-[10px] text-white/35 ml-0.5" title="3 trading days not yet completed">⏳</span>
                          )}
                        </td>

                        <td className={`py-3 px-4 text-right font-mono ${getPctColor(v1w)}`}>
                          {formatPct(v1w)}
                          {!traj.horizons?.['1w']?.completed && v1w !== null && (
                            <span className="text-[10px] text-white/35 ml-0.5" title="5 trading days not yet completed">⏳</span>
                          )}
                        </td>

                        <td className={`py-3 px-4 text-right font-mono ${getPctColor(v1m)}`}>
                          {formatPct(v1m)}
                          {!traj.horizons?.['1m']?.completed && v1m !== null && (
                            <span className="text-[10px] text-white/35 ml-0.5" title="21 trading days not yet completed">⏳</span>
                          )}
                        </td>

                        <td className={`py-3 px-4 text-right font-mono ${getPctColor(v3m)}`}>
                          {formatPct(v3m)}
                          {!traj.horizons?.['3m']?.completed && v3m !== null && (
                            <span className="text-[10px] text-white/35 ml-0.5" title="63 trading days not yet completed">⏳</span>
                          )}
                        </td>

                        <td className="py-3 px-4 text-right font-mono text-emerald-300 font-bold">
                          {formatPct(traj.mfe)}
                          {traj.mfe_days ? (
                            <span className="text-[10px] text-white/35 font-normal ml-1">({traj.mfe_days}d)</span>
                          ) : null}
                        </td>

                        <td className="py-3 px-4 text-right font-mono text-rose-400">
                          {formatPct(traj.mae !== null && traj.mae !== undefined ? Math.min(0, traj.mae) : null)}
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

                  {tableEpisodes.length === 0 && (
                    <tr>
                      <td colSpan={12} className="py-16 text-center text-white/40">
                        <div className="flex flex-col items-center justify-center gap-2">
                          <Calendar size={28} className="text-white/20 mb-1" />
                          <p className="text-sm font-semibold text-white/70">
                            No signal wave episodes match the selected period or filters.
                          </p>
                          <p className="text-xs text-white/40 max-w-sm">
                            Try selecting different months, broadening your filter criteria, or clicking &quot;Select All Active Months&quot;.
                          </p>
                        </div>
                      </td>
                    </tr>
                  )}
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
    const symEpisodes = episodes.filter(
      (e) => e.symbol === symbol && (e.analysis_type === 'qullamaggie' || e.analysis_type === 'early_surf')
    );
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

