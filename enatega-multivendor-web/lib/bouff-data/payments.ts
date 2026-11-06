import { bouffDb } from "./supabase";
import { CONNECTION_ERROR, type PaymentReply } from "./payment-logic";
export class PaymentError extends Error {
  constructor(message: string, public code?: string) { super(message); }
}
export async function invokePayment(body: Record<string, unknown>): Promise<PaymentReply> {
  let result;
  try { result = await bouffDb().functions.invoke("feexpay", { body }); }
  catch { throw new PaymentError(CONNECTION_ERROR); }
  const { data, error } = result;
  if (error) {
    let payload: { message?: string; code?: string } | null = null;
    if (error.context instanceof Response) {
      try { payload = await error.context.clone().json(); } catch { /* Réponse non JSON. */ }
    }
    throw new PaymentError(payload?.message || CONNECTION_ERROR, payload?.code);
  }
  if (!data || data.ok !== true) throw new PaymentError(data?.message || CONNECTION_ERROR, data?.code);
  return data as PaymentReply;
}
