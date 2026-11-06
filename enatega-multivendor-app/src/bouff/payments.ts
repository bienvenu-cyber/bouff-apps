// Appels au serveur de paiement FeexPay (hébergé avec le site client BOUFF).
import { bouffDb } from "./supabase";
import { MEDIA_BASE_URL } from "./config";

export const CONNECTION_ERROR = "Connexion impossible, vérifiez votre internet.";
const PAYMENT_URL = `${MEDIA_BASE_URL}/api/payments/feexpay`;

export class PaymentError extends Error {
  constructor(message: string, public code?: string) {
    super(message);
    this.name = "PaymentError";
  }
}

export async function invokePayment(body: Record<string, unknown>): Promise<any> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 40000);
  let response: Response;
  try {
    response = await fetch(PAYMENT_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify(body),
      signal: controller.signal,
    });
  } catch {
    throw new PaymentError(CONNECTION_ERROR);
  } finally {
    clearTimeout(timer);
  }
  let data: any = null;
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

export async function cancelPaymentOrder(orderNumber: string, customerPhone: string) {
  try {
    const { data, error } = await bouffDb().rpc("cancel_my_order", {
      p_order_number: orderNumber,
      p_phone: customerPhone,
    });
    if (error) throw new PaymentError(error.message);
    return data;
  } catch (error) {
    if (error instanceof PaymentError) throw error;
    throw new PaymentError(CONNECTION_ERROR);
  }
}
