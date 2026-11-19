'use client';
// BOUFF — Stock & cuisine : la gérante suit sa journée en 6 étapes ; tout est enregistré par la base (stock_*, expense_*, hygiene_save).
import { useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { RestaurantLayoutContext } from '@/lib/context/restaurant/layout-restaurant.context';
import { bouffDb } from '@/lib/bouff-data/supabase';
import { Ctx, DaySummary, errText, Product } from './shared';
import Today, { Tab } from './today';
import Reception from './reception';
import Loss from './loss';
import Expense from './expense';
import Count from './count';
import Hygiene from './hygiene';
import Products from './products';
import History from './history';

const TABS: { id: Tab; label: string }[] = [
  { id: 'today', label: 'Ma journée' },
  { id: 'reception', label: 'Arrivage' },
  { id: 'loss', label: 'Perte' },
  { id: 'expense', label: 'Dépense' },
  { id: 'count', label: 'Comptage' },
  { id: 'hygiene', label: 'Hygiène' },
  { id: 'stock', label: 'Stock' },
  { id: 'history', label: 'Historique' },
];

const bjToday = () => new Date().toLocaleDateString('en-CA', { timeZone: 'Africa/Porto-Novo' });

export default function StockScreen() {
  const { restaurantLayoutContextData } = useContext(RestaurantLayoutContext);
  const restaurantId = restaurantLayoutContextData?.restaurantId || '';
  const [tab, setTab] = useState<Tab>('today');
  const [products, setProducts] = useState<Product[]>([]);
  const [day, setDay] = useState<DaySummary | null>(null);
  const [everCounted, setEverCounted] = useState(true);
  const [msg, setMsg] = useState<{ text: string; ok: boolean } | null>(null);

  const notify = useCallback((text: string, ok = true) => {
    setMsg({ text, ok });
    if (typeof window !== 'undefined') window.scrollTo({ top: 0, behavior: 'smooth' });
  }, []);

  const reload = useCallback(async () => {
    if (!restaurantId) return;
    const db = bouffDb();
    const [p, d, c] = await Promise.all([
      db.from('stock_products').select('id, name, category, unit, qty, min_qty, unit_cost_fcfa, supplier, count_daily, is_active, sort_order')
        .eq('restaurant_id', restaurantId).order('sort_order').order('name'),
      db.rpc('stock_day', { p_restaurant_id: restaurantId }),
      db.from('stock_counts').select('id', { count: 'exact', head: true }).eq('restaurant_id', restaurantId).eq('kind', 'complet'),
    ]);
    if (p.error || d.error) notify(errText(p.error || d.error), false);
    setProducts(((p.data as Product[]) ?? []).map((x) => ({ ...x, qty: Number(x.qty), min_qty: Number(x.min_qty) })));
    if (d.data) setDay(d.data as DaySummary);
    setEverCounted((c.count ?? 0) > 0);
  }, [restaurantId, notify]);

  useEffect(() => { void reload(); }, [reload]);

  useEffect(() => {
    if (!msg) return;
    const t = setTimeout(() => setMsg(null), 6000);
    return () => clearTimeout(t);
  }, [msg]);

  const ctx: Ctx = useMemo(() => ({ restaurantId, products, reload, notify }), [restaurantId, products, reload, notify]);
  const back = () => setTab('today');
  const lowCount = day?.low_stock?.length ?? 0;

  return (
    <div className="p-4 space-y-4 text-gray-900 dark:text-gray-100 max-w-5xl">
      <div>
        <h1 className="text-2xl font-bold">Stock & cuisine</h1>
        <p className="text-sm opacity-70">Arrivages, pertes, dépenses, comptages et hygiène. Chaque saisie garde le nom et l’heure.</p>
      </div>

      <div className="flex flex-wrap gap-2">
        {TABS.map((t) => (
          <button key={t.id} type="button" onClick={() => setTab(t.id)}
            className={`px-3 py-2 rounded text-sm border ${tab === t.id ? 'bg-orange-500 text-white border-orange-500' : 'dark:border-gray-600'}`}>
            {t.label}{t.id === 'stock' && lowCount > 0 ? ` (${lowCount} bas)` : ''}
          </button>
        ))}
      </div>

      {msg && (
        <div role="status" className={`rounded-lg p-3 text-sm font-medium ${msg.ok ? 'bg-green-100 text-green-900 dark:bg-green-900/40 dark:text-green-100' : 'bg-red-100 text-red-900 dark:bg-red-900/40 dark:text-red-100'}`}>
          {msg.text}
        </div>
      )}

      {!restaurantId && <p className="text-sm opacity-60">Chargement du restaurant…</p>}
      {restaurantId && tab === 'today' && <Today day={day} go={setTab} firstCount={!everCounted} />}
      {restaurantId && tab === 'reception' && <Reception ctx={ctx} done={back} />}
      {restaurantId && tab === 'loss' && <Loss ctx={ctx} done={back} />}
      {restaurantId && tab === 'expense' && <Expense ctx={ctx} done={back} />}
      {restaurantId && tab === 'count' && <Count ctx={ctx} done={back} startFull={!everCounted} />}
      {restaurantId && tab === 'hygiene' && <Hygiene ctx={ctx} day={day} done={back} />}
      {restaurantId && tab === 'stock' && <Products ctx={ctx} canEdit />}
      {restaurantId && tab === 'history' && <History ctx={ctx} today={day?.day ?? bjToday()} />}
    </div>
  );
}
