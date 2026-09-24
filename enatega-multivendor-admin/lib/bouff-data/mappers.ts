// Conversion des données BOUFF vers le format attendu par les écrans d'origine.

export const STATUS_MAP: Record<string, string> = {
  received: 'PENDING',
  in_kitchen: 'ACCEPTED',
  ready: 'ASSIGNED',
  on_the_way: 'PICKED',
  delivered: 'DELIVERED',
  cancelled: 'CANCELLED',
};
export const STATUS_BACK: Record<string, string> = {
  PENDING: 'received',
  ACCEPTED: 'in_kitchen',
  ASSIGNED: 'ready',
  PICKED: 'on_the_way',
  DELIVERED: 'delivered',
  COMPLETED: 'delivered',
  CANCELLED: 'cancelled',
  CANCELLEDBYREST: 'cancelled',
};

export const DAYS = ['MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT', 'SUN'];

export const ORDER_SELECT =
  '*, order_items(*, order_item_options(id, name, price_delta_fcfa)), riders(id, full_name, phone, status), restaurants(id, name, logo_url, cover_url, address, latitude, longitude)';

const hm = (t?: string | null, fallback = '00:00') =>
  (t ?? fallback).slice(0, 5).split(':');

export const point = (lat?: number | null, lng?: number | null) => ({
  __typename: 'Location',
  coordinates: [lng ?? 0, lat ?? 0],
});

export function paged<T>(rows: T[], total: number, page = 1, limit = 10) {
  const totalPages = Math.max(1, Math.ceil(total / Math.max(limit, 1)));
  return {
    data: rows,
    totalCount: total,
    currentPage: page,
    totalPages,
    nextPage: page < totalPages ? page + 1 : null,
    prevPage: page > 1 ? page - 1 : null,
  };
}

export function mapFood(m: any) {
  const variants = [...(m.item_variants ?? [])].sort(
    (a, b) => a.sort_order - b.sort_order
  );
  return {
    __typename: 'Food',
    _id: m.id,
    title: m.name,
    description: m.description ?? '',
    image: m.image_url ?? '',
    isOutOfStock: !m.is_available,
    isActive: m.is_available,
    subCategory: null,
    createdAt: m.created_at,
    updatedAt: m.updated_at,
    variations: variants.map((v: any) => ({
      __typename: 'Variation',
      _id: v.id,
      title: v.name,
      price: v.price_fcfa,
      discounted: 0,
      addons: v.addon_ids ?? [],
      isOutOfStock: !v.is_available,
    })),
  };
}

export function mapRestaurant(r: any, extra: Record<string, any> = {}) {
  const open = hm(r.opens_at, '11:00');
  const close = hm(r.closes_at, '02:00');
  const rate = Number(r.commission_rate ?? 0);
  return {
    __typename: 'Restaurant',
    _id: r.id,
    unique_restaurant_id: r.slug,
    orderId: 0,
    orderPrefix: 'BF',
    slug: r.slug,
    name: r.name,
    image: r.cover_url ?? r.logo_url ?? '',
    logo: r.logo_url ?? '',
    phone: r.phone ?? '',
    address: r.address ?? '',
    city: r.city ?? '',
    postCode: '',
    location: point(r.latitude, r.longitude),
    deliveryBounds: { __typename: 'Polygon', coordinates: [[[r.longitude ?? 0, r.latitude ?? 0]]] },
    circleBounds: { __typename: 'Circle', radius: 0 },
    boundType: 'point',
    deliveryInfo: {
      __typename: 'DeliveryInfo',
      minDeliveryFee: 500,
      deliveryDistance: 0,
      deliveryFee: 500,
    },
    deliveryOptions: {
      __typename: 'DeliveryOptions',
      delivery: r.accepts_delivery,
      pickup: r.accepts_takeaway,
    },
    username: extra.username ?? '',
    deliveryTime: 30,
    minimumOrder: r.min_order_fcfa,
    tax: 0,
    isAvailable: !r.is_temporarily_closed,
    isActive: r.is_active,
    stripeDetailsSubmitted: false,
    commissionRate: rate,
    openingTimes: DAYS.map((day) => ({
      __typename: 'OpeningTimes',
      day,
      times: [{ __typename: 'Timings', startTime: open, endTime: close }],
    })),
    owner: extra.owner ?? null,
    shopType: 'Restaurant',
    cuisines: [],
    bussinessDetails: null,
    currentWalletAmount: 0,
    totalWalletAmount: 0,
    withdrawnWalletAmount: 0,
    ...extra,
  };
}

