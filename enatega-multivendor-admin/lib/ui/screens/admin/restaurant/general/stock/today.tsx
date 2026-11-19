'use client';
// BOUFF — « Ma journée » : les étapes du jour et les chiffres essentiels, sans calcul à faire.
import { Card, DaySummary, F, Q } from './shared';

export type Tab = 'today' | 'reception' | 'loss' | 'expense' | 'count' | 'hygiene' | 'stock' | 'history';

function Step({ done, warn, title, detail, action, onClick }: {
  done: boolean; warn?: boolean; title: string; detail: string; action: string; onClick: () => void;
}) {
  return (
    <div className="flex items-center gap-3 border rounded-lg p-3 dark:border-gray-700">
      <span className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-sm font-bold ${
        warn ? 'bg-red-500 text-white' : done ? 'bg-green-600 text-white' : 'bg-gray-200 dark:bg-gray-700'
      }`}>
        {warn ? '!' : done ? '✓' : '·'}
      </span>
      <div className="flex-1 min-w-0">
        <p className="font-medium">{title}</p>
        <p className="text-xs opacity-70">{detail}</p>
      </div>
      <button type="button" onClick={onClick} className="px-3 py-2 rounded text-sm font-medium bg-orange-500 text-white hover:bg-orange-600 shrink-0">
        {action}
      </button>
    </div>
  );
}

const time = (iso?: string) => (iso ? new Date(iso).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit', timeZone: 'Africa/Porto-Novo' }) : '');

export default function Today({ day, go, firstCount }: { day: DaySummary | null; go: (t: Tab) => void; firstCount: boolean }) {
  if (!day) return <p className="text-sm opacity-60">Chargement…</p>;
  const ho = day.hygiene?.ouverture;
  const hf = day.hygiene?.fermeture;
  const counted = (day.counts ?? []).length > 0;
  const kpis = [
    { t: 'Ventes du jour', v: F(day.sales) },
    { t: 'Dépenses du jour', v: F(day.expenses), sub: day.expenses_caisse ? `dont ${F(day.expenses_caisse)} sortis de la caisse` : '' },
    { t: 'Argent du jour', v: F(day.money_left), sub: 'ventes − dépenses', bad: day.money_left < 0 },
    { t: 'Pertes', v: F(day.losses), sub: `${day.losses_count} saisie(s)`, bad: day.losses > 0 },
    { t: 'Écart du comptage', v: F(day.count_gap), sub: counted ? 'stock compté − stock prévu' : 'pas encore compté', bad: day.count_gap < 0 },
    { t: 'Écart de caisse', v: F(day.closures_gap), sub: `${day.closures_count} clôture(s)`, bad: day.closures_gap < 0 },
  ];
  return (
    <div className="space-y-4">
      {firstCount && (
        <div className="rounded-lg border border-orange-500 p-3 text-sm">
          <b>Pour démarrer :</b> fais un <b>comptage complet</b> une première fois. Il enregistre ce que tu as vraiment en stock.
          Ensuite, chaque jour, il suffit de suivre les étapes ci-dessous.
          <button type="button" onClick={() => go('count')} className="ml-2 underline font-medium">Faire le comptage complet</button>
        </div>
      )}

      <Card title="Ma journée">
        <div className="space-y-2">
          <Step done={!!ho} warn={ho && !ho.ok} title="1. Contrôle d’ouverture"
            detail={ho ? `${ho.ok ? 'Tout est bon' : 'Un point à corriger'} · ${ho.by ?? ''} à ${time(ho.at)}` : 'Hygiène, gaz, températures du frigo et du congélateur'}
            action={ho ? 'Voir' : 'Faire'} onClick={() => go('hygiene')} />
          <Step done={day.received_count > 0} title="2. Arrivages"
            detail={day.received_count ? `${day.received_count} produit(s) reçus · ${F(day.received)}` : 'À chaque livraison ou retour du marché'}
            action="Ajouter" onClick={() => go('reception')} />
          <Step done={day.losses_count > 0} title="3. Pertes"
            detail={day.losses_count ? `${day.losses_count} saisie(s) · ${F(day.losses)}` : 'Brûlé, périmé, tombé, erreur, repas de l’équipe'}
            action="Ajouter" onClick={() => go('loss')} />
          <Step done={day.expenses_count > 0} title="4. Dépenses"
            detail={day.expenses_count ? `${day.expenses_count} dépense(s) · ${F(day.expenses)}` : 'Gaz, transport, réparation… avec le reçu'}
            action="Ajouter" onClick={() => go('expense')} />
          <Step done={counted} warn={counted && day.count_gap < 0} title="5. Comptage du soir"
            detail={counted ? `Fait · écart ${F(day.count_gap)}` : 'Compter les produits clés après le service'}
            action={counted ? 'Refaire' : 'Compter'} onClick={() => go('count')} />
          <Step done={!!hf} warn={hf && !hf.ok} title="6. Contrôle de fermeture"
            detail={hf ? `${hf.ok ? 'Tout est bon' : 'Un point à corriger'} · ${hf.by ?? ''} à ${time(hf.at)}` : 'Nettoyage, restes étiquetés, gaz fermé'}
            action={hf ? 'Voir' : 'Faire'} onClick={() => go('hygiene')} />
        </div>
      </Card>

      <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
        {kpis.map((k) => (
          <div key={k.t} className="border rounded-lg p-3 dark:border-gray-700">
            <p className="text-xs opacity-70">{k.t}</p>
            <p className={`text-lg font-bold ${k.bad ? 'text-red-600 dark:text-red-400' : ''}`}>{k.v}</p>
            {k.sub && <p className="text-xs opacity-60">{k.sub}</p>}
          </div>
        ))}
      </div>

      <Card title="Stock bas">
        {day.low_stock.length === 0 ? (
          <p className="text-sm opacity-60">Aucun produit sous son minimum. Fixe les minimums dans l’onglet « Stock » pour recevoir les alertes.</p>
        ) : (
          <ul className="space-y-1">
            {day.low_stock.map((p) => (
              <li key={p.id} className="flex justify-between text-sm">
                <span className="font-medium text-red-600 dark:text-red-400">{p.name}</span>
                <span>reste {Q(p.qty)} {p.unit} · minimum {Q(p.min_qty)}</span>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  );
}
