'use client';

import { useState, useEffect, useRef } from 'react';
import { useAuth } from '@/context/AuthProvider';
import {
  FiAlertCircle,
  FiCheckCircle,
  FiTag,
  FiEdit2,
  FiChevronUp,
  FiChevronDown,
  FiSearch,
  FiCalendar,
  FiTrash2,
} from 'react-icons/fi';
import {
  getAssetsAction,
  updateAssetAction,
  deleteAssetAction,
  purgeZeroQuantityAssetsAction,
  closeAssetAction,
  getClosedAssetsAction,
  updateClosedAssetAction,
  deleteClosedAssetAction,
} from '@/actions/positions';
import { Asset, ClosedAsset } from '@/types/positions';
import { Category } from '@/types/settings';
import { getCategoriesAction } from '@/actions/categories';
import AddManualAssetModal from './components/AddManualAssetsModal';

type SortKey =
  | 'source'
  | 'symbol'
  | 'category_id'
  | 'amount'
  | 'avg_cost'
  | 'current_price'
  | 'market_value'
  | 'unrealized_pnl';

const calculateDTE = (expiryStr: string) => {
  if (!expiryStr) return null;
  const cleaned = expiryStr.replace(/-/g, '');
  if (cleaned.length !== 8) return null;
  const year = parseInt(cleaned.substring(0, 4), 10);
  const month = parseInt(cleaned.substring(4, 6), 10) - 1;
  const day = parseInt(cleaned.substring(6, 8), 10);
  const expiryDate = new Date(year, month, day);
  const diffTime = expiryDate.getTime() - new Date().getTime();
  return Math.ceil(diffTime / (1000 * 60 * 60 * 24));
};

