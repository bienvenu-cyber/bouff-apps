// Envoi d'e-mails BOUFF (Resend).
// Il ne manque que la clé RESEND_API_KEY et l'adresse d'expédition
// BOUFF_EMAIL_FROM sur votre domaine vérifié.

const API_KEY = process.env.RESEND_API_KEY ?? "";
const FROM = process.env.BOUFF_EMAIL_FROM ?? "";

export const isEmailConfigured = () => Boolean(API_KEY && FROM);

const wrap = (subject: string, body: string) => `
<div style="font-family:system-ui,Arial,sans-serif;background:#0f0f0f;padding:24px">
  <div style="max-width:520px;margin:auto;background:#161616;border-radius:16px;padding:24px;color:#f5f5f5">
    <p style="margin:0 0 16px;font-size:20px;font-weight:700;color:#ff7a18">BOUFF</p>
    <h1 style="margin:0 0 12px;font-size:18px">${subject}</h1>
    <p style="margin:0;white-space:pre-line;line-height:1.6">${body}</p>
    <p style="margin:24px 0 0;font-size:12px;color:#9a9a9a">Bonne bouffe. Bon prix. Bon mood.</p>
  </div>
</div>`;

export async function sendEmail(to: string, subject: string, body: string) {
  if (!isEmailConfigured()) {
    throw new Error(
      "E-mail non configuré (RESEND_API_KEY / BOUFF_EMAIL_FROM manquants).",
    );
  }
  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${API_KEY}`,
    },
    body: JSON.stringify({
      from: FROM,
      to: [to],
      subject: `${subject} — BOUFF`,
      html: wrap(subject, body),
      text: body,
    }),
    cache: "no-store",
  });
  const text = await response.text();
  if (!response.ok) throw new Error(`resend ${response.status} : ${text}`);
  return text;
}
