import { bouffDb } from "./supabase";
import {
  clearCart,
  deliveryFeeFor,
  priceCart,
  resolveZoneId,
} from "./cart";
import { getGuest, setGuest } from "./auth";
import { loadMenu } from "./catalog";
import { rememberGuestOrder } from "./notifications";

export const STATUS_MAP: Record<string, string> = {
  received: "PENDING",
  in_kitchen: "ACCEPTED",
  ready: "ASSIGNED",
  on_the_way: "PICKED",
  delivered: "DELIVERED",
  cancelled: "CANCELLED",
};

export function paymentMethodFor(method?: string | null): string {
  const value = (method ?? "").toUpperCase();
  if (value.includes("MOBILE") || value.includes("MOMO") || value.includes("PAWA"))
    return "mobile_money";
  if (value.includes("CARD") || value === "STRIPE" || value === "PAYPAL") return "card";
  return "cash";
}

async function identity(override?: {
  name?: string | null;
  phone?: string | null;
}): Promise<{ name: string; phone: string }> {
  if (override?.phone) {
    return { name: override.name?.trim() || "Client", phone: override.phone.trim() };
  }
  const db = bouffDb();
  const { data: auth } = await db.auth.getUser();
  if (auth.user) {
    const { data: profile } = await db
      .from("profiles")
      .select("full_name, phone")
      .eq("id", auth.user.id)
      .maybeSingle();
    if (profile?.phone) {
      return { name: profile.full_name ?? "Client", phone: profile.phone };
    }
  }
  const guest = getGuest();
  if (guest?.phone) return guest;
  throw new Error(
    "Numéro de téléphone manquant : renseignez votre nom et votre numéro pour commander.",
  );
}

export async function placeOrder(variables: Record<string, any>) {
  const db = bouffDb();
  const cart = await priceCart();
  if (!cart.lines.length) throw new Error("Votre panier est vide.");

  const isPickedUp = Boolean(variables.isPickedUp);
  const address: string | null =
    variables.address?.deliveryAddress ?? variables.address?.details ?? null;
  const zoneId = isPickedUp
    ? null
    : (variables.zoneId ?? resolveZoneId(cart.menu, address));
  const who = await identity({
    name: variables.customerName,
    phone: variables.customerPhone,
  });
  setGuest(who);


  const items = cart.lines.map((line) => ({
    menu_item_id: line.line.foodId,
    variant_id: line.line.variationId,
    option_ids: line.line.optionIds,
    quantity: line.line.quantity,
    note: line.line.note ?? null,
  }));

  const { data, error } = await db.rpc("place_order", {
    p_restaurant_id: cart.menu.restaurant.id,
    p_customer_name: who.name,
    p_customer_phone: who.phone,
    p_order_type: isPickedUp ? "takeaway" : "delivery",
    p_items: items,
    p_delivery_zone_id: zoneId,
    p_delivery_address: isPickedUp ? null : address,
    p_payment_method: paymentMethodFor(variables.paymentMethod),
    p_note: variables.instructions ?? variables.specialInstructions ?? null,
  });
  if (error) throw new Error(error.message);

  clearCart();
  const result = data as Record<string, any>;
  if (result?.order_number) rememberGuestOrder(result.order_number, result.order_id);
  const loc = variables.location;
  if (!isPickedUp && result?.order_number && loc && Number.isFinite(loc.lat) && Number.isFinite(loc.lng)) {
    // Facultatif : la commande reste valide même si la position n'est pas enregistrée.
    await db.rpc("set_order_location", {
      p_order: result.order_number,
      p_phone: who.phone,
      p_lat: loc.lat,
      p_lng: loc.lng,
    });
  }
  return {
    _id: result.order_id,
    orderId: result.order_number,
    paymentMethod: variables.paymentMethod ?? "COD",
    paidAmount: 0,
    orderAmount: result.total_fcfa,
    paymentStatus: "PENDING",
    orderStatus: "PENDING",
    deliveryCharges: result.delivery_fee_fcfa,
    tipping: 0,
    taxationAmount: 0,
    createdAt: new Date().toISOString(),
    orderDate: new Date().toISOString(),
    expectedTime: null,
    isPickedUp,
  };
}

async function orderRows(statuses: string[], limit = 20, page = 1) {
  const db = bouffDb();
  const { data: auth } = await db.auth.getUser();
  if (!auth.user) return [];
  const from = (Math.max(1, page) - 1) * limit;
  const { data } = await db
    .from("orders")
    .select("*")
    .eq("customer_id", auth.user.id)
    .in("status", statuses)
    .order("created_at", { ascending: false })
    .range(from, from + limit - 1);
  return data ?? [];
}

