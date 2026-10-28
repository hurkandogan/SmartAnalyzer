'use client';

import React, { useState, useMemo, useEffect } from 'react';
import {
  FiSearch,
  FiX,
  FiFilter,
  FiTrendingUp,
  FiActivity,
  FiRotateCcw,
  FiShield,
  FiPlus,
  FiCheck,
  FiAlertTriangle,
  FiMessageSquare,
  FiTrash2,
  FiCopy,
  FiEdit2,
  FiDollarSign,
  FiClock,
  FiPauseCircle,
  FiArrowUpRight,
} from 'react-icons/fi';
import { useAuth } from '@/context/AuthProvider';
import {
  AnalysisPosition,
  PublicStockNote,
  getUserAnalysisDataAction,
  saveUserRiskLimitAction,
  openAnalysisPositionAction,
  updatePositionStopAction,
  recordPartialSellAction,
  triggerStopHitAction,
  deleteAnalysisPositionAction,
  addStockNoteAction,
  deleteStockNoteAction,
} from '@/actions/analysis';

function formatShortDate(dateStr?: string): string {
  if (!dateStr) return '—';
  try {
    const clean = dateStr.split('T')[0];
    const parts = clean.split('-');
    if (parts.length === 3) {
      const year = parseInt(parts[0], 10);
      const month = parseInt(parts[1], 10) - 1;
      const day = parseInt(parts[2], 10);
      const d = new Date(Date.UTC(year, month, day));
      return d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', timeZone: 'UTC' });
    }
    const d = new Date(dateStr);
    return d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
  } catch {
    return dateStr;
  }
}

function formatPctBadge(val: number | null | undefined, label: string) {
  if (val === null || val === undefined || isNaN(Number(val))) {
    return (
      <span className="px-1.5 py-0.5 rounded bg-base-200 text-base-content/50 font-mono text-[11px]">
        {label}: —
      </span>
    );
  }
  const num = Number(val);
  const sign = num > 0 ? '+' : '';
  const color =
    num > 0
      ? 'bg-success/15 text-success border-success/25'
      : num < 0
        ? 'bg-error/15 text-error border-error/25'
        : 'bg-base-200 text-base-content/70 border-base-300';
  return (
    <span className={`px-1.5 py-0.5 rounded border font-mono font-semibold text-[11px] ${color}`}>
      {label}: {sign}{num.toFixed(1)}%
    </span>
  );
}

function formatUsd(val: number): string {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(val || 0);
}

interface AnalysisViewProps {
  initialAssets: any[];
  initialDropped?: any[];
}

