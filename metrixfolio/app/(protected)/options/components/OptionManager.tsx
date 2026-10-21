'use client';

import React, { useState, useRef, useMemo } from 'react';
import useSWR from 'swr';
import { useAuth } from '@/context/AuthProvider';
import {
  addOptionAction,
  getOptionsAction,
  updateOptionAction,
  deleteOptionAction,
  getIBKRSummaryAction,
  groupOptionsStrategyAction,
  ungroupOptionsStrategyAction,
} from '@/actions/options';
import { OptionPosition, OptionType, OptionCloseType } from '@/types/options';
import {
  FiPlus,
  FiTrash2,
  FiEdit2,
  FiDollarSign,
  FiTrendingUp,
  FiTrendingDown,
  FiChevronRight,
  FiChevronDown,
  FiLink,
  FiUnlock,
  FiPackage,
  FiX,
} from 'react-icons/fi';

const usdFormatter = new Intl.NumberFormat('en-US', {
  style: 'currency',
  currency: 'USD',
});

const OPTION_CONTRACT_SIZE = 100;

const cleanSymbol = (s?: string) => (s ? s.trim().split(/\s+/)[0].toUpperCase() : '');

const isOptionAssigned = (opt: OptionPosition) =>
  opt.close_type === 'ASSIGNED' || Boolean(opt.is_assigned);

const isOptionClosed = (opt: OptionPosition) =>
  (!!opt.buy_date && !!opt.sell_date) || isOptionAssigned(opt);

// Returns the latest transaction date ("YYYY-MM-DD") between buy_date and sell_date
const getLastTxDate = (opt: OptionPosition): string => {
  if (opt.buy_date && opt.sell_date) {
    return opt.sell_date > opt.buy_date ? opt.sell_date : opt.buy_date;
  }
  return opt.sell_date || opt.buy_date || '';
};

const MONTH_NAMES: Record<string, string> = {
  '01': 'January',
  '02': 'February',
  '03': 'March',
  '04': 'April',
  '05': 'May',
  '06': 'June',
  '07': 'July',
  '08': 'August',
  '09': 'September',
  '10': 'October',
  '11': 'November',
  '12': 'December',
};

const formatYearMonthLabel = (ym: string): string => {
  if (!ym || ym === 'UNKNOWN') return 'No Date';
  const [y, m] = ym.split('-');
  if (!y || !m) return ym;
  return `${MONTH_NAMES[m] || m} ${y}`;
};

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

  if (d.length === 2) {
    const dNum = parseInt(d, 10);
    if (dNum < 1) d = '01';
    else if (dNum > 31) d = '31';
  }

  if (m.length === 2) {
    const mNum = parseInt(m, 10);
    if (mNum < 1) m = '01';
    else if (mNum > 12) m = '12';
  } else if (m.length === 1 && parseInt(m, 10) > 1) {
    m = '0' + m;
  }

  if (digits.length <= 2) return d;
  if (digits.length <= 4) return `${d}.${m}`;
  return `${d}.${m}.${y}`;
};

const calcPnl = (opt: OptionPosition) => {
  // If option was assigned/exercised, its premium is embedded into the stock's cost basis or sale price.
  // Therefore its standalone option PnL must be 0 to avoid double-counting!
  if (isOptionAssigned(opt)) {
    return 0;
  }
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
    parseInt(parts[2]),
  );
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const diffTime = expiryDate.getTime() - today.getTime();
  return Math.ceil(diffTime / (1000 * 60 * 60 * 24));
};

const getEarningsStatus = (earningsDateStr?: string | null) => {
  if (!earningsDateStr) return null;
  const parts = earningsDateStr.split('-');
  if (parts.length !== 3) return null;
  const earningsDate = new Date(
    parseInt(parts[0]),
    parseInt(parts[1]) - 1,
    parseInt(parts[2]),
  );
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const diffTime = earningsDate.getTime() - today.getTime();
  const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));

  if (diffDays >= 0) {
    return {
      type: 'future' as const,
      days: diffDays,
      date: earningsDateStr,
    };
  } else {
    return {
      type: 'past' as const,
      days: Math.abs(diffDays),
      date: earningsDateStr,
    };
  }
};

