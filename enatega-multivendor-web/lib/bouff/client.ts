"use client";

import { createClient } from "@supabase/supabase-js";

// Clé publiable : destinée au navigateur, protégée par les règles d'accès de la base.
const SUPABASE_URL = "https://txyqwlatzlkurjrnlxhe.supabase.co";
const SUPABASE_PUBLISHABLE_KEY = "sb_publishable_mL30STWaoMLv30cWEZnI8g_e_WZn8j3";

export const bouffDb = createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    storageKey: "bouff-auth",
  },
});

export const RESTAURANT_SLUG = "bouff";

export const fcfa = (value: number) =>
  `${new Intl.NumberFormat("fr-FR").format(Math.round(value || 0))} F`;

export const STATUS_LABEL: Record<string, string> = {
  received: "Reçue",
  in_kitchen: "En cuisine",
  ready: "Prête",
  on_the_way: "En route",
  delivered: "Livrée",
  cancelled: "Annulée",
};

export const RIDER_STATUS_LABEL: Record<string, string> = {
  offline: "Hors ligne",
  available: "Disponible",
  on_delivery: "En course",
};
