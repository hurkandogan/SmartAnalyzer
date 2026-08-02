'use client';

import { useState, useRef, useMemo } from 'react';
import useSWR from 'swr';
import { useAuth } from '@/context/AuthProvider';
import {
  addOptionAction,
  getOptionsAction,
  updateOptionAction,
  deleteOptionAction,
  getIBKRSummaryAction,
} from '@/actions/options';
import { OptionPosition, OptionType } from '@/types/options';
import {
  FiPlus,
  FiTrash2,
  FiEdit2,
  FiDollarSign,
  FiTrendingUp,
  FiTrendingDown,
  FiInfo,
  FiCalendar,
  FiChevronUp,
  FiChevronDown,
  FiX,
} from 'react-icons/fi';

const usdFormatter = new Intl.NumberFormat('en-US', {
  style: 'currency',
  currency: 'USD',
});

const OPTION_CONTRACT_SIZE = 100;

const isOptionClosed = (opt: OptionPosition) =>
  !!opt.buy_date && !!opt.sell_date;

// "YYYY-MM-DD" (Firestore) → "DD.MM.YYYY" (display)
const toDisplayDate = (iso: string) => {
  if (!iso) return '';
  const [y, m, d] = iso.split('-');
  if (!y || !m || !d) return iso;
  return `${d}.${m}.${y}`;
};

// "DD.MM.YYYY" (display) → "YYYY-MM-DD" (Firestore)
const toIsoDate = (display: string): string | null => {
  if (!display) return null;
  const parts = display.split('.');
  if (parts.length !== 3 || parts[2].length !== 4) return null;
  return `${parts[2]}-${parts[1]}-${parts[0]}`;
};

// Auto-insert dots while typing: DD.MM.YYYY — clamps day (01-31) and month (01-12)
const formatDateInput = (raw: string) => {
  const digits = raw.replace(/\D/g, '').slice(0, 8);

  let d = digits.slice(0, 2);
  let m = digits.slice(2, 4);
  const y = digits.slice(4, 8);

  // Clamp day to 01-31
  if (d.length === 2) {
    const dNum = parseInt(d, 10);
    if (dNum < 1) d = '01';
    else if (dNum > 31) d = '31';
  }

  // Clamp month to 01-12
  if (m.length === 2) {
    const mNum = parseInt(m, 10);
    if (mNum < 1) m = '01';
    else if (mNum > 12) m = '12';
  } else if (m.length === 1 && parseInt(m, 10) > 1) {
    // Single digit > 1 can never be a valid month tens digit, pad immediately
    m = '0' + m;
  }

  if (digits.length <= 2) return d;
  if (digits.length <= 4) return `${d}.${m}`;
  return `${d}.${m}.${y}`;
};

const calcPnl = (opt: OptionPosition) => {
  const qty = opt.quantity || 1;
  const buyPrice = opt.buy_price ?? 0;
  const sellPrice = opt.sell_price ?? 0;
  return (sellPrice - buyPrice) * qty * OPTION_CONTRACT_SIZE;
};

const calculateDTE = (expiryStr?: string | null) => {
  if (!expiryStr) return null;
  const parts = expiryStr.split('-');
  if (parts.length !== 3) return null;
  const expiryDate = new Date(
    parseInt(parts[0]),
    parseInt(parts[1]) - 1,
    parseInt(parts[2])
  );
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const diffTime = expiryDate.getTime() - today.getTime();
  const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
  return diffDays;
};

const getEarningsStatus = (earningsDateStr?: string | null) => {
  if (!earningsDateStr) return null;
  const parts = earningsDateStr.split('-');
  if (parts.length !== 3) return null;
  const earningsDate = new Date(
    parseInt(parts[0]),
    parseInt(parts[1]) - 1,
    parseInt(parts[2])
  );
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  
  const diffTime = earningsDate.getTime() - today.getTime();
  const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
  
  if (diffDays >= 0) {
    return {
      type: 'future' as const,
      days: diffDays,
      date: earningsDateStr
    };
  } else {
    return {
      type: 'past' as const,
      days: Math.abs(diffDays),
      date: earningsDateStr
    };
  }
};

const calculateChange = (opt: OptionPosition) => {
  const isClosed = isOptionClosed(opt);
  
  if (isClosed) {
    const buyPrice = opt.buy_price ?? 0;
    const abs = calcPnl(opt);
    const percent =
      buyPrice !== 0
        ? (((opt.sell_price ?? 0) - buyPrice) / buyPrice) * 100
        : 0;
    return { abs, percent };
  }

  // Open Option PnL calculation
  const curPrice = opt.current_price;
  if (curPrice === undefined || curPrice === null) {
    return { abs: 0, percent: 0 };
  }

  const qty = opt.quantity || 1;
  let abs = 0;
  let percent = 0;

  if (opt.type.startsWith('SELL')) {
    const sellPrice = opt.sell_price ?? 0;
    abs = (sellPrice - curPrice) * qty * OPTION_CONTRACT_SIZE;
    percent = sellPrice > 0 ? ((sellPrice - curPrice) / sellPrice) * 100 : 0;
  } else {
    const buyPrice = opt.buy_price ?? 0;
    abs = (curPrice - buyPrice) * qty * OPTION_CONTRACT_SIZE;
    percent = buyPrice > 0 ? ((curPrice - buyPrice) / buyPrice) * 100 : 0;
  }

  return { abs, percent };
};

