"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { bouffDb, fcfa, RESTAURANT_SLUG } from "@/lib/bouff/client";
import { useToast } from "@/lib/bouff/toast";

type Option = {
  id: string;
  name: string;
  price_delta_fcfa: number;
  is_available: boolean;
  sort_order: number;
};
type OptionGroup = {
  id: string;
  name: string;
  min_select: number;
  max_select: number;
  applies_to_kind: string | null;
  sort_order: number;
  options: Option[];
};
type Variant = {
  id: string;
  name: string;
  kind: string;
  price_fcfa: number;
  is_default: boolean;
  is_available: boolean;
  sort_order: number;
};
type Item = {
  id: string;
  category_id: string | null;
  name: string;
  description: string | null;
  base_price_fcfa: number;
  is_available: boolean;
  available_weekday: number | null;
  sort_order: number;
  item_variants: Variant[];
  option_groups: OptionGroup[];
};
type Category = { id: string; name: string; sort_order: number };
type Zone = { id: string; name: string; fee_fcfa: number };
type Restaurant = {
  id: string;
  name: string;
  tagline: string | null;
  accepts_takeaway: boolean;
  accepts_delivery: boolean;
};
type CartLine = {
  key: string;
  menu_item_id: string;
  variant_id: string | null;
  option_ids: string[];
  label: string;
  detail: string;
  unit_price_fcfa: number;
  quantity: number;
  note: string | null;
};

const sortBy = <T extends { sort_order: number }>(list: T[]) =>
  [...list].sort((a, b) => a.sort_order - b.sort_order);

