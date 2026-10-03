// Passerelle BOUFF pour l'app cuisine.
// Les écrans d'origine continuent d'envoyer leurs requêtes « GraphQL Enatega » ;
// ce lien y répond avec la base BOUFF. Toutes les actions sur les commandes
// passent par les fonctions contrôlées de la base (droits + étapes vérifiés).
import { ApolloLink, Observable, type Operation } from "@apollo/client";
import AsyncStorage from "@react-native-async-storage/async-storage";
import type { DocumentNode, OperationDefinitionNode } from "graphql";
import { bouffDb, CURRENCY, CURRENCY_SYMBOL } from "./supabase";

const RESTAURANT_KEY = "bouff/store-restaurant-id";
const MUTED_KEY = "bouff/store-muted-orders";

export const STATUS_MAP: Record<string, string> = {
  received: "PENDING",
  in_kitchen: "ACCEPTED",
  ready: "ASSIGNED",
  on_the_way: "PICKED",
  delivered: "DELIVERED",
  cancelled: "CANCELLED",
};

const ORDER_SELECT =
  "*, tip_fcfa, scheduled_for, order_items(*, order_item_options(id, name, price_delta_fcfa)), riders(id, full_name, phone, status), restaurants(id, name, logo_url, address)";

async function restaurantId(): Promise<string> {
  const id = await AsyncStorage.getItem(RESTAURANT_KEY);
  if (!id) throw new Error("Session expirée, reconnectez-vous.");
  return id;
}

async function mutedIds(): Promise<Set<string>> {
  try {
    return new Set(JSON.parse((await AsyncStorage.getItem(MUTED_KEY)) ?? "[]"));
  } catch {
    return new Set();
  }
}

