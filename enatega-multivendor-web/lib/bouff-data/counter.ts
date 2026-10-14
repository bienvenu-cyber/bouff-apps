// Caisse du comptoir : connexion par code caissière, commandes payées sur place.
// Le code est vérifié par la base BOUFF ; la tablette garde seulement un jeton de session.
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { RESTAURANT_SLUG, SUPABASE_PUBLISHABLE_KEY, SUPABASE_URL } from "./config";

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
}) {
  const { data, error } = await bouffDb().rpc("counter_place_order", {
    p_token: input.token,
    p_items: input.items,
    p_dine_in: input.dineIn,
    p_payment_method: input.payment,
    p_customer_name: input.customerName || null,
    p_customer_phone: input.customerPhone || null,
    p_note: input.note || null,
  });
  if (error) throw new Error(error.message);
  return data as {
    order_id: string;
    order_number: string;
    total_fcfa: number;
    points_linked: boolean;
  };
}

export async function counterRecentOrders(token: string) {
  const { data, error } = await bouffDb().rpc("counter_recent_orders", { p_token: token });
  if (error) throw new Error(error.message);
  return (data ?? []) as Array<{
    order_number: string;
    status: string;
    total_fcfa: number;
    customer_name: string;
    dine_in: boolean;
    payment_method: string;
    created_at: string;
  }>;
}
