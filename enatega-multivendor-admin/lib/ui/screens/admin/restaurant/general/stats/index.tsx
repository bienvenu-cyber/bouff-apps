/* eslint-disable @typescript-eslint/no-explicit-any */
'use client';
// BOUFF — Statistiques & rapports : tous les calculs se font dans la base (admin_stats, admin_daily_reports).
import { useContext, useEffect, useMemo, useState } from 'react';
import { RestaurantLayoutContext } from '@/lib/context/restaurant/layout-restaurant.context';
import { bouffDb } from '@/lib/bouff-data/supabase';

type Bucket = { k: any; orders: number; sales?: number; qty?: number; minutes?: number };

const today = () => new Date(new Date().toLocaleString('en-US', { timeZone: 'Africa/Porto-Novo' }));
const iso = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
const addDays = (d: Date, n: number) => new Date(d.getFullYear(), d.getMonth(), d.getDate() + n);
const F = (n: any) => `${Number(n ?? 0).toLocaleString('fr-FR')} F`;
const N = (n: any) => Number(n ?? 0).toLocaleString('fr-FR');
const DAYS = ['', 'Lundi', 'Mardi', 'Mercredi', 'Jeudi', 'Vendredi', 'Samedi', 'Dimanche'];
const LBL: Record<string, string> = {
  delivery: 'Livraison', pickup: 'À emporter', dine_in: 'Sur place', takeaway: 'À emporter',
  cash: 'Espèces', mobile_money: 'Mobile Money', card: 'Carte', counter: 'Caisse', online: 'Appli / site', app: 'Appli', web: 'Site',
};
const lbl = (k: any) => LBL[String(k)] ?? String(k);

function presets() {
  const t = today();
  const dow = (t.getDay() + 6) % 7;
  const mStart = new Date(t.getFullYear(), t.getMonth(), 1);
  return [
    { id: 'today', label: "Aujourd'hui", from: t, to: t },
    { id: 'yesterday', label: 'Hier', from: addDays(t, -1), to: addDays(t, -1) },
    { id: 'week', label: 'Cette semaine', from: addDays(t, -dow), to: t },
    { id: 'lastweek', label: 'Semaine dernière', from: addDays(t, -dow - 7), to: addDays(t, -dow - 1) },
    { id: 'month', label: 'Ce mois', from: mStart, to: t },
    { id: 'lastmonth', label: 'Mois dernier', from: new Date(t.getFullYear(), t.getMonth() - 1, 1), to: addDays(mStart, -1) },
    { id: '30', label: '30 jours', from: addDays(t, -29), to: t },
  ];
}

function Delta({ now, before }: { now: number; before: number }) {
  if (!before) return <span className="text-xs opacity-60">—</span>;
  const p = Math.round(((now - before) / before) * 100);
  return <span className={`text-xs font-semibold ${p >= 0 ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400'}`}>{p >= 0 ? '+' : ''}{p} %</span>;
}

function Bars({ rows, label, value = 'orders', money = false }: { rows: Bucket[]; label: (k: any) => string; value?: 'orders' | 'sales' | 'qty'; money?: boolean }) {
  const max = Math.max(1, ...rows.map((r) => Number((r as any)[value] ?? 0)));
  if (!rows.length) return <p className="text-sm opacity-60">Aucune donnée sur la période.</p>;
  return (
    <div className="space-y-1">
      {rows.map((r, i) => {
        const v = Number((r as any)[value] ?? 0);
        return (
          <div key={i} className="flex items-center gap-2 text-sm">
            <span className="w-36 shrink-0 truncate">{label(r.k)}</span>
            <div className="flex-1 h-4 rounded bg-gray-200 dark:bg-gray-700 overflow-hidden">
              <div className="h-full bg-orange-500" style={{ width: `${(v / max) * 100}%` }} />
            </div>
            <span className="w-28 text-right tabular-nums">{money ? F(v) : N(v)}{r.sales != null && value !== 'sales' ? <span className="opacity-60"> · {F(r.sales)}</span> : null}</span>
          </div>
        );
      })}
    </div>
  );
}

