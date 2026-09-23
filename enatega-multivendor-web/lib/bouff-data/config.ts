// Configuration de la passerelle de données BOUFF.
// Le site continue de parler « GraphQL Enatega », mais les réponses viennent
// désormais de la base BOUFF (Lovable Cloud).

export const SUPABASE_URL =
  process.env.NEXT_PUBLIC_SUPABASE_URL ??
  "https://txyqwlatzlkurjrnlxhe.supabase.co";

export const SUPABASE_PUBLISHABLE_KEY =
  process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ??
  "sb_publishable_mL30STWaoMLv30cWEZnI8g_e_WZn8j3";

export const RESTAURANT_SLUG =
  process.env.NEXT_PUBLIC_BOUFF_RESTAURANT_SLUG ?? "bouff";

export const CURRENCY = "XOF";
export const CURRENCY_SYMBOL = "FCFA";

// Clés de stockage local (panier, zone de livraison choisie)
export const CART_STORAGE_KEY = "bouff/cart";
export const ZONE_STORAGE_KEY = "bouff/delivery-zone";
export const GUEST_STORAGE_KEY = "bouff/guest";
