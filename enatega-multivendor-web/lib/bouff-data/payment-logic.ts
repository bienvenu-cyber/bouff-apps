export type Network = "mtn" | "moov" | "celtiis";
export type PaymentChoice = { method: "momo" | "card"; network: Network; payerPhone: string; email: string };
export function normalizePhone(input: string): string {
  let digits = input.replace(/[\s()+.-]/g, "");
  if (digits.startsWith("229")) digits = digits.slice(3);
  if (/^\d{8}$/.test(digits)) digits = `01${digits}`;
  return digits;
}
export const validPhone = (input: string) => /^01\d{8}$/.test(normalizePhone(input));
export function paymentPayload(choice: PaymentChoice) {
  if (choice.method === "card") {
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(choice.email.trim())) throw new Error("Renseignez un e-mail valide.");
    return { method: "card" as const, email: choice.email.trim() };
  }
  if (!["mtn", "moov", "celtiis"].includes(choice.network)) throw new Error("Choisissez un réseau.");
  if (!validPhone(choice.payerPhone)) throw new Error("Renseignez un numéro béninois valide : 01XXXXXXXX.");
  return { method: "momo" as const, network: choice.network, payerPhone: normalizePhone(choice.payerPhone) };
}
export interface PaymentReply {
  ok: boolean; code?: string; message?: string; paid?: boolean; orderStatus?: string;
  status?: "pending" | "successful" | "failed"; paymentUrl?: string; deadline?: string;
  payment?: { method: "momo" | "card"; network: Network | null; status: "pending" | "successful" | "failed"; reason: string | null; paymentUrl: string | null } | null;
}
export type PaymentState = "idle" | "pending" | "failed" | "confirmed" | "cancelled" | "network";
export function paymentState(reply: PaymentReply): PaymentState {
  if (reply.paid || (reply.orderStatus && !["awaiting_payment", "cancelled"].includes(reply.orderStatus))) return "confirmed";
  if (reply.orderStatus === "cancelled") return "cancelled";
  if (reply.code === "PAYMENT_IN_PROGRESS") return "pending";
  if (reply.payment?.status === "failed" || reply.status === "failed") return "failed";
  if (reply.payment || reply.status === "pending") return "pending";
  return "idle";
}
export const CONNECTION_ERROR = "Connexion impossible, vérifiez votre internet.";
