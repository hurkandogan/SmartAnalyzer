'use client';

import React, { useState } from 'react';
import {
  FiRefreshCw,
  FiTrendingUp,
  FiActivity,
  FiShield,
  FiAlertTriangle,
  FiZap,
  FiLayers,
} from 'react-icons/fi';
import { getMarketStatusAction } from '@/actions/analysis';

const LIGHT_STYLES: Record<string, {
  dot: string;
  badge: string;
  border: string;
  bg: string;
  text: string;
  label: string;
}> = {
  green: {
    dot: 'bg-emerald-400 shadow-[0_0_12px_rgba(52,211,153,0.9)]',
    badge: 'bg-emerald-500/15 text-emerald-400 border-emerald-500/35',
    border: 'border-emerald-500/30',
    bg: 'bg-emerald-500/[0.06]',
    text: 'text-emerald-400',
    label: 'GREEN LIGHT',
  },
  yellow: {
    dot: 'bg-amber-400 shadow-[0_0_12px_rgba(251,191,36,0.9)]',
    badge: 'bg-amber-500/15 text-amber-400 border-amber-500/35',
    border: 'border-amber-500/30',
    bg: 'bg-amber-500/[0.06]',
    text: 'text-amber-400',
    label: 'YELLOW LIGHT',
  },
  red: {
    dot: 'bg-rose-500 shadow-[0_0_12px_rgba(244,63,94,0.9)]',
    badge: 'bg-rose-500/15 text-rose-400 border-rose-500/35',
    border: 'border-rose-500/30',
    bg: 'bg-rose-500/[0.06]',
    text: 'text-rose-400',
    label: 'RED LIGHT',
  },
};

function fmtPct(val: any, showPlus = true, digits = 2): string {
  if (val === null || val === undefined || isNaN(Number(val))) return '—';
  const n = Number(val);
  const sign = showPlus && n > 0 ? '+' : '';
  return `${sign}${n.toFixed(digits)}%`;
}

function TrafficLightHousing({ activeLight = 'yellow', size = 'md' }: { activeLight?: string; size?: 'sm' | 'md' | 'lg' }) {
  const lampSize = size === 'lg' ? 'w-5 h-5' : 'w-3.5 h-3.5';
  const pad = size === 'lg' ? 'px-3 py-2 gap-2.5' : 'px-2 py-1 gap-1.5';
  return (
    <div className={`inline-flex items-center ${pad} rounded-full bg-base-300/90 border border-base-content/15 shadow-inner`}>
      <span
        className={`rounded-full ${lampSize} transition-all ${
          activeLight === 'red'
            ? 'bg-rose-500 shadow-[0_0_14px_rgba(244,63,94,1)] scale-110'
            : 'bg-rose-950/60 border border-rose-500/20 opacity-30'
        }`}
        title="Red Light: Defensive / Cash"
      />
      <span
        className={`rounded-full ${lampSize} transition-all ${
          activeLight === 'yellow'
            ? 'bg-amber-400 shadow-[0_0_14px_rgba(251,191,36,1)] scale-110'
            : 'bg-amber-950/60 border border-amber-500/20 opacity-30'
        }`}
        title="Yellow Light: Selective / Half Size"
      />
      <span
        className={`rounded-full ${lampSize} transition-all ${
          activeLight === 'green'
            ? 'bg-emerald-400 shadow-[0_0_14px_rgba(52,211,153,1)] scale-110'
            : 'bg-emerald-950/60 border border-emerald-500/20 opacity-30'
        }`}
        title="Green Light: Bull Surf / Full Size"
      />
    </div>
  );
}

function MaLightPill({
  label,
  value,
  distPct,
  isAbove,
}: {
  label: string;
  value: any;
  distPct: any;
  isAbove: boolean;
}) {
  return (
    <div
      className={`flex items-center justify-between px-2.5 py-1.5 rounded-lg border text-xs ${
        isAbove
          ? 'bg-emerald-500/10 border-emerald-500/25 text-emerald-300'
          : 'bg-rose-500/10 border-rose-500/25 text-rose-300'
      }`}
    >
      <div className="flex items-center gap-1.5">
        <span
          className={`w-2 h-2 rounded-full ${
            isAbove
              ? 'bg-emerald-400 shadow-[0_0_6px_rgba(52,211,153,0.8)]'
              : 'bg-rose-500 shadow-[0_0_6px_rgba(244,63,94,0.8)]'
          }`}
        />
        <span className="font-bold tracking-wide">{label}</span>
      </div>
      <div className="font-mono flex items-center gap-1.5">
        <span className="opacity-90">${value != null ? Number(value).toFixed(2) : '—'}</span>
        <span className={`text-[11px] font-bold ${isAbove ? 'text-emerald-400' : 'text-rose-400'}`}>
          ({fmtPct(distPct, true, 1)})
        </span>
      </div>
    </div>
  );
}