const ACTIVE = ["received", "in_kitchen", "ready", "on_the_way"];
const PAST = ["delivered", "cancelled"];

export async function activeOrders(limit?: number, page?: number) {
  const menu = await loadMenu();
  return (await orderRows(ACTIVE, limit ?? 20, page ?? 1)).map((o) => ({
    _id: o.id,
    orderId: o.order_number,
    restaurant: { name: menu.restaurant.name, image: menu.restaurant.logo },
    orderAmount: o.total_fcfa,
    orderStatus: STATUS_MAP[o.status] ?? "PENDING",
    createdAt: o.created_at,
    orderDate: o.created_at,
    expectedTime: null,
  }));
}

export async function pastOrders(limit?: number, page?: number) {
  const menu = await loadMenu();
  return (await orderRows(PAST, limit ?? 20, page ?? 1)).map((o) => ({
    _id: o.id,
    orderId: o.order_number,
    restaurant: { name: menu.restaurant.name, image: menu.restaurant.logo },
    orderAmount: o.total_fcfa,
    orderStatus: STATUS_MAP[o.status] ?? "DELIVERED",
    createdAt: o.created_at,
    completionTime: o.delivered_at,
    orderDate: o.created_at,
    deliveredAt: o.delivered_at,
  }));
}

// Suivi sans compte : la commande n'est pas lisible directement (verrou base),
// on passe par la fonction de suivi avec le numéro de téléphone du client.
async function guestOrderDetails(orderNumber: string, menu: any) {
  const guest = getGuest();
  if (!guest?.phone || orderNumber.length > 20) return null;
  const db = bouffDb();
  const { data } = await db.rpc("track_order", {
    p_order_number: orderNumber,
    p_phone: guest.phone,
  });
  const t = data as any;
  if (!t || t.error || !t.order_number) return null;

  const items = (t.items ?? []).map((i: any, index: number) => ({
    _id: `${orderNumber}-${index}`,
    food: null,
    title: i.item_name,
    foodTitle: i.item_name,
    description: i.variant_name,
    image: null,
    foodImage: null,
    variationImage: null,
    variationTitle: i.variant_name,
    variationTotal: i.line_total_fcfa,
    foodQuantity: i.quantity,
    quantity: i.quantity,
    specialInstructions: (i.options ?? []).join(", "),
    isActive: true,
    variation: {
      _id: null,
      title: i.variant_name,
      price: i.line_total_fcfa,
      discounted: null,
      image: null,
      createdAt: t.created_at,
      updatedAt: t.created_at,
    },
    addons: [],
  }));

  const common = {
    _id: orderNumber,
    orderId: t.order_number,
    orderStatus: STATUS_MAP[t.status] ?? "PENDING",
    orderState: t.status,
    paymentMethod: "COD",
    paidAmount: 0,
    orderAmount: t.total_fcfa,
    paymentStatus: "PENDING",
    tipping: 0,
    taxationAmount: 0,
    createdAt: t.created_at,
    completionTime: t.delivered_at,
    preparationTime: t.ready_at,
    orderDate: t.created_at,
    expectedTime: null,
    isPickedUp: t.order_type === "takeaway",
    deliveryType: t.order_type,
    deliveryCharges: t.delivery_fee_fcfa,
    acceptedAt: t.accepted_at,
    pickedAt: t.picked_up_at,
    deliveredAt: t.delivered_at,
    cancelledAt: t.cancelled_at,
    scheduledAt: null,
    assignedAt: t.accepted_at,
    instructions: t.cancel_reason,
    restaurant: {
      _id: menu.restaurant.id,
      name: t.restaurant ?? menu.restaurant.name,
      image: menu.restaurant.logo,
      address: menu.restaurant.address,
      location: { coordinates: [0, 0] },
    },
    deliveryAddress: {
      _id: null,
      id: null,
      deliveryAddress: t.order_type === "takeaway" ? "À emporter" : "Livraison",
      details: null,
      label: "Livraison",
      location: { coordinates: [0, 0] },
    },
    rider: t.rider_name
      ? {
          _id: null,
          name: t.rider_name,
          phone: t.rider_phone,
          location: { coordinates: [0, 0] },
        }
      : null,
    items,
    eta: null,
  };

  return {
    success: true,
    message: null,
    rawOrder: common,
    data: {
      ...common,
      deliveryDiscount: 0,
      couponDiscount: 0,
      isPriority: false,
      itemsSubTotal: (t.total_fcfa ?? 0) - (t.delivery_fee_fcfa ?? 0),
      minimumOrderFee: 0,
      minimumOrderAmount: 0,
      isBelowMinimumOrder: false,
      isBelowMaximumOrder: false,
      freeDeliveriesRemaining: 0,
      priorityDeliveryFees: 0,
      deliverChargesAmount: t.delivery_fee_fcfa,
      couponDiscountApplied: false,
      creditsApplied: 0,
    },
  };
}

