import React, { useState, useEffect } from 'react';
import {
  Activity,
  RefreshCw,
  ShieldAlert,
  CheckCircle2,
  AlertTriangle,
  TrendingUp,
  TrendingDown,
  Zap,
  Layers,
  Gauge,
  Flame,
  BarChart3,
  Radio,
  ArrowUpRight,
  ArrowDownRight,
} from 'lucide-react';

const LIGHT_STYLES = {
  green: {
    dot: 'bg-emerald-400 shadow-[0_0_12px_rgba(52,211,153,0.9)]',
    badge: 'bg-emerald-500/15 text-emerald-300 border-emerald-500/35',
    border: 'border-emerald-500/30',
    bg: 'bg-emerald-500/[0.06]',
    text: 'text-emerald-300',
    label: 'GREEN LIGHT',
  },
  yellow: {
    dot: 'bg-amber-400 shadow-[0_0_12px_rgba(251,191,36,0.9)]',
    badge: 'bg-amber-500/15 text-amber-300 border-amber-500/35',
    border: 'border-amber-500/30',
    bg: 'bg-amber-500/[0.06]',
    text: 'text-amber-300',
    label: 'YELLOW LIGHT',
  },
  red: {
    dot: 'bg-rose-500 shadow-[0_0_12px_rgba(244,63,94,0.9)]',
    badge: 'bg-rose-500/15 text-rose-300 border-rose-500/35',
    border: 'border-rose-500/30',
    bg: 'bg-rose-500/[0.06]',
    text: 'text-rose-300',
    label: 'RED LIGHT',
  },
};

function fmtPct(val, showPlus = true, digits = 2) {
  if (val === null || val === undefined || Number.isNaN(Number(val))) return '—';
  const n = Number(val);
  const sign = showPlus && n > 0 ? '+' : '';
  return `${sign}${n.toFixed(digits)}%`;
}

function TrafficLightHousing({ activeLight = 'yellow', size = 'md' }) {
  const lampSize = size === 'lg' ? 'w-5 h-5' : 'w-3.5 h-3.5';
  const pad = size === 'lg' ? 'px-3 py-2 gap-2.5' : 'px-2 py-1 gap-1.5';
  return (
    <div className={`inline-flex items-center ${pad} rounded-full bg-black/70 border border-white/15 shadow-inner`}>
      <span
        className={`rounded-full ${lampSize} transition-all ${
          activeLight === 'red'
            ? 'bg-rose-500 shadow-[0_0_14px_rgba(244,63,94,1)] scale-110'
            : 'bg-rose-950/60 border border-rose-500/20 opacity-35'
        }`}
        title="Red Light: Defensive / Cash"
      />
      <span
        className={`rounded-full ${lampSize} transition-all ${
          activeLight === 'yellow'
            ? 'bg-amber-400 shadow-[0_0_14px_rgba(251,191,36,1)] scale-110'
            : 'bg-amber-950/60 border border-amber-500/20 opacity-35'
        }`}
        title="Yellow Light: Selective / Half Size"
      />
      <span
        className={`rounded-full ${lampSize} transition-all ${
          activeLight === 'green'
            ? 'bg-emerald-400 shadow-[0_0_14px_rgba(52,211,153,1)] scale-110'
            : 'bg-emerald-950/60 border border-emerald-500/20 opacity-35'
        }`}
        title="Green Light: Bull Surf / Full Size"
      />
    </div>
  );
}

function MaLightPill({ label, value, distPct, isAbove }) {
  return (
    <div
      className={`flex items-center justify-between px-2.5 py-1.5 rounded-lg border text-xs ${
        isAbove
          ? 'bg-emerald-500/10 border-emerald-500/25 text-emerald-200'
          : 'bg-rose-500/10 border-rose-500/25 text-rose-200'
      }`}
    >
      <div className="flex items-center gap-1.5">
        <span
          className={`w-2 h-2 rounded-full ${
            isAbove ? 'bg-emerald-400 shadow-[0_0_6px_rgba(52,211,153,0.8)]' : 'bg-rose-500 shadow-[0_0_6px_rgba(244,63,94,0.8)]'
          }`}
        />
        <span className="font-bold tracking-wide">{label}</span>
      </div>
      <div className="font-mono flex items-center gap-1.5">
        <span className="text-white/90">${value != null ? Number(value).toFixed(2) : '—'}</span>
        <span className={`text-[11px] font-bold ${isAbove ? 'text-emerald-300' : 'text-rose-300'}`}>
          ({fmtPct(distPct, true, 1)})
        </span>
      </div>
    </div>
  );
}

