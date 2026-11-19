'use client';
// BOUFF — Arrivage : le stock monte et, si c'est payé, la dépense se crée toute seule.
import { useState } from 'react';
import { bouffDb } from '@/lib/bouff-data/supabase';
import { parseAmount, parseQty } from '@/lib/bouff-data/stock-rules';
import { Btn, Card, Choice, Ctx, errText, F, Field, inputCls, ProductSelect } from './shared';

type Line = { product_id: string; qty: string; total: string };
const PAID = ['Payé avec la caisse', 'Payé par la direction', 'Pas encore payé'] as const;
const empty = (): Line => ({ product_id: '', qty: '', total: '' });

export default function Reception({ ctx, done }: { ctx: Ctx; done: () => void }) {
  const [lines, setLines] = useState<Line[]>([empty()]);
  const [supplier, setSupplier] = useState('');
  const [paid, setPaid] = useState<(typeof PAID)[number] | ''>('');
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const active = ctx.products.filter((p) => p.is_active);
  const total = lines.reduce((s, l) => s + (parseAmount(l.total) ?? 0), 0);
  const set = (i: number, patch: Partial<Line>) => setLines((ls) => ls.map((l, j) => (j === i ? { ...l, ...patch } : l)));

  async function save() {
    const used = lines.filter((l) => l.product_id || l.qty || l.total);
    if (used.length === 0) return ctx.notify('Ajoute au moins un produit.', false);
    for (const l of used) {
      const name = active.find((p) => p.id === l.product_id)?.name ?? 'ce produit';
      if (!l.product_id) return ctx.notify('Choisis le produit sur chaque ligne.', false);
      if (parseQty(l.qty) === null || parseQty(l.qty) === 0) return ctx.notify(`Quantité reçue invalide pour ${name}.`, false);
      if (l.total.trim() && parseAmount(l.total) === null) return ctx.notify(`Montant invalide pour ${name} (chiffres seulement).`, false);
    }
    if (!paid) return ctx.notify('Indique si c’est payé et par qui.', false);
    setBusy(true);
    const { error } = await bouffDb().rpc('stock_receive', {
      p_restaurant_id: ctx.restaurantId,
      p_lines: used.map((l) => ({ product_id: l.product_id, qty: parseQty(l.qty), total_fcfa: parseAmount(l.total) ?? 0 })),
      p_supplier: supplier.trim() || null,
      p_paid_from: paid === PAID[0] ? 'caisse' : paid === PAID[1] ? 'direction' : null,
      p_note: note.trim() || null,
    });
    setBusy(false);
    if (error) return ctx.notify(errText(error), false);
    ctx.notify(`Arrivage enregistré : ${used.length} produit(s)${total ? ` · ${F(total)}` : ''}.`);
    setLines([empty()]); setSupplier(''); setPaid(''); setNote('');
    await ctx.reload();
    done();
  }

  return (
    <Card title="Arrivage (livraison ou retour du marché)">
      <p className="text-xs opacity-70">Une ligne par produit. Le montant est le prix total payé pour la quantité reçue : le prix d’achat du produit se met à jour tout seul.</p>
      <div className="space-y-3">
        {lines.map((l, i) => {
          const p = active.find((x) => x.id === l.product_id);
          return (
            <div key={i} className="grid gap-2 md:grid-cols-[2fr_1fr_1fr_auto] items-end border-b pb-3 dark:border-gray-700">
              <Field label="Produit"><ProductSelect products={active} value={l.product_id} onChange={(v) => set(i, { product_id: v })} /></Field>
              <Field label={`Quantité reçue${p ? ` (${p.unit})` : ''}`}>
                <input inputMode="decimal" value={l.qty} onChange={(e) => set(i, { qty: e.target.value })} className={inputCls} placeholder="ex. 5" />
              </Field>
              <Field label="Montant payé (F)">
                <input inputMode="numeric" value={l.total} onChange={(e) => set(i, { total: e.target.value })} className={inputCls} placeholder="ex. 20000" />
              </Field>
              {lines.length > 1 ? <Btn small onClick={() => setLines((ls) => ls.filter((_, j) => j !== i))}>Retirer</Btn> : <span />}
            </div>
          );
        })}
        <Btn onClick={() => setLines((ls) => [...ls, empty()])}>+ Ajouter un produit</Btn>
      </div>
      <Field label="Fournisseur (facultatif)"><input value={supplier} onChange={(e) => setSupplier(e.target.value)} className={inputCls} placeholder="ex. Boucherie du marché" /></Field>
      <Field label="Paiement"><Choice options={PAID} value={paid} onChange={setPaid} /></Field>
      <Field label="Note (facultatif)"><input value={note} onChange={(e) => setNote(e.target.value)} className={inputCls} /></Field>
      <div className="flex items-center justify-between">
        <span className="text-sm">Total : <b>{F(total)}</b></span>
        <Btn primary disabled={busy} onClick={save}>{busy ? 'Enregistrement…' : 'Enregistrer l’arrivage'}</Btn>
      </div>
    </Card>
  );
}
