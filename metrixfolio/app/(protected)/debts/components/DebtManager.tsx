'use client';

import { useState, useRef, useMemo } from 'react';
import { useDebts } from '@/hooks/useDebts';
import { useAuth } from '@/context/AuthProvider';
import { addDebtAction, deleteDebtAction, updateDebtAction } from '@/actions/debts';
import { Debt } from '@/types/debt';
import { FiPlus, FiTrash2, FiEdit2, FiDollarSign } from 'react-icons/fi';

const usdFormatter = new Intl.NumberFormat('en-US', {
  style: 'currency',
  currency: 'USD',
});

export default function DebtManager() {
  const { user } = useAuth();
  const modalRef = useRef<HTMLDialogElement>(null);
  
  const { debts, totalDebtUsd, isLoading, mutate } = useDebts();
  
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);

  const [formData, setFormData] = useState({
    name: '',
    amount: '',
    currency: 'USD' as 'USD' | 'EUR',
  });

  const handleOpenModal = (debt?: Debt) => {
    if (debt) {
      setEditingId(debt.id);
      setFormData({
        name: debt.name,
        amount: debt.amount.toString(),
        currency: debt.currency,
      });
    } else {
      setEditingId(null);
      setFormData({ name: '', amount: '', currency: 'USD' });
    }
    modalRef.current?.showModal();
  };

  const handleCloseModal = () => {
    modalRef.current?.close();
    setEditingId(null);
    setFormData({ name: '', amount: '', currency: 'USD' });
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) return;
    setIsSubmitting(true);

    let res;
    if (editingId) {
      res = await updateDebtAction(user.uid, editingId, {
        name: formData.name,
        amount: Number(formData.amount),
        currency: formData.currency,
      });
    } else {
      res = await addDebtAction(user.uid, {
        name: formData.name,
        amount: Number(formData.amount),
        currency: formData.currency,
      });
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
    if (!user || !confirm('Are you sure you want to delete this debt?')) return;
    await deleteDebtAction(user.uid, id);
    mutate();
  };

  if (isLoading) return <div className="skeleton h-96 w-full"></div>;

  return (
    <div className="space-y-8">
      {/* HEADER & BUTTON */}
      <div className="flex flex-col items-center justify-between gap-4 md:flex-row">
        <div>
          <h1 className="text-3xl font-bold">Debts</h1>
          <p className="text-base-content/70">
            Track and manage your outstanding debts
          </p>
        </div>
        <button
          className="btn btn-primary gap-2"
          onClick={() => handleOpenModal()}
        >
          <FiPlus /> Add Debt
        </button>
      </div>

      {/* STAT CARDS */}
      <div className="grid grid-cols-1 gap-4 md:grid-cols-1">
        <div className="stats bg-base-100/50 backdrop-blur-md border-base-content/5 border shadow">
          <div className="stat">
            <div className="stat-figure text-error">
              <FiDollarSign size={32} />
            </div>
            <div className="stat-title">Total Debt</div>
            <div className="stat-value text-error text-3xl">
              {usdFormatter.format(totalDebtUsd)}
            </div>
            <div className="stat-desc text-lg">Converted to USD</div>
          </div>
        </div>
      </div>

      {/* LISTE */}
      <div className="card bg-base-100/50 backdrop-blur-md border-base-content/5 border shadow-xl">
        <div className="overflow-x-auto">
          <table className="table">
            <thead>
              <tr>
                <th>Name</th>
                <th>Currency</th>
                <th>Amount</th>
                <th className="text-right">Action</th>
              </tr>
            </thead>
            <tbody>
              {debts.map((d) => (
                <tr key={d.id}>
                  <td className="font-bold">{d.name}</td>
                  <td>
                    <span className="badge badge-outline">{d.currency}</span>
                  </td>
                  <td className="font-mono text-error font-bold">
                    {new Intl.NumberFormat('en-US', {
                      style: 'currency',
                      currency: d.currency,
                    }).format(d.amount)}
                  </td>
                  <td className="text-right">
                    <button
                      onClick={() => handleOpenModal(d)}
                      className="btn btn-ghost btn-xs text-primary mr-2"
                      title="Edit"
                    >
                      <FiEdit2 />
                    </button>
                    <button
                      onClick={() => handleDelete(d.id)}
                      className="btn btn-ghost btn-xs text-error"
                      title="Delete"
                    >
                      <FiTrash2 />
                    </button>
                  </td>
                </tr>
              ))}
              {debts.length === 0 && (
                <tr>
                  <td colSpan={4} className="py-8 text-center opacity-50">
                    No debts found. You are debt free!
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* --- ADD/EDIT DEBT MODAL --- */}
      <dialog
        ref={modalRef}
        className="modal modal-bottom sm:modal-middle backdrop-blur-sm"
      >
        <div className="modal-box">
          <h3 className="mb-4 text-lg font-bold">
            {editingId ? 'Edit Debt' : 'Add Debt'}
          </h3>

          <form onSubmit={handleSubmit} className="space-y-4">
            {/* Name */}
            <div className="form-control">
              <label className="label">
                <span className="label-text">Debt Name (e.g. Credit Card)</span>
              </label>
              <input
                type="text"
                className="input input-bordered w-full"
                placeholder="Name"
                required
                value={formData.name}
                onChange={(e) =>
                  setFormData({ ...formData, name: e.target.value })
                }
              />
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
                    placeholder="15000.00"
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
                      setFormData({
                        ...formData,
                        currency: e.target.value as 'USD' | 'EUR',
                      })
                    }
                  >
                    <option value="USD">USD</option>
                    <option value="EUR">EUR</option>
                  </select>
                </div>
              </div>
            </div>

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
                className="btn btn-primary"
                disabled={isSubmitting}
              >
                {isSubmitting && (
                  <span className="loading loading-spinner"></span>
                )}
                {editingId ? 'Save Changes' : 'Add Debt'}
              </button>
            </div>
          </form>
        </div>
        <form method="dialog" className="modal-backdrop">
          <button type="button" onClick={handleCloseModal}>close</button>
        </form>
      </dialog>
    </div>
  );
}
