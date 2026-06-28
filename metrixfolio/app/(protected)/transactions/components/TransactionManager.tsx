'use client';

import { useState, useRef, useMemo } from 'react';
import useSWR from 'swr';
import { useAuth } from '@/context/AuthProvider';
import {
  addTransactionAction,
  getTransactionsAction,
  deleteTransactionAction,
} from '@/actions/transactions';
import { Transaction, TransactionType } from '@/types/transaction';
import {
  FiPlus,
  FiArrowUpCircle,
  FiArrowDownCircle,
  FiTrash2,
  FiCalendar,
  FiDollarSign,
} from 'react-icons/fi';
import { getExchangeRatesAction } from '@/actions/currency';
import { CurrencyConverter } from '@/utils/currency-math';

// Formatter'ı component dışına alarak her render'da yeniden oluşmasını engelliyoruz.
const usdFormatter = new Intl.NumberFormat('en-US', {
  style: 'currency',
  currency: 'USD',
});

export default function TransactionManager() {
  const { user } = useAuth();
  const modalRef = useRef<HTMLDialogElement>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const [formData, setFormData] = useState({
    type: 'DEPOSIT' as TransactionType,
    amount: '',
    currency: 'USD',
    date: new Date().toISOString().split('T')[0],
    note: '',
  });

  const {
    data: transactions = [],
    mutate,
    isLoading,
  } = useSWR(user ? ['transactions', user.uid] : null, ([, uid]) =>
    getTransactionsAction(uid),
  );

  const { data: rates = [] } = useSWR('exchange_rates', getExchangeRatesAction);

  const stats = useMemo(() => {
    if (!transactions.length || !rates.length) {
      return { deposits: 0, withdrawals: 0, net: 0 };
    }

    const converter = new CurrencyConverter(rates);
    const TARGET_CURRENCY = 'USD';

    let deposits = 0;
    let withdrawals = 0;

    transactions.forEach((t) => {
      const valueInUsd = converter.convert(
        t.amount,
        t.currency,
        TARGET_CURRENCY,
      );

      if (t.type === 'DEPOSIT') deposits += valueInUsd;
      else withdrawals += valueInUsd;
    });

    return {
      deposits,
      withdrawals,
      net: deposits - withdrawals,
    };
  }, [transactions, rates]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) return;
    setIsSubmitting(true);

    const res = await addTransactionAction(user.uid, {
      ...formData,
      amount: Number(formData.amount),
    });

    if (res.success) {
      mutate(); // Listeyi tazele
      modalRef.current?.close();
      setFormData((prev) => ({ ...prev, amount: '', note: '' })); // Formu temizle
    } else {
      alert('Hata: ' + res.message);
    }
    setIsSubmitting(false);
  };

  const handleDelete = async (id: string) => {
    if (!user || !confirm('Delete transaction?')) return;
    await deleteTransactionAction(user.uid, id);
    mutate();
  };

  if (isLoading) return <div className="skeleton h-96 w-full"></div>;

  return (
    <div className="space-y-8">
      {/* HEADER & BUTTON */}
      <div className="flex flex-col items-center justify-between gap-4 md:flex-row">
        <div>
          <h1 className="text-3xl font-bold">Cash Flow</h1>
          <p className="text-base-content/70">
            Track your deposits and withdrawals
          </p>
        </div>
        <button
          className="btn btn-primary gap-2"
          onClick={() => modalRef.current?.showModal()}
        >
          <FiPlus /> Add Transaction
        </button>
      </div>

      {/* STAT CARDS */}
      <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
        <div className="stats bg-base-100 border-base-200 border shadow">
          <div className="stat">
            <div className="stat-figure text-success">
              <FiArrowUpCircle size={32} />
            </div>
            <div className="stat-title">Total Deposited</div>
            <div className="stat-value text-success text-2xl">
              {usdFormatter.format(stats.deposits)}
            </div>
            <div className="stat-desc">Lifetime funding</div>
          </div>
        </div>

        <div className="stats bg-base-100 border-base-200 border shadow">
          <div className="stat">
            <div className="stat-figure text-error">
              <FiArrowDownCircle size={32} />
            </div>
            <div className="stat-title">Total Withdrawn</div>
            <div className="stat-value text-error text-2xl">
              {usdFormatter.format(stats.withdrawals)}
            </div>
            <div className="stat-desc">Lifetime cash out</div>
          </div>
        </div>

        <div className="stats bg-base-100 border-base-200 border shadow">
          <div className="stat">
            <div className="stat-figure text-primary">
              <FiDollarSign size={32} />
            </div>
            <div className="stat-title">Net Invested</div>
            <div className="stat-value text-primary text-2xl">
              {usdFormatter.format(stats.net)}
            </div>
            <div className="stat-desc">Real money in the game</div>
          </div>
        </div>
      </div>

      {/* LISTE */}
      <div className="card bg-base-100 border-base-200 border shadow-xl">
        <div className="overflow-x-auto">
          <table className="table-zebra table">
            <thead>
              <tr>
                <th>Type</th>
                <th>Date</th>
                <th>Amount</th>
                <th>Note</th>
                <th className="text-right">Action</th>
              </tr>
            </thead>
            <tbody>
              {transactions.map((t) => (
                <tr key={t.id}>
                  <td>
                    <span
                      className={`badge font-bold ${t.type === 'DEPOSIT' ? 'badge-success badge-outline' : 'badge-error badge-outline'}`}
                    >
                      {t.type}
                    </span>
                  </td>
                  <td className="font-mono text-sm">{t.date}</td>
                  <td
                    className={`font-mono font-bold ${t.type === 'DEPOSIT' ? 'text-success' : 'text-error'}`}
                  >
                    {t.type === 'DEPOSIT' ? '+' : '-'}{' '}
                    {new Intl.NumberFormat('en-US', {
                      style: 'currency',
                      currency: t.currency,
                    }).format(t.amount)}
                  </td>
                  <td className="text-sm opacity-70">{t.note || '-'}</td>
                  <td className="text-right">
                    <button
                      onClick={() => handleDelete(t.id)}
                      className="btn btn-ghost btn-xs text-error"
                    >
                      <FiTrash2 />
                    </button>
                  </td>
                </tr>
              ))}
              {transactions.length === 0 && (
                <tr>
                  <td colSpan={5} className="py-8 text-center opacity-50">
                    No transactions found. Add your first deposit!
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* --- ADD TRANSACTION MODAL --- */}
      <dialog
        ref={modalRef}
        className="modal modal-bottom sm:modal-middle backdrop-blur-sm"
      >
        <div className="modal-box">
          <h3 className="mb-4 text-lg font-bold">Add Transaction</h3>

          <form onSubmit={handleSubmit} className="space-y-4">
            {/* Type Selection */}
            <div className="flex gap-4">
              <label className="label has-[:checked]:border-success has-[:checked]:bg-success/10 flex-1 cursor-pointer justify-start gap-2 rounded-lg border p-3">
                <input
                  type="radio"
                  name="type"
                  className="radio radio-success"
                  checked={formData.type === 'DEPOSIT'}
                  onChange={() => setFormData({ ...formData, type: 'DEPOSIT' })}
                />
                <span className="label-text font-bold">Deposit (Money In)</span>
              </label>
              <label className="label has-[:checked]:border-error has-[:checked]:bg-error/10 flex-1 cursor-pointer justify-start gap-2 rounded-lg border p-3">
                <input
                  type="radio"
                  name="type"
                  className="radio radio-error"
                  checked={formData.type === 'WITHDRAWAL'}
                  onChange={() =>
                    setFormData({ ...formData, type: 'WITHDRAWAL' })
                  }
                />
                <span className="label-text font-bold">Withdrawal (Out)</span>
              </label>
            </div>

            <div className="flex gap-4">
              {/* Amount */}
              <div className="form-control flex-1">
                <label className="label">
                  <span className="label-text">Amount</span>
                </label>
                <div className="join">
                  <input
                    type="number"
                    step="0.01"
                    className="input input-bordered join-item w-full"
                    placeholder="1000.00"
                    required
                    value={formData.amount}
                    onChange={(e) =>
                      setFormData({ ...formData, amount: e.target.value })
                    }
                  />
                  <select
                    className="select select-bordered join-item"
                    value={formData.currency}
                    onChange={(e) =>
                      setFormData({ ...formData, currency: e.target.value })
                    }
                  >
                    <option value="USD">USD</option>
                    <option value="EUR">EUR</option>
                    <option value="TRY">TRY</option>
                  </select>
                </div>
              </div>

              {/* Date */}
              <div className="form-control w-1/3">
                <label className="label">
                  <span className="label-text">Date</span>
                </label>
                <input
                  type="date"
                  className="input input-bordered w-full"
                  required
                  value={formData.date}
                  onChange={(e) =>
                    setFormData({ ...formData, date: e.target.value })
                  }
                />
              </div>
            </div>

            {/* Note */}
            <div className="form-control">
              <label className="label">
                <span className="label-text">Note (Optional)</span>
              </label>
              <input
                type="text"
                className="input input-bordered"
                placeholder="e.g. Monthly savings"
                value={formData.note}
                onChange={(e) =>
                  setFormData({ ...formData, note: e.target.value })
                }
              />
            </div>

            <div className="modal-action">
              <button
                type="button"
                className="btn btn-ghost"
                onClick={() => modalRef.current?.close()}
              >
                Cancel
              </button>
              <button
                type="submit"
                className="btn btn-primary"
                disabled={isSubmitting}
              >
                {isSubmitting && (
                  <span className="loading loading-spinner"></span>
                )}
                Save Transaction
              </button>
            </div>
          </form>
        </div>
        <form method="dialog" className="modal-backdrop">
          <button>close</button>
        </form>
      </dialog>
    </div>
  );
}
