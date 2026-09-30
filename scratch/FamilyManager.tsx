'use client';

import { useState, useEffect, useRef, useMemo } from 'react';
import { useAuth } from '@/context/AuthProvider';
import { FiPlus, FiTrash2, FiUser, FiActivity, FiEdit2, FiSettings, FiDollarSign } from 'react-icons/fi';
import {
  getFamilyMembersAction,
  addFamilyMemberAction,
  deleteFamilyMemberAction,
  getMemberTransactionsAction,
  addMemberTransactionAction,
  deleteMemberTransactionAction,
  updateMemberTransactionAction,
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
  const txModal = useRef<HTMLDialogElement>(null);
  const detailsModal = useRef<HTMLDialogElement>(null);

  // UI States
  const [newMemberName, setNewMemberName] = useState('');
  const [editingTxId, setEditingTxId] = useState<string | null>(null);
  const [selectedSymbolForDetails, setSelectedSymbolForDetails] = useState<string | null>(null);

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
      const sym = tx.symbol.toUpperCase();
      const isCash = sym === 'CASH' || sym === 'USD' || sym === 'EUR';
      const actualSym = isCash ? 'CASH' : sym;

      if (!summariesMap[actualSym]) {
        summariesMap[actualSym] = {
          symbol: actualSym,
          totalAmount: 0,
          totalInvested: 0,
          averageCost: 0,
          currency: isCash ? tx.currency : 'USD', // Normalized to USD for stocks mostly
          currentPrice: isCash ? 1 : (pricesMap[actualSym] || tx.price), 
          marketValue: 0,
          unrealizedPnl: 0,
        };
      }
      
      summariesMap[actualSym].totalAmount += tx.amount;
      summariesMap[actualSym].totalInvested += (tx.amount * tx.price);
    });

    const finalSummaries = Object.values(summariesMap).map(s => {
      if (s.symbol === 'CASH') {
        s.averageCost = 1;
        s.currentPrice = 1;
        s.marketValue = s.totalAmount; // Assuming amount is the currency value in USD
        s.unrealizedPnl = 0;
      } else {
        s.averageCost = s.totalAmount > 0 ? s.totalInvested / s.totalAmount : 0;
        s.marketValue = s.totalAmount * s.currentPrice;
        s.unrealizedPnl = s.marketValue - s.totalInvested;
      }
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

  const handleSaveTransaction = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user || !selectedMember) return;

    const payload = {
      symbol: txForm.symbol,
      amount: parseFloat(txForm.amount),
      price: parseFloat(txForm.price),
      date: txForm.date,
      currency: txForm.currency,
    };

    let res;
    if (editingTxId) {
      res = await updateMemberTransactionAction(user.uid, selectedMember.id, editingTxId, payload);
    } else {
      res = await addMemberTransactionAction(user.uid, selectedMember.id, payload);
    }

    if (res.success) {
      closeTxModal();
      await loadTransactions(selectedMember.id);
    } else {
      alert('Error saving transaction: ' + res.message);
    }
  };

  const handleDeleteTransaction = async (txId: string) => {
    if (!user || !selectedMember || !confirm('Delete transaction?')) return;
    const res = await deleteMemberTransactionAction(user.uid, selectedMember.id, txId);
    if (res.success) {
      await loadTransactions(selectedMember.id);
    }
  };

  const openTxModal = (tx?: FamilyTransaction) => {
    if (tx) {
      setEditingTxId(tx.id);
      setTxForm({
        symbol: tx.symbol,
        amount: tx.amount.toString(),
        price: tx.original_price?.toString() || tx.price.toString(),
        currency: tx.original_currency || 'USD',
        date: tx.date,
      });
    } else {
      setEditingTxId(null);
      setTxForm({ symbol: '', amount: '', price: '', currency: 'USD', date: new Date().toISOString().split('T')[0] });
    }
    txModal.current?.showModal();
  };

  const closeTxModal = () => {
    txModal.current?.close();
    setEditingTxId(null);
  };

  const openDetailsModal = (symbol: string) => {
    setSelectedSymbolForDetails(symbol);
    detailsModal.current?.showModal();
  };

  const filteredTxs = useMemo(() => {
    if (!selectedSymbolForDetails) return [];
    if (selectedSymbolForDetails === 'CASH') {
      return transactions.filter(t => t.symbol === 'CASH' || t.symbol === 'USD' || t.symbol === 'EUR');
    }
    return transactions.filter(t => t.symbol === selectedSymbolForDetails);
  }, [transactions, selectedSymbolForDetails]);

  const totalInvestedAll = assetSummaries.reduce((sum, s) => sum + s.totalInvested, 0);
  const totalMarketValueAll = assetSummaries.reduce((sum, s) => sum + s.marketValue, 0);
  const totalPnlAll = totalMarketValueAll - totalInvestedAll;

  const formatMoney = (val: number) => {
    return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(val);
  };

  if (loading && members.length === 0) {
    return (
      <div className="flex justify-center items-center h-96">
        <span className="loading loading-spinner loading-lg text-primary"></span>
      </div>
    );
  }

  return (
    <div className="space-y-8 max-w-7xl mx-auto">
      {/* Header & Tabs */}
      <div className="flex flex-col md:flex-row justify-between items-center gap-4">
        <div className="tabs tabs-boxed bg-base-200/50 backdrop-blur-xl border border-base-content/10 p-1 rounded-2xl shadow-sm">
          {members.map(member => (
            <button
              key={member.id}
              className={`tab tab-lg rounded-xl transition-all duration-300 ${selectedMember?.id === member.id ? 'bg-primary text-primary-content font-bold shadow-md' : 'hover:bg-base-300/50'}`}
              onClick={() => setSelectedMember(member)}
            >
              <FiUser className="mr-2" /> {member.name}
            </button>
          ))}
          <button
            className="tab tab-lg text-primary font-bold hover:bg-primary/10 rounded-xl transition-colors"
            onClick={() => newMemberModal.current?.showModal()}
          >
            <FiPlus className="mr-1" /> Add
          </button>
        </div>

        {selectedMember && (
          <div className="dropdown dropdown-end">
            <label tabIndex={0} className="btn btn-ghost btn-circle text-base-content/50 hover:text-error transition-colors">
              <FiSettings size={20} />
            </label>
            <ul tabIndex={0} className="dropdown-content z-[1] menu p-2 shadow-xl bg-base-100/90 backdrop-blur-lg rounded-box w-52 border border-error/20">
              <li>
                <button 
                  className="text-error hover:bg-error/10 hover:text-error"
                  onClick={() => handleDeleteMember(selectedMember.id)}
                >
                  <FiTrash2 /> Delete Profile
                </button>
              </li>
            </ul>
          </div>
        )}
      </div>

      {selectedMember && (
        <div className="space-y-8 animate-fade-in">
          {/* Header Stats */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="stat bg-gradient-to-br from-base-100/80 to-base-200/80 backdrop-blur-xl border border-base-content/5 shadow-xl rounded-3xl p-6">
              <div className="stat-figure text-primary/80">
                <div className="p-4 bg-primary/10 rounded-2xl">
                  <FiDollarSign size={32} />
                </div>
              </div>
              <div className="stat-title text-base-content/60 font-medium">Total Portfolio Value</div>
              <div className="stat-value text-4xl mt-2">{formatMoney(totalMarketValueAll)}</div>
              <div className="stat-desc mt-2 text-sm font-medium">Invested: {formatMoney(totalInvestedAll)}</div>
            </div>
            
            <div className="stat bg-gradient-to-br from-base-100/80 to-base-200/80 backdrop-blur-xl border border-base-content/5 shadow-xl rounded-3xl p-6">
              <div className="stat-figure text-secondary/80">
                <div className="p-4 bg-secondary/10 rounded-2xl">
                  <FiActivity size={32} />
                </div>
              </div>
              <div className="stat-title text-base-content/60 font-medium">Total Profit / Loss</div>
              <div className={`stat-value text-4xl mt-2 ${totalPnlAll >= 0 ? 'text-success' : 'text-error'}`}>
                {totalPnlAll > 0 ? '+' : ''}{formatMoney(totalPnlAll)}
              </div>
              <div className="stat-desc mt-2 text-sm font-medium">
                {totalInvestedAll > 0 ? ((totalPnlAll / totalInvestedAll) * 100).toFixed(2) : 0}% Return
              </div>
            </div>
          </div>

          <div className="flex justify-between items-center px-2">
            <h2 className="text-2xl font-black tracking-tight text-base-content/90">Holdings</h2>
            <button 
              className="btn btn-primary shadow-lg shadow-primary/30 rounded-full px-6"
              onClick={() => openTxModal()}
            >
              <FiPlus size={18} /> Add Asset / Cash
            </button>
          </div>

          {/* Assets Table */}
          <div className="card bg-base-100/60 backdrop-blur-xl border border-base-content/5 shadow-2xl overflow-hidden rounded-3xl">
            <div className="overflow-x-auto">
              <table className="table table-lg">
                <thead className="bg-base-200/50 text-base-content/70">
                  <tr>
                    <th className="font-semibold text-sm">Asset</th>
                    <th className="text-right font-semibold text-sm">Total Qty</th>
                    <th className="text-right font-semibold text-sm">Avg Cost</th>
                    <th className="text-right font-semibold text-sm">Current Price</th>
                    <th className="text-right font-semibold text-sm">Market Value</th>
                    <th className="text-right font-semibold text-sm">Total PnL</th>
                  </tr>
                </thead>
                <tbody>
                  {assetSummaries.map(s => (
                    <tr 
                      key={s.symbol} 
                      className="hover:bg-base-200/30 cursor-pointer transition-colors border-b border-base-content/5 last:border-0"
                      onClick={() => openDetailsModal(s.symbol)}
                    >
                      <td>
                        <div className="flex items-center gap-3">
                          <div className={`w-10 h-10 rounded-xl flex items-center justify-center font-bold shadow-inner ${s.symbol === 'CASH' ? 'bg-success/20 text-success' : 'bg-primary/20 text-primary'}`}>
                            {s.symbol === 'CASH' ? '$' : s.symbol.charAt(0)}
                          </div>
                          <div>
                            <div className="font-bold text-base">{s.symbol}</div>
                            <div className="text-xs opacity-60">{s.symbol === 'CASH' ? 'Available Balance' : 'Equity'}</div>
                          </div>
                        </div>
                      </td>
                      <td className="text-right font-mono font-medium">{s.symbol === 'CASH' ? formatMoney(s.totalAmount) : s.totalAmount.toFixed(4).replace(/\.?0+$/, '')}</td>
                      <td className="text-right font-mono opacity-80">{s.symbol === 'CASH' ? '-' : formatMoney(s.averageCost)}</td>
                      <td className="text-right font-mono opacity-80">{s.symbol === 'CASH' ? '-' : formatMoney(s.currentPrice)}</td>
                      <td className="text-right font-mono font-bold">{formatMoney(s.marketValue)}</td>
                      <td className="text-right">
                        {s.symbol === 'CASH' ? (
                          <span className="opacity-30">-</span>
                        ) : (
                          <div className={`badge badge-lg font-bold border-0 ${s.unrealizedPnl >= 0 ? 'bg-success/20 text-success' : 'bg-error/20 text-error'}`}>
                            {s.unrealizedPnl > 0 ? '+' : ''}{formatMoney(s.unrealizedPnl)}
                          </div>
                        )}
                      </td>
                    </tr>
                  ))}
                  {assetSummaries.length === 0 && (
                    <tr>
                      <td colSpan={6} className="text-center opacity-50 py-16">
                        <div className="flex flex-col items-center gap-2">
                          <div className="p-4 bg-base-200 rounded-full mb-2"><FiActivity size={32} /></div>
                          <p className="font-medium text-lg">No assets yet</p>
                          <p className="text-sm">Click "Add Asset" to start tracking the portfolio.</p>
                        </div>
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* --- MODALS --- */}

      {/* Details Modal */}
      <dialog ref={detailsModal} className="modal modal-bottom sm:modal-middle backdrop-blur-sm">
        <div className="modal-box bg-base-100/95 backdrop-blur-xl border border-base-content/10 shadow-2xl rounded-3xl max-w-3xl">
          <div className="flex justify-between items-center mb-6">
            <h3 className="font-black text-2xl flex items-center gap-3">
              <div className={`w-12 h-12 rounded-2xl flex items-center justify-center font-bold text-xl shadow-inner ${selectedSymbolForDetails === 'CASH' ? 'bg-success/20 text-success' : 'bg-primary/20 text-primary'}`}>
                {selectedSymbolForDetails === 'CASH' ? '$' : selectedSymbolForDetails?.charAt(0)}
              </div>
              {selectedSymbolForDetails} Transactions
            </h3>
            <button className="btn btn-sm btn-circle btn-ghost" onClick={() => detailsModal.current?.close()}>✕</button>
          </div>
          
          <div className="overflow-x-auto rounded-2xl border border-base-content/5">
            <table className="table table-zebra">
              <thead className="bg-base-200/50">
                <tr>
                  <th>Date</th>
                  <th className="text-right">Qty</th>
                  <th className="text-right">Price</th>
                  <th className="text-right">Total Value</th>
                  <th className="text-center">Action</th>
                </tr>
              </thead>
              <tbody>
                {filteredTxs.map(tx => {
                  const parts = tx.date.split('-');
                  const displayDate = parts.length === 3 ? `${parts[2]}/${parts[1]}/${parts[0]}` : tx.date;
                  return (
                    <tr key={tx.id}>
                      <td className="font-medium opacity-80">{displayDate}</td>
                      <td className="text-right font-mono">{tx.amount}</td>
                      <td className="text-right font-mono text-sm">
                        {tx.original_price && tx.original_currency !== 'USD' 
                          ? `${tx.original_price} ${tx.original_currency}`
                          : formatMoney(tx.price)}
                      </td>
                      <td className="text-right font-mono font-bold text-primary">{formatMoney(tx.amount * tx.price)}</td>
                      <td className="text-center">
                        <button 
                          className="btn btn-ghost btn-xs text-primary/70 hover:text-primary mr-1"
                          onClick={() => {
                            detailsModal.current?.close();
                            openTxModal(tx);
                          }}
                        >
                          <FiEdit2 size={14} />
                        </button>
                        <button 
                          className="btn btn-ghost btn-xs text-error/70 hover:text-error"
                          onClick={() => handleDeleteTransaction(tx.id)}
                        >
                          <FiTrash2 size={14} />
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
        <form method="dialog" className="modal-backdrop">
          <button>close</button>
        </form>
      </dialog>

      {/* Add Member Modal */}
      <dialog ref={newMemberModal} className="modal modal-bottom sm:modal-middle backdrop-blur-sm">
        <div className="modal-box bg-base-100/95 backdrop-blur-xl border border-base-content/10 rounded-3xl">
          <h3 className="font-black text-xl mb-4">Add Family Member</h3>
          <form onSubmit={handleAddMember} className="space-y-6">
            <div className="form-control">
              <label className="label font-medium">Name</label>
              <input 
                required 
                type="text" 
                className="input input-lg input-bordered bg-base-200/50 rounded-2xl" 
                placeholder="e.g. Lina"
                value={newMemberName}
                onChange={e => setNewMemberName(e.target.value)}
              />
            </div>
            <div className="modal-action">
              <button type="button" className="btn btn-ghost rounded-full px-6" onClick={() => newMemberModal.current?.close()}>Cancel</button>
              <button type="submit" className="btn btn-primary rounded-full px-8 shadow-lg shadow-primary/30">Create Profile</button>
            </div>
          </form>
        </div>
        <form method="dialog" className="modal-backdrop">
          <button>close</button>
        </form>
      </dialog>

      {/* Add/Edit Transaction Modal */}
      <dialog ref={txModal} className="modal modal-bottom sm:modal-middle backdrop-blur-sm">
        <div className="modal-box bg-base-100/95 backdrop-blur-xl border border-base-content/10 shadow-2xl rounded-3xl">
          <h3 className="font-black text-2xl mb-6">{editingTxId ? 'Edit Transaction' : 'New Transaction'}</h3>
          <form onSubmit={handleSaveTransaction} className="space-y-4">
            
            <div className="form-control">
              <label className="label font-medium">Asset (Ticker or CASH)</label>
              <input 
                required 
                type="text" 
                className="input input-lg input-bordered bg-base-200/50 rounded-2xl uppercase tracking-wider font-bold" 
                placeholder="e.g. SXR8 or CASH"
                value={txForm.symbol}
                onChange={e => setTxForm({...txForm, symbol: e.target.value.toUpperCase()})}
              />
              <label className="label">
                <span className="label-text-alt opacity-60">Type "CASH" to add funds.</span>
              </label>
            </div>
            
            <div className="grid grid-cols-2 gap-4">
              <div className="form-control">
                <label className="label font-medium">Quantity</label>
                <input 
                  required 
                  type="text"
                  inputMode="decimal"
                  className="input input-bordered bg-base-200/50 rounded-2xl font-mono text-lg" 
                  placeholder="e.g. 0.5"
                  value={txForm.amount}
                  onChange={e => {
                    const val = e.target.value.replace(/,/g, '.');
                    if (/^[\d.]*$/.test(val)) setTxForm({...txForm, amount: val});
                  }}
                />
              </div>
              <div className="form-control">
                <label className="label font-medium">Price per Unit</label>
                <input 
                  required 
                  type="text"
                  inputMode="decimal"
                  className="input input-bordered bg-base-200/50 rounded-2xl font-mono text-lg" 
                  placeholder="e.g. 520.40"
                  value={txForm.price}
                  onChange={e => {
                    const val = e.target.value.replace(/,/g, '.');
                    if (/^[\d.]*$/.test(val)) setTxForm({...txForm, price: val});
                  }}
                  disabled={txForm.symbol === 'CASH' || txForm.symbol === 'USD'}
                />
                {(txForm.symbol === 'CASH' || txForm.symbol === 'USD') && (
                  <label className="label"><span className="label-text-alt opacity-60">Fixed at 1 for cash</span></label>
                )}
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="form-control">
                <label className="label font-medium">Currency</label>
                <select 
                  className="select select-bordered bg-base-200/50 rounded-2xl font-bold"
                  value={txForm.currency}
                  onChange={e => setTxForm({...txForm, currency: e.target.value})}
                >
                  <option value="USD">USD ($)</option>
                  <option value="EUR">EUR (€)</option>
                  <option value="TRY">TRY (₺)</option>
                </select>
              </div>
              <div className="form-control">
                <label className="label font-medium">Date</label>
                <input 
                  required 
                  type="date" 
                  className="input input-bordered bg-base-200/50 rounded-2xl font-mono" 
                  value={txForm.date}
                  onChange={e => setTxForm({...txForm, date: e.target.value})}
                />
              </div>
            </div>

            <div className="modal-action mt-8">
              <button type="button" className="btn btn-ghost rounded-full px-6" onClick={closeTxModal}>Cancel</button>
              <button type="submit" className="btn btn-primary rounded-full px-8 shadow-lg shadow-primary/30">
                {editingTxId ? 'Save Changes' : 'Save Transaction'}
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
