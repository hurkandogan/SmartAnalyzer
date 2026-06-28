'use client';

import { useState } from 'react';
import { useAuth } from '@/context/AuthProvider';
import {
  addCategoryAction,
  getCategoriesAction,
  deleteCategoryAction,
  updateCategoryAction,
} from '@/actions/categories';
import { Category } from '@/types/settings';
import { FiTrash2, FiPlus, FiLoader, FiEdit2, FiX, FiCheck } from 'react-icons/fi';
import useSWR from 'swr';

// DaisyUI/Neon Color Selection
const PRESET_COLORS = [
  '#EF4444', // Red
  '#F97316', // Orange
  '#F59E0B', // Amber
  '#84CC16', // Lime
  '#10B981', // Emerald
  '#06B6D4', // Cyan
  '#3B82F6', // Blue
  '#6366F1', // Indigo
  '#8B5CF6', // Violet
  '#D946EF', // Fuchsia
  '#EC4899', // Pink
  '#F43F5E', // Rose
  '#64748B', // Slate
  '#A1A1AA', // Zinc
];

export default function CategoryManager() {
  const { user } = useAuth();

  const [name, setName] = useState('');
  const [target, setTarget] = useState(0);
  const [type, setType] = useState('ASSET');
  const [color, setColor] = useState(PRESET_COLORS[6]);

  const [isSubmitting, setIsSubmitting] = useState(false);
  const [editingCategory, setEditingCategory] = useState<(Category & { color?: string }) | null>(null);

  const {
    data: categories = [],
    error,
    isLoading,
    mutate,
  } = useSWR(user ? ['categories', user.uid] : null, ([, uid]) =>
    getCategoriesAction(uid),
  );

  const handleEditClick = (cat: Category & { color?: string }) => {
    setEditingCategory(cat);
    setName(cat.name);
    setTarget(cat.target_percentage);
    setType(cat.type as string);
    setColor(cat.color || PRESET_COLORS[6]);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const handleCancelEdit = () => {
    setEditingCategory(null);
    setName('');
    setTarget(0);
    setType('ASSET');
    setColor(PRESET_COLORS[6]);
  };

  const handleSubmit = async () => {
    if (!user || !name) return;

    if (!editingCategory) {
      const generatedId = name.trim().toLowerCase().replace(/\s+/g, '');
      if (categories.some((c) => c.id === generatedId)) {
        alert('A category with this name already exists.');
        return;
      }
      if (type === 'CASH' && hasCashCategory) {
        alert('Only one Cash category is allowed.');
        return;
      }
    }

    setIsSubmitting(true);

    let res;

    if (editingCategory) {
      res = await updateCategoryAction(user.uid, {
        id: editingCategory.id,
        name,
        target_percentage: target,
        type: type as any,
        color,
      });
    } else {
      res = await addCategoryAction(user.uid, name, target, type, color);
    }

    if (res.success) {
      handleCancelEdit();
      mutate();
    } else {
      alert('Hata: ' + res.message);
    }
    setIsSubmitting(false);
  };

  const handleDelete = async (cat: Category) => {
    if (!user || !confirm(`Delete "${cat.name}"?`)) return;
    const res = await deleteCategoryAction(user.uid, cat);
    if (res.success) mutate();
    else alert('Hata: ' + res.message);
  };

  if (isLoading) return <div className="skeleton h-32 w-full"></div>;

  // True when a CASH category exists and we're not currently editing it
  const hasCashCategory = categories.some(
    (c) => c.type === 'CASH' && c.id !== editingCategory?.id,
  );

  return (
    <div className="space-y-6">
      <div
        className={`flex flex-wrap items-end gap-4 rounded-lg border-2 p-4 transition-colors ${
          editingCategory
            ? 'bg-warning/10 backdrop-blur-md border-warning'
            : 'bg-base-200/50 backdrop-blur-md border-transparent'
        }`}
      >
        {editingCategory && (
          <div className="text-warning mb-2 flex w-full items-center gap-2 text-sm font-bold">
            <FiEdit2 /> Editing: {editingCategory.name}
          </div>
        )}

        <div className="form-control min-w-50 flex-1">
          <label className="label pb-1">
            <span className="label-text">Category Name</span>
          </label>
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="input input-bordered w-full"
            placeholder="e.g. Growth Stocks"
          />
        </div>

        <div className="form-control w-24">
          <label className="label pb-1">
            <span className="label-text">Target %</span>
          </label>
          <input
            type="number"
            value={target}
            onChange={(e) => setTarget(Number(e.target.value))}
            className="input input-bordered w-full"
          />
        </div>

        <div className="form-control w-40">
          <label className="label pb-1">
            <span className="label-text">Type</span>
          </label>
          <select
            value={type}
            onChange={(e) => setType(e.target.value)}
            className="select select-bordered w-full"
          >
            <option value="ASSET">Asset</option>
            <option value="CRYPTO">Crypto</option>
            {!hasCashCategory && <option value="CASH">Cash</option>}
          </select>
        </div>

        {/* Color Selection */}
        <div className="form-control w-full md:w-auto">
          <label className="label pb-1">
            <span className="label-text">Color</span>
          </label>
          <div className="flex flex-wrap gap-2 p-1">
            {PRESET_COLORS.map((c) => (
              <button
                key={c}
                onClick={() => setColor(c)}
                className={`h-6 w-6 rounded-full transition-transform hover:scale-110 ${
                  color === c ? 'ring-2 ring-offset-2 ring-offset-base-100 scale-110 ring-primary' : ''
                }`}
                style={{ backgroundColor: c }}
                title={c}
                type="button"
              />
            ))}
          </div>
        </div>

        <div className="flex gap-2">
          {editingCategory && (
            <button
              className="btn btn-ghost text-error"
              onClick={handleCancelEdit}
            >
              <FiX /> Cancel
            </button>
          )}

          <button
            className={`btn ${editingCategory ? 'btn-warning' : 'btn-primary'}`}
            onClick={handleSubmit}
            disabled={isSubmitting || !name}
          >
            {isSubmitting ? (
              <FiLoader className="animate-spin" />
            ) : editingCategory ? (
              'Update'
            ) : (
              <FiPlus />
            )}
            {editingCategory ? '' : 'Add'}
          </button>
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        {categories.map((cat: Category & { color?: string }) => (
          <div
            key={cat.id}
            className={`card bg-base-100/50 backdrop-blur-md border shadow-sm transition-all hover:shadow-md ${
              editingCategory?.id === cat.id
                ? 'ring-warning ring-2'
                : 'border-base-content/5'
            }`}
            style={{ borderLeft: `4px solid ${cat.color || 'transparent'}` }}
          >
            <div className="card-body flex-row items-center justify-between p-4">
              <div>
                <h3 className="font-bold">{cat.name}</h3>
                <div className="mt-1 flex gap-2 text-xs opacity-70">
                  <span className="badge badge-sm badge-ghost">{cat.type}</span>
                  <span className="badge badge-sm badge-neutral">
                    {cat.target_percentage}% Target
                  </span>
                </div>
              </div>

              <div className="flex gap-1">
                <button
                  onClick={() => handleEditClick(cat)}
                  className="btn btn-ghost btn-sm text-warning"
                  title="Edit"
                >
                  <FiEdit2 />
                </button>

                <button
                  onClick={() => handleDelete(cat)}
                  className="btn btn-ghost btn-sm text-error"
                  title="Delete"
                >
                  <FiTrash2 />
                </button>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
