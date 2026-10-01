// Passerelle BOUFF pour l'app livreur.
// Les écrans d'origine envoient toujours leurs requêtes « GraphQL Enatega » ;
// ce lien y répond avec la base BOUFF. Prise de course et étapes passent par
// les fonctions contrôlées de la base (claim_order, rider_advance_order).
import { ApolloLink, Observable, type Operation } from "@apollo/client";
import type { DocumentNode, OperationDefinitionNode } from "graphql";
import { bouffDb } from "./supabase";

const ORDER_SELECT =
  "*, tip_fcfa, scheduled_for, order_items(*, order_item_options(id, name, price_delta_fcfa)), riders(id, full_name, phone), restaurants(id, name, logo_url, address, latitude, longitude), delivery_zones(name)";

type Rider = {
  id: string;
  user_id: string;
  restaurant_id: string;
  full_name: string;
  phone: string | null;
  status: "offline" | "available" | "on_delivery";
  is_active: boolean;
  created_at: string;
  updated_at: string;
};

async function currentRider(): Promise<Rider> {
  const db = bouffDb();
  const { data: auth } = await db.auth.getUser();
  if (!auth.user) throw new Error("unauthenticated");
  const { data, error } = await db
    .from("riders")
    .select("*")
    .eq("user_id", auth.user.id)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) throw new Error("Aucun livreur associé à ce compte.");
  return data as Rider;
}

function statuses(o: any) {
  const mine = !!o.rider_id;
  switch (o.status) {
    case "in_kitchen":
      return { orderStatus: mine ? "ASSIGNED" : "ACCEPTED", orderState: "ACCEPTED" };
    case "ready":
      return { orderStatus: mine ? "ASSIGNED" : "ACCEPTED", orderState: "READY_FOR_PICKUP" };
    case "on_the_way":
      return { orderStatus: "PICKED", orderState: "PICKED_UP" };
    case "delivered":
      return { orderStatus: "DELIVERED", orderState: "DELIVERED" };
    case "cancelled":
      return { orderStatus: "CANCELLED", orderState: "CANCELLED" };
    default:
      return { orderStatus: "PENDING", orderState: "PENDING" };
  }
}

const loc = { __typename: "Location", coordinates: ["0", "0"] };
// GeoJSON : [longitude, latitude]. "0" = position inconnue.
const geo = (lat: any, lng: any) =>
  lat != null && lng != null
    ? { __typename: "Location", coordinates: [String(lng), String(lat)] }
    : loc;

function mapOrder(o: any) {
  const { orderStatus, orderState } = statuses(o);
  const zone = o.delivery_zones?.name ? `${o.delivery_zones.name} — ` : "";
  return {
    __typename: "Order",
    _id: o.id,
    orderId: o.order_number,
    createdAt: o.created_at,
    acceptedAt: o.accepted_at,
    assignedAt: o.rider_id ? o.updated_at : null,
    pickedAt: o.picked_up_at,
    deliveredAt: o.delivered_at,
    expectedTime: o.estimated_ready_at,
    preparationTime: o.estimated_ready_at,
    isPickedUp: ["on_the_way", "delivered"].includes(o.status),
    deliveryCharges: o.delivery_fee_fcfa,
    restaurant: {
      __typename: "RestaurantPreview",
      _id: o.restaurant_id,
      name: o.restaurants?.name ?? "",
      image: o.restaurants?.logo_url ?? "",
      address: o.restaurants?.address ?? "",
      location: geo(o.restaurants?.latitude, o.restaurants?.longitude),
    },
    deliveryAddress: {
      __typename: "OrderAddress",
      location: geo(o.delivery_lat, o.delivery_lng),
      deliveryAddress: `${zone}${o.delivery_address ?? ""}`,
      label: "Livraison",
      details: o.note ?? "",
    },
    items: (o.order_items ?? []).map((i: any) => ({
      __typename: "Item",
      _id: i.id,
      title: i.item_name,
      food: i.item_id ?? i.id,
      description: i.note ?? "",
      image: null,
      quantity: i.quantity,
      variation: {
        __typename: "ItemVariation",
        _id: i.variant_id ?? i.id,
        title: i.variant_name ?? "",
        price: i.unit_price_fcfa,
      },
      addons: (i.order_item_options ?? []).length
        ? [
            {
              __typename: "ItemAddon",
              _id: `${i.id}-options`,
              title: "Options",
              description: null,
              quantityMinimum: 0,
              quantityMaximum: 99,
              options: i.order_item_options.map((op: any) => ({
                __typename: "ItemOption",
                _id: op.id,
                title: op.name,
                price: op.price_delta_fcfa,
              })),
            },
          ]
        : [],
      isActive: true,
      createdAt: i.created_at,
    })),
    user: {
      __typename: "OrderUser",
      _id: o.customer_id ?? o.customer_phone,
      name: o.customer_name,
      phone: o.customer_phone,
    },
    paymentMethod:
      o.payment_method === "mobile_money" ? "Mobile Money" : "Espèces",
    paidAmount: 0,
    orderAmount: o.total_fcfa,
    paymentStatus: "PENDING",
    orderStatus,
    orderState,
    tipping: o.tip_fcfa || 0,
    scheduledAt: o.scheduled_for,
    taxationAmount: 0,
    reason: o.cancel_reason,
    isRiderRinged: !o.rider_id,
    eta: null,
    rider: o.riders
      ? {
          __typename: "Rider",
          _id: o.riders.id,
          name: o.riders.full_name,
          username: o.riders.phone ?? "",
        }
      : null,
  };
}

