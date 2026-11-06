// Appelée chaque minute par la veille de la base tant qu'un paiement est en attente.
// Sans danger si appelée par n'importe qui : elle ne fait que revérifier chez FeexPay
// (au plus une fois toutes les 20 s par paiement) et annuler les commandes expirées.
import { NextResponse } from "next/server";
import { reconcile } from "@/lib/server/feexpay";

export const dynamic = "force-dynamic";

async function run() {
  try {
    return NextResponse.json(await reconcile());
  } catch (error) {
    console.error("feexpay reconcile error", error instanceof Error ? error.message : error);
    return NextResponse.json({ ok: false }, { status: 503 });
  }
}

export const POST = run;
export const GET = run;
