"use client";
import { useMutation, useQuery } from "@apollo/client";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import {
  SINGLE_VENDOR_CALCULATE_CHECKOUT,
  SINGLE_VENDOR_PLACE_ORDER,
} from "@/lib/api/graphql/single-vendor";
import { useModeSensitiveOperation } from "@/lib/mode";
import useUser from "@/lib/hooks/useUser";
import useCurrencyFormatter from "@/lib/hooks/useCurrencyFormatter";
import { loadMenu, type BouffCity, type BouffZone } from "@/lib/bouff-data/catalog";
import { getGuest, setGuest } from "@/lib/bouff-data/auth";
import { setSelectedZoneId } from "@/lib/bouff-data/cart";
import { bouffDb } from "@/lib/bouff-data/supabase";


function parseTimeToMinutes(t?: string | null): number | null {
  if (!t) return null;
  const [h, m] = t.split(":").map(Number);
  if (!Number.isFinite(h) || !Number.isFinite(m)) return null;
  return h * 60 + m;
}

function buildScheduleSlots(
  opensAt: string | null,
  closesAt: string | null,
  dayOffset: number,
  now: Date,
): { iso: string; label: string }[] {
  const openMin = parseTimeToMinutes(opensAt);
  const closeMin = parseTimeToMinutes(closesAt);
  if (openMin === null || closeMin === null) return [];
  const crossesMidnight = closeMin <= openMin;

  const dayStart = new Date(now);
  dayStart.setHours(0, 0, 0, 0);
  dayStart.setDate(dayStart.getDate() + dayOffset);

  const start = new Date(dayStart);
  start.setMinutes(openMin);
  const end = new Date(dayStart);
  if (crossesMidnight) end.setDate(end.getDate() + 1);
  end.setMinutes(closeMin);

  const minAllowed = new Date(now.getTime() + 30 * 60 * 1000);
  const maxAllowed = new Date(now.getTime() + 2 * 24 * 60 * 60 * 1000);

  const slots: { iso: string; label: string }[] = [];
  for (let t = new Date(start); t <= end; t = new Date(t.getTime() + 15 * 60 * 1000)) {
    if (t < minAllowed || t > maxAllowed) continue;
    slots.push({
      iso: t.toISOString(),
      label: t.toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" }),
    });
  }
  return slots;
}

