'use client';
// BOUFF — Historique d'une journée : tout ce qui a été saisi, par qui et à quelle heure.
import { useCallback, useEffect, useState } from 'react';
import { bouffDb } from '@/lib/bouff-data/supabase';
import { Btn, Card, Ctx, errText, F, Q } from './shared';

type Move = { id: string; kind: string; qty_delta: number; value_fcfa: number; reason: string | null; supplier: string | null; note: string | null;
  author_name: string | null; created_at: string; cancelled_at: string | null; stock_products: { name: string; unit: string } | null };
type Exp = { id: string; category: string; amount_fcfa: number; paid_from: string; description: string | null; source: string;
  author_name: string | null; created_at: string; cancelled_at: string | null };
type CountRow = { id: string; kind: string; lines_count: number; gap_value_fcfa: number; author_name: string | null; created_at: string;
  stock_count_lines: { product_name: string; unit: string; expected: number; counted: number; gap: number; gap_value_fcfa: number }[] };
type Hyg = { moment: string; all_ok: boolean; fridge_temp: number | null; freezer_temp: number | null; note: string | null; author_name: string | null; updated_at: string;
  items: { label?: string; ok: boolean }[] };

const KIND: Record<string, string> = { reception: 'Arrivage', perte: 'Perte', inventaire: 'Comptage', annulation: 'Annulation' };
const hm = (iso: string) => new Date(iso).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit', timeZone: 'Africa/Porto-Novo' });

