// Démarre un paiement Mobile Money pawaPay pour une commande existante.
// Le montant n'est jamais fourni par le navigateur : il est relu en base.
import { NextResponse } from "next/server";
import { randomUUID } from "crypto";

import { PAYMENTS_TOKEN, callRpc } from "@/lib/server/bouff-service";
import {
  correspondentFor,
  isPawaPayConfigured,
  mapStatus,
  requestDeposit,
} from "@/lib/payments/pawapay";
import { normalizePhone } from "@/lib/notifications/whatsapp";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  try {
    if (!PAYMENTS_TOKEN) {
      return NextResponse.json(
        { error: "Service de paiement non configuré." },
        { status: 503 },
      );
    }
    if (!isPawaPayConfigured()) {
      return NextResponse.json(
        {
          error:
            "Le paiement Mobile Money en ligne n'est pas encore activé. Réglez à la remise.",
        },
        { status: 503 },
      );
    }

    const body = (await request.json()) as {
      orderNumber?: string;
      customerPhone?: string;
      payerPhone?: string;
      operator?: string;
    };

    if (!body.orderNumber || !body.customerPhone) {
      return NextResponse.json(
        { error: "Numéro de commande et téléphone requis." },
        { status: 400 },
      );
    }

    const order = await callRpc<{
      id: string;
      order_number: string;
      total_fcfa: number;
      status: string;
    }>("payment_order_lookup", {
      p_token: PAYMENTS_TOKEN,
      p_order_number: body.orderNumber,
      p_phone: body.customerPhone,
    });

    if (order.status === "cancelled") {
      return NextResponse.json(
        { error: "Cette commande est annulée." },
        { status: 409 },
      );
    }

    const payerPhone = normalizePhone(body.payerPhone || body.customerPhone);
    const correspondent = correspondentFor(payerPhone, body.operator);
    const depositId = randomUUID();

    await callRpc("record_payment_intent", {
      p_token: PAYMENTS_TOKEN,
      p_order_id: order.id,
      p_phone: payerPhone,
      p_amount: order.total_fcfa,
      p_provider_ref: depositId,
      p_correspondent: correspondent,
      p_provider: "pawapay",
    });

    try {
      const result = await requestDeposit({
        depositId,
        amountFcfa: order.total_fcfa,
        phone: payerPhone,
        correspondent,
        statementDescription: `BOUFF ${order.order_number}`,
      });

      await callRpc("update_payment_status", {
        p_token: PAYMENTS_TOKEN,
        p_provider_ref: depositId,
        p_status: mapStatus(result.status),
        p_failure_reason: result.rejectionReason,
        p_raw: result.raw,
      });

      return NextResponse.json({
        depositId,
        status: mapStatus(result.status),
        amountFcfa: order.total_fcfa,
        message:
          "Validez le paiement sur votre téléphone (code Mobile Money).",
      });
    } catch (error) {
      const detail = error instanceof Error ? error.message : String(error);
      await callRpc("update_payment_status", {
        p_token: PAYMENTS_TOKEN,
        p_provider_ref: depositId,
        p_status: "failed",
        p_failure_reason: detail,
        p_raw: null,
      });
      throw error;
    }
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error ? error.message : "Paiement impossible.",
      },
      { status: 500 },
    );
  }
}
