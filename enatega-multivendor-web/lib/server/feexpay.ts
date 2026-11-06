// Paiements en ligne BOUFF via FeexPay (Bénin uniquement), côté serveur.
// La clé privée FeexPay ne quitte jamais ce serveur. Le montant vient toujours
// de la commande enregistrée en base, jamais du téléphone ou du navigateur.
// Le statut renvoyé par FeexPay au lancement, l'URL de retour carte et les
// notifications (webhook) ne sont jamais crus sur parole : chaque résultat est
// revérifié auprès de FeexPay avant d'être appliqué à la commande.
import { callRpc } from "@/lib/server/bouff-service";
import { beninLocal, frenchReason } from "@/lib/server/feexpay-rules";

export { beninLocal, frenchReason };

export const NETWORK_PATH: Record<string, string> = { mtn: "mtn", moov: "moov", celtiis: "celtiis_bj" };
const NETWORK_LABEL: Record<string, string> = { mtn: "MTN", moov: "Moov", celtiis: "Celtiis" };
export const DEFAULT_WEB_ORIGIN = "https://bouff-apps.vercel.app";
export const APP_RETURN = "thebouffapp://payment-result";

type Json = Record<string, unknown>;
export type PaymentJson = {
  id: string; reference: string; method: string | null; network: string | null;
  status: "pending" | "successful" | "failed"; reason: string | null; paymentUrl: string | null;
  amount: number; createdAt: string; lastCheckedAt: string | null; returnTo: string | null; webOrigin: string | null;
};
export type OrderState = {
  id: string; orderNumber: string; status: string; total: number; paymentMethod: string; paid: boolean;
  deadline: string | null; cancelReason: string | null; customerName: string; customerPhone: string;
  latest: PaymentJson | null; successful: PaymentJson | null; hasPendingRecent: boolean;
};

export class PaymentFail extends Error {
  constructor(public status: number, public code: string, message: string) { super(message); }
}

const UNAVAILABLE = "Le paiement en ligne est momentanément indisponible. Choisissez Espèces ou réessayez plus tard.";

function config() {
  const key = process.env.FEEXPAY_API_KEY?.trim();
  const shop = process.env.FEEXPAY_SHOP_ID?.trim();
  const token = process.env.BOUFF_PAYMENTS_TOKEN?.trim();
  if (!key || !shop || !token) throw new PaymentFail(503, "NOT_CONFIGURED", UNAVAILABLE);
  const base = key.startsWith("test_key_") ? "https://sandbox-api.feexpay.me" : "https://api-v2.feexpay.me";
  return { key, shop, token, base };
}

async function db<T>(op: string, args: Json): Promise<T> {
  const { token } = config();
  try {
    return await callRpc<T>("feexpay_service", { p_token: token, p_op: op, p_args: args });
  } catch (error) {
    console.error(`feexpay_service ${op} failed`, error instanceof Error ? error.message : error);
    throw new PaymentFail(500, "SERVER_ERROR", "Le paiement est momentanément indisponible. Réessayez.");
  }
}

function cleanText(value: unknown, max: number): string {
  return String(value ?? "").normalize("NFD").replace(/[\u0300-\u036f]/g, "")
    .replace(/[^A-Za-z0-9 ]/g, " ").replace(/\s+/g, " ").trim().slice(0, max);
}

export function safeWebOrigin(value: unknown): string | null {
  const v = String(value ?? "").trim().replace(/\/+$/, "");
  if (v === DEFAULT_WEB_ORIGIN) return v;
  if (/^https:\/\/([a-z0-9-]+\.)*(lovable\.app|lovableproject\.com)$/i.test(v)) return v;
  if (/^http:\/\/localhost(:\d{2,5})?$/i.test(v)) return v;
  return null;
}

export const ORDER_NUMBER = /^[A-Za-z]{1,4}-?\d{1,8}$/;

async function feex(method: "GET" | "POST", path: string, body?: Json) {
  const { key, base } = config();
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 25_000);
  try {
    const res = await fetch(`${base}${path}`, {
      method,
      headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json", Accept: "application/json" },
      body: body ? JSON.stringify(body) : undefined,
      signal: ctrl.signal,
      cache: "no-store",
    });
    const text = await res.text();
    let data: Json | null = null;
    try { data = text ? (JSON.parse(text) as Json) : null; } catch { data = null; }
    if (!res.ok) console.error(`FeexPay ${method} ${path.split("/").slice(0, 6).join("/")} → ${res.status}: ${text.slice(0, 400)}`);
    return { status: res.status, data, text };
  } finally {
    clearTimeout(timer);
  }
}

