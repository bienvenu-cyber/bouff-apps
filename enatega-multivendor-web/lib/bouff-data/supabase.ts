import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { SUPABASE_PUBLISHABLE_KEY, SUPABASE_URL } from "./config";

let client: SupabaseClient | null = null;

export function bouffDb(): SupabaseClient {
  if (!client) {
    client = createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, {
      auth: {
        persistSession: typeof window !== "undefined",
        autoRefreshToken: typeof window !== "undefined",
        storageKey: "bouff-auth",
      },
    });
  }
  return client;
}

export async function currentUserId(): Promise<string | null> {
  const { data } = await bouffDb().auth.getUser();
  return data.user?.id ?? null;
}
