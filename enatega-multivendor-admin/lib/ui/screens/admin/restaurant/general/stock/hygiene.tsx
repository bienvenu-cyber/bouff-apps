'use client';
// BOUFF — Contrôles d'ouverture et de fermeture (cases + températures), un par jour et par moment.
import { useEffect, useState } from 'react';
import { bouffDb } from '@/lib/bouff-data/supabase';
import { FREEZER_MAX_C, freezerOk, FRIDGE_MAX_C, fridgeOk, HYGIENE_ITEMS, hygieneAllOk, parseTemp } from '@/lib/bouff-data/stock-rules';
import { Btn, Card, Ctx, DaySummary, errText, Field, inputCls } from './shared';

type Moment = 'ouverture' | 'fermeture';
type Saved = { items: { key: string; ok: boolean }[]; fridge_temp: number | null; freezer_temp: number | null; note: string | null };

export default function Hygiene({ ctx, day, done }: { ctx: Ctx; day: DaySummary | null; done: () => void }) {
  const [moment, setMoment] = useState<Moment>(day?.hygiene?.ouverture ? 'fermeture' : 'ouverture');
  const [checked, setChecked] = useState<Record<string, boolean>>({});
  const [fridge, setFridge] = useState('');
  const [freezer, setFreezer] = useState('');
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const items = HYGIENE_ITEMS[moment];
  const fr = parseTemp(fridge);
  const fz = parseTemp(freezer);
  const already = day?.hygiene?.[moment];

  useEffect(() => {
    let off = false;
    setChecked({}); setFridge(''); setFreezer(''); setNote('');
    if (!day) return;
    bouffDb().from('hygiene_checks').select('items, fridge_temp, freezer_temp, note')
      .eq('restaurant_id', ctx.restaurantId).eq('local_day', day.day).eq('moment', moment).maybeSingle()
      .then(({ data }) => {
        if (off || !data) return;
        const s = data as Saved;
        setChecked(Object.fromEntries((s.items ?? []).map((i) => [i.key, !!i.ok])));
        setFridge(s.fridge_temp === null ? '' : String(s.fridge_temp).replace('.', ','));
        setFreezer(s.freezer_temp === null ? '' : String(s.freezer_temp).replace('.', ','));
        setNote(s.note ?? '');
      });
    return () => { off = true; };
  }, [moment, ctx.restaurantId, day]);

  async function save() {
    if (fr === null || fz === null) return ctx.notify('Note la température du frigo et du congélateur (ex. 4 et -18).', false);
    const ok = hygieneAllOk(checked, items, fr, fz);
    if (!ok && !note.trim()) return ctx.notify('Un point n’est pas bon : écris dans la note ce qui a été fait.', false);
    setBusy(true);
    const { error } = await bouffDb().rpc('hygiene_save', {
      p_restaurant_id: ctx.restaurantId, p_moment: moment,
      p_items: items.map((i) => ({ key: i.key, label: i.label, ok: !!checked[i.key] })),
      p_fridge_temp: fr, p_freezer_temp: fz, p_note: note.trim() || null,
    });
    setBusy(false);
    if (error) return ctx.notify(errText(error), false);
    const label = moment === 'ouverture' ? 'd’ouverture' : 'de fermeture';
    ctx.notify(ok ? `Contrôle ${label} enregistré : tout est bon.` : `Contrôle ${label} enregistré avec un point à corriger.`, ok);
    await ctx.reload();
    done();
  }

  return (
    <Card title="Hygiène et sécurité">
      <div className="flex gap-2">
        {(['ouverture', 'fermeture'] as const).map((m) => (
          <button key={m} type="button" onClick={() => setMoment(m)}
            className={`px-3 py-2 rounded text-sm border ${moment === m ? 'bg-orange-500 border-orange-500 text-white' : 'dark:border-gray-600'}`}>
            {m === 'ouverture' ? 'Ouverture' : 'Fermeture'}{day?.hygiene?.[m] ? ' ✓' : ''}
          </button>
        ))}
      </div>
      {already && <p className="text-xs opacity-70">Déjà fait aujourd’hui par {already.by ?? 'l’équipe'}. Tu peux corriger et enregistrer à nouveau.</p>}
      <div className="space-y-2">
        {items.map((i) => (
          <label key={i.key} className="flex items-center gap-3 border rounded p-3 dark:border-gray-700 cursor-pointer">
            <input type="checkbox" className="h-5 w-5 accent-orange-500" checked={!!checked[i.key]}
              onChange={(e) => setChecked((s) => ({ ...s, [i.key]: e.target.checked }))} />
            <span className="text-sm">{i.label}</span>
          </label>
        ))}
      </div>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Frigo (°C)" hint={`${FRIDGE_MAX_C} °C maximum`}>
          <input inputMode="decimal" value={fridge} onChange={(e) => setFridge(e.target.value)} placeholder="ex. 4"
            className={`${inputCls} ${fr !== null && !fridgeOk(fr) ? 'border-red-500' : ''}`} />
        </Field>
        <Field label="Congélateur (°C)" hint={`${FREEZER_MAX_C} °C maximum`}>
          <input inputMode="decimal" value={freezer} onChange={(e) => setFreezer(e.target.value)} placeholder="ex. -18"
            className={`${inputCls} ${fz !== null && !freezerOk(fz) ? 'border-red-500' : ''}`} />
        </Field>
      </div>
      {((fr !== null && !fridgeOk(fr)) || (fz !== null && !freezerOk(fz))) && (
        <p className="text-sm text-red-600 dark:text-red-400">Température trop haute : vérifie la porte et le réglage, puis contrôle les produits.</p>
      )}
      <Field label="Note (obligatoire si un point n’est pas bon)"><input value={note} onChange={(e) => setNote(e.target.value)} className={inputCls} /></Field>
      <div className="flex justify-end"><Btn primary disabled={busy} onClick={save}>{busy ? 'Enregistrement…' : 'Enregistrer le contrôle'}</Btn></div>
    </Card>
  );
}