export default function History({ ctx, today }: { ctx: Ctx; today: string }) {
  const [day, setDay] = useState(today);
  const [moves, setMoves] = useState<Move[]>([]);
  const [exps, setExps] = useState<Exp[]>([]);
  const [counts, setCounts] = useState<CountRow[]>([]);
  const [hyg, setHyg] = useState<Hyg[]>([]);
  const [open, setOpen] = useState<string | null>(null);
  const canCancel = day >= new Date(new Date(today + 'T12:00:00').getTime() - 86400000).toISOString().slice(0, 10);

  const load = useCallback(async () => {
    const db = bouffDb();
    const [m, e, c, h] = await Promise.all([
      db.from('stock_movements').select('id, kind, qty_delta, value_fcfa, reason, supplier, note, author_name, created_at, cancelled_at, stock_products(name, unit)')
        .eq('restaurant_id', ctx.restaurantId).eq('local_day', day).order('created_at', { ascending: false }),
      db.from('expenses').select('id, category, amount_fcfa, paid_from, description, source, author_name, created_at, cancelled_at')
        .eq('restaurant_id', ctx.restaurantId).eq('local_day', day).order('created_at', { ascending: false }),
      db.from('stock_counts').select('id, kind, lines_count, gap_value_fcfa, author_name, created_at, stock_count_lines(product_name, unit, expected, counted, gap, gap_value_fcfa)')
        .eq('restaurant_id', ctx.restaurantId).eq('local_day', day).order('created_at', { ascending: false }),
      db.from('hygiene_checks').select('moment, all_ok, fridge_temp, freezer_temp, note, author_name, updated_at, items')
        .eq('restaurant_id', ctx.restaurantId).eq('local_day', day),
    ]);
    const err = m.error || e.error || c.error || h.error;
    if (err) ctx.notify(errText(err), false);
    setMoves((m.data as unknown as Move[]) ?? []);
    setExps((e.data as Exp[]) ?? []);
    setCounts((c.data as unknown as CountRow[]) ?? []);
    setHyg((h.data as Hyg[]) ?? []);
  }, [ctx, day]);

  useEffect(() => { void load(); }, [load]);

  async function cancelMove(m: Move) {
    if (!window.confirm(`Annuler cette saisie (${KIND[m.kind]} · ${m.stock_products?.name}) ? Le stock sera corrigé.`)) return;
    const { error } = await bouffDb().rpc('stock_cancel_movement', { p_movement_id: m.id });
    if (error) return ctx.notify(errText(error), false);
    ctx.notify('Saisie annulée, stock corrigé.');
    await ctx.reload(); await load();
  }
  async function cancelExp(x: Exp) {
    if (!window.confirm(`Annuler la dépense ${x.category} de ${F(x.amount_fcfa)} ?`)) return;
    const { error } = await bouffDb().rpc('expense_cancel', { p_expense_id: x.id });
    if (error) return ctx.notify(errText(error), false);
    ctx.notify('Dépense annulée.');
    await ctx.reload(); await load();
  }

  const totalExp = exps.filter((x) => !x.cancelled_at).reduce((s, x) => s + x.amount_fcfa, 0);

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <span className="text-sm">Journée du</span>
        <input type="date" value={day} max={today} onChange={(e) => e.target.value && setDay(e.target.value)} className="border rounded px-2 py-1 text-sm bg-transparent dark:border-gray-600" />
      </div>

      <Card title="Mouvements de stock">
        {moves.length === 0 ? <p className="text-sm opacity-60">Rien ce jour-là.</p> : (
          <ul className="divide-y dark:divide-gray-800">
            {moves.map((m) => (
              <li key={m.id} className={`py-2 text-sm flex flex-wrap items-center gap-x-3 gap-y-1 ${m.cancelled_at ? 'opacity-50 line-through' : ''}`}>
                <span className="w-12 opacity-70">{hm(m.created_at)}</span>
                <span className="w-24 font-semibold">{KIND[m.kind] ?? m.kind}</span>
                <span className="flex-1 min-w-40">{m.stock_products?.name} : {m.qty_delta > 0 ? '+' : ''}{Q(m.qty_delta)} {m.stock_products?.unit}
                  {m.reason ? ` · ${m.reason}` : ''}{m.supplier ? ` · ${m.supplier}` : ''}{m.note ? ` · ${m.note}` : ''}</span>
                <span className="tabular-nums">{m.value_fcfa ? F(m.value_fcfa) : ''}</span>
                <span className="opacity-60 text-xs">{m.author_name}</span>
                {canCancel && !m.cancelled_at && (m.kind === 'reception' || m.kind === 'perte') && <Btn small onClick={() => cancelMove(m)}>Annuler</Btn>}
              </li>
            ))}
          </ul>
        )}
      </Card>

      <Card title={`Dépenses · ${F(totalExp)}`}>
        {exps.length === 0 ? <p className="text-sm opacity-60">Aucune dépense ce jour-là.</p> : (
          <ul className="divide-y dark:divide-gray-800">
            {exps.map((x) => (
              <li key={x.id} className={`py-2 text-sm flex flex-wrap items-center gap-x-3 gap-y-1 ${x.cancelled_at ? 'opacity-50 line-through' : ''}`}>
                <span className="w-12 opacity-70">{hm(x.created_at)}</span>
                <span className="w-40 font-semibold">{x.category}</span>
                <span className="flex-1 min-w-40">{x.description ?? ''}</span>
                <span className="tabular-nums font-semibold">{F(x.amount_fcfa)}</span>
                <span className="text-xs opacity-70">{x.paid_from === 'caisse' ? 'caisse' : 'direction'}</span>
                <span className="opacity-60 text-xs">{x.author_name}</span>
                {canCancel && !x.cancelled_at && x.source === 'manuel' && <Btn small onClick={() => cancelExp(x)}>Annuler</Btn>}
              </li>
            ))}
          </ul>
        )}
      </Card>

      <Card title="Comptages">
        {counts.length === 0 ? <p className="text-sm opacity-60">Aucun comptage ce jour-là.</p> : counts.map((c) => (
          <div key={c.id} className="border rounded p-2 dark:border-gray-700">
            <button type="button" className="w-full flex flex-wrap justify-between gap-2 text-sm text-left" onClick={() => setOpen(open === c.id ? null : c.id)}>
              <span><b>{c.kind === 'soir' ? 'Comptage du soir' : 'Inventaire complet'}</b> · {hm(c.created_at)} · {c.author_name}</span>
              <span>{c.lines_count} produit(s) · écart <b className={c.gap_value_fcfa < 0 ? 'text-red-600 dark:text-red-400' : ''}>{F(c.gap_value_fcfa)}</b> {open === c.id ? '▲' : '▼'}</span>
            </button>
            {open === c.id && (
              <table className="w-full text-sm mt-2">
                <thead><tr className="text-left opacity-70"><th>Produit</th><th className="text-right">Prévu</th><th className="text-right">Compté</th><th className="text-right">Écart</th></tr></thead>
                <tbody>
                  {c.stock_count_lines.map((l, i) => (
                    <tr key={i} className="border-t dark:border-gray-800">
                      <td>{l.product_name}</td><td className="text-right">{Q(l.expected)} {l.unit}</td><td className="text-right">{Q(l.counted)}</td>
                      <td className={`text-right ${l.gap < 0 ? 'text-red-600 dark:text-red-400 font-semibold' : ''}`}>{l.gap > 0 ? '+' : ''}{Q(l.gap)}{l.gap_value_fcfa ? ` · ${F(l.gap_value_fcfa)}` : ''}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        ))}
      </Card>

      <Card title="Hygiène">
        {hyg.length === 0 ? <p className="text-sm opacity-60">Aucun contrôle ce jour-là.</p> : hyg.map((h) => (
          <div key={h.moment} className="text-sm space-y-1">
            <p><b>{h.moment === 'ouverture' ? 'Ouverture' : 'Fermeture'}</b> · {hm(h.updated_at)} · {h.author_name} ·{' '}
              <span className={h.all_ok ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400 font-semibold'}>{h.all_ok ? 'tout est bon' : 'point à corriger'}</span>
              {' '}· frigo {h.fridge_temp ?? '—'} °C · congélateur {h.freezer_temp ?? '—'} °C</p>
            {h.items.filter((i) => !i.ok).map((i, k) => <p key={k} className="text-red-600 dark:text-red-400">✗ {i.label}</p>)}
            {h.note && <p className="opacity-80">Note : {h.note}</p>}
          </div>
        ))}
      </Card>
    </div>
  );
}