function Card({ title, children }: { title: string; children: any }) {
  return (
    <div className="border rounded-lg p-4 dark:border-gray-700">
      <h2 className="font-semibold mb-3">{title}</h2>
      {children}
    </div>
  );
}

function toCsv(s: any, from: string, to: string) {
  const lines: string[][] = [[`BOUFF — Rapport du ${from} au ${to}`]];
  const k = s.kpis ?? {};
  lines.push([], ['Indicateur', 'Valeur'], ...Object.entries(k).map(([a, b]) => [a, String(b ?? '')]));
  const sec = (title: string, rows: Bucket[], f = (x: any) => String(x)) => {
    lines.push([], [title], ['Libellé', 'Commandes / Qté', 'Montant (F)']);
    rows.forEach((r) => lines.push([f(r.k), String(r.orders ?? r.qty ?? ''), String(r.sales ?? '')]));
  };
  sec('Par jour', s.by_day ?? []);
  sec('Par heure', s.by_hour ?? [], (h) => `${h} h`);
  sec('Par jour de semaine', s.by_weekday ?? [], (d) => DAYS[d]);
  sec('Produits', s.products ?? []);
  sec('Type de commande', s.by_type ?? [], lbl);
  sec('Paiement', s.by_payment ?? [], lbl);
  sec('Caissières', s.cashiers ?? []);
  sec('Livreurs', s.riders ?? []);
  lines.push([], ['Clôtures de caisse'], ['Date', 'Caissière', 'Attendu', 'Compté', 'Écart', 'MoMo']);
  (s.closures ?? []).forEach((c: any) => lines.push([new Date(c.at).toLocaleString('fr-FR'), c.cashier ?? '', c.expected, c.counted, c.gap, c.momo]));
  return '\ufeff' + lines.map((l) => l.map((c) => `"${String(c ?? '').replace(/"/g, '""')}"`).join(';')).join('\n');
}

function download(name: string, content: string) {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([content], { type: 'text/csv;charset=utf-8' }));
  a.download = name;
  a.click();
}

