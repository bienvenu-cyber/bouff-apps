// Règles pures du paiement FeexPay (testables sans réseau).

/** Numéro béninois → format local 01XXXXXXXX. Les anciens numéros à 8 chiffres reçoivent le préfixe 01. */
export function beninLocal(input: unknown): string | null {
  let d = String(input ?? "").replace(/\D/g, "");
  if (d.startsWith("00229")) d = d.slice(5);
  else if (d.startsWith("229") && d.length >= 11) d = d.slice(3);
  if (/^\d{8}$/.test(d)) d = `01${d}`;
  return /^01\d{8}$/.test(d) ? d : null;
}

const REASONS: Record<string, string> = {
  LOW_BALANCE_OR_PAYEE_LIMIT_REACHED_OR_NOT_ALLOWED: "Solde insuffisant ou plafond atteint sur ce compte Mobile Money.",
  PAYER_NOT_FOUND: "Ce numéro n'a pas de compte Mobile Money sur ce réseau.",
  INVALID_PHONE_NUMBER: "Numéro de téléphone invalide pour ce réseau.",
};

/** Motif d'échec FeexPay → phrase française affichable au client. */
export function frenchReason(raw: unknown): string {
  const r = String(raw ?? "").trim();
  if (!r) return "Paiement refusé ou non validé.";
  if (REASONS[r]) return REASONS[r];
  if (/insufficient|insuffisant|low.?balance/i.test(r)) return "Solde insuffisant.";
  if (/declin|refus|reject|cancel/i.test(r)) return "Paiement refusé ou annulé.";
  if (/timeout|expir|délai/i.test(r)) return "Délai de validation dépassé.";
  if (/^[A-Z0-9_ ]+$/.test(r)) return "Paiement refusé ou non validé.";
  if (/[éèêàçùô]/i.test(r)) return r.slice(0, 200);
  return "Paiement refusé ou non validé.";
}