async function fetchOrder(id: string) {
  const { data, error } = await bouffDb()
    .from("orders")
    .select(ORDER_SELECT)
    .eq("id", id)
    .maybeSingle();
  if (error) throw new Error(error.message);
  return data ? mapOrder(data) : null;
}

// Courses du livreur + courses libres de son restaurant (les règles d'accès
// de la base ne laissent voir que celles-là).
async function riderOrders(offset = 0, limit = 50) {
  const r = await currentRider();
  const { data, error } = await bouffDb()
    .from("orders")
    .select(ORDER_SELECT)
    .eq("restaurant_id", r.restaurant_id)
    .eq("order_type", "delivery")
    .or(`rider_id.eq.${r.id},and(rider_id.is.null,status.in.(in_kitchen,ready))`)
    .order("created_at", { ascending: false })
    .range(offset, offset + limit - 1);
  if (error) throw new Error(error.message);
  return (data ?? []).map(mapOrder);
}

async function rpc(name: string, args: Record<string, unknown>) {
  const { data, error } = await bouffDb().rpc(name, args);
  if (error) throw new Error(error.message);
  return data;
}

async function delivered(riderId: string) {
  const { data } = await bouffDb()
    .from("orders")
    .select("id, order_number, delivery_fee_fcfa, tip_fcfa, delivered_at, payment_method")
    .eq("rider_id", riderId)
    .eq("status", "delivered")
    .order("delivered_at", { ascending: false })
    .limit(5000);
  return data ?? [];
}

async function profile() {
  const r = await currentRider();
  const { data: auth } = await bouffDb().auth.getUser();
  const total = (await delivered(r.id)).reduce(
    (s, o: any) => s + (o.delivery_fee_fcfa ?? 0) + (o.tip_fcfa ?? 0),
    0,
  );
  return {
    __typename: "Rider",
    _id: r.id,
    name: r.full_name,
    username: auth.user?.email ?? "",
    email: auth.user?.email ?? "",
    phone: r.phone ?? "",
    image: null,
    available: r.status !== "offline",
    assigned: r.status === "on_delivery",
    isActive: r.is_active,
    vehicleType: "bike",
    accountNumber: null,
    zone: { __typename: "Zone", _id: r.restaurant_id },
    location: loc,
    bussinessDetails: null,
    licenseDetails: null,
    vehicleDetails: null,
    timeZone: "Africa/Porto-Novo",
    workSchedule: [],
    currentWalletAmount: total,
    totalWalletAmount: total,
    withdrawnWalletAmount: 0,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
  };
}

async function earningsGraph() {
  const r = await currentRider();
  const byDay = new Map<string, any>();
  for (const o of await delivered(r.id)) {
    const date = String(o.delivered_at ?? "").slice(0, 10);
    const day =
      byDay.get(date) ??
      {
        __typename: "RiderEarnings",
        _id: date,
        date,
        earningsArray: [],
        totalDeliveries: 0,
        totalEarningsSum: 0,
        totalHours: 0,
        totalTipsSum: 0,
      };
    day.earningsArray.push({
      __typename: "RiderEarningsItem",
      tip: o.tip_fcfa || 0,
      orderDetails: {
        __typename: "OrderDetails",
        orderType: "delivery",
        orderId: o.order_number,
        paymentMethod: o.payment_method,
      },
      totalEarnings: (o.delivery_fee_fcfa || 0) + (o.tip_fcfa || 0),
      deliveryFee: o.delivery_fee_fcfa,
      date: o.delivered_at,
    });
    day.totalDeliveries += 1;
    day.totalEarningsSum += (o.delivery_fee_fcfa || 0) + (o.tip_fcfa || 0);
    day.totalTipsSum += (o.tip_fcfa || 0);
    byDay.set(date, day);
  }
  const earnings = [...byDay.values()];
  return { __typename: "RiderEarningsGraph", totalCount: earnings.length, earnings };
}

