"use client";
import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { getGuest } from "@/lib/bouff-data/auth";
import { bouffDb } from "@/lib/bouff-data/supabase";
import { invokePayment, PaymentError } from "@/lib/bouff-data/payments";
import { CONNECTION_ERROR, paymentPayload, paymentState, type PaymentChoice, type PaymentReply, type PaymentState } from "@/lib/bouff-data/payment-logic";
import PaymentFields from "./PaymentFields";
export default function PaymentPanel({ orderNumber, amount, customerPhone, onConfirmed }: { orderNumber: string; amount: number; customerPhone?: string; onConfirmed: () => void }) {
  const phone = customerPhone || getGuest()?.phone || "";
  const [reply, setReply] = useState<PaymentReply | null>(null);
  const [state, setState] = useState<PaymentState>("idle");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const lock = useRef(false);
  const [editing, setEditing] = useState(false);
  const [now, setNow] = useState(Date.now());
  const [choice, setChoice] = useState<PaymentChoice>({ method: "momo", network: "mtn", payerPhone: phone, email: "" });
  const done = useRef(onConfirmed); done.current = onConfirmed;
  const apply = (data: PaymentReply) => {
    setReply(data); setState(paymentState(data)); setMessage(data.payment?.reason || data.message || "");
    if (data.payment) setChoice(c => ({ ...c, method: data.payment!.method, network: data.payment!.network || c.network }));
  };
  useEffect(() => {
    let stopped = false;
    let timer: ReturnType<typeof setTimeout>;
    const poll = async () => {
      if (lock.current) { timer = setTimeout(poll, 4000); return; }
      lock.current = true;
      let terminal = false;
      try {
        const data = await invokePayment({ action: "status", orderNumber, customerPhone: phone });
        if (stopped) return;
        apply(data);
        terminal = ["confirmed", "cancelled"].includes(paymentState(data));
      } catch (error) {
        if (!stopped) { setState("network"); setMessage(error instanceof Error ? error.message : CONNECTION_ERROR); }
      } finally { lock.current = false; if (!stopped && !terminal) timer = setTimeout(poll, 4000); }
    };
    void poll();
    const clock = setInterval(() => setNow(Date.now()), 1000);
    return () => { stopped = true; clearTimeout(timer); clearInterval(clock); };
  }, [orderNumber, phone]);
  useEffect(() => {
    if (state !== "confirmed") return;
    const timer = setTimeout(() => done.current(), 2000);
    return () => clearTimeout(timer);
  }, [state]);
  const request = async (action: "status" | "start" | "cancel") => {
    if (lock.current) return;
    lock.current = true; setBusy(true);
    try {
      if (action === "cancel") {
        const { error } = await bouffDb().rpc("cancel_my_order", { p_order_number: orderNumber, p_phone: phone || null });
        if (error) throw new PaymentError(error.message, "CANCEL_REFUSED");
        apply(await invokePayment({ action: "status", orderNumber, customerPhone: phone }));
      } else {
        const data = await invokePayment({ action, orderNumber, customerPhone: phone,
          ...(action === "start" ? { ...paymentPayload(choice), returnTo: "web", webOrigin: window.location.origin } : {}) });
        apply(data); setEditing(false);
        if (action === "start" && choice.method === "card" && data.paymentUrl && paymentState(data) !== "confirmed") window.location.href = data.paymentUrl;
      }
    } catch (error) {
      if (error instanceof PaymentError && error.code === "PAYMENT_IN_PROGRESS") { setState("pending"); setEditing(false); }
      else setState(error instanceof PaymentError && !error.code ? "network" : "failed");
      setMessage(error instanceof Error ? error.message : CONNECTION_ERROR);
    } finally { lock.current = false; setBusy(false); }
  };
  const remaining = reply?.deadline ? Math.max(0, Math.ceil((Date.parse(reply.deadline) - now) / 1000)) : null;
  const button = "rounded-xl bg-primary-color px-4 py-3 font-semibold text-white disabled:opacity-50";
  return <section aria-label="Paiement" className="mb-8 rounded-2xl border border-primary-color p-6 dark:text-white">
    <h2 className="text-xl font-bold text-primary-color">Paiement en attente</h2>
    <p>{amount.toLocaleString("fr-FR")} F CFA · {choice.method === "momo" ? `Mobile Money (${choice.network === "mtn" ? "MTN" : choice.network === "moov" ? "Moov" : "Celtiis"})` : "Carte bancaire"}</p>
    {remaining !== null && <p>Temps restant : {Math.floor(remaining / 60)}:{String(remaining % 60).padStart(2, "0")}{remaining === 0 ? " · Vérification de la commande…" : ""}</p>}
    <div role="status" aria-live="polite">
      {state === "confirmed" ? <p>Paiement confirmé, votre commande part en cuisine</p> : state === "cancelled" ? <><p>Paiement non reçu à temps, commande annulée</p><p>Si vous avez été débité, contactez BOUFF au 01 65 40 90 59 : le montant sera vérifié.</p><Link href="/" className={button}>Retour au menu</Link></> : <>
        {message && <p>{message}</p>}
        {state === "pending" && <><span aria-hidden="true" className="inline-block h-5 w-5 animate-spin rounded-full border-2 border-primary-color border-t-transparent" /><p>{choice.method === "momo" ? `Validez le paiement sur votre téléphone (${choice.network === "mtn" ? "MTN" : choice.network === "moov" ? "Moov" : "Celtiis"}). Ne communiquez jamais votre code secret.` : "Paiement en cours de vérification."}</p>{reply?.payment?.paymentUrl && <a className={button} href={reply.payment.paymentUrl}>Ouvrir la page de paiement</a>}</>}
      </>}
    </div>
    {!["confirmed", "cancelled"].includes(state) && <>
      {(editing || state === "idle") && <><label>Moyen de paiement<select className="ml-3 rounded-xl border border-gray-200 bg-transparent p-2 dark:border-gray-700" disabled={busy} value={choice.method} onChange={e => setChoice({ ...choice, method: e.target.value as PaymentChoice["method"] })}><option value="momo">Mobile Money</option><option value="card">Carte bancaire</option></select></label><PaymentFields value={choice} onChange={setChoice} disabled={busy} /></>}
      <div className="mt-4 flex flex-wrap gap-3">
        {state === "network" && <button className={button} disabled={busy} onClick={() => void request("status")}>Réessayer</button>}
        {(state === "idle" || state === "failed" || editing) && <button className={button} disabled={busy || remaining === 0} onClick={() => void request("start")}>{state === "failed" ? "Réessayer" : "Payer maintenant"}</button>}
        {state === "failed" && <button className={button} disabled={busy} onClick={() => setEditing(true)}>Changer de moyen de paiement</button>}
        <button className={button} disabled={busy} onClick={() => void request("cancel")}>Annuler la commande</button>
      </div>
    </>}
  </section>;
}
