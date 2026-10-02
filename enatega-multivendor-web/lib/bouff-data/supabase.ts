import { createBrowserClient } from "@supabase/ssr";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { SUPABASE_PUBLISHABLE_KEY, SUPABASE_URL } from "./config";

let client: SupabaseClient | null = null;

// Connexion gardée dans un cookie sécurisé (HTTPS uniquement, SameSite=Lax, 7 jours)
// au lieu du stockage local du navigateur. Une ancienne session est reprise une fois.
const SESSION_COOKIE = "bouff-auth";

function migrateLegacySession(c: SupabaseClient) {
  try {
    const raw = window.localStorage.getItem(SESSION_COOKIE);
    if (!raw) return;
    window.localStorage.removeItem(SESSION_COOKIE);
    const s = JSON.parse(raw);
    if (s?.access_token && s?.refresh_token) {
      void c.auth.setSession({ access_token: s.access_token, refresh_token: s.refresh_token });
    }
  } catch {
    /* ancienne session illisible : l'utilisateur se reconnecte */
  }
}

export function bouffDb(): SupabaseClient {
  if (!client) {
    if (typeof window === "undefined") {
      // Côté serveur : aucune session stockée.
      return createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, {
        auth: { persistSession: false, autoRefreshToken: false },
      });
    }
    client = createBrowserClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, {
      cookieOptions: {
        name: SESSION_COOKIE,
        path: "/",
        sameSite: "lax",
        secure: window.location.protocol === "https:",
        maxAge: 60 * 60 * 24 * 7,
      },
      auth: { detectSessionInUrl: false },
    }) as unknown as SupabaseClient;
    migrateLegacySession(client);
  }
  return client;
}

export async function currentUserId(): Promise<string | null> {
  const { data } = await bouffDb().auth.getUser();
  return data.user?.id ?? null;
}
