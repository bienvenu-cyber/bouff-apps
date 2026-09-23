// Service d'envoi : récupère les messages en attente dans la base,
// les envoie (WhatsApp / e-mail) puis les marque envoyés ou en échec.

import {
  NOTIFICATIONS_TOKEN,
  callRpc,
} from "@/lib/server/bouff-service";
import { renderMessage, type OutboxJob } from "./templates";
import { isWhatsAppConfigured, sendWhatsApp } from "./whatsapp";
import { isEmailConfigured, sendEmail } from "./email";

export interface DispatchReport {
  claimed: number;
  sent: number;
  failed: number;
  skipped: number;
  errors: string[];
}

export async function dispatchNotifications(limit = 20): Promise<DispatchReport> {
  const report: DispatchReport = {
    claimed: 0,
    sent: 0,
    failed: 0,
    skipped: 0,
    errors: [],
  };

  if (!NOTIFICATIONS_TOKEN) {
    throw new Error("BOUFF_NOTIFICATIONS_TOKEN manquant.");
  }

  const jobs = await callRpc<OutboxJob[]>("claim_notifications", {
    p_token: NOTIFICATIONS_TOKEN,
    p_limit: limit,
  });
  report.claimed = jobs?.length ?? 0;

  for (const job of jobs ?? []) {
    const mark = (status: string, error?: string) =>
      callRpc("mark_notification", {
        p_token: NOTIFICATIONS_TOKEN,
        p_id: job.id,
        p_status: status,
        p_error: error ?? null,
      });

    try {
      const message = renderMessage(job);
      if (!message || !job.recipient) {
        report.skipped += 1;
        await mark("skipped", !job.recipient ? "destinataire inconnu" : "aucun message pour cet événement");
        continue;
      }

      if (job.channel === "whatsapp") {
        if (!isWhatsAppConfigured()) {
          report.skipped += 1;
          await mark("skipped", "WhatsApp non configuré");
          continue;
        }
        await sendWhatsApp(job.recipient, message.body);
      } else if (job.channel === "email") {
        if (!isEmailConfigured()) {
          report.skipped += 1;
          await mark("skipped", "E-mail non configuré");
          continue;
        }
        await sendEmail(job.recipient, message.subject, message.body);
      } else {
        report.skipped += 1;
        await mark("skipped", "canal non pris en charge");
        continue;
      }

      report.sent += 1;
      await mark("sent");
    } catch (error) {
      const detail = error instanceof Error ? error.message : String(error);
      report.failed += 1;
      report.errors.push(`${job.id}: ${detail}`);
      try {
        await mark(job.attempts >= 5 ? "failed" : "pending", detail);
      } catch {
        /* la tentative sera reprise au prochain passage */
      }
    }
  }

  return report;
}