/** Statut réel chez FeexPay (source de vérité). null = FeexPay injoignable ; "missing" = référence inconnue chez FeexPay. */
export async function liveStatus(reference: string) {
  try {
    const r = await feex("GET", `/api/transactions/public/single/status/${encodeURIComponent(reference)}`);
    if (r.status === 404) return "missing" as const;
    if (r.status < 200 || r.status >= 300 || !r.data) return null;
    const amount = Number(r.data.amount);
    return {
      status: String(r.data.status ?? "").toUpperCase(),
      amount: Number.isFinite(amount) ? Math.round(amount) : null,
      reason: frenchReason(r.data.reason),
      raw: r.data,
    };
  } catch (error) {
    console.error("FeexPay status unreachable", error instanceof Error ? error.message : error);
    return null;
  }
}

/** Revérifie une tentative auprès de FeexPay et applique le résultat (idempotent). */
export async function verify(reference: string): Promise<Json | null> {
  const live = await liveStatus(reference);
  if (!live || live === "missing") { await db("touch", { reference }); return live === "missing" ? { found: false, missing: true } : null; }
  return db<Json>("apply_result", { reference, status: live.status, amount: live.amount, reason: live.reason, raw: live.raw });
}

async function orderState(orderNumber: unknown, phone: unknown): Promise<OrderState> {
  const num = String(orderNumber ?? "").trim();
  if (!ORDER_NUMBER.test(num) || String(phone ?? "").replace(/\D/g, "").length < 8) {
    throw new PaymentFail(400, "BAD_REQUEST", "Numéro de commande ou téléphone manquant.");
  }
  const state = await db<OrderState | null>("order_state", { orderNumber: num, phone: String(phone) });
  if (!state) throw new PaymentFail(404, "ORDER_NOT_FOUND", "Commande introuvable. Vérifiez le numéro de commande et le téléphone.");
  return state;
}

function publicPayment(p: PaymentJson | null) {
  if (!p) return null;
  return {
    reference: p.reference, method: p.method, network: p.network, status: p.status,
    reason: p.status === "failed" ? frenchReason(p.reason) : null, paymentUrl: p.paymentUrl,
  };
}

function statusMessage(s: OrderState): string {
  if (s.status === "cancelled") return s.cancelReason ? `Commande annulée : ${s.cancelReason}` : "Commande annulée.";
  if (s.paid || s.status !== "awaiting_payment") return "Paiement confirmé, votre commande part en cuisine.";
  const p = s.latest;
  if (!p) return "Choisissez votre moyen de paiement.";
  if (p.status === "failed") return frenchReason(p.reason);
  if (p.method === "card") return "Paiement par carte en cours de vérification.";
  return `Validez le paiement sur votre téléphone (${NETWORK_LABEL[p.network ?? ""] ?? "Mobile Money"}). Ne communiquez jamais votre code secret.`;
}

export async function paymentStatus(body: Json) {
  let s = await orderState(body.orderNumber, body.customerPhone);
  const p = s.latest;
  if (s.status === "awaiting_payment" && p?.status === "pending") {
    const last = p.lastCheckedAt ? Date.parse(p.lastCheckedAt) : 0;
    if (Date.now() - last > 4_000) await verify(p.reference);
  }
  if (s.status === "awaiting_payment" && s.deadline && Date.parse(s.deadline) < Date.now()) {
    await db("expire", { graceMinutes: 0 });
  }
  s = await orderState(body.orderNumber, body.customerPhone);
  return {
    ok: true, orderStatus: s.status, paid: s.paid, deadline: s.deadline, cancelReason: s.cancelReason,
    payment: publicPayment(s.latest), message: statusMessage(s),
  };
}