function mapMessage(m: any, riderId: string | null) {
  return {
    __typename: "ChatMessageOutput",
    id: m.id,
    message: m.body,
    image: null,
    user: {
      __typename: "ChatUserOutput",
      // Les messages du livreur portent son identifiant : l'app les affiche à droite.
      id: m.sender_role === "rider" && riderId ? riderId : `${m.sender_role}-${m.order_id}`,
      name: m.sender_name,
    },
    createdAt: m.created_at,
  };
}

async function listMessages(order: string) {
  const r = await currentRider();
  const data: any = await rpc("list_order_messages", { p_order: String(order) });
  // L'app attend les plus récents en premier.
  return ((data ?? []) as any[]).map((m) => mapMessage(m, r.id)).reverse();
}

async function sendMessage(v: Record<string, any>) {
  const r = await currentRider();
  try {
    const m: any = await rpc("send_order_message", {
      p_order: String(v.orderId),
      p_body: String(v.messageInput?.message ?? ""),
    });
    return { __typename: "SendChatMessageResponse", success: true, message: null, data: mapMessage(m, r.id) };
  } catch (e: any) {
    return { __typename: "SendChatMessageResponse", success: false, message: e?.message ?? "Erreur", data: null };
  }
}

type Resolver = (v: Record<string, any>) => Promise<Record<string, any>>;

const resolvers: Record<string, Resolver> = {
  Configuration: async () => ({
    configuration: {
      __typename: "Configuration",
      _id: "bouff",
      currency: "XOF",
      currencySymbol: "FCFA ",
      riderAppSentryUrl: null,
    },
  }),

  /* --- connexion : e-mail + mot de passe du compte livreur --- */
  RiderLogin: async (v) => {
    const db = bouffDb();
    const { data, error } = await db.auth.signInWithPassword({
      email: String(v.username ?? "").trim().toLowerCase(),
      password: String(v.password ?? ""),
    });
    if (error || !data.session) throw new Error("Invalid credentials");
    const rider = await currentRider().catch(() => null);
    if (!rider || !rider.is_active) {
      await db.auth.signOut();
      throw new Error("Ce compte n'est pas un livreur actif.");
    }
    return {
      riderLogin: {
        __typename: "RiderAuth",
        userId: rider.id,
        token: data.session.access_token,
      },
    };
  },

  /* --- profil et disponibilité --- */
  rider: async () => ({ rider: await profile() }),
  Rider: async () => ({ rider: await profile() }),
  ToggleRider: async () => {
    const r = await currentRider();
    const next = r.status === "offline" ? "available" : "offline";
    const updated: any = await rpc("set_rider_status", { p_status: next });
    return { toggleAvailablity: { __typename: "Rider", _id: updated?.id ?? r.id } };
  },
  // Position GPS : dernière position du livreur, visible par le client pendant sa course.
  UpdateRiderLocation: async (v) => {
    const lat = Number(v.latitude);
    const lng = Number(v.longitude);
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) throw new Error("Position invalide.");
    await rpc("update_rider_location", {
      p_latitude: lat,
      p_longitude: lng,
      p_accuracy: v.accuracy ?? null,
      p_heading: v.heading ?? null,
      p_speed: v.speed ?? null,
    });
    return { updateRiderLocation: { __typename: "Rider", _id: (await currentRider()).id } };
  },

  /* --- courses --- */
  RiderOrders: async () => ({ riderOrders: await riderOrders(0, 100) }),
  SingleVendorRiderOrders: async (v) => ({
    riderOrders: await riderOrders(v.offset ?? 0, v.limit ?? 50),
  }),
  Order: async (v) => ({ order: await fetchOrder(v.id) }),
  AssignOrder: async (v) => {
    await rpc("claim_order", { p_order_id: v.id });
    return { assignOrder: await fetchOrder(v.id) };
  },
  UpdateOrderStatusRider: async (v) => {
    const status =
      v.status === "PICKED" ? "on_the_way" : v.status === "DELIVERED" ? "delivered" : null;
    if (!status) throw new Error("Étape non autorisée pour un livreur.");
    await rpc("rider_advance_order", { p_order_id: v.id, p_status: status });
    return { updateOrderStatusRider: await fetchOrder(v.id) };
  },

  /* --- gains --- */
  RiderEarningsGraph: async () => ({ riderEarningsGraph: await earningsGraph() }),
  TransactionHistory: async () => ({ transactionHistory: { data: [] } }),
  RiderCurrentWithdrawRequest: async () => ({ riderCurrentWithdrawRequest: null }),

  /* --- chat client <-> livreur --- */
  Chat: async (v) => ({ chat: await listMessages(v.order) }),
  SingleVendorChat: async (v) => ({ chat: await listMessages(v.order) }),
  SendChatMessage: async (v) => ({ sendChatMessage: await sendMessage(v) }),
  SingleVendorSendChatMessage: async (v) => ({ sendChatMessage: await sendMessage(v) }),
};

