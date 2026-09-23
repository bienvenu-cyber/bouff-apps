// Intégration pawaPay (Mobile Money) — prête à recevoir les clés.
// Variables attendues :
//   PAWAPAY_API_TOKEN      clé d'API pawaPay (sandbox ou production)
//   PAWAPAY_BASE_URL       https://api.sandbox.pawapay.io (défaut) ou https://api.pawapay.io
//   NEXT_PUBLIC_PAWAPAY_ENABLED=true  pour afficher le paiement en ligne au client

const BASE_URL =
  process.env.PAWAPAY_BASE_URL ?? "https://api.sandbox.pawapay.io";
const API_TOKEN = process.env.PAWAPAY_API_TOKEN ?? "";

export const isPawaPayConfigured = () => Boolean(API_TOKEN);

// Opérateurs Mobile Money au Bénin
export const CORRESPONDENTS = {
  MTN: "MTN_MOMO_BEN",
  MOOV: "MOOV_BEN",
} as const;

export type CorrespondentKey = keyof typeof CORRESPONDENTS;

export function correspondentFor(phone: string, hint?: string): string {
  if (hint && hint in CORRESPONDENTS) {
    return CORRESPONDENTS[hint as CorrespondentKey];
  }
  const digits = phone.replace(/\D/g, "").replace(/^229/, "");
  // MTN Bénin : 96/97/61/66/69 — Moov : 94/95/98/60/68
  return /^(9[67]|6[169])/.test(digits)
    ? CORRESPONDENTS.MTN
    : CORRESPONDENTS.MOOV;
}

export interface DepositRequest {
  depositId: string;
  amountFcfa: number;
  phone: string; // format international sans « + » : 229XXXXXXXX
  correspondent: string;
  statementDescription?: string;
}

export interface DepositResult {
  status: string;
  rejectionReason?: string | null;
  raw: unknown;
}

export async function requestDeposit(
  input: DepositRequest,
): Promise<DepositResult> {
  if (!isPawaPayConfigured()) {
    throw new Error("pawaPay non configuré (PAWAPAY_API_TOKEN manquante).");
  }

  const response = await fetch(`${BASE_URL}/deposits`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${API_TOKEN}`,
    },
    body: JSON.stringify({
      depositId: input.depositId,
      amount: String(Math.round(input.amountFcfa)),
      currency: "XOF",
      correspondent: input.correspondent,
      payer: {
        type: "MSISDN",
        address: { value: input.phone },
      },
      customerTimestamp: new Date().toISOString(),
      statementDescription: (
        input.statementDescription ?? "BOUFF"
      ).slice(0, 22),
    }),
    cache: "no-store",
  });

  const text = await response.text();
  if (!response.ok) throw new Error(`pawaPay ${response.status} : ${text}`);
  const raw = text ? JSON.parse(text) : {};
  return {
    status: raw.status ?? "SUBMITTED",
    rejectionReason: raw.rejectionReason?.rejectionMessage ?? null,
    raw,
  };
}

export async function fetchDeposit(depositId: string) {
  if (!isPawaPayConfigured()) {
    throw new Error("pawaPay non configuré (PAWAPAY_API_TOKEN manquante).");
  }
  const response = await fetch(`${BASE_URL}/deposits/${depositId}`, {
    headers: { Authorization: `Bearer ${API_TOKEN}` },
    cache: "no-store",
  });
  const text = await response.text();
  if (!response.ok) throw new Error(`pawaPay ${response.status} : ${text}`);
  return text ? JSON.parse(text) : null;
}

// pawaPay → état interne de la table des paiements
export function mapStatus(status?: string): string {
  switch ((status ?? "").toUpperCase()) {
    case "COMPLETED":
      return "completed";
    case "ACCEPTED":
      return "accepted";
    case "SUBMITTED":
    case "PROCESSING":
      return "submitted";
    case "FAILED":
    case "REJECTED":
      return "failed";
    case "CANCELLED":
      return "cancelled";
    default:
      return "pending";
  }
}