export default function BouffOrderPage() {
  const toast = useToast();
  const [loading, setLoading] = useState(true);
  const [restaurant, setRestaurant] = useState<Restaurant | null>(null);
  const [categories, setCategories] = useState<Category[]>([]);
  const [items, setItems] = useState<Item[]>([]);
  const [zones, setZones] = useState<Zone[]>([]);
  const [openItem, setOpenItem] = useState<Item | null>(null);
  const [cart, setCart] = useState<CartLine[]>([]);
  const [placing, setPlacing] = useState(false);
  const [placed, setPlaced] = useState<{ order_number: string; total_fcfa: number } | null>(null);

  // formulaire de validation
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [orderType, setOrderType] = useState<"takeaway" | "delivery">("takeaway");
  const [zoneId, setZoneId] = useState("");
  const [address, setAddress] = useState("");
  const [payment, setPayment] = useState<"cash" | "mobile_money">("cash");
  const [note, setNote] = useState("");

  const loadMenu = async () => {
    const { data: rest, error: restError } = await bouffDb
      .from("restaurants")
      .select("id, name, tagline, accepts_takeaway, accepts_delivery")
      .eq("slug", RESTAURANT_SLUG)
      .maybeSingle();

    if (restError || !rest) {
      toast.error("Impossible de charger la carte pour le moment.");
      setLoading(false);
      return;
    }
    setRestaurant(rest as Restaurant);

    const [cats, menu, zoneRows] = await Promise.all([
      bouffDb
        .from("categories")
        .select("id, name, sort_order")
        .eq("restaurant_id", rest.id)
        .eq("is_active", true),
      bouffDb
        .from("menu_items")
        .select(
          "id, category_id, name, description, base_price_fcfa, is_available, available_weekday, sort_order, item_variants(id, name, kind, price_fcfa, is_default, is_available, sort_order), option_groups(id, name, min_select, max_select, applies_to_kind, sort_order, options(id, name, price_delta_fcfa, is_available, sort_order))",
        )
        .eq("restaurant_id", rest.id),
      bouffDb
        .from("delivery_zones")
        .select("id, name, fee_fcfa")
        .eq("restaurant_id", rest.id)
        .eq("is_active", true)
        .order("sort_order"),
    ]);

    setCategories(sortBy((cats.data ?? []) as Category[]));
    setItems((menu.data ?? []) as unknown as Item[]);
    setZones((zoneRows.data ?? []) as Zone[]);
    setLoading(false);
  };

  useEffect(() => {
    loadMenu();
    // disponibilité en direct (ruptures de stock côté cuisine)
    const channel = bouffDb
      .channel("bouff-menu-availability")
      .on("postgres_changes", { event: "UPDATE", schema: "public", table: "menu_items" }, () => {
        loadMenu();
      })
      .on("postgres_changes", { event: "UPDATE", schema: "public", table: "item_variants" }, () => {
        loadMenu();
      })
      .subscribe();
    return () => {
      bouffDb.removeChannel(channel);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const today = new Date().getDay();
  const visibleItems = useMemo(
    () =>
      items.filter(
        (i) => i.available_weekday === null || i.available_weekday === today,
      ),
    [items, today],
  );

  const itemsTotal = cart.reduce((s, l) => s + l.unit_price_fcfa * l.quantity, 0);
  const deliveryFee =
    orderType === "delivery" ? (zones.find((z) => z.id === zoneId)?.fee_fcfa ?? 0) : 0;

  const addToCart = (line: CartLine) => {
    setCart((list) => {
      const found = list.find((l) => l.key === line.key);
      if (found) {
        return list.map((l) =>
          l.key === line.key ? { ...l, quantity: l.quantity + line.quantity } : l,
        );
      }
      return [...list, line];
    });
    toast.success(`${line.label} ajouté au panier`);
  };

  const submit = async () => {
    if (!restaurant) return;
    if (cart.length === 0) {
      toast.error("Votre panier est vide.");
      return;
    }
    setPlacing(true);
    const { data, error } = await bouffDb.rpc("place_order", {
      p_restaurant_id: restaurant.id,
      p_customer_name: name,
      p_customer_phone: phone,
      p_order_type: orderType,
      p_items: cart.map((l) => ({
        menu_item_id: l.menu_item_id,
        variant_id: l.variant_id,
        quantity: l.quantity,
        option_ids: l.option_ids,
        note: l.note,
      })),
      p_delivery_zone_id: orderType === "delivery" ? zoneId || null : null,
      p_delivery_address: orderType === "delivery" ? address : null,
      p_payment_method: payment,
      p_note: note,
    });
    setPlacing(false);

    if (error) {
      toast.error(error.message.replace(/^.*?:\s*/, ""));
      return;
    }
    const result = data as { order_number: string; total_fcfa: number };
    setPlaced(result);
    setCart([]);
    toast.success(`Commande ${result.order_number} envoyée en cuisine !`);
  };

  if (loading) {
    return <p className="py-16 text-center text-white/60">Chargement de la carte…</p>;
  }

  if (placed) {
    return (
      <div className="mx-auto max-w-md rounded-2xl border border-[#ff7a1a]/40 bg-[#131315] p-6 text-center">
        <p className="text-sm uppercase tracking-widest text-[#ffc043]">Commande envoyée</p>
        <p className="mt-3 text-3xl font-extrabold">{placed.order_number}</p>
        <p className="mt-2 text-white/70">Total à payer : {fcfa(placed.total_fcfa)}</p>
        <p className="mt-4 text-sm text-white/60">
          Gardez ce numéro : il permet de suivre votre commande avec votre téléphone.
        </p>
        <div className="mt-6 flex flex-col gap-2">
          <Link
            href={`/bouff/suivi?numero=${placed.order_number}`}
            className="rounded-xl bg-[#ff7a1a] px-4 py-3 font-semibold text-black"
          >
            Suivre ma commande
          </Link>
          <button
            onClick={() => setPlaced(null)}
            className="rounded-xl border border-white/15 px-4 py-3 font-semibold text-white/80"
          >
            Commander autre chose
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="grid gap-8 lg:grid-cols-[1fr_340px]">
      <section>
        <h1 className="text-3xl font-extrabold">{restaurant?.name}</h1>
        <p className="mt-1 text-[#ffc043]">{restaurant?.tagline}</p>

        {categories.map((cat) => {
          const catItems = sortBy(visibleItems.filter((i) => i.category_id === cat.id));
          if (catItems.length === 0) return null;
          return (
            <div key={cat.id} className="mt-8">
              <h2 className="text-lg font-bold uppercase tracking-wide text-white/80">
                {cat.name}
              </h2>
              <div className="mt-3 grid gap-3 sm:grid-cols-2">
                {catItems.map((item) => {
                  const cheapest = item.item_variants.length
                    ? Math.min(...item.item_variants.map((v) => v.price_fcfa))
                    : item.base_price_fcfa;
                  return (
                    <button
                      key={item.id}
                      disabled={!item.is_available}
                      onClick={() => setOpenItem(item)}
                      className="rounded-2xl border border-white/10 bg-[#131315] p-4 text-left transition hover:border-[#ff7a1a]/50 disabled:opacity-40"
                    >
                      <div className="flex items-start justify-between gap-3">
                        <span className="font-semibold">{item.name}</span>
                        <span className="whitespace-nowrap text-[#ffc043]">{fcfa(cheapest)}</span>
                      </div>
                      {item.description ? (
                        <p className="mt-1 text-sm text-white/60">{item.description}</p>
                      ) : null}
                      {!item.is_available ? (
                        <p className="mt-2 text-xs uppercase text-red-400">Rupture</p>
                      ) : null}
                    </button>
                  );
                })}
              </div>
            </div>
          );
        })}
      </section>

      <aside className="lg:sticky lg:top-20 lg:self-start">
        <div className="rounded-2xl border border-white/10 bg-[#131315] p-4">
          <h2 className="font-bold">Mon panier</h2>
          {cart.length === 0 ? (
            <p className="mt-2 text-sm text-white/50">Choisissez un article dans la carte.</p>
          ) : (
            <ul className="mt-3 space-y-3">
              {cart.map((l) => (
                <li key={l.key} className="text-sm">
                  <div className="flex justify-between gap-2">
                    <span className="font-medium">
                      {l.quantity} × {l.label}
                    </span>
                    <span className="text-[#ffc043]">{fcfa(l.unit_price_fcfa * l.quantity)}</span>
                  </div>
                  {l.detail ? <p className="text-white/50">{l.detail}</p> : null}
                  <button
                    onClick={() => setCart((list) => list.filter((x) => x.key !== l.key))}
                    className="mt-1 text-xs text-red-400"
                  >
                    Retirer
                  </button>
                </li>
              ))}
            </ul>
          )}

          <div className="mt-4 space-y-3 border-t border-white/10 pt-4">
            <div className="flex gap-2">
              {restaurant?.accepts_takeaway ? (
                <button
                  onClick={() => setOrderType("takeaway")}
                  className={`flex-1 rounded-xl px-3 py-2 text-sm font-semibold ${orderType === "takeaway" ? "bg-[#ff7a1a] text-black" : "border border-white/15 text-white/70"}`}
                >
                  À emporter
                </button>
              ) : null}
              {restaurant?.accepts_delivery ? (
                <button
                  onClick={() => setOrderType("delivery")}
                  className={`flex-1 rounded-xl px-3 py-2 text-sm font-semibold ${orderType === "delivery" ? "bg-[#ff7a1a] text-black" : "border border-white/15 text-white/70"}`}
                >
                  Livraison
                </button>
              ) : null}
            </div>

            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Votre nom"
              className="w-full rounded-xl border border-white/15 bg-[#0b0b0c] px-3 py-2 text-sm"
            />
            <input
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              placeholder="Téléphone (WhatsApp)"
              inputMode="tel"
              className="w-full rounded-xl border border-white/15 bg-[#0b0b0c] px-3 py-2 text-sm"
            />

            {orderType === "delivery" ? (
              <>
                <select
                  value={zoneId}
                  onChange={(e) => setZoneId(e.target.value)}
                  className="w-full rounded-xl border border-white/15 bg-[#0b0b0c] px-3 py-2 text-sm"
                >
                  <option value="">Choisir la zone…</option>
                  {zones.map((z) => (
                    <option key={z.id} value={z.id}>
                      {z.name} — {fcfa(z.fee_fcfa)}
                    </option>
                  ))}
                </select>
                <input
                  value={address}
                  onChange={(e) => setAddress(e.target.value)}
                  placeholder="Adresse / point de repère"
                  className="w-full rounded-xl border border-white/15 bg-[#0b0b0c] px-3 py-2 text-sm"
                />
              </>
            ) : null}

            <select
              value={payment}
              onChange={(e) => setPayment(e.target.value as "cash" | "mobile_money")}
              className="w-full rounded-xl border border-white/15 bg-[#0b0b0c] px-3 py-2 text-sm"
            >
              <option value="cash">Espèces</option>
              <option value="mobile_money">Mobile money</option>
            </select>

            <textarea
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="Remarque (facultatif)"
              rows={2}
              className="w-full rounded-xl border border-white/15 bg-[#0b0b0c] px-3 py-2 text-sm"
            />

            <div className="space-y-1 text-sm text-white/70">
              <div className="flex justify-between">
                <span>Articles</span>
                <span>{fcfa(itemsTotal)}</span>
              </div>
              {orderType === "delivery" ? (
                <div className="flex justify-between">
                  <span>Livraison</span>
                  <span>{fcfa(deliveryFee)}</span>
                </div>
              ) : null}
              <div className="flex justify-between text-base font-bold text-white">
                <span>Total</span>
                <span>{fcfa(itemsTotal + deliveryFee)}</span>
              </div>
            </div>

            <button
              onClick={submit}
              disabled={placing || cart.length === 0}
              className="w-full rounded-xl bg-[#ff7a1a] px-4 py-3 font-bold text-black disabled:opacity-40"
            >
              {placing ? "Envoi…" : "Valider la commande"}
            </button>
          </div>
        </div>
      </aside>

      {openItem ? (
        <ItemDialog
          item={openItem}
          onClose={() => setOpenItem(null)}
          onAdd={(line) => {
            addToCart(line);
            setOpenItem(null);
          }}
        />
      ) : null}
    </div>
  );
}

function ItemDialog({
  item,
  onClose,
  onAdd,
}: {
  item: Item;
  onClose: () => void;
  onAdd: (line: CartLine) => void;
}) {
  const toast = useToast();
  const variants = sortBy(item.item_variants.filter((v) => v.is_available));
  const [variantId, setVariantId] = useState<string | null>(
    variants.find((v) => v.is_default)?.id ?? variants[0]?.id ?? null,
  );
  const [selected, setSelected] = useState<Record<string, string[]>>({});
  const [quantity, setQuantity] = useState(1);
  const [lineNote, setLineNote] = useState("");

  const variant = variants.find((v) => v.id === variantId) ?? null;
  const groups = sortBy(
    item.option_groups.filter(
      (g) => g.applies_to_kind === null || !variant || g.applies_to_kind === variant.kind,
    ),
  );

  const optionIds = groups.flatMap((g) => selected[g.id] ?? []);
  const allOptions = groups.flatMap((g) => g.options);
  const extras = optionIds.reduce(
    (s, id) => s + (allOptions.find((o) => o.id === id)?.price_delta_fcfa ?? 0),
    0,
  );
  const unit = (variant ? variant.price_fcfa : item.base_price_fcfa) + extras;

  const toggle = (group: OptionGroup, optionId: string) => {
    setSelected((prev) => {
      const current = prev[group.id] ?? [];
      if (group.max_select === 1) {
        return { ...prev, [group.id]: current[0] === optionId ? [] : [optionId] };
      }
      if (current.includes(optionId)) {
        return { ...prev, [group.id]: current.filter((x) => x !== optionId) };
      }
      if (current.length >= group.max_select) {
        toast.info(`${group.name} : ${group.max_select} choix maximum.`);
        return prev;
      }
      return { ...prev, [group.id]: [...current, optionId] };
    });
  };

  const add = () => {
    for (const g of groups) {
      if ((selected[g.id] ?? []).length < g.min_select) {
        toast.error(`Choix obligatoire : ${g.name}`);
        return;
      }
    }
    const optionNames = optionIds
      .map((id) => allOptions.find((o) => o.id === id)?.name)
      .filter(Boolean)
      .join(", ");
    onAdd({
      key: [item.id, variantId, ...[...optionIds].sort(), lineNote].join("|"),
      menu_item_id: item.id,
      variant_id: variantId,
      option_ids: optionIds,
      label: variant ? `${item.name} — ${variant.name}` : item.name,
      detail: [optionNames, lineNote].filter(Boolean).join(" · "),
      unit_price_fcfa: unit,
      quantity,
      note: lineNote || null,
    });
  };

  return (
    <div
      className="fixed inset-0 z-[200] flex items-end justify-center bg-black/70 p-0 sm:items-center sm:p-6"
      onClick={onClose}
    >
      <div
        className="max-h-[90vh] w-full max-w-md overflow-y-auto rounded-t-2xl border border-white/10 bg-[#131315] p-5 sm:rounded-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <h3 className="text-xl font-bold">{item.name}</h3>
        {item.description ? (
          <p className="mt-1 text-sm text-white/60">{item.description}</p>
        ) : null}

        {variants.length > 0 ? (
          <div className="mt-4">
            <p className="text-sm font-semibold text-white/80">Formule</p>
            <div className="mt-2 space-y-2">
              {variants.map((v) => (
                <button
                  key={v.id}
                  onClick={() => setVariantId(v.id)}
                  className={`flex w-full items-center justify-between rounded-xl border px-3 py-2 text-sm ${variantId === v.id ? "border-[#ff7a1a] bg-[#ff7a1a]/10" : "border-white/15"}`}
                >
                  <span>{v.name}</span>
                  <span className="text-[#ffc043]">{fcfa(v.price_fcfa)}</span>
                </button>
              ))}
            </div>
          </div>
        ) : null}

        {groups.map((g) => (
          <div key={g.id} className="mt-4">
            <p className="text-sm font-semibold text-white/80">
              {g.name}
              <span className="ml-2 text-xs font-normal text-white/40">
                {g.min_select > 0 ? "obligatoire" : "facultatif"}
                {g.max_select > 1 ? ` · ${g.max_select} max` : ""}
              </span>
            </p>
            <div className="mt-2 space-y-2">
              {sortBy(g.options.filter((o) => o.is_available)).map((o) => {
                const on = (selected[g.id] ?? []).includes(o.id);
                return (
                  <button
                    key={o.id}
                    onClick={() => toggle(g, o.id)}
                    className={`flex w-full items-center justify-between rounded-xl border px-3 py-2 text-sm ${on ? "border-[#ff7a1a] bg-[#ff7a1a]/10" : "border-white/15"}`}
                  >
                    <span>{o.name}</span>
                    <span className="text-white/50">
                      {o.price_delta_fcfa > 0 ? `+${fcfa(o.price_delta_fcfa)}` : "Inclus"}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>
        ))}

        <input
          value={lineNote}
          onChange={(e) => setLineNote(e.target.value)}
          placeholder="Sans oignon, bien piquant…"
          className="mt-4 w-full rounded-xl border border-white/15 bg-[#0b0b0c] px-3 py-2 text-sm"
        />

        <div className="mt-4 flex items-center gap-3">
          <button
            onClick={() => setQuantity((q) => Math.max(1, q - 1))}
            className="h-10 w-10 rounded-xl border border-white/15 text-lg"
          >
            −
          </button>
          <span className="w-8 text-center font-bold">{quantity}</span>
          <button
            onClick={() => setQuantity((q) => Math.min(50, q + 1))}
            className="h-10 w-10 rounded-xl border border-white/15 text-lg"
          >
            +
          </button>
          <button
            onClick={add}
            className="ml-auto rounded-xl bg-[#ff7a1a] px-4 py-3 font-bold text-black"
          >
            Ajouter · {fcfa(unit * quantity)}
          </button>
        </div>
      </div>
    </div>
  );
}