export default function StatsScreen() {
  const { restaurantLayoutContextData } = useContext(RestaurantLayoutContext);
  const restaurantId = restaurantLayoutContextData?.restaurantId || '';
  const ps = useMemo(presets, []);
  const [preset, setPreset] = useState('week');
  const [from, setFrom] = useState(iso(ps[2].from));
  const [to, setTo] = useState(iso(ps[2].to));
  const [tab, setTab] = useState<'stats' | 'reports'>('stats');
  const [s, setS] = useState<any>(null);
  const [reports, setReports] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!restaurantId) return;
    setLoading(true);
    setError('');
    bouffDb()
      .rpc('admin_stats', { p_restaurant_id: restaurantId, p_from: from, p_to: to })
      .then(({ data, error }) => {
        if (error) setError(error.message);
        setS(data);
        setLoading(false);
      });
  }, [restaurantId, from, to]);

  useEffect(() => {
    if (!restaurantId || tab !== 'reports') return;
    bouffDb()
      .rpc('admin_daily_reports', { p_restaurant_id: restaurantId, p_limit: 90 })
      .then(({ data, error }) => {
        if (error) setError(error.message);
        setReports((data as any[]) ?? []);
      });
  }, [restaurantId, tab]);

  const k = s?.kpis ?? {};
  const p = s?.previous ?? {};
  const kpis = [
    { t: "Chiffre d'affaires", v: F(k.sales), n: k.sales, b: p.sales },
    { t: 'Commandes', v: N(k.orders), n: k.orders, b: p.orders },
    { t: 'Panier moyen', v: F(k.avg_ticket), n: k.avg_ticket, b: p.avg_ticket },
    { t: 'Clients', v: N(k.customers), n: k.customers, b: p.customers },
    { t: 'Annulées', v: N(k.cancelled), n: k.cancelled, b: p.cancelled },
    { t: 'Préparation moy.', v: k.prep_min != null ? `${k.prep_min} min` : '—', n: 0, b: 0 },
    { t: 'Livraison moy.', v: k.delivery_min != null ? `${k.delivery_min} min` : '—', n: 0, b: 0 },
    { t: 'Note clients', v: k.rating != null ? `${k.rating} / 5 (${k.ratings})` : '—', n: 0, b: 0 },
    { t: 'Frais de livraison', v: F(k.delivery_fees), n: k.delivery_fees, b: p.delivery_fees },
    { t: 'Réductions', v: F(k.discounts), n: 0, b: 0 },
    { t: 'Pourboires', v: F(k.tips), n: 0, b: 0 },
  ];

  return (
    <div className="p-4 space-y-4 text-gray-900 dark:text-gray-100">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">Statistiques & rapports</h1>
          <p className="text-sm opacity-70">Heure du Bénin. Comparaison avec la période précédente de même durée.</p>
        </div>
        <div className="flex gap-2">
          {(['stats', 'reports'] as const).map((t) => (
            <button key={t} onClick={() => setTab(t)} className={`px-3 py-1 rounded text-sm border ${tab === t ? 'bg-orange-500 text-white border-orange-500' : ''}`}>
              {t === 'stats' ? 'Statistiques' : 'Résumés quotidiens'}
            </button>
          ))}
        </div>
      </div>

      {error && <p className="text-red-500 text-sm">{error}</p>}

      {tab === 'stats' && (
        <>
          <div className="flex flex-wrap items-center gap-2">
            {ps.map((x) => (
              <button key={x.id} onClick={() => { setPreset(x.id); setFrom(iso(x.from)); setTo(iso(x.to)); }}
                className={`px-3 py-1 rounded text-sm border ${preset === x.id ? 'bg-orange-500 text-white border-orange-500' : ''}`}>
                {x.label}
              </button>
            ))}
            <input type="date" value={from} max={to} onChange={(e) => { setPreset(''); setFrom(e.target.value); }} className="border rounded px-2 py-1 text-sm bg-transparent" />
            <span className="text-sm">→</span>
            <input type="date" value={to} min={from} onChange={(e) => { setPreset(''); setTo(e.target.value); }} className="border rounded px-2 py-1 text-sm bg-transparent" />
            <button disabled={!s} onClick={() => download(`BOUFF_rapport_${from}_${to}.csv`, toCsv(s, from, to))} className="px-3 py-1 rounded text-sm border">
              Télécharger (Excel)
            </button>
            {loading && <span className="text-sm opacity-60">Chargement…</span>}
          </div>

          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            {kpis.map((x) => (
              <div key={x.t} className="border rounded-lg p-3 dark:border-gray-700">
                <p className="text-xs opacity-70">{x.t}</p>
                <p className="text-lg font-bold">{x.v}</p>
                {x.b !== 0 && <Delta now={Number(x.n ?? 0)} before={Number(x.b ?? 0)} />}
              </div>
            ))}
          </div>

          <div className="grid md:grid-cols-2 gap-4">
            <Card title="Par heure (heures de rush)"><Bars rows={s?.by_hour ?? []} label={(h) => `${h} h – ${h + 1} h`} /></Card>
            <Card title="Par jour de la semaine"><Bars rows={s?.by_weekday ?? []} label={(d) => DAYS[d]} /></Card>
            <Card title="Par jour"><Bars rows={s?.by_day ?? []} value="sales" money label={(d) => new Date(d + 'T12:00:00').toLocaleDateString('fr-FR', { weekday: 'short', day: 'numeric', month: 'short' })} /></Card>
            <Card title="Produits les plus vendus"><Bars rows={s?.products ?? []} value="qty" label={(x) => x} /></Card>
            <Card title="Type de commande"><Bars rows={s?.by_type ?? []} label={lbl} /></Card>
            <Card title="Paiement"><Bars rows={s?.by_payment ?? []} label={lbl} /></Card>
            <Card title="Canal"><Bars rows={s?.by_source ?? []} label={lbl} /></Card>
            <Card title="Caissières"><Bars rows={s?.cashiers ?? []} value="sales" money label={(x) => x} /></Card>
            <Card title="Livreurs (livraisons · durée moy.)">
              {(s?.riders ?? []).length === 0 ? <p className="text-sm opacity-60">Aucune livraison sur la période.</p> :
                (s.riders as Bucket[]).map((r, i) => (
                  <p key={i} className="text-sm flex justify-between"><span>{r.k}</span><span>{r.orders} · {r.minutes ?? '—'} min</span></p>
                ))}
            </Card>
            <Card title="Motifs d'annulation"><Bars rows={s?.cancel_reasons ?? []} label={(x) => x} /></Card>
          </div>

          <Card title="Clôtures de caisse">
            {(s?.closures ?? []).length === 0 ? <p className="text-sm opacity-60">Aucune clôture sur la période.</p> : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead><tr className="text-left opacity-70"><th>Date</th><th>Caissière</th><th>Cmd</th><th>Espèces attendues</th><th>Comptées</th><th>Écart</th><th>MoMo</th></tr></thead>
                  <tbody>
                    {s.closures.map((c: any, i: number) => (
                      <tr key={i} className="border-t dark:border-gray-700">
                        <td>{new Date(c.at).toLocaleString('fr-FR', { timeZone: 'Africa/Porto-Novo' })}</td><td>{c.cashier}</td><td>{c.orders}</td>
                        <td>{F(c.expected)}</td><td>{F(c.counted)}</td>
                        <td className={c.gap < 0 ? 'text-red-600 dark:text-red-400 font-semibold' : ''}>{F(c.gap)}</td><td>{F(c.momo)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </Card>
        </>
      )}

      {tab === 'reports' && (
        <div className="space-y-2">
          <p className="text-sm opacity-70">Chaque nuit à 1 h, le résumé de la veille est enregistré ici et envoyé en notification aux gérants. Comparaison avec le même jour de la semaine précédente.</p>
          {reports.length === 0 && <p className="text-sm opacity-60">Le premier résumé arrivera cette nuit à 1 h.</p>}
          {reports.map((r) => {
            const a = r.data?.kpis ?? {};
            const b = r.data?.previous ?? {};
            const top = (r.data?.products ?? []).slice(0, 3).map((x: any) => `${x.k} (${x.qty})`).join(', ');
            const rush = [...(r.data?.by_hour ?? [])].sort((x: any, y: any) => y.orders - x.orders)[0];
            return (
              <div key={r.report_date} className="border rounded-lg p-3 dark:border-gray-700 flex flex-wrap gap-x-6 gap-y-1 items-center justify-between">
                <p className="font-semibold w-48">{new Date(r.report_date + 'T12:00:00').toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long' })}</p>
                <span className="text-sm">{N(a.orders)} cmd <Delta now={a.orders} before={b.orders} /></span>
                <span className="text-sm">{F(a.sales)} <Delta now={a.sales} before={b.sales} /></span>
                <span className="text-sm">Panier {F(a.avg_ticket)}</span>
                <span className="text-sm">{N(a.cancelled)} annulées</span>
                {rush && <span className="text-sm">Rush {rush.k} h</span>}
                {top && <span className="text-sm opacity-70 w-full">Top : {top}</span>}
                <button onClick={() => download(`BOUFF_resume_${r.report_date}.csv`, toCsv(r.data, r.report_date, r.report_date))} className="px-2 py-0.5 rounded border text-xs">Excel</button>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
