import { bouffDb, currentUserId } from "./supabase";
import { loadMenu } from "./catalog";
import { getGuest } from "./auth";
import { bouffStorage } from "./storage";

// Favoris, codes promo et notifications push de l'app client BOUFF.
// Toutes les règles (remise, limites, droits) sont appliquées par la base.

/* ------------------------------ Favoris ------------------------------ */

let favCache: Set<string> | null = null;
let favUser: string | null = null;

export async function favoriteIds(): Promise<Set<string>> {
  const uid = await currentUserId();
  if (!uid) return new Set();
  if (favCache && favUser === uid) return favCache;
  const { data, error } = await bouffDb()
    .from("favorites")
    .select("menu_item_id")
    .order("created_at", { ascending: false });
  if (error) throw new Error(error.message);
  favCache = new Set((data ?? []).map((r: any) => r.menu_item_id));
  favUser = uid;
  return favCache;
}

export function resetFavorites() {
  favCache = null;
  favUser = null;
}

export async function isFavorite(foodId: string) {
  return (await favoriteIds()).has(foodId);
}

export async function toggleFavorite(foodId: string) {
  const uid = await currentUserId();
  if (!uid) {
    return { success: false, message: "Connectez-vous pour ajouter des favoris.", isFavorite: false };
  }
  const ids = await favoriteIds();
  const db = bouffDb();
  if (ids.has(foodId)) {
    const { error } = await db.from("favorites").delete().eq("menu_item_id", foodId);
    if (error) return { success: false, message: error.message, isFavorite: true };
    ids.delete(foodId);
    return { success: true, message: "Retiré des favoris.", isFavorite: false };
  }
  const { error } = await db.from("favorites").insert({ menu_item_id: foodId });
  if (error && !/duplicate/i.test(error.message)) {
    return { success: false, message: error.message, isFavorite: false };
  }
  ids.add(foodId);
  return { success: true, message: "Ajouté aux favoris.", isFavorite: true };
}

/* ---------------------------- Codes promo ---------------------------- */

const COUPON_KEY = "bouff/coupon";

export interface CouponQuote {
  valid: boolean;
  code?: string;
  title?: string;
  kind?: "percent" | "fixed";
  value?: number;
  discount_fcfa?: number;
  message: string;
}

export async function checkCoupon(code: string, subtotal: number): Promise<CouponQuote> {
  const trimmed = (code ?? "").trim();
  if (!trimmed) return { valid: false, message: "Entrez un code promo." };
  const menu = await loadMenu();
  const { data, error } = await bouffDb().rpc("check_coupon", {
    p_restaurant: menu.restaurant.id,
    p_code: trimmed,
    p_subtotal: Math.max(0, Math.round(subtotal)),
    p_phone: getGuest()?.phone ?? null,
  });
  if (error) return { valid: false, message: error.message };
  return data as CouponQuote;
}

export function rememberCoupon(code: string | null) {
  if (code) bouffStorage.setItem(COUPON_KEY, code.toUpperCase());
  else bouffStorage.removeItem(COUPON_KEY);
}

export function rememberedCoupon(): string | null {
  return bouffStorage.getItem(COUPON_KEY) ?? null;
}

export async function publicCoupons() {
  const menu = await loadMenu();
  const { data, error } = await bouffDb().rpc("public_coupons", { p_restaurant: menu.restaurant.id });
  if (error) return [];
  return (data ?? []) as Array<{
    code: string;
    title: string;
    kind: "percent" | "fixed";
    value: number;
    min_order_fcfa: number;
    max_discount_fcfa: number | null;
    ends_at: string | null;
  }>;
}

/* ------------------------- Notifications push ------------------------ */

const PUSH_TOKEN_KEY = "bouff/push-token";
const PUSH_PREFS_KEY = "bouff/push-prefs";

export async function registerPushToken(token: string | null | undefined, platform?: string) {
  if (!token) return null;
  const uid = await currentUserId();
  if (!uid) return null;
  const { data, error } = await bouffDb().rpc("register_push_token", {
    p_token: token,
    p_platform: platform ?? null,
  });
  if (error) throw new Error(error.message);
  bouffStorage.setItem(PUSH_TOKEN_KEY, token);
  const prefs = pushPrefs();
  // réapplique les préférences choisies sur cet appareil
  if (!prefs.order || !prefs.offer) await setPushPrefs(prefs.order, prefs.offer);
  return data;
}

export function storedPushToken(): string | null {
  return bouffStorage.getItem(PUSH_TOKEN_KEY) ?? null;
}

export function pushPrefs(): { order: boolean; offer: boolean } {
  try {
    const raw = bouffStorage.getItem(PUSH_PREFS_KEY);
    if (raw) return { order: true, offer: true, ...JSON.parse(raw) };
  } catch {
    /* valeurs par défaut */
  }
  return { order: true, offer: true };
}

export async function setPushPrefs(order: boolean, offer: boolean) {
  bouffStorage.setItem(PUSH_PREFS_KEY, JSON.stringify({ order, offer }));
  if (!(await currentUserId())) return { order, offer };
  const { error } = await bouffDb().rpc("set_push_preferences", {
    p_order_updates: order,
    p_offers: offer,
  });
  if (error) throw new Error(error.message);
  return { order, offer };
}

/** À appeler avant la déconnexion : cet appareil ne reçoit plus les push du compte. */
export async function unregisterPushToken() {
  const token = storedPushToken();
  if (!token) return;
  try {
    await bouffDb().rpc("unregister_push_token", { p_token: token });
  } catch {
    /* sans effet bloquant */
  }
}
