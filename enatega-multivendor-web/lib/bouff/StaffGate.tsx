"use client";

import { useEffect, useState, type ReactNode } from "react";
import type { Session } from "@supabase/supabase-js";
import { bouffDb } from "@/lib/bouff/client";
import { useToast } from "@/lib/bouff/toast";

export function StaffGate({
  title,
  children,
}: {
  title: string;
  children: (session: Session) => ReactNode;
}) {
  const toast = useToast();
  const [session, setSession] = useState<Session | null>(null);
  const [ready, setReady] = useState(false);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    bouffDb.auth.getSession().then(({ data }) => {
      setSession(data.session);
      setReady(true);
    });
    const { data: sub } = bouffDb.auth.onAuthStateChange((_event, s) => setSession(s));
    return () => sub.subscription.unsubscribe();
  }, []);

  const signIn = async () => {
    setBusy(true);
    const { error } = await bouffDb.auth.signInWithPassword({ email, password });
    setBusy(false);
    if (error) {
      toast.error("Identifiants incorrects.");
      return;
    }
    toast.success("Connecté.");
  };

  if (!ready) return <p className="py-16 text-center text-white/60">Chargement…</p>;

  if (!session) {
    return (
      <div className="mx-auto max-w-sm rounded-2xl border border-white/10 bg-[#131315] p-5">
        <h1 className="text-xl font-extrabold">{title}</h1>
        <p className="mt-1 text-sm text-white/60">Espace réservé à l'équipe BOUFF.</p>
        <input
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="E-mail"
          className="mt-4 w-full rounded-xl border border-white/15 bg-[#0b0b0c] px-3 py-2 text-sm"
        />
        <input
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          type="password"
          placeholder="Mot de passe"
          className="mt-3 w-full rounded-xl border border-white/15 bg-[#0b0b0c] px-3 py-2 text-sm"
        />
        <button
          onClick={signIn}
          disabled={busy}
          className="mt-4 w-full rounded-xl bg-[#ff7a1a] px-4 py-3 font-bold text-black disabled:opacity-40"
        >
          {busy ? "Connexion…" : "Se connecter"}
        </button>
      </div>
    );
  }

  return (
    <div>
      <div className="mb-4 flex items-center justify-between">
        <h1 className="text-2xl font-extrabold">{title}</h1>
        <button
          onClick={async () => {
            await bouffDb.auth.signOut();
            toast.info("Déconnecté.");
          }}
          className="rounded-xl border border-white/15 px-3 py-2 text-sm text-white/70"
        >
          Déconnexion
        </button>
      </div>
      {children(session)}
    </div>
  );
}
