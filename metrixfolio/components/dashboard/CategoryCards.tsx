'use client';

import { FC, useState, useRef, useMemo } from 'react';
import Link from 'next/link';
import { useCurrencyConverter } from '@/hooks/useCurrencyConverter';
import { FiArrowUp, FiArrowDown, FiCheck, FiAlertTriangle, FiActivity, FiPieChart, FiSun } from 'react-icons/fi';
import dynamic from 'next/dynamic';
import { useAuth } from '@/context/AuthProvider';
import { updateCategoryTargetAction } from '@/actions/categories';
import { Asset } from '@/types/positions';

const CategoryChart = dynamic(() => import('./charts/CategoryChart'), {
  ssr: false,
});
import { PortfolioHistory } from '@/types/history';

interface CategoryData {
  id: string;
  name: string;
  value: number;
  actual_percentage: number;
  target_percentage: number;
  color?: string;
}

interface CategoryCardsProps {
  categories: CategoryData[];
  history: PortfolioHistory[];
  assets?: Asset[];
  totalPortfolioValue?: number;
  selectedCurrency?: string;
}

export const CategoryCards: FC<CategoryCardsProps> = ({
  categories,
  history,
  assets = [],
  totalPortfolioValue = 0,
  selectedCurrency = 'USD',
}) => {
  const { user } = useAuth();
  const [selectedCategory, setSelectedCategory] = useState<CategoryData | null>(null);
  const [editingTarget, setEditingTarget] = useState<number>(0);
  const [isSaving, setIsSaving] = useState(false);
  const modalRef = useRef<HTMLDialogElement>(null);
  
  const { convert } = useCurrencyConverter();
  const ccy = selectedCurrency;
  
  const formatCcy = (val: number) => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: ccy,
      minimumFractionDigits: 0,
      maximumFractionDigits: 2,
    }).format(val);
  };

  const handleCardClick = (cat: CategoryData) => {
    setSelectedCategory(cat);
    setEditingTarget(cat.target_percentage);
    modalRef.current?.showModal();
  };

  const otherCategoriesSum = useMemo(() => {
    if (!selectedCategory) return 0;
    return categories
      .filter(c => c.id !== selectedCategory.id && c.id !== 'uncategorized' && !c.id.includes('options'))
      .reduce((sum, c) => sum + (c.target_percentage || 0), 0);
  }, [selectedCategory, categories]);

  const maxAllowedTarget = 100 - otherCategoriesSum;

  const chartData = useMemo(() => {
    if (!selectedCategory || !history || history.length === 0) return [];

    return history
      .map((day) => {
        const alloc = day.allocation.find(
          (a) => a.category_id === selectedCategory.id,
        );
        return {
          date: new Date(day.date).toLocaleDateString('en-US', {
            month: 'short',
            day: 'numeric',
          }),
          value: alloc ? convert(alloc.value, 'USD', ccy) : 0,
          fullDate: day.date,
        };
      })
      .filter((d) => d.value > 0);
  }, [selectedCategory, history, convert, ccy]);

  const optionsMetrics = useMemo(() => {
    let sellAssignmentRisk = 0;
    let buyPremiumPaid = 0;

    assets.forEach(a => {
      if (a.category_id === 'options_sell') {
        const strike = parseFloat(a.strike || '0');
        const multiplier = a.multiplier || 100;
        const contracts = Math.abs(a.amount); 
        const premium = Math.abs(a.avg_cost || 0);
        // Sometimes avg_cost already accounts for the multiplier, but normally it's price per share.
        // Let's assume standard pricing where (strike - premium) is price per share.
        const riskInAssetCurrency = (strike - premium) * multiplier * contracts;
        sellAssignmentRisk += convert(riskInAssetCurrency, a.currency || 'USD', ccy);
      } else if (a.category_id === 'options_buy') {
        const contracts = Math.abs(a.amount);
        const multiplier = a.multiplier || 100;
        const premium = Math.abs(a.avg_cost || 0);
        const costInAssetCurrency = premium * multiplier * contracts;
        buyPremiumPaid += convert(costInAssetCurrency, a.currency || 'USD', ccy);
      }
    });

    return { sellAssignmentRisk, buyPremiumPaid };
  }, [assets, convert, ccy]);

  const sortedCategories = [...categories].sort((a, b) => {
    const ORDER = ['uncategorized', 'defensive', 'growth', 'cash', 'crypto', 'others', 'options_sell', 'options_buy'];
    const indexA = ORDER.indexOf(a.id);
    const indexB = ORDER.indexOf(b.id);
    const sortA = indexA === -1 ? 99 : indexA;
    const sortB = indexB === -1 ? 99 : indexB;
    return sortA - sortB;
  });

  return (
    <>
      <dialog ref={modalRef} className="modal modal-bottom sm:modal-middle">
        <div className="modal-box w-11/12 max-w-3xl">
          {selectedCategory && (
            <>
              <h3
                className="text-lg font-bold"
                style={{ color: selectedCategory.color }}
              >
                {selectedCategory.name} Analysis
              </h3>

              <div className="mt-4 h-75 w-full">
                {chartData.length > 1 ? (
                  <CategoryChart chartData={chartData} color={selectedCategory.color || '#3ABFF8'} />
                ) : (
                  <div className="flex h-full flex-col items-center justify-center opacity-50">
                    <FiPieChart className="mb-2 text-4xl" />
                    <p>Not enough history data to display chart.</p>
                  </div>
                )}
              </div>

              <div className="mt-4 grid grid-cols-2 gap-4 text-sm">
                <div className="bg-base-200/50 backdrop-blur-sm rounded-lg p-3 border border-base-content/5">
                  <div className="opacity-60">Current Value</div>
                  <div className="text-xl font-bold">
                    {formatCcy(convert(selectedCategory.value, 'USD', ccy))}
                  </div>
                </div>
                <div className="bg-base-200/50 backdrop-blur-sm rounded-lg p-3 border border-base-content/5">
                  <div className="opacity-60">Allocation</div>
                  <div className="text-xl font-bold">
                    {selectedCategory.actual_percentage.toFixed(2)}%
                  </div>
                </div>
                </div>
                
                {!selectedCategory.id.includes('options') && selectedCategory.id !== 'uncategorized' && (
                  <div className="mt-6 bg-base-200/50 backdrop-blur-sm rounded-lg p-4 border border-base-content/5">
                    <div className="flex justify-between mb-2">
                      <span className="font-bold">Target Allocation</span>
                      <span className="font-bold text-primary">{editingTarget}%</span>
                    </div>
                    <input 
                      type="range" 
                      min="0" 
                      max="100" 
                      value={editingTarget} 
                      onChange={(e) => {
                        const val = parseInt(e.target.value);
                        if (val <= maxAllowedTarget) {
                          setEditingTarget(val);
                        } else {
                          setEditingTarget(maxAllowedTarget);
                        }
                      }}
                      className="range range-primary" 
                    />
                    <div className="flex justify-between text-xs opacity-50 px-2 mt-2">
                      <span>0%</span>
                      <span>Max: {maxAllowedTarget}%</span>
                    </div>
                    
                    {editingTarget !== selectedCategory.target_percentage && (
                      <div className="mt-4 flex justify-end">
                        <button 
                          className="btn btn-primary btn-sm"
                          disabled={isSaving}
                          onClick={async () => {
                            if (user) {
                              setIsSaving(true);
                              await updateCategoryTargetAction(user.uid, selectedCategory.id, editingTarget);
                              setIsSaving(false);
                              modalRef.current?.close();
                              // Since we rely on SWR in usePortfolio, it will revalidate periodically,
                              // but to force an update we could mutate. 
                              // For now, reload the page is simplest or let SWR handle it.
                              window.location.reload();
                            }
                          }}
                        >
                          {isSaving ? <span className="loading loading-spinner" /> : 'Save Target'}
                        </button>
                      </div>
                    )}
                  </div>
                )}
              </>
          )}
          <div className="modal-action">
            <form method="dialog">
              <button className="btn">Close</button>
            </form>
          </div>
        </div>
        <form method="dialog" className="modal-backdrop">
          <button>close</button>
        </form>
      </dialog>

      <div className="grid grid-cols-1 gap-6 md:grid-cols-2 lg:grid-cols-4">
        {sortedCategories.map((cat) => {
          const isUncategorized = cat.id === 'uncategorized';
          const isShortCategory = cat.target_percentage < 0;
          const absActual = Math.abs(cat.actual_percentage);
          const absTarget = Math.abs(cat.target_percentage);

          // For short categories: "overexposed" means abs(actual) > abs(target)
          // For long categories: standard actual > target logic
          const diff = isShortCategory
            ? absActual - absTarget
            : cat.actual_percentage - cat.target_percentage;

          // Dynamic margin: 10% of the target percentage, with a minimum tolerance of 1.0% to avoid flickering on very small targets
          const dynamicMargin = Math.max(absTarget * 0.10, 1.0);
          const isBalanced = Math.abs(diff) <= dynamicMargin;
          const isOverexposed = diff > dynamicMargin;
          const isUnderexposed = diff < -dynamicMargin;

          let statusColor = 'text-success';
          let badgeClass = 'badge-success/10 text-success border-success/20';
          let Icon = FiCheck;
          let statusText = 'Balanced';
          let progressColor = 'progress-success';
          let rebalanceHint = '';

          const lastHistory =
            history.length > 0 ? history[history.length - 2] : null;
          const prevAlloc = lastHistory?.allocation.find(
            (a) => a.category_id === cat.id,
          );
          
          const cCatValue = convert(cat.value, 'USD', ccy);
          const cPrevAllocVal = prevAlloc ? convert(prevAlloc.value, 'USD', ccy) : 0;
          const cDailyPnl = prevAlloc ? cCatValue - cPrevAllocVal : 0;
          const isProfit = cDailyPnl >= 0;

          if (!isUncategorized) {
            if (isShortCategory) {
              if (isOverexposed) {
                statusColor = 'text-secondary';
                badgeClass = 'badge-secondary/10 text-secondary border-secondary/20';
                Icon = FiArrowDown;
                statusText = `Over-exposed (${diff.toFixed(1)}%)`;
                progressColor = 'progress-secondary';
                rebalanceHint = 'Consider closing positions';
              } else if (isUnderexposed) {
                statusColor = 'text-info';
                badgeClass = 'badge-info/10 text-info border-info/20';
                Icon = FiArrowUp;
                statusText = `Under-exposed (${diff.toFixed(1)}%)`;
                progressColor = 'progress-info';
                rebalanceHint = 'Short budget available';
              } else {
                statusText = 'Short On Target';
              }
            } else {
              if (isOverexposed) {
                statusColor = 'text-error';
                badgeClass = 'badge-error/10 text-error border-error/20';
                Icon = FiArrowUp;
                statusText = `Overweight (+${diff.toFixed(1)}%)`;
                progressColor = 'progress-error';
                rebalanceHint = 'Consider trimming';
              } else if (isUnderexposed) {
                statusColor = 'text-warning';
                badgeClass = 'badge-warning/10 text-warning border-warning/20';
                Icon = FiArrowDown;
                statusText = `Underweight (${diff.toFixed(1)}%)`;
                progressColor = 'progress-warning';
                rebalanceHint = 'Consider adding';
              }
            }
          }

          if (isUncategorized) {
            return (
              <div
                key={cat.id}
                className="card bg-warning/10 backdrop-blur-md border-warning/30 relative overflow-hidden border shadow-md transition-all hover:shadow-lg h-full"
              >
                <div className="text-warning/10 absolute -top-6 -right-6">
                  <FiAlertTriangle size={120} />
                </div>
                <div className="card-body relative z-10 flex flex-col h-full">
                  <h3 className="card-title text-warning flex items-center gap-2">
                    <FiAlertTriangle /> Action Needed
                  </h3>
                  <p className="text-sm opacity-80">
                    You have{' '}
                    <span className="font-bold">
                      {formatCcy(cCatValue)}
                    </span>{' '}
                    in uncategorized assets.
                  </p>
                  <div className="card-actions mt-auto justify-end pt-4">
                    <Link href="/positions" className="btn btn-warning btn-sm">
                      Fix Positions
                    </Link>
                  </div>
                </div>
              </div>
            );
          }

          if (cat.id === 'options_sell') {
            const isDanger = optionsMetrics.sellAssignmentRisk > totalPortfolioValue;
            
            return (
              <div
                key={cat.id}
                onClick={() => handleCardClick(cat)}
                className="card bg-base-100/50 backdrop-blur-md cursor-pointer border-2 shadow-sm transition-all duration-300 hover:scale-[1.02] hover:shadow-md h-full"
                style={{ borderColor: cat.color ? `${cat.color}40` : 'transparent' }}
              >
                <div className="card-body p-5 flex flex-col h-full">
                  <div className="mb-2">
                    <div className="flex items-center justify-between gap-2">
                      <span className="min-w-0 truncate text-xs font-bold tracking-wider uppercase opacity-50">
                        {cat.name}
                      </span>
                      <div
                        className={`badge ${isDanger ? 'badge-error/10 text-error border-error/20' : 'badge-success/10 text-success border-success/20'} shrink-0 gap-1 whitespace-nowrap text-xs font-bold`}
                      >
                        {isDanger ? <FiAlertTriangle /> : <FiSun />} {isDanger ? 'High Risk' : 'Safe'}
                      </div>
                    </div>
                    <span className="text-2xl font-extrabold tracking-tight">
                      {formatCcy(cCatValue)}
                    </span>
                  <div className="flex items-center text-xs font-bold invisible mt-1">
                    <FiActivity className="mr-1" /> $0.00 (0.00%)
                  </div>
                </div>
                
                <div className="mt-auto w-full pt-4">
                  <div className="space-y-1">
                    <div className="flex justify-between text-xs font-semibold">
                      <span className="opacity-60">Total Assignment Risk</span>
                      <span className={isDanger ? 'text-error' : 'text-success'}>
                        {formatCcy(optionsMetrics.sellAssignmentRisk)}
                      </span>
                    </div>
                    <progress
                      className={`progress w-full ${isDanger ? 'progress-error' : 'progress-success'}`}
                      value={totalPortfolioValue > 0 ? Math.min((optionsMetrics.sellAssignmentRisk / totalPortfolioValue) * 100, 100) : 0}
                      max={100}
                    ></progress>
                  </div>

                  <div className="mt-3 flex items-center justify-between text-xs font-semibold opacity-60">
                    <span>Portfolio Coverage</span>
                    <span className={isDanger ? 'text-error' : 'text-success'}>
                      {totalPortfolioValue > 0 ? ((optionsMetrics.sellAssignmentRisk / totalPortfolioValue) * 100).toFixed(1) : 0}%
                    </span>
                  </div>
                </div>
                </div>
              </div>
            );
          }

          if (cat.id === 'options_buy') {
            return (
              <div
                key={cat.id}
                onClick={() => handleCardClick(cat)}
                className="card bg-base-100/50 backdrop-blur-md cursor-pointer border-2 shadow-sm transition-all duration-300 hover:scale-[1.02] hover:shadow-md h-full"
                style={{ borderColor: cat.color ? `${cat.color}40` : 'transparent' }}
              >
                <div className="card-body p-5 flex flex-col h-full">
                  <div className="mb-2">
                    <div className="flex items-center justify-between gap-2">
                      <span className="min-w-0 truncate text-xs font-bold tracking-wider uppercase opacity-50">
                        {cat.name}
                      </span>
                    </div>
                    <span className="text-2xl font-extrabold tracking-tight">
                      {formatCcy(cCatValue)}
                    </span>
                  <div className="flex items-center text-xs font-bold invisible mt-1">
                    <FiActivity className="mr-1" /> $0.00 (0.00%)
                  </div>
                </div>
                
                <div className="mt-auto w-full pt-4">
                  <div className="space-y-1">
                    <div className="flex justify-between text-xs font-semibold">
                      <span className="opacity-60">Total Premium Paid</span>
                      <span>
                        {formatCcy(optionsMetrics.buyPremiumPaid)}
                      </span>
                    </div>
                    <progress
                      className="progress w-full progress-info"
                      value={totalPortfolioValue > 0 ? Math.min((optionsMetrics.buyPremiumPaid / totalPortfolioValue) * 100, 100) : 0}
                      max={100}
                    ></progress>
                  </div>

                  <div className="mt-3 flex items-center justify-between text-xs font-semibold opacity-60">
                    <span>Portfolio Allocation</span>
                    <span className="text-info">
                      {totalPortfolioValue > 0 ? ((optionsMetrics.buyPremiumPaid / totalPortfolioValue) * 100).toFixed(1) : 0}%
                    </span>
                  </div>
                </div>
                </div>
              </div>
            );
          }

          return (
            <div
              key={cat.id}
              onClick={() => handleCardClick(cat)}
              className="card bg-base-100/50 backdrop-blur-md cursor-pointer border-2 shadow-sm transition-all duration-300 hover:scale-[1.02] hover:shadow-md h-full"
              style={{ borderColor: cat.color ? `${cat.color}40` : 'transparent' }}
            >
              <div className="card-body p-5 flex flex-col h-full">
                <div className="mb-2">
                  <div className="flex items-center justify-between gap-2">
                    <span className="min-w-0 truncate text-xs font-bold tracking-wider uppercase opacity-50">
                      {cat.name}
                    </span>
                    <div
                      className={`badge ${badgeClass} shrink-0 gap-1 whitespace-nowrap text-xs font-bold`}
                    >
                      <Icon /> {statusText}
                    </div>
                  </div>
                  <span className="text-2xl font-extrabold tracking-tight">
                    {formatCcy(cCatValue)}
                  </span>
                  <div className={`flex items-center text-xs font-bold ${isProfit ? 'text-success' : 'text-error'} mt-1 ${prevAlloc ? 'visible' : 'invisible'}`}>
                    {isProfit ? <FiArrowUp className="mr-1" /> : <FiArrowDown className="mr-1" />}
                    {formatCcy(Math.abs(cDailyPnl))} ({isProfit ? '+' : ''}{(prevAlloc && prevAlloc.value !== 0 ? (cDailyPnl / Math.abs(cPrevAllocVal)) * 100 : 0).toFixed(2)}%)
                  </div>
                </div>

                <div className="mt-auto w-full pt-4">
                  <div className="space-y-1">
                    <div className="flex justify-between text-xs font-semibold">
                      <span className={statusColor}>
                        {cat.actual_percentage.toFixed(1)}% Actual
                      </span>
                      <span className="opacity-50">
                        {cat.target_percentage.toFixed(1)}% Target
                      </span>
                    </div>
                    <progress
                      className={`progress w-full ${progressColor}`}
                      value={absTarget > 0 ? Math.min((absActual / absTarget) * 100, 150) : 0}
                      max={100}
                    ></progress>
                  </div>

                  <div className={`mt-3 flex items-center gap-1 text-xs opacity-60 ${!isBalanced ? 'visible' : 'invisible'}`}>
                    <FiActivity />
                    {rebalanceHint || 'Balanced'}
                  </div>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </>
  );
};
