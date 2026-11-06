// Paiement FeexPay pour les apps client (site et appli mobile) :
// { action: "start" } lance ou relance un paiement, { action: "status" } suit son résultat.
import { NextResponse } from "next/server";
import { PaymentFail, paymentStatus, startPayment } from "@/lib/server/feexpay";

export const dynamic = "force-dynamic";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "content-type",
};

function reply(body: Record<string, unknown>, status = 200) {
  return NextResponse.json(body, { status, headers: { ...CORS, "Cache-Control": "no-store" } });
}

export function OPTIONS() {
  return new Response(null, { status: 204, headers: CORS });
}

export async function POST(request: Request) {
  try {
    let body: Record<string, unknown>;
    try {
      body = (await request.json()) as Record<string, unknown>;
    } catch {
      throw new PaymentFail(400, "BAD_REQUEST", "Requête invalide.");
    }
    if (body.action === "start") return reply(await startPayment(body, new URL(request.url).origin));
    if (body.action === "status") return reply(await paymentStatus(body));
    throw new PaymentFail(400, "BAD_REQUEST", "Action inconnue.");
  } catch (error) {
    if (error instanceof PaymentFail) return reply({ ok: false, code: error.code, message: error.message }, error.status);
    console.error("feexpay route error", error instanceof Error ? error.message : error);
    return reply({ ok: false, code: "SERVER_ERROR", message: "Le paiement est momentanément indisponible. Réessayez." }, 500);
  }
}
