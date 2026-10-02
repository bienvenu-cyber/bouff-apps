import { createBrowserClient } from '@supabase/ssr';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';

// Base BOUFF (Lovable Cloud). La clé publique peut être dans le code :
// les droits sont contrôlés côté base (rôles + règles d'accès).
export const SUPABASE_URL =
  process.env.NEXT_PUBLIC_SUPABASE_URL ??
  'https://txyqwlatzlkurjrnlxhe.supabase.co';
export const SUPABASE_PUBLISHABLE_KEY =
  process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ??
  'sb_publishable_mL30STWaoMLv30cWEZnI8g_e_WZn8j3';

export const IS_BOUFF = process.env.NEXT_PUBLIC_BOUFF !== 'false';
export const IMAGES_BUCKET = 'bouff-images';

let client: SupabaseClient | null = null;

// Connexion gardée dans un cookie sécurisé (HTTPS uniquement, SameSite=Lax, 7 jours)
// au lieu du stockage local du navigateur. Une ancienne session est reprise une fois.
const SESSION_COOKIE = 'bouff-admin-auth';

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
    if (typeof window === 'undefined') {
      // Côté serveur : aucune session stockée.
      return createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, {
        auth: { persistSession: false, autoRefreshToken: false },
      });
    }
    client = createBrowserClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, {
      cookieOptions: {
        name: SESSION_COOKIE,
        path: '/',
        sameSite: 'lax',
        secure: window.location.protocol === 'https:',
        maxAge: 60 * 60 * 24 * 7,
      },
      auth: { detectSessionInUrl: false },
    }) as unknown as SupabaseClient;
    migrateLegacySession(client);
  }
  return client;
}

/**
 * Crée (ou retrouve) un compte pour un membre de l'équipe, sans toucher
 * à la session de l'admin connecté.
 */
const STAFF_API_URL = (
  process.env.NEXT_PUBLIC_BOUFF_STAFF_API_URL ?? 'https://bouff-web.lovable.app'
).replace(/\/$/, '');

/**
 * Crée (ou retrouve) un compte pour un membre de l'équipe, déjà confirmé
 * (pas d'e-mail à valider), sans toucher à la session de l'admin connecté.
 */
export async function createStaffAccount(
  email: string,
  password?: string
): Promise<string> {
  const clean = email.trim().toLowerCase();
  const { data: session } = await bouffDb().auth.getSession();
  const token = session.session?.access_token;
  if (!token) throw new Error('Session expirée : reconnectez-vous.');
  let res: Response;
  try {
    res = await fetch(`${STAFF_API_URL}/api/staff/create`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ email: clean, password: password || undefined }),
    });
  } catch {
    throw new Error('Serveur BOUFF injoignable. Vérifiez la connexion.');
  }
  const body = (await res.json().catch(() => ({}))) as { id?: string; error?: string };
  if (!res.ok || !body.id) throw new Error(body.error ?? 'Création du compte impossible.');
  return body.id;
}

/** Envoie une image (data URL) dans l'espace photos et renvoie un lien durable. */
export async function uploadImage(dataUrl: string): Promise<string> {
  if (/^https?:\/\//.test(dataUrl)) return dataUrl;
  const match = /^data:([^;]+);base64,(.*)$/.exec(dataUrl);
  if (!match) throw new Error('Image invalide.');
  const [, mime, b64] = match;
  const bin = atob(b64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  const ext = (mime.split('/')[1] || 'jpg').replace('jpeg', 'jpg');
  const path = `${new Date().getFullYear()}/${crypto.randomUUID()}.${ext}`;
  const db = bouffDb();
  const up = await db.storage.from(IMAGES_BUCKET).upload(path, bytes, {
    contentType: mime,
    upsert: false,
  });
  if (up.error) throw new Error(up.error.message);
  const signed = await db.storage
    .from(IMAGES_BUCKET)
    .createSignedUrl(path, 60 * 60 * 24 * 365 * 10);
  if (signed.error || !signed.data) throw new Error('Lien de l’image indisponible.');
  return signed.data.signedUrl;
}