export default function SingleVendorCheckout() {
  const router = useRouter();
  const { profile, cart, clearCart } = useUser();
  const { formatCurrency } = useCurrencyFormatter();
  const [pickup, setPickup] = useState(false);
  const [paymentMethod, setPaymentMethod] = useState("COD");
  const [instructions, setInstructions] = useState("");
  const [zones, setZones] = useState<BouffZone[]>([]);
  const [zoneId, setZoneId] = useState<string | null>(null);
  const [cities, setCities] = useState<BouffCity[]>([]);
  const [cityId, setCityId] = useState<string | null>(null);
  const [address, setAddress] = useState("");
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [payerPhone, setPayerPhone] = useState("");
  const [momoNotice, setMomoNotice] = useState<string | null>(null);
  const TIP_PRESETS = [0, 200, 500, 1000];
  const [tipChoice, setTipChoice] = useState<number | "custom">(0);
  const [customTip, setCustomTip] = useState("");
  const tipping = pickup
    ? 0
    : tipChoice === "custom"
      ? Math.min(10000, Math.max(0, Math.round(Number(customTip) || 0)))
      : tipChoice;
  const [timingMode, setTimingMode] = useState<"now" | "schedule">("now");
  const [scheduleDayOffset, setScheduleDayOffset] = useState(0);
  const [scheduleSlotIso, setScheduleSlotIso] = useState<string | null>(null);
  const [shop, setShop] = useState<{ open: boolean; min: number; hours: string; opensAt: string | null; closesAt: string | null } | null>(null);
  const [coords, setCoords] = useState<{ lat: number; lng: number } | null>(null);
  const [geoState, setGeoState] = useState<"idle" | "loading" | "error">("idle");
  const useMyPosition = () => {
    if (typeof navigator === "undefined" || !navigator.geolocation) {
      setGeoState("error");
      return;
    }
    setGeoState("loading");
    navigator.geolocation.getCurrentPosition(
      (p) => {
        setCoords({ lat: p.coords.latitude, lng: p.coords.longitude });
        setGeoState("idle");
      },
      () => setGeoState("error"),
      { enableHighAccuracy: true, timeout: 15000, maximumAge: 60000 },
    );
  };
  // Paiement Mobile Money en ligne (pawaPay) : activé dès que les clés sont
  // en place côté serveur (NEXT_PUBLIC_PAWAPAY_ENABLED=true).
  const onlineMomoEnabled = process.env.NEXT_PUBLIC_PAWAPAY_ENABLED === "true";
  const paymentOptions: [string, string][] = [
    ["COD", pickup ? "Espèces au comptoir" : "Espèces à la livraison"],
    ["MOBILE_MONEY", "Mobile Money (à la remise)"],
    ...(onlineMomoEnabled
      ? ([["MOBILE_MONEY_ONLINE", "Mobile Money maintenant (MTN / Moov)"]] as [
          string,
          string,
        ][])
      : []),
  ];
  const idempotencyKey = useRef(
    `sv-web-${Date.now()}-${Math.random().toString(36).slice(2)}`,
  );

  useEffect(() => {
    void loadMenu().then(async (menu) => {
      const db = bouffDb();
      const [{ data: open }, { data: r }] = await Promise.all([
        db.rpc("is_restaurant_open", { p_restaurant_id: menu.restaurant.id }),
        db.from("restaurants").select("min_order_fcfa, opens_at, closes_at").eq("id", menu.restaurant.id).maybeSingle(),
      ]);
      const h = (t?: string | null) => (t ? t.slice(0, 5).replace(":", "h") : "");
      setShop({
        open: open !== false,
        min: r?.min_order_fcfa ?? 0,
        hours: r?.opens_at ? `${h(r.opens_at)} à ${h(r.closes_at)}` : "",
        opensAt: r?.opens_at ?? null,
        closesAt: r?.closes_at ?? null,
      });
      setZones(menu.zones);
      setCities(menu.cities);
      const city =
        menu.cities.find((c) => c.isDefault && c.isActive) ??
        menu.cities.find((c) => c.isActive);
      setCityId((current) => current ?? city?.id ?? null);
    });
    const guest = getGuest();
    setName((current) => current || profile?.name || guest?.name || "");
    setPhone((current) => current || profile?.phone || guest?.phone || "");
  }, [profile?.name, profile?.phone]);

  useEffect(() => {
    setSelectedZoneId(pickup ? null : zoneId);
  }, [pickup, zoneId]);

  const scheduleSlots = shop
    ? buildScheduleSlots(shop.opensAt, shop.closesAt, scheduleDayOffset, new Date())
    : [];

  useEffect(() => {
    setScheduleSlotIso((current) =>
      scheduleSlots.some((slot) => slot.iso === current) ? current : (scheduleSlots[0]?.iso ?? null),
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scheduleDayOffset, shop?.opensAt, shop?.closesAt]);

  const scheduledFor =
    timingMode === "schedule" && scheduleSlotIso ? scheduleSlotIso : null;

  const checkout = useQuery(SINGLE_VENDOR_CALCULATE_CHECKOUT, {
    variables: { isPickup: pickup, zoneId },
    fetchPolicy: "network-only",
  });
  const [placeOrder, placeState] = useMutation(SINGLE_VENDOR_PLACE_ORDER);
  useModeSensitiveOperation(placeState.loading);
  const summary = checkout.data?.calculateCheckout;

  const city = cities.find((c) => c.id === cityId);
  const cityZones = zones.filter((z) => z.cityId === cityId);
  const zone = cityZones.find((z) => z.id === zoneId);
  const fullAddress = [city?.name, zone?.name, address.trim()]
    .filter(Boolean)
    .join(" — ");

  const belowMin = Boolean(shop && (summary?.subtotal ?? 0) < shop.min);
  const canSubmit =
    shop?.open !== false &&
    !belowMin &&
    cart.length > 0 &&
    name.trim().length > 1 &&
    phone.trim().length >= 8 &&
    (pickup || (Boolean(zone) && address.trim().length > 3)) &&
    (timingMode === "now" || Boolean(scheduledFor));

  const submit = async () => {
    setError(null);
    if (!canSubmit) return;
    try {
      setGuest({ name: name.trim(), phone: phone.trim() });
      const result = await placeOrder({
        variables: {
          paymentMethod,
          customerName: name.trim(),
          customerPhone: phone.trim(),
          zoneId: pickup ? null : zoneId,
          address: pickup
            ? { label: "Pickup", deliveryAddress: "", details: "" }
            : { label: "Livraison", deliveryAddress: fullAddress, details: address.trim() },
          orderDate: new Date().toISOString(),
          isPickedUp: pickup,
          location: pickup ? null : coords,
          specialInstructions: instructions,
          instructions,
          tipping,
          scheduledFor,
          idempotencyKey: idempotencyKey.current,
        },
      });
      const order = result.data?.placeOrder;
      if (!order) throw new Error("La commande n'a pas pu être enregistrée.");
      clearCart();

      if (paymentMethod === "MOBILE_MONEY_ONLINE") {
        try {
          const response = await fetch("/api/payments/pawapay/initiate", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              orderNumber: order.orderId,
              customerPhone: phone.trim(),
              payerPhone: (payerPhone || phone).trim(),
            }),
          });
          const data = await response.json();
          if (!response.ok) throw new Error(data?.error ?? "Paiement refusé.");
          setMomoNotice(data?.message ?? null);
        } catch (paymentError) {
          // La commande est enregistrée : on prévient sans la perdre.
          setMomoNotice(
            paymentError instanceof Error
              ? `${paymentError.message} Votre commande est enregistrée, vous pourrez régler à la remise.`
              : "Paiement en ligne indisponible : réglez à la remise.",
          );
        }
      }

      router.replace(`/order/${order.orderId}/tracking`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Commande impossible.");
    }
  };

  if (!cart.length)
    return (
      <div className="mx-auto my-16 max-w-lg text-center">
        <h1 className="text-2xl font-bold dark:text-white">
          Votre panier est vide
        </h1>
        <button
          onClick={() => router.push("/browse")}
          className="mt-5 rounded-full bg-primary-color px-6 py-3 font-semibold text-white"
        >
          Voir la carte
        </button>
      </div>
    );

  const field =
    "mt-2 w-full rounded-xl border border-gray-200 bg-transparent p-3 dark:border-gray-700 dark:text-white";
  const card =
    "rounded-2xl border border-gray-200 bg-white p-5 dark:border-gray-700 dark:bg-gray-800";

  return (
    <div className="mx-auto grid max-w-5xl gap-6 py-8 lg:grid-cols-[1fr_360px]">
      <div className="space-y-5">
        <h1 className="text-3xl font-bold text-gray-900 dark:text-white">
          Valider ma commande
        </h1>

        <section className={card}>
          <h2 className="font-semibold dark:text-white">Mes coordonnées</h2>
          <label className="mt-3 block text-sm dark:text-gray-200">
            Nom
            <input
              value={name}
              onChange={(event) => setName(event.target.value)}
              placeholder="Votre nom"
              className={field}
            />
          </label>
          <label className="mt-4 block text-sm dark:text-gray-200">
            Téléphone
            <input
              value={phone}
              onChange={(event) => setPhone(event.target.value)}
              placeholder="97 00 00 00"
              inputMode="tel"
              className={field}
            />
          </label>
          {!profile && (
            <p className="mt-3 text-xs text-gray-500 dark:text-gray-400">
              Pas besoin de compte pour commander. Vous pourrez en créer un
              après votre commande pour retrouver votre historique.
            </p>
          )}
        </section>

        <section className={card}>
          <h2 className="font-semibold dark:text-white">Mode de retrait</h2>
          <div className="mt-4 grid grid-cols-2 gap-3">
            <button
              onClick={() => setPickup(false)}
              className={`rounded-xl border p-3 ${!pickup ? "border-primary-color bg-primary-light text-primary-color" : "border-gray-200 dark:border-gray-700 dark:text-white"}`}
            >
              Livraison
            </button>
            <button
              onClick={() => setPickup(true)}
              className={`rounded-xl border p-3 ${pickup ? "border-primary-color bg-primary-light text-primary-color" : "border-gray-200 dark:border-gray-700 dark:text-white"}`}
            >
              À emporter
            </button>
          </div>
          {!pickup && (
            <>
              <label className="mt-4 block text-sm dark:text-gray-200">
                1. Ville
                <select
                  value={cityId ?? ""}
                  onChange={(event) => {
                    setCityId(event.target.value || null);
                    setZoneId(null);
                  }}
                  className={field}
                >
                  {cities.map((c) => (
                    <option key={c.id} value={c.id} disabled={!c.isActive}>
                      {c.name}
                      {c.isActive ? "" : " — bientôt disponible"}
                    </option>
                  ))}
                </select>
              </label>
              <label className="mt-4 block text-sm dark:text-gray-200">
                2. Quartier
                <select
                  value={zoneId ?? ""}
                  onChange={(event) => setZoneId(event.target.value || null)}
                  className={field}
                  disabled={!cityZones.length}
                >
                  <option value="">
                    {cityZones.length ? "Choisissez votre quartier" : "Aucun quartier desservi"}
                  </option>
                  {cityZones.map((z) => (
                    <option key={z.id} value={z.id}>
                      {z.name} — {formatCurrency(z.fee)}
                    </option>
                  ))}
                </select>
                <span className="mt-1 block text-xs text-gray-500 dark:text-gray-400">
                  Frais de livraison à partir de {formatCurrency(Math.min(...(cityZones.length ? cityZones.map((z) => z.fee) : [0])))}, selon le quartier.
                </span>
              </label>
              <label className="mt-4 block text-sm dark:text-gray-200">
                3. Adresse précise ou repère
                <input
                  value={address}
                  onChange={(event) => setAddress(event.target.value)}
                  placeholder="Ex. : derrière la pharmacie, portail bleu…"
                  className={field}
                />
              </label>
              <div className="mt-3 text-sm dark:text-gray-200">
                <button
                  type="button"
                  onClick={useMyPosition}
                  disabled={geoState === "loading"}
                  className="rounded-lg border border-primary-color px-3 py-2 font-medium text-primary-color disabled:opacity-60"
                >
                  {geoState === "loading"
                    ? "Localisation…"
                    : coords
                      ? "Position enregistrée ✓ (mettre à jour)"
                      : "📍 Utiliser ma position (facultatif)"}
                </button>
                <span className="mt-1 block text-xs text-gray-500 dark:text-gray-400">
                  {geoState === "error"
                    ? "Position indisponible. Le livreur utilisera votre adresse et repère."
                    : "Aide le livreur à vous trouver plus vite. À utiliser seulement si vous êtes à l'adresse de livraison."}
                </span>
              </div>
            </>
          )}
        </section>

        <section className={card}>
          <h2 className="font-semibold dark:text-white">Quand livrer ?</h2>
          <div className="mt-4 grid grid-cols-2 gap-3">
            <button
              type="button"
              onClick={() => setTimingMode("now")}
              className={`rounded-xl border p-3 ${timingMode === "now" ? "border-primary-color bg-primary-light text-primary-color" : "border-gray-200 dark:border-gray-700 dark:text-white"}`}
            >
              Maintenant
            </button>
            <button
              type="button"
              onClick={() => setTimingMode("schedule")}
              className={`rounded-xl border p-3 ${timingMode === "schedule" ? "border-primary-color bg-primary-light text-primary-color" : "border-gray-200 dark:border-gray-700 dark:text-white"}`}
            >
              Programmer
            </button>
          </div>
          {timingMode === "schedule" && (
            <>
              <label className="mt-4 block text-sm dark:text-gray-200">
                Jour
                <select
                  value={scheduleDayOffset}
                  onChange={(event) => setScheduleDayOffset(Number(event.target.value))}
                  className={field}
                >
                  <option value={0}>Aujourd'hui</option>
                  <option value={1}>Demain</option>
                  <option value={2}>Après-demain</option>
                </select>
              </label>
              <label className="mt-4 block text-sm dark:text-gray-200">
                Heure
                <select
                  value={scheduleSlotIso ?? ""}
                  onChange={(event) => setScheduleSlotIso(event.target.value || null)}
                  className={field}
                  disabled={!scheduleSlots.length}
                >
                  {scheduleSlots.length ? (
                    scheduleSlots.map((slot) => (
                      <option key={slot.iso} value={slot.iso}>
                        {slot.label}
                      </option>
                    ))
                  ) : (
                    <option value="">Aucun créneau disponible ce jour-là</option>
                  )}
                </select>
                {shop?.hours && (
                  <span className="mt-1 block text-xs text-gray-500 dark:text-gray-400">
                    Restaurant ouvert de {shop.hours}. Créneaux de 30 min à 2 jours à l'avance.
                  </span>
                )}
              </label>
            </>
          )}
        </section>

        {!pickup && (
          <section className={card}>
            <h2 className="font-semibold dark:text-white">Pourboire pour le livreur</h2>
            <div className="mt-4 grid grid-cols-4 gap-2">
              {TIP_PRESETS.map((amount) => (
                <button
                  key={amount}
                  type="button"
                  onClick={() => {
                    setTipChoice(amount);
                    setCustomTip("");
                  }}
                  className={`rounded-xl border p-2 text-sm ${tipChoice === amount ? "border-primary-color bg-primary-light text-primary-color" : "border-gray-200 dark:border-gray-700 dark:text-white"}`}
                >
                  {amount === 0 ? "Aucun" : formatCurrency(amount)}
                </button>
              ))}
            </div>
            <label className="mt-3 block text-sm dark:text-gray-200">
              Autre montant
              <input
                value={customTip}
                onChange={(event) => {
                  setCustomTip(event.target.value.replace(/[^0-9]/g, ""));
                  setTipChoice("custom");
                }}
                onFocus={() => setTipChoice("custom")}
                placeholder="Max 10 000 F"
                inputMode="numeric"
                className={field}
              />
            </label>
          </section>
        )}

        <section className={card}>
          <h2 className="font-semibold dark:text-white">Paiement</h2>
          <div className="mt-3 space-y-2">
            {paymentOptions.map(([value, label]) => (
              <label
                key={value}
                className="flex items-center gap-3 rounded-xl border border-gray-200 p-3 dark:border-gray-700 dark:text-white"
              >
                <input
                  type="radio"
                  name="bouff-payment"
                  checked={paymentMethod === value}
                  onChange={() => setPaymentMethod(value)}
                />
                {label}
              </label>
            ))}
          </div>
          {paymentMethod === "MOBILE_MONEY_ONLINE" && (
            <label className="mt-4 block text-sm dark:text-gray-200">
              Numéro Mobile Money à débiter
              <input
                value={payerPhone}
                onChange={(event) => setPayerPhone(event.target.value)}
                placeholder={phone || "97 00 00 00"}
                inputMode="tel"
                className={field}
              />
              <span className="mt-2 block text-xs text-gray-500 dark:text-gray-400">
                Vous recevrez une demande de validation sur ce numéro.
              </span>
            </label>
          )}
          <label className="mt-5 block text-sm dark:text-gray-200">
            Note pour la cuisine
            <textarea
              value={instructions}
              onChange={(event) => setInstructions(event.target.value)}
              placeholder="Sans oignon, bien piquant…"
              className={field}
            />
          </label>
        </section>
      </div>

      <aside className={`h-fit ${card}`}>
        <h2 className="text-xl font-semibold dark:text-white">Récapitulatif</h2>
        <dl className="my-5 space-y-2 text-sm text-gray-600 dark:text-gray-300">
          <div className="flex justify-between">
            <dt>Articles</dt>
            <dd>{formatCurrency(summary?.subtotal ?? 0)}</dd>
          </div>
          <div className="flex justify-between">
            <dt>Livraison</dt>
            <dd>{formatCurrency(summary?.deliveryCharges ?? 0)}</dd>
          </div>
          {tipping > 0 && (
            <div className="flex justify-between">
              <dt>Pourboire livreur</dt>
              <dd>{formatCurrency(tipping)}</dd>
            </div>
          )}
          <div className="flex justify-between border-t pt-3 text-base font-bold dark:border-gray-700">
            <dt>Total</dt>
            <dd>{formatCurrency((summary?.grandTotal ?? 0) + tipping)}</dd>
          </div>
          {timingMode === "schedule" && scheduledFor && (
            <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
              Programmée pour {new Date(scheduledFor).toLocaleString("fr-FR", { weekday: "long", hour: "2-digit", minute: "2-digit" })}
            </p>
          )}
        </dl>
        {shop && !shop.open && (
          <p className="mb-3 rounded-bouff-md border border-bouff-primary p-3 text-sm">
            Le restaurant est fermé pour le moment{shop.hours ? ` (ouvert de ${shop.hours})` : ""}.
          </p>
        )}
        {shop?.open && belowMin && (
          <p className="mb-3 text-sm text-bouff-primary">
            Commande minimum : {formatCurrency(shop.min)} (hors livraison).
          </p>
        )}
        <button
          disabled={placeState.loading || !canSubmit}
          onClick={() => void submit()}
          className="w-full rounded-full bg-primary-color px-5 py-3 font-semibold text-white disabled:opacity-50"
        >
          {placeState.loading ? "Envoi en cours…" : "Commander"}
        </button>
        {(error || placeState.error) && (
          <p className="mt-3 text-sm text-red-600">
            {error || placeState.error?.message}
          </p>
        )}
        {momoNotice && (
          <p className="mt-3 text-sm text-primary-color">{momoNotice}</p>
        )}
      </aside>
    </div>
  );
}
