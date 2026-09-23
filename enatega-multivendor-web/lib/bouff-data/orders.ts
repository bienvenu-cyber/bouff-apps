import { bouffDb } from "./supabase";
import {
  clearCart,
  deliveryFeeFor,
  priceCart,
  resolveZoneId,
} from "./cart";
import { getGuest, setGuest } from "./auth";
import { loadMenu } from "./catalog";

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

export async function orderDetails(orderId: string) {
  const db = bouffDb();
  const menu = await loadMenu();
  const column = orderId.includes("-") && orderId.length > 20 ? "id" : "order_number";
  const { data: order } = await db
    .from("orders")
    .select("*")
    .eq(column, orderId)
    .maybeSingle();
  if (!order) return null;

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
  const zoneId = isPickup ? null : resolveZoneId(cart.menu, null);
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
  return {
    orderId: details.rawOrder.orderId,
    status: details.rawOrder.orderStatus,
    riderLocation: null,
    eta: null,
  };
}
