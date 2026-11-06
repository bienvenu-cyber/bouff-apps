// Appels au serveur de paiement FeexPay du site (même origine).
import { CONNECTION_ERROR, type PaymentReply } from "./payment-logic";

export class PaymentError extends Error {
  constructor(message: string, public code?: string) {
    super(message);
    this.name = "PaymentError";
  }
}

export async function invokePayment(body: Record<string, unknown>): Promise<PaymentReply> {
  let response: Response;
  try {
    response = await fetch("/api/payments/feexpay", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
      cache: "no-store",
    });
  } catch {
    throw new PaymentError(CONNECTION_ERROR);
  }
  let data: (PaymentReply & { code?: string; message?: string }) | null = null;
  try {
    data = await response.json();
  } catch {
    data = null;
  }
  if (!response.ok || !data || data.ok !== true) {
    throw new PaymentError(data?.message || CONNECTION_ERROR, data?.code);
  }
  return data;
}
