'use client';

import { useState, useEffect, useRef } from 'react';
import { useAuth } from '@/context/AuthProvider';
import { FiPlus, FiTrash2, FiUser, FiActivity } from 'react-icons/fi';
import {
  getFamilyMembersAction,
  addFamilyMemberAction,
  deleteFamilyMemberAction,
  getMemberTransactionsAction,
  addMemberTransactionAction,
  deleteMemberTransactionAction,
} from '@/actions/family';
import { getAssetsAction } from '@/actions/positions';
import { FamilyMember, FamilyTransaction, FamilyAssetSummary } from '@/types/family';

export default function FamilyManager() {
  const { user } = useAuth();
  const [members, setMembers] = useState<FamilyMember[]>([]);
  const [selectedMember, setSelectedMember] = useState<FamilyMember | null>(null);
  const [transactions, setTransactions] = useState<FamilyTransaction[]>([]);
  const [assetSummaries, setAssetSummaries] = useState<FamilyAssetSummary[]>([]);
  const [loading, setLoading] = useState(true);

  // Modals
  const newMemberModal = useRef<HTMLDialogElement>(null);
  const newTransactionModal = useRef<HTMLDialogElement>(null);

  // Forms
  const [newMemberName, setNewMemberName] = useState('');
  const [txForm, setTxForm] = useState({
    symbol: '',
    amount: '',
    price: '',
    currency: 'USD',
    date: new Date().toISOString().split('T')[0],
  });

  useEffect(() => {
    if (user) {
      loadMembers();
    }
  }, [user]);

  useEffect(() => {
    if (user && selectedMember) {
      loadTransactions(selectedMember.id);
    }
  }, [user, selectedMember]);

  const loadMembers = async () => {
    if (!user) return;
    const data = await getFamilyMembersAction(user.uid);
    setMembers(data);
    if (data.length > 0 && !selectedMember) {
      setSelectedMember(data[0]);
    }
    setLoading(false);
  };

  const loadTransactions = async (memberId: string) => {
    if (!user) return;
    setLoading(true);
    const txData = await getMemberTransactionsAction(user.uid, memberId);
    setTransactions(txData);
    
    // Process summaries
    const assetsData = await getAssetsAction(user.uid);
    const pricesMap: Record<string, number> = {};
    assetsData.forEach(a => pricesMap[a.symbol] = a.current_price);

    const summariesMap: Record<string, FamilyAssetSummary> = {};

    txData.forEach(tx => {
      if (!summariesMap[tx.symbol]) {
        summariesMap[tx.symbol] = {
          symbol: tx.symbol,
          totalAmount: 0,
          totalInvested: 0,
          averageCost: 0,
          currency: tx.currency,
          currentPrice: pricesMap[tx.symbol] || tx.price, // Fallback to last tx price
          marketValue: 0,
          unrealizedPnl: 0,
        };
      }
      summariesMap[tx.symbol].totalAmount += tx.amount;
      summariesMap[tx.symbol].totalInvested += (tx.amount * tx.price);
    });

    const finalSummaries = Object.values(summariesMap).map(s => {
      s.averageCost = s.totalAmount > 0 ? s.totalInvested / s.totalAmount : 0;
      s.marketValue = s.totalAmount * s.currentPrice;
      s.unrealizedPnl = s.marketValue - s.totalInvested;
      return s;
    });

    setAssetSummaries(finalSummaries);
    setLoading(false);
  };

  const handleAddMember = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user || !newMemberName.trim()) return;

    const res = await addFamilyMemberAction(user.uid, newMemberName);
    if (res.success) {
      setNewMemberName('');
      newMemberModal.current?.close();
      await loadMembers();
    } else {
      alert('Error adding member: ' + res.message);
    }
  };

  const handleDeleteMember = async (memberId: string) => {
    if (!user || !confirm('Are you sure you want to delete this profile and ALL its transactions?')) return;
    const res = await deleteFamilyMemberAction(user.uid, memberId);
    if (res.success) {
      if (selectedMember?.id === memberId) setSelectedMember(null);
      await loadMembers();
    }
  };

  const handleAddTransaction = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user || !selectedMember) return;

    const res = await addMemberTransactionAction(user.uid, selectedMember.id, {
      symbol: txForm.symbol,
      amount: parseFloat(txForm.amount),
      price: parseFloat(txForm.price),
      date: txForm.date,
      currency: txForm.currency,
    });

    if (res.success) {
      setTxForm({ symbol: '', amount: '', price: '', currency: 'USD', date: new Date().toISOString().split('T')[0] });
      newTransactionModal.current?.close();
      await loadTransactions(selectedMember.id);
    } else {
      alert('Error adding transaction: ' + res.message);
    }
  };

  const handleDeleteTransaction = async (txId: string) => {
    if (!user || !selectedMember || !confirm('Delete transaction?')) return;
    const res = await deleteMemberTransactionAction(user.uid, selectedMember.id, txId);
    if (res.success) {
      await loadTransactions(selectedMember.id);
    }
  };

  const totalInvestedAll = assetSummaries.reduce((sum, s) => sum + s.totalInvested, 0);
  const totalMarketValueAll = assetSummaries.reduce((sum, s) => sum + s.marketValue, 0);
  const totalPnlAll = totalMarketValueAll - totalInvestedAll;

  const formatMoney = (val: number) => {
    return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(val);
  };

  if (loading && members.length === 0) {
    return <div className="loading loading-spinner loading-lg"></div>;
  }

  return (
    <div className="space-y-6">
      {/* Member Tabs */}
      <div className="flex items-center gap-4">
        <div className="tabs tabs-boxed bg-base-100/50 backdrop-blur-md border border-base-content/5">
          {members.map(member => (
            <button
              key={member.id}
              className={`tab ${selectedMember?.id === member.id ? 'tab-active bg-primary text-primary-content' : ''}`}
              onClick={() => setSelectedMember(member)}
            >
              <FiUser className="mr-2" /> {member.name}
            </button>
          ))}
          <button
            className="tab text-primary font-bold"
            onClick={() => newMemberModal.current?.showModal()}
          >
            <FiPlus className="mr-1" /> Add Person
          </button>
        </div>
      </div>

      {selectedMember && (
        <div className="space-y-6 animate-fade-in">
          {/* Header Stats */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="stat bg-base-100/50 backdrop-blur-md border border-base-content/5 shadow-lg rounded-box">
              <div className="stat-figure text-primary">
                <FiActivity size={32} />
              </div>
              <div className="stat-title text-base-content/70">Total Invested for {selectedMember.name}</div>
              <div className="stat-value text-primary">{formatMoney(totalInvestedAll)}</div>
            </div>
            
            <div className="stat bg-base-100/50 backdrop-blur-md border border-base-content/5 shadow-lg rounded-box">
              <div className="stat-figure text-secondary">
                <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" className="inline-block w-8 h-8 stroke-current"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M13 10V3L4 14h7v7l9-11h-7z"></path></svg>
              </div>
              <div className="stat-title text-base-content/70">Total PnL</div>
              <div className={`stat-value ${totalPnlAll >= 0 ? 'text-success' : 'text-error'}`}>
                {totalPnlAll > 0 ? '+' : ''}{formatMoney(totalPnlAll)}
              </div>
              <div className="stat-desc">Current Value: {formatMoney(totalMarketValueAll)}</div>
            </div>
          </div>

          <div className="flex justify-between items-center">
            <h2 className="text-xl font-bold">Assets</h2>
            <button 
              className="btn btn-primary btn-sm"
              onClick={() => newTransactionModal.current?.showModal()}
            >
              <FiPlus /> New Buy
            </button>
          </div>

          {/* Assets Table */}
          <div className="card bg-base-100/50 backdrop-blur-md border border-base-content/5 shadow-xl">
            <div className="overflow-x-auto">
              <table className="table">
                <thead>
                  <tr>
                    <th>Symbol</th>
                    <th className="text-right">Total Qty</th>
                    <th className="text-right">Avg Cost</th>
                    <th className="text-right">Current Price</th>
                    <th className="text-right">Invested</th>
                    <th className="text-right">Value</th>
                    <th className="text-right">PnL</th>
                  </tr>
                </thead>
                <tbody>
                  {assetSummaries.map(s => (
                    <tr key={s.symbol} className="hover">
                      <td className="font-bold">{s.symbol}</td>
                      <td className="text-right font-mono">{s.totalAmount}</td>
                      <td className="text-right font-mono">{formatMoney(s.averageCost)}</td>
                      <td className="text-right font-mono text-base-content/70">{formatMoney(s.currentPrice)}</td>
                      <td className="text-right font-mono">{formatMoney(s.totalInvested)}</td>
                      <td className="text-right font-mono">{formatMoney(s.marketValue)}</td>
                      <td className={`text-right font-bold font-mono ${s.unrealizedPnl >= 0 ? 'text-success' : 'text-error'}`}>
                        {s.unrealizedPnl > 0 ? '+' : ''}{formatMoney(s.unrealizedPnl)}
                      </td>
                    </tr>
                  ))}
                  {assetSummaries.length === 0 && (
                    <tr>
                      <td colSpan={7} className="text-center opacity-50 py-8">No assets found. Add a transaction first.</td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>

          {/* Transactions Table */}
          <h2 className="text-xl font-bold mt-8">Transaction History</h2>
          <div className="card bg-base-100/50 backdrop-blur-md border border-base-content/5 shadow-xl">
            <div className="overflow-x-auto">
              <table className="table">
                <thead>
                  <tr>
                    <th>Date</th>
                    <th>Symbol</th>
                    <th className="text-right">Qty</th>
                    <th className="text-right">Price</th>
                    <th className="text-right">Total</th>
                    <th className="text-right">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {transactions.map(tx => {
                    const parts = tx.date.split('-');
                    const displayDate = parts.length === 3 ? `${parts[2]}/${parts[1]}/${parts[0]}` : tx.date;
                    return (
                      <tr key={tx.id} className="hover">
                        <td className="opacity-70">{displayDate}</td>
                        <td className="font-bold">
                          {tx.symbol}
                          <div className="text-xs font-normal opacity-50">
                            {tx.original_price && tx.original_currency !== 'USD' 
                              ? `(${tx.original_price} ${tx.original_currency})` 
                              : ''}
                          </div>
                        </td>
                        <td className="text-right font-mono">{tx.amount}</td>
                        <td className="text-right font-mono">{formatMoney(tx.price)}</td>
                        <td className="text-right font-mono">{formatMoney(tx.amount * tx.price)}</td>
                        <td className="text-right">
                          <button 
                            className="btn btn-ghost btn-xs text-error"
                            onClick={() => handleDeleteTransaction(tx.id)}
                          >
                            <FiTrash2 />
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                  {transactions.length === 0 && (
                    <tr>
                      <td colSpan={6} className="text-center opacity-50 py-8">No transactions found.</td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>

          {/* Delete Member Button */}
          <div className="pt-4 flex justify-end">
            <button 
              className="btn btn-outline btn-error btn-sm"
              onClick={() => handleDeleteMember(selectedMember.id)}
            >
              <FiTrash2 className="mr-2" /> Delete Profile "{selectedMember.name}"
            </button>
          </div>
        </div>
      )}

      {/* Add Member Modal */}
      <dialog ref={newMemberModal} className="modal modal-bottom sm:modal-middle">
        <div className="modal-box bg-base-100/90 backdrop-blur-md border border-base-content/10">
          <h3 className="font-bold text-lg">Add Family Member</h3>
          <form onSubmit={handleAddMember} className="py-4 space-y-4">
            <div className="form-control">
              <label className="label">Name</label>
              <input 
                required 
                type="text" 
                className="input input-bordered" 
                placeholder="e.g. Lina"
                value={newMemberName}
                onChange={e => setNewMemberName(e.target.value)}
              />
            </div>
            <div className="modal-action">
              <button type="button" className="btn btn-ghost" onClick={() => newMemberModal.current?.close()}>Cancel</button>
              <button type="submit" className="btn btn-primary">Create</button>
            </div>
          </form>
        </div>
        <form method="dialog" className="modal-backdrop">
          <button>close</button>
        </form>
      </dialog>

      {/* Add Transaction Modal */}
      <dialog ref={newTransactionModal} className="modal modal-bottom sm:modal-middle">
        <div className="modal-box bg-base-100/90 backdrop-blur-md border border-base-content/10">
          <h3 className="font-bold text-lg">New Buy Transaction for {selectedMember?.name}</h3>
          <form onSubmit={handleAddTransaction} className="py-4 space-y-4">
            <div className="form-control">
              <label className="label">Symbol / Ticker</label>
              <input 
                required 
                type="text" 
                className="input input-bordered uppercase" 
                placeholder="e.g. SXR8"
                value={txForm.symbol}
                onChange={e => setTxForm({...txForm, symbol: e.target.value.toUpperCase()})}
              />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="form-control">
                <label className="label">Quantity</label>
                <input 
                  required 
                  type="number" 
                  step="any"
                  className="input input-bordered" 
                  placeholder="e.g. 0.5"
                  value={txForm.amount}
                  onChange={e => setTxForm({...txForm, amount: e.target.value})}
                />
              </div>
              <div className="form-control">
                <label className="label">Price per Unit</label>
                <input 
                  required 
                  type="number" 
                  step="any"
                  className="input input-bordered" 
                  placeholder="e.g. 520.40"
                  value={txForm.price}
                  onChange={e => setTxForm({...txForm, price: e.target.value})}
                />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="form-control">
                <label className="label">Currency</label>
                <select 
                  className="select select-bordered"
                  value={txForm.currency}
                  onChange={e => setTxForm({...txForm, currency: e.target.value})}
                >
                  <option value="USD">USD ($)</option>
                  <option value="EUR">EUR (€)</option>
                  <option value="TRY">TRY (₺)</option>
                </select>
              </div>
              <div className="form-control">
                <label className="label">Date</label>
                <input 
                  required 
                  type="date" 
                  className="input input-bordered" 
                  value={txForm.date}
                  onChange={e => setTxForm({...txForm, date: e.target.value})}
                />
              </div>
            </div>
            <div className="modal-action">
              <button type="button" className="btn btn-ghost" onClick={() => newTransactionModal.current?.close()}>Cancel</button>
              <button type="submit" className="btn btn-primary">Save Buy</button>
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
