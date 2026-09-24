import { bouffDb } from "./supabase";
import { getGuest } from "./auth";

// Notifications dans l'app.
// - Client connecté : lues dans la base (créées automatiquement à chaque
//   changement de statut) et reçues en direct.
// - Client sans compte : on suit ses commandes récentes avec son numéro de
//   téléphone et on crée la notification sur l'appareil quand le statut change.

export interface BouffNotification {
  id: string;
  title: string;
  body: string | null;
  orderNumber: string | null;
  createdAt: string;
  read: boolean;
}

const GUEST_ORDERS_KEY = "bouff/guest-orders";
const GUEST_NOTIFS_KEY = "bouff/guest-notifications";
const GUEST_STATUS_KEY = "bouff/guest-order-status";

const MESSAGES: Record<string, (takeaway: boolean) => string> = {
  received: () => "Nous avons bien reçu votre commande.",
  in_kitchen: () => "Votre commande est en préparation en cuisine.",
  ready: (t) =>
    t
      ? "Votre commande est prête, vous pouvez venir la récupérer."
      : "Votre commande est prête, un livreur va la prendre.",
  on_the_way: () => "Votre livreur est en route.",
  delivered: (t) =>
    t ? "Commande récupérée. Bon appétit !" : "Commande livrée. Bon appétit !",
  cancelled: () => "Votre commande a été annulée.",
};

function readJson<T>(key: string, fallback: T): T {
  if (typeof window === "undefined") return fallback;
  try {
    return JSON.parse(window.localStorage.getItem(key) ?? "") as T;
  } catch {
    return fallback;
  }
}
function writeJson(key: string, value: unknown) {
  if (typeof window !== "undefined")
    window.localStorage.setItem(key, JSON.stringify(value));
}

export function rememberGuestOrder(orderNumber: string) {
  const list = readJson<string[]>(GUEST_ORDERS_KEY, []);
  writeJson(GUEST_ORDERS_KEY, [orderNumber, ...list.filter((o) => o !== orderNumber)].slice(0, 10));
}

async function userId(): Promise<string | null> {
  const { data } = await bouffDb().auth.getUser();
  return data.user?.id ?? null;
}

export async function listNotifications(): Promise<BouffNotification[]> {
  const uid = await userId();
  if (uid) {
    const { data } = await bouffDb()
      .from("notifications")
      .select("id, title, body, read_at, created_at, orders(order_number)")
      .order("created_at", { ascending: false })
      .limit(30);
    return (data ?? []).map((n: any) => ({
      id: n.id,
      title: n.title,
      body: n.body,
      orderNumber: n.orders?.order_number ?? null,
      createdAt: n.created_at,
      read: Boolean(n.read_at),
    }));
  }
  return readJson<BouffNotification[]>(GUEST_NOTIFS_KEY, []);
}

// Vérifie les commandes invité et crée les notifications manquantes.
export async function refreshGuestNotifications(): Promise<boolean> {
  if (await userId()) return false;
  const guest = getGuest();
  const orders = readJson<string[]>(GUEST_ORDERS_KEY, []);
  if (!guest?.phone || !orders.length) return false;
  const statuses = readJson<Record<string, string>>(GUEST_STATUS_KEY, {});
  const notifs = readJson<BouffNotification[]>(GUEST_NOTIFS_KEY, []);
  let changed = false;
  for (const orderNumber of orders) {
    if (statuses[orderNumber] === "delivered" || statuses[orderNumber] === "cancelled") continue;
    const { data } = await bouffDb().rpc("track_order", {
      p_order_number: orderNumber,
      p_phone: guest.phone,
    });
    const t = data as any;
    if (!t?.status || t.status === statuses[orderNumber]) continue;
    statuses[orderNumber] = t.status;
    notifs.unshift({
      id: `${orderNumber}-${t.status}`,
      title: `Commande ${orderNumber}`,
      body: MESSAGES[t.status]?.(t.order_type === "takeaway") ?? null,
      orderNumber,
      createdAt: new Date().toISOString(),
      read: false,
    });
    changed = true;
  }
  if (changed) {
    writeJson(GUEST_STATUS_KEY, statuses);
    writeJson(GUEST_NOTIFS_KEY, notifs.slice(0, 30));
  }
  return changed;
}

export async function markAllRead() {
  const uid = await userId();
  if (uid) {
    await bouffDb()
      .from("notifications")
      .update({ read_at: new Date().toISOString() })
      .is("read_at", null)
      .eq("user_id", uid);
    return;
  }
  writeJson(
    GUEST_NOTIFS_KEY,
    readJson<BouffNotification[]>(GUEST_NOTIFS_KEY, []).map((n) => ({ ...n, read: true })),
  );
}

// Écoute en direct les nouvelles notifications du client connecté.
export async function subscribeNotifications(onChange: () => void) {
  const uid = await userId();
  if (!uid) return () => {};
  const channel = bouffDb()
    .channel(`notifications-${uid}`)
    .on(
      "postgres_changes",
      { event: "INSERT", schema: "public", table: "notifications", filter: `user_id=eq.${uid}` },
      onChange,
    )
    .subscribe();
  return () => {
    void bouffDb().removeChannel(channel);
  };
}
