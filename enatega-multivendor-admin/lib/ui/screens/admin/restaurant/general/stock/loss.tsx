'use client';
// BOUFF — Perte : le stock baisse, avec un motif et la valeur perdue.
import { useState } from 'react';
import { bouffDb } from '@/lib/bouff-data/supabase';
import { LOSS_REASONS, lossError, parseQty } from '@/lib/bouff-data/stock-rules';
import { Btn, Card, Choice, Ctx, errText, F, Field, inputCls, ProductSelect, Q } from './shared';

export default function Loss({ ctx, done }: { ctx: Ctx; done: () => void }) {
  const [pid, setPid] = useState('');
  const [qty, setQty] = useState('');
  const [reason, setReason] = useState<(typeof LOSS_REASONS)[number] | ''>('');
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const active = ctx.products.filter((p) => p.is_active);
  const p = active.find((x) => x.id === pid);
  const q = parseQty(qty);

  async function save() {
    if (!p) return ctx.notify('Choisis le produit perdu.', false);
    const err = lossError(Number(p.qty), q, p.unit, p.name);
    if (err) return ctx.notify(err, false);
    if (!reason) return ctx.notify('Choisis le motif de la perte.', false);
    if (reason === 'Autre' && !note.trim()) return ctx.notify('Précise le motif dans la note.', false);
    setBusy(true);
    const { error } = await bouffDb().rpc('stock_loss', {
      p_restaurant_id: ctx.restaurantId, p_product_id: p.id, p_qty: q, p_reason: reason, p_note: note.trim() || null,
    });
    setBusy(false);
    if (error) return ctx.notify(errText(error), false);
    ctx.notify(`Perte enregistrée : ${Q(q)} ${p.unit} de ${p.name}.`);
    setPid(''); setQty(''); setReason(''); setNote('');
    await ctx.reload();
    done();
  }

  return (
    <Card title="Perte">
      <Field label="Produit"><ProductSelect products={active} value={pid} onChange={setPid} /></Field>
      {p && <p className="text-xs opacity-70">En stock : {Q(p.qty)} {p.unit}{p.unit_cost_fcfa ? ` · ${F(p.unit_cost_fcfa)} / ${p.unit}` : ''}</p>}
      <Field label={`Quantité perdue${p ? ` (${p.unit})` : ''}`}>
        <input inputMode="decimal" value={qty} onChange={(e) => setQty(e.target.value)} className={inputCls} placeholder="ex. 0,5" />
      </Field>
      {p && q ? <p className="text-sm">Valeur perdue : <b>{F(q * (p.unit_cost_fcfa ?? 0))}</b>{p.unit_cost_fcfa ? '' : ' (prix d’achat inconnu)'}</p> : null}
      <Field label="Motif"><Choice options={LOSS_REASONS} value={reason} onChange={setReason} /></Field>
      <Field label="Note (facultatif)"><input value={note} onChange={(e) => setNote(e.target.value)} className={inputCls} /></Field>
      <div className="flex justify-end"><Btn primary disabled={busy} onClick={save}>{busy ? 'Enregistrement…' : 'Enregistrer la perte'}</Btn></div>
    </Card>
  );
}
