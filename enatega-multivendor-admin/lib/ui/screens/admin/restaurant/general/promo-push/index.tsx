'use client';
// BOUFF — Notifications : envoyer une promo en un clic. Les autres messages partent automatiquement.
import { useContext, useEffect, useState } from 'react';
import { RestaurantLayoutContext } from '@/lib/context/restaurant/layout-restaurant.context';
import { bouffDb } from '@/lib/bouff-data/supabase';

type Row = { id: string; name: string; price_fcfa: number; promo_price_fcfa: number; promo_ends_at: string | null; menu_items: { name: string } | null };

const KIND_LABELS: Record<string, string> = {
  promo: 'Promo (un clic)', birthday: 'Anniversaire', night: 'Nuit', friday: 'Vendredi soir', habit: 'Heure habituelle',
  winback: 'Client absent', cart: 'Panier abandonné', escale_teaser: 'Escale : veille', escale_live: 'Escale : jour J', escale_last: 'Escale : dernier jour',
};

export default function PromoPushScreen() {
  const { restaurantLayoutContextData } = useContext(RestaurantLayoutContext);
  const restaurantId = restaurantLayoutContextData?.restaurantId || '';
  const [rows, setRows] = useState<Row[]>([]);
  const [busy, setBusy] = useState('');
  const [msg, setMsg] = useState('');
  const [days, setDays] = useState(30);
  const [stats, setStats] = useState<{ kind: string; sent: number; opened: number; ordered: number }[]>([]);

  useEffect(() => {
    bouffDb().rpc('admin_push_stats', { p_days: days } as any).then(({ data }) => setStats((data as any) ?? []));
  }, [days]);

  useEffect(() => {
    if (!restaurantId) return;
    bouffDb()
      .from('item_variants')
      .select('id, name, price_fcfa, promo_price_fcfa, promo_ends_at, menu_items!inner(name, restaurant_id)')
      .eq('menu_items.restaurant_id', restaurantId)
      .not('promo_price_fcfa', 'is', null)
      .then(({ data }) =>
        setRows(((data as any) ?? []).filter((r: Row) => !r.promo_ends_at || new Date(r.promo_ends_at) > new Date()))
      );
  }, [restaurantId]);

  async function send(id: string) {
    setBusy(id);
    setMsg('');
    const { data, error } = await bouffDb().rpc('admin_push_promo', { p_variant_id: id } as any);
    setBusy('');
    setMsg(error ? error.message : `Notification envoyée à ${data ?? 0} client(s).`);
  }

  return (
    <div className="p-4 space-y-4">
      <div>
        <h1 className="text-2xl font-bold">Notifications</h1>
        <p className="text-sm opacity-70">
          Automatiques : Escale BOUFF (veille 18 h, jour J 11 h, dernier jour 17 h), vendredi 19 h, heure habituelle,
          client absent 10 à 14 jours, nuit (déjà clients de nuit), panier abandonné (un seul rappel). Règles : un
          message par jour maximum, 2 automatiques par semaine, rien entre 22 h et 9 h (sauf nuit), rien pendant une
          commande en cours, seulement les clients qui acceptent les offres.
        </p>
      </div>
      <div className="flex items-center justify-between gap-3">
        <h2 className="font-semibold">Ce qui marche</h2>
        <select className="border rounded px-2 py-1 bg-transparent" value={days} onChange={(e) => setDays(Number(e.target.value))}>
          <option value={7}>7 jours</option><option value={30}>30 jours</option><option value={90}>90 jours</option>
        </select>
      </div>
      <p className="text-xs opacity-70">« Commandé » = le client a commandé dans les 24 h après le message.</p>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead><tr className="text-left opacity-70"><th className="py-1">Message</th><th>Envoyées</th><th>Ouvertes</th><th>Commandé</th></tr></thead>
          <tbody>
            {stats.length === 0 && <tr><td colSpan={4} className="py-2 opacity-70">Aucune notification envoyée sur la période.</td></tr>}
            {stats.map((r) => {
              const pct = (n: number) => (r.sent ? ` (${Math.round((n * 100) / r.sent)} %)` : '');
              return (
                <tr key={r.kind} className="border-t">
                  <td className="py-1">{KIND_LABELS[r.kind] ?? r.kind}</td>
                  <td>{r.sent}</td><td>{r.opened}{pct(r.opened)}</td><td>{r.ordered}{pct(r.ordered)}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <h2 className="font-semibold">Promos en cours</h2>
      {msg && <p className="text-sm">{msg}</p>}
      {rows.length === 0 && <p className="text-sm opacity-70">Aucune promo en cours. Mets un prix promo sur un plat pour pouvoir l&apos;annoncer.</p>}
      {rows.map((r) => (
        <div key={r.id} className="border rounded-lg p-3 flex items-center justify-between gap-3">
          <p>
            <span className="font-semibold">{r.menu_items?.name}</span> ({r.name}) — {r.promo_price_fcfa} F{' '}
            <span className="line-through opacity-60">{r.price_fcfa} F</span>
          </p>
          <button className="px-3 py-2 rounded bg-primary-color text-white disabled:opacity-50" disabled={busy === r.id} onClick={() => send(r.id)}>
            {busy === r.id ? 'Envoi…' : 'Envoyer la notification'}
          </button>
        </div>
      ))}
    </div>
  );
}