export async function orderDetails(orderId: string) {
  const db = bouffDb();
  const menu = await loadMenu();
  const column = orderId.includes("-") && orderId.length > 20 ? "id" : "order_number";
  const { data: order } = await db
    .from("orders")
    .select("*")
    .eq(column, orderId)
    .maybeSingle();
  if (!order) return guestOrderDetails(orderId, menu);

  const { data: items } = await db
    .from("order_items")
    .select("*")
    .eq("order_id", order.id);
  const { data: rider } = order.rider_id
    ? await db
        .from("riders")
        .select("id, full_name, phone")
        .eq("id", order.rider_id)
        .maybeSingle()
    : { data: null };

  const mappedItems = (items ?? []).map((i) => ({
    _id: i.id,
    food: i.menu_item_id,
    title: i.item_name,
    foodTitle: i.item_name,
    description: i.variant_name,
    image: null,
    foodImage: null,
    variationImage: null,
    variationTitle: i.variant_name,
    variationTotal: i.line_total_fcfa,
    foodQuantity: i.quantity,
    quantity: i.quantity,
    specialInstructions: i.note,
    isActive: true,
    variation: {
      _id: i.variant_id,
      title: i.variant_name,
      price: i.unit_price_fcfa,
      discounted: null,
      image: null,
      createdAt: i.created_at,
      updatedAt: i.created_at,
    },
    addons: [],
  }));

  const common = {
    _id: order.id,
    orderId: order.order_number,
    orderStatus: STATUS_MAP[order.status] ?? "PENDING",
    orderState: order.status,
    paymentMethod: order.payment_method === "cash" ? "COD" : order.payment_method.toUpperCase(),
    paidAmount: 0,
    orderAmount: order.total_fcfa,
    paymentStatus: "PENDING",
    tipping: 0,
    taxationAmount: 0,
    createdAt: order.created_at,
    completionTime: order.delivered_at,
    preparationTime: order.ready_at,
    orderDate: order.created_at,
    expectedTime: null,
    isPickedUp: order.order_type === "takeaway",
    deliveryType: order.order_type,
    deliveryCharges: order.delivery_fee_fcfa,
    acceptedAt: order.accepted_at,
    pickedAt: order.picked_up_at,
    deliveredAt: order.delivered_at,
    cancelledAt: order.cancelled_at,
    scheduledAt: null,
    assignedAt: order.accepted_at,
    instructions: order.note,
    restaurant: {
      _id: menu.restaurant.id,
      name: menu.restaurant.name,
      image: menu.restaurant.logo,
      address: menu.restaurant.address,
      location: { coordinates: [0, 0] },
    },
    deliveryAddress: {
      _id: order.delivery_zone_id,
      id: order.delivery_zone_id,
      deliveryAddress: order.delivery_address ?? "À emporter",
      details: order.delivery_address,
      label: "Livraison",
      location: { coordinates: [0, 0] },
    },
    rider: rider
      ? {
          _id: rider.id,
          name: rider.full_name,
          phone: rider.phone,
          location: { coordinates: [0, 0] },
        }
      : null,
    items: mappedItems,
    eta: null,
  };

  return {
    success: true,
    message: null,
    rawOrder: common,
    data: {
      ...common,
      deliveryDiscount: 0,
      couponDiscount: 0,
      isPriority: false,
      itemsSubTotal: order.items_total_fcfa,
      minimumOrderFee: 0,
      minimumOrderAmount: 0,
      isBelowMinimumOrder: false,
      isBelowMaximumOrder: false,
      freeDeliveriesRemaining: 0,
      priorityDeliveryFees: 0,
      deliverChargesAmount: order.delivery_fee_fcfa,
      couponDiscountApplied: false,
      creditsApplied: 0,
    },
  };
}

export async function recentActiveOrder() {
  const orders = await activeOrders(1, 1);
  if (!orders.length) return { success: true, message: null, rawOrder: null };
  const details = await orderDetails(orders[0]._id);
  return { success: true, message: null, rawOrder: details?.rawOrder ?? null };
}

