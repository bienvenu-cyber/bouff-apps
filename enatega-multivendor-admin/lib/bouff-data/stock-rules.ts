// BOUFF — règles du cahier de stock affichées à l'écran.
// La base applique les mêmes règles (stock_* / hygiene_save) : l'écran ne sert qu'à prévenir plus tôt.

export const FRIDGE_MAX_C = 5;
export const FREEZER_MAX_C = -18;

export const LOSS_REASONS = [
  'Brûlé / raté',
  'Périmé / abîmé',
  'Erreur de commande',
  'Tombé / cassé',
  'Repas équipe',
  'Autre',
] as const;

export const EXPENSE_TYPES = [
  'Gaz',
  'Marché (hors stock)',
  'Transport',
  'Entretien / réparation',
  'Électricité / eau',
  'Communication',
  'Autre',
] as const;

export type HygieneItem = { key: string; label: string };

export const HYGIENE_ITEMS: Record<'ouverture' | 'fermeture', HygieneItem[]> = {
  ouverture: [
    { key: 'tenue', label: 'Équipe : mains lavées, tenue propre, cheveux attachés' },
    { key: 'plans', label: 'Plans de travail, plancha et ustensiles propres' },
    { key: 'gaz', label: 'Gaz vérifié : pas d’odeur, tuyau en bon état' },
    { key: 'dates', label: 'Produits du frigo dans leur date (rien de périmé)' },
    { key: 'salle', label: 'Salle, tables et toilettes propres' },
    { key: 'poubelles', label: 'Poubelles vides avec sac propre' },
  ],
  fermeture: [
    { key: 'plancha', label: 'Plancha, friteuse et ustensiles nettoyés' },
    { key: 'restes', label: 'Restes filmés, étiquetés avec la date, au frigo' },
    { key: 'froid', label: 'Frigo et congélateur bien fermés' },
    { key: 'gaz', label: 'Gaz fermé' },
    { key: 'sol', label: 'Sol lavé, cuisine et salle rangées' },
    { key: 'poubelles', label: 'Poubelles sorties' },
    { key: 'caisse', label: 'Caisse clôturée' },
  ],
};

/** « 1,5 » ou « 1.5 » → 1.5 ; vide, texte ou négatif → null. */
export function parseQty(input: string | number | null | undefined): number | null {
  if (input === null || input === undefined) return null;
  const s = String(input).trim().replace(/\s/g, '').replace(',', '.');
  if (s === '' || !/^\d+(\.\d+)?$/.test(s)) return null;
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
}

/** Montant en francs entier : « 12 500 » → 12500. */
export function parseAmount(input: string | number | null | undefined): number | null {
  if (input === null || input === undefined) return null;
  const s = String(input).replace(/[\s.]/g, '').replace(/F$/i, '');
  if (s === '' || !/^\d+$/.test(s)) return null;
  return Number(s);
}

/** Écart de comptage : positif = plus que prévu, négatif = il manque. Valeur au dernier prix d'achat. */
export function countGap(expected: number, counted: number, unitCost: number | null | undefined) {
  const gap = Math.round((counted - expected) * 1000) / 1000;
  return { gap, value: Math.round(gap * (unitCost ?? 0)) };
}

export function isLowStock(p: { qty: number; min_qty: number; is_active?: boolean }) {
  return p.is_active !== false && Number(p.min_qty) > 0 && Number(p.qty) <= Number(p.min_qty);
}

/** Une perte ne peut pas dépasser ce qui est en stock. */
export function lossError(stock: number, qty: number | null, unit: string, name: string): string | null {
  if (qty === null || qty <= 0) return 'Indique la quantité perdue.';
  if (qty > stock) return `Il ne reste que ${formatQty(stock)} ${unit} de « ${name} » en stock. Vérifie la quantité ou fais un comptage.`;
  return null;
}

export function fridgeOk(t: number | null) {
  return t !== null && t <= FRIDGE_MAX_C;
}

export function freezerOk(t: number | null) {
  return t !== null && t <= FREEZER_MAX_C;
}

export function hygieneAllOk(checked: Record<string, boolean>, items: HygieneItem[], fridge: number | null, freezer: number | null) {
  return items.every((i) => checked[i.key]) && fridgeOk(fridge) && freezerOk(freezer);
}

/** Température saisie : accepte « -18 », « 3,5 ». */
export function parseTemp(input: string): number | null {
  const s = input.trim().replace(',', '.');
  if (!/^-?\d+(\.\d+)?$/.test(s)) return null;
  return Number(s);
}

export function formatQty(n: number | string | null | undefined) {
  const v = Number(n ?? 0);
  return v.toLocaleString('fr-FR', { maximumFractionDigits: 3 });
}
