'use client';
// BOUFF — Stock & cuisine : éléments communs (types, boutons, champs, sélection de produit).
import { ReactNode } from 'react';
import { formatQty } from '@/lib/bouff-data/stock-rules';

export type Product = {
  id: string;
  name: string;
  category: string;
  unit: string;
  qty: number;
  min_qty: number;
  unit_cost_fcfa: number | null;
  supplier: string | null;
  count_daily: boolean;
  is_active: boolean;
  sort_order: number;
};

export type DaySummary = {
  day: string;
  sales: number;
  expenses: number;
  expenses_caisse: number;
  expenses_count: number;
  received: number;
  received_count: number;
  losses: number;
  losses_count: number;
  count_gap: number;
  counts: string[];
  closures_gap: number;
  closures_count: number;
  hygiene: Partial<Record<'ouverture' | 'fermeture', { ok: boolean; by: string | null; at: string }>>;
  low_stock: { id: string; name: string; qty: number; min_qty: number; unit: string }[];
  money_left: number;
};

export type Ctx = {
  restaurantId: string;
  products: Product[];
  reload: () => Promise<void>;
  notify: (text: string, ok?: boolean) => void;
};

export const F = (n: number | string | null | undefined) => `${Math.round(Number(n ?? 0)).toLocaleString('fr-FR')} F`;
export const Q = formatQty;

export function errText(e: unknown): string {
  if (e && typeof e === 'object' && 'message' in e) return String((e as { message: unknown }).message);
  return 'Erreur inattendue. Réessaie.';
}

export function Card({ title, children, right }: { title?: string; children: ReactNode; right?: ReactNode }) {
  return (
    <div className="border rounded-lg p-4 dark:border-gray-700 space-y-3">
      {(title || right) && (
        <div className="flex items-center justify-between gap-2">
          {title && <h2 className="font-semibold">{title}</h2>}
          {right}
        </div>
      )}
      {children}
    </div>
  );
}

export function Btn({ children, onClick, primary, disabled, small, type = 'button' }: {
  children: ReactNode; onClick?: () => void; primary?: boolean; disabled?: boolean; small?: boolean; type?: 'button' | 'submit';
}) {
  return (
    <button
      type={type}
      onClick={onClick}
      disabled={disabled}
      className={`${small ? 'px-2 py-1 text-xs' : 'px-4 py-2 text-sm'} rounded font-medium border disabled:opacity-50 ${
        primary ? 'bg-orange-500 border-orange-500 text-white hover:bg-orange-600' : 'dark:border-gray-600 hover:bg-gray-100 dark:hover:bg-gray-800'
      }`}
    >
      {children}
    </button>
  );
}

export function Choice<T extends string>({ options, value, onChange }: { options: readonly T[]; value: T | ''; onChange: (v: T) => void }) {
  return (
    <div className="flex flex-wrap gap-2">
      {options.map((o) => (
        <button
          key={o}
          type="button"
          onClick={() => onChange(o)}
          className={`px-3 py-2 rounded text-sm border ${value === o ? 'bg-orange-500 border-orange-500 text-white' : 'dark:border-gray-600'}`}
        >
          {o}
        </button>
      ))}
    </div>
  );
}

export function Field({ label, children, hint }: { label: string; children: ReactNode; hint?: string }) {
  return (
    <label className="block space-y-1">
      <span className="text-sm font-medium">{label}</span>
      {children}
      {hint && <span className="block text-xs opacity-60">{hint}</span>}
    </label>
  );
}

export const inputCls = 'w-full border rounded px-3 py-2 text-sm bg-transparent dark:border-gray-600';

export function ProductSelect({ products, value, onChange }: { products: Product[]; value: string; onChange: (id: string) => void }) {
  const cats = Array.from(new Set(products.map((p) => p.category)));
  return (
    <select value={value} onChange={(e) => onChange(e.target.value)} className={`${inputCls} dark:bg-gray-900`}>
      <option value="">Choisir un produit…</option>
      {cats.map((c) => (
        <optgroup key={c} label={c}>
          {products.filter((p) => p.category === c).map((p) => (
            <option key={p.id} value={p.id}>
              {p.name} — {Q(p.qty)} {p.unit}
            </option>
          ))}
        </optgroup>
      ))}
    </select>
  );
}
