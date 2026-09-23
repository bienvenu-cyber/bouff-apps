// Accès serveur à la base BOUFF pour les services internes
// (envoi des notifications, paiements Mobile Money).
// Les fonctions appelées sont protégées par une clé de service côté base :
// aucune donnée n'est accessible sans cette clé.

import {
  SUPABASE_PUBLISHABLE_KEY,
  SUPABASE_URL,
} from "@/lib/bouff-data/config";

export const NOTIFICATIONS_TOKEN = process.env.BOUFF_NOTIFICATIONS_TOKEN ?? "";
export const PAYMENTS_TOKEN = process.env.BOUFF_PAYMENTS_TOKEN ?? "";

export async function callRpc<T = unknown>(
  fn: string,
  args: Record<string, unknown>,
): Promise<T> {
  const response = await fetch(`${SUPABASE_URL}/rest/v1/rpc/${fn}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      apikey: SUPABASE_PUBLISHABLE_KEY,
      Authorization: `Bearer ${SUPABASE_PUBLISHABLE_KEY}`,
    },
    body: JSON.stringify(args),
    cache: "no-store",
  });
  const text = await response.text();
  if (!response.ok) {
    throw new Error(`${fn} a échoué (${response.status}) : ${text}`);
  }
  return (text ? JSON.parse(text) : null) as T;
}
