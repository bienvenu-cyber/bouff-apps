import { bouffDb, createStaffAccount, uploadImage } from './supabase';
import {
  mapCoupon,
  mapFood,
  mapOrder,
  mapRestaurant,
  mapRider,
  ORDER_SELECT,
  paged,
  STATUS_BACK,
  img,
} from './mappers';

export class BouffError extends Error {
  code: string;
  constructor(message: string, code = 'BAD_REQUEST') {
    super(message);
    this.code = code;
  }
}

type Resolver = (args: Record<string, any>) => Promise<any>;

const db = () => bouffDb();

async function must<T>(p: PromiseLike<{ data: T; error: any }>): Promise<T> {
  const { data, error } = await p;
  if (error) throw new BouffError(error.message ?? 'Erreur de la base.');
  return data;
}

// ---------- Session ----------
let accessCache: any = null;

async function access(force = false) {
  if (accessCache && !force) return accessCache;
  const { data } = await db().auth.getSession();
  if (!data.session) throw new BouffError('Session expirée.', 'UNAUTHENTICATED');
  accessCache = { ...(await must(db().rpc('admin_my_access'))), session: data.session };
  return accessCache;
}

function sessionPayload(a: any) {
  const isSuper = !!a.is_super_admin;
  const restaurants = (a.restaurants ?? []).map((r: any) => ({
    __typename: 'Restaurant',
    _id: r.id,
    orderId: 0,
    name: r.name,
    image: '',
    address: '',
  }));
  return {
    __typename: 'OwnerAuthData',
    userId: a.user_id,
    email: a.email,
    name: a.full_name ?? a.email,
    image: '',
    token: a.session.access_token,
    tokenExpiration: a.session.expires_at,
    refreshToken: a.session.refresh_token,
    refreshTokenExpiration: a.session.expires_at,
    userType: isSuper ? 'ADMIN' : 'RESTAURANT',
    userTypeId: isSuper ? a.user_id : restaurants[0]?._id,
    shopType: 'Restaurant',
    permissions: [],
    isActive: true,
    restaurants,
  };
}

export function resetAccess() {
  accessCache = null;
}

// ---------- Restaurants ----------
async function kitchenEmail(restaurantId: string) {
  const staff = await db().rpc('admin_list_staff', { p_restaurant_id: restaurantId });
  const rows = (staff.data ?? []) as any[];
  return {
    kitchen: rows.find((s) => s.role === 'kitchen')?.email ?? '',
    owner: rows.find((s) => s.role === 'restaurant_admin'),
  };
}

async function fullRestaurant(id: string): Promise<any> {
  const r = await must(db().from('restaurants').select('*').eq('id', id).single());
  const [cats, items, opts, adds, team] = await Promise.all([
    must(db().from('categories').select('*').eq('restaurant_id', id).order('sort_order')),
    must(db().from('menu_items').select('*, item_variants(*)').eq('restaurant_id', id).order('sort_order')),
    must(db().from('restaurant_options').select('*').eq('restaurant_id', id).order('title')),
    must(db().from('restaurant_addons').select('*').eq('restaurant_id', id).order('title')),
    kitchenEmail(id).catch(() => ({ kitchen: '', owner: null as any })),
  ]);
  const foods = (items as any[]).map((m) => ({ ...mapFood(m), category: m.category_id }));
  return mapRestaurant(r, {
    username: team.kitchen,
    owner: team.owner ? { __typename: 'Owner', _id: team.owner.user_id, email: team.owner.email, isActive: true } : null,
    categories: (cats as any[]).map((c) => ({
      __typename: 'Category',
      _id: c.id,
      title: c.name,
      image: img(c.image_url),
      createdAt: c.created_at,
      updatedAt: c.updated_at,
      foods: foods.filter((f) => f.category === c.id),
    })),
    options: (opts as any[]).map((o) => ({
      __typename: 'Option',
      _id: o.id,
      title: o.title,
      description: o.description ?? '',
      price: o.price_fcfa,
    })),
    addons: (adds as any[]).map((a) => ({
      __typename: 'Addon',
      _id: a.id,
      title: a.title,
      description: a.description ?? '',
      quantityMinimum: a.min_select,
      quantityMaximum: a.max_select,
      options: a.option_ids ?? [],
    })),
  });
}

async function listRestaurants(search?: string) {
  let q = db().from('restaurants').select('*').order('created_at');
  if (search) q = q.ilike('name', `%${search}%`);
  const rows = (await must(q)) as any[];
  return rows.map((r) => mapRestaurant(r));
}

function slice<T>(rows: T[], page = 1, limit = 10) {
  const p = Math.max(1, page || 1);
  const l = Math.max(1, limit || 10);
  return paged(rows.slice((p - 1) * l, p * l), rows.length, p, l);
}

const filterTitle = (rows: any[], search?: string, key = 'title') =>
  search ? rows.filter((r) => String(r[key] ?? '').toLowerCase().includes(search.toLowerCase())) : rows;

