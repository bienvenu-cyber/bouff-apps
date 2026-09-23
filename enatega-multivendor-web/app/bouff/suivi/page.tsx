"use client";

import { useEffect, useState } from "react";
import { bouffDb, fcfa, STATUS_LABEL } from "@/lib/bouff/client";
import { useToast } from "@/lib/bouff/toast";

type Tracked = {
  order_number: string;
  status: string;
  order_type: string;
  total_fcfa: number;
  delivery_fee_fcfa: number;
  restaurant: string;
  rider_name: string | null;
  rider_phone: string | null;
  cancel_reason: string | null;
  items: {
    item_name: string;
    variant_name: string | null;
    quantity: number;
    line_total_fcfa: number;
    options: string[];
  }[];
};

const STEPS = ["received", "in_kitchen", "ready", "on_the_way", "delivered"];

export default function SuiviPage() {
  const toast = useToast();
  const [orderNumber, setOrderNumber] = useState("");
  const [phone, setPhone] = useState("");
  const [order, setOrder] = useState<Tracked | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    const fromUrl = new URLSearchParams(window.location.search).get("numero");
    if (fromUrl) setOrderNumber(fromUrl);
  }, []);

  const search = async (silent = false) => {
    if (!orderNumber || !phone) {
      toast.error("Numéro de commande et téléphone requis.");
      return;
    }
    if (!silent) setLoading(true);
    const { data, error } = await bouffDb.rpc("track_order", {
      p_order_number: orderNumber,
      p_phone: phone,
    });
    if (!silent) setLoading(false);
    if (error) {
      if (!silent) toast.error("Commande introuvable avec ce numéro et ce téléphone.");
      return;
    }
    setOrder(data as Tracked);
  };

  // rafraîchissement automatique du suivi
  useEffect(() => {
    if (!order) return;
    const timer = setInterval(() => search(true), 15000);
    return () => clearInterval(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [order?.order_number, phone]);

  const stepIndex = order ? STEPS.indexOf(order.status) : -1;

  return (
    <div className="mx-auto max-w-md">
      <h1 className="text-2xl font-extrabold">Suivre ma commande</h1>
      <div className="mt-4 space-y-3 rounded-2xl border border-white/10 bg-[#131315] p-4">
        <input
          value={orderNumber}
          onChange={(e) => setOrderNumber(e.target.value)}
          placeholder="Numéro (ex : BF-0001)"
          className="w-full rounded-xl border border-white/15 bg-[#0b0b0c] px-3 py-2 text-sm"
        />
        <input
          value={phone}
          onChange={(e) => setPhone(e.target.value)}
          placeholder="Téléphone utilisé"
          inputMode="tel"
          className="w-full rounded-xl border border-white/15 bg-[#0b0b0c] px-3 py-2 text-sm"
        />
        <button
          onClick={() => search()}
          disabled={loading}
          className="w-full rounded-xl bg-[#ff7a1a] px-4 py-3 font-bold text-black disabled:opacity-40"
        >
          {loading ? "Recherche…" : "Voir ma commande"}
        </button>
      </div>

      {order ? (
        <div className="mt-6 rounded-2xl border border-white/10 bg-[#131315] p-4">
          <div className="flex items-center justify-between">
            <span className="text-lg font-bold">{order.order_number}</span>
            <span
              className={`rounded-full px-3 py-1 text-xs font-semibold ${order.status === "cancelled" ? "bg-red-500/20 text-red-300" : "bg-[#ff7a1a]/20 text-[#ffc043]"}`}
            >
              {STATUS_LABEL[order.status]}
            </span>
          </div>

          {order.status === "cancelled" ? (
            <p className="mt-3 text-sm text-red-300">
              Annulée{order.cancel_reason ? ` — ${order.cancel_reason}` : ""}
            </p>
          ) : (
            <ol className="mt-4 space-y-2 text-sm">
              {STEPS.filter((s) => s !== "on_the_way" || order.order_type === "delivery").map(
                (s) => {
                  const idx = STEPS.indexOf(s);
                  const done = idx <= stepIndex;
                  return (
                    <li
                      key={s}
                      className={done ? "font-semibold text-[#ffc043]" : "text-white/40"}
                    >
                      {done ? "●" : "○"} {STATUS_LABEL[s]}
                    </li>
                  );
                },
              )}
            </ol>
          )}

          {order.rider_name ? (
            <p className="mt-4 text-sm text-white/70">
              Livreur : {order.rider_name}
              {order.rider_phone ? ` · ${order.rider_phone}` : ""}
            </p>
          ) : null}

          <ul className="mt-4 space-y-2 border-t border-white/10 pt-4 text-sm">
            {order.items.map((i, idx) => (
              <li key={idx} className="flex justify-between gap-2">
                <span>
                  {i.quantity} × {i.item_name}
                  {i.variant_name ? ` — ${i.variant_name}` : ""}
                  {i.options.length ? (
                    <span className="block text-white/50">{i.options.join(", ")}</span>
                  ) : null}
                </span>
                <span className="text-[#ffc043]">{fcfa(i.line_total_fcfa)}</span>
              </li>
            ))}
          </ul>
          <div className="mt-3 flex justify-between border-t border-white/10 pt-3 font-bold">
            <span>Total</span>
            <span>{fcfa(order.total_fcfa)}</span>
          </div>
        </div>
      ) : null}
    </div>
  );
}
