"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { loadMenu, type BouffItem, type BouffMenu, type BouffVariant } from "@/lib/bouff-data/catalog";
import {
  checkCounterSession,
  clearCounterSession,
  counterLogin,
  counterLogout,
  counterPlaceOrder,
  counterRecentOrders,
  isSessionError,
  listCashiers,
  readCounterSession,
  type CounterCashier,
} from "@/lib/bouff-data/counter";

const fcfa = (n: number) => `${n.toLocaleString("fr-FR").replace(/\u202f|\u00a0/g, " ")} F`;

interface TicketLine {
  key: string;
  item: BouffItem;
  variant: BouffVariant | null;
  optionIds: string[];
  optionNames: string[];
  unit: number;
  quantity: number;
}

const STATUS_LABEL: Record<string, string> = {
  received: "En attente cuisine",
  in_kitchen: "En préparation",
  ready: "Prête",
  delivered: "Remise",
  cancelled: "Annulée",
};

export default function CaissePage() {
  const [session, setSession] = useState<{ token: string; name: string } | null>(null);
  const [checked, setChecked] = useState(false);

  useEffect(() => {
    const s = readCounterSession();
    if (!s) {
      setChecked(true);
      return;
    }
    checkCounterSession(s.token)
      .then((r) => setSession({ token: s.token, name: r.name }))
      .catch(() => clearCounterSession())
      .finally(() => setChecked(true));
  }, []);

  if (!checked) return <Centered>Chargement…</Centered>;
  if (!session) return <Login onDone={setSession} />;
  return (
    <Register
      session={session}
      onLogout={async () => {
        await counterLogout(session.token).catch(() => clearCounterSession());
        setSession(null);
      }}
      onExpired={() => {
        clearCounterSession();
        setSession(null);
      }}
    />
  );
}

function Centered({ children }: { children: React.ReactNode }) {
  return <div className="flex min-h-screen items-center justify-center p-6 text-center text-bouff-text-muted">{children}</div>;
}

/* ---------------- Connexion ---------------- */

function Login({ onDone }: { onDone: (s: { token: string; name: string }) => void }) {
  const [cashiers, setCashiers] = useState<CounterCashier[] | null>(null);
  const [selected, setSelected] = useState<CounterCashier | null>(null);
  const [pin, setPin] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    listCashiers().then(setCashiers).catch((e) => setError(e.message));
  }, []);

  const submit = useCallback(
    async (code: string) => {
      if (!selected) return;
      setBusy(true);
      setError(null);
      try {
        const res = await counterLogin(selected.id, code);
        if (res.ok && res.token) onDone({ token: res.token, name: res.name ?? selected.name });
        else {
          setPin("");
          setError(
            res.remaining
              ? `Code incorrect. Encore ${res.remaining} essai${res.remaining > 1 ? "s" : ""}.`
              : "Code incorrect.",
          );
        }
      } catch (e) {
        setPin("");
        setError((e as Error).message);
      } finally {
        setBusy(false);
      }
    },
    [selected, onDone],
  );

  const press = (d: string) => {
    if (busy) return;
    const next = (pin + d).slice(0, 6);
    setPin(next);
    if (next.length === 6) void submit(next);
  };

  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-8 p-6">
      <div className="text-center">
        <p className="font-bouff-display text-5xl tracking-wide text-bouff-primary">BOUFF</p>
        <p className="mt-1 text-lg text-bouff-text-muted">Caisse comptoir</p>
      </div>

      {!selected ? (
        <div className="w-full max-w-2xl">
          <p className="mb-4 text-center text-xl">Qui est à la caisse ?</p>
          {cashiers === null && !error && <p className="text-center text-bouff-text-muted">Chargement…</p>}
          {cashiers?.length === 0 && (
            <p className="text-center text-bouff-text-muted">
              Aucune caissière n'est encore créée. Ajoute-les dans l'admin, rubrique « Caissières ».
            </p>
          )}
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-3">
            {cashiers?.map((c) => (
              <button
                key={c.id}
                onClick={() => {
                  setSelected(c);
                  setPin("");
                  setError(null);
                }}
                className="rounded-bouff-lg border border-bouff-line bg-bouff-surface p-6 text-2xl font-semibold transition hover:border-bouff-primary active:scale-95"
              >
                {c.name}
              </button>
            ))}
          </div>
        </div>
      ) : (
        <div className="flex w-full max-w-sm flex-col items-center gap-6">
          <p className="text-xl">
            Bonjour <span className="font-semibold text-bouff-primary">{selected.name}</span>, entre ton code
          </p>
          <div className="flex gap-3">
            {Array.from({ length: 6 }).map((_, i) => (
              <span
                key={i}
                className={`h-5 w-5 rounded-full border-2 border-bouff-primary ${i < pin.length ? "bg-bouff-primary" : ""}`}
              />
            ))}
          </div>
          <div className="grid w-full grid-cols-3 gap-3">
            {["1", "2", "3", "4", "5", "6", "7", "8", "9"].map((d) => (
              <Key key={d} onClick={() => press(d)}>{d}</Key>
            ))}
            <Key onClick={() => setPin(pin.slice(0, -1))}>⌫</Key>
            <Key onClick={() => press("0")}>0</Key>
            <Key onClick={() => { setSelected(null); setPin(""); setError(null); }}>↩</Key>
          </div>
        </div>
      )}
      {error && <p className="max-w-md text-center text-bouff-danger">{error}</p>}
    </div>
  );
}