// ---------- Commandes ----------
async function ordersQuery(opts: {
  restaurantId?: string | null;
  riderId?: string | null;
  statuses?: string[] | null;
  search?: string | null;
  from?: string | null;
  to?: string | null;
  page?: number;
  rows?: number;
  active?: boolean;
}) {
  const page = Math.max(1, opts.page || 1);
  const rows = Math.min(Math.max(1, opts.rows || 10), 100);
  let q = db()
    .from('orders')
    .select(ORDER_SELECT, { count: 'exact' })
    .order('created_at', { ascending: false })
    .range((page - 1) * rows, page * rows - 1);
  if (opts.restaurantId) q = q.eq('restaurant_id', opts.restaurantId);
  if (opts.riderId) q = q.eq('rider_id', opts.riderId);
  const statuses = (opts.statuses ?? [])
    .map((s) => STATUS_BACK[String(s).toUpperCase()])
    .filter(Boolean);
  if (statuses.length) q = q.in('status', statuses);
  if (opts.active) q = q.in('status', ['received', 'in_kitchen', 'ready', 'on_the_way']);
  if (opts.search) {
    const s = opts.search.replace(/[,%()]/g, '');
    q = q.or(`order_number.ilike.%${s}%,customer_name.ilike.%${s}%,customer_phone.ilike.%${s}%`);
  }
  if (opts.from) q = q.gte('created_at', opts.from);
  if (opts.to) q = q.lte('created_at', `${opts.to.slice(0, 10)}T23:59:59`);
  const { data, error, count } = await q;
  if (error) throw new BouffError(error.message);
  const total = count ?? 0;
  const totalPages = Math.max(1, Math.ceil(total / rows));
  return {
    orders: (data ?? []).map(mapOrder),
    totalCount: total,
    totalPages,
    currentPage: page,
    nextPage: page < totalPages ? page + 1 : null,
    prevPage: page > 1 ? page - 1 : null,
  };
}

export async function fetchOrder(id: string) {
  const o = await must(db().from('orders').select(ORDER_SELECT).eq('id', id).single());
  return mapOrder(o);
}

const iso = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
// Le filtre (Tout / Aujourd'hui / Semaine / Mois / Année / Personnalisé) décide de la période ; les dates ne comptent qu'en « Personnalisé ».
function dateRange(a: any) {
  const k = String(a?.dateKeyword ?? '').toLowerCase();
  const now = new Date();
  const today = iso(now);
  if (/today|aujourd/.test(k)) return { from: today, to: today };
  if (/week|semaine/.test(k)) { const d = new Date(now); d.setDate(d.getDate() - ((d.getDay() + 6) % 7)); return { from: iso(d), to: today }; }
  if (/month|mois/.test(k)) return { from: iso(new Date(now.getFullYear(), now.getMonth(), 1)), to: today };
  if (/year|ann/.test(k)) return { from: `${now.getFullYear()}-01-01`, to: today };
  if (/^(all|tout|tous|toutes)?$/.test(k) && k !== '') return { from: null, to: null };
  const from = a.starting_date || a.startingDate;
  const to = a.ending_date || a.endingDate;
  return { from: from ? String(from).slice(0, 10) : null, to: to ? String(to).slice(0, 10) : null };
}

async function restaurantStats(id: string, from?: string | null, to?: string | null) {
  const args: any = { p_restaurant_id: id };
  if (from) args.p_from = from;
  if (to) args.p_to = to;
  const { data, error } = await db().rpc('restaurant_stats', args);
  if (error) console.warn('[BOUFF] stats', error.message);
  return (data ?? {}) as any;
}

async function paymentBreakdown(restaurant: string, from?: string | null, to?: string | null) {
  // Agrégé en base (quelques lignes), quel que soit le nombre de commandes.
  const groups = ((await must(db().rpc('admin_order_breakdown', { p_restaurant_id: restaurant, p_from: from ?? null, p_to: to ?? null } as any))) as any[]) ?? [];
  const rows = groups.map((g) => ({ order_type: g.order_type, payment_method: g.is_cash ? 'cash' : 'mobile_money', n: Number(g.orders), total_fcfa: Number(g.sales), delivery_fee_fcfa: Number(g.fees) }));
  const sum = (list: any[]) => ({
    __typename: 'PaymentData',
    total_orders: list.reduce((s, o) => s + o.n, 0),
    total_sales: list.reduce((s, o) => s + o.total_fcfa, 0),
    total_sales_without_delivery: list.reduce((s, o) => s + o.total_fcfa - o.delivery_fee_fcfa, 0),
    total_delivery_fee: list.reduce((s, o) => s + o.delivery_fee_fcfa, 0),
  });
  const cnt = (list: any[]) => list.reduce((s, o) => s + o.n, 0);
  const pickup = rows.filter((o) => o.order_type === 'takeaway');
  const delivery = rows.filter((o) => o.order_type === 'delivery');
  const cod = rows.filter((o) => o.payment_method === 'cash');
  const card = rows.filter((o) => o.payment_method !== 'cash');
  const all = sum(rows);
  const split = (list: any[]) => [
    { __typename: 'PaymentGroup', _type: 'all', data: sum(list) },
    { __typename: 'PaymentGroup', _type: 'isPickedUp', data: sum(list.filter((o) => o.order_type === 'takeaway')) },
    { __typename: 'PaymentGroup', _type: 'isNotPickedUp', data: sum(list.filter((o) => o.order_type === 'delivery')) },
  ];
  return {
    ...all,
    pickup_total_orders: cnt(pickup),
    delivery_total_orders: cnt(delivery),
    pickup_orders: cnt(pickup),
    delivery_orders: cnt(delivery),
    pickup: { total_orders: cnt(pickup) },
    delivery: { total_orders: cnt(delivery) },
    all: split(rows),
    cod: split(cod),
    card: split(card),
  };
}

// ---------- Catalogue ----------
async function saveFood(input: any) {
  const variations = (input.variations ?? []).map((v: any) => ({
    id: /^[0-9a-f-]{36}$/i.test(v._id ?? '') ? v._id : null,
    name: v.title,
    price: Math.round(Number(v.price) || 0),
    addons: (v.addons ?? []).filter((x: string) => /^[0-9a-f-]{36}$/i.test(x)),
    is_available: !v.isOutOfStock,
    discount: Math.max(0, Math.round(Number(v.discounted) || 0)),
  }));
  if (variations.some((v: any) => v.price < 0)) throw new BouffError('Prix invalide.');
  if (variations.some((v: any) => v.discount > 0 && v.discount >= v.price))
    throw new BouffError('La réduction doit être inférieure au prix.');
  const foodId = await must(
    db().rpc('admin_save_food', {
      p: {
        id: input._id || null,
        restaurant_id: input.restaurant,
        category_id: input.category,
        name: input.title,
        description: input.description,
        image_url: input.image ? await uploadImage(input.image) : null,
        is_available: input.isOutOfStock === undefined ? true : !input.isOutOfStock,
        variations,
      },
    })
  );
  // Prix promo : formules relues dans l'ordre d'enregistrement (sort_order 1..n).
  const saved = (await must(
    db().from('item_variants').select('id, sort_order').eq('menu_item_id', foodId as any).order('sort_order')
  )) as any[];
  for (let i = 0; i < variations.length; i++) {
    const row = saved.find((r) => r.sort_order === i + 1);
    if (!row) continue;
    const v = variations[i];
    await must(
      db().rpc('admin_set_variant_promo', {
        p_variant_id: row.id,
        p_promo_price: v.discount > 0 ? v.price - v.discount : null,
        p_ends_at: null,
      } as any)
    );
  }
  return fullRestaurant(input.restaurant);
}

