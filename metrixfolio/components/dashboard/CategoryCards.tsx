'use client';

import { FC, useState, useRef, useMemo } from 'react';
import Link from 'next/link';
import { useCurrencyConverter } from '@/hooks/useCurrencyConverter';
import {
  FiArrowUp,
  FiArrowDown,
  FiCheck,
  FiAlertTriangle,
  FiActivity,
  FiPieChart,
  FiSun,
  FiChevronRight,
} from 'react-icons/fi';
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

const computeProgressValue = (actualPct: number, targetPct: number) => {
  if (targetPct > 0) {
    if (actualPct <= 0) return 0;
    return Math.min((actualPct / targetPct) * 100, 100);
  }
  if (targetPct < 0) {
    if (actualPct >= 0) return 0;
    return Math.min((Math.abs(actualPct) / Math.abs(targetPct)) * 100, 100);
  }
  return 0;
};

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

  const sortedCategories = useMemo(() => {
    const ORDER: Record<string, number> = {
      uncategorized: 0,
      cash: 10,
      defensive: 20,
      growth: 30,
      options_sell: 40,
      options_buy: 41,
      options: 42,
      crypto: 50,
      others: 90,
    };
    return [...categories].sort((a, b) => {
      const sortA = ORDER[a.id] ?? 60;
      const sortB = ORDER[b.id] ?? 60;
      return sortA - sortB;
    });
  }, [categories]);

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
                    <div className="flex justify-between items-center mb-2">
                      <span className="font-bold">Target Allocation</span>
                      <div className="flex items-center gap-1">
                        <input 
                          type="number"
                          className="input input-bordered input-sm w-20 text-primary font-bold text-right"
                          value={editingTarget}
                          onChange={(e) => {
                            let val = parseInt(e.target.value);
                            if (isNaN(val)) val = 0;
                            
                            if (val > 100) {
                              setEditingTarget(selectedCategory.target_percentage);
                            } else if (val > maxAllowedTarget) {
                              setEditingTarget(maxAllowedTarget);
                            } else {
                              setEditingTarget(val);
                            }
                          }}
                          min="0"
                          max={maxAllowedTarget}
                        />
                        <span className="font-bold text-primary">%</span>
                      </div>
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
                    
                    <div className="mt-4 flex justify-end">
                      <button 
                        className="btn btn-primary btn-sm"
                        disabled={isSaving || editingTarget === selectedCategory.target_percentage}
                        onClick={async () => {
                          if (user) {
                            setIsSaving(true);
                            await updateCategoryTargetAction(user.uid, selectedCategory.id, editingTarget);
                            selectedCategory.target_percentage = editingTarget;
                            setIsSaving(false);
                            modalRef.current?.close();
                            window.location.reload();
                          }
                        }}
                      >
                        {isSaving ? <span className="loading loading-spinner loading-xs" /> : <FiCheck />}
                        Save Changes
                      </button>
                    </div>
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

      <div className="flex flex-col gap-3">
        <div className="flex items-center justify-between px-1 mb-1">
          <h2 className="text-xl font-bold flex items-center gap-2">
            <span>🏷️</span> Category Allocations
          </h2>
          <span className="text-xs opacity-50 hidden sm:inline">
            Click any category to view history or adjust target
          </span>
        </div>

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

          const progressValue = computeProgressValue(
            cat.actual_percentage,
            cat.target_percentage,
          );

          if (isUncategorized) {
            return (
              <div
                key={cat.id}
                className="card bg-warning/10 backdrop-blur-md border border-warning/30 shadow-sm p-4 rounded-2xl"
              >
                <div className="grid grid-cols-1 sm:grid-cols-12 items-center gap-4 w-full">
                  <div className="sm:col-span-4 flex items-center gap-3 min-w-0">
                    <div className="w-10 h-10 rounded-xl bg-warning/20 text-warning flex items-center justify-center shrink-0">
                      <FiAlertTriangle size={20} />
                    </div>
                    <div className="min-w-0">
                      <h3 className="font-bold text-sm text-warning truncate">
                        Uncategorized Assets
                      </h3>
                      <span className="badge badge-warning/20 text-warning border-warning/30 badge-xs font-semibold py-1 px-1.5 mt-0.5">
                        Action Needed
                      </span>
                    </div>
                  </div>

                  <div className="sm:col-span-4 flex flex-col items-start sm:items-center justify-center text-left sm:text-center min-w-0">
                    <span className="text-lg sm:text-xl font-extrabold tracking-tight">
                      {formatCcy(cCatValue)}
                    </span>
                    <span className="text-xs text-base-content/60 mt-0.5">
                      Needs Classification
                    </span>
                  </div>

                  <div className="sm:col-span-4 flex items-center justify-end w-full">
                    <Link
                      href="/positions"
                      className="btn btn-warning btn-sm shrink-0"
                    >
                      Fix Positions
                    </Link>
                  </div>
                </div>
              </div>
            );
          }

          if (cat.id === 'options_sell') {
            const isDanger = optionsMetrics.sellAssignmentRisk > totalPortfolioValue;
            const coveragePct =
              totalPortfolioValue > 0
                ? (optionsMetrics.sellAssignmentRisk / totalPortfolioValue) * 100
                : 0;
            
            return (
              <div
                key={cat.id}
                onClick={() => handleCardClick(cat)}
                className="card bg-base-100/60 backdrop-blur-md cursor-pointer border border-base-content/10 shadow-sm transition-all duration-200 hover:border-primary/40 hover:shadow-md hover:bg-base-100 p-4 rounded-2xl group"
              >
                <div className="grid grid-cols-1 sm:grid-cols-12 items-center gap-4 w-full">
                  {/* Category Name & Color Bar (Left) */}
                  <div className="sm:col-span-4 flex items-center gap-3 min-w-0">
                    <div
                      className="w-1.5 h-10 rounded-full shrink-0"
                      style={{ backgroundColor: cat.color || '#ef4444' }}
                    />
                    <div className="flex flex-col min-w-0">
                      <span className="font-bold text-base text-base-content truncate group-hover:text-primary transition-colors">
                        {cat.name}
                      </span>
                      <div className="flex items-center gap-1.5 mt-0.5">
                        <span
                          className={`badge ${
                            isDanger
                              ? 'badge-error/10 text-error border-error/20'
                              : 'badge-success/10 text-success border-success/20'
                          } badge-xs font-semibold gap-1 py-1 px-1.5 shrink-0`}
                        >
                          {isDanger ? <FiAlertTriangle size={10} /> : <FiSun size={10} />}
                          {isDanger ? 'High Risk' : 'Safe'}
                        </span>
                        <span className="text-[11px] opacity-50 truncate hidden xl:inline-block">
                          • Short Option Exposure
                        </span>
                      </div>
                    </div>
                  </div>

                  {/* Value & Metrics (Center - vertically straight line) */}
                  <div className="sm:col-span-4 flex flex-col items-start sm:items-center justify-center text-left sm:text-center min-w-0">
                    <span className="text-lg sm:text-xl font-extrabold tracking-tight">
                      {formatCcy(cCatValue)}
                    </span>
                    <span className="text-xs text-base-content/60 mt-0.5">
                      Assignment Risk: <span className={isDanger ? 'text-error font-bold' : 'font-semibold'}>{formatCcy(optionsMetrics.sellAssignmentRisk)}</span>
                    </span>
                  </div>

                  {/* Progress & Portfolio Coverage (Right - completely right-aligned) */}
                  <div className="sm:col-span-4 flex items-center justify-end gap-2 w-full min-w-0">
                    <div className="w-full flex flex-col justify-center">
                      <div className="flex items-center justify-between text-xs font-semibold mb-1">
                        <span className="opacity-60">Portfolio Coverage</span>
                        <span className={isDanger ? 'text-error font-bold' : 'text-success font-bold'}>
                          {coveragePct.toFixed(1)}%
                        </span>
                      </div>
                      <progress
                        className={`progress w-full h-2 ${isDanger ? 'progress-error' : 'progress-success'}`}
                        value={Math.min(coveragePct, 100)}
                        max={100}
                      />
                    </div>

                    <div className="hidden sm:flex items-center text-base-content/20 group-hover:text-primary group-hover:translate-x-0.5 transition-all shrink-0 pl-1">
                      <FiChevronRight size={18} />
                    </div>
                  </div>
                </div>
              </div>
            );
          }

          if (cat.id === 'options_buy') {
            const allocPct =
              totalPortfolioValue > 0
                ? (optionsMetrics.buyPremiumPaid / totalPortfolioValue) * 100
                : 0;

            return (
              <div
                key={cat.id}
                onClick={() => handleCardClick(cat)}
                className="card bg-base-100/60 backdrop-blur-md cursor-pointer border border-base-content/10 shadow-sm transition-all duration-200 hover:border-primary/40 hover:shadow-md hover:bg-base-100 p-4 rounded-2xl group"
              >
                <div className="grid grid-cols-1 sm:grid-cols-12 items-center gap-4 w-full">
                  {/* Category Name & Color Bar (Left) */}
                  <div className="sm:col-span-4 flex items-center gap-3 min-w-0">
                    <div
                      className="w-1.5 h-10 rounded-full shrink-0"
                      style={{ backgroundColor: cat.color || '#84cc16' }}
                    />
                    <div className="flex flex-col min-w-0">
                      <span className="font-bold text-base text-base-content truncate group-hover:text-primary transition-colors">
                        {cat.name}
                      </span>
                      <div className="flex items-center gap-1.5 mt-0.5">
                        <span className="badge badge-info/10 text-info border-info/20 badge-xs font-semibold gap-1 py-1 px-1.5 shrink-0">
                          <FiActivity size={10} /> Long Option
                        </span>
                        <span className="text-[11px] opacity-50 truncate hidden xl:inline-block">
                          • Premium Capital
                        </span>
                      </div>
                    </div>
                  </div>

                  {/* Value & Metrics (Center - vertically straight line) */}
                  <div className="sm:col-span-4 flex flex-col items-start sm:items-center justify-center text-left sm:text-center min-w-0">
                    <span className="text-lg sm:text-xl font-extrabold tracking-tight">
                      {formatCcy(cCatValue)}
                    </span>
                    <span className="text-xs text-base-content/60 mt-0.5">
                      Premium Paid: <span className="font-semibold">{formatCcy(optionsMetrics.buyPremiumPaid)}</span>
                    </span>
                  </div>

                  {/* Progress & Portfolio Allocation (Right - completely right-aligned) */}
                  <div className="sm:col-span-4 flex items-center justify-end gap-2 w-full min-w-0">
                    <div className="w-full flex flex-col justify-center">
                      <div className="flex items-center justify-between text-xs font-semibold mb-1">
                        <span className="opacity-60">Portfolio Allocation</span>
                        <span className="text-info font-bold">{allocPct.toFixed(1)}%</span>
                      </div>
                      <progress
                        className="progress w-full h-2 progress-info"
                        value={Math.min(allocPct, 100)}
                        max={100}
                      />
                    </div>

                    <div className="hidden sm:flex items-center text-base-content/20 group-hover:text-primary group-hover:translate-x-0.5 transition-all shrink-0 pl-1">
                      <FiChevronRight size={18} />
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
              className="card bg-base-100/60 backdrop-blur-md cursor-pointer border border-base-content/10 shadow-sm transition-all duration-200 hover:border-primary/40 hover:shadow-md hover:bg-base-100 p-4 rounded-2xl group"
            >
              <div className="grid grid-cols-1 sm:grid-cols-12 items-center gap-4 w-full">
                {/* Category Name & Color Bar (Left) */}
                <div className="sm:col-span-4 flex items-center gap-3 min-w-0">
                  <div
                    className="w-1.5 h-10 rounded-full shrink-0"
                    style={{ backgroundColor: cat.color || '#3ABFF8' }}
                  />
                  <div className="flex flex-col min-w-0">
                    <span className="font-bold text-base text-base-content truncate group-hover:text-primary transition-colors">
                      {cat.name}
                    </span>
                    <div className="flex items-center gap-1.5 mt-0.5">
                      <span className={`badge ${badgeClass} badge-xs font-semibold gap-1 py-1 px-1.5 shrink-0`}>
                        <Icon size={10} /> {statusText}
                      </span>
                      {rebalanceHint && (
                        <span className="text-[11px] opacity-50 truncate hidden xl:inline-block">
                          • {rebalanceHint}
                        </span>
                      )}
                    </div>
                  </div>
                </div>

                {/* Value & Daily PnL (Center - vertically straight line) */}
                <div className="sm:col-span-4 flex flex-col items-start sm:items-center justify-center text-left sm:text-center min-w-0">
                  <span className="text-lg sm:text-xl font-extrabold tracking-tight">
                    {formatCcy(cCatValue)}
                  </span>
                  <div
                    className={`flex items-center text-xs font-semibold ${
                      isProfit ? 'text-success' : 'text-error'
                    } mt-0.5 ${prevAlloc ? 'visible' : 'invisible'}`}
                  >
                    {isProfit ? <FiArrowUp className="mr-0.5 shrink-0" size={12} /> : <FiArrowDown className="mr-0.5 shrink-0" size={12} />}
                    <span>{formatCcy(Math.abs(cDailyPnl))}</span>
                    <span className="ml-1 opacity-80 text-[11px]">
                      ({isProfit ? '+' : ''}
                      {(prevAlloc && prevAlloc.value !== 0
                        ? (cDailyPnl / Math.abs(cPrevAllocVal)) * 100
                        : 0
                      ).toFixed(1)}%)
                    </span>
                  </div>
                </div>

                {/* Progress Bar & Target vs Actual (Right - completely right-aligned) */}
                <div className="sm:col-span-4 flex items-center justify-end gap-2 w-full min-w-0">
                  <div className="w-full flex flex-col justify-center">
                    <div className="flex items-center justify-between text-xs font-semibold mb-1">
                      <span className={statusColor}>
                        {cat.actual_percentage.toFixed(1)}% <span className="text-base-content/60 font-normal">Actual</span>
                      </span>
                      <span className="text-base-content/70">
                        {cat.target_percentage.toFixed(1)}% <span className="opacity-50 font-normal">Target</span>
                      </span>
                    </div>
                    <progress
                      className={`progress w-full h-2 ${progressColor}`}
                      value={progressValue}
                      max={100}
                    />
                  </div>

                  <div className="hidden sm:flex items-center text-base-content/20 group-hover:text-primary group-hover:translate-x-0.5 transition-all shrink-0 pl-1">
                    <FiChevronRight size={18} />
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
