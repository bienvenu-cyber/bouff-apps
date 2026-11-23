// Règles de la caisse calculées sur la tablette (la base refait toujours les mêmes contrôles).

export interface EditSettlement {
  // collect : le client doit payer la différence ; refund : on lui rend la différence.
  kind: "collect" | "refund" | "none";
  amount: number;
}

// Différence à régler quand une commande déjà payée est modifiée.
export function editSettlement(oldTotal: number, newTotal: number): EditSettlement {
  const d = Math.round(newTotal) - Math.round(oldTotal);
  if (d > 0) return { kind: "collect", amount: d };
  if (d < 0) return { kind: "refund", amount: -d };
  return { kind: "none", amount: 0 };
}

// Numéro de table : facultatif, seulement sur place, 12 caractères maximum.
export function normalizeTable(dineIn: boolean, value: string) {
  const t = value.trim();
  if (!dineIn || !t) return null;
  return t.slice(0, 12);
}

// Seule une commande que la cuisine n'a pas encore acceptée peut être modifiée.
export function canEditCounterOrder(status: string) {
  return status === "received";
}
