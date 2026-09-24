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

export function bouffDb(): SupabaseClient {
  if (!client) {
    client = createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, {
      auth: {
        storageKey: 'bouff-admin-auth',
        persistSession: typeof window !== 'undefined',
        autoRefreshToken: typeof window !== 'undefined',
        detectSessionInUrl: false,
      },
    });
  }
  return client;
}

/**
 * Crée (ou retrouve) un compte pour un membre de l'équipe, sans toucher
 * à la session de l'admin connecté.
 */
export async function createStaffAccount(
  email: string,
  password?: string
): Promise<string> {
  const clean = email.trim().toLowerCase();
  const existing = await bouffDb().rpc('admin_find_user', { p_email: clean });
  if (existing.data) return existing.data as string;
  if (!password || password.length < 6) {
    throw new Error('Mot de passe requis (6 caractères minimum) pour un nouveau compte.');
  }
  const temp = createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false, storageKey: 'bouff-admin-temp' },
  });
  const { data, error } = await temp.auth.signUp({ email: clean, password });
  if (error) throw new Error(error.message);
  const id = data.user?.id;
  if (!id) throw new Error('Création du compte impossible.');
  return id;
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
