import { bouffDb } from "./supabase";
import { RESTAURANT_SLUG } from "./config";

export interface BouffOption {
  id: string;
  title: string;
  description: string | null;
  price: number;
  isAvailable: boolean;
}

export interface BouffOptionGroup {
  id: string;
  title: string;
  description: string | null;
  quantityMinimum: number;
  quantityMaximum: number;
  appliesToKind: string | null;
  options: BouffOption[];
}

export interface BouffVariant {
  id: string;
  title: string;
  kind: string;
  price: number;
  isDefault: boolean;
  isOutOfStock: boolean;
}

export interface BouffItem {
  id: string;
  categoryId: string | null;
  title: string;
  description: string | null;
  image: string | null;
  isOutOfStock: boolean;
  isFeatured: boolean;
  availableWeekday: number | null;
  variations: BouffVariant[];
  optionGroups: BouffOptionGroup[];
}

export interface BouffCategory {
  id: string;
  name: string;
  description: string | null;
  image: string | null;
  items: BouffItem[];
}

export interface BouffZone {
  id: string;
  name: string;
  fee: number;
  cityId: string;
}

export interface BouffCity {
  id: string;
  name: string;
  isDefault: boolean;
  isActive: boolean;
}

export interface BouffMenu {
  restaurant: {
    id: string;
    slug: string;
    name: string;
    tagline: string | null;
    description: string | null;
    logo: string | null;
    cover: string | null;
    brandColor: string;
    phone: string | null;
    whatsapp: string | null;
    address: string | null;
    city: string;
    opensAt: string | null;
    closesAt: string | null;
    acceptsTakeaway: boolean;
    acceptsDelivery: boolean;
  };
  categories: BouffCategory[];
  items: BouffItem[];
  zones: BouffZone[];
  cities: BouffCity[];
}

let cache: { at: number; menu: BouffMenu } | null = null;
let inflight: Promise<BouffMenu> | null = null;
const TTL_MS = 30_000;

export function invalidateMenu() {
  cache = null;
}

export async function loadMenu(force = false): Promise<BouffMenu> {
  if (!force && cache && Date.now() - cache.at < TTL_MS) return cache.menu;
  if (!force && inflight) return inflight;

  inflight = (async () => {
    const db = bouffDb();
    const { data: restaurant, error: restError } = await db
      .from("restaurants")
      .select("*")
      .eq("slug", RESTAURANT_SLUG)
      .maybeSingle();
    if (restError) throw restError;
    if (!restaurant) throw new Error("Restaurant BOUFF introuvable.");

    const [categories, items, variants, zones, cities] = await Promise.all([
      db
        .from("categories")
        .select("*")
        .eq("restaurant_id", restaurant.id)
        .eq("is_active", true)
        .order("sort_order"),
      db
        .from("menu_items")
        .select("*")
        .eq("restaurant_id", restaurant.id)
        .order("sort_order"),
      db.from("item_variants").select("*").order("sort_order"),
      db
        .from("delivery_zones")
        .select("*")
        .eq("restaurant_id", restaurant.id)
        .eq("is_active", true)
        .order("sort_order"),
      db.from("cities").select("*").order("sort_order"),
    ]);

    const itemIds = (items.data ?? []).map((i) => i.id);
    const { data: groups } = await db
      .from("option_groups")
      .select("*")
      .in("menu_item_id", itemIds.length ? itemIds : ["00000000-0000-0000-0000-000000000000"])
      .order("sort_order");
    const groupIds = (groups ?? []).map((g) => g.id);
    const { data: options } = await db
      .from("options")
      .select("*")
      .in("group_id", groupIds.length ? groupIds : ["00000000-0000-0000-0000-000000000000"])
      .order("sort_order");

    const mapped: BouffItem[] = (items.data ?? []).map((item) => ({
      id: item.id,
      categoryId: item.category_id,
      title: item.name,
      description: item.description,
      image: item.image_url,
      isOutOfStock: !item.is_available,
      isFeatured: item.is_featured,
      availableWeekday: item.available_weekday,
      variations: (variants.data ?? [])
        .filter((v) => v.menu_item_id === item.id)
        .map((v) => ({
          id: v.id,
          title: v.name,
          kind: v.kind,
          price: v.price_fcfa,
          isDefault: v.is_default,
          isOutOfStock: !v.is_available || !item.is_available,
        })),
      optionGroups: (groups ?? [])
        .filter((g) => g.menu_item_id === item.id)
        .map((g) => ({
          id: g.id,
          title: g.name,
          description: null,
          quantityMinimum: g.min_select,
          quantityMaximum: g.max_select,
          appliesToKind: g.applies_to_kind,
          options: (options ?? [])
            .filter((o) => o.group_id === g.id)
            .map((o) => ({
              id: o.id,
              title: o.name,
              description: null,
              price: o.price_delta_fcfa,
              isAvailable: o.is_available,
            })),
        })),
    }));

    const menu: BouffMenu = {
      restaurant: {
        id: restaurant.id,
        slug: restaurant.slug,
        name: restaurant.name,
        tagline: restaurant.tagline,
        description: restaurant.description,
        logo: restaurant.logo_url,
        cover: restaurant.cover_url,
        brandColor: restaurant.brand_color,
        phone: restaurant.phone,
        whatsapp: restaurant.whatsapp_number,
        address: restaurant.address,
        city: restaurant.city,
        opensAt: restaurant.opens_at,
        closesAt: restaurant.closes_at,
        acceptsTakeaway: restaurant.accepts_takeaway,
        acceptsDelivery: restaurant.accepts_delivery,
      },
      categories: (categories.data ?? []).map((c) => ({
        id: c.id,
        name: c.name,
        description: c.description,
        image: c.image_url,
        items: mapped.filter((i) => i.categoryId === c.id && isVisible(i)),
      })),
      items: mapped.filter(isVisible),
      zones: (zones.data ?? []).map((z) => ({
        id: z.id,
        name: z.name,
        fee: z.fee_fcfa,
        cityId: z.city_id,
      })),
      cities: (cities.data ?? []).map((c) => ({
        id: c.id,
        name: c.name,
        isDefault: c.is_default,
        isActive: c.is_active,
      })),
    };

    cache = { at: Date.now(), menu };
    inflight = null;
    return menu;
  })();

  try {
    return await inflight;
  } catch (error) {
    inflight = null;
    throw error;
  }
}

// Un article programmé un jour précis (« Le Repas du Monde ») n'apparaît que ce jour-là.
function isVisible(item: BouffItem): boolean {
  if (item.availableWeekday === null || item.availableWeekday === undefined)
    return true;
  return new Date().getDay() === item.availableWeekday;
}

export function findItem(menu: BouffMenu, id: string): BouffItem | undefined {
  return menu.items.find((i) => i.id === id);
}

export function findVariant(
  menu: BouffMenu,
  variantId: string,
): { item: BouffItem; variant: BouffVariant } | undefined {
  for (const item of menu.items) {
    const variant = item.variations.find((v) => v.id === variantId);
    if (variant) return { item, variant };
  }
  return undefined;
}

export function optionById(menu: BouffMenu, optionId: string) {
  for (const item of menu.items) {
    for (const group of item.optionGroups) {
      const option = group.options.find((o) => o.id === optionId);
      if (option) return { item, group, option };
    }
  }
  return undefined;
}
