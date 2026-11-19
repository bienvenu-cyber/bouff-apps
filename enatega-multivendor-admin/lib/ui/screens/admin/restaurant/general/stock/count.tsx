'use client';
// BOUFF — Comptage : on saisit ce qu'on voit, l'écart avec le stock prévu s'affiche tout seul.
import { useMemo, useState } from 'react';
import { bouffDb } from '@/lib/bouff-data/supabase';
import { countGap, parseQty } from '@/lib/bouff-data/stock-rules';
import { Btn, Card, Ctx, errText, F, Field, inputCls, Q } from './shared';

export default function Count({ ctx, done, startFull }: { ctx: Ctx; done: () => void; startFull: boolean }) {
  const [kind, setKind] = useState<'soir' | 'complet'>(startFull ? 'complet' : 'soir');
  const [vals, setVals] = useState<Record<string, string>>({});
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const list = useMemo(
    () => ctx.products.filter((p) => p.is_active && (kind === 'complet' || p.count_daily)),
    [ctx.products, kind],
  );
  const cats = Array.from(new Set(list.map((p) => p.category)));
  const filled = list.filter((p) => parseQty(vals[p.id]) !== null);
  const totalGap = filled.reduce((s, p) => s + countGap(Number(p.qty), parseQty(vals[p.id]) as number, p.unit_cost_fcfa).value, 0);
  const invalid = list.find((p) => (vals[p.id] ?? '').trim() !== '' && parseQty(vals[p.id]) === null);

  async function save() {
    if (invalid) return ctx.notify(`Quantité invalide pour ${invalid.name}.`, false);
    if (filled.length === 0) return ctx.notify('Saisis au moins une quantité comptée.', false);
    setBusy(true);
    const { data, error } = await bouffDb().rpc('stock_save_count', {
      p_restaurant_id: ctx.restaurantId, p_kind: kind,
      p_lines: filled.map((p) => ({ product_id: p.id, counted: parseQty(vals[p.id]) })),
      p_note: note.trim() || null,
    });
    setBusy(false);
    if (error) return ctx.notify(errText(error), false);
    const gap = Number((data as { gap_value_fcfa?: number } | null)?.gap_value_fcfa ?? 0);
    ctx.notify(`Comptage enregistré : ${filled.length} produit(s), écart ${F(gap)}. Le stock est mis à jour.`, gap >= 0);
    setVals({}); setNote('');
    await ctx.reload();
    done();
  }

  return (
    <Card title="Comptage">
      <div className="flex flex-wrap gap-2">
        {(['soir', 'complet'] as const).map((k) => (
          <button key={k} type="button" onClick={() => setKind(k)}
            className={`px-3 py-2 rounded text-sm border ${kind === k ? 'bg-orange-500 border-orange-500 text-white' : 'dark:border-gray-600'}`}>
            {k === 'soir' ? 'Comptage du soir (produits clés)' : 'Inventaire complet (tout le stock)'}
          </button>
        ))}
      </div>
      <p className="text-xs opacity-70">
        Compte ce que tu vois vraiment et écris le chiffre. Laisse vide ce que tu n’as pas compté. Après enregistrement, le stock prend la quantité comptée.
        {kind === 'soir' && ' Choisis les produits du soir dans l’onglet « Stock » (case « compter le soir »).'}
      </p>
      {list.length === 0 && <p className="text-sm opacity-60">Aucun produit à compter.</p>}
      {cats.map((c) => (
        <div key={c} className="space-y-1">
          <p className="text-xs font-semibold uppercase opacity-60">{c}</p>
          {list.filter((p) => p.category === c).map((p) => {
            const v = parseQty(vals[p.id]);
            const g = v === null ? null : countGap(Number(p.qty), v, p.unit_cost_fcfa);
            return (
              <div key={p.id} className="grid grid-cols-[1fr_7rem] md:grid-cols-[2fr_8rem_8rem_10rem] gap-2 items-center text-sm border-b py-1 dark:border-gray-800">
                <span className="font-medium">{p.name}</span>
                <input inputMode="decimal" value={vals[p.id] ?? ''} onChange={(e) => setVals((s) => ({ ...s, [p.id]: e.target.value }))}
                  className={`${inputCls} py-1`} placeholder={p.unit} aria-label={`Quantité comptée ${p.name}`} />
                <span className="opacity-70 hidden md:block">prévu {Q(p.qty)} {p.unit}</span>
                <span className={`hidden md:block ${g && g.gap < 0 ? 'text-red-600 dark:text-red-400 font-semibold' : ''}`}>
                  {g ? `${g.gap > 0 ? '+' : ''}${Q(g.gap)} ${p.unit}${g.value ? ` · ${F(g.value)}` : ''}` : ''}
                </span>
              </div>
            );
          })}
        </div>
      ))}
      <Field label="Note (facultatif)"><input value={note} onChange={(e) => setNote(e.target.value)} className={inputCls} /></Field>
      <div className="flex items-center justify-between">
        <span className="text-sm">{filled.length} produit(s) compté(s) · écart <b className={totalGap < 0 ? 'text-red-600 dark:text-red-400' : ''}>{F(totalGap)}</b></span>
        <Btn primary disabled={busy} onClick={save}>{busy ? 'Enregistrement…' : 'Enregistrer le comptage'}</Btn>
      </div>
    </Card>
  );
}