export async function checkout(variables: Record<string, any>) {
  const cart = await priceCart();
  const isPickup = Boolean(variables.isPickup);
  const zoneId = isPickup
    ? null
    : (variables.zoneId ?? resolveZoneId(cart.menu, null));
  const deliveryCharges = isPickup ? 0 : deliveryFeeFor(cart.menu, zoneId);

  return {
    success: true,
    message: null,
    cartId: "bouff-cart",
    subtotal: cart.subtotal,
    deliveryCharges,
    originalDeliveryCharges: deliveryCharges,
    deliveryDiscount: 0,
    serviceFee: 0,
    minimumOrderFee: 0,
    taxAmount: 0,
    taxPercentage: 0,
    grandTotal: cart.subtotal + deliveryCharges,
    totalDiscount: 0,
    discountDetails: { dealDiscount: 0 },
    hasActiveSubscription: false,
    freeDeliveriesRemaining: 0,
    minimumOrderAmount: 0,
    isBelowMinimumOrder: false,
    isBelowMaximumOrder: false,
    couponDiscountAmount: 0,
    couponApplied: false,
    priorityDeliveryFees: 0,
    creditsUsed: 0,
    maximumOrderAmount: 0,
    checkoutQuoteId: "bouff-quote",
    checkoutQuoteExpiresAt: null,
    cartRevision: String(cart.lines.length),
    items: cart.lines.map((l) => ({
      foodId: l.line.foodId,
      foodTitle: l.foodTitle,
      categoryId: l.categoryId,
      variationId: l.line.variationId,
      variationTitle: l.variationTitle,
      quantity: l.line.quantity,
      unitPrice: l.unitPrice,
      addons: l.addons,
      addonsTotal: l.addonsTotal,
      itemTotal: l.itemTotal,
    })),
  };
}

export async function trackOrder(orderId: string) {
  const details = await orderDetails(orderId);
  if (!details?.rawOrder) return null;
  const [rider, route] = await Promise.all([
    riderLocation(details.rawOrder.orderId),
    orderRoute(details.rawOrder.orderId),
  ]);
  return {
    orderId: details.rawOrder.orderId,
    status: details.rawOrder.orderStatus,
    riderLocation: rider,
    eta: route,
  };
}

// Point de départ (restaurant) et d'arrivée (position partagée par le client).
export async function orderRoute(orderNumber: string) {
  const { data, error } = await bouffDb().rpc("order_route", {
    p_order: String(orderNumber),
    p_phone: getGuest()?.phone ?? null,
  });
  if (error || !data) return null;
  const r = data as any;
  if (!r.origin && !r.destination) return null;
  const pt = (p: any) => (p ? { latitude: p.lat, longitude: p.lng } : null);
  return { origin: pt(r.origin), destination: pt(r.destination), encodedPolyline: null };
}

// Dernière position du livreur (seulement pendant la course, et seulement pour ce client).
export async function riderLocation(orderNumber: string) {
  const { data, error } = await bouffDb().rpc("order_rider_location", {
    p_order: String(orderNumber),
    p_phone: getGuest()?.phone ?? null,
  });
  if (error || !data) return null;
  return data as {
    latitude: number;
    longitude: number;
    accuracy: number | null;
    heading: number | null;
    speed: number | null;
    recordedAt: string;
  };
}

/* ---------------- Chat client <-> livreur ---------------- */

function mapMessage(m: any) {
  return {
    id: m.id,
    message: m.body,
    user: { id: m.sender_role, name: m.sender_name },
    createdAt: m.created_at,
  };
}

export async function listMessages(order: string) {
  const { data, error } = await bouffDb().rpc("list_order_messages", {
    p_order: String(order),
    p_phone: getGuest()?.phone ?? null,
  });
  if (error) throw new Error(error.message);
  return ((data ?? []) as any[]).map(mapMessage);
}

export async function sendMessage(order: string, body: string) {
  const { data, error } = await bouffDb().rpc("send_order_message", {
    p_order: String(order),
    p_body: body,
    p_phone: getGuest()?.phone ?? null,
  });
  if (error) return { success: false, message: error.message, data: null };
  return { success: true, message: null, data: mapMessage(data) };
}

// Annulation par le client : possible seulement tant que la cuisine n'a pas accepté.
export async function cancelOrder(idOrNumber: string) {
  const db = bouffDb();
  let orderNumber = idOrNumber;
  if (idOrNumber.includes("-") && idOrNumber.length > 20) {
    const { data } = await db
      .from("orders")
      .select("order_number")
      .eq("id", idOrNumber)
      .maybeSingle();
    const { guestOrderIds } = await import("./notifications");
    orderNumber = data?.order_number ?? guestOrderIds()[idOrNumber] ?? idOrNumber;
  }
  const { error } = await db.rpc("cancel_my_order", {
    p_order_number: orderNumber,
    p_phone: getGuest()?.phone ?? null,
  });
  if (error) throw new Error(error.message);
  return {
    _id: idOrNumber,
    orderId: orderNumber,
    orderStatus: "CANCELLED",
    cancelledAt: new Date().toISOString(),
    reason: "Annulée par le client",
    eta: null,
  };
}