export async function startPayment(body: Json, serverOrigin: string) {
  const method = String(body.method ?? "");
  if (method !== "momo" && method !== "card") throw new PaymentFail(400, "BAD_REQUEST", "Choisissez Mobile Money ou carte bancaire.");
  const returnTo = body.returnTo === "app" ? "app" : "web";
  const webOrigin = returnTo === "web" ? safeWebOrigin(body.webOrigin) : null;
  const { shop } = config();

  let s = await orderState(body.orderNumber, body.customerPhone);
  const ensureOpen = () => {
    if (s.status === "cancelled") {
      throw new PaymentFail(409, "ORDER_CLOSED", s.cancelReason ? `Cette commande est annulée : ${s.cancelReason}` : "Cette commande est annulée.");
    }
    if (s.paid || s.status !== "awaiting_payment") throw new PaymentFail(409, "ALREADY_PAID", "Cette commande est déjà payée.");
  };
  ensureOpen();

  // Une tentative est déjà en cours : on demande son vrai statut avant d'en lancer une autre.
  if (s.latest?.status === "pending") {
    await verify(s.latest.reference);
    s = await orderState(body.orderNumber, body.customerPhone);
    ensureOpen();
    const p = s.latest;
    if (p?.status === "pending") {
      const age = Date.now() - Date.parse(p.createdAt);
      if (p.method === "momo" && age < 3 * 60_000) {
        throw new PaymentFail(409, "PAYMENT_IN_PROGRESS",
          "Un paiement Mobile Money attend déjà votre validation sur le téléphone. Validez-le ou attendez son résultat.");
      }
      if (p.method === "card" && method === "card" && p.paymentUrl && age < 15 * 60_000) {
        return { ok: true, reference: p.reference, status: "pending", orderStatus: s.status, paid: false,
          paymentUrl: p.paymentUrl, message: "Terminez le paiement sur la page sécurisée FeexPay." };
      }
    }
  }
  if (s.deadline && Date.parse(s.deadline) < Date.now()) {
    throw new PaymentFail(409, "ORDER_CLOSED", "Le délai de paiement de 10 minutes est dépassé : la commande va être annulée.");
  }

  const amount = Math.round(Number(s.total));
  if (!(amount >= 100 && amount <= 2_000_000)) {
    throw new PaymentFail(400, "AMOUNT_OUT_OF_RANGE", "Le paiement en ligne accepte de 100 F à 2 000 000 F. Choisissez Espèces.");
  }

  const [first, ...rest] = cleanText(s.customerName, 60).split(" ");
  const firstName = cleanText(body.firstName, 40) || first || "Client";
  const lastName = cleanText(body.lastName, 40) || rest.join(" ") || "BOUFF";
  const description = cleanText(`Commande ${s.orderNumber.replace(/-/g, "")}`, 40);

  let network: string | null = null;
  let payer: string | null;
  let path: string;
  let payload: Json;
  if (method === "momo") {
    network = String(body.network ?? "").toLowerCase();
    if (!NETWORK_PATH[network]) throw new PaymentFail(400, "INVALID_NETWORK", "Choisissez un réseau : MTN, Moov ou Celtiis.");
    payer = beninLocal(body.payerPhone || s.customerPhone);
    if (!payer) {
      throw new PaymentFail(400, "INVALID_PHONE", "Numéro Mobile Money invalide : saisissez un numéro béninois de 10 chiffres commençant par 01.");
    }
    path = `/api/transactions/public/requesttopay/${NETWORK_PATH[network]}`;
    payload = { shop, amount, phoneNumber: `229${payer}`, first_name: firstName, last_name: lastName, description, callback_info: s.id };
  } else {
    const email = String(body.email ?? "").trim();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email) || email.length > 120) {
      throw new PaymentFail(400, "EMAIL_REQUIRED", "Renseignez une adresse e-mail valide pour recevoir le reçu de paiement.");
    }
    payer = beninLocal(s.customerPhone) ?? beninLocal(body.payerPhone);
    const back = `${serverOrigin}/api/payments/feexpay/return/${returnTo}/${encodeURIComponent(s.orderNumber)}`;
    path = "/api/transactions/public/requesttopay/init";
    payload = {
      shop, amount: String(amount), currency: "XOF", first_name: firstName, last_name: lastName, email,
      phoneNumber: payer ? `229${payer}` : "2290100000000", city: "Parakou", zip: "00229", country: "BJ",
      return_url: back, cancel_url: back, description, callback_info: s.id,
    };
  }

  let r: Awaited<ReturnType<typeof feex>>;
  try {
    r = await feex("POST", path, payload);
  } catch (error) {
    console.error("FeexPay unreachable on start", error instanceof Error ? error.message : error);
    throw new PaymentFail(502, "PROVIDER_ERROR", "Le service de paiement ne répond pas. Réessayez dans un instant.");
  }
  const reference = String(r.data?.reference ?? "").trim();
  if (r.status < 200 || r.status >= 300 || !reference) {
    const text = r.text.toLowerCase();
    if (method === "card" && (r.status === 401 || r.status === 403 || /kyb|card|carte|not.?(enabled|activ)/.test(text))) {
      throw new PaymentFail(409, "CARD_UNAVAILABLE", "Le paiement par carte n'est pas encore disponible. Choisissez Mobile Money ou Espèces.");
    }
    if (r.status === 401 || /api_key|unauthori/.test(text)) throw new PaymentFail(503, "NOT_CONFIGURED", UNAVAILABLE);
    if (/phone|num[eé]ro/.test(text)) {
      throw new PaymentFail(400, "INVALID_PHONE", "Ce numéro n'est pas accepté par ce réseau. Vérifiez le numéro et le réseau choisis.");
    }
    if (/shop|merchant/.test(text)) throw new PaymentFail(503, "NOT_CONFIGURED", UNAVAILABLE);
    throw new PaymentFail(502, "PROVIDER_ERROR", "Le paiement n'a pas pu être lancé. Réessayez ou choisissez un autre moyen de paiement.");
  }

  const initial = String(r.data?.status ?? "PENDING").toUpperCase();
  const paymentUrl = method === "card" ? String(r.data?.payment_url ?? "") || null : null;
  if (method === "card" && !paymentUrl) {
    throw new PaymentFail(502, "PROVIDER_ERROR", "La page de paiement par carte n'a pas pu être ouverte. Réessayez.");
  }
  await db("record_attempt", {
    orderId: s.id, reference, method, network, phone: payer ?? "", amount,
    // Un échec immédiat est enregistré tel quel ; un succès immédiat est revérifié juste après.
    status: initial === "FAILED" ? "FAILED" : null,
    reason: frenchReason(r.data?.reason), paymentUrl,
    expiresAt: r.data?.expires_at ? String(r.data.expires_at) : null,
    returnTo, webOrigin, raw: r.data,
  });
  if (initial === "SUCCESSFUL") await verify(reference);

  s = await orderState(body.orderNumber, body.customerPhone);
  const p = s.latest;
  return {
    ok: true, reference, status: p?.status ?? "pending", orderStatus: s.status, paid: s.paid,
    paymentUrl: paymentUrl ?? undefined,
    message: p?.status === "failed" ? frenchReason(p.reason)
      : method === "card" ? "Terminez le paiement sur la page sécurisée FeexPay."
      : statusMessage(s),
  };
}

