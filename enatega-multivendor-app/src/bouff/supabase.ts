import "react-native-url-polyfill/auto";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { AppState } from "react-native";
import { SUPABASE_PUBLISHABLE_KEY, SUPABASE_URL } from "./config";

let client: SupabaseClient | null = null;

export function bouffDb(): SupabaseClient {
  if (!client) {
    client = createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, {
      auth: {
        storage: AsyncStorage,
        storageKey: "bouff-customer-auth",
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

export async function currentUserId(): Promise<string | null> {
  const { data } = await bouffDb().auth.getSession();
  return data.session?.user.id ?? null;
}
