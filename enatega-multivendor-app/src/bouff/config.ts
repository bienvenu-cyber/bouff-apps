// Configuration de la passerelle BOUFF de l'app mobile client.
// L'app continue de parler « GraphQL Enatega », mais les réponses viennent
// de la base BOUFF (Lovable Cloud). La clé publique peut être dans le code :
// les droits sont contrôlés côté base.

export const SUPABASE_URL =
  process.env.EXPO_PUBLIC_SUPABASE_URL ??
  "https://txyqwlatzlkurjrnlxhe.supabase.co";

export const SUPABASE_PUBLISHABLE_KEY =
  process.env.EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY ??
  "sb_publishable_mL30STWaoMLv30cWEZnI8g_e_WZn8j3";

export const RESTAURANT_SLUG =
  process.env.EXPO_PUBLIC_BOUFF_RESTAURANT_SLUG ?? "bouff";

export const IS_BOUFF = process.env.EXPO_PUBLIC_BOUFF !== "false";

export const CURRENCY = "XOF";
export const CURRENCY_SYMBOL = "FCFA";

export const CART_STORAGE_KEY = "bouff/cart";
export const ZONE_STORAGE_KEY = "bouff/delivery-zone";
export const GUEST_STORAGE_KEY = "bouff/guest";
export const ADDRESSES_STORAGE_KEY = "bouff/addresses";

// Adresse du site client qui sert les photos du menu (chemins « /bouff/... »).
export const MEDIA_BASE_URL = (
  process.env.EXPO_PUBLIC_BOUFF_WEB_URL ?? "https://bouff-apps.vercel.app"
).replace(/\/$/, "");