interface MarketStatusTabProps {
  initialStatus: any;
  onNavigateTab?: (tab: 'active' | 'early_surf') => void;
}

export default function MarketStatusTab({ initialStatus, onNavigateTab }: MarketStatusTabProps) {
  const [statusData, setStatusData] = useState<any>(initialStatus);
  const [refreshing, setRefreshing] = useState(false);

  const handleRefresh = async () => {
    setRefreshing(true);
    try {
      const fresh = await getMarketStatusAction();
      if (fresh) setStatusData(fresh);
    } finally {
      setRefreshing(false);
    }
  };

  if (!statusData) {
    return (
      <div className="bg-base-200/70 rounded-2xl border border-base-300 p-10 text-center space-y-3">
        <FiAlertTriangle className="w-8 h-8 mx-auto text-warning" />
        <div className="font-bold text-base">Market Status Data Not Yet Available</div>
        <p className="text-xs opacity-60 max-w-md mx-auto">
          The Market Pulse job syncs live index moving averages, 1,600+ stock breadth, and options volatility to Firebase every 30 minutes.
        </p>
        <button
          type="button"
          onClick={handleRefresh}
          disabled={refreshing}
          className="btn btn-sm btn-primary gap-2"
        >
          <FiRefreshCw className={refreshing ? 'animate-spin' : ''} />
          <span>Reload Status</span>
        </button>
      </div>
    );
  }

  const {
    regime = {},
    indices = {},
    rotation = {},
    breadth = {},
    options_macro = {},
    setups = {},
  } = statusData;

  const overallLight = regime.overall_light || 'yellow';
  const style = LIGHT_STYLES[overallLight] || LIGHT_STYLES.yellow;
  const pillars = regime.pillars || {};
  const actionPlan = regime.action_plan || {};

  const indexOrder = ['QQQ', 'SPY', 'RSP', 'IWM'];
  const history14d: any[] = breadth.history_14d || [];
  const sectors: any[] = breadth.sector_breadth || [];
  const topSectors = sectors.slice(0, 5);
  const bottomSectors = [...sectors].reverse().slice(0, 5);

  const vix = options_macro.vix || {};
  const term = options_macro.term_structure || {};
  const credit = options_macro.credit_hyg || {};
  const rates = options_macro.rates_and_fx || {};

  return (
    <div className="space-y-5">
      {/* 1. MASTER REGIME BANNER & TRAFFIC LIGHT */}
      <div className={`rounded-2xl border ${style.border} ${style.bg} p-5 shadow-sm`}>
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 border-b border-base-content/10 pb-4">
          <div className="flex flex-wrap items-center gap-4">
            <TrafficLightHousing activeLight={overallLight} size="lg" />
            <div>
              <div className="flex flex-wrap items-center gap-2.5">
                <span className={`px-2.5 py-0.5 rounded-full text-xs font-extrabold border tracking-wider ${style.badge}`}>
                  {regime.regime_title || style.label}
                </span>
                <span className="px-2.5 py-0.5 rounded-lg bg-base-300/80 border border-base-content/10 text-xs font-mono">
                  Composite Score: <strong className={style.text}>{regime.composite_score ?? '—'}/100</strong>
                </span>
                <span className="text-xs opacity-50 font-mono">
                  Candle Base: {statusData.latest_candle_date || '—'} • Synced:{' '}
                  {statusData.generated_at ? new Date(statusData.generated_at).toLocaleTimeString() : '—'}
                </span>
              </div>
              <p className="text-sm opacity-90 font-medium mt-1.5 max-w-4xl">{regime.headline}</p>
            </div>
          </div>

          <button
            type="button"
            onClick={handleRefresh}
            disabled={refreshing}
            className="btn btn-sm bg-base-200 hover:bg-base-300 border border-base-content/15 gap-2 self-start lg:self-center"
          >
            <FiRefreshCw className={`w-3.5 h-3.5 ${refreshing ? 'animate-spin text-primary' : 'text-emerald-400'}`} />
            <span>{refreshing ? 'Refreshing...' : 'Refresh Status'}</span>
          </button>
        </div>

        {/* 3 Pillar Score Strip + Action Plan Cards */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-3 mt-4">
          <div className="bg-base-200/80 border border-base-300 rounded-xl p-3 flex flex-col justify-between">
            <div className="text-[11px] font-bold uppercase tracking-wider opacity-50">
              3-Pillar Health Breakdown
            </div>
            <div className="flex flex-col gap-1.5 mt-2 text-xs font-mono">
              <div className="flex items-center justify-between gap-2 whitespace-nowrap">
                <span className="opacity-70 truncate" title="QQQ / SPY / RSP / IWM">
                  1. Index Trend (ETFs):
                </span>
                <strong className="shrink-0">
                  {pillars.index_trend_score ?? 0} / {pillars.index_trend_max ?? 40}
                </strong>
              </div>
              <div className="flex items-center justify-between gap-2 whitespace-nowrap">
                <span className="opacity-70 truncate">
                  2. Internal Breadth ({breadth.total_stocks || 1609}):
                </span>
                <strong className="shrink-0">
                  {pillars.breadth_score ?? 0} / {pillars.breadth_max ?? 35}
                </strong>
              </div>
              <div className="flex items-center justify-between gap-2 whitespace-nowrap">
                <span className="opacity-70 truncate">
                  3. Volatility &amp; Credit:
                </span>
                <strong className="shrink-0">
                  {pillars.vol_credit_score ?? 0} / {pillars.vol_credit_max ?? 25}
                </strong>
              </div>
            </div>
          </div>

          <div className="bg-base-200/80 border border-base-300 rounded-xl p-3 flex flex-col justify-between">
            <div className="text-[11px] font-bold uppercase tracking-wider opacity-50">
              Recommended Position Sizing
            </div>
            <div className="mt-1.5">
              <div className={`text-base font-extrabold ${style.text}`}>{actionPlan.max_positions || '—'}</div>
              <div className="text-xs opacity-80 font-mono mt-0.5">
                Risk Budget: <strong>{actionPlan.risk_per_trade || '—'}</strong>
              </div>
              <div className="text-[11px] opacity-55 mt-1">
                Stop Rule: Close below <code className="text-cyan-400">EMA20 × 0.995</code> (-3% hard stop)
              </div>
            </div>
          </div>

          <div className="bg-base-200/80 border border-base-300 rounded-xl p-3 flex flex-col justify-between">
            <div className="flex items-center justify-between">
              <span className="text-[11px] font-bold uppercase tracking-wider text-indigo-400">
                Swing Trading Playbook
              </span>
              <FiZap className="w-3.5 h-3.5 text-indigo-400" />
            </div>
            <p className="text-xs opacity-85 leading-relaxed mt-1.5">{actionPlan.swing_playbook}</p>
          </div>

          <div className="bg-base-200/80 border border-base-300 rounded-xl p-3 flex flex-col justify-between">
            <div className="flex items-center justify-between">
              <span className="text-[11px] font-bold uppercase tracking-wider text-amber-400">
                Options Desk Playbook
              </span>
              <span className="px-2 py-0.5 rounded bg-amber-500/20 border border-amber-500/30 text-[10px] font-mono font-bold text-amber-300">
                {actionPlan.options_mode_badge}
              </span>
            </div>
            <p className="text-xs opacity-85 leading-relaxed mt-1.5">{actionPlan.options_playbook}</p>
          </div>
        </div>
      </div>

      {/* 2. LIVE BENCHMARK INDICES (QQQ, SPY, RSP, IWM) + EQUAL-WEIGHT ROTATION */}
      <div className="space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <FiActivity className="w-4 h-4 text-primary" />
            <h3 className="text-sm font-extrabold uppercase tracking-wider">
              Live Index Compass &amp; Moving Average Stack (QQQ • SPY • RSP • IWM)
            </h3>
          </div>
          <span className="text-xs opacity-55">
            Updated every 30m • Green = Surfing above EMA10, EMA20 &amp; SMA50
          </span>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-3.5">
          {indexOrder.map((sym) => {
            const idx = indices[sym];
            if (!idx) return null;
            const lStyle = LIGHT_STYLES[idx.light] || LIGHT_STYLES.yellow;
            const chg1d = Number(idx.change_1d_pct || 0);
            const chg5d = Number(idx.change_5d_pct || 0);

            return (
              <div
                key={sym}
                className={`rounded-2xl border ${lStyle.border} bg-base-200/60 p-4 flex flex-col justify-between gap-3`}
              >
                <div className="flex items-start justify-between gap-2 border-b border-base-content/10 pb-2.5">
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="text-lg font-black tracking-tight">{sym}</span>
                      <span className="text-xs opacity-60 font-medium">{idx.short_name}</span>
                    </div>
                    <div className="text-[11px] opacity-50">{idx.role}</div>
                  </div>
                  <div className="flex flex-col items-end gap-1">
                    <TrafficLightHousing activeLight={idx.light} size="sm" />
                    <span className={`text-[10px] font-extrabold px-2 py-0.5 rounded border ${lStyle.badge}`}>
                      {idx.short_status}
                    </span>
                  </div>
                </div>

                {/* Price & 1D / 5D Change (Two Rows) */}
                <div className="flex flex-col gap-2">
                  <div className="flex items-baseline justify-between">
                    <span className="text-[10px] uppercase tracking-wider opacity-40 font-bold">Last Price</span>
                    <div className="text-2xl font-mono font-black">
                      ${idx.price != null ? Number(idx.price).toFixed(2) : '—'}
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-2 font-mono text-xs">
                    <div
                      className={`px-2.5 py-1 rounded-lg font-bold flex items-center justify-between whitespace-nowrap border ${
                        chg1d >= 0
                          ? 'bg-emerald-500/15 text-emerald-400 border-emerald-500/25'
                          : 'bg-rose-500/15 text-rose-400 border-rose-500/25'
                      }`}
                    >
                      <span className="opacity-70 text-[10px]">1D</span>
                      <span>{fmtPct(chg1d)}</span>
                    </div>
                    <div
                      className={`px-2.5 py-1 rounded-lg font-bold flex items-center justify-between whitespace-nowrap border ${
                        chg5d >= 0
                          ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20'
                          : 'bg-rose-500/10 text-rose-400 border-rose-500/20'
                      }`}
                    >
                      <span className="opacity-70 text-[10px]">5D</span>
                      <span>{fmtPct(chg5d)}</span>
                    </div>
                  </div>
                </div>

                {/* 4 Moving Average Traffic Lights */}
                <div className="flex flex-col gap-1.5">
                  <MaLightPill label="EMA 10" value={idx.ema10} distPct={idx.dist_ema10_pct} isAbove={idx.above_ema10} />
                  <MaLightPill label="EMA 20" value={idx.ema20} distPct={idx.dist_ema20_pct} isAbove={idx.above_ema20} />
                  <MaLightPill label="SMA 50" value={idx.sma50} distPct={idx.dist_sma50_pct} isAbove={idx.above_sma50} />
                  <MaLightPill label="SMA 200" value={idx.sma200} distPct={idx.dist_sma200_pct} isAbove={idx.above_sma200} />
                </div>

                {/* Surf Structure Footer */}
                <div className="flex items-center justify-between pt-2 border-t border-base-content/10 text-[11px]">
                  <span className="opacity-60">EMA10 vs EMA20:</span>
                  <span className={`font-bold ${idx.ema10_gt_ema20 ? 'text-emerald-400' : 'text-rose-400'}`}>
                    {idx.ema10_gt_ema20 ? '🟢 EMA10 > EMA20 (Surf)' : '🔴 EMA10 < EMA20 (Inverted)'}
                  </span>
                </div>
              </div>
            );
          })}
        </div>

        {/* Equal-Weight (RSP) vs Cap-Weight (SPY/QQQ) Rotation Callout */}
        {rotation?.title && (
          <div
            className={`rounded-xl border px-4 py-3 flex flex-col md:flex-row md:items-center justify-between gap-3 ${
              LIGHT_STYLES[rotation.light]?.border || 'border-base-300'
            } bg-base-200/60`}
          >
            <div className="flex items-start md:items-center gap-3">
              <span className={`w-3 h-3 rounded-full shrink-0 mt-1 md:mt-0 ${LIGHT_STYLES[rotation.light]?.dot}`} />
              <div>
                <div className="text-xs font-extrabold uppercase tracking-wide">
                  Equal-Weight Breadth Rotation (RSP vs SPY &amp; QQQ):{' '}
                  <span className={LIGHT_STYLES[rotation.light]?.text}>{rotation.title}</span>
                </div>
                <p className="text-xs opacity-70 mt-0.5">{rotation.description}</p>
              </div>
            </div>
            <div className="flex items-center gap-2 shrink-0 font-mono text-xs">
              <span className="px-2.5 py-1 rounded-lg bg-base-300 border border-base-content/10">
                RSP vs SPY (5D):{' '}
                <strong className={rotation.rsp_vs_spy_5d_pct >= 0 ? 'text-emerald-400' : 'text-rose-400'}>
                  {fmtPct(rotation.rsp_vs_spy_5d_pct)}
                </strong>
              </span>
              <span className="px-2.5 py-1 rounded-lg bg-base-300 border border-base-content/10">
                RSP vs QQQ (5D):{' '}
                <strong className={rotation.rsp_vs_qqq_5d_pct >= 0 ? 'text-emerald-400' : 'text-rose-400'}>
                  {fmtPct(rotation.rsp_vs_qqq_5d_pct)}
                </strong>
              </span>
            </div>
          </div>
        )}
      </div>

      {/* 3. INTERNAL MARKET BREADTH & 1,609-STOCK WAVE BAROMETER */}
      <div className="bg-base-200/60 border border-base-300 rounded-2xl p-5 space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-base-content/10 pb-3">
          <div className="flex items-center gap-2.5">
            <FiLayers className="w-4 h-4 text-cyan-400" />
            <div>
              <h3 className="text-sm font-extrabold uppercase tracking-wider">
                Internal Market Breadth &amp; Wave Barometer ({breadth.total_stocks || 1609} Active Stocks)
              </h3>
              <p className="text-xs opacity-60">
                Live breakdown of how many stocks are surfing in Bull Trend, Early Surf, Pullback, or Bear Downtrend
              </p>
            </div>
          </div>

          <span
            className={`px-3 py-1 rounded-full text-xs font-extrabold border ${
              LIGHT_STYLES[breadth.thrust_light]?.badge || LIGHT_STYLES.yellow.badge
            }`}
          >
            {breadth.thrust_state}
          </span>
        </div>

        {/* 4-Zone Stacked Progress Bar */}
        <div className="space-y-2">
          <div className="w-full h-5 rounded-xl overflow-hidden flex bg-base-300 border border-base-content/10 p-0.5 gap-0.5">
            <div
              style={{ width: `${breadth.green_bull_surf_pct || 0}%` }}
              className="bg-emerald-500 h-full rounded-l-lg transition-all"
              title={`Green — Full Bull Surf: ${breadth.green_bull_surf_count} stocks (${breadth.green_bull_surf_pct}%)`}
            />
            <div
              style={{ width: `${breadth.cyan_early_surf_pct || 0}%` }}
              className="bg-cyan-400 h-full transition-all"
              title={`Cyan — Early Surf Turnaround: ${breadth.cyan_early_surf_count} stocks (${breadth.cyan_early_surf_pct}%)`}
            />
            <div
              style={{ width: `${breadth.yellow_pullback_pct || 0}%` }}
              className="bg-amber-400 h-full transition-all"
              title={`Yellow — Pullback / Consolidation: ${breadth.yellow_pullback_count} stocks (${breadth.yellow_pullback_pct}%)`}
            />
            <div
              style={{ width: `${breadth.red_bear_pct || 0}%` }}
              className="bg-rose-500 h-full rounded-r-lg transition-all"
              title={`Red — Bear / Below EMA20 & SMA50: ${breadth.red_bear_count} stocks (${breadth.red_bear_pct}%)`}
            />
          </div>

          {/* 4-Zone Legend Cards */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 pt-1">
            <div className="bg-emerald-500/10 border border-emerald-500/25 rounded-xl p-3">
              <div className="flex items-center justify-between text-xs font-bold text-emerald-400">
                <span>🟢 Full Bull Surf</span>
                <span className="font-mono">{breadth.green_bull_surf_pct}%</span>
              </div>
              <div className="text-xl font-mono font-black mt-1">
                {breadth.green_bull_surf_count} <span className="text-xs font-normal opacity-60">stocks</span>
              </div>
              <div className="text-[11px] opacity-60 mt-0.5">Close &gt; EMA10 &gt; EMA20 &amp; &gt; SMA50</div>
            </div>

            <div className="bg-cyan-500/10 border border-cyan-500/25 rounded-xl p-3">
              <div className="flex items-center justify-between text-xs font-bold text-cyan-400">
                <span>🌊 Early Surf Zone</span>
                <span className="font-mono">{breadth.cyan_early_surf_pct}%</span>
              </div>
              <div className="text-xl font-mono font-black mt-1">
                {breadth.cyan_early_surf_count} <span className="text-xs font-normal opacity-60">stocks</span>
              </div>
              <div className="text-[11px] opacity-60 mt-0.5">EMA10 &gt; EMA20 turning up below SMA50</div>
            </div>

            <div className="bg-amber-500/10 border border-amber-500/25 rounded-xl p-3">
              <div className="flex items-center justify-between text-xs font-bold text-amber-400">
                <span>🟡 Pullback / Coiling</span>
                <span className="font-mono">{breadth.yellow_pullback_pct}%</span>
              </div>
              <div className="text-xl font-mono font-black mt-1">
                {breadth.yellow_pullback_count} <span className="text-xs font-normal opacity-60">stocks</span>
              </div>
              <div className="text-[11px] opacity-60 mt-0.5">Testing EMA20 or SMA50 support zone</div>
            </div>

            <div className="bg-rose-500/10 border border-rose-500/25 rounded-xl p-3">
              <div className="flex items-center justify-between text-xs font-bold text-rose-400">
                <span>🔴 Bear / Broken</span>
                <span className="font-mono">{breadth.red_bear_pct}%</span>
              </div>
              <div className="text-xl font-mono font-black mt-1">
                {breadth.red_bear_count} <span className="text-xs font-normal opacity-60">stocks</span>
              </div>
              <div className="text-[11px] opacity-60 mt-0.5">Below both EMA20 and SMA50 (Avoid)</div>
            </div>
          </div>
        </div>

        {/* MA Thermometers */}
        <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
          <div className="bg-base-300/60 border border-base-content/10 rounded-xl p-3">
            <div className="text-[11px] opacity-55 font-bold uppercase">% Above EMA 10</div>
            <div className="flex items-baseline justify-between mt-1">
              <span className="text-xl font-mono font-black">{breadth.pct_above_ema10}%</span>
              <span
                className={`text-xs font-mono font-bold ${
                  breadth.delta_1d_ema10_pct >= 0 ? 'text-emerald-400' : 'text-rose-400'
                }`}
              >
                {fmtPct(breadth.delta_1d_ema10_pct, true, 1)} (1D)
              </span>
            </div>
            <div className="text-[11px] opacity-50 font-mono mt-0.5">
              {breadth.above_ema10_count} stocks ({breadth.net_ema10_stocks_1d >= 0 ? '+' : ''}
              {breadth.net_ema10_stocks_1d} today)
            </div>
          </div>

          <div className="bg-base-300/60 border border-base-content/10 rounded-xl p-3">
            <div className="text-[11px] opacity-55 font-bold uppercase">% Above EMA 20</div>
            <div className="flex items-baseline justify-between mt-1">
              <span className="text-xl font-mono font-black">{breadth.pct_above_ema20}%</span>
              <span
                className={`text-xs font-mono font-bold ${
                  breadth.delta_1d_ema20_pct >= 0 ? 'text-emerald-400' : 'text-rose-400'
                }`}
              >
                {fmtPct(breadth.delta_1d_ema20_pct, true, 1)} (1D)
              </span>
            </div>
            <div className="text-[11px] opacity-50 font-mono mt-0.5">
              {breadth.above_ema20_count} stocks ({breadth.net_ema20_stocks_1d >= 0 ? '+' : ''}
              {breadth.net_ema20_stocks_1d} today)
            </div>
          </div>

          <div className="bg-base-300/60 border border-base-content/10 rounded-xl p-3">
            <div className="text-[11px] opacity-55 font-bold uppercase">EMA10 &gt; EMA20 Surf</div>
            <div className="text-xl font-mono font-black text-cyan-400 mt-1">{breadth.pct_ema10_gt_ema20}%</div>
            <div className="text-[11px] opacity-50 font-mono mt-0.5">
              {breadth.ema10_gt_ema20_count} stocks with stacked EMAs
            </div>
          </div>

          <div className="bg-base-300/60 border border-base-content/10 rounded-xl p-3">
            <div className="text-[11px] opacity-55 font-bold uppercase">% Above SMA 50</div>
            <div className="text-xl font-mono font-black mt-1">{breadth.pct_above_sma50}%</div>
            <div className="text-[11px] opacity-50 font-mono mt-0.5">
              {breadth.above_sma50_count} stocks in intermediate uptrend
            </div>
          </div>

          <div className="bg-base-300/60 border border-base-content/10 rounded-xl p-3">
            <div className="text-[11px] opacity-55 font-bold uppercase">% Above SMA 200</div>
            <div className="text-xl font-mono font-black mt-1">{breadth.pct_above_sma200}%</div>
            <div className="text-[11px] opacity-50 font-mono mt-0.5">
              {breadth.above_sma200_count} stocks in Stage-2 long-term bull
            </div>
          </div>
        </div>

        {/* 14-Day Breadth Trajectory + Sector Leaderboard */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 pt-2 border-t border-base-content/10">
          <div className="bg-base-300/40 border border-base-content/10 rounded-xl p-3.5">
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs font-bold uppercase tracking-wider opacity-80">
                Recent Breadth Trajectory (% Above EMA10 / EMA20 / SMA50)
              </span>
            </div>
            <p className="text-[11px] opacity-60 mb-2">{breadth.thrust_description}</p>
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs font-mono">
                <thead className="text-[10px] uppercase opacity-50 border-b border-base-content/10">
                  <tr>
                    <th className="py-1.5">Date</th>
                    <th className="py-1.5">&gt;EMA10</th>
                    <th className="py-1.5">&gt;EMA20</th>
                    <th className="py-1.5">&gt;SMA50</th>
                    <th className="py-1.5">4-Zone Split</th>
                  </tr>
                </thead>
                <tbody>
                  {[...history14d]
                    .reverse()
                    .slice(0, 7)
                    .map((row) => (
                      <tr key={row.date} className="border-b border-base-content/5">
                        <td className="py-1.5 opacity-80">{row.date}</td>
                        <td
                          className={`py-1.5 font-bold ${
                            row.pct_above_ema10 >= 58
                              ? 'text-emerald-400'
                              : row.pct_above_ema10 >= 45
                              ? 'text-amber-400'
                              : 'text-rose-400'
                          }`}
                        >
                          {row.pct_above_ema10}%
                        </td>
                        <td className="py-1.5">{row.pct_above_ema20}%</td>
                        <td className="py-1.5 opacity-75">{row.pct_above_sma50}%</td>
                        <td className="py-1.5">
                          <div className="w-28 h-2.5 rounded overflow-hidden flex bg-base-300">
                            <div style={{ width: `${row.green_bull_surf_pct}%` }} className="bg-emerald-500" />
                            <div style={{ width: `${row.cyan_early_surf_pct}%` }} className="bg-cyan-400" />
                            <div style={{ width: `${row.yellow_pullback_pct}%` }} className="bg-amber-400" />
                            <div style={{ width: `${row.red_bear_pct}%` }} className="bg-rose-500" />
                          </div>
                        </td>
                      </tr>
                    ))}
                </tbody>
              </table>
            </div>
          </div>

          <div className="bg-base-300/40 border border-base-content/10 rounded-xl p-3.5">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <div className="text-xs font-bold uppercase tracking-wider text-emerald-400 mb-2">
                  🟢 Strongest Sectors (% &gt; EMA20)
                </div>
                <div className="space-y-1.5">
                  {topSectors.map((s) => (
                    <div
                      key={s.sector}
                      className="flex items-center justify-between px-2.5 py-1.5 rounded-lg bg-emerald-500/10 border border-emerald-500/20 text-xs"
                    >
                      <span className="font-semibold truncate max-w-[135px]" title={s.sector}>
                        {s.sector}
                      </span>
                      <span className="font-mono font-bold text-emerald-400">
                        {s.pct_above_ema20}% <span className="text-[10px] opacity-55">({s.total})</span>
                      </span>
                    </div>
                  ))}
                </div>
              </div>

              <div>
                <div className="text-xs font-bold uppercase tracking-wider text-rose-400 mb-2">
                  🔴 Weakest Sectors (% &gt; EMA20)
                </div>
                <div className="space-y-1.5">
                  {bottomSectors.map((s) => (
                    <div
                      key={s.sector}
                      className="flex items-center justify-between px-2.5 py-1.5 rounded-lg bg-rose-500/10 border border-rose-500/20 text-xs"
                    >
                      <span className="font-semibold truncate max-w-[135px]" title={s.sector}>
                        {s.sector}
                      </span>
                      <span className="font-mono font-bold text-rose-400">
                        {s.pct_above_ema20}% <span className="text-[10px] opacity-55">({s.total})</span>
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* 4. OPTIONS & VOLATILITY COCKPIT + ACTIVE STRATEGY FUNNEL */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* Card A: VIX & Options Pricing Regime */}
        <div
          className={`rounded-2xl border ${
            LIGHT_STYLES[vix.light]?.border || 'border-base-300'
          } bg-base-200/60 p-4 flex flex-col justify-between gap-3`}
        >
          <div className="flex items-start justify-between border-b border-base-content/10 pb-2.5">
            <div>
              <div className="text-xs font-extrabold uppercase tracking-wider text-amber-400">
                Options Volatility &amp; Pricing Regime
              </div>
              <div className="text-[11px] opacity-60 mt-0.5">{vix.regime}</div>
            </div>
            <TrafficLightHousing activeLight={vix.light} size="sm" />
          </div>

          <div className="grid grid-cols-3 gap-2 font-mono">
            <div className="bg-base-300/60 border border-base-content/10 rounded-xl p-2.5">
              <div className="text-[10px] opacity-55 uppercase">CBOE VIX</div>
              <div className="text-lg font-black">{vix.price ?? '—'}</div>
              <div className={`text-[10px] font-bold ${(vix.change_1d_pct || 0) <= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
                {fmtPct(vix.change_1d_pct)}
              </div>
            </div>

            <div className="bg-base-300/60 border border-base-content/10 rounded-xl p-2.5">
              <div className="text-[10px] opacity-55 uppercase">Universe Med IV</div>
              <div className="text-lg font-black text-amber-400">
                {setups.options_wheel?.universe_median_iv_pct ?? '—'}%
              </div>
              <div className="text-[10px] opacity-55">
                Avg: {setups.options_wheel?.universe_avg_iv_pct ?? '—'}%
              </div>
            </div>

            <div className="bg-base-300/60 border border-base-content/10 rounded-xl p-2.5">
              <div className="text-[10px] opacity-55 uppercase">Wheel Ready</div>
              <div className="text-lg font-black text-emerald-400">
                {setups.options_wheel?.wheel_fit_pass_count ?? 0}
              </div>
              <div className="text-[10px] opacity-55">
                Prime IV: {setups.options_wheel?.prime_iv_35_75_count ?? 0}
              </div>
            </div>
          </div>

          <div className="text-xs opacity-85 bg-base-300/50 border border-base-content/10 rounded-xl p-2.5">
            <strong className="text-amber-400">{vix.options_mode_badge}:</strong> {vix.options_playbook}
          </div>
        </div>

        {/* Card B: VIX Term Structure & Credit Appetite */}
        <div
          className={`rounded-2xl border ${
            LIGHT_STYLES[term.light]?.border || 'border-base-300'
          } bg-base-200/60 p-4 flex flex-col justify-between gap-3`}
        >
          <div className="flex items-start justify-between border-b border-base-content/10 pb-2.5">
            <div>
              <div className="text-xs font-extrabold uppercase tracking-wider">
                VIX Term Structure &amp; Smart-Money Credit
              </div>
              <div className={`text-[11px] font-bold mt-0.5 ${LIGHT_STYLES[term.light]?.text}`}>
                {term.state}
              </div>
            </div>
            <TrafficLightHousing activeLight={term.light} size="sm" />
          </div>

          <div className="grid grid-cols-3 gap-2 font-mono text-center">
            <div className="bg-base-300/60 border border-base-content/10 rounded-xl p-2">
              <div className="text-[10px] opacity-55">VIX 9D (Short)</div>
              <div className="text-base font-black mt-0.5">{term.vix9d ?? '—'}</div>
            </div>
            <div className="bg-base-300/60 border border-base-content/10 rounded-xl p-2">
              <div className="text-[10px] opacity-55">VIX (30-Day)</div>
              <div className="text-base font-black mt-0.5">{term.vix ?? '—'}</div>
            </div>
            <div className="bg-base-300/60 border border-base-content/10 rounded-xl p-2">
              <div className="text-[10px] opacity-55">VIX 3M (90-Day)</div>
              <div className="text-base font-black mt-0.5">{term.vix3m ?? '—'}</div>
            </div>
          </div>

          <div className="space-y-1.5 text-xs">
            <div className="flex items-center justify-between px-2.5 py-1.5 rounded-lg bg-base-300/60 border border-base-content/10">
              <span className="opacity-70">High-Yield Credit (HYG):</span>
              <span className={`font-mono font-bold ${credit.above_ema20 ? 'text-emerald-400' : 'text-rose-400'}`}>
                ${credit.price} ({credit.above_ema20 ? '🟢 > EMA20 Risk-On' : '🔴 < EMA20 Stress'})
              </span>
            </div>
            <div className="flex items-center justify-between px-2.5 py-1.5 rounded-lg bg-base-300/60 border border-base-content/10">
              <span className="opacity-70">10Y Yield (^TNX) &amp; Dollar (DXY):</span>
              <span className="font-mono">
                TNX: <b>{rates.tnx_10y?.price ?? '—'}%</b> • DXY: <b>{rates.dxy_dollar?.price ?? '—'}</b>
              </span>
            </div>
          </div>
        </div>

        {/* Card C: Today's Filtered Swing Setup Funnel */}
        <div className="rounded-2xl border border-indigo-500/30 bg-indigo-500/[0.05] p-4 flex flex-col justify-between gap-3">
          <div className="flex items-center justify-between border-b border-base-content/10 pb-2.5">
            <div>
              <div className="text-xs font-extrabold uppercase tracking-wider text-indigo-400">
                Active Strategy Funnel (Today&apos;s Radar)
              </div>
              <div className="text-[11px] opacity-60 mt-0.5">
                Filtered setups passing strict Phase 1/2 &amp; Flag rules
              </div>
            </div>
            <FiTrendingUp className="w-4 h-4 text-indigo-400" />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="bg-base-300/60 border border-indigo-500/25 rounded-xl p-3 flex flex-col justify-between">
              <div className="text-xs font-bold text-indigo-400">⚡ Qullamaggie</div>
              <div className="text-2xl font-mono font-black mt-1">
                {setups.qullamaggie?.active_total ?? 0}{' '}
                <span className="text-xs font-normal opacity-60">active</span>
              </div>
              <div className="text-[11px] opacity-70 font-mono mt-1">
                Cand: <b>{setups.qullamaggie?.candidates ?? 0}</b> • Watch: <b>{setups.qullamaggie?.watch ?? 0}</b>
              </div>
              <div className="text-[11px] text-emerald-400 font-mono mt-0.5">
                Sweet Spot (70–88): <b>{setups.qullamaggie?.sweet_spot_70_88 ?? 0}</b>
              </div>
              {onNavigateTab && (
                <button
                  type="button"
                  onClick={() => onNavigateTab('active')}
                  className="mt-2 w-full py-1.5 rounded-lg bg-indigo-600/30 hover:bg-indigo-600/50 border border-indigo-500/40 text-xs font-bold text-indigo-300 cursor-pointer transition-all"
                >
                  Open Qullamaggie &rarr;
                </button>
              )}
            </div>

            <div className="bg-base-300/60 border border-cyan-500/25 rounded-xl p-3 flex flex-col justify-between">
              <div className="text-xs font-bold text-cyan-400">🌊 Early Surf (Ph 1 &amp; 2)</div>
              <div className="text-2xl font-mono font-black mt-1">
                {setups.early_surf?.active_total ?? 0}{' '}
                <span className="text-xs font-normal opacity-60">active</span>
              </div>
              <div className="text-[11px] opacity-70 font-mono mt-1">
                Ph1: <b className="text-cyan-400">{setups.early_surf?.phase_1_pre_cross ?? 0}</b> • Ph2:{' '}
                <b className="text-emerald-400">{setups.early_surf?.phase_2_bridge_cross ?? 0}</b>
              </div>
              <div className="text-[11px] text-emerald-400 font-mono mt-0.5">
                Sweet Spot (70–88): <b>{setups.early_surf?.sweet_spot_70_88 ?? 0}</b>
              </div>
              {onNavigateTab && (
                <button
                  type="button"
                  onClick={() => onNavigateTab('early_surf')}
                  className="mt-2 w-full py-1.5 rounded-lg bg-cyan-600/30 hover:bg-cyan-600/50 border border-cyan-500/40 text-xs font-bold text-cyan-300 cursor-pointer transition-all"
                >
                  Open Early Surf &rarr;
                </button>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