export default function OptionManager() {
  const { user } = useAuth();
  const modalRef = useRef<HTMLDialogElement>(null);
  const infoModalRef = useRef<HTMLDialogElement>(null);

  const { data, mutate, isLoading } = useSWR(
    user ? ['options-data', user.uid] : null,
    async ([_, uid]) => {
      const [optionsData, summaryData] = await Promise.all([
        getOptionsAction(uid),
        getIBKRSummaryAction(uid)
      ]);
      return { options: optionsData, summary: summaryData };
    },
    { revalidateOnFocus: true }
  );

  const options = data?.options || [];
  const ibkrSummary = data?.summary || null;

  const [isSubmitting, setIsSubmitting] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [selectedSymbol, setSelectedSymbol] = useState<string>('');
  const [selectedType, setSelectedType] = useState<string>('');
  const [selectedStatus, setSelectedStatus] = useState<string>('');
  const [selectedOutcome, setSelectedOutcome] = useState<string>('');

  const availableSymbols = useMemo(() => {
    const syms = new Set(options.map((opt) => opt.symbol.toUpperCase()));
    return Array.from(syms).sort();
  }, [options]);

  const handleResetFilters = () => {
    setSelectedSymbol('');
    setSelectedType('');
    setSelectedStatus('');
    setSelectedOutcome('');
  };

  const [formData, setFormData] = useState({
    symbol: '',
    type: 'BUY_CALL' as OptionType,
    quantity: '1',
    buy_date: '',
    sell_date: '',
    buy_price: '',
    sell_price: '',
    target: '',
    note: '',
    strike_price: '',
    expiry_date: '',
  });


  const filteredOptions = useMemo(() => {
    let result = [...options];

    // 1. Ticker Filter
    if (selectedSymbol) {
      result = result.filter(
        (opt) => opt.symbol.toUpperCase() === selectedSymbol.toUpperCase(),
      );
    }

    // 2. Type Filter
    if (selectedType) {
      result = result.filter((opt) => opt.type === selectedType);
    }

    // 3. Status Filter
    if (selectedStatus) {
      result = result.filter((opt) =>
        selectedStatus === 'CLOSED' ? isOptionClosed(opt) : !isOptionClosed(opt),
      );
    }

    // 4. Outcome Filter
    if (selectedOutcome) {
      result = result.filter((opt) => {
        const { abs } = calculateChange(opt);
        return selectedOutcome === 'PROFIT' ? abs >= 0 : abs < 0;
      });
    }

    // 5. Default Sort: Open positions on top (DTE ascending), Closed positions below (most recent transaction first)
    result.sort((a, b) => {
      const aClosed = isOptionClosed(a);
      const bClosed = isOptionClosed(b);

      if (aClosed !== bClosed) {
        return aClosed ? 1 : -1; // Open on top
      }

      if (!aClosed) {
        const dteA = calculateDTE(a.expiry_date);
        const dteB = calculateDTE(b.expiry_date);

        if (dteA === null && dteB === null) return 0;
        if (dteA === null) return 1;
        if (dteB === null) return -1;

        return dteA - dteB;
      } else {
        const aDate =
          a.sell_date && a.buy_date
            ? a.sell_date > a.buy_date
              ? a.sell_date
              : a.buy_date
            : a.sell_date || a.buy_date || '';
        const bDate =
          b.sell_date && b.buy_date
            ? b.sell_date > b.buy_date
              ? b.sell_date
              : b.buy_date
            : b.sell_date || b.buy_date || '';

        return bDate.localeCompare(aDate); // Most recent transaction first
      }
    });

    return result;
  }, [options, selectedSymbol, selectedType, selectedStatus, selectedOutcome]);

  const stats = useMemo(() => {
    let totalOpenValue = 0;
    let totalPnL = 0;
    let totalTheta = 0;

    filteredOptions.forEach((opt) => {
      const qty = opt.quantity || 1;
      const buyPrice = opt.buy_price ?? 0;
      const sellPrice = opt.sell_price ?? 0;
      const entryPrice = opt.type.startsWith('BUY') ? buyPrice : sellPrice;

      const { abs } = calculateChange(opt);
      totalPnL += abs;

      if (!isOptionClosed(opt)) {
        totalOpenValue += entryPrice * qty * OPTION_CONTRACT_SIZE;
        if (opt.theta !== undefined && opt.theta !== null) {
          const contractTheta = opt.theta * qty * OPTION_CONTRACT_SIZE;
          if (opt.type.startsWith('SELL')) {
            // we are short, so we collect the decay (theta is negative, so we negate it)
            totalTheta += -contractTheta;
          } else {
            // we are long, we lose the decay
            totalTheta += contractTheta;
          }
        }
      }
    });

    return { totalOpenValue, totalPnL, totalTheta };
  }, [filteredOptions]);

  const roundToOne = (num: number) => Math.round(num * 10) / 10;

  const concentrationStats = useMemo(() => {
    const symbolMap: { [symbol: string]: number } = {};
    let totalOptionsValue = 0;

    options.forEach((opt) => {
      if (isOptionClosed(opt)) return;
      const qty = opt.quantity || 1;
      const currentPrice = opt.current_price ?? (opt.type.startsWith('BUY') ? opt.buy_price : opt.sell_price) ?? 0;
      const value = currentPrice * qty * OPTION_CONTRACT_SIZE;
      
      symbolMap[opt.symbol] = (symbolMap[opt.symbol] || 0) + value;
      totalOptionsValue += value;
    });

    const netLiq = ibkrSummary?.netLiquidation || 0;
    const highRiskTickers: { symbol: string; pct: number }[] = [];
    
    if (netLiq > 0) {
      Object.entries(symbolMap).forEach(([sym, val]) => {
        const pct = (val / netLiq) * 100;
        if (pct >= 15) {
          highRiskTickers.push({ symbol: sym, pct: roundToOne(pct) });
        }
      });
    }

    return { symbolMap, totalOptionsValue, highRiskTickers };
  }, [options, ibkrSummary]);

  const handleOpenModal = (opt?: OptionPosition) => {
    if (opt) {
      setEditingId(opt.id);
      setFormData({
        symbol: opt.symbol,
        type: opt.type,
        quantity: opt.quantity?.toString() || '1',
        buy_date: opt.buy_date ? toDisplayDate(opt.buy_date) : '',
        sell_date: opt.sell_date ? toDisplayDate(opt.sell_date) : '',
        buy_price: opt.buy_price?.toString() || '',
        sell_price: opt.sell_price?.toString() || '',
        target: opt.target || '',
        note: opt.note || '',
        strike_price: opt.strike_price?.toString() || '',
        expiry_date: opt.expiry_date ? toDisplayDate(opt.expiry_date) : '',
      });
    } else {
      setEditingId(null);
      setFormData({
        symbol: '',
        type: 'BUY_CALL',
        quantity: '1',
        buy_date: '',
        sell_date: '',
        buy_price: '',
        sell_price: '',
        target: '',
        note: '',
        strike_price: '',
        expiry_date: '',
      });
    }
    modalRef.current?.showModal();
  };

  const handleCloseModal = () => {
    modalRef.current?.close();
    setEditingId(null);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) return;
    setIsSubmitting(true);

    if (!formData.buy_date && !formData.sell_date) {
      alert('Please enter at least one date (Buy or Sell).');
      setIsSubmitting(false);
      return;
    }

    const payload: Omit<OptionPosition, 'id' | 'created_at'> = {
      symbol: formData.symbol.toUpperCase(),
      type: formData.type,
      quantity: parseFloat(formData.quantity) || 1,
      buy_date: toIsoDate(formData.buy_date),
      sell_date: toIsoDate(formData.sell_date),
      buy_price: formData.buy_price ? parseFloat(formData.buy_price) : null,
      sell_price: formData.sell_price ? parseFloat(formData.sell_price) : null,
      target: formData.target || (formData.strike_price && formData.expiry_date ? `${formData.strike_price}$ / ${formData.expiry_date}` : ''),
      note: formData.note,
      strike_price: formData.strike_price ? parseFloat(formData.strike_price) : null,
      expiry_date: toIsoDate(formData.expiry_date),
    };

    let res;
    if (editingId) {
      res = await updateOptionAction(user.uid, editingId, payload);
    } else {
      res = await addOptionAction(user.uid, payload);
    }

    if (res.success) {
      mutate();
      handleCloseModal();
    } else {
      alert('Error: ' + res.message);
    }
    setIsSubmitting(false);
  };

  const handleDelete = async (id: string) => {
    if (!user || !confirm('Are you sure?')) return;
    await deleteOptionAction(user.uid, id);
    mutate();
  };

  // Removed local calculateChange (moved outside component scope)

  if (isLoading) return <div className="skeleton h-96 w-full"></div>;

  return (
    <div className="space-y-8">
      <div className="flex flex-col items-center justify-between gap-4 md:flex-row">
        <div>
          <h1 className="text-3xl font-bold">Options</h1>
          <p className="text-base-content/70">
            Track your option trades and PnL
          </p>
        </div>
        <button
          className="btn btn-primary gap-2"
          onClick={() => handleOpenModal()}
        >
          <FiPlus /> Add Option
        </button>
      </div>

      {/* Filters Bar */}
      <div className="card bg-base-100/50 backdrop-blur-md border-base-content/5 border shadow p-4">
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-5 gap-4 items-end">
          {/* Ticker Filter */}
          <div className="flex flex-col gap-1.5">
            <label className="text-xs font-bold opacity-70">Ticker</label>
            <select
              className="select select-bordered select-sm w-full"
              value={selectedSymbol}
              onChange={(e) => setSelectedSymbol(e.target.value)}
            >
              <option value="">All Tickers</option>
              {availableSymbols.map((sym) => (
                <option key={sym} value={sym}>
                  {sym}
                </option>
              ))}
            </select>
          </div>

          {/* Type Filter */}
          <div className="flex flex-col gap-1.5">
            <label className="text-xs font-bold opacity-70">Type</label>
            <select
              className="select select-bordered select-sm w-full"
              value={selectedType}
              onChange={(e) => setSelectedType(e.target.value)}
            >
              <option value="">All Types</option>
              <option value="SELL_PUT">Sell Put (Short)</option>
              <option value="SELL_CALL">Sell Call (Short)</option>
              <option value="BUY_PUT">Buy Put (Long)</option>
              <option value="BUY_CALL">Buy Call (Long)</option>
            </select>
          </div>

          {/* Status Filter */}
          <div className="flex flex-col gap-1.5">
            <label className="text-xs font-bold opacity-70">Status</label>
            <select
              className="select select-bordered select-sm w-full"
              value={selectedStatus}
              onChange={(e) => setSelectedStatus(e.target.value)}
            >
              <option value="">All Statuses</option>
              <option value="OPEN">Open</option>
              <option value="CLOSED">Closed</option>
            </select>
          </div>

          {/* Outcome Filter */}
          <div className="flex flex-col gap-1.5">
            <label className="text-xs font-bold opacity-70">PnL Outcome</label>
            <select
              className="select select-bordered select-sm w-full"
              value={selectedOutcome}
              onChange={(e) => setSelectedOutcome(e.target.value)}
            >
              <option value="">All Outcomes</option>
              <option value="PROFIT">Profitable</option>
              <option value="LOSS">Loss-making</option>
            </select>
          </div>

          {/* Reset Filters */}
          <button
            className="btn btn-neutral btn-sm w-full"
            onClick={handleResetFilters}
          >
            Reset Filters
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
        <div className="stats bg-base-100/50 backdrop-blur-md border-base-content/5 border shadow">
          <div className="stat">
            <div className="stat-figure text-primary">
              <FiDollarSign size={32} />
            </div>
            <div className="stat-title">Open Position Value</div>
            <div className="stat-value text-3xl">
              {usdFormatter.format(stats.totalOpenValue)}
            </div>
          </div>
        </div>
        <div className="stats bg-base-100/50 backdrop-blur-md border-base-content/5 border shadow">
          <div className="stat">
            <div className="stat-figure text-secondary">
              {stats.totalPnL >= 0 ? (
                <FiTrendingUp size={32} className="text-success" />
              ) : (
                <FiTrendingDown size={32} className="text-error" />
              )}
            </div>
            <div className="stat-title">Total PnL</div>
            <div
              className="stat-value text-3xl"
              style={{ color: stats.totalPnL >= 0 ? '#22c55e' : '#ef4444' }}
            >
              {(stats.totalPnL >= 0 ? '+' : '') +
                usdFormatter.format(stats.totalPnL)}
            </div>
          </div>
        </div>
        <div className="stats bg-base-100/50 backdrop-blur-md border-base-content/5 border shadow">
          <div className="stat">
            <div className="stat-figure text-accent">
              <FiTrendingUp size={32} className="text-accent" />
            </div>
            <div className="stat-title">Daily Theta Decay (Kira)</div>
            <div className="stat-value text-3xl text-accent">
              {(stats.totalTheta >= 0 ? '+' : '') +
                usdFormatter.format(stats.totalTheta)}/gün
            </div>
          </div>
        </div>
      </div>

      {concentrationStats.highRiskTickers.length > 0 && (
        <div className="alert alert-error bg-error/10 text-error border-error/20 shadow flex flex-col items-start gap-2 md:flex-row md:items-center md:justify-between py-3">
          <div className="flex items-center gap-2">
            <span className="text-xl">🚨</span>
            <div className="flex flex-col">
              <span className="font-bold text-sm">Yüksek Yoğunlaşma Riski</span>
              <span className="text-xs opacity-90">
                Açık opsiyon pozisyonları toplam Net Likidasyon değerinizin %15'ini aşmaktadır:
              </span>
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            {concentrationStats.highRiskTickers.map((ticker) => (
              <span key={ticker.symbol} className="badge badge-error text-xs font-bold px-2 py-1 leading-none">
                {ticker.symbol}: %{ticker.pct}
              </span>
            ))}
          </div>
        </div>
      )}

      <div className="card bg-base-100/50 backdrop-blur-md border-base-content/5 border shadow-xl">
        <div className="overflow-x-auto">
          <table className="table">
            <thead>
              <tr className="bg-base-200/50">
                <th className="whitespace-nowrap select-none">Dates</th>
                <th className="whitespace-nowrap select-none">Type & Symbol</th>
                <th className="text-right whitespace-nowrap select-none">Qty</th>
                <th className="whitespace-nowrap select-none">Strike &amp; Expiry</th>
                <th className="whitespace-nowrap select-none">Live Greeks</th>
                <th className="text-right whitespace-nowrap select-none text-xs">Margin & AROC</th>
                <th className="text-right text-xs whitespace-nowrap select-none">Prices (B/S)</th>
                <th className="text-right whitespace-nowrap select-none">PnL / Change</th>
                <th className="text-right">Actions</th>
              </tr>
            </thead>
            <tbody>
              {filteredOptions.map((opt) => {
                const { abs, percent } = calculateChange(opt);
                const isClosed = isOptionClosed(opt);
                const rowBg = isClosed
                  ? abs >= 0
                    ? 'bg-success/5'
                    : 'bg-error/5'
                  : '';

                return (
                  <tr
                    key={opt.id}
                    className={`${rowBg} hover:bg-base-200/40 transition-colors`}
                  >
                    <td className="py-1 text-[10px]">
                      <div className="flex min-w-[85px] flex-col gap-0.5">
                        {opt.type.startsWith('BUY') ? (
                          <>
                            <span className="flex items-center gap-1">
                              <span className="badge badge-xs badge-info h-3 min-h-0 px-0.5 text-[8px]">
                                B
                              </span>{' '}
                              {opt.buy_date || '-'}
                            </span>
                            <span className="flex items-center gap-1 opacity-70">
                              <span className="badge badge-xs badge-warning h-3 min-h-0 px-0.5 text-[8px]">
                                S
                              </span>{' '}
                              {opt.sell_date || '-'}
                            </span>
                          </>
                        ) : (
                          <>
                            <span className="flex items-center gap-1">
                              <span className="badge badge-xs badge-warning h-3 min-h-0 px-0.5 text-[8px]">
                                S
                              </span>{' '}
                              {opt.sell_date || '-'}
                            </span>
                            <span className="flex items-center gap-1 opacity-70">
                              <span className="badge badge-xs badge-info h-3 min-h-0 px-0.5 text-[8px]">
                                B
                              </span>{' '}
                              {opt.buy_date || '-'}
                            </span>
                          </>
                        )}
                      </div>
                    </td>
                    <td>
                      <div className="flex flex-col">
                        <span
                          className={`text-[10px] font-bold ${opt.type.startsWith('BUY') ? 'text-primary' : 'text-secondary'}`}
                        >
                          {opt.type}
                        </span>
                        <div className="flex items-center gap-1.5">
                          <span className="font-bold">{opt.symbol}</span>
                          {(() => {
                            const netLiq = ibkrSummary?.netLiquidation || 0;
                            if (netLiq > 0) {
                              const val = concentrationStats.symbolMap[opt.symbol] || 0;
                              const pct = (val / netLiq) * 100;
                              if (pct >= 15) {
                                return (
                                  <span className="badge badge-error badge-xs font-mono text-[9px] h-4 leading-none" title={`Hisse Yoğunlaşması: %${pct.toFixed(1)} NL`}>
                                    🚨 %{pct.toFixed(0)}
                                  </span>
                                );
                              }
                            }
                            return null;
                          })()}
                        </div>
                      </div>
                    </td>
                    <td className="text-right font-mono text-sm">
                      {opt.quantity || 1}
                    </td>
                    {/* Strike & Expiry / DTE */}
                    <td>
                      <div className="flex flex-col">
                        <div className="flex items-center gap-1.5">
                          <span className="text-sm font-semibold">
                            {opt.strike_price ? `$${opt.strike_price}` : (opt.target || '-')}
                          </span>
                          {!isClosed && opt.expiry_date && (
                            (() => {
                              const dte = calculateDTE(opt.expiry_date);
                              if (dte === null) return null;
                              const badgeColor = dte <= 14 ? 'badge-error' : dte <= 21 ? 'badge-warning' : 'badge-success';
                              return (
                                <span className={`badge ${badgeColor} badge-xs font-bold font-mono h-4 min-h-4 px-1.5 inline-flex items-center justify-center leading-none`}>
                                  {dte} DTE
                                </span>
                              );
                            })()
                          )}
                        </div>
                        {opt.expiry_date && (
                          <span className="text-[10px] opacity-75">
                            Exp: {toDisplayDate(opt.expiry_date)}
                          </span>
                        )}
                        {!isClosed && (() => {
                          const status = getEarningsStatus(opt.earnings_date);
                          if (!status) return null;
                          if (status.type === 'future') {
                            const isClose = status.days <= 7;
                            const collision = opt.expiry_date ? new Date(opt.expiry_date) >= new Date(status.date) : false;
                            return (
                              <span className={`text-[9px] font-semibold flex items-center gap-0.5 mt-0.5 ${collision ? 'text-error animate-pulse' : isClose ? 'text-warning' : 'text-success'}`}>
                                ⚠️ Bilanço: {status.days} gün {collision ? '(Çakışma!)' : 'kaldı'}
                              </span>
                            );
                          } else {
                            return (
                              <span className="text-[9px] opacity-40 mt-0.5">
                                📅 Önceki Bilanço: {toDisplayDate(status.date)}
                              </span>
                            );
                          }
                        })()}
                        {opt.note && (
                          <span className="text-[10px] italic opacity-50 truncate max-w-[150px]" title={opt.note}>
                            {opt.note}
                          </span>
                        )}
                      </div>
                    </td>
 
                    {/* Live Greeks */}
                    <td>
                      {!isClosed && (opt.delta !== undefined && opt.delta !== null) ? (
                        <div className="flex flex-col text-[11px] font-mono gap-0.5 leading-none">
                          <span 
                            className={Math.abs(opt.delta) >= 0.5 ? 'text-error font-bold' : 'text-success'}
                            title="Delta: Hisse fiyatındaki 1$'lık değişime karşılık opsiyon primindeki değişim oranı."
                          >
                            Δ: {opt.delta.toFixed(2)}
                          </span>
                          <span 
                            className="text-info"
                            title="Theta: Opsiyonun zamana bağlı günlük değer kaybı (Zaman Erimesi)."
                          >
                            θ: {opt.theta ? opt.theta.toFixed(1) : '-'}
                          </span>
                          <span 
                            className="opacity-60 text-[10px] flex items-center gap-1"
                            title="Implied Volatility (Zımni Oynaklık): Piyasanın hisse senedinde beklediği oynaklık derecesi."
                          >
                            IV: {opt.iv ? `${(opt.iv * 100).toFixed(0)}%` : '-'}
                            {opt.iv_rank !== undefined && opt.iv_rank !== null && (
                              <span 
                                className={`badge badge-xs ${opt.iv_rank >= 50 ? 'badge-success text-success-content' : 'badge-ghost opacity-70'} leading-none px-1 text-[8px] h-3.5`}
                                title="IV Rank: Mevcut IV değerinin son 1 yıllık geçmiş IV aralığındaki yüzdesel derecesi."
                              >
                                {opt.iv_rank.toFixed(0)}%R
                              </span>
                            )}
                          </span>
                        </div>
                      ) : (
                        <span className="text-xs opacity-40">-</span>
                      )}
                    </td>
                    {/* ROC & Margin */}
                    <td className="text-right font-mono text-[11px] leading-tight">
                      {!isClosed && opt.margin_required ? (
                        <div className="flex flex-col gap-0.5 items-end">
                          <span className="text-base-content/80" title="Tahmini Bağlanan Teminat (Cash Secured)">
                            ${opt.margin_required.toLocaleString(undefined, { maximumFractionDigits: 0 })}
                          </span>
                          {opt.aroc !== undefined && opt.aroc !== null && (
                            <span 
                              className={`font-bold ${opt.aroc >= 20 ? 'text-success' : opt.aroc >= 10 ? 'text-warning' : 'text-error'}`}
                              title="Annualized Return on Capital (Yıllıklandırılmış Getiri)"
                            >
                              %{opt.aroc.toFixed(1)}
                            </span>
                          )}
                        </div>
                      ) : (
                        <span className="opacity-40">-</span>
                      )}
                    </td>

                    <td className="text-right font-mono text-sm">
                      <div className="flex flex-col">
                        <span className="text-info">
                          B:{' '}
                          {opt.buy_price
                            ? usdFormatter.format(opt.buy_price)
                            : '-'}
                        </span>
                        <span className="text-warning">
                          S:{' '}
                          {opt.sell_price
                            ? usdFormatter.format(opt.sell_price)
                            : '-'}
                        </span>
                      </div>
                    </td>
                    <td className="text-right font-mono">
                      {isClosed ? (
                        <div className="flex flex-col">
                          <span
                            className={`font-bold ${abs >= 0 ? 'text-success' : 'text-error'}`}
                          >
                            {abs >= 0 ? '+' : ''}
                            {usdFormatter.format(abs)}
                          </span>
                          <span
                            className={`text-xs ${abs >= 0 ? 'text-success' : 'text-error'}`}
                          >
                            {abs >= 0 ? '+' : ''}
                            {percent.toFixed(2)}%
                          </span>
                        </div>
                      ) : (
                        <div className="flex flex-col items-end gap-1">
                          {opt.current_price !== undefined && opt.current_price !== null ? (
                            <>
                              <span
                                className={`font-semibold text-xs ${abs >= 0 ? 'text-success' : 'text-error'}`}
                                title={`Current Price: $${opt.current_price}`}
                              >
                                {abs >= 0 ? '+' : ''}
                                {usdFormatter.format(abs)}
                              </span>
                              <span
                                className={`text-[10px] ${abs >= 0 ? 'text-success' : 'text-error'}`}
                              >
                                {abs >= 0 ? '+' : ''}
                                {percent.toFixed(1)}%
                              </span>
                              {percent >= 50 && (
                                <span className="badge badge-success badge-xs font-bold h-4 min-h-4 px-1.5 text-[9px] whitespace-nowrap animate-pulse inline-flex items-center justify-center leading-none">
                                  Kâr Al (%{percent.toFixed(0)})
                                </span>
                              )}
                            </>
                          ) : (
                            <span className="badge badge-ghost badge-sm text-xs italic">
                              Open
                            </span>
                          )}
                        </div>
                      )}
                    </td>
                    <td className="text-right">
                      <button
                        onClick={() => handleOpenModal(opt)}
                        className="btn btn-ghost btn-xs text-primary mr-1"
                        title="Edit"
                      >
                        <FiEdit2 />
                      </button>
                      <button
                        onClick={() => handleDelete(opt.id)}
                        className="btn btn-ghost btn-xs text-error"
                        title="Delete"
                      >
                        <FiTrash2 />
                      </button>
                    </td>
                  </tr>
                );
              })}
              {filteredOptions.length === 0 && (
                <tr>
                  <td colSpan={8} className="py-8 text-center opacity-50">
                    No options found matching the criteria.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      <dialog
        ref={modalRef}
        className="modal modal-bottom sm:modal-middle backdrop-blur-sm"
      >
        <div className="modal-box max-w-2xl">
          <h3 className="mb-6 flex items-center gap-2 text-xl font-bold">
            {editingId ? (
              <FiEdit2 className="text-primary" />
            ) : (
              <FiPlus className="text-primary" />
            )}
            {editingId ? 'Edit Option Position' : 'Add New Option Position'}
          </h3>

          <form onSubmit={handleSubmit} className="space-y-3">
            {/* Symbol */}
            <div className="flex items-center gap-4">
              <label className="w-32 shrink-0 text-sm font-bold">
                Symbol <span className="text-error">*</span>
              </label>
              <input
                type="text"
                className="input input-bordered flex-1 uppercase"
                placeholder="e.g. SPY 450C"
                required
                value={formData.symbol}
                onChange={(e) =>
                  setFormData({ ...formData, symbol: e.target.value })
                }
              />
            </div>

            {/* Option Type */}
            <div className="flex items-center gap-4">
              <label className="w-32 shrink-0 text-sm font-bold">Type</label>
              <select
                className="select select-bordered flex-1"
                value={formData.type}
                onChange={(e) =>
                  setFormData({
                    ...formData,
                    type: e.target.value as OptionType,
                  })
                }
              >
                <option value="BUY_CALL">Buy Call (Long)</option>
                <option value="BUY_PUT">Buy Put (Long)</option>
                <option value="SELL_CALL">Sell Call (Short)</option>
                <option value="SELL_PUT">Sell Put (Short)</option>
              </select>
            </div>

            {/* Quantity */}
            <div className="flex items-center gap-4">
              <label className="w-32 shrink-0 text-sm font-bold">
                Quantity <span className="text-error">*</span>
              </label>
              <input
                type="text"
                inputMode="numeric"
                className="input input-bordered flex-1 font-mono"
                required
                placeholder="1"
                value={formData.quantity}
                onChange={(e) => {
                  if (/^\d*$/.test(e.target.value))
                    setFormData({ ...formData, quantity: e.target.value });
                }}
              />
            </div>

            <div className="divider my-1 text-xs opacity-40">
              Prices &amp; Dates
            </div>

            {/* Buy Date */}
            <div className="flex items-center gap-4">
              <label className="text-info w-32 shrink-0 text-sm font-bold">
                Buy Date <span className="text-error">*</span>
              </label>
              <div className="flex flex-1 gap-2">
                <input
                  type="text"
                  inputMode="numeric"
                  className="input input-bordered flex-1 font-mono"
                  placeholder="DD.MM.YYYY"
                  maxLength={10}
                  value={formData.buy_date}
                  onChange={(e) =>
                    setFormData({
                      ...formData,
                      buy_date: formatDateInput(e.target.value),
                    })
                  }
                />
                {formData.buy_date && (
                  <button
                    type="button"
                    className="btn btn-ghost btn-sm btn-square"
                    onClick={() => setFormData({ ...formData, buy_date: '' })}
                  >
                    <FiX />
                  </button>
                )}
              </div>
            </div>

            {/* Buy Price */}
            <div className="flex items-center gap-4">
              <label className="text-info w-32 shrink-0 text-sm font-bold">
                Buy Price
              </label>
              <input
                type="text"
                inputMode="decimal"
                className="input input-bordered flex-1 font-mono"
                placeholder="0.00"
                value={formData.buy_price}
                onChange={(e) => {
                  if (/^\d*\.?\d*$/.test(e.target.value))
                    setFormData({ ...formData, buy_price: e.target.value });
                }}
              />
            </div>

            {/* Sell Date */}
            <div className="flex items-center gap-4">
              <label className="text-warning w-32 shrink-0 text-sm font-bold">
                Sell Date <span className="text-error">*</span>
              </label>
              <div className="flex flex-1 gap-2">
                <input
                  type="text"
                  inputMode="numeric"
                  className="input input-bordered flex-1 font-mono"
                  placeholder="DD.MM.YYYY"
                  maxLength={10}
                  value={formData.sell_date}
                  onChange={(e) =>
                    setFormData({
                      ...formData,
                      sell_date: formatDateInput(e.target.value),
                    })
                  }
                />
                {formData.sell_date && (
                  <button
                    type="button"
                    className="btn btn-ghost btn-sm btn-square"
                    onClick={() => setFormData({ ...formData, sell_date: '' })}
                  >
                    <FiX />
                  </button>
                )}
              </div>
            </div>

            {/* Sell Price */}
            <div className="flex items-center gap-4">
              <label className="text-warning w-32 shrink-0 text-sm font-bold">
                Sell Price
              </label>
              <input
                type="text"
                inputMode="decimal"
                className="input input-bordered flex-1 font-mono"
                placeholder="0.00"
                value={formData.sell_price}
                onChange={(e) => {
                  if (/^\d*\.?\d*$/.test(e.target.value))
                    setFormData({ ...formData, sell_price: e.target.value });
                }}
              />
            </div>

            <div className="divider my-1 text-xs opacity-40">
              Option Parameters
            </div>

            {/* Strike Price */}
            <div className="flex items-center gap-4">
              <label className="w-32 shrink-0 text-sm font-bold">
                Strike Price
              </label>
              <input
                type="text"
                inputMode="decimal"
                className="input input-bordered flex-1 font-mono"
                placeholder="0.00"
                value={formData.strike_price}
                onChange={(e) => {
                  if (/^\d*\.?\d*$/.test(e.target.value))
                    setFormData({ ...formData, strike_price: e.target.value });
                }}
              />
            </div>

            {/* Expiry Date */}
            <div className="flex items-center gap-4">
              <label className="w-32 shrink-0 text-sm font-bold">
                Expiry Date
              </label>
              <div className="flex flex-1 gap-2">
                <input
                  type="text"
                  inputMode="numeric"
                  className="input input-bordered flex-1 font-mono"
                  placeholder="DD.MM.YYYY"
                  maxLength={10}
                  value={formData.expiry_date}
                  onChange={(e) =>
                    setFormData({
                      ...formData,
                      expiry_date: formatDateInput(e.target.value),
                    })
                  }
                />
                {formData.expiry_date && (
                  <button
                    type="button"
                    className="btn btn-ghost btn-sm btn-square"
                    onClick={() => setFormData({ ...formData, expiry_date: '' })}
                  >
                    <FiX />
                  </button>
                )}
              </div>
            </div>

            {/* Target */}
            <div className="flex items-center gap-4">
              <label className="w-32 shrink-0 text-sm font-bold">Target</label>
              <input
                type="text"
                className="input input-bordered flex-1"
                placeholder="e.g. 2.50 or break even at 440"
                value={formData.target}
                onChange={(e) =>
                  setFormData({ ...formData, target: e.target.value })
                }
              />
            </div>

            {/* Note */}
            <div className="flex items-start gap-4">
              <label className="w-32 shrink-0 pt-3 text-sm font-bold">
                Note
              </label>
              <textarea
                className="textarea textarea-bordered h-20 flex-1"
                placeholder="Trade plan, reasons, etc."
                value={formData.note}
                onChange={(e) =>
                  setFormData({ ...formData, note: e.target.value })
                }
              ></textarea>
            </div>

            <p className="text-xs opacity-50">
              <span className="text-error">*</span> At least one of Buy Date or
              Sell Date is required.
            </p>

            <div className="modal-action">
              <button
                type="button"
                className="btn btn-ghost"
                onClick={handleCloseModal}
              >
                Cancel
              </button>
              <button
                type="submit"
                className="btn btn-primary px-8"
                disabled={isSubmitting}
              >
                {isSubmitting && (
                  <span className="loading loading-spinner"></span>
                )}
                {editingId ? 'Save Changes' : 'Open Trade'}
              </button>
            </div>
          </form>
        </div>
        <form method="dialog" className="modal-backdrop">
          <button type="button" onClick={handleCloseModal}>
            close
          </button>
        </form>
      </dialog>
    </div>
  );
}