/** Notification FeexPay : on ne lit que la référence, puis on demande le vrai statut à FeexPay. */
export async function handleWebhook(body: Json): Promise<{ status: number; body: Json }> {
  const reference = String(body.reference ?? body.order_id ?? "").trim();
  if (!reference || reference.length > 100) return { status: 200, body: { ok: true, ignored: true } };
  const result = await verify(reference);
  if (result === null) return { status: 503, body: { ok: false, retry: true } }; // FeexPay injoignable : un nouvel essai viendra
  if (result.found === false) {
    // Paiement lancé mais réponse perdue (coupure réseau) : on le rattache à sa commande via callback_info.
    const orderId = typeof body.callback_info === "string" ? body.callback_info : "";
    if (/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(orderId)) {
      const [live, order] = await Promise.all([
        liveStatus(reference),
        db<{ id: string; total: number } | null>("order_by_id", { orderId }),
      ]);
      if (live && live !== "missing" && order) {
        await db("record_attempt", {
          orderId: order.id, reference, method: /card|carte|visa|master/i.test(String(body.reseau ?? "")) ? "card" : "momo",
          network: null, phone: beninLocal(body.phoneNumber) ?? "", amount: Math.max(1, Number(order.total) || 1),
          status: null, reason: null, paymentUrl: null, expiresAt: null, returnTo: null, webOrigin: null, raw: body,
        });
        await db("apply_result", { reference, status: live.status, amount: live.amount, reason: live.reason, raw: live.raw });
      }
    }
  }
  return { status: 200, body: { ok: true } };
}

/** Revérifie les paiements en attente puis annule les commandes non payées après 10 minutes. */
export async function reconcile() {
  const refs = await db<string[]>("pending", { limit: 25 });
  let checked = 0;
  for (let i = 0; i < refs.length; i += 5) {
    await Promise.all(refs.slice(i, i + 5).map(async (ref) => { await verify(ref); checked += 1; }));
  }
  const expired = await db<number>("expire", { graceMinutes: 0 });
  return { ok: true, checked, expired };
}

/** Retour après la page carte : on revérifie, puis on renvoie vers le suivi (site) ou l'appli. */
export async function returnLocation(target: string, orderNumber: string, ref: string | null): Promise<string> {
  let origin = DEFAULT_WEB_ORIGIN;
  if (ref && /^[A-Za-z0-9-]{6,80}$/.test(ref)) {
    try {
      const result = await verify(ref);
      const p = (result?.payment ?? null) as PaymentJson | null;
      const allowed = safeWebOrigin(p?.webOrigin);
      if (allowed) origin = allowed;
    } catch (error) {
      console.error("return verify failed", error instanceof Error ? error.message : error);
    }
  }
  const safeNumber = ORDER_NUMBER.test(orderNumber) ? orderNumber : "";
  if (target === "app") return `${APP_RETURN}?order=${encodeURIComponent(safeNumber)}`;
  return safeNumber ? `${origin}/order/${encodeURIComponent(safeNumber)}/tracking` : origin;
}