export default function PositionsPage() {
  const { user } = useAuth();
  const [assets, setAssets] = useState<Asset[]>([]);
  const [closedAssets, setClosedAssets] = useState<ClosedAsset[]>([]);
  const [currentTab, setCurrentTab] = useState<'OPEN' | 'CLOSED'>('OPEN');

  const [sortConfig, setSortConfig] = useState<{
    key: SortKey;
    direction: 'asc' | 'desc';
  } | null>(null);
  const [searchQuery, setSearchQuery] = useState('');

  const [categories, setCategories] = useState<Category[]>([]);
  const [selectedAsset, setSelectedAsset] = useState<any | null>(null);
  const [editForm, setEditForm] = useState({
    symbol: '',
    name: '',
    amount: '',
    avg_cost: '',
    currency: 'USD',
    category_id: '',
    close_price: '',
  });
  const [closeFormData, setCloseFormData] = useState({
    price: '',
  });

  const modalRef = useRef<HTMLDialogElement>(null);
  const closePortalRef = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    loadData();
  }, [user]);

  // Refresh data when user returns to the tab
  useEffect(() => {
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        loadData();
      }
    };
    document.addEventListener('visibilitychange', handleVisibilityChange);
    return () =>
      document.removeEventListener('visibilitychange', handleVisibilityChange);
  }, [user]);

  const loadData = async () => {
    if (!user) return;
    let [assetsData, closedData, categoriesData] = await Promise.all([
      getAssetsAction(user.uid),
      getClosedAssetsAction(user.uid),
      getCategoriesAction(user.uid),
    ]);

    // Purge zero-quantity positions in a single batch request
    const zeroQtyIds = assetsData
      .filter((a) => a.amount === 0)
      .map((a) => a.id);
    if (zeroQtyIds.length > 0) {
      await purgeZeroQuantityAssetsAction(user.uid, zeroQtyIds);
      assetsData = assetsData.filter((a) => a.amount !== 0);
    }

    setAssets(assetsData);
    setClosedAssets(closedData);
    setCategories(categoriesData);
  };

  const openEditModal = (asset: any) => {
    setSelectedAsset(asset);
    setEditForm({
      symbol: asset.symbol || '',
      name: asset.name || '',
      amount: asset.amount?.toString() || '',
      avg_cost:
        asset.original_avg_cost?.toString() || asset.avg_cost?.toString() || '',
      currency: asset.original_currency || asset.currency || 'USD',
      category_id:
        asset.category_id !== 'uncategorized' ? asset.category_id : '',
      close_price: (asset as ClosedAsset).close_price?.toString() || '',
    });
    modalRef.current?.showModal();
  };

  const handleSaveEdit = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!user || !selectedAsset) return;

    const isClosed = (selectedAsset as ClosedAsset).close_date !== undefined;

    const res = isClosed
      ? await updateClosedAssetAction(user.uid, selectedAsset.id, {
          amount: parseFloat(editForm.amount),
          avg_cost: parseFloat(editForm.avg_cost),
          close_price: parseFloat(editForm.close_price),
          currency: editForm.currency,
        })
      : await updateAssetAction(user.uid, selectedAsset.id, {
          symbol: editForm.symbol,
          name: editForm.name,
          amount: parseFloat(editForm.amount),
          avg_cost: parseFloat(editForm.avg_cost),
          currency: editForm.currency,
          category_id: editForm.category_id || 'uncategorized',
        });

    if (res.success) {
      modalRef.current?.close();
      await loadData();
    } else {
      alert('Error: ' + res.message);
    }
  };

  const openCloseModal = (asset: Asset) => {
    setSelectedAsset(asset);
    setCloseFormData({ price: asset.current_price?.toString() || '' });
    closePortalRef.current?.showModal();
  };

  const handleClosePosition = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user || !selectedAsset) return;

    const res = await closeAssetAction(
      user.uid,
      selectedAsset.id,
      parseFloat(closeFormData.price),
    );
    if (res.success) {
      closePortalRef.current?.close();
      await loadData();
    } else {
      alert('Error: ' + res.message);
    }
  };

  const handleDeleteAsset = async (assetId: string) => {
    if (!user || !confirm('Are you sure you want to delete this position?'))
      return;

    const res = await deleteAssetAction(user.uid, assetId);
    if (res.success) {
      await loadData();
    } else {
      alert('Error: ' + res.message);
    }
  };

  const handleDeleteClosedAsset = async (assetId: string) => {
    if (
      !user ||
      !confirm('Are you sure you want to delete this historical trade?')
    )
      return;

    const res = await deleteClosedAssetAction(user.uid, assetId);
    if (res.success) {
      await loadData();
    } else {
      alert('Error: ' + res.message);
    }
  };

  const calculateMarketValue = (asset: Asset) => asset.market_value || 0;

  const getCategoryName = (catId: string) => {
    const cat = categories.find((c) => c.id === catId);
    return cat ? cat.name : catId;
  };

  const formatMoney = (val: string, currency: string) => {
    const num = parseFloat(val);
    if (isNaN(num)) return '-';
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: currency,
      minimumFractionDigits: 2,
    }).format(num);
  };

  const enrichedAssets = assets.map(asset => {
    const mult = asset.multiplier || 1;
    const computedPnl = (asset.current_price - asset.avg_cost) * asset.amount * mult;
    const computedValue = asset.current_price * asset.amount * mult;
    return {
      ...asset,
      unrealized_pnl: computedPnl,
      market_value: computedValue
    };
  });

  const inboxAssets = enrichedAssets.filter((a) => a.category_id === 'uncategorized');
  const portfolioAssets = enrichedAssets.filter(
    (a) => a.category_id !== 'uncategorized',
  );

  const handleSort = (key: SortKey) => {
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

  const filteredAndSortedAssets = portfolioAssets
    .filter((asset) => {
      const q = searchQuery.toLowerCase();
      return (
        asset.symbol.toLowerCase().includes(q) ||
        asset.name.toLowerCase().includes(q) ||
        getCategoryName(asset.category_id).toLowerCase().includes(q) ||
        asset.source.toLowerCase().includes(q)
      );
    })
    .sort((a, b) => {
      if (!sortConfig) return 0;
      const { key, direction } = sortConfig;
      let valA: any = a[key as keyof Asset];
      let valB: any = b[key as keyof Asset];
      if (key === 'category_id') {
        valA = getCategoryName(a.category_id);
        valB = getCategoryName(b.category_id);
      } else if (key === 'unrealized_pnl') {
        valA = parseFloat(a.unrealized_pnl as any) || 0;
        valB = parseFloat(b.unrealized_pnl as any) || 0;
      }
      if (valA < valB) return direction === 'asc' ? -1 : 1;
      if (valA > valB) return direction === 'asc' ? 1 : -1;
      return 0;
    });

  const filteredClosedAssets = closedAssets.filter((asset) => {
    const q = searchQuery.toLowerCase();
    return (
      asset.symbol.toLowerCase().includes(q) ||
      asset.name.toLowerCase().includes(q) ||
      asset.source.toLowerCase().includes(q)
    );
  });

  const renderSortIcon = (key: SortKey) => {
    if (sortConfig?.key !== key) return null;
    return sortConfig.direction === 'asc' ? (
      <FiChevronUp className="inline" />
    ) : (
      <FiChevronDown className="inline" />
    );
  };

  const totalMarketValue = portfolioAssets.reduce(
    (sum, asset) => sum + (asset.market_value || 0),
    0,
  );
  const totalUnrealizedPnl = portfolioAssets.reduce(
    (sum, asset) => sum + (asset.unrealized_pnl || 0),
    0,
  );

  return (
    <div className="mx-auto max-w-7xl space-y-8 p-6">
      {/* Edit Modal */}
      <dialog ref={modalRef} className="modal modal-bottom sm:modal-middle">
        <div className="modal-box">
          <h3 className="flex items-center gap-2 text-lg font-bold">
            <FiEdit2 /> Edit{' '}
            {selectedAsset?.close_date ? 'Historical Trade' : 'Asset'}
          </h3>
          {selectedAsset && (
            <form onSubmit={handleSaveEdit} className="space-y-4 py-4">
              <div className="alert alert-info py-2 text-sm shadow-sm">
                <span>
                  Editing <strong>{selectedAsset.symbol}</strong> (
                  {selectedAsset.name})
                </span>
              </div>

              {!selectedAsset.close_date && (
                <div className="grid grid-cols-2 gap-4">
                  <div className="form-control">
                    <label className="label">
                      <span className="label-text">Symbol</span>
                    </label>
                    <input
                      required
                      type="text"
                      className="input input-bordered uppercase"
                      value={editForm.symbol}
                      onChange={(e) =>
                        setEditForm({
                          ...editForm,
                          symbol: e.target.value.toUpperCase(),
                        })
                      }
                    />
                  </div>
                  <div className="form-control">
                    <label className="label">
                      <span className="label-text">Name</span>
                    </label>
                    <input
                      required
                      type="text"
                      className="input input-bordered"
                      value={editForm.name}
                      onChange={(e) =>
                        setEditForm({ ...editForm, name: e.target.value })
                      }
                    />
                  </div>
                </div>
              )}

              <div className="grid grid-cols-2 gap-4">
                <div className="form-control">
                  <label className="label">
                    <span className="label-text">Quantity</span>
                  </label>
                  <input
                    required
                    type="number"
                    step="any"
                    className="input input-bordered"
                    value={editForm.amount}
                    onChange={(e) =>
                      setEditForm({ ...editForm, amount: e.target.value })
                    }
                  />
                </div>
                <div className="form-control">
                  <label className="label">
                    <span className="label-text">Avg Cost (Unit)</span>
                  </label>
                  <input
                    required
                    type="number"
                    step="any"
                    className="input input-bordered"
                    value={editForm.avg_cost}
                    onChange={(e) =>
                      setEditForm({ ...editForm, avg_cost: e.target.value })
                    }
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                {selectedAsset.close_date && (
                  <div className="form-control">
                    <label className="label">
                      <span className="label-text text-primary font-bold">
                        Exit Price (Unit)
                      </span>
                    </label>
                    <input
                      required
                      type="number"
                      step="any"
                      className="input input-bordered border-primary focus:input-primary"
                      value={editForm.close_price}
                      onChange={(e) =>
                        setEditForm({
                          ...editForm,
                          close_price: e.target.value,
                        })
                      }
                    />
                  </div>
                )}
                <div className="form-control">
                  <label className="label">
                    <span className="label-text">Currency</span>
                  </label>
                  <select
                    className="select select-bordered"
                    value={editForm.currency}
                    onChange={(e) =>
                      setEditForm({ ...editForm, currency: e.target.value })
                    }
                  >
                    <option value="USD">USD</option>
                    <option value="EUR">EUR</option>
                    <option value="TRY">TRY</option>
                  </select>
                </div>
              </div>

              {!selectedAsset.close_date && (
                <div className="form-control">
                  <label className="label">
                    <span className="label-text">Category</span>
                  </label>
                  <select
                    className="select select-bordered w-full"
                    value={editForm.category_id}
                    onChange={(e) =>
                      setEditForm({ ...editForm, category_id: e.target.value })
                    }
                  >
                    <option value="" disabled>
                      Choose a category...
                    </option>
                    {categories.map((cat) => (
                      <option key={cat.id} value={cat.id}>
                        {cat.name} ({cat.target_percentage}%)
                      </option>
                    ))}
                  </select>
                </div>
              )}

              <div className="modal-action">
                <button
                  type="button"
                  className="btn btn-ghost"
                  onClick={() => modalRef.current?.close()}
                >
                  Cancel
                </button>
                <button type="submit" className="btn btn-primary">
                  Save Changes
                </button>
              </div>
            </form>
          )}
        </div>
        <form method="dialog" className="modal-backdrop">
          <button>close</button>
        </form>
      </dialog>

      {/* Close Position Modal */}
      <dialog
        ref={closePortalRef}
        className="modal modal-bottom sm:modal-middle"
      >
        <div className="modal-box">
          <h3 className="text-primary flex items-center gap-2 text-lg font-bold">
            <FiCheckCircle /> Close Position
          </h3>
          <p className="py-4 text-sm opacity-70">
            Enter the selling price per unit for <b>{selectedAsset?.symbol}</b>{' '}
            to realize your PnL.
          </p>
          <form onSubmit={handleClosePosition} className="space-y-4">
            <div className="form-control">
              <label className="label">
                <span className="label-text font-bold">Close Price (Unit)</span>
              </label>
              <input
                required
                type="number"
                step="any"
                className="input input-bordered focus:input-primary"
                value={closeFormData.price}
                onChange={(e) => setCloseFormData({ price: e.target.value })}
                autoFocus
              />
            </div>
            <div className="modal-action">
              <button
                type="button"
                className="btn btn-ghost"
                onClick={() => closePortalRef.current?.close()}
              >
                Cancel
              </button>
              <button type="submit" className="btn btn-primary px-8">
                Confirm & Close
              </button>
            </div>
          </form>
        </div>
        <form method="dialog" className="modal-backdrop">
          <button>close</button>
        </form>
      </dialog>

      {/* Header */}
      <div className="flex flex-col items-center justify-between gap-4 md:flex-row">
        <div>
          <h1 className="text-3xl font-bold">Positions</h1>
          <p className="text-base-content/70">
            Manage your assets and categories
          </p>
        </div>
        <div className="flex flex-col items-end gap-2">
          <AddManualAssetModal categories={categories} onSuccess={loadData} />
          <div className="join bg-base-100 border-base-200 border">
            <button
              className={`join-item btn btn-sm px-6 ${currentTab === 'OPEN' ? 'btn-primary' : 'btn-ghost'}`}
              onClick={() => setCurrentTab('OPEN')}
            >
              Open
            </button>
            <button
              className={`join-item btn btn-sm px-6 ${currentTab === 'CLOSED' ? 'btn-primary' : 'btn-ghost'}`}
              onClick={() => setCurrentTab('CLOSED')}
            >
              Closed
            </button>
          </div>
        </div>
      </div>

      {/* Uncategorized Section */}
      {currentTab === 'OPEN' && inboxAssets.length > 0 && (
        <div className="card bg-warning/10 backdrop-blur-md border-warning/20 border shadow-sm">
          <div className="card-body">
            <h2 className="card-title text-warning flex items-center gap-2">
              <FiAlertCircle /> Uncategorized Assets ({inboxAssets.length})
            </h2>
            <p className="mb-4 text-sm opacity-80">
              Assign these to a category to include them in your strategy.
            </p>
            <div className="bg-transparent overflow-x-auto rounded-lg">
              <table className="table">
                <thead>
                  <tr>
                    <th>Source</th>
                    <th>Asset</th>
                    <th>Qty</th>
                    <th>Price</th>
                    <th className="text-right">Action</th>
                  </tr>
                </thead>
                <tbody>
                  {inboxAssets.map((asset) => (
                    <tr key={asset.id}>
                      <td>
                        <div className="badge badge-ghost text-xs font-bold">
                          {asset.source}
                        </div>
                      </td>
                      <td>
                        <div className="font-bold">{asset.symbol}</div>
                        <div className="text-xs opacity-50">{asset.name}</div>
                      </td>
                      <td>{asset.amount}</td>
                      <td>
                        {formatMoney(asset.current_price.toString(), 'USD')}
                      </td>
                      <td className="text-right">
                        <div className="flex justify-end gap-2">
                          <button
                            className="btn btn-xs btn-outline btn-warning"
                            onClick={() => openEditModal(asset)}
                          >
                            <FiTag /> Categorize
                          </button>
                          <button
                            className="btn btn-xs btn-outline btn-primary"
                            onClick={() => openCloseModal(asset)}
                          >
                            Close
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* Portfolio/Closed Section */}
      <div className="card bg-base-100/50 backdrop-blur-md border-base-content/5 border shadow-xl">
        <div className="card-body p-0">
          <div className="border-base-content/5 flex items-center justify-between border-b p-6">
            <h2 className="card-title flex items-center gap-2">
              {currentTab === 'OPEN' ? (
                <>
                  <FiCheckCircle className="text-success" /> Active Portfolio
                </>
              ) : (
                <>
                  <FiCalendar className="text-primary" /> Realized Performance
                </>
              )}
            </h2>
            <div className="relative">
              <FiSearch className="text-base-content/50 absolute top-1/2 left-3 -translate-y-1/2" />
              <input
                type="text"
                placeholder="Search..."
                className="input input-bordered input-sm w-full max-w-xs pl-10"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
              />
            </div>
          </div>

          <div className="overflow-x-auto">
            {currentTab === 'OPEN' ? (
              <table className="table">
                <thead>
                  <tr className="bg-base-200/50">
                    <th
                      className="hover:bg-base-200 cursor-pointer"
                      onClick={() => handleSort('source')}
                    >
                      Source {renderSortIcon('source')}
                    </th>
                    <th
                      className="hover:bg-base-200 cursor-pointer"
                      onClick={() => handleSort('symbol')}
                    >
                      Symbol {renderSortIcon('symbol')}
                    </th>
                    <th
                      className="hover:bg-base-200 cursor-pointer"
                      onClick={() => handleSort('category_id')}
                    >
                      Category {renderSortIcon('category_id')}
                    </th>
                    <th
                      className="hover:bg-base-200 cursor-pointer text-right"
                      onClick={() => handleSort('amount')}
                    >
                      Qty {renderSortIcon('amount')}
                    </th>
                    <th
                      className="hover:bg-base-200 cursor-pointer text-right"
                      onClick={() => handleSort('avg_cost')}
                    >
                      Avg Cost {renderSortIcon('avg_cost')}
                    </th>
                    <th
                      className="hover:bg-base-200 cursor-pointer text-right"
                      onClick={() => handleSort('current_price')}
                    >
                      Price {renderSortIcon('current_price')}
                    </th>
                    <th
                      className="hover:bg-base-200 cursor-pointer text-right"
                      onClick={() => handleSort('market_value')}
                    >
                      Value {renderSortIcon('market_value')}
                    </th>
                    <th
                      className="hover:bg-base-200 cursor-pointer text-right"
                      onClick={() => handleSort('unrealized_pnl')}
                    >
                      P/L {renderSortIcon('unrealized_pnl')}
                    </th>
                    <th className="text-right">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredAndSortedAssets.map((asset) => (
                    <tr key={asset.id} className="hover">
                      <td>
                        <span
                          className={`badge text-xs font-bold ${asset.source === 'IBKR' ? 'badge-error text-white' : 'badge-info text-white'}`}
                        >
                          {asset.source}
                        </span>
                      </td>
                      <td>
                        <div className="font-bold">
                          {asset.symbol}
                          {asset.type === 'OPTION' && asset.expiry && (
                            (() => {
                              const dte = calculateDTE(asset.expiry);
                              return dte !== null ? (
                                <span className={`ml-2 badge badge-xs font-bold text-white ${dte <= 14 ? 'badge-error' : dte <= 21 ? 'badge-warning' : 'badge-success'}`}>
                                  {dte} DTE
                                </span>
                              ) : null;
                            })()
                          )}
                        </div>
                        <div className="text-xs opacity-50">{asset.name}</div>
                      </td>
                      <td>
                        <div className="badge badge-outline">
                          {getCategoryName(asset.category_id)}
                        </div>
                      </td>
                      <td className="text-right font-mono">{asset.amount}</td>
                      <td className="text-right font-mono">
                        {formatMoney(asset.avg_cost.toString(), 'USD')}
                      </td>
                      <td className="text-right font-mono">
                        {formatMoney(asset.current_price.toString(), 'USD')}
                      </td>
                      <td className="text-right font-mono">
                        {formatMoney(
                          (asset.market_value || 0).toString(),
                          'USD',
                        )}
                      </td>
                      <td
                        className={`text-right font-mono font-bold ${asset.unrealized_pnl >= 0 ? 'text-success' : 'text-error'}`}
                      >
                        {asset.unrealized_pnl > 0 ? '+' : ''}
                        {formatMoney(asset.unrealized_pnl.toString(), 'USD')}
                      </td>
                      <td className="text-right">
                        <div className="flex justify-end gap-2">
                          <button
                            className="btn btn-square btn-ghost btn-xs text-info"
                            onClick={() => openEditModal(asset)}
                            title="Edit"
                          >
                            <FiEdit2 />
                          </button>
                          <button
                            className="btn btn-outline btn-primary btn-xs"
                            onClick={() => openCloseModal(asset)}
                          >
                            Close
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                  {filteredAndSortedAssets.length === 0 && (
                    <tr>
                      <td colSpan={9} className="py-8 text-center opacity-50">
                        No active assets found.
                      </td>
                    </tr>
                  )}
                </tbody>
                {portfolioAssets.length > 0 && (
                  <tfoot>
                    <tr className="bg-base-200/50 text-base-content font-bold">
                      <td colSpan={6} className="text-right">
                        TOTALS:
                      </td>
                      <td className="text-right font-mono text-lg">
                        {formatMoney(totalMarketValue.toString(), 'USD')}
                      </td>
                      <td
                        className={`text-right font-mono text-lg ${totalUnrealizedPnl >= 0 ? 'text-success' : 'text-error'}`}
                      >
                        {formatMoney(totalUnrealizedPnl.toString(), 'USD')}
                      </td>
                      <td></td>
                    </tr>
                  </tfoot>
                )}
              </table>
            ) : (
              <table className="table">
                <thead>
                  <tr className="bg-base-200/50">
                    <th>Date</th>
                    <th>Source</th>
                    <th>Asset</th>
                    <th className="text-right">Qty</th>
                    <th className="text-right">Avg Cost</th>
                    <th className="text-right">Exit Price</th>
                    <th className="text-right">Realized P/L</th>
                    <th className="text-right">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredClosedAssets.map((asset) => (
                    <tr key={asset.id} className="hover">
                      <td className="text-xs opacity-70">
                        {new Date(asset.close_date * 1000).toLocaleDateString()}
                      </td>
                      <td>
                        <span
                          className={`badge badge-xs text-[10px] font-bold ${asset.source === 'IBKR' ? 'badge-error text-white' : 'badge-info text-white'}`}
                        >
                          {asset.source}
                        </span>
                      </td>
                      <td>
                        <div className="font-bold">{asset.symbol}</div>
                        <div className="text-[10px] opacity-50">
                          {asset.name}
                        </div>
                      </td>
                      <td className="text-right font-mono">{asset.amount}</td>
                      <td className="small text-right font-mono">
                        {formatMoney(asset.avg_cost.toString(), 'USD')}
                      </td>
                      <td className="small text-primary text-right font-mono">
                        {formatMoney(asset.close_price.toString(), 'USD')}
                      </td>
                      <td
                        className={`text-right font-mono font-bold ${asset.realized_pnl >= 0 ? 'text-success' : 'text-error'}`}
                      >
                        {asset.realized_pnl > 0 ? '+' : ''}
                        {formatMoney(asset.realized_pnl.toString(), 'USD')}
                      </td>
                      <td className="text-right">
                        <div className="flex justify-end gap-2">
                          <button
                            className="btn btn-square btn-ghost btn-xs text-info"
                            onClick={() => openEditModal(asset)}
                            title="Edit Trade"
                          >
                            <FiEdit2 />
                          </button>
                          <button
                            className="btn btn-square btn-ghost btn-xs text-error"
                            onClick={() => handleDeleteClosedAsset(asset.id)}
                            title="Delete Trade"
                          >
                            <FiTrash2 />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                  {filteredClosedAssets.length === 0 && (
                    <tr>
                      <td colSpan={8} className="py-8 text-center opacity-50">
                        No closed positions yet.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
