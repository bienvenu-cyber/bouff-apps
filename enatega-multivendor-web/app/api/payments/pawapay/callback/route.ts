// Retour d'état pawaPay (callback). À renseigner dans le tableau de bord
// pawaPay : https://votre-domaine/api/payments/pawapay/callback
// L'état reçu est toujours revérifié auprès de pawaPay avant enregistrement.
import { NextResponse } from "next/server";

import { PAYMENTS_TOKEN, callRpc } from "@/lib/server/bouff-service";
import { fetchDeposit, mapStatus } from "@/lib/payments/pawapay";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  try {
    if (!PAYMENTS_TOKEN) {
      return NextResponse.json({ error: "non configuré" }, { status: 503 });
    }
    const body = (await request.json()) as {
      depositId?: string;
      status?: string;
    };
    const depositId = body.depositId;
    if (!depositId) {
      return NextResponse.json({ error: "depositId manquant" }, { status: 400 });
    }

    let status = mapStatus(body.status);
    let reason: string | null = null;
    let raw: unknown = body;

    // Vérification côté pawaPay : on ne fait pas confiance au corps reçu.
    try {
      const verified = await fetchDeposit(depositId);
      const entry = Array.isArray(verified) ? verified[0] : verified;
      if (entry) {
        status = mapStatus(entry.status);
        reason = entry.failureReason?.failureMessage ?? null;
        raw = entry;
      }
    } catch {
      /* on garde l'état annoncé si la vérification échoue */
    }

    await callRpc("update_payment_status", {
      p_token: PAYMENTS_TOKEN,
      p_provider_ref: depositId,
      p_status: status,
      p_failure_reason: reason,
      p_raw: raw,
    });

    return NextResponse.json({ ok: true, status });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "callback échoué" },
      { status: 500 },
    );
  }
}
