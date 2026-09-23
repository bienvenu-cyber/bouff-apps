// Messages BOUFF envoyés au client et au restaurant.
// Les montants viennent toujours de la commande enregistrée en base.

export interface OutboxPayload {
  order_number?: string;
  status?: string;
  order_type?: string;
  total_fcfa?: number;
  delivery_fee_fcfa?: number;
  customer_name?: string;
  customer_phone?: string;
  delivery_address?: string | null;
  payment_method?: string;
  restaurant_name?: string;
  cancel_reason?: string | null;
}

export interface OutboxJob {
  id: string;
  order_id: string | null;
  event: string;
  channel: "whatsapp" | "email" | "sms";
  audience: "customer" | "restaurant" | "rider";
  recipient: string | null;
  payload: OutboxPayload;
  attempts: number;
}

const money = (value?: number) =>
  `${Math.round(Number(value ?? 0)).toLocaleString("fr-FR")} FCFA`;

const paymentLabel = (method?: string) => {
  if (method === "mobile_money") return "Mobile Money";
  if (method === "card") return "Carte";
  return "Espèces";
};

export interface RenderedMessage {
  subject: string;
  body: string;
}

export function renderMessage(job: OutboxJob): RenderedMessage | null {
  const p = job.payload ?? {};
  const number = p.order_number ?? "";
  const isDelivery = p.order_type === "delivery";

  if (job.audience === "restaurant") {
    if (job.event === "order_received") {
      return {
        subject: `Nouvelle commande ${number}`,
        body: [
          `🔔 Nouvelle commande ${number}`,
          `${p.customer_name ?? "Client"} — ${p.customer_phone ?? ""}`,
          isDelivery
            ? `Livraison : ${p.delivery_address ?? "adresse à préciser"}`
            : "À emporter",
          `Total : ${money(p.total_fcfa)} (${paymentLabel(p.payment_method)})`,
          "Ouvrez l'écran cuisine pour accepter la commande.",
        ].join("\n"),
      };
    }
    if (job.event === "status_cancelled") {
      return {
        subject: `Commande ${number} annulée`,
        body: `❌ La commande ${number} a été annulée.${
          p.cancel_reason ? ` Motif : ${p.cancel_reason}` : ""
        }`,
      };
    }
    return null;
  }

  const hello = p.customer_name ? `${p.customer_name}, ` : "";

  switch (job.event) {
    case "order_received":
      return {
        subject: `Commande ${number} reçue`,
        body: [
          `Merci ${p.customer_name ?? ""} ! Votre commande ${number} est bien reçue chez ${p.restaurant_name ?? "BOUFF"}.`,
          `Total : ${money(p.total_fcfa)}${
            isDelivery ? ` (dont livraison ${money(p.delivery_fee_fcfa)})` : ""
          }`,
          `Paiement : ${paymentLabel(p.payment_method)}`,
          "Nous vous prévenons dès que la préparation commence.",
        ].join("\n"),
      };
    case "status_in_kitchen":
      return {
        subject: `Commande ${number} en préparation`,
        body: `👨‍🍳 ${hello}votre commande ${number} est en préparation.`,
      };
    case "status_ready":
      return {
        subject: `Commande ${number} prête`,
        body: isDelivery
          ? `✅ ${hello}votre commande ${number} est prête, un livreur part la chercher.`
          : `✅ ${hello}votre commande ${number} est prête, vous pouvez venir la retirer.`,
      };
    case "status_on_the_way":
      return {
        subject: `Commande ${number} en route`,
        body: `🛵 ${hello}votre commande ${number} est en route. Gardez votre téléphone à portée de main.`,
      };
    case "status_delivered":
      return {
        subject: `Commande ${number} livrée`,
        body: `🍔 Bon appétit ! Votre commande ${number} est ${
          isDelivery ? "livrée" : "remise"
        }. Merci d'avoir choisi BOUFF.`,
      };
    case "status_cancelled":
      return {
        subject: `Commande ${number} annulée`,
        body: `❌ ${hello}votre commande ${number} a été annulée.${
          p.cancel_reason ? ` Motif : ${p.cancel_reason}` : ""
        } Contactez-nous si besoin.`,
      };
    default:
      return null;
  }
}
