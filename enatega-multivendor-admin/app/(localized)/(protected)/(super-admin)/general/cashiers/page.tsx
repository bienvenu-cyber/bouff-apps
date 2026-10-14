'use client';

import { useCallback, useEffect, useState } from 'react';
import { bouffDb } from '@/lib/bouff-data/supabase';

interface Cashier {
  id: string;
  full_name: string;
  is_active: boolean;
  orders_today: number;
  total_today: number;
}

const fcfa = (n: number) => `${Number(n).toLocaleString('fr-FR')} F`;
const SITE = process.env.NEXT_PUBLIC_BOUFF_SITE_URL ?? 'https://bouff-web.lovable.app/';

export default function CashiersPage() {
  const [rows, setRows] = useState<Cashier[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [editing, setEditing] = useState<Cashier | 'new' | null>(null);
  const [name, setName] = useState('');
  const [pin, setPin] = useState('');
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    const { data, error } = await bouffDb().rpc('admin_list_cashiers', {});
    if (error) setError(error.message);
    else setRows((data ?? []) as Cashier[]);
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const open = (c: Cashier | 'new') => {
    setEditing(c);
    setName(c === 'new' ? '' : c.full_name);
    setPin('');
    setError(null);
  };

  const save = async () => {
    setBusy(true);
    setError(null);
    const isNew = editing === 'new';
    const { error } = await bouffDb().rpc('admin_save_cashier', {
      p_id: isNew ? null : (editing as Cashier).id,
      p_full_name: name,
      p_pin: pin ? pin : null,
    });
    setBusy(false);
    if (error) return setError(error.message);
    setNotice(
      isNew
        ? `${name} est créée. Donne-lui son code en privé.`
        : pin
          ? `Nouveau code enregistré pour ${name}. La tablette lui redemandera son code.`
          : `${name} est mise à jour.`,
    );
    setEditing(null);
    void load();
  };

  const toggle = async (c: Cashier) => {
    const { error } = await bouffDb().rpc('admin_set_cashier_active', { p_id: c.id, p_active: !c.is_active });
    if (error) return setError(error.message);
    setNotice(c.is_active ? `${c.full_name} est désactivée : son code ne marche plus.` : `${c.full_name} est réactivée.`);
    void load();
  };

  return (
    <div className="screen-container p-6">
      <div className="mb-6 flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold">Hôtesses</h1>
          <p className="text-sm text-gray-500">
            Chaque hôtesse a son propre code à 6 chiffres pour ouvrir la caisse du comptoir :{' '}
            <a className="underline" href={`${SITE.replace(/\/$/, '')}/caisse`} target="_blank" rel="noreferrer">
              {SITE.replace(/^https?:\/\//, '').replace(/\/$/, '')}/caisse
            </a>
          </p>
        </div>
        <button onClick={() => open('new')} className="rounded-md bg-black px-4 py-2 text-white dark:bg-white dark:text-black">
          + Ajouter une hôtesse
        </button>
      </div>

      {notice && <p className="mb-4 rounded-md bg-green-50 p-3 text-green-800">{notice}</p>}
      {error && !editing && <p className="mb-4 rounded-md bg-red-50 p-3 text-red-700">{error}</p>}

      {!rows && !error && <p className="text-gray-500">Chargement…</p>}
      {rows?.length === 0 && <p className="text-gray-500">Aucune hôtesse pour l'instant.</p>}

      {rows && rows.length > 0 && (
        <table className="w-full text-left">
          <thead className="border-b text-sm text-gray-500">
            <tr>
              <th className="py-2">Prénom</th>
              <th>Statut</th>
              <th>Aujourd'hui</th>
              <th className="text-right">Actions</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((c) => (
              <tr key={c.id} className="border-b">
                <td className="py-3 font-medium">{c.full_name}</td>
                <td>{c.is_active ? 'Active' : <span className="text-gray-400">Désactivée</span>}</td>
                <td>
                  {c.orders_today} commande{c.orders_today > 1 ? 's' : ''} · {fcfa(c.total_today)}
                </td>
                <td className="space-x-3 text-right">
                  <button onClick={() => open(c)} className="underline">Modifier / nouveau code</button>
                  <button onClick={() => toggle(c)} className="underline">
                    {c.is_active ? 'Désactiver' : 'Réactiver'}
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      {editing && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" onClick={() => !busy && setEditing(null)}>
          <div className="w-full max-w-md rounded-lg bg-white p-6 dark:bg-neutral-900" onClick={(e) => e.stopPropagation()}>
            <h2 className="mb-4 text-xl font-semibold">{editing === 'new' ? 'Nouvelle hôtesse' : `Modifier ${editing.full_name}`}</h2>
            <label className="mb-1 block text-sm">Prénom</label>
            <input value={name} onChange={(e) => setName(e.target.value)} className="mb-4 w-full rounded-md border px-3 py-2 dark:bg-neutral-800" />
            <label className="mb-1 block text-sm">
              Code à 6 chiffres {editing !== 'new' && <span className="text-gray-500">(laisser vide pour garder l'actuel)</span>}
            </label>
            <input
              value={pin}
              onChange={(e) => setPin(e.target.value.replace(/\D/g, '').slice(0, 6))}
              inputMode="numeric"
              className="mb-4 w-full rounded-md border px-3 py-2 tracking-widest dark:bg-neutral-800"
            />
            {error && <p className="mb-3 text-red-600">{error}</p>}
            <div className="flex justify-end gap-2">
              <button onClick={() => setEditing(null)} disabled={busy} className="rounded-md border px-4 py-2">Annuler</button>
              <button
                onClick={save}
                disabled={busy || !name.trim() || (editing === 'new' ? pin.length !== 6 : pin.length > 0 && pin.length !== 6)}
                className="rounded-md bg-black px-4 py-2 text-white disabled:opacity-40 dark:bg-white dark:text-black"
              >
                {busy ? 'Enregistrement…' : 'Enregistrer'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