/* ------------------------------------------------------------------ */
/* Temps réel : courses libres du restaurant et courses du livreur     */
/* ------------------------------------------------------------------ */

function subscribe(operation: Operation, observer: any) {
  const name = operation.operationName;
  const db = bouffDb();
  let channel: ReturnType<typeof db.channel> | null = null;
  let stopped = false;
  const zone = name.includes("ZoneOrders");
  const assign = name.includes("AssignRider");
  if (name.includes("NewMessage")) return subscribeMessages(operation, observer);
  if (!zone && !assign) return () => {};

  void (async () => {
    const r = await currentRider().catch(() => null);
    if (!r || stopped) return;
    channel = db
      .channel(`bouff-rider-${r.id}-${Math.random().toString(36).slice(2)}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "orders",
          filter: `restaurant_id=eq.${r.restaurant_id}`,
        },
        async (payload: any) => {
          const row = payload.new;
          if (!row?.id || row.order_type !== "delivery") return;
          const mine = row.rider_id === r.id;
          const wasMine = payload.old?.rider_id === r.id;
          if (assign && !mine && !wasMine) {
            // Course prise par un autre livreur : on la retire de la liste.
            if (row.rider_id) {
              observer.next({
                data: {
                  subscriptionAssignRider: {
                    __typename: "SubscriptionAssignRider",
                    origin: "remove",
                    order: { ...mapOrder(row), items: [], rider: null },
                  },
                },
              });
            }
            return;
          }
          if (zone && (row.rider_id || !["in_kitchen", "ready"].includes(row.status))) return;
          const order = await fetchOrder(row.id).catch(() => null);
          if (!order || stopped) return;
          const origin = payload.eventType === "INSERT" ? "new" : "update";
          if (zone) {
            observer.next({
              data: {
                subscriptionZoneOrders: {
                  __typename: "SubscriptionZoneOrders",
                  zoneId: r.restaurant_id,
                  origin,
                  order,
                },
              },
            });
          } else {
            observer.next({
              data: {
                subscriptionAssignRider: {
                  __typename: "SubscriptionAssignRider",
                  origin,
                  order,
                },
              },
            });
          }
        },
      )
      .subscribe();
  })();

  return () => {
    stopped = true;
    if (channel) void db.removeChannel(channel);
  };
}

function subscribeMessages(operation: Operation, observer: any) {
  const db = bouffDb();
  const orderId = String(operation.variables?.order ?? "");
  let channel: ReturnType<typeof db.channel> | null = null;
  let stopped = false;
  void (async () => {
    const r = await currentRider().catch(() => null);
    if (!r || stopped || !orderId) return;
    channel = db
      .channel(`bouff-chat-${orderId}-${Math.random().toString(36).slice(2)}`)
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "order_messages", filter: `order_id=eq.${orderId}` },
        (payload: any) => {
          const m = payload.new;
          // Ses propres messages sont déjà affichés par l'app.
          if (!m?.id || stopped || m.sender_role === "rider") return;
          observer.next({ data: { subscriptionNewMessage: mapMessage(m, r.id) } });
        },
      )
      .subscribe();
  })();
  return () => {
    stopped = true;
    if (channel) void db.removeChannel(channel);
  };
}

function isSubscription(doc: DocumentNode) {
  return doc.definitions.some(
    (d) => d.kind === "OperationDefinition" && d.operation === "subscription",
  );
}

function rootFields(doc: DocumentNode): string[] {
  const op = doc.definitions.find(
    (d) => d.kind === "OperationDefinition",
  ) as OperationDefinitionNode | undefined;
  return (op?.selectionSet.selections ?? []).map((s: any) => s.alias?.value ?? s.name.value);
}

export async function clearBouffSession() {
  // Déconnexion locale : fonctionne même sans réseau.
  await bouffDb().auth.signOut({ scope: "local" }).catch(() => {});
}

export function createBouffLink(): ApolloLink {
  return new ApolloLink(
    (operation) =>
      new Observable<any>((observer) => {
        if (isSubscription(operation.query)) return subscribe(operation, observer);

        const resolver = resolvers[operation.operationName];
        if (!resolver) {
          const empty: Record<string, any> = {};
          for (const field of rootFields(operation.query)) empty[field] = null;
          if (__DEV__) console.warn(`[BOUFF] opération non branchée : ${operation.operationName}`);
          observer.next({ data: empty });
          observer.complete();
          return;
        }
        let cancelled = false;
        resolver(operation.variables ?? {})
          .then((data) => {
            if (cancelled) return;
            observer.next({ data });
            observer.complete();
          })
          .catch((error) => {
            if (cancelled) return;
            // Même forme qu'une erreur GraphQL, pour que les écrans affichent le message.
            observer.next({ errors: [{ message: String(error?.message ?? error) }] });
            observer.complete();
          });
        return () => {
          cancelled = true;
        };
      }),
  );
}
