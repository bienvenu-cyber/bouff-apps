"use client";

import { useCallback, useEffect, useState } from "react";
import { bouffDb, fcfa, STATUS_LABEL } from "@/lib/bouff/client";
import { StaffGate } from "@/lib/bouff/StaffGate";
import { useToast } from "@/lib/bouff/toast";

type OrderRow = {
  id: string;
  order_number: string;
  status: string;
  order_type: string;
  customer_name: string;
  customer_phone: string;
  delivery_address: string | null;
  total_fcfa: number;
  note: string | null;
  created_at: string;
  rider_id: string | null;
  order_items: {
    id: string;
    item_name: string;
    variant_name: string | null;
    quantity: number;
    note: string | null;
    order_item_options: { name: string }[];
  }[];
};

type MenuRow = { id: string; name: string; is_available: boolean };

const NEXT: Record<string, { status: string; label: string }> = {
  received: { status: "in_kitchen", label: "Accepter et lancer" },
  in_kitchen: { status: "ready", label: "Marquer prête" },
};

export default function CuisinePage() {
  return <StaffGate title="Cuisine BOUFF">{() => <KitchenBoard />}</StaffGate>;
}

function KitchenBoard() {
  const toast = useToast();
  const [orders, setOrders] = useState<OrderRow[]>([]);
  const [menu, setMenu] = useState<MenuRow[]>([]);
  const [tab, setTab] = useState<"orders" | "stock">("orders");

  const load = useCallback(async () => {
    const { data, error } = await bouffDb
      .from("orders")
      .select(
        "id, order_number, status, order_type, customer_name, customer_phone, delivery_address, total_fcfa, note, created_at, rider_id, order_items(id, item_name, variant_name, quantity, note, order_item_options(name))",
      )
      .in("status", ["received", "in_kitchen", "ready", "on_the_way"])
      .order("created_at", { ascending: true });
    if (error) {
      toast.error("Accès refusé : ce compte n'est pas rattaché à un restaurant.");
      return;
    }
    setOrders((data ?? []) as unknown as OrderRow[]);
  }, [toast]);

  const loadMenu = useCallback(async () => {
    const { data } = await bouffDb
      .from("menu_items")
      .select("id, name, is_available")
      .order("sort_order");
    setMenu((data ?? []) as MenuRow[]);
  }, []);

  useEffect(() => {
    load();
    loadMenu();
    const channel = bouffDb
      .channel("bouff-kitchen")
      .on("postgres_changes", { event: "*", schema: "public", table: "orders" }, (payload) => {
        if (payload.eventType === "INSERT") {
          toast.info("Nouvelle commande reçue !");
        }
        load();
      })
      .subscribe();
    return () => {
      bouffDb.removeChannel(channel);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const advance = async (order: OrderRow, status: string, reason?: string) => {
    const { error } = await bouffDb.rpc("advance_order_status", {
      p_order_id: order.id,
      p_status: status,
      p_cancel_reason: reason ?? null,
    });
    if (error) {
      toast.error(error.message.replace(/^.*?:\s*/, ""));
      return;
    }
    toast.success(`${order.order_number} → ${STATUS_LABEL[status]}`);
    load();
  };

  const toggleStock = async (item: MenuRow) => {
    const { error } = await bouffDb.rpc("set_item_availability", {
      p_menu_item_id: item.id,
      p_available: !item.is_available,
    });
    if (error) {
      toast.error(error.message.replace(/^.*?:\s*/, ""));
      return;
    }
    toast.success(
      item.is_available ? `${item.name} en rupture` : `${item.name} de nouveau disponible`,
    );
    loadMenu();
  };

  return (
    <div>
      <div className="mb-4 flex gap-2">
        <button
          onClick={() => setTab("orders")}
          className={`rounded-xl px-4 py-2 text-sm font-semibold ${tab === "orders" ? "bg-[#ff7a1a] text-black" : "border border-white/15 text-white/70"}`}
        >
          Commandes ({orders.length})
        </button>
        <button
          onClick={() => setTab("stock")}
          className={`rounded-xl px-4 py-2 text-sm font-semibold ${tab === "stock" ? "bg-[#ff7a1a] text-black" : "border border-white/15 text-white/70"}`}
        >
          Ruptures
        </button>
      </div>

      {tab === "orders" ? (
        orders.length === 0 ? (
          <p className="py-10 text-center text-white/50">Aucune commande en cours.</p>
        ) : (
          <div className="grid gap-3 md:grid-cols-2">
            {orders.map((o) => (
              <div key={o.id} className="rounded-2xl border border-white/10 bg-[#131315] p-4">
                <div className="flex items-start justify-between">
                  <div>
                    <p className="text-lg font-bold">{o.order_number}</p>
                    <p className="text-sm text-white/60">
                      {o.order_type === "delivery" ? "Livraison" : "À emporter"} ·{" "}
                      {new Date(o.created_at).toLocaleTimeString("fr-FR", {
                        hour: "2-digit",
                        minute: "2-digit",
                      })}
                    </p>
                  </div>
                  <span className="rounded-full bg-[#ff7a1a]/20 px-3 py-1 text-xs font-semibold text-[#ffc043]">
                    {STATUS_LABEL[o.status]}
                  </span>
                </div>

                <ul className="mt-3 space-y-1 text-sm">
                  {o.order_items.map((i) => (
                    <li key={i.id}>
                      <span className="font-semibold">
                        {i.quantity} × {i.item_name}
                        {i.variant_name ? ` — ${i.variant_name}` : ""}
                      </span>
                      {i.order_item_options.length ? (
                        <span className="block text-white/50">
                          {i.order_item_options.map((x) => x.name).join(", ")}
                        </span>
                      ) : null}
                      {i.note ? <span className="block text-[#ffc043]">⚠ {i.note}</span> : null}
                    </li>
                  ))}
                </ul>

                <p className="mt-3 text-sm text-white/70">
                  {o.customer_name} · {o.customer_phone}
                </p>
                {o.delivery_address ? (
                  <p className="text-sm text-white/60">{o.delivery_address}</p>
                ) : null}
                {o.note ? <p className="text-sm text-[#ffc043]">Note : {o.note}</p> : null}
                <p className="mt-2 font-bold">{fcfa(o.total_fcfa)}</p>

                <div className="mt-3 flex flex-wrap gap-2">
                  {NEXT[o.status] ? (
                    <button
                      onClick={() => advance(o, NEXT[o.status].status)}
                      className="rounded-xl bg-[#ff7a1a] px-3 py-2 text-sm font-bold text-black"
                    >
                      {NEXT[o.status].label}
                    </button>
                  ) : null}
                  {o.status === "ready" && o.order_type === "takeaway" ? (
                    <button
                      onClick={() => advance(o, "delivered")}
                      className="rounded-xl bg-[#ff7a1a] px-3 py-2 text-sm font-bold text-black"
                    >
                      Remise au client
                    </button>
                  ) : null}
                  {o.status === "ready" && o.order_type === "delivery" && !o.rider_id ? (
                    <span className="rounded-xl border border-white/15 px-3 py-2 text-sm text-white/60">
                      En attente d'un livreur
                    </span>
                  ) : null}
                  {o.status !== "on_the_way" ? (
                    <button
                      onClick={() => {
                        const reason = window.prompt("Motif de l'annulation ?") ?? "";
                        if (reason) advance(o, "cancelled", reason);
                      }}
                      className="rounded-xl border border-red-500/40 px-3 py-2 text-sm text-red-300"
                    >
                      Annuler
                    </button>
                  ) : null}
                </div>
              </div>
            ))}
          </div>
        )
      ) : (
        <div className="space-y-2">
          {menu.map((m) => (
            <div
              key={m.id}
              className="flex items-center justify-between rounded-xl border border-white/10 bg-[#131315] px-4 py-3"
            >
              <span className={m.is_available ? "" : "text-white/40 line-through"}>{m.name}</span>
              <button
                onClick={() => toggleStock(m)}
                className={`rounded-xl px-3 py-2 text-sm font-semibold ${m.is_available ? "border border-red-500/40 text-red-300" : "bg-[#ff7a1a] text-black"}`}
              >
                {m.is_available ? "Rupture" : "Remettre"}
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
