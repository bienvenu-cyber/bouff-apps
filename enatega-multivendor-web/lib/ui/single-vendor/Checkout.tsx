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
import { loadMenu, type BouffZone } from "@/lib/bouff-data/catalog";
import { getGuest, setGuest } from "@/lib/bouff-data/auth";
import { setSelectedZoneId } from "@/lib/bouff-data/cart";

export default function SingleVendorCheckout() {
  const router = useRouter();
  const { profile, cart, clearCart } = useUser();
  const { formatCurrency } = useCurrencyFormatter();
  const [pickup, setPickup] = useState(false);
  const [paymentMethod, setPaymentMethod] = useState("COD");
  const [instructions, setInstructions] = useState("");
  const [zones, setZones] = useState<BouffZone[]>([]);
  const [zoneId, setZoneId] = useState<string | null>(null);
  const [address, setAddress] = useState("");
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [payerPhone, setPayerPhone] = useState("");
  const [momoNotice, setMomoNotice] = useState<string | null>(null);
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
    void loadMenu().then((menu) => {
      setZones(menu.zones);
      setZoneId((current) => current ?? menu.zones[0]?.id ?? null);
    });
    const guest = getGuest();
    setName((current) => current || profile?.name || guest?.name || "");
    setPhone((current) => current || profile?.phone || guest?.phone || "");
  }, [profile?.name, profile?.phone]);

  useEffect(() => {
    setSelectedZoneId(pickup ? null : zoneId);
  }, [pickup, zoneId]);

  const checkout = useQuery(SINGLE_VENDOR_CALCULATE_CHECKOUT, {
    variables: { isPickup: pickup, zoneId },
    fetchPolicy: "network-only",
  });
  const [placeOrder, placeState] = useMutation(SINGLE_VENDOR_PLACE_ORDER);
  useModeSensitiveOperation(placeState.loading);
  const summary = checkout.data?.calculateCheckout;

  const canSubmit =
    cart.length > 0 &&
    name.trim().length > 1 &&
    phone.trim().length >= 8 &&
    (pickup || (Boolean(zoneId) && address.trim().length > 3));

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
            : { label: "Livraison", deliveryAddress: address.trim(), details: "" },
          orderDate: new Date().toISOString(),
          isPickedUp: pickup,
          specialInstructions: instructions,
          instructions,
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
                Zone de livraison
                <select
                  value={zoneId ?? ""}
                  onChange={(event) => setZoneId(event.target.value || null)}
                  className={field}
                >
                  {zones.map((zone) => (
                    <option key={zone.id} value={zone.id}>
                      {zone.name} — {formatCurrency(zone.fee)}
                    </option>
                  ))}
                </select>
              </label>
              <label className="mt-4 block text-sm dark:text-gray-200">
                Adresse précise
                <input
                  value={address}
                  onChange={(event) => setAddress(event.target.value)}
                  placeholder="Repère, rue, en face de…"
                  className={field}
                />
              </label>
            </>
          )}
        </section>

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
          <div className="flex justify-between border-t pt-3 text-base font-bold dark:border-gray-700">
            <dt>Total</dt>
            <dd>{formatCurrency(summary?.grandTotal ?? 0)}</dd>
          </div>
        </dl>
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
