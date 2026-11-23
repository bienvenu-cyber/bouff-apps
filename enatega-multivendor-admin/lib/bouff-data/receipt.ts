// Reçu BOUFF (ticket thermique 80 mm) — même format que la caisse /caisse du site.
// Ce n'est pas une facture normalisée : simple reçu remis au client.
// Le contenu vient toujours de la base (prix et montants enregistrés), jamais du ticket à l'écran.

export interface ReceiptLine {
  name: string;
  variant: string | null;
  quantity: number;
  unit_price_fcfa: number;
  line_total_fcfa: number;
  options: string[];
}

export interface Receipt {
  order_id?: string;
  order_number: string;
  status: string;
  source?: string;
  order_type?: string;
  created_at: string;
  paid_at: string | null;
  delivered_at?: string | null;
  edited_at?: string | null;
  dine_in: boolean;
  table_label?: string | null;
  payment_method: string;
  customer_name: string | null;
  delivery_address?: string | null;
  items_total_fcfa: number;
  discount_fcfa: number;
  delivery_fee_fcfa?: number;
  free_delivery_used?: boolean;
  wallet_used_fcfa?: number;
  tip_fcfa?: number;
  total_fcfa: number;
  cash_received_fcfa?: number | null;
  change_fcfa?: number | null;
  cashier_name: string | null;
  restaurant: { name: string; address: string | null; phone: string | null; city: string | null };
  items: ReceiptLine[];
}

// Infos ajoutées au premier reçu uniquement (non enregistrées en base).
export interface ReceiptExtras {
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

export function receiptTime(iso: string) {
  return new Date(iso).toLocaleTimeString("fr-FR", { timeZone: BENIN_TZ, hour: "2-digit", minute: "2-digit" });
}

export function paymentLabel(method: string) {
  if (method === "cash") return "Espèces";
  if (method === "mobile_money") return "Mobile Money";
  if (method === "card") return "Carte";
  return method;
}

// Monnaie rendue : jamais négative, absente si le montant reçu n'est pas saisi.
export function receiptChange(total: number, received?: number | null) {
  if (received === undefined || received === null || !Number.isFinite(received) || received <= 0) return null;
  return Math.max(0, Math.round(received) - total);
}

export function receiptItemCount(r: Pick<Receipt, "items">) {
  return r.items.reduce((s, l) => s + l.quantity, 0);
}

// Une commande est payée si l'encaissement est enregistré ou si elle a été remise.
export function receiptIsPaid(r: Pick<Receipt, "paid_at" | "status">) {
  return !!r.paid_at || r.status === "delivered";
}

export function serviceLabel(r: Pick<Receipt, "order_type" | "dine_in" | "table_label">) {
  if (r.order_type === "delivery") return "Livraison";
  if (r.dine_in) return r.table_label ? `Sur place · Table ${r.table_label}` : "Sur place";
  return "À emporter";
}

export interface ReceiptGroupTotals {
  total: number;
  items: number;
  orders: number;
  byPayment: { method: string; total: number }[];
  tables: string[];
}

// Reçu groupé : seules les commandes non annulées comptent dans le total.
export function receiptGroupTotals(list: Receipt[]): ReceiptGroupTotals {
  const live = list.filter((r) => r.status !== "cancelled");
  const pay = new Map<string, number>();
  for (const r of live) pay.set(r.payment_method, (pay.get(r.payment_method) ?? 0) + r.total_fcfa);
  return {
    total: live.reduce((s, r) => s + r.total_fcfa, 0),
    items: live.reduce((s, r) => s + receiptItemCount(r), 0),
    orders: live.length,
    byPayment: [...pay.entries()].map(([method, total]) => ({ method, total })),
    tables: [...new Set(list.map((r) => r.table_label).filter((t): t is string => !!t))],
  };
}

// Gérante / direction : reçus lus par la base, qui vérifie que la commande est bien de son restaurant.
export async function adminOrderReceipts(
  db: { rpc: (fn: string, args: Record<string, unknown>) => PromiseLike<{ data: unknown; error: { message: string } | null }> },
  orderIds: string[]
) {
  const { data, error } = await db.rpc('admin_order_receipts', { p_order_ids: orderIds });
  if (error) throw new Error(error.message);
  return (data ?? []) as Receipt[];
}