export default function MarketStatusCockpit({ onNavigateStrategy, compact = false }) {
  const [statusData, setStatusData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState(null);

  async function fetchMarketStatus(force = false) {
    try {
      if (force) setRefreshing(true);
      else setLoading(true);
      setError(null);

      const url = force ? '/api/analysis/market-status?refresh=true' : '/api/analysis/market-status';
      const res = await fetch(url);
      if (!res.ok) throw new Error(`HTTP ${res.status}: Failed to load Market Status`);
      const json = await res.json();
      setStatusData(json);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }

  useEffect(() => {
    fetchMarketStatus(false);
  }, []);

  if (loading && !statusData) {
    return (
      <div className="w-full py-16 bg-white/[0.02] border border-white/10 rounded-2xl flex flex-col items-center justify-center gap-3">
        <RefreshCw className="w-7 h-7 text-indigo-400 animate-spin" />
        <p className="text-sm text-white/60 font-medium">
          Computing Live Market Regime, Index MAs (QQQ, SPY, RSP, IWM), 1,600+ Breadth &amp; Options Cockpit...
        </p>
      </div>
    );
  }

  if (error && !statusData) {
    return (
      <div className="w-full p-6 bg-rose-500/10 border border-rose-500/30 rounded-2xl text-rose-200 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <AlertTriangle className="w-5 h-5 text-rose-400 shrink-0" />
          <span>{error}</span>
        </div>
        <button
          onClick={() => fetchMarketStatus(true)}
          className="px-3 py-1.5 rounded-lg bg-rose-500/20 hover:bg-rose-500/30 border border-rose-500/40 text-xs font-bold cursor-pointer"
        >
          Retry Now
        </button>
      </div>
    );
  }

  if (!statusData) return null;

  const { regime = {}, indices = {}, rotation = {}, breadth = {}, options_macro = {}, setups = {} } = statusData;
  const overallLight = regime.overall_light || 'yellow';
  const style = LIGHT_STYLES[overallLight] || LIGHT_STYLES.yellow;
  const pillars = regime.pillars || {};
  const actionPlan = regime.action_plan || {};

  const indexOrder = ['QQQ', 'SPY', 'RSP', 'IWM'];
  const history14d = breadth.history_14d || [];
  const sectors = breadth.sector_breadth || [];
  const topSectors = sectors.slice(0, 5);
  const bottomSectors = [...sectors].reverse().slice(0, 5);

  const vix = options_macro.vix || {};
  const term = options_macro.term_structure || {};
  const credit = options_macro.credit_hyg || {};
  const rates = options_macro.rates_and_fx || {};

  return (
    <div className="w-full flex flex-col gap-5">
      {/* 1. MASTER REGIME BANNER & TRAFFIC LIGHT */}
      <div className={`rounded-2xl border ${style.border} ${style.bg} p-5 transition-all`}>
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 border-b border-white/10 pb-4">
          <div className="flex flex-wrap items-center gap-4">
            <TrafficLightHousing activeLight={overallLight} size="lg" />
            <div>
              <div className="flex flex-wrap items-center gap-2.5">
                <span className={`px-2.5 py-0.5 rounded-full text-xs font-extrabold border tracking-wider ${style.badge}`}>
                  {regime.regime_title || style.label}
                </span>
                <span className="px-2.5 py-0.5 rounded-lg bg-black/50 border border-white/10 text-xs font-mono text-white/80">
                  Composite Score: <strong className={style.text}>{regime.composite_score ?? '—'}/100</strong>
                </span>
                <span className="text-xs text-white/40 font-mono">
                  Candle Base: {statusData.latest_candle_date || '—'} • Live Sync:{' '}
                  {statusData.generated_at ? new Date(statusData.generated_at).toLocaleTimeString() : '—'}
                </span>
              </div>
              <p className="text-sm text-white/85 font-medium mt-1.5 max-w-4xl">{regime.headline}</p>
            </div>
          </div>

          <div className="flex items-center gap-2.5 shrink-0">
            <button
              onClick={() => fetchMarketStatus(true)}
              disabled={refreshing}
              className="px-3.5 py-2 rounded-xl bg-white/10 hover:bg-white/15 border border-white/15 text-xs font-bold text-white flex items-center gap-2 transition-all cursor-pointer disabled:opacity-50"
              title="Pull live intraday prices from Yahoo Finance, recompute breadth & sync screener/market_status to Firebase"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${refreshing ? 'animate-spin text-indigo-400' : 'text-emerald-300'}`} />
              <span>{refreshing ? 'Syncing Live...' : 'Refresh Live & Sync Firebase'}</span>
            </button>
          </div>
        </div>

        {/* 3 Pillar Score Strip + Action Plan Cards */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-3 mt-4">
          <div className="bg-black/40 border border-white/10 rounded-xl p-3 flex flex-col justify-between">
            <div className="text-[11px] font-bold uppercase tracking-wider text-white/45">
              3-Pillar Health Breakdown
            </div>
            <div className="flex flex-col gap-1.5 mt-2 text-xs font-mono">
              <div className="flex items-center justify-between gap-2 whitespace-nowrap">
                <span className="text-white/60 truncate" title="1. Index Trend (QQQ / SPY / RSP / IWM)">
                  1. Index Trend (ETFs):
                </span>
                <strong className="text-white shrink-0">
                  {pillars.index_trend_score ?? 0} / {pillars.index_trend_max ?? 40}
                </strong>
              </div>
              <div className="flex items-center justify-between gap-2 whitespace-nowrap">
                <span className="text-white/60 truncate" title="2. Internal Breadth (1,609 Stocks)">
                  2. Internal Breadth:
                </span>
                <strong className="text-white shrink-0">
                  {pillars.breadth_score ?? 0} / {pillars.breadth_max ?? 35}
                </strong>
              </div>
              <div className="flex items-center justify-between gap-2 whitespace-nowrap">
                <span className="text-white/60 truncate" title="3. Volatility & Credit (VIX / HYG)">
                  3. Volatility &amp; Credit:
                </span>
                <strong className="text-white shrink-0">
                  {pillars.vol_credit_score ?? 0} / {pillars.vol_credit_max ?? 25}
                </strong>
              </div>
            </div>
          </div>

          <div className="bg-black/40 border border-white/10 rounded-xl p-3 flex flex-col justify-between">
            <div className="text-[11px] font-bold uppercase tracking-wider text-white/45">
              Recommended Position Sizing
            </div>
            <div className="mt-1.5">
              <div className={`text-base font-extrabold ${style.text}`}>{actionPlan.max_positions || '—'}</div>
              <div className="text-xs text-white/70 font-mono mt-0.5">
                Risk Budget: <strong className="text-white">{actionPlan.risk_per_trade || '—'}</strong>
              </div>
              <div className="text-[11px] text-white/45 mt-1">
                Stop Rule: Close below <code className="text-cyan-300">EMA20 × 0.995</code> (-3% emergency hard stop)
              </div>
            </div>
          </div>

          <div className="bg-black/40 border border-white/10 rounded-xl p-3 flex flex-col justify-between">
            <div className="flex items-center justify-between">
              <span className="text-[11px] font-bold uppercase tracking-wider text-indigo-300">
                Swing Trading Playbook
              </span>
              <Zap size={13} className="text-indigo-400" />
            </div>
            <p className="text-xs text-white/80 leading-relaxed mt-1.5">{actionPlan.swing_playbook}</p>
          </div>

          <div className="bg-black/40 border border-white/10 rounded-xl p-3 flex flex-col justify-between">
            <div className="flex items-center justify-between">
              <span className="text-[11px] font-bold uppercase tracking-wider text-amber-300">
                Options Desk Playbook
              </span>
              <span className="px-2 py-0.5 rounded bg-amber-500/20 border border-amber-500/30 text-[10px] font-mono font-bold text-amber-200 whitespace-nowrap">
                {actionPlan.options_mode_badge}
              </span>
            </div>
            <p className="text-xs text-white/80 leading-relaxed mt-1.5">{actionPlan.options_playbook}</p>
          </div>
        </div>
      </div>

      {/* 2. LIVE BENCHMARK INDICES (QQQ, SPY, RSP, IWM) + EQUAL-WEIGHT ROTATION */}
      <div className="flex flex-col gap-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <Radio size={16} className="text-indigo-400" />
            <h3 className="text-sm font-extrabold uppercase tracking-wider text-white">
              Live Index Compass &amp; Moving Average Stack (QQQ • SPY • RSP • IWM)
            </h3>
          </div>
          <span className="text-xs text-white/45">
            Updated every 30m via Yahoo Finance • Green = Surfing EMA10/20 &amp; SMA50
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
                className={`rounded-2xl border ${lStyle.border} bg-white/[0.02] p-4 flex flex-col justify-between gap-3`}
              >
                <div className="flex items-start justify-between gap-2 border-b border-white/10 pb-2.5">
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="text-lg font-extrabold text-white tracking-tight">{sym}</span>
                      <span className="text-xs text-white/50 font-medium">{idx.short_name}</span>
                    </div>
                    <div className="text-[11px] text-white/40">{idx.role}</div>
                  </div>
                  <div className="flex flex-col items-end gap-1 shrink-0">
                    <TrafficLightHousing activeLight={idx.light} size="sm" />
                    <span className={`text-[10px] font-extrabold px-2 py-0.5 rounded border whitespace-nowrap ${lStyle.badge}`}>
                      {idx.short_status}
                    </span>
                  </div>
                </div>

                {/* Price (Row 1) & 1D / 5D Change Pills (Row 2) */}
                <div className="flex flex-col gap-1.5">
                  <div className="text-2xl font-mono font-extrabold text-white leading-none">
                    ${idx.price != null ? Number(idx.price).toFixed(2) : '—'}
                  </div>
                  <div className="grid grid-cols-2 gap-2 font-mono text-xs">
                    <span
                      className={`px-2.5 py-1 rounded-lg font-bold text-center whitespace-nowrap border ${
                        chg1d >= 0
                          ? 'bg-emerald-500/15 text-emerald-300 border-emerald-500/25'
                          : 'bg-rose-500/15 text-rose-300 border-rose-500/25'
                      }`}
                    >
                      1D: {fmtPct(chg1d)}
                    </span>
                    <span
                      className={`px-2.5 py-1 rounded-lg font-bold text-center whitespace-nowrap border ${
                        chg5d >= 0
                          ? 'bg-emerald-500/10 text-emerald-300/90 border-emerald-500/20'
                          : 'bg-rose-500/10 text-rose-300/90 border-rose-500/20'
                      }`}
                    >
                      5D: {fmtPct(chg5d)}
                    </span>
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
                <div className="flex items-center justify-between pt-2 border-t border-white/10 text-[11px]">
                  <span className="text-white/50">EMA10 vs EMA20:</span>
                  <span className={`font-bold ${idx.ema10_gt_ema20 ? 'text-emerald-300' : 'text-rose-300'}`}>
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
              LIGHT_STYLES[rotation.light]?.border || 'border-white/10'
            } bg-white/[0.02]`}
          >
            <div className="flex items-start md:items-center gap-3">
              <span className={`w-3 h-3 rounded-full shrink-0 mt-1 md:mt-0 ${LIGHT_STYLES[rotation.light]?.dot}`} />
              <div>
                <div className="text-xs font-extrabold text-white uppercase tracking-wide">
                  Equal-Weight Breadth Rotation (RSP vs SPY &amp; QQQ):{' '}
                  <span className={LIGHT_STYLES[rotation.light]?.text}>{rotation.title}</span>
                </div>
                <p className="text-xs text-white/65 mt-0.5">{rotation.description}</p>
              </div>
            </div>
            <div className="flex items-center gap-2 shrink-0 font-mono text-xs">
              <span className="px-2.5 py-1 rounded-lg bg-black/40 border border-white/10 text-white/80">
                RSP vs SPY (5D):{' '}
                <strong className={rotation.rsp_vs_spy_5d_pct >= 0 ? 'text-emerald-300' : 'text-rose-300'}>
                  {fmtPct(rotation.rsp_vs_spy_5d_pct)}
                </strong>
              </span>
              <span className="px-2.5 py-1 rounded-lg bg-black/40 border border-white/10 text-white/80">
                RSP vs QQQ (5D):{' '}
                <strong className={rotation.rsp_vs_qqq_5d_pct >= 0 ? 'text-emerald-300' : 'text-rose-300'}>
                  {fmtPct(rotation.rsp_vs_qqq_5d_pct)}
                </strong>
              </span>
            </div>
          </div>
        )}
      </div>

      {/* 3. INTERNAL MARKET BREADTH & 1,609-STOCK WAVE BAROMETER */}
      <div className="bg-white/[0.02] border border-white/10 rounded-2xl p-5 flex flex-col gap-4">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-white/10 pb-3">
          <div className="flex items-center gap-2.5">
            <Layers size={18} className="text-cyan-400" />
            <div>
              <h3 className="text-sm font-extrabold uppercase tracking-wider text-white">
                Internal Market Breadth &amp; Wave Barometer ({breadth.total_stocks || 1609} Active Stocks)
              </h3>
              <p className="text-xs text-white/45">
                How many stocks in our universe are surfing in Bull Trend, Early Surf, Pullback, or Bear Downtrend
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <span
              className={`px-3 py-1 rounded-full text-xs font-extrabold border ${
                LIGHT_STYLES[breadth.thrust_light]?.badge || LIGHT_STYLES.yellow.badge
              }`}
            >
              {breadth.thrust_state}
            </span>
          </div>
        </div>

        {/* 4-Zone Stacked Progress Bar */}
        <div className="flex flex-col gap-2">
          <div className="w-full h-5 rounded-xl overflow-hidden flex bg-black/50 border border-white/10 p-0.5 gap-0.5">
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
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mt-1">
            <div className="bg-emerald-500/10 border border-emerald-500/25 rounded-xl p-3">
              <div className="flex items-center justify-between text-xs font-bold text-emerald-300">
                <span>🟢 Full Bull Surf</span>
                <span className="font-mono">{breadth.green_bull_surf_pct}%</span>
              </div>
              <div className="text-xl font-mono font-extrabold text-white mt-1">
                {breadth.green_bull_surf_count} <span className="text-xs font-normal text-white/50">stocks</span>
              </div>
              <div className="text-[11px] text-white/45 mt-0.5">Close &gt; EMA10 &gt; EMA20 &amp; &gt; SMA50</div>
            </div>

            <div className="bg-cyan-500/10 border border-cyan-500/25 rounded-xl p-3">
              <div className="flex items-center justify-between text-xs font-bold text-cyan-300">
                <span>🌊 Early Surf Zone</span>
                <span className="font-mono">{breadth.cyan_early_surf_pct}%</span>
              </div>
              <div className="text-xl font-mono font-extrabold text-white mt-1">
                {breadth.cyan_early_surf_count} <span className="text-xs font-normal text-white/50">stocks</span>
              </div>
              <div className="text-[11px] text-white/45 mt-0.5">EMA10 &gt; EMA20 turning up below SMA50</div>
            </div>

            <div className="bg-amber-500/10 border border-amber-500/25 rounded-xl p-3">
              <div className="flex items-center justify-between text-xs font-bold text-amber-300">
                <span>🟡 Pullback / Coiling</span>
                <span className="font-mono">{breadth.yellow_pullback_pct}%</span>
              </div>
              <div className="text-xl font-mono font-extrabold text-white mt-1">
                {breadth.yellow_pullback_count} <span className="text-xs font-normal text-white/50">stocks</span>
              </div>
              <div className="text-[11px] text-white/45 mt-0.5">Testing EMA20 or SMA50 support zone</div>
            </div>

            <div className="bg-rose-500/10 border border-rose-500/25 rounded-xl p-3">
              <div className="flex items-center justify-between text-xs font-bold text-rose-300">
                <span>🔴 Bear / Broken</span>
                <span className="font-mono">{breadth.red_bear_pct}%</span>
              </div>
              <div className="text-xl font-mono font-extrabold text-white mt-1">
                {breadth.red_bear_count} <span className="text-xs font-normal text-white/50">stocks</span>
              </div>
              <div className="text-[11px] text-white/45 mt-0.5">Below both EMA20 and SMA50 (Avoid)</div>
            </div>
          </div>
        </div>

        {/* MA Thermometers + Tsunami / Thrust Callout */}
        <div className="grid grid-cols-2 md:grid-cols-5 gap-3 pt-2">
          <div className="bg-black/40 border border-white/10 rounded-xl p-3">
            <div className="text-[11px] text-white/45 font-bold uppercase">% Above EMA 10</div>
            <div className="flex items-baseline justify-between mt-1">
              <span className="text-xl font-mono font-extrabold text-white">{breadth.pct_above_ema10}%</span>
              <span
                className={`text-xs font-mono font-bold ${
                  breadth.delta_1d_ema10_pct >= 0 ? 'text-emerald-300' : 'text-rose-400'
                }`}
              >
                {fmtPct(breadth.delta_1d_ema10_pct, true, 1)} (1D)
              </span>
            </div>
            <div className="text-[11px] text-white/40 font-mono mt-0.5">
              {breadth.above_ema10_count} stocks ({breadth.net_ema10_stocks_1d >= 0 ? '+' : ''}
              {breadth.net_ema10_stocks_1d} today)
            </div>
          </div>

          <div className="bg-black/40 border border-white/10 rounded-xl p-3">
            <div className="text-[11px] text-white/45 font-bold uppercase">% Above EMA 20</div>
            <div className="flex items-baseline justify-between mt-1">
              <span className="text-xl font-mono font-extrabold text-white">{breadth.pct_above_ema20}%</span>
              <span
                className={`text-xs font-mono font-bold ${
                  breadth.delta_1d_ema20_pct >= 0 ? 'text-emerald-300' : 'text-rose-400'
                }`}
              >
                {fmtPct(breadth.delta_1d_ema20_pct, true, 1)} (1D)
              </span>
            </div>
            <div className="text-[11px] text-white/40 font-mono mt-0.5">
              {breadth.above_ema20_count} stocks ({breadth.net_ema20_stocks_1d >= 0 ? '+' : ''}
              {breadth.net_ema20_stocks_1d} today)
            </div>
          </div>

          <div className="bg-black/40 border border-white/10 rounded-xl p-3">
            <div className="text-[11px] text-white/45 font-bold uppercase">EMA10 &gt; EMA20 Surf</div>
            <div className="flex items-baseline justify-between mt-1">
              <span className="text-xl font-mono font-extrabold text-cyan-300">{breadth.pct_ema10_gt_ema20}%</span>
            </div>
            <div className="text-[11px] text-white/40 font-mono mt-0.5">
              {breadth.ema10_gt_ema20_count} stocks with stacked EMAs
            </div>
          </div>

          <div className="bg-black/40 border border-white/10 rounded-xl p-3">
            <div className="text-[11px] text-white/45 font-bold uppercase">% Above SMA 50</div>
            <div className="flex items-baseline justify-between mt-1">
              <span className="text-xl font-mono font-extrabold text-white">{breadth.pct_above_sma50}%</span>
            </div>
            <div className="text-[11px] text-white/40 font-mono mt-0.5">
              {breadth.above_sma50_count} stocks in intermediate uptrend
            </div>
          </div>

          <div className="bg-black/40 border border-white/10 rounded-xl p-3">
            <div className="text-[11px] text-white/45 font-bold uppercase">% Above SMA 200</div>
            <div className="flex items-baseline justify-between mt-1">
              <span className="text-xl font-mono font-extrabold text-white">{breadth.pct_above_sma200}%</span>
            </div>
            <div className="text-[11px] text-white/40 font-mono mt-0.5">
              {breadth.above_sma200_count} stocks in Stage-2 long-term bull
            </div>
          </div>
        </div>

        {/* 14-Day Breadth History Mini-Table / Visual + Sector Leaderboard */}
        {!compact && (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 pt-2 border-t border-white/10">
            {/* Left: Last 10 Trading Days Breadth Trajectory */}
            <div className="bg-black/30 border border-white/10 rounded-xl p-3.5">
              <div className="flex items-center justify-between mb-2.5">
                <span className="text-xs font-bold uppercase tracking-wider text-white/70">
                  14-Day Breadth Trajectory (% Above EMA10 / EMA20 / SMA50)
                </span>
                <span className="text-[11px] text-white/40">{breadth.thrust_description}</span>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs font-mono">
                  <thead className="text-[10px] uppercase text-white/40 border-b border-white/10">
                    <tr>
                      <th className="py-1.5">Date</th>
                      <th className="py-1.5">&gt;EMA10</th>
                      <th className="py-1.5">&gt;EMA20</th>
                      <th className="py-1.5">&gt;SMA50</th>
                      <th className="py-1.5">4-Zone Split (G / C / Y / R)</th>
                    </tr>
                  </thead>
                  <tbody>
                    {[...history14d]
                      .reverse()
                      .slice(0, 7)
                      .map((row) => (
                        <tr key={row.date} className="border-b border-white/5">
                          <td className="py-1.5 text-white/75">{row.date}</td>
                          <td
                            className={`py-1.5 font-bold ${
                              row.pct_above_ema10 >= 58
                                ? 'text-emerald-300'
                                : row.pct_above_ema10 >= 45
                                ? 'text-amber-300'
                                : 'text-rose-400'
                            }`}
                          >
                            {row.pct_above_ema10}%
                          </td>
                          <td className="py-1.5 text-white/90">{row.pct_above_ema20}%</td>
                          <td className="py-1.5 text-white/70">{row.pct_above_sma50}%</td>
                          <td className="py-1.5">
                            <div className="w-32 h-2.5 rounded overflow-hidden flex bg-black/60">
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

            {/* Right: Top & Bottom Sectors by Breadth */}
            <div className="bg-black/30 border border-white/10 rounded-xl p-3.5 flex flex-col justify-between">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <div className="text-xs font-bold uppercase tracking-wider text-emerald-300 mb-2">
                    🟢 Strongest Sectors (% &gt; EMA20)
                  </div>
                  <div className="flex flex-col gap-1.5">
                    {topSectors.map((s) => (
                      <div
                        key={s.sector}
                        className="flex items-center justify-between px-2.5 py-1.5 rounded-lg bg-emerald-500/10 border border-emerald-500/20 text-xs"
                      >
                        <span className="font-semibold text-white truncate max-w-[140px]" title={s.sector}>
                          {s.sector}
                        </span>
                        <span className="font-mono font-bold text-emerald-300">
                          {s.pct_above_ema20}% <span className="text-[10px] text-white/45">({s.total})</span>
                        </span>
                      </div>
                    ))}
                  </div>
                </div>

                <div>
                  <div className="text-xs font-bold uppercase tracking-wider text-rose-300 mb-2">
                    🔴 Weakest Sectors (% &gt; EMA20)
                  </div>
                  <div className="flex flex-col gap-1.5">
                    {bottomSectors.map((s) => (
                      <div
                        key={s.sector}
                        className="flex items-center justify-between px-2.5 py-1.5 rounded-lg bg-rose-500/10 border border-rose-500/20 text-xs"
                      >
                        <span className="font-semibold text-white truncate max-w-[140px]" title={s.sector}>
                          {s.sector}
                        </span>
                        <span className="font-mono font-bold text-rose-300">
                          {s.pct_above_ema20}% <span className="text-[10px] text-white/45">({s.total})</span>
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* 4. OPTIONS & VOLATILITY COCKPIT + ACTIVE STRATEGY FUNNEL */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* Card A: VIX & Options Pricing Regime */}
        <div
          className={`rounded-2xl border ${
            LIGHT_STYLES[vix.light]?.border || 'border-white/10'
          } bg-white/[0.02] p-4 flex flex-col justify-between gap-3`}
        >
          <div className="flex items-start justify-between border-b border-white/10 pb-2.5">
            <div>
              <div className="text-xs font-extrabold uppercase tracking-wider text-amber-300">
                Options Volatility &amp; Pricing Regime
              </div>
              <div className="text-[11px] text-white/45 mt-0.5">{vix.regime}</div>
            </div>
            <TrafficLightHousing activeLight={vix.light} size="sm" />
          </div>

          <div className="grid grid-cols-3 gap-2 font-mono">
            <div className="bg-black/40 border border-white/10 rounded-xl p-2.5">
              <div className="text-[10px] text-white/45 uppercase">CBOE VIX</div>
              <div className="text-lg font-extrabold text-white">{vix.price ?? '—'}</div>
              <div className={`text-[10px] font-bold ${(vix.change_1d_pct || 0) <= 0 ? 'text-emerald-300' : 'text-rose-300'}`}>
                {fmtPct(vix.change_1d_pct)}
              </div>
            </div>

            <div className="bg-black/40 border border-white/10 rounded-xl p-2.5">
              <div className="text-[10px] text-white/45 uppercase">Universe Med IV</div>
              <div className="text-lg font-extrabold text-amber-300">
                {setups.options_wheel?.universe_median_iv_pct ?? '—'}%
              </div>
              <div className="text-[10px] text-white/45">
                Avg: {setups.options_wheel?.universe_avg_iv_pct ?? '—'}%
              </div>
            </div>

            <div className="bg-black/40 border border-white/10 rounded-xl p-2.5">
              <div className="text-[10px] text-white/45 uppercase">Wheel Ready</div>
              <div className="text-lg font-extrabold text-emerald-300">
                {setups.options_wheel?.wheel_fit_pass_count ?? 0}
              </div>
              <div className="text-[10px] text-white/45">
                Prime IV: {setups.options_wheel?.prime_iv_35_75_count ?? 0}
              </div>
            </div>
          </div>

          <div className="text-xs text-white/75 bg-black/30 border border-white/5 rounded-xl p-2.5">
            <strong className="text-amber-300">{vix.options_mode_badge}:</strong> {vix.options_playbook}
          </div>
        </div>

        {/* Card B: VIX Term Structure & Credit Appetite (HYG / TNX) */}
        <div
          className={`rounded-2xl border ${
            LIGHT_STYLES[term.light]?.border || 'border-white/10'
          } bg-white/[0.02] p-4 flex flex-col justify-between gap-3`}
        >
          <div className="flex items-start justify-between border-b border-white/10 pb-2.5">
            <div>
              <div className="text-xs font-extrabold uppercase tracking-wider text-white">
                VIX Term Structure &amp; Smart-Money Credit
              </div>
              <div className={`text-[11px] font-bold mt-0.5 ${LIGHT_STYLES[term.light]?.text}`}>
                {term.state}
              </div>
            </div>
            <TrafficLightHousing activeLight={term.light} size="sm" />
          </div>

          <div className="grid grid-cols-3 gap-2 font-mono text-center">
            <div className="bg-black/40 border border-white/10 rounded-xl p-2">
              <div className="text-[10px] text-white/45">VIX 9D (Ultra-Short)</div>
              <div className="text-base font-extrabold text-white mt-0.5">{term.vix9d ?? '—'}</div>
            </div>
            <div className="bg-black/40 border border-white/10 rounded-xl p-2">
              <div className="text-[10px] text-white/45">VIX (30-Day)</div>
              <div className="text-base font-extrabold text-white mt-0.5">{term.vix ?? '—'}</div>
            </div>
            <div className="bg-black/40 border border-white/10 rounded-xl p-2">
              <div className="text-[10px] text-white/45">VIX 3M (90-Day)</div>
              <div className="text-base font-extrabold text-white mt-0.5">{term.vix3m ?? '—'}</div>
            </div>
          </div>

          <div className="flex flex-col gap-1.5 text-xs">
            <div className="flex items-center justify-between px-2.5 py-1.5 rounded-lg bg-black/40 border border-white/10">
              <span className="text-white/60">High-Yield Credit (HYG):</span>
              <span className={`font-mono font-bold ${credit.above_ema20 ? 'text-emerald-300' : 'text-rose-300'}`}>
                ${credit.price} ({credit.above_ema20 ? '🟢 > EMA20 Risk-On' : '🔴 < EMA20 Stress'})
              </span>
            </div>
            <div className="flex items-center justify-between px-2.5 py-1.5 rounded-lg bg-black/40 border border-white/10">
              <span className="text-white/60">10Y Yield (^TNX) &amp; Dollar (DXY):</span>
              <span className="font-mono text-white/90">
                TNX: <b>{rates.tnx_10y?.price ?? '—'}%</b> • DXY: <b>{rates.dxy_dollar?.price ?? '—'}</b>
              </span>
            </div>
          </div>
        </div>

        {/* Card C: Today's Filtered Swing Setup Funnel */}
        <div className="rounded-2xl border border-indigo-500/30 bg-indigo-500/[0.04] p-4 flex flex-col justify-between gap-3">
          <div className="flex items-center justify-between border-b border-white/10 pb-2.5">
            <div>
              <div className="text-xs font-extrabold uppercase tracking-wider text-indigo-300">
                Active Strategy Funnel (Today&apos;s Radar)
              </div>
              <div className="text-[11px] text-white/45 mt-0.5">
                Filtered setups passing strict Phase 1/2 &amp; Flag rules
              </div>
            </div>
            <Flame size={18} className="text-indigo-400" />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="bg-black/40 border border-indigo-500/25 rounded-xl p-3 flex flex-col justify-between">
              <div className="text-xs font-bold text-indigo-300">⚡ Qullamaggie</div>
              <div className="text-2xl font-mono font-extrabold text-white mt-1">
                {setups.qullamaggie?.active_total ?? 0}{' '}
                <span className="text-xs font-normal text-white/50">active</span>
              </div>
              <div className="text-[11px] text-white/60 font-mono mt-1">
                Candidates: <b className="text-white">{setups.qullamaggie?.candidates ?? 0}</b> • Watch:{' '}
                <b className="text-white">{setups.qullamaggie?.watch ?? 0}</b>
              </div>
              <div className="text-[11px] text-emerald-300 font-mono mt-0.5">
                Sweet Spot (70–88): <b>{setups.qullamaggie?.sweet_spot_70_88 ?? 0}</b>
              </div>
              {onNavigateStrategy && (
                <button
                  onClick={() => onNavigateStrategy('qullamaggie')}
                  className="mt-2 w-full py-1.5 rounded-lg bg-indigo-600/30 hover:bg-indigo-600/50 border border-indigo-500/40 text-xs font-bold text-indigo-200 cursor-pointer transition-all"
                >
                  Inspect Qullamaggie &rarr;
                </button>
              )}
            </div>

            <div className="bg-black/40 border border-cyan-500/25 rounded-xl p-3 flex flex-col justify-between">
              <div className="text-xs font-bold text-cyan-300">🌊 Early Surf (Ph 1 &amp; 2)</div>
              <div className="text-2xl font-mono font-extrabold text-white mt-1">
                {setups.early_surf?.active_total ?? 0}{' '}
                <span className="text-xs font-normal text-white/50">active</span>
              </div>
              <div className="text-[11px] text-white/60 font-mono mt-1">
                Ph1 Pre-Cross: <b className="text-cyan-300">{setups.early_surf?.phase_1_pre_cross ?? 0}</b> • Ph2 Bridge:{' '}
                <b className="text-emerald-300">{setups.early_surf?.phase_2_bridge_cross ?? 0}</b>
              </div>
              <div className="text-[11px] text-emerald-300 font-mono mt-0.5">
                Sweet Spot (70–88): <b>{setups.early_surf?.sweet_spot_70_88 ?? 0}</b>
              </div>
              {onNavigateStrategy && (
                <button
                  onClick={() => onNavigateStrategy('early_surf')}
                  className="mt-2 w-full py-1.5 rounded-lg bg-cyan-600/30 hover:bg-cyan-600/50 border border-cyan-500/40 text-xs font-bold text-cyan-200 cursor-pointer transition-all"
                >
                  Inspect Early Surf &rarr;
                </button>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
