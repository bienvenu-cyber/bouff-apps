'use client';
// BOUFF — Dépense du jour (hors produits du stock, qui passent par « Arrivage »).
import { useState } from 'react';
import { bouffDb } from '@/lib/bouff-data/supabase';
import { EXPENSE_TYPES, parseAmount } from '@/lib/bouff-data/stock-rules';
import { Btn, Card, Choice, Ctx, errText, F, Field, inputCls } from './shared';

const PAID = ['Payé avec la caisse', 'Payé par la direction'] as const;

export default function Expense({ ctx, done }: { ctx: Ctx; done: () => void }) {
  const [cat, setCat] = useState<(typeof EXPENSE_TYPES)[number] | ''>('');
  const [amount, setAmount] = useState('');
  const [paid, setPaid] = useState<(typeof PAID)[number] | ''>('');
  const [desc, setDesc] = useState('');
  const [busy, setBusy] = useState(false);

  async function save() {
    if (!cat) return ctx.notify('Choisis le type de dépense.', false);
    const a = parseAmount(amount);
    if (!a) return ctx.notify('Indique le montant en francs (chiffres seulement).', false);
    if (!paid) return ctx.notify('Indique qui a payé.', false);
    if (cat === 'Autre' && !desc.trim()) return ctx.notify('Précise la dépense dans la description.', false);
    setBusy(true);
    const { error } = await bouffDb().rpc('expense_add', {
      p_restaurant_id: ctx.restaurantId, p_category: cat, p_amount: a,
      p_paid_from: paid === PAID[0] ? 'caisse' : 'direction', p_description: desc.trim() || null,
    });
    setBusy(false);
    if (error) return ctx.notify(errText(error), false);
    ctx.notify(`Dépense enregistrée : ${cat} · ${F(a)}.`);
    setCat(''); setAmount(''); setPaid(''); setDesc('');
    await ctx.reload();
    done();
  }

  return (
    <Card title="Dépense">
      <p className="text-xs opacity-70">Pour des produits du stock (viande, pain, boissons…), utilise plutôt « Arrivage » : la dépense se crée toute seule. Garde le reçu papier.</p>
      <Field label="Type"><Choice options={EXPENSE_TYPES} value={cat} onChange={setCat} /></Field>
      <Field label="Montant (F)"><input inputMode="numeric" value={amount} onChange={(e) => setAmount(e.target.value)} className={inputCls} placeholder="ex. 7500" /></Field>
      <Field label="Paiement"><Choice options={PAID} value={paid} onChange={setPaid} /></Field>
      <Field label="Description (facultatif)"><input value={desc} onChange={(e) => setDesc(e.target.value)} className={inputCls} placeholder="ex. Recharge gaz 12 kg" /></Field>
      <div className="flex justify-end"><Btn primary disabled={busy} onClick={save}>{busy ? 'Enregistrement…' : 'Enregistrer la dépense'}</Btn></div>
    </Card>
  );
}