function mapOrder(o: any, muted: Set<string>) {
  const takeaway = o.order_type === "takeaway";
  const items = (o.order_items ?? []).map((i: any) => ({
    __typename: "Item",
    _id: i.id,
    id: i.id,
    title: i.item_name,
    description: null,
    image: null,
    quantity: i.quantity,
    specialInstructions: i.note ?? "",
    variation: {
      __typename: "Variation",
      _id: i.variant_id ?? i.id,
      id: i.variant_id ?? i.id,
      title: i.variant_name ?? "",
      price: i.unit_price_fcfa,
      discounted: null,
    },
    addons: (i.order_item_options ?? []).length
      ? [
          {
            __typename: "Addon",
            _id: `${i.id}-options`,
            id: `${i.id}-options`,
            title: "Options",
            description: null,
            quantityMinimum: 0,
            quantityMaximum: 99,
            options: i.order_item_options.map((op: any) => ({
              __typename: "Option",
              _id: op.id,
              id: op.id,
              title: op.name,
              description: null,
              price: op.price_delta_fcfa,
            })),
          },
        ]
      : [],
    isActive: true,
    createdAt: i.created_at,
    updatedAt: i.created_at,
  }));
  return {
    __typename: "Order",
    _id: o.id,
    id: o.id,
    orderId: o.order_number,
    restaurant: {
      __typename: "Restaurant",
      _id: o.restaurant_id,
      name: o.restaurants?.name ?? "",
      image: o.restaurants?.logo_url ?? "",
      address: o.restaurants?.address ?? "",
      location: { __typename: "Location", coordinates: [0, 0] },
    },
    deliveryAddress: takeaway
      ? null
      : {
          __typename: "OrderAddress",
          location: { __typename: "Location", coordinates: [0, 0] },
          deliveryAddress: o.delivery_address ?? "",
          details: o.delivery_address ?? "",
          label: "Livraison",
        },
    items,
    user: {
      __typename: "User",
      _id: o.customer_id ?? o.customer_phone,
      name: o.customer_name,
      phone: o.customer_phone,
      email: null,
    },
    paymentMethod:
      o.payment_method === "mobile_money"
        ? "Mobile Money"
        : o.payment_method === "card"
          ? "Carte"
          : "Espèces",
    paidAmount: 0,
    orderAmount: o.total_fcfa,
    orderStatus: STATUS_MAP[o.status] ?? "PENDING",
    tipping: o.tip_fcfa || 0,
    scheduledAt: o.scheduled_for,
    taxationAmount: 0,
    status: true,
    paymentStatus: "PENDING",
    reason: o.cancel_reason,
    isActive: true,
    createdAt: o.created_at,
    orderDate: o.scheduled_for || o.created_at,
    pickedAt: o.picked_up_at,
    deliveryCharges: o.delivery_fee_fcfa,
    isPickedUp: takeaway,
    preparationTime: o.estimated_ready_at,
    acceptedAt: o.accepted_at,
    isRinged: o.status === "received" && !muted.has(o.id),
    instructions: o.note,
    eta: null,
    discountAmount: 0,
    rider: o.riders
      ? {
          __typename: "Rider",
          _id: o.riders.id,
          name: o.riders.full_name,
          username: o.riders.phone ?? "",
          available: o.riders.status === "available",
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
  return data ? mapOrder(data, await mutedIds()) : null;
}

async function listOrders(offset = 0, limit = 50) {
  const rid = await restaurantId();
  const { data, error } = await bouffDb()
    .from("orders")
    .select(ORDER_SELECT)
    .eq("restaurant_id", rid)
    .order("created_at", { ascending: false })
    .range(offset, offset + limit - 1);
  if (error) throw new Error(error.message);
  const muted = await mutedIds();
  return (data ?? []).map((o) => mapOrder(o, muted));
}

async function rpc(name: string, args: Record<string, unknown>) {
  const { data, error } = await bouffDb().rpc(name, args);
  if (error) throw new Error(error.message);
  return data;
}

async function orderAction(id: string, run: () => Promise<unknown>) {
  await run();
  return fetchOrder(id);
}

function hhmm(t?: string | null): [string, string] {
  const [h = "00", m = "00"] = (t ?? "").split(":");
  return [h, m];
}

async function profile() {
  const db = bouffDb();
  const rid = await restaurantId();
  const [{ data: r }, { data: auth }] = await Promise.all([
    db.from("restaurants").select("*").eq("id", rid).maybeSingle(),
    db.auth.getUser(),
  ]);
  if (!r) throw new Error("Restaurant introuvable.");
  const days = ["MON", "TUE", "WED", "THU", "FRI", "SAT", "SUN"];
  return {
    __typename: "Restaurant",
    _id: r.id,
    unique_restaurant_id: r.slug,
    orderId: 0,
    orderPrefix: "BF",
    name: r.name,
    image: r.cover_url ?? r.logo_url ?? "",
    logo: r.logo_url ?? "",
    address: r.address ?? r.city,
    username: auth.user?.email ?? "",
    minimumOrder: r.min_order_fcfa,
    isActive: r.is_active,
    isAvailable: !r.is_temporarily_closed,
    slug: r.slug,
    commissionRate: Number(r.commission_rate),
    tax: 0,
    notificationToken: null,
    enableNotification: true,
    shopType: "restaurant",
    phone: r.phone ?? "",
    hasBusinessDetails: false,
    bussinessDetails: null,
    deliveryTime: 30,
    location: { __typename: "Location", coordinates: [0, 0] },
    zone: null,
    totalWalletAmount: 0,
    withdrawnWalletAmount: 0,
    currentWalletAmount: 0,
    openingTimes: days.map((day) => ({
      __typename: "OpeningTimes",
      day,
      times: [
        {
          __typename: "Timings",
          startTime: hhmm(r.opens_at),
          endTime: hhmm(r.closes_at),
        },
      ],
    })),
  };
}

async function storeEarnings() {
  const rid = await restaurantId();
  const { data } = await bouffDb()
    .from("orders")
    .select("items_total_fcfa, commission_fcfa")
    .eq("restaurant_id", rid)
    .eq("status", "delivered")
    .limit(10000);
  return (data ?? []).reduce(
    (sum, o: any) => sum + o.items_total_fcfa - o.commission_fcfa,
    0,
  );
}

type Resolver = (v: Record<string, any>) => Promise<Record<string, any>>;

const resolvers: Record<string, Resolver> = {
  Configuration: async () => ({
    configuration: {
      __typename: "Configuration",
      _id: "bouff",
      currency: CURRENCY,
      currencySymbol: CURRENCY_SYMBOL,
      restaurantAppSentryUrl: null,
    },
  }),

  /* --- connexion : e-mail + mot de passe du compte cuisine --- */
  RestaurantLogin: async (v) => {
    const db = bouffDb();
    const { data, error } = await db.auth.signInWithPassword({
      email: String(v.username).trim().toLowerCase(),
      password: String(v.password),
    });
    if (error || !data.session) throw new Error("Invalid credentials");
    const { data: roles } = await db
      .from("user_roles")
      .select("role, restaurant_id")
      .eq("user_id", data.user.id)
      .in("role", ["kitchen", "restaurant_admin"])
      .not("restaurant_id", "is", null)
      .limit(1);
    const rid = roles?.[0]?.restaurant_id;
    if (!rid) {
      await db.auth.signOut();
      throw new Error("Ce compte n'a pas accès à une cuisine.");
    }
    await AsyncStorage.setItem(RESTAURANT_KEY, rid);
    return {
      restaurantLogin: {
        __typename: "RestaurantAuth",
        token: data.session.access_token,
        restaurantId: rid,
      },
    };
  },

  /* --- commandes --- */
  Orders: async () => ({ restaurantOrders: await listOrders(0, 100) }),
  SingleVendorStoreOrders: async (v) => ({
    restaurantOrders: await listOrders(v.offset ?? 0, v.limit ?? 50),
  }),
  AcceptOrder: async (v) => ({
    acceptOrder: await orderAction(v._id, () =>
      rpc("accept_order", {
        p_order_id: v._id,
        p_minutes: parseInt(String(v.time ?? "15"), 10) || 15,
      }),
    ),
  }),
  MarkOrderReady: async (v) => ({
    markOrderReady: await orderAction(v._id, () =>
      rpc("advance_order_status", { p_order_id: v._id, p_status: "ready" }),
    ),
  }),
  // Commande à emporter prête → remise au client.
  OrderPickedUp: async (v) => ({
    orderPickedUp: await orderAction(v._id, () =>
      rpc("advance_order_status", { p_order_id: v._id, p_status: "delivered" }),
    ),
  }),
  CancelOrder: async (v) => ({
    cancelOrder: await orderAction(v._id, () =>
      rpc("advance_order_status", {
        p_order_id: v._id,
        p_status: "cancelled",
        p_cancel_reason: v.reason ?? null,
      }),
    ),
  }),
  muteRing: async (v) => {
    const muted = await mutedIds();
    if (v.orderId) muted.add(String(v.orderId));
    await AsyncStorage.setItem(MUTED_KEY, JSON.stringify([...muted].slice(-200)));
    return { muteRing: true };
  },

  /* --- restaurant --- */
  SingleVendorStoreProfile: async () => ({ restaurant: await profile() }),
  Restaurant: async () => ({ restaurant: await profile() }),
  ToggleStore: async (v) => {
    const rid = v.restaurantId || (await restaurantId());
    const { data: r } = await bouffDb()
      .from("restaurants")
      .select("is_temporarily_closed")
      .eq("id", rid)
      .maybeSingle();
    const updated: any = await rpc("set_restaurant_closed", {
      p_restaurant_id: rid,
      p_closed: !r?.is_temporarily_closed,
    });
    return {
      toggleStoreAvailability: {
        __typename: "Restaurant",
        _id: rid,
        isAvailable: !updated?.is_temporarily_closed,
      },
    };
  },
  saveRestaurantToken: async (v) => {
    // BOUFF : enregistre le téléphone de la cuisine pour les alertes (commande en attente, pas de livreur, bilan du soir).
    if (v.token) {
      try {
        await bouffDb().rpc("register_push_token", { p_token: v.token, p_platform: "kitchen" });
      } catch {
        // l'app continue même sans alerte
      }
    }
    return {
    saveRestaurantToken: {
      __typename: "Restaurant",
      _id: await restaurantId(),
      notificationToken: v.token ?? null,
      enableNotification: v.isEnabled ?? true,
    },
  };
  },
  UpdateTimings: async (v) => {
    // Un seul créneau par restaurant pour l'instant : on prend le premier jour renseigné.
    const rid = await restaurantId();
    const slot = (v.openingTimes ?? [])
      .flatMap((d: any) => d.times ?? [])
      .find((t: any) => t?.startTime && t?.endTime);
    if (slot) {
      const fmt = (t: any) => (Array.isArray(t) ? t.join(":") : String(t));
      const { error } = await bouffDb()
        .from("restaurants")
        .update({ opens_at: fmt(slot.startTime), closes_at: fmt(slot.endTime) })
        .eq("id", rid);
      if (error) throw new Error(error.message);
    }
    return { updateTimings: { __typename: "Restaurant", _id: rid } };
  },

  /* --- gains --- */
  StoreEarnings: async () => ({
    earnings: {
      data: {
        grandTotalEarnings: { storeTotal: await storeEarnings() },
        earnings: { storeEarnings: { totalEarnings: await storeEarnings() } },
      },
    },
  }),
  Earnings: async () => ({
    earnings: {
      message: null,
      data: { grandTotalEarnings: { storeTotal: await storeEarnings() } },
    },
  }),
  StoreEarningsGraph: async () => ({
    storeEarningsGraph: { totalCount: 0, earnings: [] },
  }),
  TransactionHistory: async () => ({ transactionHistory: { data: [] } }),
  StoreCurrentWithdrawRequest: async () => ({ storeCurrentWithdrawRequest: null }),
};

/* ------------------------------------------------------------------ */
/* Temps réel : nouvelles commandes et changements de statut           */
/* ------------------------------------------------------------------ */

function subscribe(operation: Operation, observer: any) {
  const name = operation.operationName;
  const db = bouffDb();
  let channel: ReturnType<typeof db.channel> | null = null;
  let stopped = false;

  void (async () => {
    const rid = await restaurantId().catch(() => null);
    if (!rid || stopped) return;
    const only = name === "SubscriptionOrder" ? operation.variables?.id : null;
    channel = db
      .channel(`bouff-store-${rid}-${Math.random().toString(36).slice(2)}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "orders",
          filter: only ? `id=eq.${only}` : `restaurant_id=eq.${rid}`,
        },
        async (payload: any) => {
          const row = payload.new;
          if (!row?.id) return;
          // Les lignes de la commande sont écrites juste après la commande.
          if (payload.eventType === "INSERT") await new Promise((r) => setTimeout(r, 1500));
          const order = await fetchOrder(row.id).catch(() => null);
          if (!order || stopped) return;
          if (name === "SubscriptionOrder") {
            observer.next({ data: { subscriptionOrder: order } });
          } else {
            observer.next({
              data: {
                subscribePlaceOrder: {
                  __typename: "SubscriptionOrders",
                  userId: row.customer_id,
                  origin: payload.eventType === "INSERT" ? "new" : "update",
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

function rootFields(document: DocumentNode): string[] {
  const def = document.definitions.find(
    (d) => d.kind === "OperationDefinition",
  ) as OperationDefinitionNode | undefined;
  return (
    def?.selectionSet.selections
      .map((s: any) => s.alias?.value ?? s.name?.value)
      .filter(Boolean) ?? []
  );
}

function isSubscription(document: DocumentNode) {
  return document.definitions.some(
    (d) => d.kind === "OperationDefinition" && d.operation === "subscription",
  );
}

export async function clearBouffSession() {
  await Promise.all([
    AsyncStorage.removeItem(RESTAURANT_KEY),
    bouffDb().auth.signOut().catch(() => {}),
  ]);
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
          .catch((error) => !cancelled && observer.error(error));
        return () => {
          cancelled = true;
        };
      }),
  );
}
