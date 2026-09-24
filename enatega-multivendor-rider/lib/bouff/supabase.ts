import "react-native-url-polyfill/auto";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { AppState } from "react-native";

// Base BOUFF (Lovable Cloud). La clé publique peut être dans le code :
// les droits sont contrôlés côté base (rôles + règles d'accès).
export const SUPABASE_URL =
  process.env.EXPO_PUBLIC_SUPABASE_URL ??
  "https://txyqwlatzlkurjrnlxhe.supabase.co";
export const SUPABASE_PUBLISHABLE_KEY =
  process.env.EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY ??
  "sb_publishable_mL30STWaoMLv30cWEZnI8g_e_WZn8j3";

export const IS_BOUFF = process.env.EXPO_PUBLIC_BOUFF !== "false";

let client: SupabaseClient | null = null;

export function bouffDb(): SupabaseClient {
  if (!client) {
    client = createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, {
      auth: {
        storage: AsyncStorage,
        storageKey: "bouff-rider-auth",
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: false,
      },
    });
    AppState.addEventListener("change", (state) => {
      if (state === "active") client?.auth.startAutoRefresh();
      else client?.auth.stopAutoRefresh();
    });
  }
  return client;
}
