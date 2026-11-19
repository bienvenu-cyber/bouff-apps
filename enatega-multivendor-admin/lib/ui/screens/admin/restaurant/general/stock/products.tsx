'use client';
// BOUFF — Liste des produits du stock : quantités, minimums, prix d'achat. Seule la gérance modifie.
import { useState } from 'react';
import { bouffDb } from '@/lib/bouff-data/supabase';
import { isLowStock, parseAmount, parseQty } from '@/lib/bouff-data/stock-rules';
import { Btn, Card, Ctx, errText, F, Field, inputCls, Product, Q } from './shared';

type Form = { id?: string; name: string; category: string; unit: string; min_qty: string; unit_cost: string; supplier: string; count_daily: boolean; is_active: boolean };
const UNITS = ['kg', 'g', 'L', 'pièce', 'paquet', 'rouleau', 'boîte', 'carton', 'sac'];
const toForm = (p?: Product): Form => ({
  id: p?.id, name: p?.name ?? '', category: p?.category ?? '', unit: p?.unit ?? 'pièce',
  min_qty: p && Number(p.min_qty) ? String(p.min_qty).replace('.', ',') : '', unit_cost: p?.unit_cost_fcfa ? String(p.unit_cost_fcfa) : '',
  supplier: p?.supplier ?? '', count_daily: p?.count_daily ?? false, is_active: p?.is_active ?? true,
});

function Editor({ ctx, form, setForm, cats, close }: { ctx: Ctx; form: Form; setForm: (f: Form) => void; cats: string[]; close: () => void }) {
  const [busy, setBusy] = useState(false);
  async function save() {
    if (!form.name.trim()) return ctx.notify('Nom du produit obligatoire.', false);
    if (form.min_qty.trim() && parseQty(form.min_qty) === null) return ctx.notify('Stock minimum invalide.', false);
    if (form.unit_cost.trim() && parseAmount(form.unit_cost) === null) return ctx.notify('Prix d’achat invalide (chiffres seulement).', false);
    setBusy(true);
    const { error } = await bouffDb().rpc('stock_save_product', {
      p_restaurant_id: ctx.restaurantId,
      p_product: {
        id: form.id ?? null, name: form.name.trim(), category: form.category.trim() || 'Autre', unit: form.unit,
        min_qty: parseQty(form.min_qty) ?? 0, unit_cost_fcfa: parseAmount(form.unit_cost), supplier: form.supplier.trim() || null,
        count_daily: form.count_daily, is_active: form.is_active,
      },
    });
    setBusy(false);
    if (error) return ctx.notify(errText(error), false);
    ctx.notify(form.id ? 'Produit mis à jour.' : 'Produit ajouté.');
    await ctx.reload();
    close();
  }
  return (
    <div className="border-2 border-orange-500 rounded-lg p-4 space-y-3">
      <p className="font-semibold">{form.id ? `Modifier « ${form.name} »` : 'Nouveau produit'}</p>
      <div className="grid md:grid-cols-3 gap-3">
        <Field label="Nom"><input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} className={inputCls} /></Field>
        <Field label="Rayon">
          <input list="stock-cats" value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })} className={inputCls} placeholder="ex. Viandes" />
          <datalist id="stock-cats">{cats.map((c) => <option key={c} value={c} />)}</datalist>
        </Field>
        <Field label="Unité">
          <select value={form.unit} onChange={(e) => setForm({ ...form, unit: e.target.value })} className={`${inputCls} dark:bg-gray-900`}>
            {Array.from(new Set([...UNITS, form.unit])).map((u) => <option key={u} value={u}>{u}</option>)}
          </select>
        </Field>
        <Field label="Stock minimum (alerte)" hint="Alerte quand il reste ce chiffre ou moins"><input inputMode="decimal" value={form.min_qty} onChange={(e) => setForm({ ...form, min_qty: e.target.value })} className={inputCls} placeholder="ex. 20" /></Field>
        <Field label="Prix d’achat par unité (F)" hint="Se met à jour à chaque arrivage payé"><input inputMode="numeric" value={form.unit_cost} onChange={(e) => setForm({ ...form, unit_cost: e.target.value })} className={inputCls} /></Field>
        <Field label="Fournisseur"><input value={form.supplier} onChange={(e) => setForm({ ...form, supplier: e.target.value })} className={inputCls} /></Field>
      </div>
      <label className="flex items-center gap-2 text-sm"><input type="checkbox" className="h-4 w-4 accent-orange-500" checked={form.count_daily} onChange={(e) => setForm({ ...form, count_daily: e.target.checked })} /> À compter chaque soir (produit clé)</label>
      {form.id && <label className="flex items-center gap-2 text-sm"><input type="checkbox" className="h-4 w-4 accent-orange-500" checked={!form.is_active} onChange={(e) => setForm({ ...form, is_active: !e.target.checked })} /> Produit plus utilisé (le cacher)</label>}
      <div className="flex gap-2 justify-end">
        <Btn onClick={close}>Annuler</Btn>
        <Btn primary disabled={busy} onClick={save}>{busy ? 'Enregistrement…' : 'Enregistrer'}</Btn>
      </div>
    </div>
  );
}

