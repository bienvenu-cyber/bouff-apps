// Déclenche l'envoi des messages en attente (WhatsApp / e-mail).
// À appeler toutes les minutes par un planificateur (cron), avec l'en-tête
// `x-bouff-cron-secret` égal à BOUFF_CRON_SECRET.
import { NextResponse } from "next/server";
import { dispatchNotifications } from "@/lib/notifications/dispatch";

export const dynamic = "force-dynamic";

function authorized(request: Request) {
  const secret = process.env.BOUFF_CRON_SECRET ?? "";
  if (!secret) return false;
  const header =
    request.headers.get("x-bouff-cron-secret") ??
    request.headers.get("authorization")?.replace(/^Bearer\s+/i, "") ??
    "";
  return header === secret;
}

async function run(request: Request) {
  if (!authorized(request)) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  try {
    const url = new URL(request.url);
    const limit = Number(url.searchParams.get("limit") ?? 20);
    const report = await dispatchNotifications(
      Number.isFinite(limit) ? limit : 20,
    );
    return NextResponse.json(report);
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "échec de l'envoi" },
      { status: 500 },
    );
  }
}

export const GET = run;
export const POST = run;
