export type Method = 'momo' | 'card';
export type Network = 'mtn' | 'moov' | 'celtiis';
export type Snapshot = { paid?: boolean; orderStatus?: string; deadline?: string; cancelReason?: string | null; payment?: { status?: string; reason?: string | null; paymentUrl?: string | null } | null };
export type Input = { orderNumber: string; customerPhone: string; method: Method; network?: Network; payerPhone?: string; email?: string; firstName?: string; lastName?: string };
export function normalizePhone(value: string): string {
  const digits = value.replace(/[\s().+-]/g, '');
  return digits.startsWith('229') ? digits.slice(3) : digits;
}
export function validPhone(value: string): boolean { return /^01\d{8}$/.test(normalizePhone(value)); }
export function startPayload(input: Input) {
  const { method, orderNumber, customerPhone, firstName, lastName } = input;
  if (method !== 'momo' && method !== 'card') throw new Error('Choisissez un moyen de paiement.');
  const common = { action: 'start' as const, orderNumber, customerPhone, method, returnTo: 'app' as const, firstName, lastName };
  if (method === 'card') {
    const email = input.email?.trim() ?? '';
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new Error('Renseignez un e-mail valide.');
    return { ...common, email };
  }
  if (!['mtn', 'moov', 'celtiis'].includes(input.network ?? '')) throw new Error('Choisissez un réseau.');
  const payerPhone = normalizePhone(input.payerPhone || customerPhone);
  if (!validPhone(payerPhone)) throw new Error('Saisissez un numéro béninois de 10 chiffres commençant par 01.');
  return { ...common, network: input.network, payerPhone };
}
export function paymentState(data: Snapshot): 'waiting' | 'success' | 'failed' | 'cancelled' {
  if (data.orderStatus === 'cancelled') return 'cancelled';
  if (data.paid === true || (data.orderStatus && data.orderStatus !== 'awaiting_payment')) return 'success';
  if (data.payment?.status === 'failed') return 'failed';
  return 'waiting';
}