export function mapOrder(o: any) {
  const takeaway = o.order_type === 'takeaway';
  const items = (o.order_items ?? []).map((i: any) => ({
    __typename: 'Item',
    _id: i.id,
    id: i.id,
    title: i.item_name,
    description: '',
    image: '',
    quantity: i.quantity,
    specialInstructions: i.note ?? '',
    variation: {
      __typename: 'Variation',
      _id: i.variant_id ?? i.id,
      id: i.variant_id ?? i.id,
      title: i.variant_name ?? '',
      price: i.unit_price_fcfa,
      discounted: 0,
    },
    addons: (i.order_item_options ?? []).length
      ? [
          {
            __typename: 'Addon',
            _id: `${i.id}-options`,
            id: `${i.id}-options`,
            title: 'Options',
            description: '',
            quantityMinimum: 0,
            quantityMaximum: 99,
            options: i.order_item_options.map((op: any) => ({
              __typename: 'Option',
              _id: op.id,
              id: op.id,
              title: op.name,
              description: '',
              price: op.price_delta_fcfa,
            })),
          },
        ]
      : [],
    isActive: true,
    createdAt: i.created_at,
    updatedAt: i.created_at,
  }));
  const r = o.restaurants ?? {};
  return {
    __typename: 'Order',
    _id: o.id,
    orderId: o.order_number,
    zone: null,
    restaurant: {
      __typename: 'Restaurant',
      _id: o.restaurant_id,
      name: r.name ?? '',
      image: r.logo_url ?? r.cover_url ?? '',
      address: r.address ?? '',
      location: point(r.latitude, r.longitude),
    },
    deliveryAddress: takeaway
      ? null
      : {
          __typename: 'OrderAddress',
          location: point(o.delivery_lat, o.delivery_lng),
          deliveryAddress: o.delivery_address ?? '',
          details: o.delivery_address ?? '',
          label: 'Livraison',
        },
    items,
    user: {
      __typename: 'User',
      _id: o.customer_id ?? o.customer_phone,
      name: o.customer_name,
      phone: o.customer_phone,
      email: '',
    },
    paymentMethod:
      o.payment_method === 'mobile_money'
        ? 'Mobile Money'
        : o.payment_method === 'card'
          ? 'Carte'
          : 'Espèces',
    paidAmount: o.status === 'delivered' ? o.total_fcfa : 0,
    orderAmount: o.total_fcfa,
    orderStatus: STATUS_MAP[o.status] ?? 'PENDING',
    isPickedUp: takeaway,
    status: true,
    paymentStatus: o.status === 'delivered' ? 'PAID' : 'PENDING',
    reason: o.cancel_reason ?? '',
    isActive: true,
    createdAt: o.created_at,
    deliveryCharges: o.delivery_fee_fcfa,
    tipping: 0,
    taxationAmount: 0,
    completionTime: o.delivered_at,
    preparationTime: o.estimated_ready_at,
    acceptedAt: o.accepted_at,
    expectedTime: o.estimated_ready_at,
    selectedPrepTime: null,
    eta: null,
    rider: o.riders
      ? {
          __typename: 'Rider',
          _id: o.riders.id,
          name: o.riders.full_name,
          username: o.riders.phone ?? '',
          available: o.riders.status === 'available',
        }
      : null,
  };
}

export function mapCoupon(c: any) {
  return {
    __typename: 'Coupon',
    _id: c.id,
    title: c.code,
    discount: c.value,
    enabled: c.is_active,
    startDate: c.starts_at,
    endDate: c.ends_at,
    lifeTimeActive: !c.ends_at,
  };
}

export function mapRider(r: any) {
  return {
    __typename: 'Rider',
    _id: r.id,
    name: r.full_name,
    username: r.email ?? r.phone ?? '',
    phone: r.phone ?? '',
    available: r.status !== 'offline' && r.is_active,
    isActive: r.is_active,
    vehicleType: 'Moto',
    assigned: [],
    zone: { __typename: 'Zone', _id: r.restaurant_id, title: r.restaurants?.name ?? 'BOUFF' },
    bussinessDetails: null,
    licenseDetails: null,
    vehicleDetails: null,
  };
}
