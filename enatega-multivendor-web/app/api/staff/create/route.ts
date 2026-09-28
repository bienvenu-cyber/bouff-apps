// Crée (ou confirme) le compte d'un membre de l'équipe BOUFF, sans e-mail de
// confirmation. Réservé aux admins : l'appelant (jeton de l'admin connecté) doit
// être super-admin ou gérant d'un restaurant, vérifié en base.
import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export const dynamic = "force-dynamic";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const reply = (body: unknown, status = 200) =>
  NextResponse.json(body, { status, headers: { ...CORS, "Cache-Control": "no-store" } });

export async function OPTIONS() {
  return new Response(null, { status: 204, headers: CORS });
}

export async function POST(request: Request) {
  const url = process.env["SUPABASE_URL"] ?? process.env["NEXT_PUBLIC_SUPABASE_URL"];
  const anon =
    process.env["SUPABASE_PUBLISHABLE_KEY"] ?? process.env["NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY"];
  const service = process.env["SUPABASE_SERVICE_ROLE_KEY"];
  if (!url || !anon || !service) return reply({ error: "Service non configuré" }, 503);

  const auth = request.headers.get("authorization") ?? "";
  if (!auth.startsWith("Bearer ")) return reply({ error: "Non connecté" }, 401);

  const opts = { auth: { persistSession: false, autoRefreshToken: false } };
  const caller = createClient(url, anon, { ...opts, global: { headers: { Authorization: auth } } });
  const { data: access, error: accessErr } = await caller.rpc("admin_my_access");
  const a = access as { is_super_admin?: boolean; restaurants?: unknown[] } | null;
  if (accessErr || !a || (!a.is_super_admin && !a.restaurants?.length)) {
    return reply({ error: "Accès réservé aux administrateurs" }, 403);
  }

  let body: { email?: unknown; password?: unknown };
  try {
    body = await request.json();
  } catch {
    return reply({ error: "Requête invalide" }, 400);
  }
  const email = String(body.email ?? "").trim().toLowerCase();
  const password = body.password ? String(body.password) : "";
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 200) {
    return reply({ error: "E-mail invalide" }, 400);
  }
  if (password && (password.length < 6 || password.length > 72)) {
    return reply({ error: "Mot de passe : 6 à 72 caractères" }, 400);
  }

  const admin = createClient(url, service, opts);
  const { data: existingId } = await caller.rpc("admin_find_user", { p_email: email });

  if (existingId) {
    // Compte existant : on le confirme (et on change le mot de passe si fourni).
    const { error } = await admin.auth.admin.updateUserById(existingId as string, {
      email_confirm: true,
      ...(password ? { password } : {}),
    });
    if (error) return reply({ error: "Mise à jour du compte impossible" }, 400);
    return reply({ id: existingId, created: false });
  }

  if (!password) return reply({ error: "Mot de passe requis (6 caractères minimum)" }, 400);
  const { data, error } = await admin.auth.admin.createUser({ email, password, email_confirm: true });
  if (error || !data.user) return reply({ error: error?.message ?? "Création impossible" }, 400);
  return reply({ id: data.user.id, created: true });
}