export default function AnalysisView({ initialAssets, initialDropped = [] }: AnalysisViewProps) {
  const { user } = useAuth();

  // Local state of assets so notes update optimistically
  const [assets, setAssets] = useState<any[]>(initialAssets);
  useEffect(() => {
    setAssets(initialAssets);
  }, [initialAssets]);

  // Top Tabs: 'active' | 'dropped' | 'trades'
  const [activeTab, setActiveTab] = useState<'active' | 'dropped' | 'trades'>('active');

  // Filter & Sort State (Default: newest_wave so new analyses appear at top, older ones at bottom)
  const [searchQuery, setSearchQuery] = useState('');
  const [qullaFilter, setQullaFilter] = useState<
    'all' | 'candidate' | 'upgraded' | 'watch' | 'active_only' | 'paused_only' | 'score_90' | 'score_80' | 'score_70'
  >('all');
  const [fundFilter, setFundFilter] = useState<'all' | 'score_70' | 'score_60' | 'score_50' | 'score_40'>('all');
  const [sortBy, setSortBy] = useState<
    'newest_wave' | 'oldest_wave' | 'qulla_score_desc' | 'fund_score_desc' | 'perf_1d_desc' | 'perf_1w_desc' | 'symbol_asc'
  >('newest_wave');
  const [onlyMyOpenTrades, setOnlyMyOpenTrades] = useState(false);

  // User Risk & Positions State
  const [totalPortfolioUsd, setTotalPortfolioUsd] = useState<number>(0);
  const [riskLimitPct, setRiskLimitPct] = useState<number>(5);
  const [positions, setPositions] = useState<AnalysisPosition[]>([]);
  const [loadingUserData, setLoadingUserData] = useState<boolean>(false);
  const [savingRisk, setSavingRisk] = useState<boolean>(false);

  // Trade Modals State
  const [openTradeModalAsset, setOpenTradeModalAsset] = useState<any | null>(null);
  const [tradeEntryPrice, setTradeEntryPrice] = useState<string>('');
  const [tradeShares, setTradeShares] = useState<string>('');
  const [tradeStopPrice, setTradeStopPrice] = useState<string>('');
  const [tradeNote, setTradeNote] = useState<string>('');
  const [submittingTrade, setSubmittingTrade] = useState<boolean>(false);

  // Partial Sell Modal State
  const [partialSellPos, setPartialSellPos] = useState<AnalysisPosition | null>(null);
  const [sellSharesInput, setSellSharesInput] = useState<string>('');
  const [sellPriceInput, setSellPriceInput] = useState<string>('');
  const [sellNoteInput, setSellNoteInput] = useState<string>('');

  // Stop Hit Modal State
  const [stopHitPos, setStopHitPos] = useState<AnalysisPosition | null>(null);
  const [stopHitPriceInput, setStopHitPriceInput] = useState<string>('');

  // Inline Stop Edit State
  const [editingStopPosId, setEditingStopPosId] = useState<string | null>(null);
  const [editingStopValue, setEditingStopValue] = useState<string>('');

  // Inline Note Input per Symbol
  const [openNoteBoxSym, setOpenNoteBoxSym] = useState<string | null>(null);
  const [noteInputBySym, setNoteInputBySym] = useState<Record<string, string>>({});
  const [submittingNoteSym, setSubmittingNoteSym] = useState<string | null>(null);

  // Copy feedback
  const [copiedLabel, setCopiedLabel] = useState<string | null>(null);

  // Fetch user portfolio value, risk limit, and swing positions
  useEffect(() => {
    let active = true;
    async function loadUserAnalysisData() {
      if (!user?.uid) return;
      setLoadingUserData(true);
      try {
        const res = await getUserAnalysisDataAction(user.uid);
        if (active) {
          setTotalPortfolioUsd(res.totalPortfolioUsd);
          setRiskLimitPct(res.riskLimitPct);
          setPositions(res.positions);
        }
      } finally {
        if (active) setLoadingUserData(false);
      }
    }
    loadUserAnalysisData();
    return () => {
      active = false;
    };
  }, [user?.uid]);

  const userDisplayName = useMemo(() => {
    if (!user) return 'Trader';
    if (user.displayName) return user.displayName;
    if (user.email) return user.email.split('@')[0];
    return 'Trader';
  }, [user]);

  // Map open positions by symbol
  const openPositionsBySymbol = useMemo(() => {
    const map = new Map<string, AnalysisPosition[]>();
    for (const p of positions) {
      if (p.status === 'OPEN' && p.remaining_shares > 0) {
        const sym = p.symbol.toUpperCase();
        if (!map.has(sym)) map.set(sym, []);
        map.get(sym)!.push(p);
      }
    }
    return map;
  }, [positions]);

  // Map latest prices by symbol
  const latestPriceBySymbol = useMemo(() => {
    const map = new Map<string, number>();
    for (const a of assets) {
      const p = Number(a.analysis?.qullamaggie?.price ?? a.analysis?.fundamentals?.price ?? 0);
      if (p > 0) map.set(a.symbol, p);
    }
    for (const d of initialDropped) {
      if (!map.has(d.symbol) && Number(d.price) > 0) {
        map.set(d.symbol, Number(d.price));
      }
    }
    return map;
  }, [assets, initialDropped]);

  // ── RISK INDEX CALCULATIONS ───────────────────────────────────
  const riskMetrics = useMemo(() => {
    const maxBudgetUsd = totalPortfolioUsd * (riskLimitPct / 100);
    let totalOpenRiskUsd = 0;
    let totalOpenAllocatedUsd = 0;
    let totalUnrealizedPnlUsd = 0;
    let openPositionsCount = 0;

    for (const p of positions) {
      if (p.status === 'OPEN' && p.remaining_shares > 0) {
        openPositionsCount++;
        const riskPerShare = Math.max(0, p.entry_price - p.stop_price);
        const posRisk = riskPerShare * p.remaining_shares;
        totalOpenRiskUsd += posRisk;

        const curPrice = latestPriceBySymbol.get(p.symbol) ?? p.entry_price;
        totalOpenAllocatedUsd += curPrice * p.remaining_shares;
        totalUnrealizedPnlUsd += (curPrice - p.entry_price) * p.remaining_shares;
      }
    }

    const totalRealizedPnlUsd = positions.reduce((sum, p) => sum + (Number(p.realized_pnl_usd) || 0), 0);
    const portfolioRiskPct = totalPortfolioUsd > 0 ? (totalOpenRiskUsd / totalPortfolioUsd) * 100 : 0;
    const budgetUsedPct = maxBudgetUsd > 0 ? (totalOpenRiskUsd / maxBudgetUsd) * 100 : 0;
    const remainingBudgetUsd = Math.max(0, maxBudgetUsd - totalOpenRiskUsd);

    let zoneLabel = 'LOW RISK (SAFE)';
    let zoneColor = 'text-emerald-400';
    let zoneBg = 'bg-emerald-500/15 border-emerald-500/30 text-emerald-400';
    let strokeColor = '#10b981';

    if (budgetUsedPct > 100) {
      zoneLabel = 'OVER-RISKED (LIMIT EXCEEDED)';
      zoneColor = 'text-error';
      zoneBg = 'bg-error/15 border-error/30 text-error';
      strokeColor = '#ef4444';
    } else if (budgetUsedPct >= 75) {
      zoneLabel = 'HIGH RISK (NEAR LIMIT)';
      zoneColor = 'text-orange-400';
      zoneBg = 'bg-orange-500/15 border-orange-500/30 text-orange-400';
      strokeColor = '#f97316';
    } else if (budgetUsedPct >= 40) {
      zoneLabel = 'MODERATE RISK (OPTIMAL)';
      zoneColor = 'text-amber-400';
      zoneBg = 'bg-amber-500/15 border-amber-500/30 text-amber-400';
      strokeColor = '#f59e0b';
    }

    return {
      maxBudgetUsd,
      totalOpenRiskUsd,
      totalOpenAllocatedUsd,
      totalUnrealizedPnlUsd,
      totalRealizedPnlUsd,
      openPositionsCount,
      portfolioRiskPct,
      budgetUsedPct,
      remainingBudgetUsd,
      zoneLabel,
      zoneColor,
      zoneBg,
      strokeColor,
    };
  }, [totalPortfolioUsd, riskLimitPct, positions, latestPriceBySymbol]);

  const handleRiskLimitChange = async (newPct: number) => {
    const clamped = Math.min(10, Math.max(1, Math.round(newPct)));
    setRiskLimitPct(clamped);
    if (!user?.uid) return;
    setSavingRisk(true);
    try {
      await saveUserRiskLimitAction(user.uid, clamped);
    } finally {
      setSavingRisk(false);
    }
  };

  const isAssetUpgraded = (q: any): boolean => {
    if (!q) return false;
    if (q.upgraded_to_candidate) return true;
    const hist = Array.isArray(q.history) ? q.history : [];
    const hadWatch = q.wave_initial_status === 'watch' || hist.some((h: any) => h?.status === 'watch');
    const hadCandidate =
      q.status === 'candidate' || q.wave_peak_status === 'candidate' || hist.some((h: any) => h?.status === 'candidate');
    return Boolean(hadWatch && hadCandidate);
  };

  // ── FILTER & SORT ASSETS ──────────────────────────────────────
  const filteredAssets = useMemo(() => {
    return assets
      .filter((asset) => {
        const qullamaggie = asset.analysis?.qullamaggie;
        const fundamentals = asset.analysis?.fundamentals;
        if (!qullamaggie && !fundamentals) return false;

        if (qullamaggie) {
          const qScore = Number(qullamaggie.score) || 0;
          const qStatus = qullamaggie.status;
          if (qStatus === 'no_setup' || (qStatus !== 'candidate' && qStatus !== 'watch') || qScore <= 0) {
            return false;
          }
        }

        if (onlyMyOpenTrades && !openPositionsBySymbol.has(asset.symbol)) {
          return false;
        }

        if (searchQuery.trim()) {
          const query = searchQuery.trim().toLowerCase();
          const sym = (asset.symbol || '').toLowerCase();
          let fundReasons: any = {};
          try {
            if (fundamentals?.reason) {
              fundReasons = typeof fundamentals.reason === 'string' ? JSON.parse(fundamentals.reason) : fundamentals.reason;
            }
          } catch {}
          const sector = (fundReasons.sector || '').toLowerCase();
          if (!sym.includes(query) && !sector.includes(query)) return false;
        }

        if (qullaFilter !== 'all') {
          if (!qullamaggie) return false;
          const qScore = Number(qullamaggie.score) || 0;
          const qStatus = qullamaggie.status;
          const lifecycle = qullamaggie.lifecycle_status || 'active';

          if (qullaFilter === 'candidate' && qStatus !== 'candidate') return false;
          if (qullaFilter === 'upgraded' && !isAssetUpgraded(qullamaggie)) return false;
          if (qullaFilter === 'watch' && qStatus !== 'watch') return false;
          if (qullaFilter === 'active_only' && lifecycle !== 'active') return false;
          if (qullaFilter === 'paused_only' && lifecycle !== 'paused') return false;
          if (qullaFilter === 'score_90' && qScore < 90) return false;
          if (qullaFilter === 'score_80' && qScore < 80) return false;
          if (qullaFilter === 'score_70' && qScore < 70) return false;
        }

        if (fundFilter !== 'all') {
          if (!fundamentals) return false;
          const fScore = Number(fundamentals.score) || 0;
          if (fundFilter === 'score_70' && fScore < 70) return false;
          if (fundFilter === 'score_60' && fScore < 60) return false;
          if (fundFilter === 'score_50' && fScore < 50) return false;
          if (fundFilter === 'score_40' && fScore < 40) return false;
        }

        return true;
      })
      .sort((a, b) => {
        const qa = a.analysis?.qullamaggie || {};
        const qb = b.analysis?.qullamaggie || {};
        const qScoreA = Number(qa.score) || 0;
        const qScoreB = Number(qb.score) || 0;
        const fScoreA = Number(a.analysis?.fundamentals?.score) || 0;
        const fScoreB = Number(b.analysis?.fundamentals?.score) || 0;

        // Wave start date fallback to earliest history date
        const waveStartA =
          qa.wave_start_date ||
          (Array.isArray(qa.history) && qa.history.length > 0 ? qa.history[qa.history.length - 1].date : '1970-01-01');
        const waveStartB =
          qb.wave_start_date ||
          (Array.isArray(qb.history) && qb.history.length > 0 ? qb.history[qb.history.length - 1].date : '1970-01-01');

        const perfA = a.analysis?.performance || qa.performance || {};
        const perfB = b.analysis?.performance || qb.performance || {};

        if (sortBy === 'newest_wave') {
          // Newest wave_start_date at the top; if tied, active before paused, then higher score
          if (waveStartA !== waveStartB) return waveStartB.localeCompare(waveStartA);
          const lifeA = qa.lifecycle_status === 'paused' ? 0 : 1;
          const lifeB = qb.lifecycle_status === 'paused' ? 0 : 1;
          if (lifeA !== lifeB) return lifeB - lifeA;
          return qScoreB - qScoreA;
        }
        if (sortBy === 'oldest_wave') {
          if (waveStartA !== waveStartB) return waveStartA.localeCompare(waveStartB);
          return qScoreB - qScoreA;
        }
        if (sortBy === 'qulla_score_desc') return qScoreB - qScoreA;
        if (sortBy === 'fund_score_desc') return fScoreB - fScoreA;
        if (sortBy === 'perf_1d_desc') return (Number(perfB.d1) || -999) - (Number(perfA.d1) || -999);
        if (sortBy === 'perf_1w_desc') return (Number(perfB.w1) || -999) - (Number(perfA.w1) || -999);
        if (sortBy === 'symbol_asc') return (a.symbol || '').localeCompare(b.symbol || '');
        return 0;
      });
  }, [assets, searchQuery, qullaFilter, fundFilter, sortBy, onlyMyOpenTrades, openPositionsBySymbol]);

  const isFiltered =
    searchQuery.trim() !== '' || qullaFilter !== 'all' || fundFilter !== 'all' || onlyMyOpenTrades;

  const resetFilters = () => {
    setSearchQuery('');
    setQullaFilter('all');
    setFundFilter('all');
    setOnlyMyOpenTrades(false);
    setSortBy('newest_wave');
  };

  // Counts
  const counts = useMemo(() => {
    let candidate = 0;
    let upgraded = 0;
    let watch = 0;
    let activeToday = 0;
    let paused = 0;
    for (const a of assets) {
      const q = a.analysis?.qullamaggie;
      if (!q || (Number(q.score) || 0) <= 0) continue;
      if (q.status === 'candidate') candidate++;
      if (isAssetUpgraded(q)) upgraded++;
      if (q.status === 'watch') watch++;
      if (q.lifecycle_status === 'paused') paused++;
      else activeToday++;
    }
    return { candidate, upgraded, watch, activeToday, paused };
  }, [assets]);

  // ── HANDLERS FOR POSITIONS & NOTES ────────────────────────────
  const handleOpenTradeModal = (asset: any) => {
    const q = asset.analysis?.qullamaggie;
    let reasons: any = {};
    try {
      if (q?.reason) reasons = typeof q.reason === 'string' ? JSON.parse(q.reason) : q.reason;
    } catch {}
    const currentPrice = Number(q?.price ?? asset.analysis?.fundamentals?.price ?? 0);
    const suggestedStop =
      Number(reasons.stop_loss_lod) ||
      Number(asset.technicals?.ema_10) ||
      Number((currentPrice * 0.95).toFixed(2));

    setOpenTradeModalAsset(asset);
    setTradeEntryPrice(currentPrice > 0 ? currentPrice.toFixed(2) : '');
    setTradeStopPrice(suggestedStop > 0 && suggestedStop < currentPrice ? suggestedStop.toFixed(2) : (currentPrice * 0.95).toFixed(2));
    setTradeShares('');
    setTradeNote('');
  };

  const handleAutoSizeShares = (targetRiskPctOfPortfolio?: number) => {
    const entry = Number(tradeEntryPrice);
    const stop = Number(tradeStopPrice);
    if (!entry || !stop || entry <= stop || totalPortfolioUsd <= 0) return;
    const riskPerShare = entry - stop;
    const targetRiskUsd =
      targetRiskPctOfPortfolio !== undefined
        ? totalPortfolioUsd * (targetRiskPctOfPortfolio / 100)
        : riskMetrics.remainingBudgetUsd;
    if (targetRiskUsd <= 0) return;
    const idealShares = Math.floor(targetRiskUsd / riskPerShare);
    if (idealShares > 0) setTradeShares(String(idealShares));
  };

  const handleSubmitNewPosition = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user?.uid || !openTradeModalAsset) return;
    setSubmittingTrade(true);
    try {
      const res = await openAnalysisPositionAction(user.uid, {
        symbol: openTradeModalAsset.symbol,
        entryPrice: Number(tradeEntryPrice),
        shares: Number(tradeShares),
        stopPrice: Number(tradeStopPrice),
        note: tradeNote.trim() || undefined,
      });
      if (res.success && res.position) {
        setPositions((prev) => [res.position!, ...prev]);
        setOpenTradeModalAsset(null);
      }
    } finally {
      setSubmittingTrade(false);
    }
  };

  const handleSaveStopUpdate = async (positionId: string, newStopVal?: number) => {
    if (!user?.uid) return;
    const val = newStopVal !== undefined ? newStopVal : Number(editingStopValue);
    if (isNaN(val) || val < 0) return;
    const res = await updatePositionStopAction(user.uid, { positionId, newStopPrice: val });
    if (res.success && res.position) {
      setPositions((prev) => prev.map((p) => (p.id === positionId ? res.position! : p)));
      setEditingStopPosId(null);
    }
  };

  const handleSubmitPartialSell = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user?.uid || !partialSellPos) return;
    setSubmittingTrade(true);
    try {
      const res = await recordPartialSellAction(user.uid, {
        positionId: partialSellPos.id,
        sharesToSell: Number(sellSharesInput),
        sellPrice: Number(sellPriceInput),
        note: sellNoteInput.trim() || undefined,
      });
      if (res.success && res.position) {
        setPositions((prev) => prev.map((p) => (p.id === partialSellPos.id ? res.position! : p)));
        setPartialSellPos(null);
      }
    } finally {
      setSubmittingTrade(false);
    }
  };

  const handleSubmitStopHit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user?.uid || !stopHitPos) return;
    setSubmittingTrade(true);
    try {
      const res = await triggerStopHitAction(user.uid, {
        positionId: stopHitPos.id,
        stopExecPrice: Number(stopHitPriceInput),
      });
      if (res.success && res.position) {
        setPositions((prev) => prev.map((p) => (p.id === stopHitPos.id ? res.position! : p)));
        setStopHitPos(null);
      }
    } finally {
      setSubmittingTrade(false);
    }
  };

  const handleDeletePosition = async (positionId: string) => {
    if (!user?.uid) return;
    const res = await deleteAnalysisPositionAction(user.uid, positionId);
    if (res.success) {
      setPositions((prev) => prev.filter((p) => p.id !== positionId));
    }
  };

  const handleAddNote = async (symbol: string) => {
    if (!user?.uid) return;
    const text = (noteInputBySym[symbol] || '').trim();
    if (!text) return;
    setSubmittingNoteSym(symbol);
    try {
      const res = await addStockNoteAction({
        symbol,
        text,
        authorUid: user.uid,
        authorName: userDisplayName,
      });
      if (res.success && res.notes) {
        setAssets((prev) =>
          prev.map((a) => (a.symbol === symbol ? { ...a, notes: res.notes } : a))
        );
        setNoteInputBySym((prev) => ({ ...prev, [symbol]: '' }));
      }
    } finally {
      setSubmittingNoteSym(null);
    }
  };

  const handleDeleteNote = async (symbol: string, noteId: string) => {
    if (!user?.uid) return;
    const res = await deleteStockNoteAction({
      symbol,
      noteId,
      requesterUid: user.uid,
    });
    if (res.success && res.notes) {
      setAssets((prev) =>
        prev.map((a) => (a.symbol === symbol ? { ...a, notes: res.notes } : a))
      );
    }
  };

  const handleCopyTicker = (symbol: string, key: string) => {
    if (!symbol) return;
    navigator.clipboard.writeText(symbol);
    setCopiedLabel(key);
    setTimeout(() => setCopiedLabel(null), 1500);
  };

  // Needle rotation for CNN-style semi-circle gauge (-90deg to +90deg)
  const clampedGaugePct = Math.min(115, Math.max(0, riskMetrics.budgetUsedPct));
  const needleAngleDeg = -90 + (Math.min(100, clampedGaugePct) / 100) * 180;

  return (
    <div className="space-y-4">
      {/* ── 1. TOP RISK INDEX BAR (CNN FEAR & GREED STYLE) ── */}
      <div className="bg-base-200/70 backdrop-blur-md rounded-2xl border border-base-300 p-4 shadow-sm">
        <div className="flex flex-col lg:flex-row items-center justify-between gap-4">
          {/* Left: CNN Style Semi-Circular Gauge + Status */}
          <div className="flex items-center gap-4">
            <div className="relative w-32 h-18 shrink-0 flex items-end justify-center overflow-hidden">
              <svg viewBox="0 0 120 68" className="w-full h-full">
                {/* 4 Color Arc Segments */}
                {/* Safe Zone: 0-40% */}
                <path
                  d="M 12 58 A 48 48 0 0 1 45.2 12.4"
                  fill="none"
                  stroke="#10b981"
                  strokeWidth="10"
                  strokeLinecap="round"
                  opacity="0.85"
                />
                {/* Moderate: 40-75% */}
                <path
                  d="M 48.5 11.5 A 48 48 0 0 1 93.9 24.1"
                  fill="none"
                  stroke="#f59e0b"
                  strokeWidth="10"
                  opacity="0.85"
                />
                {/* High: 75-100% */}
                <path
                  d="M 96.2 26.8 A 48 48 0 0 1 108 58"
                  fill="none"
                  stroke="#ef4444"
                  strokeWidth="10"
                  strokeLinecap="round"
                  opacity="0.85"
                />
                {/* Needle */}
                <g transform={`translate(60, 58) rotate(${needleAngleDeg})`}>
                  <line x1="0" y1="0" x2="0" y2="-38" stroke="currentColor" strokeWidth="2.8" strokeLinecap="round" />
                  <circle cx="0" cy="0" r="4.5" fill="currentColor" />
                </g>
              </svg>
            </div>

            <div>
              <div className="flex items-center gap-2">
                <span className="text-[11px] font-bold uppercase tracking-wider opacity-60 flex items-center gap-1">
                  <FiShield className="w-3.5 h-3.5 text-primary" /> Portfolio Risk Index
                </span>
                <span className={`px-2 py-0.5 rounded-full text-[10px] font-black border ${riskMetrics.zoneBg}`}>
                  {riskMetrics.zoneLabel}
                </span>
              </div>
              <div className="flex items-baseline gap-2 mt-0.5">
                <span className={`text-2xl font-black font-mono ${riskMetrics.zoneColor}`}>
                  {riskMetrics.portfolioRiskPct.toFixed(2)}%
                </span>
                <span className="text-xs opacity-60">
                  of portfolio at stop ({riskMetrics.budgetUsedPct.toFixed(0)}% of {riskLimitPct}% budget used)
                </span>
              </div>
            </div>
          </div>

          {/* Center: Risk Limit Selector (Strictly 1% to 10%) */}
          <div className="flex flex-wrap items-center gap-2 bg-base-100/80 px-3 py-2 rounded-xl border border-base-300">
            <span className="text-xs font-bold opacity-70 mr-1">Max Allowed Risk:</span>
            <div className="flex items-center gap-1">
              {[1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map((pct) => (
                <button
                  key={pct}
                  type="button"
                  onClick={() => handleRiskLimitChange(pct)}
                  disabled={savingRisk}
                  className={`w-7 h-7 rounded-lg text-xs font-bold font-mono transition-all cursor-pointer ${
                    riskLimitPct === pct
                      ? 'bg-primary text-primary-content shadow-sm scale-105'
                      : 'bg-base-200 hover:bg-base-300 opacity-70 hover:opacity-100'
                  }`}
                  title={`Allow risking up to ${pct}% of total portfolio value`}
                >
                  {pct}%
                </button>
              ))}
            </div>
          </div>

          {/* Right: Live Equity & Dollar Risk Breakdown */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5 w-full lg:w-auto text-xs">
            <div className="bg-base-100/80 px-3 py-1.5 rounded-xl border border-base-300">
              <div className="text-[10px] uppercase opacity-50 font-bold">Total Account</div>
              <div className="font-mono font-bold text-sm">
                {loadingUserData ? '...' : formatUsd(totalPortfolioUsd)}
              </div>
            </div>
            <div className="bg-base-100/80 px-3 py-1.5 rounded-xl border border-base-300">
              <div className="text-[10px] uppercase opacity-50 font-bold">Max Risk ({riskLimitPct}%)</div>
              <div className="font-mono font-bold text-sm text-primary">
                {formatUsd(riskMetrics.maxBudgetUsd)}
              </div>
            </div>
            <div className="bg-base-100/80 px-3 py-1.5 rounded-xl border border-base-300">
              <div className="text-[10px] uppercase opacity-50 font-bold">Open Risk at Stop</div>
              <div className={`font-mono font-bold text-sm ${riskMetrics.zoneColor}`}>
                {formatUsd(riskMetrics.totalOpenRiskUsd)}
              </div>
            </div>
            <div className="bg-base-100/80 px-3 py-1.5 rounded-xl border border-base-300">
              <div className="text-[10px] uppercase opacity-50 font-bold">Remaining Budget</div>
              <div className="font-mono font-bold text-sm text-success">
                {formatUsd(riskMetrics.remainingBudgetUsd)}
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* ── 2. VIEW TABS (ACTIVE vs DROPPED 2-WEEK WATCHLIST vs MY TRADES) ── */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-1.5 bg-base-200 p-1 rounded-xl border border-base-300">
          <button
            type="button"
            onClick={() => setActiveTab('active')}
            className={`px-3.5 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer flex items-center gap-1.5 ${
              activeTab === 'active'
                ? 'bg-primary text-primary-content shadow-sm'
                : 'opacity-70 hover:opacity-100'
            }`}
          >
            <FiTrendingUp className="w-3.5 h-3.5" />
            <span>Active &amp; Paused Setups ({assets.length})</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('dropped')}
            className={`px-3.5 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer flex items-center gap-1.5 ${
              activeTab === 'dropped'
                ? 'bg-warning text-warning-content shadow-sm'
                : 'opacity-70 hover:opacity-100'
            }`}
          >
            <FiClock className="w-3.5 h-3.5" />
            <span>Closed / Dropped (Last 2 Weeks: {initialDropped.length})</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('trades')}
            className={`px-3.5 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer flex items-center gap-1.5 ${
              activeTab === 'trades'
                ? 'bg-secondary text-secondary-content shadow-sm'
                : 'opacity-70 hover:opacity-100'
            }`}
          >
            <FiDollarSign className="w-3.5 h-3.5" />
            <span>My Swing Trades ({riskMetrics.openPositionsCount} Open / {positions.length} Total)</span>
          </button>
        </div>
      </div>

      {/* ════════════════════════════════════════════════════════════════
          TAB 1: ACTIVE & PAUSED ANALYSIS SETUPS
         ════════════════════════════════════════════════════════════════ */}
      {activeTab === 'active' && (
        <>
          {/* ── FILTER & SORT CONTROL BAR ── */}
          <div className="bg-base-200/60 backdrop-blur-md rounded-2xl border border-base-300 p-3.5 shadow-sm space-y-3">
            <div className="flex flex-col sm:flex-row gap-2.5 items-stretch sm:items-center justify-between">
              {/* Search Box */}
              <div className="relative flex-1 max-w-md">
                <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-base-content/50">
                  <FiSearch className="w-4 h-4" />
                </div>
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Search symbol or sector (e.g. PLTR, NVDA, Technology)..."
                  className="input input-sm input-bordered w-full pl-9 pr-8 bg-base-100 font-medium text-xs focus:border-primary rounded-xl"
                />
                {searchQuery && (
                  <button
                    type="button"
                    onClick={() => setSearchQuery('')}
                    className="absolute inset-y-0 right-0 pr-2.5 flex items-center text-base-content/40 hover:text-base-content"
                  >
                    <FiX className="w-3.5 h-3.5" />
                  </button>
                )}
              </div>

              {/* Quick Filter Pills */}
              <div className="flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  onClick={() =>
                    setQullaFilter((prev) => (prev === 'upgraded' ? 'all' : 'upgraded'))
                  }
                  className={`btn btn-xs rounded-lg gap-1 font-bold ${
                    qullaFilter === 'upgraded'
                      ? 'bg-secondary text-secondary-content border-secondary shadow-sm'
                      : 'bg-secondary/10 text-secondary border border-secondary/30 hover:bg-secondary/20'
                  }`}
                  title="Show only setups that started as Watch and upgraded to Candidate during the current wave"
                >
                  🚀 Watch &rarr; Candidate ({counts.upgraded})
                </button>

                <button
                  type="button"
                  onClick={() => setOnlyMyOpenTrades((v) => !v)}
                  className={`btn btn-xs rounded-lg gap-1 ${
                    onlyMyOpenTrades ? 'btn-primary' : 'btn-ghost border border-base-300'
                  }`}
                >
                  📌 My Open Positions ({riskMetrics.openPositionsCount})
                </button>

                <span className="text-xs font-mono opacity-60">
                  {filteredAssets.length} / {assets.length} setups
                </span>

                {isFiltered && (
                  <button
                    type="button"
                    onClick={resetFilters}
                    className="btn btn-ghost btn-xs gap-1 text-error hover:bg-error/10"
                  >
                    <FiRotateCcw className="w-3 h-3" /> Reset
                  </button>
                )}
              </div>
            </div>

            {/* Bottom Filter Row */}
            <div className="flex flex-wrap items-center gap-2.5 pt-2 border-t border-base-300/60">
              {/* Qullamaggie Filter */}
              <div className="flex items-center gap-1.5">
                <span className="text-[11px] font-bold uppercase tracking-wider opacity-60 flex items-center gap-1">
                  <FiTrendingUp className="w-3 h-3 text-success" /> Setup:
                </span>
                <select
                  value={qullaFilter}
                  onChange={(e) => setQullaFilter(e.target.value as any)}
                  className="select select-xs select-bordered rounded-lg bg-base-100 font-medium text-xs"
                >
                  <option value="all">All Setups ({assets.length})</option>
                  <option value="candidate">🟢 Candidate Only ({counts.candidate})</option>
                  <option value="upgraded">🚀 Watch &rarr; Candidate Upgraded ({counts.upgraded})</option>
                  <option value="watch">🟡 Watch Only ({counts.watch})</option>
                  <option value="active_only">⚡ Continuing Today ({counts.activeToday})</option>
                  <option value="paused_only">⏸️ Paused / Grace 1-5d ({counts.paused})</option>
                  <option value="score_90">⭐ Score 90+</option>
                  <option value="score_80">🔥 Score 80+</option>
                  <option value="score_70">Score 70+</option>
                </select>
              </div>

              {/* Fundamentals Filter (Wheel:Pass Removed!) */}
              <div className="flex items-center gap-1.5">
                <span className="text-[11px] font-bold uppercase tracking-wider opacity-60 flex items-center gap-1">
                  <FiActivity className="w-3 h-3 text-info" /> Fund:
                </span>
                <select
                  value={fundFilter}
                  onChange={(e) => setFundFilter(e.target.value as any)}
                  className="select select-xs select-bordered rounded-lg bg-base-100 font-medium text-xs"
                >
                  <option value="all">All Scores</option>
                  <option value="score_70">Fund Score 70+</option>
                  <option value="score_60">Fund Score 60+</option>
                  <option value="score_50">Fund Score 50+</option>
                  <option value="score_40">Fund Score 40+</option>
                </select>
              </div>

              {/* Sort Dropdown */}
              <div className="flex items-center gap-1.5 ml-auto">
                <span className="text-[11px] font-bold uppercase tracking-wider opacity-60 flex items-center gap-1">
                  <FiFilter className="w-3 h-3" /> Sort:
                </span>
                <select
                  value={sortBy}
                  onChange={(e) => setSortBy(e.target.value as any)}
                  className="select select-xs select-bordered rounded-lg bg-base-100 font-medium text-xs"
                >
                  <option value="newest_wave">🆕 Newest Analyses First (Top &rarr; Oldest)</option>
                  <option value="oldest_wave">⏳ Longest Running Waves First</option>
                  <option value="qulla_score_desc">Qullamaggie Score (High &rarr; Low)</option>
                  <option value="fund_score_desc">Fund Score (High &rarr; Low)</option>
                  <option value="perf_1d_desc">1D Return (High &rarr; Low)</option>
                  <option value="perf_1w_desc">1W Return (High &rarr; Low)</option>
                  <option value="symbol_asc">Symbol (A &rarr; Z)</option>
                </select>
              </div>
            </div>
          </div>

          {/* ── COMPACT HIGH-DENSITY STOCK ROWS ── */}
          <div className="flex flex-col gap-3">
            {filteredAssets.map((asset) => {
              const qullamaggie = asset.analysis?.qullamaggie;
              const fundamentals = asset.analysis?.fundamentals;
              if (!qullamaggie && !fundamentals) return null;

              const isCandidate = qullamaggie?.status === 'candidate';
              const isUpgraded = isAssetUpgraded(qullamaggie);
              const upgradeDate = qullamaggie?.upgrade_date || null;
              const isPaused = qullamaggie?.lifecycle_status === 'paused';
              const pausedDays = Number(qullamaggie?.paused_days) || 0;
              const waveStartDate =
                qullamaggie?.wave_start_date ||
                (Array.isArray(qullamaggie?.history) && qullamaggie.history.length > 0
                  ? qullamaggie.history[qullamaggie.history.length - 1].date
                  : null);
              const waveActiveDays = Number(qullamaggie?.wave_active_days || qullamaggie?.history?.length || 1);
              const isBrandNew = !isPaused && waveActiveDays === 1;

              const perf = asset.analysis?.performance || qullamaggie?.performance || {};
              const price = Number(qullamaggie?.price ?? fundamentals?.price ?? 0);

              let qReasons: any = {};
              try {
                if (qullamaggie?.reason) {
                  qReasons = typeof qullamaggie.reason === 'string' ? JSON.parse(qullamaggie.reason) : qullamaggie.reason;
                }
              } catch {}

              let fReasons: any = {};
              try {
                if (fundamentals?.reason) {
                  fReasons = typeof fundamentals.reason === 'string' ? JSON.parse(fundamentals.reason) : fundamentals.reason;
                }
              } catch {}

              const upDownRatio = Number(fReasons.up_down_vol_ratio) || 1.0;
              const isAccelerating = fReasons.is_accelerating;
              const symbolOpenPositions = openPositionsBySymbol.get(asset.symbol) || [];
              const stockNotes: PublicStockNote[] = Array.isArray(asset.notes) ? asset.notes : [];

              return (
                <div
                  key={asset.symbol}
                  className={`bg-base-100 rounded-xl border transition-all shadow-sm p-3.5 md:p-4 space-y-2.5 ${
                    symbolOpenPositions.length > 0
                      ? 'border-primary/50 ring-1 ring-primary/20'
                      : isPaused
                        ? 'border-base-300/80 opacity-90'
                        : isCandidate
                          ? 'border-success/35 hover:border-success/60'
                          : 'border-base-300 hover:border-primary/30'
                  }`}
                >
                  {/* ── ROW 1: TOP HEADER STRIP (SYMBOL, PRICE, 1D/1W/1M, WAVE STATUS & ACTIONS) ── */}
                  <div className="flex flex-wrap items-center justify-between gap-2 pb-2 border-b border-base-200">
                    {/* Left: Ticker, Price, Performance & Wave Start */}
                    <div className="flex flex-wrap items-center gap-2.5">
                      <div className="flex items-center gap-1.5">
                        <h2 className="text-xl md:text-2xl font-black tracking-tight">{asset.symbol}</h2>
                        <button
                          type="button"
                          onClick={() => handleCopyTicker(asset.symbol, `active_${asset.symbol}`)}
                          className="p-1 rounded-md hover:bg-base-200 text-base-content/50 hover:text-base-content transition-colors cursor-pointer"
                          title={`Copy ${asset.symbol}`}
                        >
                          {copiedLabel === `active_${asset.symbol}` ? (
                            <FiCheck className="w-3.5 h-3.5 text-success" />
                          ) : (
                            <FiCopy className="w-3.5 h-3.5" />
                          )}
                        </button>
                        {price > 0 && (
                          <span className="text-base md:text-lg font-mono font-bold text-base-content/90 ml-0.5">
                            ${price.toFixed(2)}
                          </span>
                        )}
                      </div>

                      {/* 1D, 1W, 1M Performance Pills */}
                      <div className="flex items-center gap-1">
                        {formatPctBadge(perf.d1, '1D')}
                        {formatPctBadge(perf.w1, '1W')}
                        {formatPctBadge(perf.m1, '1M')}
                      </div>

                      {/* Wave Start Date & Active/Paused Status */}
                      <div className="flex flex-wrap items-center gap-1.5">
                        {isBrandNew && (
                          <span className="px-2 py-0.5 rounded-md bg-primary text-primary-content font-black text-[10px] uppercase tracking-wider animate-pulse">
                            ✨ NEW TODAY
                          </span>
                        )}
                        {isUpgraded && (
                          <span
                            className="px-2 py-0.5 rounded-md bg-secondary/20 border border-secondary/40 text-secondary font-black text-[11px] flex items-center gap-1"
                            title={
                              upgradeDate
                                ? `Started as Watch on ${formatShortDate(waveStartDate)} and upgraded to Candidate on ${formatShortDate(upgradeDate)}`
                                : 'Started as Watch and upgraded to Candidate during this wave'
                            }
                          >
                            🚀 Watch &rarr; Candidate
                            {upgradeDate ? ` (${formatShortDate(upgradeDate)})` : ''}
                          </span>
                        )}
                        <span className="px-2 py-0.5 rounded-md bg-base-200 border border-base-300 text-[11px] font-mono font-semibold">
                          Wave Started: <strong>{formatShortDate(waveStartDate)}</strong> ({waveActiveDays}d)
                        </span>

                        {isPaused ? (
                          <span
                            className="px-2 py-0.5 rounded-md bg-warning/15 border border-warning/35 text-warning text-[11px] font-bold flex items-center gap-1"
                            title={`Score did not qualify today. In 5-day grace period (${pausedDays}/5 business days elapsed).`}
                          >
                            <FiPauseCircle className="w-3 h-3" />
                            Paused ({pausedDays}/5d)
                          </span>
                        ) : (
                          <span className="px-2 py-0.5 rounded-md bg-success/15 border border-success/30 text-success text-[11px] font-bold">
                            ● Active
                          </span>
                        )}
                      </div>
                    </div>

                    {/* Right: Setup Score Badges & Quick Action Buttons */}
                    <div className="flex flex-wrap items-center gap-2">
                      {qullamaggie && (
                        <span
                          className={`px-2.5 py-1 rounded-lg text-xs font-black uppercase tracking-wider border ${
                            isCandidate
                              ? 'bg-success/15 border-success/35 text-success'
                              : 'bg-warning/15 border-warning/35 text-warning'
                          }`}
                        >
                          {qullamaggie.status}: {qullamaggie.score}
                        </span>
                      )}

                      {fundamentals && (
                        <span className="px-2.5 py-1 rounded-lg text-xs font-black uppercase tracking-wider bg-info/15 border border-info/30 text-info">
                          FUND: {fundamentals.score}
                        </span>
                      )}

                      <button
                        type="button"
                        onClick={() => handleOpenTradeModal(asset)}
                        className="btn btn-xs btn-primary rounded-lg gap-1 font-bold"
                      >
                        <FiPlus className="w-3.5 h-3.5" />
                        <span>Open Trade</span>
                      </button>

                      <button
                        type="button"
                        onClick={() =>
                          setOpenNoteBoxSym((prev) => (prev === asset.symbol ? null : asset.symbol))
                        }
                        className={`btn btn-xs rounded-lg gap-1 ${
                          stockNotes.length > 0 ? 'btn-secondary btn-outline' : 'btn-ghost border border-base-300'
                        }`}
                      >
                        <FiMessageSquare className="w-3 h-3" />
                        <span>Note {stockNotes.length > 0 ? `(${stockNotes.length})` : ''}</span>
                      </button>
                    </div>
                  </div>

                  {/* ── ROW 2: COMPACT VERTICAL/STACKED METRICS LISTS (NO EMPTY SPACE) ── */}
                  <div className="grid grid-cols-1 lg:grid-cols-2 gap-2.5 text-xs">
                    {/* Qullamaggie Compact Details List */}
                    {qullamaggie && (
                      <div className="bg-base-200/40 rounded-lg border border-base-300/70 p-2.5 space-y-1.5">
                        <div className="flex flex-wrap items-center justify-between gap-1 text-[11px] font-bold uppercase opacity-75 border-b border-base-300/60 pb-1">
                          <span className="text-primary">Qullamaggie Setup Breakdown</span>
                          <span className="font-mono">
                            Trend: <b>{qReasons.trend_score || 0}</b>/30 • RS: <b>{qReasons.rs_score || 0}</b>/30 • Base: <b>{qReasons.tightness_score || 0}</b>/25 • Vol: <b>{qReasons.vol_score || 0}</b>/15
                          </span>
                        </div>

                        <div className="grid grid-cols-2 sm:grid-cols-4 gap-x-3 gap-y-1 text-[11px]">
                          <div className="flex justify-between sm:justify-start sm:gap-1.5">
                            <span className="opacity-60">Tight Flag:</span>
                            <span className="font-bold">{qReasons.is_tight ? '✅ Yes' : '❌ No'}</span>
                          </div>
                          <div className="flex justify-between sm:justify-start sm:gap-1.5">
                            <span className="opacity-60">Vol Dry-Up:</span>
                            <span className="font-bold">{qReasons.is_dry ? '✅ Yes' : '❌ No'}</span>
                          </div>
                          <div className="flex justify-between sm:justify-start sm:gap-1.5">
                            <span className="opacity-60">RVOL:</span>
                            <span className="font-mono font-semibold">
                              {qReasons.rvol !== undefined ? `${Number(qReasons.rvol).toFixed(2)}x` : '—'}
                            </span>
                          </div>
                          <div className="flex justify-between sm:justify-start sm:gap-1.5">
                            <span className="opacity-60">Ext (EMA10):</span>
                            <span className="font-mono font-semibold">
                              {qReasons.ext_pct !== undefined ? `${(Number(qReasons.ext_pct) * 100).toFixed(1)}%` : '—'}
                            </span>
                          </div>
                          <div className="flex justify-between sm:justify-start sm:gap-1.5">
                            <span className="opacity-60">ADR (20D):</span>
                            <span className="font-mono">
                              {qReasons.adr_pct !== undefined ? `${Number(qReasons.adr_pct).toFixed(1)}%` : '—'}
                            </span>
                          </div>
                          <div className="flex justify-between sm:justify-start sm:gap-1.5">
                            <span className="opacity-60">Stop LOD:</span>
                            <span className="font-mono text-error font-semibold">
                              {qReasons.stop_loss_lod ? `$${Number(qReasons.stop_loss_lod).toFixed(2)}` : '—'}
                            </span>
                          </div>
                          <div className="col-span-2 flex flex-wrap items-center gap-2 font-mono text-[10px] opacity-75">
                            <span>EMA10: ${asset.technicals?.ema_10?.toFixed(2) ?? qReasons.ema_10 ?? '—'}</span>
                            <span>•</span>
                            <span>EMA20: ${asset.technicals?.ema_20?.toFixed(2) ?? qReasons.ema_20 ?? '—'}</span>
                            <span>•</span>
                            <span>SMA50: ${asset.technicals?.sma_50?.toFixed(2) ?? qReasons.sma_50 ?? '—'}</span>
                          </div>
                        </div>
                      </div>
                    )}

                    {/* Fundamentals Compact Details List (Wheel:Pass Removed!) */}
                    {fundamentals && (
                      <div className="bg-info/[0.04] rounded-lg border border-info/20 p-2.5 space-y-1.5">
                        <div className="flex flex-wrap items-center justify-between gap-1 text-[11px] font-bold uppercase opacity-75 border-b border-info/15 pb-1">
                          <span className="text-info">
                            Fundamentals ({fReasons.sector || 'N/A'} {fReasons.market_cap_bucket ? `• ${fReasons.market_cap_bucket}` : ''})
                          </span>
                          {fReasons.breakdown && (
                            <span className="font-mono text-info">
                              Grw: <b>{fReasons.breakdown.growth || 0}</b> • Inst: <b>{fReasons.breakdown.accumulation || 0}</b> • Prf: <b>{fReasons.breakdown.profitability || 0}</b> • Bal: <b>{fReasons.breakdown.balance_sheet || 0}</b>
                            </span>
                          )}
                        </div>

                        <div className="grid grid-cols-2 sm:grid-cols-3 gap-x-3 gap-y-1 text-[11px]">
                          <div className="flex justify-between sm:justify-start sm:gap-1.5">
                            <span className="opacity-60">MCap:</span>
                            <span className="font-mono font-semibold">
                              {fReasons.market_cap ? `$${(Number(fReasons.market_cap) / 1e9).toFixed(1)}B` : '—'}
                            </span>
                          </div>
                          <div className="flex justify-between sm:justify-start sm:gap-1.5">
                            <span className="opacity-60">P/E | PEG:</span>
                            <span className="font-mono font-semibold">
                              {fReasons.pe_ratio ? Number(fReasons.pe_ratio).toFixed(1) : '—'} |{' '}
                              {fReasons.peg_ratio ? Number(fReasons.peg_ratio).toFixed(2) : '—'}
                            </span>
                          </div>
                          <div className="flex justify-between sm:justify-start sm:gap-1.5">
                            <span className="opacity-60">Rev YoY:</span>
                            <span className="font-mono font-semibold flex items-center gap-1">
                              {fReasons.revenue_growth !== null && fReasons.revenue_growth !== undefined
                                ? `${(Number(fReasons.revenue_growth) * 100).toFixed(1)}%`
                                : '—'}
                              {isAccelerating && <span title="Accelerating Revenue Growth">🚀</span>}
                            </span>
                          </div>
                          <div className="flex justify-between sm:justify-start sm:gap-1.5">
                            <span className="opacity-60">Up/Dn Vol:</span>
                            <span
                              className={`font-mono font-semibold ${
                                upDownRatio >= 1.3 ? 'text-success' : upDownRatio < 0.85 ? 'text-error' : ''
                              }`}
                            >
                              {upDownRatio.toFixed(2)} {upDownRatio >= 1.3 ? '🔥' : ''}
                            </span>
                          </div>
                          <div className="flex justify-between sm:justify-start sm:gap-1.5">
                            <span className="opacity-60">Net / Op Margin:</span>
                            <span className="font-mono">
                              {fReasons.net_margin !== null && fReasons.net_margin !== undefined
                                ? `${(Number(fReasons.net_margin) * 100).toFixed(0)}%`
                                : '—'}{' '}
                              /{' '}
                              {fReasons.operating_margin !== null && fReasons.operating_margin !== undefined
                                ? `${(Number(fReasons.operating_margin) * 100).toFixed(0)}%`
                                : '—'}
                            </span>
                          </div>
                          <div className="flex justify-between sm:justify-start sm:gap-1.5">
                            <span className="opacity-60">Net Cash:</span>
                            <span className="font-bold">{fReasons.has_net_cash ? '✅ Positive' : '❌ Debt'}</span>
                          </div>
                        </div>
                      </div>
                    )}
                  </div>

                  {/* ── ROW 3: USER'S OPEN SWING POSITION STRIP (IF OPEN) ── */}
                  {symbolOpenPositions.map((pos) => {
                    const currentP = price > 0 ? price : pos.entry_price;
                    const unrealizedUsd = (currentP - pos.entry_price) * pos.remaining_shares;
                    const unrealizedPct =
                      pos.entry_price > 0 ? ((currentP - pos.entry_price) / pos.entry_price) * 100 : 0;
                    const openRiskUsd = Math.max(0, (pos.entry_price - pos.stop_price) * pos.remaining_shares);
                    const isFreeRoll = pos.stop_price >= pos.entry_price;

                    return (
                      <div
                        key={pos.id}
                        className="bg-primary/10 border border-primary/30 rounded-xl p-3 space-y-2 text-xs"
                      >
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <div className="flex flex-wrap items-center gap-2.5">
                            <span className="px-2 py-0.5 rounded bg-primary text-primary-content font-black text-[10px] uppercase tracking-wider">
                              📌 OPEN POSITION
                            </span>
                            <span className="font-mono font-bold">
                              {pos.remaining_shares} / {pos.initial_shares} Shares @ ${pos.entry_price.toFixed(2)}
                            </span>
                            <span
                              className={`font-mono font-bold ${
                                unrealizedUsd >= 0 ? 'text-success' : 'text-error'
                              }`}
                            >
                              Unrealized: {unrealizedUsd >= 0 ? '+' : ''}
                              {formatUsd(unrealizedUsd)} ({unrealizedPct >= 0 ? '+' : ''}
                              {unrealizedPct.toFixed(2)}%)
                            </span>
                            {pos.realized_pnl_usd !== 0 && (
                              <span
                                className={`font-mono font-semibold ${
                                  pos.realized_pnl_usd >= 0 ? 'text-emerald-400' : 'text-error'
                                }`}
                              >
                                • Realized: {pos.realized_pnl_usd >= 0 ? '+' : ''}
                                {formatUsd(pos.realized_pnl_usd)}
                              </span>
                            )}
                          </div>

                          {/* Stop & Risk Info + Action Buttons */}
                          <div className="flex flex-wrap items-center gap-2">
                            {editingStopPosId === pos.id ? (
                              <div className="flex items-center gap-1">
                                <input
                                  type="number"
                                  step="0.01"
                                  value={editingStopValue}
                                  onChange={(e) => setEditingStopValue(e.target.value)}
                                  className="input input-xs input-bordered w-24 font-mono"
                                  placeholder="New Stop $"
                                />
                                <button
                                  type="button"
                                  onClick={() => handleSaveStopUpdate(pos.id)}
                                  className="btn btn-xs btn-success"
                                >
                                  Save
                                </button>
                                <button
                                  type="button"
                                  onClick={() => handleSaveStopUpdate(pos.id, pos.entry_price)}
                                  className="btn btn-xs btn-outline"
                                  title="Move stop to entry price (Breakeven Free Roll)"
                                >
                                  Breakeven
                                </button>
                                <button
                                  type="button"
                                  onClick={() => setEditingStopPosId(null)}
                                  className="btn btn-xs btn-ghost"
                                >
                                  ✕
                                </button>
                              </div>
                            ) : (
                              <div className="flex items-center gap-1.5 bg-base-100/80 px-2.5 py-1 rounded-lg border border-base-300">
                                <span className="opacity-70">Stop:</span>
                                <span className="font-mono font-bold text-error">${pos.stop_price.toFixed(2)}</span>
                                <button
                                  type="button"
                                  onClick={() => {
                                    setEditingStopPosId(pos.id);
                                    setEditingStopValue(pos.stop_price.toFixed(2));
                                  }}
                                  className="opacity-60 hover:opacity-100 text-primary cursor-pointer"
                                  title="Update Stop Loss"
                                >
                                  <FiEdit2 className="w-3 h-3" />
                                </button>
                                <span className="opacity-40">|</span>
                                {isFreeRoll ? (
                                  <span className="text-success font-bold text-[11px]">🟢 $0 Risk (Free Roll)</span>
                                ) : (
                                  <span className="font-mono text-warning font-semibold">
                                    Risk: {formatUsd(openRiskUsd)}
                                  </span>
                                )}
                              </div>
                            )}

                            <button
                              type="button"
                              onClick={() => {
                                setPartialSellPos(pos);
                                setSellSharesInput('');
                                setSellPriceInput(currentP.toFixed(2));
                                setSellNoteInput('');
                              }}
                              className="btn btn-xs btn-success rounded-lg font-bold"
                            >
                              💰 Sell Partial
                            </button>

                            <button
                              type="button"
                              onClick={() => {
                                setStopHitPos(pos);
                                setStopHitPriceInput(pos.stop_price.toFixed(2));
                              }}
                              className="btn btn-xs btn-error rounded-lg font-bold"
                            >
                              🛑 Stop Hit
                            </button>
                          </div>
                        </div>

                        {/* Transactions History Pills */}
                        {pos.transactions && pos.transactions.length > 0 && (
                          <div className="flex flex-wrap items-center gap-1.5 pt-1 border-t border-primary/20 text-[11px] font-mono">
                            <span className="opacity-60 font-sans font-semibold">Transactions:</span>
                            {pos.transactions.map((tx) => (
                              <span
                                key={tx.id}
                                className={`px-2 py-0.5 rounded border ${
                                  tx.type === 'BUY'
                                    ? 'bg-base-100 border-base-300'
                                    : tx.type === 'PARTIAL_SELL'
                                      ? 'bg-success/15 border-success/30 text-success'
                                      : tx.type === 'STOP_HIT'
                                        ? 'bg-error/15 border-error/30 text-error'
                                        : 'bg-base-200 border-base-300 opacity-75'
                                }`}
                              >
                                {tx.type === 'BUY' && `BUY ${tx.shares} @ $${Number(tx.price).toFixed(2)} (${formatShortDate(tx.date)})`}
                                {tx.type === 'PARTIAL_SELL' &&
                                  `SOLD ${tx.shares} @ $${Number(tx.price).toFixed(2)} (${tx.pnl_pct && tx.pnl_pct >= 0 ? '+' : ''}${tx.pnl_pct}% / ${tx.pnl_usd && tx.pnl_usd >= 0 ? '+' : ''}$${tx.pnl_usd})`}
                                {tx.type === 'STOP_UPDATE' && `STOP → $${Number(tx.price).toFixed(2)}`}
                                {tx.type === 'STOP_HIT' && `STOP HIT ${tx.shares} @ $${Number(tx.price).toFixed(2)}`}
                              </span>
                            ))}
                          </div>
                        )}
                      </div>
                    );
                  })}

                  {/* ── ROW 4: PUBLIC COMMUNITY STOCK NOTES ── */}
                  {(stockNotes.length > 0 || openNoteBoxSym === asset.symbol) && (
                    <div className="bg-base-200/50 rounded-xl border border-base-300/80 p-2.5 space-y-2 text-xs">
                      {stockNotes.length > 0 && (
                        <div className="space-y-1">
                          {stockNotes.map((n) => (
                            <div
                              key={n.id}
                              className="flex items-start justify-between gap-2 bg-base-100/80 px-2.5 py-1.5 rounded-lg border border-base-300/60"
                            >
                              <div className="flex flex-wrap items-baseline gap-1.5">
                                <span className="text-[11px] font-bold text-primary">@{n.authorName}</span>
                                <span className="text-[10px] opacity-45 font-mono">
                                  ({formatShortDate(n.createdAt)})
                                </span>
                                <span className="text-base-content/90">{n.text}</span>
                              </div>
                              {user?.uid === n.authorUid && (
                                <button
                                  type="button"
                                  onClick={() => handleDeleteNote(asset.symbol, n.id)}
                                  className="text-base-content/40 hover:text-error transition-colors shrink-0 cursor-pointer"
                                  title="Delete note"
                                >
                                  <FiTrash2 className="w-3.5 h-3.5" />
                                </button>
                              )}
                            </div>
                          ))}
                        </div>
                      )}

                      {openNoteBoxSym === asset.symbol && (
                        <div className="flex items-center gap-2">
                          <input
                            type="text"
                            value={noteInputBySym[asset.symbol] || ''}
                            onChange={(e) =>
                              setNoteInputBySym((prev) => ({ ...prev, [asset.symbol]: e.target.value }))
                            }
                            onKeyDown={(e) => {
                              if (e.key === 'Enter') {
                                e.preventDefault();
                                handleAddNote(asset.symbol);
                              }
                            }}
                            placeholder={`Add a public note for ${asset.symbol} (visible to all users as @${userDisplayName})...`}
                            className="input input-xs input-bordered flex-1 bg-base-100"
                          />
                          <button
                            type="button"
                            disabled={submittingNoteSym === asset.symbol}
                            onClick={() => handleAddNote(asset.symbol)}
                            className="btn btn-xs btn-primary"
                          >
                            Post Note
                          </button>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          {filteredAssets.length === 0 && (
            <div className="alert bg-base-200 border border-base-300 shadow-sm p-6 rounded-2xl flex items-center justify-between">
              <div className="flex items-center gap-3">
                <span className="text-2xl">🔍</span>
                <div>
                  <h3 className="font-bold text-sm">No Matching Setups Found</h3>
                  <p className="text-xs opacity-70">
                    No setups matched your active filters. Try resetting filters to view all candidates.
                  </p>
                </div>
              </div>
              {isFiltered && (
                <button type="button" onClick={resetFilters} className="btn btn-primary btn-xs rounded-lg">
                  Reset Filters
                </button>
              )}
            </div>
          )}
        </>
      )}

      {/* ════════════════════════════════════════════════════════════════
          TAB 2: DROPPED / CLOSED ANALYSES (LAST 14 DAYS — WATCHLIST CLEANUP)
         ════════════════════════════════════════════════════════════════ */}
      {activeTab === 'dropped' && (
        <div className="bg-base-100 rounded-2xl border border-base-300 p-4 shadow-sm space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-base-200 pb-3">
            <div>
              <h3 className="font-black text-base flex items-center gap-2">
                <FiClock className="text-warning" />
                <span>Closed / Dropped Setups — Last 2 Weeks ({initialDropped.length} Symbols)</span>
              </h3>
              <p className="text-xs opacity-65">
                Setups that failed to qualify for more than 5 business days. Listed here for 14 days so you can easily remove them from your TradingView watchlists.
              </p>
            </div>
          </div>

          {initialDropped.length === 0 ? (
            <div className="py-12 text-center opacity-60 text-sm">
              No dropped setups in the last 14 days.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="table table-sm w-full">
                <thead>
                  <tr className="text-[11px] uppercase opacity-60">
                    <th>Symbol</th>
                    <th>Sector</th>
                    <th>Wave Window</th>
                    <th>Dropped Date</th>
                    <th>Peak Status / Score</th>
                    <th className="text-right">Latest Price</th>
                    <th className="text-right">1D / 1W / 1M</th>
                  </tr>
                </thead>
                <tbody className="text-xs">
                  {initialDropped.map((item) => (
                    <tr key={item.symbol} className="hover:bg-base-200/50">
                      <td className="font-black text-sm">
                        <div className="inline-flex items-center gap-1.5">
                          <span>{item.symbol}</span>
                          <button
                            type="button"
                            onClick={() => handleCopyTicker(item.symbol, `drop-${item.symbol}`)}
                            className={`p-1 rounded-md transition-colors cursor-pointer ${
                              copiedLabel === `drop-${item.symbol}`
                                ? 'bg-success/20 text-success'
                                : 'bg-base-200/80 hover:bg-base-300 text-base-content/60 hover:text-base-content'
                            }`}
                            title={`Copy ${item.symbol}`}
                          >
                            {copiedLabel === `drop-${item.symbol}` ? <FiCheck className="w-3 h-3" /> : <FiCopy className="w-3 h-3" />}
                          </button>
                        </div>
                      </td>
                      <td className="opacity-70">{item.sector || '—'}</td>
                      <td className="font-mono">
                        {formatShortDate(item.wave_start_date)} &rarr; {formatShortDate(item.wave_last_date)} ({item.wave_active_days}d)
                      </td>
                      <td>
                        <span className="px-2 py-0.5 rounded bg-error/15 text-error font-mono font-semibold text-[11px]">
                          Dropped {formatShortDate(item.dropped_date)} ({item.days_since_dropped}d ago)
                        </span>
                      </td>
                      <td>
                        <span
                          className={`px-2 py-0.5 rounded font-bold uppercase text-[10px] ${
                            item.peak_status === 'candidate'
                              ? 'bg-success/15 text-success'
                              : 'bg-warning/15 text-warning'
                          }`}
                        >
                          {item.peak_status} (Max {item.max_score})
                        </span>
                      </td>
                      <td className="text-right font-mono font-bold">
                        {item.price ? `$${Number(item.price).toFixed(2)}` : '—'}
                      </td>
                      <td className="text-right space-x-1">
                        {formatPctBadge(item.performance?.d1, '1D')}
                        {formatPctBadge(item.performance?.w1, '1W')}
                        {formatPctBadge(item.performance?.m1, '1M')}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* ════════════════════════════════════════════════════════════════
          TAB 3: MY SWING TRADES LOG (OPEN & CLOSED)
         ════════════════════════════════════════════════════════════════ */}
      {activeTab === 'trades' && (
        <div className="bg-base-100 rounded-2xl border border-base-300 p-4 shadow-sm space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-base-200 pb-3">
            <div>
              <h3 className="font-black text-base">My Swing Positions &amp; Execution Log</h3>
              <p className="text-xs opacity-65">
                Track all active, partially sold, and stopped-out swing trades initiated from Analysis setups.
              </p>
            </div>
            <div className="flex items-center gap-3 text-xs font-mono">
              <span className="px-2.5 py-1 rounded-lg bg-base-200">
                Unrealized P&amp;L:{' '}
                <strong className={riskMetrics.totalUnrealizedPnlUsd >= 0 ? 'text-success' : 'text-error'}>
                  {riskMetrics.totalUnrealizedPnlUsd >= 0 ? '+' : ''}
                  {formatUsd(riskMetrics.totalUnrealizedPnlUsd)}
                </strong>
              </span>
              <span className="px-2.5 py-1 rounded-lg bg-base-200">
                Realized P&amp;L:{' '}
                <strong className={riskMetrics.totalRealizedPnlUsd >= 0 ? 'text-success' : 'text-error'}>
                  {riskMetrics.totalRealizedPnlUsd >= 0 ? '+' : ''}
                  {formatUsd(riskMetrics.totalRealizedPnlUsd)}
                </strong>
              </span>
            </div>
          </div>

          {positions.length === 0 ? (
            <div className="py-12 text-center opacity-60 text-sm">
              You have not logged any swing positions yet. Click &ldquo;+ Open Trade&rdquo; on any stock setup to start tracking.
            </div>
          ) : (
            <div className="space-y-3">
              {positions.map((pos) => {
                const curPrice = latestPriceBySymbol.get(pos.symbol) ?? pos.entry_price;
                const isOpen = pos.status === 'OPEN' && pos.remaining_shares > 0;
                const unrealizedUsd = isOpen ? (curPrice - pos.entry_price) * pos.remaining_shares : 0;
                const openRiskUsd = isOpen ? Math.max(0, (pos.entry_price - pos.stop_price) * pos.remaining_shares) : 0;

                return (
                  <div
                    key={pos.id}
                    className={`rounded-xl border p-3.5 space-y-2 text-xs ${
                      isOpen
                        ? 'bg-primary/5 border-primary/30'
                        : pos.status === 'CLOSED_WIN'
                          ? 'bg-success/5 border-success/25'
                          : 'bg-error/5 border-error/25'
                    }`}
                  >
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div className="flex flex-wrap items-center gap-2.5">
                        <div className="inline-flex items-center gap-1.5">
                          <span className="text-base font-black">{pos.symbol}</span>
                          <button
                            type="button"
                            onClick={() => handleCopyTicker(pos.symbol, `pos-${pos.id}`)}
                            className={`p-1 rounded-md transition-colors cursor-pointer ${
                              copiedLabel === `pos-${pos.id}`
                                ? 'bg-success/20 text-success'
                                : 'bg-base-200/80 hover:bg-base-300 text-base-content/60 hover:text-base-content'
                            }`}
                            title={`Copy ${pos.symbol}`}
                          >
                            {copiedLabel === `pos-${pos.id}` ? <FiCheck className="w-3 h-3" /> : <FiCopy className="w-3 h-3" />}
                          </button>
                        </div>
                        <span
                          className={`px-2 py-0.5 rounded font-bold text-[10px] uppercase ${
                            isOpen
                              ? 'bg-primary text-primary-content'
                              : pos.status === 'CLOSED_WIN'
                                ? 'bg-success/20 text-success'
                                : 'bg-error/20 text-error'
                          }`}
                        >
                          {pos.status}
                        </span>
                        <span className="font-mono">
                          Entry: <b>${pos.entry_price.toFixed(2)}</b> • Shares: <b>{pos.remaining_shares} / {pos.initial_shares}</b> • Stop: <b className="text-error">${pos.stop_price.toFixed(2)}</b>
                        </span>
                        {isOpen && (
                          <span className="font-mono text-warning">
                            Open Risk: <b>{formatUsd(openRiskUsd)}</b>
                          </span>
                        )}
                      </div>

                      <div className="flex items-center gap-2">
                        {isOpen && (
                          <span className={`font-mono font-bold ${unrealizedUsd >= 0 ? 'text-success' : 'text-error'}`}>
                            Unrealized: {unrealizedUsd >= 0 ? '+' : ''}{formatUsd(unrealizedUsd)}
                          </span>
                        )}
                        <span className={`font-mono font-bold ${pos.realized_pnl_usd >= 0 ? 'text-emerald-400' : 'text-error'}`}>
                          Realized: {pos.realized_pnl_usd >= 0 ? '+' : ''}{formatUsd(pos.realized_pnl_usd)}
                        </span>
                        <button
                          type="button"
                          onClick={() => handleDeletePosition(pos.id)}
                          className="btn btn-ghost btn-xs text-error"
                          title="Delete position record"
                        >
                          <FiTrash2 />
                        </button>
                      </div>
                    </div>

                    {pos.transactions && pos.transactions.length > 0 && (
                      <div className="flex flex-wrap gap-1.5 pt-1 border-t border-base-300/60 font-mono text-[11px]">
                        {pos.transactions.map((tx) => (
                          <span key={tx.id} className="px-2 py-0.5 rounded bg-base-200 border border-base-300">
                            {tx.type}: {tx.shares} sh @ ${Number(tx.price).toFixed(2)} ({formatShortDate(tx.date)})
                            {tx.pnl_usd !== undefined ? ` [${tx.pnl_usd >= 0 ? '+' : ''}$${tx.pnl_usd}]` : ''}
                          </span>
                        ))}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* ════════════════════════════════════════════════════════════════
          MODAL 1: OPEN NEW SWING TRADE (WITH AUTO POSITION SIZER)
         ════════════════════════════════════════════════════════════════ */}
      {openTradeModalAsset && (
        <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-base-100 border border-base-300 rounded-2xl max-w-md w-full p-5 shadow-2xl space-y-4">
            <div className="flex items-center justify-between border-b border-base-200 pb-3">
              <div>
                <h3 className="font-black text-lg">Open Swing Trade — {openTradeModalAsset.symbol}</h3>
                <p className="text-xs opacity-60">
                  Position risk is automatically tracked in your Portfolio Risk Index.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setOpenTradeModalAsset(null)}
                className="btn btn-ghost btn-xs btn-circle"
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleSubmitNewPosition} className="space-y-3 text-xs">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-bold mb-1 opacity-75">Entry Price ($)</label>
                  <input
                    type="number"
                    step="0.01"
                    required
                    value={tradeEntryPrice}
                    onChange={(e) => setTradeEntryPrice(e.target.value)}
                    className="input input-sm input-bordered w-full font-mono"
                  />
                </div>
                <div>
                  <label className="block font-bold mb-1 opacity-75 text-error">Stop Loss Price ($)</label>
                  <input
                    type="number"
                    step="0.01"
                    required
                    value={tradeStopPrice}
                    onChange={(e) => setTradeStopPrice(e.target.value)}
                    className="input input-sm input-bordered w-full font-mono border-error/40"
                  />
                </div>
              </div>

              <div>
                <div className="flex items-center justify-between mb-1">
                  <label className="font-bold opacity-75">Quantity (Shares)</label>
                  {totalPortfolioUsd > 0 && (
                    <div className="flex items-center gap-1">
                      <button
                        type="button"
                        onClick={() => handleAutoSizeShares(0.5)}
                        className="px-1.5 py-0.5 rounded bg-base-200 hover:bg-base-300 font-mono text-[10px] cursor-pointer"
                        title="Auto-calculate shares to risk 0.5% of total portfolio"
                      >
                        Size 0.5% Risk
                      </button>
                      <button
                        type="button"
                        onClick={() => handleAutoSizeShares(1.0)}
                        className="px-1.5 py-0.5 rounded bg-base-200 hover:bg-base-300 font-mono text-[10px] cursor-pointer"
                        title="Auto-calculate shares to risk 1.0% of total portfolio"
                      >
                        Size 1% Risk
                      </button>
                      <button
                        type="button"
                        onClick={() => handleAutoSizeShares()}
                        className="px-1.5 py-0.5 rounded bg-primary/20 text-primary font-mono text-[10px] cursor-pointer"
                        title="Auto-calculate shares for remaining risk budget"
                      >
                        Max Remaining
                      </button>
                    </div>
                  )}
                </div>
                <input
                  type="number"
                  step="any"
                  required
                  value={tradeShares}
                  onChange={(e) => setTradeShares(e.target.value)}
                  placeholder="e.g. 25"
                  className="input input-sm input-bordered w-full font-mono"
                />
              </div>

              {/* Live Risk Preview Box */}
              {(() => {
                const entry = Number(tradeEntryPrice) || 0;
                const stop = Number(tradeStopPrice) || 0;
                const sh = Number(tradeShares) || 0;
                const riskPerShare = Math.max(0, entry - stop);
                const tradeRiskUsd = riskPerShare * sh;
                const tradeCostUsd = entry * sh;
                const stopDistPct = entry > 0 ? ((entry - stop) / entry) * 100 : 0;
                const tradePortfolioRiskPct = totalPortfolioUsd > 0 ? (tradeRiskUsd / totalPortfolioUsd) * 100 : 0;
                const projectedTotalRiskUsd = riskMetrics.totalOpenRiskUsd + tradeRiskUsd;
                const projectedPortfolioRiskPct = totalPortfolioUsd > 0 ? (projectedTotalRiskUsd / totalPortfolioUsd) * 100 : 0;
                const isOverRiskLimit = riskMetrics.maxBudgetUsd > 0 && projectedTotalRiskUsd > riskMetrics.maxBudgetUsd;
                const excessRiskUsd = Math.max(0, projectedTotalRiskUsd - riskMetrics.maxBudgetUsd);

                return (
                  <div className="bg-base-200/80 rounded-xl p-3 border border-base-300 space-y-1.5 font-mono text-[11px]">
                    <div className="flex justify-between">
                      <span className="opacity-65">Position Size (Notional):</span>
                      <span className="font-bold">{formatUsd(tradeCostUsd)}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="opacity-65">Stop Distance:</span>
                      <span className="text-error font-bold">
                        -${riskPerShare.toFixed(2)} / sh (-{stopDistPct.toFixed(2)}%)
                      </span>
                    </div>
                    <div className="flex justify-between border-t border-base-300 pt-1">
                      <span className="opacity-80 font-sans font-bold">Total Dollar Risk at Stop:</span>
                      <span className="text-warning font-black">
                        {formatUsd(tradeRiskUsd)} ({tradePortfolioRiskPct.toFixed(2)}% of Portfolio)
                      </span>
                    </div>
                    <div className="flex justify-between text-[10px] opacity-75">
                      <span>Projected Total Open Risk:</span>
                      <span className={isOverRiskLimit ? 'text-error font-bold' : 'text-emerald-400 font-bold'}>
                        {formatUsd(projectedTotalRiskUsd)} / {formatUsd(riskMetrics.maxBudgetUsd)} ({projectedPortfolioRiskPct.toFixed(2)}% vs {riskLimitPct}% Limit)
                      </span>
                    </div>
                    {isOverRiskLimit && (
                      <div className="mt-1.5 flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-error/15 border border-error/40 text-error font-sans font-bold text-[11px]">
                        <FiAlertTriangle className="w-4 h-4 shrink-0" />
                        <span>
                          Risk Limit Exceeded! This trade puts your total open risk {formatUsd(excessRiskUsd)} (+{(projectedPortfolioRiskPct - riskLimitPct).toFixed(2)}%) over your {riskLimitPct}% max risk budget.
                        </span>
                      </div>
                    )}
                  </div>
                );
              })()}

              <div>
                <label className="block font-bold mb-1 opacity-75">Trade Note (Optional)</label>
                <input
                  type="text"
                  value={tradeNote}
                  onChange={(e) => setTradeNote(e.target.value)}
                  placeholder="e.g. VCP breakout on 10 EMA bounce"
                  className="input input-sm input-bordered w-full"
                />
              </div>

              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setOpenTradeModalAsset(null)}
                  className="btn btn-sm btn-ghost"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={submittingTrade}
                  className="btn btn-sm btn-primary font-bold"
                >
                  {submittingTrade ? 'Saving...' : 'Open Position'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ════════════════════════════════════════════════════════════════
          MODAL 2: PARTIAL SELL / PROFIT TAKING
         ════════════════════════════════════════════════════════════════ */}
      {partialSellPos && (
        <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-base-100 border border-base-300 rounded-2xl max-w-md w-full p-5 shadow-2xl space-y-4">
            <div className="flex items-center justify-between border-b border-base-200 pb-3">
              <div>
                <h3 className="font-black text-lg">Record Partial Sell — {partialSellPos.symbol}</h3>
                <p className="text-xs opacity-60">
                  Remaining Shares: <b>{partialSellPos.remaining_shares}</b> (Entry: ${partialSellPos.entry_price.toFixed(2)})
                </p>
              </div>
              <button
                type="button"
                onClick={() => setPartialSellPos(null)}
                className="btn btn-ghost btn-xs btn-circle"
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleSubmitPartialSell} className="space-y-3 text-xs">
              <div>
                <div className="flex items-center justify-between mb-1">
                  <label className="font-bold opacity-75">Shares to Sell</label>
                  <div className="flex items-center gap-1">
                    {[0.25, 0.33, 0.5, 1].map((fraction) => (
                      <button
                        key={fraction}
                        type="button"
                        onClick={() => {
                          const calc =
                            fraction === 1
                              ? partialSellPos.remaining_shares
                              : Math.max(1, Math.round(partialSellPos.remaining_shares * fraction));
                          setSellSharesInput(String(calc));
                        }}
                        className="px-1.5 py-0.5 rounded bg-base-200 hover:bg-base-300 font-mono text-[10px] cursor-pointer"
                      >
                        {fraction === 1 ? '100% (All)' : `${Math.round(fraction * 100)}%`}
                      </button>
                    ))}
                  </div>
                </div>
                <input
                  type="number"
                  step="any"
                  max={partialSellPos.remaining_shares}
                  required
                  value={sellSharesInput}
                  onChange={(e) => setSellSharesInput(e.target.value)}
                  className="input input-sm input-bordered w-full font-mono"
                />
              </div>

              <div>
                <label className="block font-bold mb-1 opacity-75">Sell Execution Price ($)</label>
                <input
                  type="number"
                  step="0.01"
                  required
                  value={sellPriceInput}
                  onChange={(e) => setSellPriceInput(e.target.value)}
                  className="input input-sm input-bordered w-full font-mono"
                />
              </div>

              {(() => {
                const sh = Number(sellSharesInput) || 0;
                const sp = Number(sellPriceInput) || 0;
                const pnlUsd = (sp - partialSellPos.entry_price) * sh;
                const pnlPct =
                  partialSellPos.entry_price > 0
                    ? ((sp - partialSellPos.entry_price) / partialSellPos.entry_price) * 100
                    : 0;
                return (
                  <div className="bg-base-200/80 rounded-xl p-3 border border-base-300 flex justify-between items-center font-mono text-xs">
                    <span>Realized Profit on this Leg:</span>
                    <span className={`font-black ${pnlUsd >= 0 ? 'text-success' : 'text-error'}`}>
                      {pnlUsd >= 0 ? '+' : ''}{formatUsd(pnlUsd)} ({pnlPct >= 0 ? '+' : ''}{pnlPct.toFixed(2)}%)
                    </span>
                  </div>
                );
              })()}

              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setPartialSellPos(null)}
                  className="btn btn-sm btn-ghost"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={submittingTrade}
                  className="btn btn-sm btn-success font-bold"
                >
                  {submittingTrade ? 'Saving...' : 'Record Sale'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ════════════════════════════════════════════════════════════════
          MODAL 3: STOP HIT (CLOSE REMAINING SHARES AT STOP)
         ════════════════════════════════════════════════════════════════ */}
      {stopHitPos && (
        <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-base-100 border border-error/40 rounded-2xl max-w-md w-full p-5 shadow-2xl space-y-4">
            <div className="flex items-center justify-between border-b border-base-200 pb-3">
              <div>
                <h3 className="font-black text-lg text-error flex items-center gap-2">
                  <span>🛑 Stop Hit — Close {stopHitPos.symbol}</span>
                </h3>
                <p className="text-xs opacity-60">
                  Closes all remaining <b>{stopHitPos.remaining_shares} shares</b> and frees up your Risk Index.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setStopHitPos(null)}
                className="btn btn-ghost btn-xs btn-circle"
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleSubmitStopHit} className="space-y-3 text-xs">
              <div>
                <label className="block font-bold mb-1 opacity-75">Stop Execution Price ($)</label>
                <input
                  type="number"
                  step="0.01"
                  required
                  value={stopHitPriceInput}
                  onChange={(e) => setStopHitPriceInput(e.target.value)}
                  className="input input-sm input-bordered w-full font-mono border-error/40"
                />
              </div>

              {(() => {
                const sp = Number(stopHitPriceInput) || 0;
                const legPnl = (sp - stopHitPos.entry_price) * stopHitPos.remaining_shares;
                const netTotalPnl = (Number(stopHitPos.realized_pnl_usd) || 0) + legPnl;
                return (
                  <div className="bg-error/10 border border-error/25 rounded-xl p-3 space-y-1 font-mono text-xs">
                    <div className="flex justify-between">
                      <span>Stop Exit P&amp;L ({stopHitPos.remaining_shares} sh):</span>
                      <span className={legPnl >= 0 ? 'text-success font-bold' : 'text-error font-bold'}>
                        {legPnl >= 0 ? '+' : ''}{formatUsd(legPnl)}
                      </span>
                    </div>
                    <div className="flex justify-between border-t border-error/20 pt-1">
                      <span className="font-sans font-bold">Total Net Trade P&amp;L (incl. partials):</span>
                      <span className={netTotalPnl >= 0 ? 'text-success font-black' : 'text-error font-black'}>
                        {netTotalPnl >= 0 ? '+' : ''}{formatUsd(netTotalPnl)}
                      </span>
                    </div>
                  </div>
                );
              })()}

              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setStopHitPos(null)}
                  className="btn btn-sm btn-ghost"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={submittingTrade}
                  className="btn btn-sm btn-error font-bold"
                >
                  {submittingTrade ? 'Closing...' : 'Confirm Stop Hit & Close'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
