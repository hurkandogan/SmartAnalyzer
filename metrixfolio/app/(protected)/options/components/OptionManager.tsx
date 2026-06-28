'use client';

import { useState, useRef, useMemo, useEffect } from 'react';
import { useAuth } from '@/context/AuthProvider';
import {
  addOptionAction,
  getOptionsAction,
  updateOptionAction,
  deleteOptionAction,
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

export default function OptionManager() {
  const { user } = useAuth();
  const modalRef = useRef<HTMLDialogElement>(null);

  const [options, setOptions] = useState<OptionPosition[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [filter, setFilter] = useState<'ALL' | 'OPEN' | 'CLOSED'>('ALL');
  const [sortConfig, setSortConfig] = useState<{
    key: keyof OptionPosition;
    direction: 'asc' | 'desc';
  } | null>(null);

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
  });

  const loadOptions = async () => {
    if (!user) return;
    setIsLoading(true);
    const data = await getOptionsAction(user.uid);
    setOptions(data);
    setIsLoading(false);
  };

  useEffect(() => {
    loadOptions();
  }, [user]);

  // Refresh data when user returns to the tab
  useEffect(() => {
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        loadOptions();
      }
    };
    document.addEventListener('visibilitychange', handleVisibilityChange);
    return () =>
      document.removeEventListener('visibilitychange', handleVisibilityChange);
  }, [user]);

  const stats = useMemo(() => {
    let totalOpenValue = 0;
    let totalPnL = 0;

    options.forEach((opt) => {
      const qty = opt.quantity || 1;
      const buyPrice = opt.buy_price ?? 0;
      const sellPrice = opt.sell_price ?? 0;
      const entryPrice = opt.type.startsWith('BUY') ? buyPrice : sellPrice;

      if (isOptionClosed(opt)) {
        totalPnL += calcPnl(opt);
      } else {
        totalOpenValue += entryPrice * qty * OPTION_CONTRACT_SIZE;
      }
    });

    return { totalOpenValue, totalPnL };
  }, [options]);

  const filteredOptions = useMemo(() => {
    let result = [...options];
    if (filter !== 'ALL') {
      result = result.filter((opt) =>
        filter === 'CLOSED' ? isOptionClosed(opt) : !isOptionClosed(opt),
      );
    }

    if (sortConfig) {
      result.sort((a, b) => {
        const aClosed = isOptionClosed(a);
        const bClosed = isOptionClosed(b);
        if (aClosed !== bClosed) return aClosed ? 1 : -1; // Open on top

        const aValue = a[sortConfig.key];
        const bValue = b[sortConfig.key];

        if (aValue === null || aValue === undefined) return 1;
        if (bValue === null || bValue === undefined) return -1;

        if (aValue < bValue) return sortConfig.direction === 'asc' ? -1 : 1;
        if (aValue > bValue) return sortConfig.direction === 'asc' ? 1 : -1;
        return 0;
      });
    } else {
      // Default sort: Open first, then by entry date descending
      result.sort((a, b) => {
        const aClosed = isOptionClosed(a);
        const bClosed = isOptionClosed(b);

        if (aClosed !== bClosed) return aClosed ? 1 : -1; // Open on top

        const aEntry = a.type.startsWith('BUY')
          ? a.buy_date || ''
          : a.sell_date || '';
        const bEntry = b.type.startsWith('BUY')
          ? b.buy_date || ''
          : b.sell_date || '';

        return bEntry.localeCompare(aEntry); // Most recent first
      });
    }

    return result;
  }, [options, filter, sortConfig]);

  const handleSort = (key: keyof OptionPosition) => {
    let direction: 'asc' | 'desc' = 'asc';
    if (
      sortConfig &&
      sortConfig.key === key &&
      sortConfig.direction === 'asc'
    ) {
      direction = 'desc';
    }
    setSortConfig({ key, direction });
  };

  const renderSortArrow = (key: keyof OptionPosition) => {
    if (!sortConfig || sortConfig.key !== key) return null;
    return sortConfig.direction === 'asc' ? (
      <FiChevronUp className="ml-1 inline" />
    ) : (
      <FiChevronDown className="ml-1 inline" />
    );
  };

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
        target: opt.target,
        note: opt.note,
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
      target: formData.target,
      note: formData.note,
    };

    let res;
    if (editingId) {
      res = await updateOptionAction(user.uid, editingId, payload);
    } else {
      res = await addOptionAction(user.uid, payload);
    }

    if (res.success) {
      loadOptions();
      handleCloseModal();
    } else {
      alert('Error: ' + res.message);
    }
    setIsSubmitting(false);
  };

  const handleDelete = async (id: string) => {
    if (!user || !confirm('Are you sure?')) return;
    await deleteOptionAction(user.uid, id);
    loadOptions();
  };

  const calculateChange = (opt: OptionPosition) => {
    if (!isOptionClosed(opt)) return { abs: 0, percent: 0 };

    const buyPrice = opt.buy_price ?? 0;
    const abs = calcPnl(opt);
    const percent =
      buyPrice !== 0
        ? (((opt.sell_price ?? 0) - buyPrice) / buyPrice) * 100
        : 0;

    return { abs, percent };
  };

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

      <div className="flex justify-center">
        <div className="join bg-base-100/50 backdrop-blur-md border-base-content/5 border shadow-sm">
          <button
            className={`join-item btn btn-sm px-6 ${filter === 'ALL' ? 'btn-primary' : 'btn-ghost'}`}
            onClick={() => setFilter('ALL')}
          >
            All
          </button>
          <button
            className={`join-item btn btn-sm px-6 ${filter === 'OPEN' ? 'btn-primary' : 'btn-ghost'}`}
            onClick={() => setFilter('OPEN')}
          >
            Open
          </button>
          <button
            className={`join-item btn btn-sm px-6 ${filter === 'CLOSED' ? 'btn-primary' : 'btn-ghost'}`}
            onClick={() => setFilter('CLOSED')}
          >
            Closed
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
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
      </div>

      <div className="card bg-base-100/50 backdrop-blur-md border-base-content/5 border shadow-xl">
        <div className="overflow-x-auto">
          <table className="table">
            <thead>
              <tr className="bg-base-200/50">
                <th
                  className="cursor-pointer whitespace-nowrap select-none"
                  onClick={() => handleSort('buy_date')}
                >
                  Dates{' '}
                  {renderSortArrow('buy_date') || renderSortArrow('sell_date')}
                </th>
                <th
                  className="cursor-pointer whitespace-nowrap select-none"
                  onClick={() => handleSort('symbol')}
                >
                  Type & Symbol {renderSortArrow('symbol')}
                </th>
                <th
                  className="cursor-pointer text-right whitespace-nowrap select-none"
                  onClick={() => handleSort('quantity')}
                >
                  Qty {renderSortArrow('quantity')}
                </th>
                <th
                  className="cursor-pointer whitespace-nowrap select-none"
                  onClick={() => handleSort('target')}
                >
                  Target & Note {renderSortArrow('target')}
                </th>
                <th className="cursor-pointer text-right text-xs whitespace-nowrap select-none">
                  Prices (B/S)
                </th>
                <th
                  className="cursor-pointer text-right whitespace-nowrap select-none"
                  onClick={() => handleSort('buy_price')}
                >
                  PnL / Change {renderSortArrow('buy_price')}
                </th>
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
                        <span className="font-bold">{opt.symbol}</span>
                      </div>
                    </td>
                    <td className="text-right font-mono text-sm">
                      {opt.quantity || 1}
                    </td>
                    <td className="max-w-xs whitespace-normal">
                      <div className="flex flex-col">
                        <span className="text-sm font-semibold">
                          {opt.target}
                        </span>
                        <span className="text-xs italic opacity-60">
                          {opt.note}
                        </span>
                      </div>
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
                        <span className="badge badge-ghost badge-sm text-xs italic">
                          Open
                        </span>
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
              {options.length === 0 && (
                <tr>
                  <td colSpan={6} className="py-8 text-center opacity-50">
                    No options found. Add your first trade!
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