async function syncLibrary(restaurant: string) {
  await must(db().rpc('admin_sync_library', { p_restaurant_id: restaurant }));
}

// ---------- Équipe ----------
function riderEmail(username: string) {
  const u = (username ?? '').trim().toLowerCase();
  if (!u) throw new BouffError('Identifiant (e-mail) requis.');
  return u.includes('@') ? u : `${u.replace(/\s+/g, '.')}@bouff.bj`;
}

async function listRiders(restaurantId?: string | null) {
  let q = db().from('riders').select('*, restaurants(name)').order('created_at', { ascending: false });
  if (restaurantId) q = q.eq('restaurant_id', restaurantId);
  const rows = (await must(q)) as any[];
  const staff = ((await db().rpc('admin_list_staff', { p_restaurant_id: restaurantId ?? null })).data ?? []) as any[];
  return rows.map((r) => mapRider({ ...r, email: staff.find((s) => s.user_id === r.user_id)?.email }));
}

async function defaultRestaurantId(explicit?: string | null) {
  if (explicit && /^[0-9a-f-]{36}$/i.test(explicit)) return explicit;
  const a = await access();
  if (a.restaurants?.[0]?.id) return a.restaurants[0].id;
  const r = (await must(db().from('restaurants').select('id').order('created_at').limit(1))) as any[];
  if (!r[0]) throw new BouffError('Créez d’abord un restaurant.');
  return r[0].id;
}

async function listStaffAdmins() {
  const rows = ((await must(db().rpc('admin_list_staff', { p_restaurant_id: null }))) as any[]) ?? [];
  return rows
    .filter((s) => s.role === 'super_admin')
    .map((s) => ({
      __typename: 'Staff',
      _id: s.user_id,
      name: s.full_name ?? s.email,
      email: s.email,
      phone: s.phone ?? '',
      isActive: true,
      permissions: [],
      userType: 'STAFF',
    }));
}

async function listVendors() {
  const rows = ((await must(db().rpc('admin_list_staff', { p_restaurant_id: null }))) as any[]) ?? [];
  const by = new Map<string, any>();
  for (const s of rows.filter((x) => x.role === 'restaurant_admin')) {
    const v = by.get(s.user_id) ?? {
      __typename: 'Vendor',
      _id: s.user_id,
      unique_id: s.user_id.slice(0, 8),
      email: s.email,
      userType: 'VENDOR',
      isActive: true,
      name: s.full_name ?? s.email,
      firstName: (s.full_name ?? '').split(' ')[0] ?? '',
      lastName: (s.full_name ?? '').split(' ').slice(1).join(' '),
      phoneNumber: s.phone ?? '',
      image: '',
      restaurants: [],
    };
    v.restaurants.push({ __typename: 'Restaurant', _id: s.restaurant_id, name: s.restaurant_name });
    by.set(s.user_id, v);
  }
  return [...by.values()];
}

// ---------- Codes promo ----------
async function listCoupons(restaurantId: string | null, search?: string) {
  let q = db().from('coupons').select('*').order('created_at', { ascending: false });
  q = restaurantId ? q.eq('restaurant_id', restaurantId) : q.is('restaurant_id', null);
  if (search) q = q.ilike('code', `%${search}%`);
  return ((await must(q)) as any[]).map(mapCoupon);
}

async function saveCoupon(input: any, restaurantId: string | null) {
  const value = Math.round(Number(input.discount) || 0);
  if (value <= 0 || value > 100) throw new BouffError('La remise doit être entre 1 et 100 %.');
  const row: any = {
    code: String(input.title ?? '').trim().toUpperCase(),
    title: String(input.title ?? '').trim(),
    kind: 'percent',
    value,
    is_active: input.enabled ?? true,
    restaurant_id: restaurantId,
    starts_at: input.startDate || null,
    ends_at: input.lifeTimeActive ? null : input.endDate || null,
  };
  if (!row.code) throw new BouffError('Code requis.');
  const q = input._id
    ? db().from('coupons').update(row).eq('id', input._id).select().single()
    : db().from('coupons').insert({ ...row, is_public: true }).select().single();
  return mapCoupon(await must(q));
}

