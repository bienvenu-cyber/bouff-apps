'use client';
// BOUFF — Escale BOUFF : pays du mois (avant-dernier mercredi + jeudi).
// Les pays africains attendent la validation de l'admin ; les autres passent tout seuls.
import { useContext, useEffect, useState } from 'react';
import { RestaurantLayoutContext } from '@/lib/context/restaurant/layout-restaurant.context';
import { bouffDb } from '@/lib/bouff-data/supabase';

type Row = {
  id: string;
  starts_on: string;
  ends_on: string;
  status: string;
  needs_approval: boolean;
  escale_countries: { country: string; flag: string; dish: string; is_african: boolean } | null;
};

const LABEL: Record<string, string> = {
  proposed: 'À valider',
  approved: 'Prévue',
  live: 'En ligne',
  done: 'Terminée',
  rejected: 'Refusée / non validée',
  disabled: 'Désactivée',
};

const fr = (d: string) => new Date(d + 'T12:00:00').toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long' });

export default function EscaleScreen() {
  const { restaurantLayoutContextData } = useContext(RestaurantLayoutContext);
  const restaurantId = restaurantLayoutContextData?.restaurantId || '';
  const [rows, setRows] = useState<Row[]>([]);
  const [busy, setBusy] = useState('');
  const [error, setError] = useState('');

  async function load() {
    if (!restaurantId) return;
    const { data, error } = await bouffDb()
      .from('escales')
      .select('id, starts_on, ends_on, status, needs_approval, escale_countries(country, flag, dish, is_african)')
      .eq('restaurant_id', restaurantId)
      .order('starts_on', { ascending: false })
      .limit(24);
    if (error) setError(error.message);
    setRows((data as any) ?? []);
  }
  useEffect(() => {
    load();
  }, [restaurantId]);

  async function decide(id: string, action: 'approve' | 'reject' | 'disable') {
    setBusy(id);
    setError('');
    const { error } = await bouffDb().rpc('admin_escale_decide', { p_escale_id: id, p_action: action });
    if (error) setError(error.message);
    setBusy('');
    load();
  }

  return (
    <div className="p-4 space-y-4">
      <div>
        <h1 className="text-2xl font-bold">Escale BOUFF</h1>
        <p className="text-sm opacity-70">
          Un pays, un plat, l&apos;avant-dernier mercredi et jeudi du mois. Le pays est proposé 10 jours avant et la
          cuisine est alertée. Les pays africains doivent être validés ici, sinon rien n&apos;est mis en ligne. Les
          autres passent automatiquement ; tu peux les désactiver.
        </p>
      </div>
      {error && <p className="text-red-500 text-sm">{error}</p>}
      {rows.length === 0 && <p className="text-sm opacity-70">Aucune escale pour l&apos;instant. La prochaine sera proposée 10 jours avant la date.</p>}
      <div className="space-y-2">
        {rows.map((r) => {
          const c = r.escale_countries;
          const open = ['proposed', 'approved', 'live'].includes(r.status);
          return (
            <div key={r.id} className="border rounded-lg p-3 flex flex-wrap items-center gap-3 justify-between">
              <div>
                <p className="font-semibold">
                  {c?.flag} {c?.country} — {c?.dish}
                </p>
                <p className="text-sm opacity-70">
                  {fr(r.starts_on)} → {fr(r.ends_on)} · {LABEL[r.status] ?? r.status}
                </p>
              </div>
              <div className="flex gap-2">
                {(r.status === 'proposed' || r.status === 'disabled') && (
                  <button disabled={busy === r.id} onClick={() => decide(r.id, 'approve')} className="px-3 py-1 rounded bg-orange-500 text-white text-sm">
                    Valider
                  </button>
                )}
                {r.status === 'proposed' && (
                  <button disabled={busy === r.id} onClick={() => decide(r.id, 'reject')} className="px-3 py-1 rounded border text-sm">
                    Refuser
                  </button>
                )}
                {open && r.status !== 'proposed' && (
                  <button disabled={busy === r.id} onClick={() => decide(r.id, 'disable')} className="px-3 py-1 rounded border text-sm">
                    Désactiver
                  </button>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