export default function Products({ ctx, canEdit }: { ctx: Ctx; canEdit: boolean }) {
  const [form, setForm] = useState<Form | null>(null);
  const [search, setSearch] = useState('');
  const [showHidden, setShowHidden] = useState(false);
  const list = ctx.products.filter((p) => (showHidden || p.is_active) && p.name.toLowerCase().includes(search.trim().toLowerCase()));
  const cats = Array.from(new Set(ctx.products.map((p) => p.category)));
  const value = ctx.products.filter((p) => p.is_active).reduce((s, p) => s + Number(p.qty) * (p.unit_cost_fcfa ?? 0), 0);
  const low = ctx.products.filter(isLowStock).length;
  const noPrice = ctx.products.filter((p) => p.is_active && !p.unit_cost_fcfa).length;

  return (
    <Card title="Stock" right={canEdit ? <Btn primary onClick={() => setForm(toForm())}>+ Nouveau produit</Btn> : undefined}>
      <div className="flex flex-wrap gap-4 text-sm">
        <span>Valeur du stock : <b>{F(value)}</b></span>
        <span className={low ? 'text-red-600 dark:text-red-400 font-semibold' : ''}>{low} en stock bas</span>
        {noPrice > 0 && <span className="opacity-70">{noPrice} produit(s) sans prix d’achat</span>}
      </div>
      {form && <Editor ctx={ctx} form={form} setForm={setForm} cats={cats} close={() => setForm(null)} />}
      <div className="flex flex-wrap gap-3 items-center">
        <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Rechercher un produit" className={`${inputCls} max-w-xs`} />
        <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={showHidden} onChange={(e) => setShowHidden(e.target.checked)} /> Voir les produits cachés</label>
      </div>
      {Array.from(new Set(list.map((p) => p.category))).map((c) => (
        <div key={c}>
          <p className="text-xs font-semibold uppercase opacity-60 mt-2">{c}</p>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <tbody>
                {list.filter((p) => p.category === c).map((p) => {
                  const isLow = isLowStock(p);
                  return (
                    <tr key={p.id} className={`border-t dark:border-gray-800 ${p.is_active ? '' : 'opacity-50'}`}>
                      <td className="py-2 font-medium">{p.name}{p.count_daily && <span className="ml-2 text-xs text-orange-600">soir</span>}</td>
                      <td className={`text-right tabular-nums ${isLow ? 'text-red-600 dark:text-red-400 font-semibold' : ''}`}>{Q(p.qty)} {p.unit}</td>
                      <td className="text-right opacity-70 hidden md:table-cell">{Number(p.min_qty) ? `min ${Q(p.min_qty)}` : 'pas de minimum'}</td>
                      <td className="text-right opacity-70 hidden md:table-cell">{p.unit_cost_fcfa ? `${F(p.unit_cost_fcfa)} / ${p.unit}` : '—'}</td>
                      <td className="text-right w-20">{canEdit && <Btn small onClick={() => setForm(toForm(p))}>Modifier</Btn>}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      ))}
    </Card>
  );
}