// ---------- Résolveurs par champ racine ----------
export const resolvers: Record<string, Resolver> = {
  // Session
  async ownerLogin({ email, password }) {
    resetAccess();
    const { error } = await db().auth.signInWithPassword({ email: String(email).trim(), password });
    if (error) throw new BouffError('E-mail ou mot de passe incorrect.');
    const a = await access(true);
    if (!a.is_super_admin && !(a.restaurants ?? []).length) {
      await db().auth.signOut();
      resetAccess();
      throw new BouffError('Accès réservé aux gérants et à l’administration BOUFF.', 'FORBIDDEN');
    }
    return sessionPayload(a);
  },
  async ownerSession() {
    return sessionPayload(await access(true));
  },
  async hasOwnerPermission() {
    return true;
  },
  async refreshToken() {
    const { data } = await db().auth.refreshSession();
    if (!data.session) throw new BouffError('Session expirée.', 'UNAUTHENTICATED');
    return { token: data.session.access_token, refreshToken: data.session.refresh_token, tokenExpiration: data.session.expires_at, refreshTokenExpiration: data.session.expires_at };
  },
  async metricsGeneral() {
    return { experience: 'bouff', hehe: 'bouff' };
  },
  async configuration() {
    return {
      _id: 'bouff',
      currency: 'XOF',
      currencySymbol: 'FCFA',
      deliveryRate: 500,
      costType: 'fixed',
      isPaidVersion: true,
      skipEmailVerification: true,
      skipMobileVerification: true,
      skipWhatsAppOTP: true,
      googleApiKey: process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY ?? '',
      googleColor: '#FF6A00',
      enableRiderEarnings: true,
    };
  },

  // Restaurants
  async restaurant({ id }) {
    return fullRestaurant(await defaultRestaurantId(id));
  },
  async restaurants() {
    return listRestaurants();
  },
  async restaurantsPaginated({ page, limit, search }) {
    return slice(await listRestaurants(search), page, limit);
  },
  async getClonedRestaurants() {
    return [];
  },
  async getClonedRestaurantsPaginated({ page, limit }) {
    return slice([], page, limit);
  },
  async restaurantByOwner({ id }) {
    const vendors = await listVendors().catch(() => []);
    const a = await access();
    const vid = id || a.user_id;
    const v = vendors.find((x) => x._id === vid);
    const ids: string[] = v ? v.restaurants.map((r: any) => r._id) : (a.restaurants ?? []).map((r: any) => r.id);
    const rows = ids.length ? ((await must(db().from('restaurants').select('*').in('id', ids))) as any[]) : [];
    return { _id: vid, email: v?.email ?? a.email, userType: 'VENDOR', restaurants: rows.map((r) => mapRestaurant(r)) };
  },
  async getRestaurantDeliveryZoneInfo({ id }) {
    return fullRestaurant(id);
  },
  async commissionRate({ page, limit, search }) {
    const rows = await listRestaurants(search);
    const p = slice(rows, page, limit);
    return { ...p, restaurant: p.data };
  },
  async updateCommission({ id, commissionRate }) {
    const rate = Number(commissionRate);
    if (!(rate >= 0 && rate <= 100)) throw new BouffError('Commission entre 0 et 100 %.');
    const r = await must(db().from('restaurants').update({ commission_rate: rate }).eq('id', id).select().single());
    return mapRestaurant(r);
  },
  async createRestaurant({ restaurant, owner }) {
    const name = String(restaurant?.name ?? '').trim();
    if (!name) throw new BouffError('Nom requis.');
    const slug = (restaurant.slug || name).toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');
    const r = (await must(
      db().from('restaurants').insert({
        name,
        slug,
        address: restaurant.address ?? null,
        phone: restaurant.phone ?? null,
        logo_url: restaurant.logo ? await uploadImage(restaurant.logo) : null,
        cover_url: restaurant.image ? await uploadImage(restaurant.image) : null,
        min_order_fcfa: Math.max(0, Math.round(Number(restaurant.minimumOrder) || 500)),
        city: 'Parakou',
        is_active: true,
      }).select().single()
    )) as any;
    if (owner) await must(db().rpc('admin_assign_staff', { p_user_id: owner, p_role: 'restaurant_admin', p_restaurant_id: r.id }));
    if (restaurant.username && restaurant.password) {
      const uid = await createStaffAccount(riderEmail(restaurant.username), restaurant.password);
      await must(db().rpc('admin_assign_staff', { p_user_id: uid, p_role: 'kitchen', p_restaurant_id: r.id, p_full_name: `Cuisine ${name}` }));
    }
    return mapRestaurant(r);
  },
  async deleteRestaurant({ id }) {
    const cur = (await must(db().from('restaurants').select('is_active').eq('id', id).single())) as any;
    const r = await must(db().from('restaurants').update({ is_active: !cur.is_active }).eq('id', id).select().single());
    return mapRestaurant(r);
  },
  async hardDeleteRestaurant({ id }) {
    await must(db().from('restaurants').update({ is_active: false }).eq('id', id));
    return true;
  },
  async editRestaurant({ restaurant }) {
    const i = restaurant ?? {};
    const patch: any = {};
    if (i.name) patch.name = i.name;
    if (i.phone !== undefined) patch.phone = i.phone;
    if (i.address !== undefined) patch.address = i.address;
    if (i.minimumOrder !== undefined) patch.min_order_fcfa = Math.max(0, Math.round(Number(i.minimumOrder) || 0));
    if (i.logo) patch.logo_url = await uploadImage(i.logo);
    if (i.image) patch.cover_url = await uploadImage(i.image);
    if (i.isAvailable !== undefined) patch.is_temporarily_closed = !i.isAvailable;
    const r = await must(db().from('restaurants').update(patch).eq('id', i._id).select().single());
    if (i.username) {
      const uid = await createStaffAccount(riderEmail(i.username), i.password);
      await must(db().rpc('admin_assign_staff', { p_user_id: uid, p_role: 'kitchen', p_restaurant_id: i._id, p_full_name: `Cuisine ${patch.name ?? ''}`.trim() }));
    }
    return mapRestaurant(r, { username: i.username ?? '' });
  },
  async updateTimings({ id, openingTimes }) {
    const slot = (openingTimes ?? []).find((d: any) => d?.times?.length)?.times?.[0];
    const t = (x: any) => (Array.isArray(x) ? `${String(x[0]).padStart(2, '0')}:${String(x[1] ?? '00').padStart(2, '0')}` : String(x).slice(0, 5));
    const patch = slot ? { opens_at: t(slot.startTime), closes_at: t(slot.endTime) } : { is_temporarily_closed: true };
    const r = await must(db().from('restaurants').update(patch).eq('id', id).select().single());
    return mapRestaurant(r);
  },
  async updateDeliveryBoundsAndLocation({ id, location, address, city }) {
    const [lng, lat] = location?.coordinates ?? [location?.longitude, location?.latitude];
    const patch: any = { latitude: Number(lat), longitude: Number(lng) };
    if (address) patch.address = address;
    if (city) patch.city = city;
    const r = await must(db().from('restaurants').update(patch).eq('id', id).select().single());
    return { success: true, message: 'Position enregistrée.', data: mapRestaurant(r) };
  },
  async updateRestaurantDelivery({ id }) {
    return { success: true, message: 'Les frais se règlent par quartier.', data: { _id: id } };
  },
  async updateRestaurantBussinessDetails({ id }) {
    return { success: true, message: 'Enregistré.', data: { _id: id } };
  },
  async updateDeliveryOptions({ restId, pickup, delivery }) {
    const r = (await must(db().from('restaurants').update({ accepts_takeaway: pickup, accepts_delivery: delivery }).eq('id', restId).select().single())) as any;
    return mapRestaurant(r);
  },

  // Catégories
  async restaurantCategoriesPaginated({ restaurantId, page, limit, search }) {
    const r = await fullRestaurant(restaurantId);
    return slice(filterTitle(r.categories, search), page, limit);
  },
  async createCategory({ category }) {
    await must(db().from('categories').insert({
      restaurant_id: category.restaurant,
      name: category.title,
      image_url: category.image ? await uploadImage(category.image) : null,
    }));
    return fullRestaurant(category.restaurant);
  },
  async editCategory({ category }) {
    const patch: any = { name: category.title };
    if (category.image) patch.image_url = await uploadImage(category.image);
    await must(db().from('categories').update(patch).eq('id', category._id));
    return fullRestaurant(category.restaurant);
  },
  async deleteCategory({ id, restaurant }) {
    await must(db().from('menu_items').update({ category_id: null, is_available: false }).eq('category_id', id));
    await must(db().from('categories').delete().eq('id', id));
    return fullRestaurant(restaurant);
  },
  async subCategories() {
    return [];
  },
  async subCategoriesByParentId() {
    return [];
  },

  // Plats
  async createFood({ foodInput }) {
    return saveFood(foodInput);
  },
  async editFood({ foodInput }) {
    return saveFood(foodInput);
  },
  async deleteFood({ id, restaurant }) {
    const used = await db().from('order_items').select('id', { head: true, count: 'exact' }).eq('menu_item_id', id);
    if ((used.count ?? 0) > 0) {
      await must(db().from('menu_items').update({ is_available: false, category_id: null }).eq('id', id));
    } else {
      await must(db().from('menu_items').delete().eq('id', id));
    }
    return fullRestaurant(restaurant);
  },
  async updateFoodOutOfStock({ id }) {
    const m = (await must(db().from('menu_items').select('is_available').eq('id', id).single())) as any;
    await must(db().rpc('set_item_availability', { p_menu_item_id: id, p_available: !m.is_available }));
    return true;
  },

  // Options
  async restaurantOptionsPaginated({ restaurantId, page, limit, search }) {
    const r = await fullRestaurant(restaurantId);
    return slice(filterTitle(r.options, search), page, limit);
  },
  async createOptions({ optionInput }) {
    const list = Array.isArray(optionInput.options) ? optionInput.options : [optionInput.options];
    await must(db().from('restaurant_options').insert(list.map((o: any) => ({
      restaurant_id: optionInput.restaurant,
      title: o.title,
      description: o.description ?? null,
      price_fcfa: Math.max(0, Math.round(Number(o.price) || 0)),
    }))));
    return fullRestaurant(optionInput.restaurant);
  },
  async editOption({ optionInput }) {
    const o = Array.isArray(optionInput.options) ? optionInput.options[0] : optionInput.options;
    await must(db().from('restaurant_options').update({
      title: o.title,
      description: o.description ?? null,
      price_fcfa: Math.max(0, Math.round(Number(o.price) || 0)),
    }).eq('id', o._id));
    await syncLibrary(optionInput.restaurant);
    return fullRestaurant(optionInput.restaurant);
  },
  async deleteOption({ id, restaurant }) {
    const adds = (await must(db().from('restaurant_addons').select('id, option_ids').eq('restaurant_id', restaurant))) as any[];
    for (const a of adds.filter((x) => (x.option_ids ?? []).includes(id))) {
      await must(db().from('restaurant_addons').update({ option_ids: a.option_ids.filter((x: string) => x !== id) }).eq('id', a.id));
    }
    await must(db().from('restaurant_options').delete().eq('id', id));
    await syncLibrary(restaurant);
    return fullRestaurant(restaurant);
  },

  // Groupes d'options
  async restaurantAddonsPaginated({ restaurantId, page, limit, search }) {
    const r = await fullRestaurant(restaurantId);
    return slice(filterTitle(r.addons, search), page, limit);
  },
  async createAddons({ addonInput }) {
    const list = Array.isArray(addonInput.addons) ? addonInput.addons : [addonInput.addons];
    await must(db().from('restaurant_addons').insert(list.map((a: any) => ({
      restaurant_id: addonInput.restaurant,
      title: a.title,
      description: a.description ?? null,
      min_select: Math.max(0, Number(a.quantityMinimum) || 0),
      max_select: Math.max(1, Number(a.quantityMaximum) || 1),
      option_ids: a.options ?? [],
    }))));
    return fullRestaurant(addonInput.restaurant);
  },
  async editAddon({ addonInput }) {
    const a = Array.isArray(addonInput.addons) ? addonInput.addons[0] : addonInput.addons;
    await must(db().from('restaurant_addons').update({
      title: a.title,
      description: a.description ?? null,
      min_select: Math.max(0, Number(a.quantityMinimum) || 0),
      max_select: Math.max(1, Number(a.quantityMaximum) || 1),
      option_ids: a.options ?? [],
    }).eq('id', a._id));
    await syncLibrary(addonInput.restaurant);
    return fullRestaurant(addonInput.restaurant);
  },
  async deleteAddon({ id, restaurant }) {
    await must(db().from('option_groups').delete().eq('source_addon_id', id));
    await must(db().from('restaurant_addons').delete().eq('id', id));
    return fullRestaurant(restaurant);
  },

  // Commandes
  async ordersByRestId({ restaurant, page, rows, search, orderStatus }) {
    return ordersQuery({ restaurantId: restaurant, page, rows, search, statuses: orderStatus });
  },
  async ordersByRestIdWithoutPagination({ restaurant, search }) {
    return (await ordersQuery({ restaurantId: restaurant, search, rows: 100 })).orders;
  },
  async allOrdersPaginated(a) {
    const { from, to } = dateRange(a);
    return ordersQuery({ restaurantId: a.restaurantId, riderId: a.riderId, statuses: a.orderStatus, search: a.search, page: a.page, rows: a.rows, from, to });
  },
  async allOrders({ page }) {
    return (await ordersQuery({ page })).orders;
  },
  async allOrdersWithoutPagination(a) {
    const { from, to } = dateRange(a);
    return (await ordersQuery({ from, to, rows: 100 })).orders;
  },
  async getActiveOrders({ restaurantId, page, rowsPerPage, search }) {
    const r = await ordersQuery({ restaurantId, page: (page ?? 0) + 1, rows: rowsPerPage, search, active: true });
    return { totalCount: r.totalCount, orders: r.orders };
  },
  async orderFilterOptions() {
    return { restaurants: await listRestaurants(), riders: await listRiders() };
  },
  async updateStatus({ id, orderStatus }) {
    const s = String(orderStatus).toUpperCase();
    if (s === 'ACCEPTED') await must(db().rpc('accept_order', { p_order_id: id, p_minutes: 20 }));
    else await must(db().rpc('advance_order_status', {
      p_order_id: id,
      p_status: STATUS_BACK[s] ?? 'cancelled',
      p_cancel_reason: s.startsWith('CANCEL') ? 'Annulée par le restaurant' : null,
    }));
    return fetchOrder(id);
  },
  async assignRider({ id }) {
    throw new BouffError('Les livreurs prennent eux-mêmes les courses dans l’app livreur.');
  },

  // Tableaux de bord
  async getRestaurantDashboardOrdersSalesStats(a) {
    const { from, to } = dateRange(a);
    const b = await paymentBreakdown(a.restaurant, from, to);
    return { totalOrders: b.total_orders, totalSales: b.total_sales, totalCODOrders: b.cod[0].data.total_orders, totalCardOrders: b.card[0].data.total_orders };
  },
  async getRestaurantDashboardSalesOrderCountDetailsByYear({ restaurant, year }) {
    const s = await restaurantStats(restaurant, `${year}-01-01`, `${year}-12-31`);
    const months = Array.from({ length: 12 }, () => ({ s: 0, c: 0 }));
    for (const d of s.daily ?? []) {
      const m = new Date(d.day).getMonth();
      months[m].s += d.revenue_fcfa;
      months[m].c += d.orders;
    }
    return { salesAmount: months.map((m) => m.s), ordersCount: months.map((m) => m.c) };
  },
  async getRestaurantDashboardOrderSalesDetailsByPaymentMethod(a) {
    const { from, to } = dateRange(a);
    return paymentBreakdown(a.restaurant, from, to);
  },
  async getDashboardUsers() {
    const [cust, rest, riders, vendors] = await Promise.all([
      db().rpc('admin_list_customers', { p_limit: 1 }),
      db().from('restaurants').select('id', { head: true, count: 'exact' }),
      db().from('riders').select('id', { head: true, count: 'exact' }),
      listVendors().catch(() => []),
    ]);
    return { usersCount: (cust.data as any)?.total ?? 0, vendorsCount: vendors.length, restaurantsCount: rest.count ?? 0, ridersCount: riders.count ?? 0 };
  },
  async getDashboardUsersByYear() {
    const u = await resolvers.getDashboardUsers({});
    const one = (n: number) => Array.from({ length: 12 }, (_, i) => (i === new Date().getMonth() ? n : 0));
    return { usersCount: one(u.usersCount), vendorsCount: one(u.vendorsCount), restaurantsCount: one(u.restaurantsCount), ridersCount: one(u.ridersCount), percentageChange: { usersPercent: 0, vendorsPercent: 0, restaurantsPercent: 0, ridersPercent: 0 } };
  },
  async getDashboardOrdersByType() {
    const [d, t] = await Promise.all([
      db().from('orders').select('id', { head: true, count: 'exact' }).eq('order_type', 'delivery'),
      db().from('orders').select('id', { head: true, count: 'exact' }).eq('order_type', 'takeaway'),
    ]);
    return [{ label: 'Livraison', value: d.count ?? 0 }, { label: 'À emporter', value: t.count ?? 0 }];
  },
  async getDashboardSalesByType() {
    const rows = ((await must(db().from('orders').select('order_type,total_fcfa').eq('status', 'delivered'))) as any[]) ?? [];
    const s = (t: string) => rows.filter((o) => o.order_type === t).reduce((a, o) => a + o.total_fcfa, 0);
    return [{ label: 'Livraison', value: s('delivery') }, { label: 'À emporter', value: s('takeaway') }];
  },
  async getStoreDetailsByVendorId({ id }) {
    const r = await resolvers.restaurantByOwner({ id });
    return Promise.all(r.restaurants.map(async (x: any) => {
      const b = await paymentBreakdown(x._id);
      return { _id: x._id, restaurantName: x.name, totalOrders: b.total_orders, totalSales: b.total_sales, pickUpCount: b.pickup_orders, deliveryCount: b.delivery_orders };
    }));
  },
  async getStoreDetailsByVendorIdPaginated(a) {
    return slice(await resolvers.getStoreDetailsByVendorId(a), a.page, a.limit);
  },
  async getVendorDashboardStatsCardDetails({ vendorId }) {
    const rows = await resolvers.getStoreDetailsByVendorId({ id: vendorId });
    return { totalRestaurants: rows.length, totalOrders: rows.reduce((s: number, r: any) => s + r.totalOrders, 0), totalSales: rows.reduce((s: number, r: any) => s + r.totalSales, 0), totalDeliveries: rows.reduce((s: number, r: any) => s + r.deliveryCount, 0) };
  },
  async getLiveMonitorData(a) {
    const { from, to } = dateRange(a);
    const access0 = await access();
    const restId = a?.id && a.id !== 'all' ? a.id : (access0.is_super_admin ? null : access0.restaurants?.[0]?.id ?? null);
    const r = await must(db().rpc('admin_dashboard_counts', {
      p_restaurant_id: restId,
      p_from: from,
      p_to: to,
    })) as any;
    return {
      online_stores: r?.online_stores ?? 0,
      cancelled_orders: r?.cancelled_orders ?? 0,
      delayed_orders: r?.delayed_orders ?? 0,
      ratings: r?.average_rating ?? r?.ratings ?? 0,
    };
  },
  async getVendorDashboardGrowthDetailsByYear() {
    return { totalRestaurants: Array(12).fill(0), totalOrders: Array(12).fill(0), totalSales: Array(12).fill(0) };
  },

  // Villes (zones)
  async zones() {
    const rows = (await must(db().from('cities').select('*').order('sort_order'))) as any[];
    return rows.map((c) => ({ __typename: 'Zone', _id: c.id, title: c.name, description: c.is_default ? 'Ville par défaut' : '', isActive: c.is_active, location: { __typename: 'Polygon', coordinates: [[[0, 0]]] } }));
  },
  async zonesPaginated({ page, limit, search }) {
    return slice(filterTitle(await resolvers.zones({}), search), page, limit);
  },
  async createZone({ zone }) {
    const c = (await must(db().from('cities').insert({ name: zone.title, is_active: true }).select().single())) as any;
    return { _id: c.id, title: c.name, description: '', isActive: c.is_active, location: { coordinates: [[[0, 0]]] } };
  },
  async editZone({ zone }) {
    const c = (await must(db().from('cities').update({ name: zone.title }).eq('id', zone._id).select().single())) as any;
    return { _id: c.id, title: c.name, description: '', isActive: c.is_active, location: { coordinates: [[[0, 0]]] } };
  },
  async deleteZone({ id }) {
    const c = (await must(db().from('cities').update({ is_active: false }).eq('id', id).select().single())) as any;
    return { _id: c.id, title: c.name, description: '', isActive: false, location: { coordinates: [[[0, 0]]] } };
  },

  // Livreurs
  async riders() {
    return listRiders();
  },
  async ridersPaginated({ page, limit, search }) {
    return slice(filterTitle(await listRiders(), search, 'name'), page, limit);
  },
  async availableRiders() {
    return (await listRiders()).filter((r) => r.available);
  },
  async ridersByZone({ id }) {
    return listRiders(id);
  },
  async rider({ id }) {
    return (await listRiders()).find((r) => r._id === id) ?? null;
  },
  async createRider({ riderInput }) {
    const rid = await defaultRestaurantId(riderInput.zone);
    const uid = await createStaffAccount(riderEmail(riderInput.username), riderInput.password);
    await must(db().rpc('admin_assign_staff', { p_user_id: uid, p_role: 'rider', p_restaurant_id: rid, p_full_name: riderInput.name, p_phone: riderInput.phone ?? null }));
    return (await listRiders()).find((r) => r.username === riderEmail(riderInput.username)) ?? null;
  },
  async editRider({ riderInput }) {
    const r = (await must(db().from('riders').update({ full_name: riderInput.name, phone: riderInput.phone ?? null }).eq('id', riderInput._id).select('*, restaurants(name)').single())) as any;
    return mapRider(r);
  },
  async deleteRider({ id }) {
    const r = (await must(db().from('riders').select('user_id, restaurant_id').eq('id', id).single())) as any;
    if (r.user_id) await must(db().rpc('admin_remove_staff', { p_user_id: r.user_id, p_role: 'rider', p_restaurant_id: r.restaurant_id }));
    else await must(db().from('riders').update({ is_active: false }).eq('id', id));
    return { _id: id };
  },
  async toggleAvailablity({ id }) {
    const r = (await must(db().from('riders').select('is_active').eq('id', id).single())) as any;
    const u = (await must(db().from('riders').update({ is_active: !r.is_active, status: 'offline' }).eq('id', id).select('*, restaurants(name)').single())) as any;
    return mapRider(u);
  },

  // Admins généraux (équipe)
  async staffs() {
    return listStaffAdmins();
  },
  async staffsPaginated({ page, limit, search }) {
    return slice(filterTitle(await listStaffAdmins(), search, 'name'), page, limit);
  },
  async createStaff({ staffInput }) {
    const uid = await createStaffAccount(staffInput.email, staffInput.password);
    await must(db().rpc('admin_assign_staff', { p_user_id: uid, p_role: 'super_admin', p_restaurant_id: null, p_full_name: staffInput.name, p_phone: staffInput.phone ?? null }));
    return (await listStaffAdmins()).find((s) => s._id === uid);
  },
  async editStaff({ staffInput }) {
    if (staffInput.isActive === false) {
      await must(db().rpc('admin_remove_staff', { p_user_id: staffInput._id, p_role: 'super_admin', p_restaurant_id: null }));
      return { ...staffInput, isActive: false, userType: 'STAFF' };
    }
    await must(db().rpc('admin_assign_staff', { p_user_id: staffInput._id, p_role: 'super_admin', p_restaurant_id: null, p_full_name: staffInput.name, p_phone: staffInput.phone ?? null }));
    return { ...staffInput, userType: 'STAFF' };
  },
  async deleteStaff({ id }) {
    await must(db().rpc('admin_remove_staff', { p_user_id: id, p_role: 'super_admin', p_restaurant_id: null }));
    return { _id: id };
  },

  // Gérants (vendeurs)
  async vendors() {
    return listVendors();
  },
  async getVendor({ id }) {
    return (await listVendors()).find((v) => v._id === id) ?? null;
  },
  async createVendor({ vendorInput }) {
    const uid = await createStaffAccount(vendorInput.email, vendorInput.password);
    const rid = await defaultRestaurantId(null);
    await must(db().rpc('admin_assign_staff', { p_user_id: uid, p_role: 'restaurant_admin', p_restaurant_id: rid, p_full_name: vendorInput.name, p_phone: vendorInput.phoneNumber ?? null }));
    return { _id: uid, email: vendorInput.email, name: vendorInput.name, image: '', firstName: vendorInput.firstName, lastName: vendorInput.lastName, phoneNumber: vendorInput.phoneNumber };
  },
  async editVendor({ vendorInput }) {
    await must(db().from('profiles').update({ full_name: vendorInput.name, phone: vendorInput.phoneNumber ?? null }).eq('id', vendorInput._id));
    return { ...vendorInput, image: '' };
  },
  async deleteVendor({ id }) {
    const v = (await listVendors()).find((x) => x._id === id);
    for (const r of v?.restaurants ?? []) {
      await must(db().rpc('admin_remove_staff', { p_user_id: id, p_role: 'restaurant_admin', p_restaurant_id: r._id }));
    }
    return true;
  },

  // Clients
  async usersPaginated({ page, limit, search }) {
    const p = Math.max(1, page || 1);
    const l = Math.max(1, limit || 10);
    const r = (await must(db().rpc('admin_list_customers', { p_search: search ?? null, p_limit: l, p_offset: (p - 1) * l }))) as any;
    const rows = (r.rows ?? []).map((u: any) => ({ __typename: 'User', _id: u.id, name: u.full_name ?? '', email: u.email, phone: u.phone ?? '', createdAt: u.created_at, userType: 'default', status: 'active', lastLogin: null, notes: `${u.orders_count} commande(s)`, addresses: [] }));
    return paged(rows, r.total ?? 0, p, l);
  },
  async users() {
    return (await resolvers.usersPaginated({ page: 1, limit: 100 })).data;
  },
  async user({ id }) {
    const all = await resolvers.users({});
    return all.find((u: any) => u._id === id) ?? null;
  },
  async ordersByUser() {
    return [];
  },

  // Codes promo
  async coupons() {
    return listCoupons(null);
  },
  async couponsPaginated({ page, limit, search }) {
    return slice(await listCoupons(null, search), page, limit);
  },
  async createCoupon({ couponInput }) {
    return saveCoupon(couponInput, null);
  },
  async editCoupon({ couponInput }) {
    return saveCoupon(couponInput, null);
  },
  async deleteCoupon({ id }) {
    await must(db().from('coupons').update({ is_active: false }).eq('id', id));
    return id;
  },
  async restaurantCoupons({ restaurantId }) {
    return listCoupons(restaurantId);
  },
  async restaurantCouponsPaginated({ restaurantId, page, limit, search }) {
    return slice(await listCoupons(restaurantId, search), page, limit);
  },
  async createRestaurantCoupon({ restaurantId, couponInput }) {
    return saveCoupon(couponInput, restaurantId);
  },
  async editRestaurantCoupon({ restaurantId, couponInput }) {
    return saveCoupon(couponInput, restaurantId);
  },
  async deleteRestaurantCoupon({ couponId }) {
    await must(db().from('coupons').update({ is_active: false }).eq('id', couponId));
    return true;
  },

  // Divers
  async uploadImageToS3({ image }) {
    return { imageUrl: await uploadImage(image) };
  },
  async uploadToken({ id }) {
    return { _id: id, pushToken: '' };
  },
  async getWebNotifications() {
    return [];
  },
  async webNotifications() {
    return [];
  },
  async markWebNotificationsAsRead() {
    return [];
  },
  async cuisines() {
    return [];
  },
  async fetchShopTypes() {
    return { data: [], totalCount: 0, currentPage: 1, totalPages: 1 };
  },

  // Notes et Avis
  async restaurantReviewsPaginated({ restaurantId, page, limit, search, minRating, maxRating }) {
    const res = await db().rpc('admin_list_reviews', { 
      p_restaurant_id: restaurantId || null, 
      p_limit: 200 
    });
    let rows = (res.data ?? []) as any[];
    
    if (search) {
        const s = search.toLowerCase();
        rows = rows.filter(r => 
            String(r.customer_name ?? '').toLowerCase().includes(s) || 
            String(r.comment ?? '').toLowerCase().includes(s) ||
            String(r.order_number ?? '').toLowerCase().includes(s)
        );
    }
    if (minRating !== undefined) rows = rows.filter(r => Number(r.rating) >= minRating);
    if (maxRating !== undefined) rows = rows.filter(r => Number(r.rating) <= maxRating);

    const data = rows.map(r => ({
        __typename: 'Review',
        _id: String(r.id),
        order: {
            __typename: 'Order',
            _id: String(r.id),
            orderId: String(r.order_number),
            items: [],
            user: {
                __typename: 'User',
                _id: String(r.customer_name),
                name: String(r.customer_name),
                email: ''
            }
        },
        restaurant: {
            __typename: 'Restaurant',
            _id: String(r.restaurant_id || r.restaurant || ''),
            name: String(r.restaurant || ''),
            image: ''
        },
        rating: Number(r.rating),
        comments: String(r.comment || ''),
        description: String(r.comment || ''),
        createdAt: r.created_at
    }));

    return slice(data, page, limit);
  },
};
