// Notification FeexPay (à configurer dans le tableau de bord FeexPay → Webhooks).
// Le contenu reçu n'est jamais cru : seule la référence est lue, puis revérifiée chez FeexPay.
import { NextResponse } from "next/server";
import { handleWebhook, PaymentFail } from "@/lib/server/feexpay";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  let body: Record<string, unknown> = {};
  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ ok: true, ignored: true });
  }
  try {
    const result = await handleWebhook(body);
    return NextResponse.json(result.body, { status: result.status });
  } catch (error) {
    const status = error instanceof PaymentFail && error.status < 500 ? 200 : 503;
    console.error("feexpay webhook error", error instanceof Error ? error.message : error);
    return NextResponse.json({ ok: false }, { status });
  }
}
