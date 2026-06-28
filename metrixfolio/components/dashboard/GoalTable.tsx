'use client';

import { formatCurrency } from '@/utils/functions';
import { FC, useEffect, useState, useRef } from 'react';
import {
  FiCheckCircle,
  FiTarget,
  FiSettings,
  FiSave,
  FiX,
} from 'react-icons/fi';
import {
  checkMilestonesAction,
  getGrowthWidgetAction,
  saveGrowthSettingsAction,
  GrowthWidgetData,
} from '@/actions/widget-actions';
import { useAuth } from '@/context/AuthProvider';

interface GoalTableProps {
  currentValue: number;
}

export const GoalTable: FC<GoalTableProps> = ({ currentValue }) => {
  const { user } = useAuth();
  const activeRowRef = useRef<HTMLTableRowElement>(null);
  const settingsModalRef = useRef<HTMLDialogElement>(null);

  const [config, setConfig] = useState<GrowthWidgetData>({
    growthRate: 10,
    baseAmount: 1000,
    milestones: [],
  });

  const [editForm, setEditForm] = useState({
    growthRate: '10',
    baseAmount: '1000',
  });

  const [tableData, setTableData] = useState<any[]>([]);
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    if (!user) return;
    loadData();
  }, [user]);

  const loadData = async () => {
    if (!user) return;
    const data = await getGrowthWidgetAction(user.uid);
    if (data) {
      setConfig(data);
      setEditForm({
        growthRate: data.growthRate.toString(),
        baseAmount: (data.baseAmount ?? 1000).toString(),
      });
    } else {
      // Auto-create default config for new users
      await saveGrowthSettingsAction(user.uid, {
        growthRate: 10,
        baseAmount: 1000,
      });
    }
  };

  useEffect(() => {
    if (!user || currentValue <= 0) return;

    const timer = setTimeout(() => {
      const runCheck = async () => {
        const res = await checkMilestonesAction(user.uid, currentValue);
        if (res?.success && res.newMilestones) {
          setConfig((prev) => ({ ...prev, milestones: res.newMilestones }));
        }
      };
      runCheck();
    }, 2000);

    return () => clearTimeout(timer);
  }, [user, currentValue]);

  useEffect(() => {
    const rows = [];
    const baseVal = config.baseAmount ?? 1000;
    const rate = (config.growthRate || 10) / 100;

    // Cannot compute compound growth from 0
    if (baseVal <= 0) {
      setTableData([]);
      return;
    }

    let activeStep = 1;
    if (currentValue > baseVal) {
      activeStep =
        Math.floor(Math.log(currentValue / baseVal) / Math.log(1 + rate)) + 1;
    }

    const startStep = Math.max(1, activeStep - 5);
    const endStep = activeStep + 10;

    for (let step = startStep; step <= endStep; step++) {
      const start = baseVal * Math.pow(1 + rate, step - 1);
      const end = baseVal * Math.pow(1 + rate, step);
      const growth = end - start;
      const milestone = config.milestones?.find((m) => m.step === step);
      rows.push({
        step,
        start,
        growth,
        end,
        reachedDate: milestone?.date || null,
      });
    }
    setTableData(rows);
  }, [config, currentValue]);

  useEffect(() => {
    if (activeRowRef.current) {
      activeRowRef.current.scrollIntoView({
        behavior: 'smooth',
        block: 'nearest',
      });
    }
  }, [tableData]);

  const handleSaveSettings = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) return;
    setIsSaving(true);

    const res = await saveGrowthSettingsAction(user.uid, {
      growthRate: parseFloat(editForm.growthRate),
      baseAmount: parseFloat(editForm.baseAmount),
    });

    if (res.success) {
      await loadData();
      settingsModalRef.current?.close();
    } else {
      alert('Error: ' + res.message);
    }
    setIsSaving(false);
  };

  return (
    <div className="card bg-base-100 border-base-200 relative flex h-full flex-col border shadow-xl">
      {/* Settings Modal */}
      <dialog
        ref={settingsModalRef}
        className="modal modal-bottom sm:modal-middle"
      >
        <div className="modal-box">
          <h3 className="flex items-center gap-2 text-lg font-bold">
            <FiSettings className="text-primary" /> Growth Settings
          </h3>
          <p className="py-2 text-sm opacity-70">
            Customize your compound interest targets.
          </p>

          <form onSubmit={handleSaveSettings} className="space-y-4 pt-4">
            <div className="form-control">
              <label className="label">
                <span className="label-text font-bold">
                  Starting Principal ($)
                </span>
              </label>
              <input
                required
                type="number"
                className="input input-bordered focus:input-primary"
                value={editForm.baseAmount}
                onChange={(e) =>
                  setEditForm({ ...editForm, baseAmount: e.target.value })
                }
              />
              <label className="label">
                <span className="label-text-alt italic opacity-50">
                  The initial amount your growth table starts from.
                </span>
              </label>
            </div>

            <div className="form-control">
              <label className="label">
                <span className="label-text font-bold">
                  Target Growth Rate (%)
                </span>
              </label>
              <input
                required
                type="number"
                className="input input-bordered focus:input-primary"
                value={editForm.growthRate}
                onChange={(e) =>
                  setEditForm({ ...editForm, growthRate: e.target.value })
                }
              />
              <label className="label">
                <span className="label-text-alt italic opacity-50">
                  Percentage growth expected for each step.
                </span>
              </label>
            </div>

            <div className="modal-action">
              <button
                type="button"
                className="btn btn-ghost"
                onClick={() => settingsModalRef.current?.close()}
              >
                Cancel
              </button>
              <button
                type="submit"
                className="btn btn-primary"
                disabled={isSaving}
              >
                {isSaving ? (
                  <span className="loading loading-spinner"></span>
                ) : (
                  <FiSave />
                )}{' '}
                Save
              </button>
            </div>
          </form>
        </div>
        <form method="dialog" className="modal-backdrop">
          <button>close</button>
        </form>
      </dialog>

      <div className="card-body flex-none p-4">
        <div className="mb-2 flex items-center justify-between">
          <h2 className="card-title flex items-center gap-2 text-lg">
            Growth Targets 🚀
          </h2>
          <button
            className="btn btn-ghost btn-xs btn-circle hover:bg-primary/10 transition-colors"
            onClick={() => settingsModalRef.current?.showModal()}
            title="Settings"
          >
            <FiSettings size={16} />
          </button>
        </div>
      </div>

      <div className="max-h-125 flex-1 overflow-x-auto overflow-y-auto">
        <table className="table-pin-rows table-xs md:table-sm table">
          <thead>
            <tr>
              <th>#</th>
              <th>Start</th>
              <th>Target (End)</th>
              <th>Progress</th>
              <th>Gap (To Go)</th>
              <th>Date</th>
            </tr>
          </thead>
          <tbody>
            {tableData.map((row) => {
              const isCompleted = currentValue >= row.end;
              const isActive =
                currentValue >= row.start && currentValue < row.end;
              const gap = row.end - currentValue;

              const stepProgress = isActive
                ? Math.min(
                    100,
                    Math.max(
                      0,
                      ((currentValue - row.start) / (row.end - row.start)) *
                        100,
                    ),
                  )
                : isCompleted
                  ? 100
                  : 0;

              const progressColor =
                stepProgress < 25
                  ? 'progress-error'
                  : stepProgress < 55
                    ? 'progress-warning'
                    : stepProgress < 80
                      ? 'progress-info'
                      : 'progress-success';

              return (
                <tr
                  key={row.step}
                  ref={isActive ? activeRowRef : null}
                  className={
                    isActive
                      ? 'bg-primary/5 border-primary border-l-4 shadow-sm'
                      : isCompleted
                        ? 'opacity-60 transition-opacity hover:opacity-100'
                        : ''
                  }
                >
                  <td className="font-bold opacity-50">{row.step}</td>
                  <td className="font-mono">{formatCurrency(row.start)}</td>
                  <td
                    className={`font-mono font-bold ${isCompleted ? 'text-success' : ''}`}
                  >
                    {formatCurrency(row.end)}
                  </td>
                  <td className="w-32 align-middle">
                    {isActive ? (
                      <div className="flex flex-col gap-1">
                        <progress
                          className={`progress w-full ${progressColor}`}
                          value={stepProgress}
                          max="100"
                        ></progress>
                        <span className="text-primary text-right text-[10px] font-bold">
                          {stepProgress.toFixed(1)}%
                        </span>
                      </div>
                    ) : (
                      <progress
                        className={`progress w-full ${isCompleted ? 'progress-success' : 'opacity-30'}`}
                        value={isCompleted ? 100 : 0}
                        max="100"
                      ></progress>
                    )}
                  </td>
                  <td>
                    {isActive ? (
                      <span className="badge badge-sm badge-warning font-mono whitespace-nowrap">
                        {formatCurrency(gap)} left
                      </span>
                    ) : isCompleted ? (
                      <span className="text-success text-xs font-bold">
                        Reached
                      </span>
                    ) : (
                      <span className="opacity-30">-</span>
                    )}
                  </td>
                  <td>
                    {row.reachedDate ? (
                      <div className="badge badge-success badge-outline gap-1 text-xs whitespace-nowrap">
                        <FiCheckCircle /> {row.reachedDate}
                      </div>
                    ) : isActive ? (
                      <div className="text-primary flex animate-pulse items-center gap-1 text-xs font-bold whitespace-nowrap">
                        <FiTarget /> Current Goal
                      </div>
                    ) : (
                      <span className="opacity-30">-</span>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
};
