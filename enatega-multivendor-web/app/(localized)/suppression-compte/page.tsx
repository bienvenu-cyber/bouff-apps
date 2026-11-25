"use client";
import React, { useState } from "react";
import { bouffDb } from "@/lib/bouff-data/supabase";

export default function DeletionRequestPage() {
  const [contact, setContact] = useState("");
  const [reason, setReason] = useState("");
  const [state, setState] = useState<"idle" | "sending" | "done" | "error">("idle");
  const [error, setError] = useState("");

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setState("sending");
    const { error } = await bouffDb().rpc("request_account_deletion", { p_contact: contact, p_reason: reason });
    if (error) { setError(error.message); setState("error"); } else setState("done");
  };

  return (
    <main className="mx-auto max-w-xl px-5 py-12 leading-relaxed dark:text-gray-300">
      <h1 className="text-3xl font-bold">Supprimer mon compte BOUFF</h1>
      <p className="mt-3">Indiquez l’e-mail ou le numéro de téléphone de votre compte. Nous supprimons votre compte et vos données personnelles (profil, adresses, points, portefeuille, notifications) sous 30 jours, et nous vous confirmons par e-mail ou téléphone. Les montants des commandes passées sont gardés pour la comptabilité, sans votre nom.</p>
      <p className="mt-2 text-sm opacity-80">Vous pouvez aussi le faire dans l’appli : Profil → Supprimer le compte.</p>
      {state === "done" ? (
        <p className="mt-8 rounded-lg border border-orange-500 p-4">Demande reçue. Nous la traitons sous 30 jours.</p>
      ) : (
        <form onSubmit={submit} className="mt-8 space-y-4">
          <input required minLength={5} maxLength={120} value={contact} onChange={(e) => setContact(e.target.value)}
            placeholder="E-mail ou téléphone" className="w-full rounded-lg border px-4 py-3 bg-transparent" />
          <textarea maxLength={500} value={reason} onChange={(e) => setReason(e.target.value)}
            placeholder="Motif (facultatif)" rows={3} className="w-full rounded-lg border px-4 py-3 bg-transparent" />
          {state === "error" && <p className="text-red-500 text-sm">{error}</p>}
          <button disabled={state === "sending"} className="w-full rounded-lg bg-orange-500 py-3 font-semibold text-black">
            {state === "sending" ? "Envoi…" : "Envoyer la demande"}
          </button>
        </form>
      )}
      <p className="mt-8 text-sm opacity-70">Questions : bienvenu082003@gmail.com · +229 01 65 40 90 59</p>
    </main>
  );
}
