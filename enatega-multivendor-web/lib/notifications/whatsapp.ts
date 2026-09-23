// Envoi WhatsApp via wapiway.tech
// Il ne manque que la clé d'API : WAPIWAY_API_KEY (+ éventuellement
// WAPIWAY_INSTANCE_ID et WAPIWAY_BASE_URL si votre compte les impose).

const BASE_URL = process.env.WAPIWAY_BASE_URL ?? "https://api.wapiway.tech";
const API_KEY = process.env.WAPIWAY_API_KEY ?? "";
const INSTANCE_ID = process.env.WAPIWAY_INSTANCE_ID ?? "";
const DEFAULT_COUNTRY_CODE = process.env.BOUFF_PHONE_COUNTRY_CODE ?? "229";

export const isWhatsAppConfigured = () => Boolean(API_KEY);

// 97 00 00 00 → 22997000000
export function normalizePhone(raw: string): string {
  const digits = (raw ?? "").replace(/\D/g, "");
  if (!digits) return "";
  if (digits.startsWith("00")) return digits.slice(2);
  if (digits.startsWith(DEFAULT_COUNTRY_CODE)) return digits;
  return `${DEFAULT_COUNTRY_CODE}${digits.replace(/^0+/, "")}`;
}

export async function sendWhatsApp(to: string, message: string) {
  if (!isWhatsAppConfigured()) {
    throw new Error("WhatsApp non configuré (WAPIWAY_API_KEY manquante).");
  }
  const phone = normalizePhone(to);
  if (!phone) throw new Error("Numéro WhatsApp invalide.");

  const response = await fetch(`${BASE_URL}/v1/messages/text`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${API_KEY}`,
    },
    body: JSON.stringify({
      ...(INSTANCE_ID ? { instanceId: INSTANCE_ID } : {}),
      to: phone,
      type: "text",
      text: message,
    }),
    cache: "no-store",
  });

  const body = await response.text();
  if (!response.ok) {
    throw new Error(`wapiway ${response.status} : ${body}`);
  }
  return body;
}