function Key({ children, onClick }: { children: React.ReactNode; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className="h-20 rounded-bouff-md bg-bouff-surface-raised text-3xl font-semibold active:scale-95 active:bg-bouff-primary active:text-bouff-on-primary"
    >
      {children}
    </button>
  );
}

/* ---------------- Caisse ---------------- */

function Register({
  session,
  onLogout,
  onExpired,
}: {
  session: { token: string; name: string };
  onLogout: () => void;
  onExpired: () => void;
}) {
  const [menu, setMenu] = useState<BouffMenu | null>(null);
  const [menuError, setMenuError] = useState<string | null>(null);
  const [category, setCategory] = useState<string | null>(null);
  const [lines, setLines] = useState<TicketLine[]>([]);
  const [picking, setPicking] = useState<BouffItem | null>(null);
  const [dineIn, setDineIn] = useState(true);
  const [customerName, setCustomerName] = useState("");
  const [customerPhone, setCustomerPhone] = useState("");
  const [confirmPay, setConfirmPay] = useState<"cash" | "mobile_money" | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<{ number: string; total: number; points: boolean } | null>(null);
  const [showRecent, setShowRecent] = useState(false);

  useEffect(() => {
    loadMenu(true)
      .then((m) => {
        setMenu(m);
        setCategory(m.categories.find((c) => c.items.length)?.id ?? null);
      })
      .catch((e) => setMenuError(e.message));
  }, []);

  const total = useMemo(() => lines.reduce((s, l) => s + l.unit * l.quantity, 0), [lines]);
  const items = menu?.categories.find((c) => c.id === category)?.items ?? [];

  const addLine = (line: Omit<TicketLine, "key" | "quantity">) => {
    const key = [line.item.id, line.variant?.id ?? "", [...line.optionIds].sort().join("-")].join("|");
    setLines((prev) => {
      const found = prev.find((l) => l.key === key);
      if (found) return prev.map((l) => (l.key === key ? { ...l, quantity: l.quantity + 1 } : l));
      return [...prev, { ...line, key, quantity: 1 }];
    });
  };

  const tapItem = (item: BouffItem) => {
    if (item.isOutOfStock) return;
    const variants = item.variations.filter((v) => !v.isOutOfStock);
    if (variants.length <= 1 && item.optionGroups.length === 0) {
      const v = variants[0] ?? null;
      addLine({ item, variant: v, optionIds: [], optionNames: [], unit: v?.price ?? 0 });
    } else setPicking(item);
  };

  const changeQty = (key: string, delta: number) =>
    setLines((prev) =>
      prev.map((l) => (l.key === key ? { ...l, quantity: l.quantity + delta } : l)).filter((l) => l.quantity > 0),
    );

  const reset = () => {
    setLines([]);
    setCustomerName("");
    setCustomerPhone("");
    setDineIn(true);
    setError(null);
  };

  const pay = async (payment: "cash" | "mobile_money") => {
    setBusy(true);
    setError(null);
    try {
      const res = await counterPlaceOrder({
        token: session.token,
        items: lines.map((l) => ({
          menu_item_id: l.item.id,
          variant_id: l.variant?.id ?? null,
          option_ids: l.optionIds,
          quantity: l.quantity,
        })),
        dineIn,
        payment,
        customerName: customerName.trim(),
        customerPhone: customerPhone.trim(),
      });
      setConfirmPay(null);
      setDone({ number: res.order_number, total: res.total_fcfa, points: res.points_linked });
      reset();
    } catch (e) {
      setConfirmPay(null);
      if (isSessionError(e)) onExpired();
      else setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  if (menuError) return <Centered>Impossible de charger le menu : {menuError}</Centered>;
  if (!menu) return <Centered>Chargement du menu…</Centered>;

  return (
    <div className="flex h-screen flex-col">
      <header className="flex items-center justify-between border-b border-bouff-line bg-bouff-surface px-5 py-3">
        <div className="flex items-baseline gap-3">
          <span className="font-bouff-display text-3xl text-bouff-primary">BOUFF</span>
          <span className="text-bouff-text-muted">Caisse · {session.name}</span>
        </div>
        <div className="flex gap-2">
          <button onClick={() => setShowRecent(true)} className="rounded-bouff-md border border-bouff-line px-4 py-2">
            Commandes du jour
          </button>
          <button onClick={onLogout} className="rounded-bouff-md border border-bouff-line px-4 py-2 text-bouff-text-muted">
            Changer de caissière
          </button>
        </div>
      </header>

      <div className="flex min-h-0 flex-1">
        {/* Produits */}
        <section className="flex min-h-0 flex-[2] flex-col">
          <nav className="flex gap-2 overflow-x-auto border-b border-bouff-line px-4 py-3">
            {menu.categories
              .filter((c) => c.items.length)
              .map((c) => (
                <button
                  key={c.id}
                  onClick={() => setCategory(c.id)}
                  className={`whitespace-nowrap rounded-full px-5 py-2 text-lg font-semibold ${
                    c.id === category ? "bg-bouff-primary text-bouff-on-primary" : "bg-bouff-surface-raised"
                  }`}
                >
                  {c.name}
                </button>
              ))}
          </nav>
          <div className="grid flex-1 auto-rows-min grid-cols-2 gap-3 overflow-y-auto p-4 lg:grid-cols-3 xl:grid-cols-4">
            {items.map((item) => {
              const prices = item.variations.map((v) => v.price);
              const from = prices.length ? Math.min(...prices) : 0;
              return (
                <button
                  key={item.id}
                  onClick={() => tapItem(item)}
                  disabled={item.isOutOfStock}
                  className="flex flex-col overflow-hidden rounded-bouff-lg border border-bouff-line bg-bouff-surface text-left transition active:scale-95 disabled:opacity-40"
                >
                  {item.image ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={item.image} alt="" className="h-28 w-full object-cover" loading="lazy" />
                  ) : (
                    <div className="h-28 w-full bg-bouff-surface-raised" />
                  )}
                  <div className="p-3">
                    <p className="font-semibold leading-tight">{item.title}</p>
                    <p className="mt-1 text-bouff-primary">
                      {item.isOutOfStock ? "Rupture" : `${prices.length > 1 ? "dès " : ""}${fcfa(from)}`}
                    </p>
                  </div>
                </button>
              );
            })}
          </div>
        </section>

        {/* Ticket */}
        <aside className="flex min-h-0 flex-1 flex-col border-l border-bouff-line bg-bouff-surface">
          <div className="grid grid-cols-2 gap-2 p-4">
            {[
              { v: true, label: "Sur place" },
              { v: false, label: "À emporter" },
            ].map((o) => (
              <button
                key={o.label}
                onClick={() => setDineIn(o.v)}
                className={`rounded-bouff-md py-3 text-lg font-semibold ${
                  dineIn === o.v ? "bg-bouff-primary text-bouff-on-primary" : "bg-bouff-surface-raised"
                }`}
              >
                {o.label}
              </button>
            ))}
          </div>

          <div className="flex-1 overflow-y-auto px-4">
            {lines.length === 0 && <p className="py-10 text-center text-bouff-text-muted">Touche un produit pour l'ajouter.</p>}
            {lines.map((l) => (
              <div key={l.key} className="flex items-center gap-3 border-b border-bouff-line py-3">
                <div className="min-w-0 flex-1">
                  <p className="font-semibold">
                    {l.item.title}
                    {l.variant && l.item.variations.length > 1 ? ` · ${l.variant.title}` : ""}
                  </p>
                  {l.optionNames.length > 0 && <p className="text-sm text-bouff-text-muted">{l.optionNames.join(", ")}</p>}
                  <p className="text-sm text-bouff-text-muted">{fcfa(l.unit)}</p>
                </div>
                <div className="flex items-center gap-2">
                  <button onClick={() => changeQty(l.key, -1)} className="h-10 w-10 rounded-full bg-bouff-surface-raised text-xl">–</button>
                  <span className="w-6 text-center text-lg">{l.quantity}</span>
                  <button onClick={() => changeQty(l.key, 1)} className="h-10 w-10 rounded-full bg-bouff-surface-raised text-xl">+</button>
                </div>
              </div>
            ))}
          </div>

          <div className="space-y-3 border-t border-bouff-line p-4">
            <div className="grid grid-cols-2 gap-2">
              <input
                value={customerName}
                onChange={(e) => setCustomerName(e.target.value)}
                placeholder="Prénom (facultatif)"
                className="rounded-bouff-md border border-bouff-line bg-bouff-background px-3 py-2"
              />
              <input
                value={customerPhone}
                onChange={(e) => setCustomerPhone(e.target.value)}
                placeholder="N° pour ses points"
                inputMode="tel"
                className="rounded-bouff-md border border-bouff-line bg-bouff-background px-3 py-2"
              />
            </div>
            <div className="flex items-baseline justify-between">
              <span className="text-lg text-bouff-text-muted">Total</span>
              <span className="font-bouff-display text-4xl">{fcfa(total)}</span>
            </div>
            {error && <p className="text-bouff-danger">{error}</p>}
            <div className="grid grid-cols-2 gap-2">
              <button
                disabled={!lines.length || busy}
                onClick={() => setConfirmPay("cash")}
                className="rounded-bouff-md bg-bouff-primary py-4 text-xl font-bold text-bouff-on-primary disabled:opacity-40"
              >
                Espèces
              </button>
              <button
                disabled={!lines.length || busy}
                onClick={() => setConfirmPay("mobile_money")}
                className="rounded-bouff-md border-2 border-bouff-primary py-4 text-xl font-bold text-bouff-primary disabled:opacity-40"
              >
                MoMo
              </button>
            </div>
            {lines.length > 0 && (
              <button onClick={reset} className="w-full py-1 text-sm text-bouff-text-muted">
                Vider le ticket
              </button>
            )}
          </div>
        </aside>
      </div>

      {picking && (
        <ItemPicker
          item={picking}
          onClose={() => setPicking(null)}
          onAdd={(line) => {
            addLine(line);
            setPicking(null);
          }}
        />
      )}

      {confirmPay && (
        <Modal onClose={() => !busy && setConfirmPay(null)}>
          <p className="text-center text-xl">
            {confirmPay === "cash" ? "Encaisse en espèces" : "Vérifie que le MoMo est bien reçu"}
          </p>
          <p className="my-4 text-center font-bouff-display text-6xl text-bouff-primary">{fcfa(total)}</p>
          <p className="mb-6 text-center text-bouff-text-muted">{dineIn ? "Sur place" : "À emporter"}</p>
          <div className="grid grid-cols-2 gap-3">
            <button onClick={() => setConfirmPay(null)} disabled={busy} className="rounded-bouff-md bg-bouff-surface-raised py-4 text-lg">
              Retour
            </button>
            <button
              onClick={() => pay(confirmPay)}
              disabled={busy}
              className="rounded-bouff-md bg-bouff-primary py-4 text-lg font-bold text-bouff-on-primary disabled:opacity-50"
            >
              {busy ? "Envoi…" : confirmPay === "cash" ? "Argent reçu" : "MoMo reçu"}
            </button>
          </div>
        </Modal>
      )}

      {done && (
        <Modal onClose={() => setDone(null)}>
          <p className="text-center text-xl text-bouff-text-muted">Commande envoyée en cuisine</p>
          <p className="my-6 text-center font-bouff-display text-8xl text-bouff-primary">{done.number}</p>
          <p className="text-center text-lg">Donne ce numéro au client · {fcfa(done.total)}</p>
          {done.points && <p className="mt-2 text-center text-bouff-success">Points BOUFF ajoutés à son compte à la remise.</p>}
          <button onClick={() => setDone(null)} className="mt-8 w-full rounded-bouff-md bg-bouff-primary py-4 text-xl font-bold text-bouff-on-primary">
            Client suivant
          </button>
        </Modal>
      )}

      {showRecent && <RecentOrders token={session.token} onClose={() => setShowRecent(false)} onExpired={onExpired} />}
    </div>
  );
}

function Modal({ children, onClose }: { children: React.ReactNode; onClose: () => void }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-bouff-overlay p-4" onClick={onClose}>
      <div
        className="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-bouff-lg border border-bouff-line bg-bouff-surface p-6"
        onClick={(e) => e.stopPropagation()}
      >
        {children}
      </div>
    </div>
  );
}

function ItemPicker({
  item,
  onClose,
  onAdd,
}: {
  item: BouffItem;
  onClose: () => void;
  onAdd: (line: Omit<TicketLine, "key" | "quantity">) => void;
}) {
  const variants = item.variations.filter((v) => !v.isOutOfStock);
  const [variant, setVariant] = useState<BouffVariant | null>(
    variants.find((v) => v.isDefault) ?? variants[0] ?? null,
  );
  const [selected, setSelected] = useState<Record<string, string[]>>({});

  const groups = item.optionGroups.filter((g) => !g.appliesToKind || g.appliesToKind === variant?.kind);
  const allOptions = groups.flatMap((g) => g.options);
  const chosenIds = groups.flatMap((g) => selected[g.id] ?? []);
  const unit = (variant?.price ?? 0) + chosenIds.reduce((s, id) => s + (allOptions.find((o) => o.id === id)?.price ?? 0), 0);
  const missing = groups.find((g) => (selected[g.id]?.length ?? 0) < g.quantityMinimum);

  const toggle = (groupId: string, optionId: string, max: number) =>
    setSelected((prev) => {
      const cur = prev[groupId] ?? [];
      if (cur.includes(optionId)) return { ...prev, [groupId]: cur.filter((x) => x !== optionId) };
      if (max === 1) return { ...prev, [groupId]: [optionId] };
      if (cur.length >= max) return prev;
      return { ...prev, [groupId]: [...cur, optionId] };
    });

  return (
    <Modal onClose={onClose}>
      <p className="mb-4 text-2xl font-semibold">{item.title}</p>
      {variants.length > 1 && (
        <div className="mb-5 grid grid-cols-3 gap-2">
          {variants.map((v) => (
            <button
              key={v.id}
              onClick={() => setVariant(v)}
              className={`rounded-bouff-md p-3 text-left ${
                variant?.id === v.id ? "bg-bouff-primary text-bouff-on-primary" : "bg-bouff-surface-raised"
              }`}
            >
              <p className="font-semibold">{v.title}</p>
              <p className="text-sm">{fcfa(v.price)}</p>
            </button>
          ))}
        </div>
      )}
      {groups.map((g) => (
        <div key={g.id} className="mb-4">
          <p className="mb-2 font-semibold">
            {g.title}
            <span className="ml-2 text-sm font-normal text-bouff-text-muted">
              {g.quantityMinimum > 0 ? "obligatoire" : "facultatif"}
              {g.quantityMaximum > 1 ? ` · ${g.quantityMaximum} max` : ""}
            </span>
          </p>
          <div className="grid grid-cols-2 gap-2">
            {g.options
              .filter((o) => o.isAvailable)
              .map((o) => {
                const on = (selected[g.id] ?? []).includes(o.id);
                return (
                  <button
                    key={o.id}
                    onClick={() => toggle(g.id, o.id, g.quantityMaximum)}
                    className={`rounded-bouff-md border p-3 text-left ${
                      on ? "border-bouff-primary bg-bouff-primary-soft" : "border-bouff-line"
                    }`}
                  >
                    {o.title}
                    {o.price > 0 && <span className="ml-1 text-bouff-text-muted">+{fcfa(o.price)}</span>}
                  </button>
                );
              })}
          </div>
        </div>
      ))}
      <button
        disabled={!!missing}
        onClick={() =>
          onAdd({
            item,
            variant,
            optionIds: chosenIds,
            optionNames: chosenIds.map((id) => allOptions.find((o) => o.id === id)?.title ?? ""),
            unit,
          })
        }
        className="mt-2 w-full rounded-bouff-md bg-bouff-primary py-4 text-xl font-bold text-bouff-on-primary disabled:opacity-40"
      >
        {missing ? `Choisis : ${missing.title}` : `Ajouter · ${fcfa(unit)}`}
      </button>
    </Modal>
  );
}

function RecentOrders({ token, onClose, onExpired }: { token: string; onClose: () => void; onExpired: () => void }) {
  const [rows, setRows] = useState<Awaited<ReturnType<typeof counterRecentOrders>> | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    counterRecentOrders(token)
      .then(setRows)
      .catch((e) => (isSessionError(e) ? onExpired() : setError(e.message)));
  }, [token, onExpired]);

  return (
    <Modal onClose={onClose}>
      <p className="mb-4 text-2xl font-semibold">Commandes du comptoir</p>
      {error && <p className="text-bouff-danger">{error}</p>}
      {!rows && !error && <p className="text-bouff-text-muted">Chargement…</p>}
      {rows?.length === 0 && <p className="text-bouff-text-muted">Aucune commande pour l'instant.</p>}
      {rows?.map((r) => (
        <div key={r.order_number} className="flex items-center justify-between border-b border-bouff-line py-3">
          <div>
            <p className="font-semibold">
              {r.order_number} · {r.customer_name}
            </p>
            <p className="text-sm text-bouff-text-muted">
              {new Date(r.created_at).toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" })} ·{" "}
              {r.dine_in ? "Sur place" : "À emporter"} · {r.payment_method === "mobile_money" ? "MoMo" : "Espèces"}
            </p>
          </div>
          <div className="text-right">
            <p>{fcfa(r.total_fcfa)}</p>
            <p className="text-sm text-bouff-primary">{STATUS_LABEL[r.status] ?? r.status}</p>
          </div>
        </div>
      ))}
      <button onClick={onClose} className="mt-4 w-full rounded-bouff-md bg-bouff-surface-raised py-3">
        Fermer
      </button>
    </Modal>
  );
}
