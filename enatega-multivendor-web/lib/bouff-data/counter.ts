// Caisse du comptoir : connexion par code caissière, commandes payées sur place.
// Le code est vérifié par la base BOUFF ; la tablette garde seulement un jeton de session.
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { RESTAURANT_SLUG, SUPABASE_PUBLISHABLE_KEY, SUPABASE_URL } from "./config";
import type { Receipt } from "./receipt";

// Client sans session : la caisse n'utilise jamais le compte client
// éventuellement connecté sur la tablette.
let counterClient: SupabaseClient | null = null;
function bouffDb(): SupabaseClient {
  if (!counterClient) {
    counterClient = createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, {
      auth: { persistSession: false, autoRefreshToken: false, storageKey: "bouff-counter" },
    });
  }
  return counterClient;
}

const TOKEN_KEY = "bouff/counter-token";
const NAME_KEY = "bouff/counter-name";

export interface CounterCashier {
  id: string;
  name: string;
}

export interface CounterLineInput {
  menu_item_id: string;
  variant_id: string | null;
  option_ids: string[];
  quantity: number;
}

export interface CounterOrderLine {
  menu_item_id: string | null;
  variant_id: string | null;
  option_ids: string[];
  quantity: number;
  name: string;
  variant: string | null;
}

export function readCounterSession(): { token: string; name: string } | null {
  if (typeof window === "undefined") return null;
  const token = window.localStorage.getItem(TOKEN_KEY);
  const name = window.localStorage.getItem(NAME_KEY);
  return token ? { token, name: name ?? "" } : null;
}

function saveSession(token: string, name: string) {
  window.localStorage.setItem(TOKEN_KEY, token);
  window.localStorage.setItem(NAME_KEY, name);
}

export function clearCounterSession() {
  window.localStorage.removeItem(TOKEN_KEY);
  window.localStorage.removeItem(NAME_KEY);
}

export function isSessionError(e: unknown) {
  return e instanceof Error && /Session caisse expirée/.test(e.message);
}

export async function listCashiers(): Promise<CounterCashier[]> {
  const { data, error } = await bouffDb().rpc("counter_cashiers", { p_slug: RESTAURANT_SLUG });
  if (error) throw new Error(error.message);
  return (data ?? []) as CounterCashier[];
}

export async function counterLogin(cashierId: string, pin: string) {
  const { data, error } = await bouffDb().rpc("counter_login", { p_cashier_id: cashierId, p_pin: pin });
  if (error) throw new Error(error.message);
  const res = data as { ok: boolean; token?: string; name?: string; remaining?: number };
  if (res.ok && res.token) saveSession(res.token, res.name ?? "");
  return res;
}

export async function checkCounterSession(token: string) {
  const { data, error } = await bouffDb().rpc("counter_session", { p_token: token });
  if (error) throw new Error(error.message);
  return data as { name: string; restaurant_id: string };
}

export async function counterLogout(token: string) {
  await bouffDb().rpc("counter_logout", { p_token: token });
  clearCounterSession();
}

export async function counterPlaceOrder(input: {
  token: string;
  items: CounterLineInput[];
  dineIn: boolean;
  payment: "cash" | "mobile_money";
  customerName?: string;
  customerPhone?: string;
  note?: string;
  tableLabel?: string | null;
  cashReceived?: number | null;
}) {
  const { data, error } = await bouffDb().rpc("counter_place_order", {
    p_token: input.token,
    p_items: input.items,
    p_dine_in: input.dineIn,
    p_payment_method: input.payment,
    p_customer_name: input.customerName || null,
    p_customer_phone: input.customerPhone || null,
    p_note: input.note || null,
    p_table_label: input.tableLabel || null,
    p_cash_received: input.payment === "cash" && input.cashReceived ? input.cashReceived : null,
  });
  if (error) throw new Error(error.message);
  return data as {
    order_id: string;
    order_number: string;
    total_fcfa: number;
    table_label: string | null;
    cash_received_fcfa: number | null;
    change_fcfa: number | null;
    points_linked: boolean;
  };
}

// Modifier une commande tant que la cuisine ne l'a pas acceptée : même numéro, prix recalculés par la base.
export async function counterUpdateOrder(input: {
  token: string;
  orderId: string;
  items: CounterLineInput[];
  dineIn: boolean;
  tableLabel?: string | null;
  extraReceived?: number | null;
}) {
  const { data, error } = await bouffDb().rpc("counter_update_order", {
    p_token: input.token,
    p_order_id: input.orderId,
    p_items: input.items,
    p_dine_in: input.dineIn,
    p_table_label: input.tableLabel || null,
    p_extra_received: input.extraReceived ?? null,
  });
  if (error) throw new Error(error.message);
  return data as {
    order_id: string;
    order_number: string;
    payment_method: string;
    old_total_fcfa: number;
    total_fcfa: number;
    difference_fcfa: number;
    table_label: string | null;
    cash_received_fcfa: number | null;
    change_fcfa: number | null;
  };
}

export async function counterRecentOrders(token: string) {
  const { data, error } = await bouffDb().rpc("counter_recent_orders", { p_token: token });
  if (error) throw new Error(error.message);
  return (data ?? []) as Array<{
    id: string;
    order_number: string;
    status: string;
    total_fcfa: number;
    customer_name: string;
    customer_phone: string | null;
    dine_in: boolean;
    table_label: string | null;
    payment_method: string;
    cash_received_fcfa: number | null;
    created_at: string;
    edited_at: string | null;
    cancel_reason: string | null;
    lines: CounterOrderLine[];
  }>;
}

export async function counterCancelOrder(token: string, orderId: string, reason: string) {
  const { error } = await bouffDb().rpc("counter_cancel_order", { p_token: token, p_order_id: orderId, p_reason: reason });
  if (error) throw new Error(error.message);
}

export async function counterCompleteOrder(token: string, orderId: string) {
  const { error } = await bouffDb().rpc("counter_complete_order", { p_token: token, p_order_id: orderId });
  if (error) throw new Error(error.message);
}

export interface CounterDaySummary {
  period_start: string;
  orders_count: number;
  cancelled_count: number;
  edited_count?: number;
  cash_fcfa: number;
  momo_fcfa: number;
  cash_received_fcfa?: number;
  change_fcfa?: number;
  cash_counted_fcfa?: number;
  gap_fcfa?: number;
}

export async function counterDaySummary(token: string) {
  const { data, error } = await bouffDb().rpc("counter_day_summary", { p_token: token });
  if (error) throw new Error(error.message);
  return data as CounterDaySummary;
}

export async function counterCloseDay(token: string, cashCounted: number, note?: string) {
  const { data, error } = await bouffDb().rpc("counter_close_day", {
    p_token: token,
    p_cash_counted: cashCounted,
    p_note: note || null,
  });
  if (error) throw new Error(error.message);
  return data as CounterDaySummary;
}

// Reçu imprimable : la base vérifie la session caisse et le restaurant.
export async function counterOrderReceipt(token: string, orderId: string) {
  const { data, error } = await bouffDb().rpc("counter_order_receipt", { p_token: token, p_order_id: orderId });
  if (error) throw new Error(error.message);
  return data as Receipt;
}

// Reçu groupé (une table, un groupe) : uniquement des commandes caisse du même restaurant.
export async function counterOrderReceipts(token: string, orderIds: string[]) {
  const { data, error } = await bouffDb().rpc("counter_order_receipts", { p_token: token, p_order_ids: orderIds });
  if (error) throw new Error(error.message);
  return (data ?? []) as Receipt[];
}