const calculateChange = (opt: OptionPosition) => {
  if (isOptionAssigned(opt)) {
    const qty = opt.quantity || 1;
    const entryPremium = opt.type.startsWith('SELL')
      ? (opt.sell_price ?? 0) * qty * OPTION_CONTRACT_SIZE
      : (opt.buy_price ?? 0) * qty * OPTION_CONTRACT_SIZE;
    return { abs: 0, percent: 0, isAssigned: true, transferredPremium: entryPremium };
  }

  const isClosed = isOptionClosed(opt);

  if (isClosed) {
    const buyPrice = opt.buy_price ?? 0;
    const sellPrice = opt.sell_price ?? 0;
    const abs = calcPnl(opt);
    const denom = opt.type.startsWith('SELL') ? sellPrice : buyPrice;
    const percent = denom !== 0 ? ((sellPrice - buyPrice) / denom) * 100 : 0;
    return { abs, percent, isAssigned: false, transferredPremium: 0 };
  }

  // Open Option PnL calculation
  const curPrice = opt.current_price;
  if (curPrice === undefined || curPrice === null) {
    return { abs: 0, percent: 0, isAssigned: false, transferredPremium: 0 };
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

  return { abs, percent, isAssigned: false, transferredPremium: 0 };
};

interface StrategyGroupItem {
  kind: 'group';
  groupId: string;
  strategyName: string;
  symbol: string;
  legs: OptionPosition[];
  isClosed: boolean;
  expiry_date: string | null;
  lastTxDate: string;
  totalAbsPnl: number;
  netCreditOrDebit: number;
  netDelta: number;
  netTheta: number;
  totalMargin: number;
  combinedAroc: number;
}

interface SingleOptionItem {
  kind: 'single';
  opt: OptionPosition;
  lastTxDate: string;
}

type DisplayRow = StrategyGroupItem | SingleOptionItem;

const STRATEGY_PRESETS = [
  'Bull Put Spread',
  'Bear Call Spread',
  'Bull Call Spread',
  'Bear Put Spread',
  'Iron Condor',
  'Short Strangle / Straddle',
  'Diagonal / PMCC',
  'Rollover / Adjusted',
  'Custom Strategy',
];

export default function OptionManager() {
  const { user } = useAuth();
  const modalRef = useRef<HTMLDialogElement>(null);

  const { data, mutate, isLoading } = useSWR(
    user ? ['options-data', user.uid] : null,
    async ([_, uid]) => {
      const [optionsData, summaryData] = await Promise.all([
        getOptionsAction(uid),
        getIBKRSummaryAction(uid),
      ]);
      return { options: optionsData, summary: summaryData };
    },
    { revalidateOnFocus: true },
  );

  const options = data?.options || [];
  const ibkrSummary = data?.summary || null;

  const [isSubmitting, setIsSubmitting] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [selectedSymbol, setSelectedSymbol] = useState<string>('');
  const [selectedType, setSelectedType] = useState<string>('');
  const [selectedStatus, setSelectedStatus] = useState<string>('');
  const [selectedOutcome, setSelectedOutcome] = useState<string>('');
  const [selectedYear, setSelectedYear] = useState<string>('');
  const [selectedMonth, setSelectedMonth] = useState<string>('');
  const [sortBy, setSortBy] = useState<'DEFAULT' | 'TX_DESC' | 'TX_ASC'>('DEFAULT');

  // Multi-leg selection & collapsible state
  const [selectedLegIds, setSelectedLegIds] = useState<string[]>([]);
  const [strategyNameInput, setStrategyNameInput] = useState<string>('Bull Put Spread');
  const [expandedGroups, setExpandedGroups] = useState<Record<string, boolean>>({});

  const availableSymbols = useMemo(() => {
    const syms = new Set(options.map((opt) => cleanSymbol(opt.symbol)).filter(Boolean));
    return Array.from(syms).sort();
  }, [options]);

  const availableYears = useMemo(() => {
    const startYear = 2025;
    const maxYear = new Date().getFullYear() + 1;
    const years = new Set<string>();

    for (let y = startYear; y <= maxYear; y++) {
      years.add(String(y));
    }

    options.forEach((opt) => {
      const lastDate = getLastTxDate(opt);
      if (lastDate && lastDate.length >= 4) {
        years.add(lastDate.slice(0, 4));
      }
    });

    return Array.from(years).sort((a, b) => b.localeCompare(a));
  }, [options]);

  const handleResetFilters = () => {
    setSelectedSymbol('');
    setSelectedType('');
    setSelectedStatus('');
    setSelectedOutcome('');
    setSelectedYear('');
    setSelectedMonth('');
    setSortBy('DEFAULT');
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
    close_type: 'NORMAL' as OptionCloseType,
    strategy_name: '',
  });

  // Filters based on Symbol, Type, Status, Outcome (without Year/Month filter so breakdown pills can show all years)
  const baseFilteredOptions = useMemo(() => {
    let result = [...options];

    if (selectedSymbol) {
      result = result.filter(
        (opt) => cleanSymbol(opt.symbol) === cleanSymbol(selectedSymbol),
      );
    }

    if (selectedType) {
      result = result.filter((opt) => opt.type === selectedType);
    }

    if (selectedStatus) {
      if (selectedStatus === 'ASSIGNED') {
        result = result.filter((opt) => isOptionAssigned(opt));
      } else {
        result = result.filter((opt) =>
          selectedStatus === 'CLOSED' ? isOptionClosed(opt) : !isOptionClosed(opt),
        );
      }
    }

    if (selectedOutcome) {
      result = result.filter((opt) => {
        if (selectedOutcome === 'ASSIGNED') return isOptionAssigned(opt);
        const { abs, isAssigned } = calculateChange(opt);
        if (isAssigned) return false;
        return selectedOutcome === 'PROFIT' ? abs >= 0 : abs < 0;
      });
    }

    return result;
  }, [options, selectedSymbol, selectedType, selectedStatus, selectedOutcome]);

  const filteredOptions = useMemo(() => {
    let result = [...baseFilteredOptions];

    if (selectedYear) {
      result = result.filter((opt) => {
        const lastDate = getLastTxDate(opt);
        return lastDate.startsWith(selectedYear);
      });
    }

    if (selectedMonth) {
      result = result.filter((opt) => {
        const lastDate = getLastTxDate(opt);
        return lastDate.length >= 7 && lastDate.slice(5, 7) === selectedMonth;
      });
    }

    result.sort((a, b) => {
      const aDate = getLastTxDate(a);
      const bDate = getLastTxDate(b);

      if (sortBy === 'TX_DESC') {
        return bDate.localeCompare(aDate);
      }
      if (sortBy === 'TX_ASC') {
        return aDate.localeCompare(bDate);
      }

      // DEFAULT: Open positions at the top (sorted by DTE), Closed positions sorted by Last Tx Date (newest first)
      const aClosed = isOptionClosed(a);
      const bClosed = isOptionClosed(b);

      if (aClosed !== bClosed) {
        return aClosed ? 1 : -1;
      }

      if (!aClosed) {
        const dteA = calculateDTE(a.expiry_date);
        const dteB = calculateDTE(b.expiry_date);

        if (dteA === null && dteB === null) return bDate.localeCompare(aDate);
        if (dteA === null) return 1;
        if (dteB === null) return -1;

        return dteA - dteB;
      } else {
        return bDate.localeCompare(aDate);
      }
    });

    return result;
  }, [baseFilteredOptions, selectedYear, selectedMonth, sortBy]);

  // Build display rows (grouping multi-leg strategies that share group_id)
  const displayRows = useMemo<DisplayRow[]>(() => {
    const groupsMap = new Map<string, OptionPosition[]>();
    for (const opt of filteredOptions) {
      if (opt.group_id) {
        if (!groupsMap.has(opt.group_id)) groupsMap.set(opt.group_id, []);
        groupsMap.get(opt.group_id)!.push(opt);
      }
    }

    const seenGroups = new Set<string>();
    const rows: DisplayRow[] = [];

    for (const opt of filteredOptions) {
      if (opt.group_id && (groupsMap.get(opt.group_id)?.length || 0) >= 2) {
        if (seenGroups.has(opt.group_id)) continue;
        seenGroups.add(opt.group_id);

        const legs = groupsMap.get(opt.group_id)!;
        const allClosed = legs.every((l) => isOptionClosed(l));
        let totalAbsPnl = 0;
        let netCreditOrDebit = 0;
        let netDelta = 0;
        let netTheta = 0;

        for (const l of legs) {
          const qty = l.quantity || 1;
          const { abs } = calculateChange(l);
          totalAbsPnl += abs;

          if (l.type.startsWith('SELL')) {
            netCreditOrDebit += (l.sell_price ?? 0) * qty * OPTION_CONTRACT_SIZE;
            if (l.delta != null) netDelta += -l.delta * qty;
            if (l.theta != null) netTheta += -l.theta * qty * OPTION_CONTRACT_SIZE;
          } else {
            netCreditOrDebit -= (l.buy_price ?? 0) * qty * OPTION_CONTRACT_SIZE;
            if (l.delta != null) netDelta += l.delta * qty;
            if (l.theta != null) netTheta += l.theta * qty * OPTION_CONTRACT_SIZE;
          }
        }

        // Calculate true spread margin if not already set accurately on legs
        let totalMargin = 0;
        const sellPut = legs.find((l) => l.type === 'SELL_PUT');
        const buyPut = legs.find((l) => l.type === 'BUY_PUT');
        const sellCall = legs.find((l) => l.type === 'SELL_CALL');
        const buyCall = legs.find((l) => l.type === 'BUY_CALL');

        let putSpreadMargin = 0;
        if (sellPut && buyPut && sellPut.strike_price && buyPut.strike_price) {
          const width = Math.abs(sellPut.strike_price - buyPut.strike_price);
          const qty = sellPut.quantity || 1;
          putSpreadMargin = width * OPTION_CONTRACT_SIZE * qty;
        } else if (sellPut) {
          putSpreadMargin = sellPut.margin_required || 0;
        }

        let callSpreadMargin = 0;
        if (sellCall && buyCall && sellCall.strike_price && buyCall.strike_price) {
          const width = Math.abs(buyCall.strike_price - sellCall.strike_price);
          const qty = sellCall.quantity || 1;
          callSpreadMargin = width * OPTION_CONTRACT_SIZE * qty;
        } else if (sellCall) {
          callSpreadMargin = sellCall.margin_required || 0;
        }

        // For an Iron Condor, broker only requires margin on the wider wing minus net credit
        const maxWingMargin = Math.max(putSpreadMargin, callSpreadMargin);
        totalMargin =
          maxWingMargin > 0
            ? Math.max(0, maxWingMargin - Math.max(0, netCreditOrDebit))
            : legs.reduce((s, l) => s + (l.margin_required || 0), 0);

        const expiryIso = legs.find((l) => l.expiry_date)?.expiry_date || null;
        const groupLastTxDate = legs.reduce((maxD, l) => {
          const d = getLastTxDate(l);
          return d > maxD ? d : maxD;
        }, '');
        const dte = Math.max(1, calculateDTE(expiryIso) || 1);
        const combinedAroc =
          totalMargin > 0 && netCreditOrDebit > 0
            ? (netCreditOrDebit / totalMargin / dte) * 365 * 100
            : 0;

        rows.push({
          kind: 'group',
          groupId: opt.group_id,
          strategyName: opt.strategy_name || 'Multi-Leg Spread',
          symbol: cleanSymbol(opt.symbol),
          legs,
          isClosed: allClosed,
          expiry_date: expiryIso,
          lastTxDate: groupLastTxDate,
          totalAbsPnl,
          netCreditOrDebit,
          netDelta,
          netTheta,
          totalMargin,
          combinedAroc,
        });
      } else {
        rows.push({ kind: 'single', opt, lastTxDate: getLastTxDate(opt) });
      }
    }

    return rows;
  }, [filteredOptions]);

  // Monthly & Yearly PnL subtotals for section headers and performance pills
  const periodStats = useMemo(() => {
    const monthTotals: Record<string, { count: number; pnl: number }> = {};
    const yearTotals: Record<string, { count: number; pnl: number }> = {};
    const openTotals = { count: 0, pnl: 0 };

    baseFilteredOptions.forEach((opt) => {
      const closed = isOptionClosed(opt);
      const { abs } = calculateChange(opt);

      if (!closed) {
        openTotals.count += 1;
        openTotals.pnl += abs;
        // In DEFAULT sort mode, open positions sit in the "Active / Open Positions" section at the top,
        // so they should NOT be mixed into the closed Monthly PnL totals!
        if (sortBy === 'DEFAULT') {
          return;
        }
      }

      const lastDate = getLastTxDate(opt);
      const ym = lastDate && lastDate.length >= 7 ? lastDate.slice(0, 7) : 'UNKNOWN';
      const yr = lastDate && lastDate.length >= 4 ? lastDate.slice(0, 4) : 'UNKNOWN';

      if (!monthTotals[ym]) monthTotals[ym] = { count: 0, pnl: 0 };
      monthTotals[ym].count += 1;
      monthTotals[ym].pnl += abs;

      if (!yearTotals[yr]) yearTotals[yr] = { count: 0, pnl: 0 };
      yearTotals[yr].count += 1;
      yearTotals[yr].pnl += abs;
    });

    return { monthTotals, yearTotals, openTotals };
  }, [baseFilteredOptions, sortBy]);

  const stats = useMemo(() => {
    let totalOpenValue = 0;
    let totalPnL = 0;
    let totalTheta = 0;

    filteredOptions.forEach((opt) => {
      const qty = opt.quantity || 1;
      const buyPrice = opt.buy_price ?? 0;
      const sellPrice = opt.sell_price ?? 0;
      const entryPrice = opt.type.startsWith('BUY') ? buyPrice : sellPrice;

      // Assigned options return abs = 0 so they never inflate Total PnL
      const { abs } = calculateChange(opt);
      totalPnL += abs;

      if (!isOptionClosed(opt)) {
        const sign = opt.type.startsWith('SELL') ? -1 : 1;
        totalOpenValue += sign * entryPrice * qty * OPTION_CONTRACT_SIZE;
        if (opt.theta !== undefined && opt.theta !== null) {
          const contractTheta = opt.theta * qty * OPTION_CONTRACT_SIZE;
          if (opt.type.startsWith('SELL')) {
            totalTheta += -contractTheta;
          } else {
            totalTheta += contractTheta;
          }
        }
      }
    });

    return { totalOpenValue: Math.abs(totalOpenValue), totalPnL, totalTheta };
  }, [filteredOptions]);

  const roundToOne = (num: number) => Math.round(num * 10) / 10;

  // Net concentration stats per symbol (netting long vs short legs on spreads)
  const concentrationStats = useMemo(() => {
    const symbolMap: { [symbol: string]: number } = {};
    let totalOptionsValue = 0;

    options.forEach((opt) => {
      if (isOptionClosed(opt)) return;
      const qty = opt.quantity || 1;
      const currentPrice =
        opt.current_price ??
        (opt.type.startsWith('BUY') ? opt.buy_price : opt.sell_price) ??
        0;
      const signedVal =
        (opt.type.startsWith('SELL') ? -1 : 1) *
        currentPrice *
        qty *
        OPTION_CONTRACT_SIZE;

      const sym = cleanSymbol(opt.symbol);
      symbolMap[sym] = (symbolMap[sym] || 0) + signedVal;
    });

    const netLiq = ibkrSummary?.netLiquidation || 0;
    const highRiskTickers: { symbol: string; pct: number }[] = [];

    if (netLiq > 0) {
      Object.entries(symbolMap).forEach(([sym, signedVal]) => {
        const absVal = Math.abs(signedVal);
        totalOptionsValue += absVal;
        const pct = (absVal / netLiq) * 100;
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
        close_type: isOptionAssigned(opt) ? 'ASSIGNED' : 'NORMAL',
        strategy_name: opt.strategy_name || '',
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
        close_type: 'NORMAL',
        strategy_name: '',
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

    let buyDateIso = toIsoDate(formData.buy_date);
    let sellDateIso = toIsoDate(formData.sell_date);
    const expiryDateIso = toIsoDate(formData.expiry_date);
    const todayIso = new Date().toISOString().slice(0, 10);

    // If marked as ASSIGNED, automatically ensure both dates are filled so it registers as closed
    if (formData.close_type === 'ASSIGNED') {
      if (!buyDateIso) buyDateIso = expiryDateIso || todayIso;
      if (!sellDateIso) sellDateIso = expiryDateIso || todayIso;
    }

    if (!buyDateIso && !sellDateIso) {
      alert('Please enter at least one date (Buy or Sell).');
      setIsSubmitting(false);
      return;
    }

    const payload: Omit<OptionPosition, 'id' | 'created_at'> = {
      symbol: cleanSymbol(formData.symbol),
      type: formData.type,
      quantity: parseFloat(formData.quantity) || 1,
      buy_date: buyDateIso,
      sell_date: sellDateIso,
      buy_price: formData.buy_price !== '' ? parseFloat(formData.buy_price) : null,
      sell_price: formData.sell_price !== '' ? parseFloat(formData.sell_price) : null,
      target:
        formData.target ||
        (formData.strike_price && formData.expiry_date
          ? `${formData.strike_price}$ / ${formData.expiry_date}`
          : ''),
      note: formData.note,
      strike_price: formData.strike_price ? parseFloat(formData.strike_price) : null,
      expiry_date: expiryDateIso,
      close_type: formData.close_type,
      is_assigned: formData.close_type === 'ASSIGNED',
      ...(formData.strategy_name ? { strategy_name: formData.strategy_name } : {}),
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

  // Quick 1-click toggle for marking an option as Assigned / Exercised
  const handleQuickAssign = async (opt: OptionPosition) => {
    if (!user) return;
    const currentlyAssigned = isOptionAssigned(opt);
    const confirmMsg = currentlyAssigned
      ? `Revert "${opt.symbol} $${opt.strike_price}" back to normal PnL calculation?`
      : `Mark "${opt.symbol} $${opt.strike_price} (${opt.type})" as Assigned / Exercised?\n\nIts Option PnL will be set to $0.00 because the premium is already included in the stock's cost basis / sale price.`;

    if (!confirm(confirmMsg)) return;

    const todayIso = new Date().toISOString().slice(0, 10);
    const closeDate = opt.expiry_date || todayIso;

    if (currentlyAssigned) {
      await updateOptionAction(user.uid, opt.id, {
        close_type: 'NORMAL',
        is_assigned: false,
      });
    } else {
      await updateOptionAction(user.uid, opt.id, {
        close_type: 'ASSIGNED',
        is_assigned: true,
        buy_date: opt.buy_date || closeDate,
        sell_date: opt.sell_date || closeDate,
      });
    }
    mutate();
  };

  const handleGroupSelected = async () => {
    if (!user || selectedLegIds.length < 2) return;
    const res = await groupOptionsStrategyAction(user.uid, selectedLegIds, strategyNameInput);
    if (res.success) {
      setSelectedLegIds([]);
      if (res.groupId) {
        setExpandedGroups((prev) => ({ ...prev, [res.groupId!]: true }));
      }
      mutate();
    } else {
      alert('Error grouping legs: ' + res.message);
    }
  };

  const handleUngroup = async (groupId: string) => {
    if (!user || !confirm('Ungroup this multi-leg strategy into separate legs?')) return;
    const res = await ungroupOptionsStrategyAction(user.uid, groupId);
    if (res.success) {
      mutate();
    }
  };

  const toggleLegSelection = (id: string) => {
    setSelectedLegIds((prev) =>
      prev.includes(id) ? prev.filter((item) => item !== id) : [...prev, id],
    );
  };

  const toggleGroupExpand = (groupId: string) => {
    setExpandedGroups((prev) => ({ ...prev, [groupId]: !prev[groupId] }));
  };

  const handleDelete = async (id: string) => {
    if (!user || !confirm('Are you sure you want to delete this option?')) return;
    await deleteOptionAction(user.uid, id);
    mutate();
  };

  if (isLoading) return <div className="skeleton h-96 w-full"></div>;

  const renderSingleLegRow = (opt: OptionPosition, isNestedLeg = false) => {
    const { abs, percent, isAssigned, transferredPremium } = calculateChange(opt);
    const isClosed = isOptionClosed(opt);
    const isSelected = selectedLegIds.includes(opt.id);

    const rowBg = isAssigned
      ? 'bg-info/5'
      : isClosed
        ? abs >= 0
          ? 'bg-success/5'
          : 'bg-error/5'
        : isNestedLeg
          ? 'bg-base-200/30'
          : '';

    return (
      <tr
        key={opt.id}
        className={`${rowBg} hover:bg-base-200/40 transition-colors ${
          isNestedLeg ? 'border-l-4 border-l-primary/40' : ''
        }`}
      >
        <td className="w-8 px-2 text-center">
          <input
            type="checkbox"
            className="checkbox checkbox-xs checkbox-primary"
            checked={isSelected}
            onChange={() => toggleLegSelection(opt.id)}
            title="Select leg to group into a multi-leg strategy"
          />
        </td>
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
              className={`text-[10px] font-bold ${
                opt.type.startsWith('BUY') ? 'text-primary' : 'text-secondary'
              }`}
            >
              {opt.type}
            </span>
            <div className="flex items-center gap-1.5">
              <span className="font-bold">{cleanSymbol(opt.symbol)}</span>
              {isAssigned && (
                <span
                  className="badge badge-info badge-xs font-bold text-[9px] py-1"
                  title="Premium transferred to underlying stock cost basis / sale price"
                >
                  📦 {opt.type === 'SELL_CALL' ? 'Called Away' : 'Assigned'}
                </span>
              )}
              {!isNestedLeg &&
                (() => {
                  const netLiq = ibkrSummary?.netLiquidation || 0;
                  if (netLiq > 0 && !isClosed) {
                    const val = Math.abs(concentrationStats.symbolMap[cleanSymbol(opt.symbol)] || 0);
                    const pct = (val / netLiq) * 100;
                    if (pct >= 15) {
                      return (
                        <span
                          className="badge badge-error badge-xs font-mono text-[9px] h-4 leading-none"
                          title={`Ticker Concentration: ${pct.toFixed(1)}% of NetLiq`}
                        >
                          🚨 {pct.toFixed(0)}%
                        </span>
                      );
                    }
                  }
                  return null;
                })()}
            </div>
          </div>
        </td>
        <td className="text-right font-mono text-sm">{opt.quantity || 1}</td>

        {/* Strike & Expiry / DTE */}
        <td>
          <div className="flex flex-col">
            <div className="flex items-center gap-1.5">
              <span className="text-sm font-semibold">
                {opt.strike_price ? `$${opt.strike_price}` : opt.target || '-'}
              </span>
              {!isClosed &&
                opt.expiry_date &&
                (() => {
                  const dte = calculateDTE(opt.expiry_date);
                  if (dte === null) return null;
                  const badgeColor =
                    dte <= 14 ? 'badge-error' : dte <= 21 ? 'badge-warning' : 'badge-success';
                  return (
                    <span
                      className={`badge ${badgeColor} badge-xs font-bold font-mono h-4 min-h-4 px-1.5 inline-flex items-center justify-center leading-none`}
                    >
                      {dte} DTE
                    </span>
                  );
                })()}
            </div>
            {opt.expiry_date && (
              <span className="text-[10px] opacity-75">
                Exp: {toDisplayDate(opt.expiry_date)}
              </span>
            )}
            {!isClosed &&
              (() => {
                const status = getEarningsStatus(opt.earnings_date);
                if (!status) return null;
                if (status.type === 'future') {
                  const isClose = status.days <= 7;
                  const collision = opt.expiry_date
                    ? new Date(opt.expiry_date) >= new Date(status.date)
                    : false;
                  return (
                    <span
                      className={`text-[9px] font-semibold flex items-center gap-0.5 mt-0.5 ${
                        collision
                          ? 'text-error animate-pulse'
                          : isClose
                            ? 'text-warning'
                            : 'text-success'
                      }`}
                    >
                      ⚠️ Earnings: {status.days} days {collision ? '(Collision!)' : 'left'}
                    </span>
                  );
                } else {
                  return (
                    <span className="text-[9px] opacity-40 mt-0.5">
                      📅 Previous Earnings: {toDisplayDate(status.date)}
                    </span>
                  );
                }
              })()}
            {opt.note && (
              <span
                className="text-[10px] italic opacity-50 truncate max-w-[150px]"
                title={opt.note}
              >
                {opt.note}
              </span>
            )}
          </div>
        </td>

        {/* Live Greeks */}
        <td>
          {!isClosed && opt.delta !== undefined && opt.delta !== null ? (
            <div className="flex flex-col text-[11px] font-mono gap-0.5 leading-none">
              <span
                className={
                  Math.abs(opt.delta) >= 0.5 ? 'text-error font-bold' : 'text-success'
                }
                title="Delta: Option price sensitivity to a $1 change in underlying stock"
              >
                Δ: {opt.delta.toFixed(2)}
              </span>
              <span
                className="text-info"
                title="Theta: Daily time decay"
              >
                θ: {opt.theta ? opt.theta.toFixed(1) : '-'}
              </span>
              <span
                className="opacity-60 text-[10px] flex items-center gap-1"
                title="Implied Volatility & 1Y IV Rank"
              >
                IV: {opt.iv ? `${(opt.iv * 100).toFixed(0)}%` : '-'}
                {opt.iv_rank !== undefined && opt.iv_rank !== null && (
                  <span
                    className={`badge badge-xs ${
                      opt.iv_rank >= 50
                        ? 'badge-success text-success-content'
                        : 'badge-ghost opacity-70'
                    } leading-none px-1 text-[8px] h-3.5`}
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
              <span className="text-base-content/80" title="Estimated Margin / Max Risk">
                ${opt.margin_required.toLocaleString(undefined, { maximumFractionDigits: 0 })}
              </span>
              {opt.aroc !== undefined && opt.aroc !== null && (
                <span
                  className={`font-bold ${
                    opt.aroc >= 20
                      ? 'text-success'
                      : opt.aroc >= 10
                        ? 'text-warning'
                        : 'text-error'
                  }`}
                  title="Annualized Return on Capital (AROC)"
                >
                  {opt.aroc.toFixed(1)}%
                </span>
              )}
            </div>
          ) : (
            <span className="opacity-40">-</span>
          )}
        </td>

        {/* Prices (B/S) */}
        <td className="text-right font-mono text-sm">
          <div className="flex flex-col">
            <span className="text-info">
              B: {opt.buy_price !== null && opt.buy_price !== undefined ? usdFormatter.format(opt.buy_price) : '-'}
            </span>
            <span className="text-warning">
              S: {opt.sell_price !== null && opt.sell_price !== undefined ? usdFormatter.format(opt.sell_price) : '-'}
            </span>
          </div>
        </td>

        {/* PnL / Change */}
        <td className="text-right font-mono">
          {isAssigned ? (
            <div className="flex flex-col items-end">
              <span className="font-bold text-info">$0.00</span>
              <span
                className="text-[10px] text-info/80"
                title="Premium is included in the stock position's cost basis / sale price"
              >
                In Stock ({usdFormatter.format(transferredPremium)})
              </span>
            </div>
          ) : isClosed ? (
            <div className="flex flex-col">
              <span className={`font-bold ${abs >= 0 ? 'text-success' : 'text-error'}`}>
                {abs >= 0 ? '+' : ''}
                {usdFormatter.format(abs)}
              </span>
              <span className={`text-xs ${abs >= 0 ? 'text-success' : 'text-error'}`}>
                {abs >= 0 ? '+' : ''}
                {percent.toFixed(2)}%
              </span>
            </div>
          ) : (
            <div className="flex flex-col items-end gap-1">
              {opt.current_price !== undefined && opt.current_price !== null ? (
                <>
                  <span
                    className={`font-semibold text-xs ${
                      abs >= 0 ? 'text-success' : 'text-error'
                    }`}
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
                      Take Profit ({percent.toFixed(0)}%)
                    </span>
                  )}
                </>
              ) : (
                <span className="badge badge-ghost badge-sm text-xs italic">Open</span>
              )}
            </div>
          )}
        </td>

        {/* Actions */}
        <td className="text-right whitespace-nowrap">
          <button
            onClick={() => handleQuickAssign(opt)}
            className={`btn btn-ghost btn-xs mr-1 ${
              isAssigned ? 'text-info bg-info/10' : 'text-base-content/50 hover:text-info'
            }`}
            title={
              isAssigned
                ? 'Assigned to Stock (PnL = $0). Click to revert.'
                : 'Mark as Assigned / Exercised (sets Option PnL = $0)'
            }
          >
            <FiPackage />
          </button>
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
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col items-center justify-between gap-4 md:flex-row">
        <div>
          <h1 className="text-3xl font-bold">Options</h1>
          <p className="text-base-content/70">
            Track single-leg &amp; multi-leg option strategies, assignments, and PnL
          </p>
        </div>
        <button className="btn btn-primary gap-2" onClick={() => handleOpenModal()}>
          <FiPlus /> Add Option
        </button>
      </div>

      {/* Multi-Leg Strategy Action Bar (appears when 2+ legs are checked) */}
      {selectedLegIds.length >= 2 && (
        <div className="alert bg-primary/10 border border-primary/30 shadow-md flex flex-wrap items-center justify-between gap-3 py-3">
          <div className="flex items-center gap-2">
            <FiLink className="text-primary text-lg" />
            <span className="font-bold text-sm">
              {selectedLegIds.length} option legs selected
            </span>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <select
              className="select select-bordered select-sm"
              value={strategyNameInput}
              onChange={(e) => setStrategyNameInput(e.target.value)}
            >
              {STRATEGY_PRESETS.map((preset) => (
                <option key={preset} value={preset}>
                  {preset}
                </option>
              ))}
            </select>
            <button
              type="button"
              onClick={handleGroupSelected}
              className="btn btn-primary btn-sm gap-1.5"
            >
              <FiLink /> Group as Strategy
            </button>
            <button
              type="button"
              onClick={() => setSelectedLegIds([])}
              className="btn btn-ghost btn-sm"
            >
              Clear
            </button>
          </div>
        </div>
      )}

      {/* Filters Bar */}
      <div className="card bg-base-100/50 backdrop-blur-md border-base-content/5 border shadow p-4 space-y-3">
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 lg:grid-cols-8 gap-3 items-end">
          <div className="flex flex-col gap-1.5">
            <label className="text-xs font-bold opacity-70">Year (Last Tx)</label>
            <select
              className="select select-bordered select-sm w-full font-semibold"
              value={selectedYear}
              onChange={(e) => setSelectedYear(e.target.value)}
            >
              <option value="">All Years</option>
              {availableYears.map((yr) => (
                <option key={yr} value={yr}>
                  {yr}
                </option>
              ))}
            </select>
          </div>

          <div className="flex flex-col gap-1.5">
            <label className="text-xs font-bold opacity-70">Month (Last Tx)</label>
            <select
              className="select select-bordered select-sm w-full font-semibold"
              value={selectedMonth}
              onChange={(e) => setSelectedMonth(e.target.value)}
            >
              <option value="">All Months</option>
              {Object.entries(MONTH_NAMES).map(([mNum, mLabel]) => (
                <option key={mNum} value={mNum}>
                  {mNum} - {mLabel}
                </option>
              ))}
            </select>
          </div>

          <div className="flex flex-col gap-1.5">
            <label className="text-xs font-bold opacity-70">Sort Order</label>
            <select
              className="select select-bordered select-sm w-full"
              value={sortBy}
              onChange={(e) =>
                setSortBy(e.target.value as 'DEFAULT' | 'TX_DESC' | 'TX_ASC')
              }
            >
              <option value="DEFAULT">Open First + Latest Tx</option>
              <option value="TX_DESC">Last Tx Date (Newest)</option>
              <option value="TX_ASC">Last Tx Date (Oldest)</option>
            </select>
          </div>

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
              <option value="ASSIGNED">Assigned / Exercised</option>
            </select>
          </div>

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
              <option value="ASSIGNED">Assigned ($0 Option PnL)</option>
            </select>
          </div>

          <button className="btn btn-neutral btn-sm w-full" onClick={handleResetFilters}>
            Reset Filters
          </button>
        </div>

        {/* Quick Yearly & Monthly Performance Pills */}
        {(Object.keys(periodStats.monthTotals).length > 0 ||
          Object.keys(periodStats.yearTotals).length > 0) &&
          (() => {
            const currentCalendarYear = new Date().getFullYear().toString();
            const availableYearsWithData = Object.keys(periodStats.yearTotals)
              .filter((y) => y !== 'UNKNOWN')
              .sort((a, b) => b.localeCompare(a));
            const defaultYear = availableYearsWithData.includes(currentCalendarYear)
              ? currentCalendarYear
              : availableYearsWithData[0] || currentCalendarYear;

            // When a year is selected from dropdown/pill, show that year's months.
            // Otherwise, show the default/current calendar year's months.
            const activeBreakdownYear = selectedYear || defaultYear;

            // Past years (prior to active breakdown year) shown as collapsed year totals
            const pastYears = Object.entries(periodStats.yearTotals)
              .filter(([yr]) => yr !== 'UNKNOWN' && yr < activeBreakdownYear)
              .sort(([a], [b]) => a.localeCompare(b));

            // Months for the active breakdown year
            const activeYearMonths = Object.entries(periodStats.monthTotals)
              .filter(([ym]) => ym.startsWith(activeBreakdownYear + '-'))
              .sort(([a], [b]) => b.localeCompare(a));

            // Future or other years (if any year exists > activeBreakdownYear)
            const futureOrOtherYears = Object.entries(periodStats.yearTotals)
              .filter(
                ([yr]) =>
                  yr !== 'UNKNOWN' &&
                  yr !== activeBreakdownYear &&
                  yr > activeBreakdownYear,
              )
              .sort(([a], [b]) => a.localeCompare(b));

            return (
              <div className="flex flex-wrap items-center gap-2 pt-2 border-t border-base-content/10 text-xs">
                <span className="font-bold opacity-60 uppercase tracking-wider text-[10px]">
                  Performance:
                </span>

                {/* Collapsed Past Year Total Pills */}
                {pastYears.map(([yr, info]) => {
                  const isSelected = selectedYear === yr && !selectedMonth;
                  const pnlColor =
                    info.pnl > 0
                      ? 'text-success'
                      : info.pnl < 0
                        ? 'text-error'
                        : 'opacity-70';
                  return (
                    <button
                      key={`past-yr-${yr}`}
                      type="button"
                      onClick={() => {
                        if (selectedYear === yr) {
                          setSelectedYear('');
                          setSelectedMonth('');
                        } else {
                          setSelectedYear(yr);
                          setSelectedMonth('');
                        }
                      }}
                      className={`badge badge-sm gap-1.5 py-2.5 px-3 cursor-pointer transition-all ${
                        isSelected
                          ? 'badge-primary font-bold shadow'
                          : 'badge-ghost border-base-content/20 hover:bg-base-200'
                      }`}
                      title={`Click to view ${yr} monthly details`}
                    >
                      <span className="font-bold">📅 {yr} Total</span>
                      <span className="opacity-60">({info.count})</span>
                      <span
                        className={`font-mono font-bold ${isSelected ? '' : pnlColor}`}
                      >
                        {(info.pnl >= 0 ? '+' : '') + usdFormatter.format(info.pnl)}
                      </span>
                    </button>
                  );
                })}

                {/* Active Year Monthly Pills */}
                {activeYearMonths.map(([ym, info]) => {
                  const [y, m] = ym.split('-');
                  const isSelected = selectedYear === y && selectedMonth === m;
                  const pnlColor =
                    info.pnl > 0
                      ? 'text-success'
                      : info.pnl < 0
                        ? 'text-error'
                        : 'opacity-70';
                  return (
                    <button
                      key={ym}
                      type="button"
                      onClick={() => {
                        if (isSelected) {
                          setSelectedYear(selectedYear === y ? y : '');
                          setSelectedMonth('');
                        } else {
                          setSelectedYear(y);
                          setSelectedMonth(m);
                        }
                      }}
                      className={`badge badge-sm gap-1.5 py-2.5 px-2.5 cursor-pointer transition-all ${
                        isSelected
                          ? 'badge-primary font-bold shadow'
                          : 'badge-ghost border-base-content/15 hover:bg-base-200'
                      }`}
                      title="Click to filter by this month"
                    >
                      <span className="font-semibold">{formatYearMonthLabel(ym)}</span>
                      <span className="opacity-60">({info.count})</span>
                      <span
                        className={`font-mono font-bold ${isSelected ? '' : pnlColor}`}
                      >
                        {(info.pnl >= 0 ? '+' : '') + usdFormatter.format(info.pnl)}
                      </span>
                    </button>
                  );
                })}

                {/* Future/Other Year Total Pills */}
                {futureOrOtherYears.map(([yr, info]) => {
                  const isSelected = selectedYear === yr && !selectedMonth;
                  const pnlColor =
                    info.pnl > 0
                      ? 'text-success'
                      : info.pnl < 0
                        ? 'text-error'
                        : 'opacity-70';
                  return (
                    <button
                      key={`future-yr-${yr}`}
                      type="button"
                      onClick={() => {
                        if (selectedYear === yr) {
                          setSelectedYear('');
                          setSelectedMonth('');
                        } else {
                          setSelectedYear(yr);
                          setSelectedMonth('');
                        }
                      }}
                      className={`badge badge-sm gap-1.5 py-2.5 px-3 cursor-pointer transition-all ${
                        isSelected
                          ? 'badge-primary font-bold shadow'
                          : 'badge-ghost border-base-content/20 hover:bg-base-200'
                      }`}
                      title={`Click to view ${yr} monthly details`}
                    >
                      <span className="font-bold">📅 {yr} Total</span>
                      <span className="opacity-60">({info.count})</span>
                      <span
                        className={`font-mono font-bold ${isSelected ? '' : pnlColor}`}
                      >
                        {(info.pnl >= 0 ? '+' : '') + usdFormatter.format(info.pnl)}
                      </span>
                    </button>
                  );
                })}
              </div>
            );
          })()}
      </div>

      {/* Stat Cards */}
      <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
        <div className="stats bg-base-100/50 backdrop-blur-md border-base-content/5 border shadow">
          <div className="stat">
            <div className="stat-figure text-primary">
              <FiDollarSign size={32} />
            </div>
            <div className="stat-title">Net Open Option Value</div>
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
            <div className="stat-title">
              Total Option PnL{' '}
              {selectedYear || selectedMonth
                ? `(${selectedMonth ? MONTH_NAMES[selectedMonth] + ' ' : ''}${selectedYear || 'All Years'})`
                : '(Excl. Assigned)'}
            </div>
            <div
              className="stat-value text-3xl"
              style={{ color: stats.totalPnL >= 0 ? '#22c55e' : '#ef4444' }}
            >
              {(stats.totalPnL >= 0 ? '+' : '') + usdFormatter.format(stats.totalPnL)}
            </div>
          </div>
        </div>
        <div className="stats bg-base-100/50 backdrop-blur-md border-base-content/5 border shadow">
          <div className="stat">
            <div className="stat-figure text-accent">
              <FiTrendingUp size={32} className="text-accent" />
            </div>
            <div className="stat-title">Daily Net Theta</div>
            <div className="stat-value text-3xl text-accent">
              {(stats.totalTheta >= 0 ? '+' : '') + usdFormatter.format(stats.totalTheta)}
              /day
            </div>
          </div>
        </div>
      </div>

      {concentrationStats.highRiskTickers.length > 0 && (
        <div className="alert alert-error bg-error/10 text-error border-error/20 shadow flex flex-col items-start gap-2 md:flex-row md:items-center md:justify-between py-3">
          <div className="flex items-center gap-2">
            <span className="text-xl">🚨</span>
            <div className="flex flex-col">
              <span className="font-bold text-sm">High Concentration Risk</span>
              <span className="text-xs opacity-90">
                Net open option exposure exceeds 15% of your Net Liquidation on:
              </span>
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            {concentrationStats.highRiskTickers.map((ticker) => (
              <span
                key={ticker.symbol}
                className="badge badge-error text-xs font-bold px-2 py-1 leading-none"
              >
                {ticker.symbol}: {ticker.pct}%
              </span>
            ))}
          </div>
        </div>
      )}

      {/* Options Table */}
      <div className="card bg-base-100/50 backdrop-blur-md border-base-content/5 border shadow-xl">
        <div className="overflow-x-auto">
          <table className="table">
            <thead>
              <tr className="bg-base-200/50">
                <th className="w-8 px-2 text-center select-none">🔗</th>
                <th className="whitespace-nowrap select-none">Dates</th>
                <th className="whitespace-nowrap select-none">Type &amp; Symbol</th>
                <th className="text-right whitespace-nowrap select-none">Qty</th>
                <th className="whitespace-nowrap select-none">Strike &amp; Expiry</th>
                <th className="whitespace-nowrap select-none">Live Greeks</th>
                <th className="text-right whitespace-nowrap select-none text-xs">
                  Margin &amp; AROC
                </th>
                <th className="text-right text-xs whitespace-nowrap select-none">
                  Prices (B/S)
                </th>
                <th className="text-right whitespace-nowrap select-none">PnL / Change</th>
                <th className="text-right">Actions</th>
              </tr>
            </thead>
            <tbody>
              {(() => {
                let lastSectionKey = '';
                return displayRows.map((row) => {
                  const rowIsClosed =
                    row.kind === 'single' ? isOptionClosed(row.opt) : row.isClosed;
                  const ym =
                    row.lastTxDate && row.lastTxDate.length >= 7
                      ? row.lastTxDate.slice(0, 7)
                      : 'UNKNOWN';

                  // In DEFAULT sort mode, Open positions are grouped together at the top,
                  // and Closed positions are grouped by Month & Year of their last transaction.
                  // In TX_DESC / TX_ASC sort mode, ALL positions are grouped strictly by Month & Year.
                  const sectionKey =
                    sortBy === 'DEFAULT' && !rowIsClosed ? 'OPEN_POSITIONS' : ym;
                  const showSectionHeader = sectionKey !== lastSectionKey;
                  lastSectionKey = sectionKey;

                  const monthStat = periodStats.monthTotals[ym] || { count: 0, pnl: 0 };

                  const sectionHeaderRow = showSectionHeader ? (
                    <tr
                      key={`header-${sectionKey}-${row.kind === 'single' ? row.opt.id : row.groupId}`}
                      className="bg-base-200/70 border-y border-base-content/10"
                    >
                      <td colSpan={10} className="py-1.5 px-4">
                        {sectionKey === 'OPEN_POSITIONS' ? (
                          <div className="flex items-center justify-between text-xs font-bold">
                            <span className="text-primary flex items-center gap-2 uppercase tracking-wider">
                              🟢 Active / Open Positions
                              <span className="badge badge-xs badge-ghost font-mono">
                                {periodStats.openTotals.count}{' '}
                                {periodStats.openTotals.count === 1 ? 'leg' : 'legs'}
                              </span>
                            </span>
                            <span className="font-mono flex items-center gap-1.5">
                              <span className="opacity-60 font-normal">Open PnL:</span>
                              <span
                                className={
                                  periodStats.openTotals.pnl > 0
                                    ? 'text-success font-bold'
                                    : periodStats.openTotals.pnl < 0
                                      ? 'text-error font-bold'
                                      : 'opacity-70'
                                }
                              >
                                {(periodStats.openTotals.pnl >= 0 ? '+' : '') +
                                  usdFormatter.format(periodStats.openTotals.pnl)}
                              </span>
                            </span>
                          </div>
                        ) : (
                          <div className="flex items-center justify-between text-xs font-bold">
                            <span className="flex items-center gap-2 uppercase tracking-wider text-base-content/80">
                              📅 {formatYearMonthLabel(ym)}
                              <span className="badge badge-xs badge-ghost font-mono">
                                {monthStat.count} {monthStat.count === 1 ? 'leg' : 'legs'}
                              </span>
                            </span>
                            <span className="font-mono flex items-center gap-1.5">
                              <span className="opacity-60 font-normal">Monthly PnL:</span>
                              <span
                                className={
                                  monthStat.pnl > 0
                                    ? 'text-success font-bold'
                                    : monthStat.pnl < 0
                                      ? 'text-error font-bold'
                                      : 'opacity-70'
                                }
                              >
                                {(monthStat.pnl >= 0 ? '+' : '') +
                                  usdFormatter.format(monthStat.pnl)}
                              </span>
                            </span>
                          </div>
                        )}
                      </td>
                    </tr>
                  ) : null;

                  if (row.kind === 'single') {
                    return (
                      <React.Fragment key={row.opt.id}>
                        {sectionHeaderRow}
                        {renderSingleLegRow(row.opt, false)}
                      </React.Fragment>
                    );
                  }

                  const isExpanded = Boolean(expandedGroups[row.groupId]);
                  const strikesSummary = row.legs
                    .map(
                      (l) =>
                        `${l.type.startsWith('SELL') ? '-' : '+'}${l.strike_price || '?'}${
                          l.type.endsWith('PUT') ? 'P' : 'C'
                        }`,
                    )
                    .join(' / ');
                  const dte = calculateDTE(row.expiry_date);

                  return (
                    <React.Fragment key={row.groupId}>
                      {sectionHeaderRow}
                      <tr
                        className="bg-primary/5 hover:bg-primary/10 transition-colors cursor-pointer font-medium"
                        onClick={() => toggleGroupExpand(row.groupId)}
                      >
                        <td className="px-2 text-center">
                          <button
                            type="button"
                            className="btn btn-ghost btn-xs btn-square"
                            onClick={(e) => {
                              e.stopPropagation();
                              toggleGroupExpand(row.groupId);
                            }}
                          >
                            {isExpanded ? <FiChevronDown /> : <FiChevronRight />}
                          </button>
                        </td>
                        <td className="text-xs font-mono opacity-80">
                          <div className="flex flex-col">
                            <span className="font-bold">{row.legs.length} Legs</span>
                            {row.lastTxDate && (
                              <span className="text-[10px] opacity-60">
                                {toDisplayDate(row.lastTxDate)}
                              </span>
                            )}
                          </div>
                        </td>
                        <td>
                          <div className="flex flex-col">
                            <span className="text-[10px] font-bold text-primary uppercase tracking-wider flex items-center gap-1">
                              <FiLink size={10} /> {row.strategyName}
                            </span>
                            <span className="font-bold text-base">{cleanSymbol(row.symbol)}</span>
                          </div>
                        </td>
                        <td className="text-right font-mono text-sm">
                          {row.legs[0]?.quantity || 1}x
                        </td>
                        <td>
                          <div className="flex flex-col">
                            <div className="flex items-center gap-1.5">
                              <span className="text-xs font-bold font-mono">
                                {strikesSummary}
                              </span>
                              {!row.isClosed && dte !== null && (
                                <span className="badge badge-primary badge-xs font-mono">
                                  {dte} DTE
                                </span>
                              )}
                            </div>
                            {row.expiry_date && (
                              <span className="text-[10px] opacity-70">
                                Exp: {toDisplayDate(row.expiry_date)}
                              </span>
                            )}
                          </div>
                        </td>
                        <td>
                          {!row.isClosed ? (
                            <div className="flex flex-col text-[11px] font-mono leading-tight">
                              <span>Net Δ: {row.netDelta.toFixed(2)}</span>
                              <span className="text-info">
                                Net θ: {row.netTheta.toFixed(1)}
                              </span>
                            </div>
                          ) : (
                            <span className="opacity-40">-</span>
                          )}
                        </td>
                        <td className="text-right font-mono text-[11px] leading-tight">
                          {!row.isClosed && row.totalMargin > 0 ? (
                            <div className="flex flex-col items-end">
                              <span>
                                ${row.totalMargin.toLocaleString(undefined, { maximumFractionDigits: 0 })}
                              </span>
                              {row.combinedAroc > 0 && (
                                <span className="text-success font-bold">
                                  {row.combinedAroc.toFixed(1)}%
                                </span>
                              )}
                            </div>
                          ) : (
                            <span className="opacity-40">-</span>
                          )}
                        </td>
                        <td className="text-right font-mono text-xs">
                          <span
                            className={
                              row.netCreditOrDebit >= 0 ? 'text-warning font-bold' : 'text-info font-bold'
                            }
                          >
                            {row.netCreditOrDebit >= 0 ? 'Net Cr: ' : 'Net Db: '}
                            {usdFormatter.format(Math.abs(row.netCreditOrDebit))}
                          </span>
                        </td>
                        <td className="text-right font-mono">
                          <span
                            className={`font-bold ${
                              row.totalAbsPnl >= 0 ? 'text-success' : 'text-error'
                            }`}
                          >
                            {row.totalAbsPnl >= 0 ? '+' : ''}
                            {usdFormatter.format(row.totalAbsPnl)}
                          </span>
                        </td>
                        <td
                          className="text-right"
                          onClick={(e) => e.stopPropagation()}
                        >
                          <button
                            type="button"
                            onClick={() => handleUngroup(row.groupId)}
                            className="btn btn-ghost btn-xs text-warning"
                            title="Ungroup strategy legs"
                          >
                            <FiUnlock />
                          </button>
                        </td>
                      </tr>
                      {isExpanded &&
                        row.legs.map((leg) => renderSingleLegRow(leg, true))}
                    </React.Fragment>
                  );
                });
              })()}

              {displayRows.length === 0 && (
                <tr>
                  <td colSpan={10} className="py-8 text-center opacity-50">
                    No options found matching the criteria.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Add / Edit Option Modal */}
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
              <label className="w-36 shrink-0 text-sm font-bold">
                Symbol <span className="text-error">*</span>
              </label>
              <input
                type="text"
                className="input input-bordered flex-1 uppercase"
                placeholder="e.g. NVDA"
                required
                value={formData.symbol}
                onChange={(e) =>
                  setFormData({ ...formData, symbol: e.target.value })
                }
              />
            </div>

            {/* Option Type */}
            <div className="flex items-center gap-4">
              <label className="w-36 shrink-0 text-sm font-bold">Type</label>
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

            {/* Close / Assignment Status */}
            <div className="flex items-center gap-4">
              <label className="w-36 shrink-0 text-sm font-bold text-info">
                Assignment Status
              </label>
              <select
                className="select select-bordered flex-1"
                value={formData.close_type}
                onChange={(e) =>
                  setFormData({
                    ...formData,
                    close_type: e.target.value as OptionCloseType,
                  })
                }
              >
                <option value="NORMAL">Normal (Open / Closed / Expired)</option>
                <option value="ASSIGNED">
                  📦 Assigned / Called Away (PnL = $0, Premium in Stock)
                </option>
              </select>
            </div>

            {/* Quantity */}
            <div className="flex items-center gap-4">
              <label className="w-36 shrink-0 text-sm font-bold">
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
              <label className="text-info w-36 shrink-0 text-sm font-bold">
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
              <label className="text-info w-36 shrink-0 text-sm font-bold">
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
              <label className="text-warning w-36 shrink-0 text-sm font-bold">
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
              <label className="text-warning w-36 shrink-0 text-sm font-bold">
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
              <label className="w-36 shrink-0 text-sm font-bold">
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
              <label className="w-36 shrink-0 text-sm font-bold">
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
              <label className="w-36 shrink-0 text-sm font-bold">Target</label>
              <input
                type="text"
                className="input input-bordered flex-1"
                placeholder="e.g. 50% profit or break even"
                value={formData.target}
                onChange={(e) =>
                  setFormData({ ...formData, target: e.target.value })
                }
              />
            </div>

            {/* Note */}
            <div className="flex items-start gap-4">
              <label className="w-36 shrink-0 pt-3 text-sm font-bold">
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
              Sell Date is required. Marking as Assigned automatically closes
              the option with $0.00 standalone PnL.
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
