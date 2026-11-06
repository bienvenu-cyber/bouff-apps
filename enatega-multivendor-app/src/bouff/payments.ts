import { bouffDb } from './supabase';
export const CONNECTION_ERROR = 'Connexion impossible, vérifiez votre internet.';
export class PaymentError extends Error {
  constructor(message: string, public code?: string) { super(message); this.name = 'PaymentError'; }
}
export async function invokePayment(body: Record<string, unknown>): Promise<any> {
  try {
    const { data, error } = await bouffDb().functions.invoke('feexpay', { body });
    if (error) {
      let detail: any;
      try { detail = await error.context?.clone().json(); } catch { /* Réponse réseau non JSON. */ }
      throw new PaymentError(detail?.message || CONNECTION_ERROR, detail?.code);
    }
    if (!data || data.ok !== true) throw new PaymentError(data?.message || CONNECTION_ERROR, data?.code);
    return data;
  } catch (error) {
    if (error instanceof PaymentError) throw error;
    throw new PaymentError(CONNECTION_ERROR);
  }
}
export async function cancelPaymentOrder(orderNumber: string, customerPhone: string) {
  try {
    const { data, error } = await bouffDb().rpc('cancel_my_order', { p_order_number: orderNumber, p_phone: customerPhone });
    if (error) throw new PaymentError(error.message);
    if (data?.error) throw new PaymentError(data.message || data.error);
    return data;
  } catch (error) {
    if (error instanceof PaymentError) throw error;
    throw new PaymentError(CONNECTION_ERROR);
  }
}
