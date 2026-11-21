// Reçu de caisse imprimé au comptoir (ticket thermique 80 mm).
// Ce n'est pas une facture normalisée : simple reçu remis au client.
// Le contenu vient toujours de la base (prix enregistrés), jamais du ticket à l'écran.

export interface ReceiptLine {
  name: string;
  variant: string | null;
  quantity: number;
  unit_price_fcfa: number;
  line_total_fcfa: number;
  options: string[];
}

export interface Receipt {
  order_number: string;
  status: string;
  created_at: string;
  paid_at: string | null;
  dine_in: boolean;
  payment_method: string;
  customer_name: string | null;
  items_total_fcfa: number;
  discount_fcfa: number;
  total_fcfa: number;
  cashier_name: string | null;
  restaurant: { name: string; address: string | null; phone: string | null; city: string | null };
  items: ReceiptLine[];
}

// Infos ajoutées au premier reçu uniquement (non enregistrées en base).
export interface ReceiptExtras {
  receivedFcfa?: number;
  pointsLinked?: boolean;
}

export const BENIN_TZ = "Africa/Porto-Novo";

export const receiptFcfa = (n: number) => `${Math.round(n).toLocaleString("fr-FR").replace(/\u202f|\u00a0/g, " ")} F`;

export function receiptDate(iso: string) {
  const d = new Date(iso);
  const date = d.toLocaleDateString("fr-FR", { timeZone: BENIN_TZ, day: "2-digit", month: "2-digit", year: "numeric" });
  const time = d.toLocaleTimeString("fr-FR", { timeZone: BENIN_TZ, hour: "2-digit", minute: "2-digit" });
  return `${date} à ${time}`;
}

export function paymentLabel(method: string) {
  if (method === "cash") return "Espèces";
  if (method === "mobile_money") return "Mobile Money";
  if (method === "card") return "Carte";
  return method;
}

// Monnaie rendue : jamais négative, absente si le montant reçu n'est pas saisi.
export function receiptChange(total: number, received?: number) {
  if (received === undefined || !Number.isFinite(received) || received <= 0) return null;
  return Math.max(0, Math.round(received) - total);
}

export function receiptItemCount(r: Pick<Receipt, "items">) {
  return r.items.reduce((s, l) => s + l.quantity, 0);
}
