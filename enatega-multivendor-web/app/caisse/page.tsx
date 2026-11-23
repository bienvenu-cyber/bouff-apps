"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { loadMenu, type BouffItem, type BouffMenu, type BouffVariant } from "@/lib/bouff-data/catalog";
import {
  checkCounterSession,
  clearCounterSession,
  counterLogin,
  counterLogout,
  counterCancelOrder,
  counterCompleteOrder,
  counterCloseDay,
  counterDaySummary,
  counterOrderReceipt,
  counterOrderReceipts,
  counterPlaceOrder,
  counterRecentOrders,
  counterUpdateOrder,
  isSessionError,
  listCashiers,
  readCounterSession,
  type CounterCashier,
  type CounterDaySummary,
} from "@/lib/bouff-data/counter";
import type { Receipt, ReceiptExtras } from "@/lib/bouff-data/receipt";
import { canEditCounterOrder, editSettlement, normalizeTable, type EditSettlement } from "@/lib/bouff-data/till";
import ReceiptSheet from "./ReceiptSheet";

const fcfa = (n: number) => `${n.toLocaleString("fr-FR").replace(/\u202f|\u00a0/g, " ")} F`;

// Billets courants : compte juste + coupures supérieures au total.
function cashSuggestions(total: number) {
  const out = [total];
  for (const step of [500, 1000, 2000, 5000, 10000]) {
    const v = Math.ceil(total / step) * step;
    if (v > total && !out.includes(v)) out.push(v);
  }
  return out.slice(0, 6);
}

interface TicketLine {
  key: string;
  item: BouffItem;
  variant: BouffVariant | null;
  optionIds: string[];
  optionNames: string[];
  unit: number;
  quantity: number;
}

// Ticket en cours gardé sur la tablette : une actualisation ne vide plus la commande.
const TICKET_KEY = "bouff/counter-ticket";
interface SavedTicket {
  lines: { itemId: string; variantId: string | null; optionIds: string[]; quantity: number }[];
  dineIn: boolean;
  customerName: string;
  customerPhone: string;
  tableLabel?: string;
  editing?: EditingOrder | null;
}

// Commande déjà payée en cours de modification (avant acceptation cuisine).
interface EditingOrder {
  orderId: string;
  number: string;
  oldTotal: number;
  payment: string;
}

type RecentRow = Awaited<ReturnType<typeof counterRecentOrders>>[number];

// Onglets calculés depuis la carte : toute nouvelle catégorie, tout nouveau plat ou
// combo ajouté dans l'admin apparaît ici sans toucher au code.
const COMBOS_TAB = "__combos";
const AUTOPRINT_KEY = "bouff/counter-autoprint";
const COMBO_KIND = "combo";

function buildLine(item: BouffItem, variant: BouffVariant | null, optionIds: string[]) {
  const options = item.optionGroups.flatMap((g) => g.options);
  const picked = optionIds.map((id) => options.find((o) => o.id === id)).filter(Boolean) as { id: string; title: string; price: number }[];
  return {
    item,
    variant,
    optionIds: picked.map((o) => o.id),
    optionNames: picked.map((o) => o.title),
    unit: (variant?.price ?? 0) + picked.reduce((sum, o) => sum + o.price, 0),
  };
}

function lineKey(line: { item: BouffItem; variant: BouffVariant | null; optionIds: string[] }) {
  return [line.item.id, line.variant?.id ?? "", [...line.optionIds].sort().join("-")].join("|");
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
              Aucune hôtesse n&apos;est encore créée. Ajoute-les dans l&apos;admin, rubrique « Hôtesses ».
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
  const [picking, setPicking] = useState<{ item: BouffItem; kind?: string } | null>(null);
  const [restored, setRestored] = useState(false);
  const [dineIn, setDineIn] = useState(true);
  const [customerName, setCustomerName] = useState("");
  const [customerPhone, setCustomerPhone] = useState("");
  const [tableLabel, setTableLabel] = useState("");
  const [editing, setEditing] = useState<EditingOrder | null>(null);
  const [confirmEdit, setConfirmEdit] = useState(false);
  const [confirmPay, setConfirmPay] = useState<"cash" | "mobile_money" | null>(null);
  const [received, setReceived] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<{
    orderId: string;
    number: string;
    total: number;
    points: boolean;
    dineIn: boolean;
    table: string | null;
    change: number | null;
    edit?: EditSettlement & { payment: string };
  } | null>(null);
  const [printJob, setPrintJob] = useState<{ receipts: Receipt[]; extras: ReceiptExtras; at: number } | null>(null);
  const [printing, setPrinting] = useState(false);
  const [printError, setPrintError] = useState<string | null>(null);
  const [autoPrint, setAutoPrint] = useState(false);
  useEffect(() => {
    setAutoPrint(window.localStorage.getItem(AUTOPRINT_KEY) === "1");
  }, []);
  const toggleAutoPrint = (on: boolean) => {
    setAutoPrint(on);
    window.localStorage.setItem(AUTOPRINT_KEY, on ? "1" : "0");
  };

  // Le reçu est toujours relu depuis la base : prix et numéro exacts, même en réimpression.
  const printReceipt = async (orderIds: string | string[], extras: ReceiptExtras = {}) => {
    if (printing) return;
    const ids = Array.isArray(orderIds) ? orderIds : [orderIds];
    if (!ids.length) return;
    setPrinting(true);
    setPrintError(null);
    try {
      const receipts =
        ids.length === 1 ? [await counterOrderReceipt(session.token, ids[0])] : await counterOrderReceipts(session.token, ids);
      setPrintJob({ receipts, extras, at: Date.now() });
    } catch (e) {
      if (isSessionError(e)) onExpired();
      else setPrintError(`Reçu non imprimé : ${(e as Error).message}`);
    } finally {
      setPrinting(false);
    }
  };

  useEffect(() => {
    if (!printJob) return;
    let cancelled = false;
    const ready = document.fonts?.ready ?? Promise.resolve();
    void ready.then(() => {
      if (!cancelled) window.setTimeout(() => window.print(), 60);
    });
    return () => {
      cancelled = true;
    };
  }, [printJob]);
  const [showRecent, setShowRecent] = useState(false);
  const [showClose, setShowClose] = useState(false);
  const [ticketOpen, setTicketOpen] = useState(false);
  useEffect(() => {
    if (!lines.length) setTicketOpen(false);
  }, [lines.length]);

  useEffect(() => {
    loadMenu(true)
      .then((m) => {
        setMenu(m);
        try {
          const saved = JSON.parse(window.localStorage.getItem(TICKET_KEY) ?? "null") as SavedTicket | null;
          if (saved) {
            const back: TicketLine[] = [];
            for (const l of saved.lines ?? []) {
              const item = m.items.find((i) => i.id === l.itemId && !i.isOutOfStock);
              if (!item) continue;
              const variant = l.variantId ? item.variations.find((v) => v.id === l.variantId && !v.isOutOfStock) : null;
              if (l.variantId && !variant) continue;
              const line = buildLine(item, variant ?? null, l.optionIds ?? []);
              back.push({ ...line, key: lineKey(line), quantity: Math.max(1, l.quantity) });
            }
            setLines(back);
            setDineIn(saved.dineIn ?? true);
            setCustomerName(saved.customerName ?? "");
            setCustomerPhone(saved.customerPhone ?? "");
            setTableLabel(saved.tableLabel ?? "");
            setEditing(saved.editing ?? null);
          }
        } catch {
          /* ticket illisible : on repart d'un ticket vide */
        }
        setRestored(true);
      })
      .catch((e) => setMenuError(e.message));
  }, []);

  useEffect(() => {
    if (!restored) return;
    const saved: SavedTicket = {
      lines: lines.map((l) => ({ itemId: l.item.id, variantId: l.variant?.id ?? null, optionIds: l.optionIds, quantity: l.quantity })),
      dineIn,
      customerName,
      customerPhone,
      tableLabel,
      editing,
    };
    window.localStorage.setItem(TICKET_KEY, JSON.stringify(saved));
  }, [restored, lines, dineIn, customerName, customerPhone, tableLabel, editing]);

  const tabs = useMemo(() => {
    if (!menu) return [];
    const comboItems = menu.items.filter((i) => i.variations.some((v) => v.kind === COMBO_KIND));
    return [
      { id: COMBOS_TAB, name: "Nos combos", items: comboItems },
      ...menu.categories.map((c) => ({ id: c.id, name: c.name, items: c.items })),
    ].filter((t) => t.items.length);
  }, [menu]);

  useEffect(() => {
    if (tabs.length && !tabs.some((t) => t.id === category)) setCategory(tabs[0].id);
  }, [tabs, category]);

  const total = useMemo(() => lines.reduce((s, l) => s + l.unit * l.quantity, 0), [lines]);
  const items = tabs.find((t) => t.id === category)?.items ?? [];
  const comboTab = category === COMBOS_TAB;

  const addLine = (line: Omit<TicketLine, "key" | "quantity">) => {
    const key = lineKey(line);
    setLines((prev) => {
      const found = prev.find((l) => l.key === key);
      if (found) return prev.map((l) => (l.key === key ? { ...l, quantity: l.quantity + 1 } : l));
      return [...prev, { ...line, key, quantity: 1 }];
    });
  };

  const tapItem = (item: BouffItem, kind?: string) => {
    if (item.isOutOfStock) return;
    const variants = item.variations.filter((v) => !v.isOutOfStock && (!kind || v.kind === kind));
    if (variants.length <= 1 && item.optionGroups.length === 0) {
      addLine(buildLine(item, variants[0] ?? null, []));
    } else setPicking({ item, kind });
  };

  const changeQty = (key: string, delta: number) =>
    setLines((prev) =>
      prev.map((l) => (l.key === key ? { ...l, quantity: l.quantity + delta } : l)).filter((l) => l.quantity > 0),
    );

  const reset = () => {
    setLines([]);
    setCustomerName("");
    setCustomerPhone("");
    setTableLabel("");
    setDineIn(true);
    setEditing(null);
    setError(null);
  };

  const ticketBusy = () => lines.length > 0 || editing !== null;
  const confirmDropTicket = () =>
    !ticketBusy() || window.confirm("Le ticket en cours sera vidé. Continuer ?");

  // Recharge une commande payée dans le ticket pour la corriger (avant acceptation cuisine).
  const startEdit = (row: RecentRow) => {
    if (!menu || !canEditCounterOrder(row.status) || !confirmDropTicket()) return;
    const back: TicketLine[] = [];
    const missing: string[] = [];
    for (const l of row.lines) {
      const item = menu.items.find((i) => i.id === l.menu_item_id && !i.isOutOfStock);
      const variant = item && l.variant_id ? item.variations.find((v) => v.id === l.variant_id && !v.isOutOfStock) : null;
      if (!item || (l.variant_id && !variant)) {
        missing.push(l.name);
        continue;
      }
      const line = buildLine(item, variant ?? null, l.option_ids ?? []);
      const key = lineKey(line);
      const found = back.find((b) => b.key === key);
      if (found) found.quantity += l.quantity;
      else back.push({ ...line, key, quantity: l.quantity });
    }
    setLines(back);
    setDineIn(row.dine_in);
    setTableLabel(row.table_label ?? "");
    setCustomerName(row.customer_name === "Client comptoir" ? "" : row.customer_name);
    setCustomerPhone(row.customer_phone ?? "");
    setEditing({ orderId: row.id, number: row.order_number, oldTotal: row.total_fcfa, payment: row.payment_method });
    setError(missing.length ? `Plus disponible, retiré du ticket : ${missing.join(", ")}` : null);
    setShowRecent(false);
    setTicketOpen(true);
  };

  // Ajout en cours de repas : nouvelle petite commande payée, même table et même client.
  const addToTable = (row: RecentRow) => {
    if (!confirmDropTicket()) return;
    reset();
    setDineIn(true);
    setTableLabel(row.table_label ?? "");
    setCustomerName(row.customer_name === "Client comptoir" ? "" : row.customer_name);
    setCustomerPhone(row.customer_phone ?? "");
    setShowRecent(false);
  };

  const saveEdit = async (extra: number | null) => {
    if (!editing) return;
    setBusy(true);
    setError(null);
    try {
      const res = await counterUpdateOrder({
        token: session.token,
        orderId: editing.orderId,
        items: lines.map((l) => ({
          menu_item_id: l.item.id,
          variant_id: l.variant?.id ?? null,
          option_ids: l.optionIds,
          quantity: l.quantity,
        })),
        dineIn,
        tableLabel: normalizeTable(dineIn, tableLabel),
        extraReceived: extra,
      });
      const settle = editSettlement(res.old_total_fcfa, res.total_fcfa);
      setConfirmEdit(false);
      setDone({
        orderId: res.order_id,
        number: res.order_number,
        total: res.total_fcfa,
        points: false,
        dineIn,
        table: res.table_label,
        change: settle.kind === "collect" && extra !== null ? Math.max(0, extra - settle.amount) : null,
        edit: { ...settle, payment: res.payment_method },
      });
      setPrintError(null);
      if (autoPrint) void printReceipt(res.order_id);
      setTicketOpen(false);
      reset();
    } catch (e) {
      setConfirmEdit(false);
      if (isSessionError(e)) onExpired();
      else setError((e as Error).message);
    } finally {
      setBusy(false);
    }
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
        tableLabel: normalizeTable(dineIn, tableLabel),
        cashReceived: payment === "cash" && received !== "" ? Number(received) : null,
      });
      setConfirmPay(null);
      setDone({
        orderId: res.order_id,
        number: res.order_number,
        total: res.total_fcfa,
        points: res.points_linked,
        dineIn,
        table: res.table_label,
        change: res.change_fcfa,
      });
      setPrintError(null);
      if (autoPrint) void printReceipt(res.order_id, { pointsLinked: res.points_linked });
      setReceived("");
      setTicketOpen(false);
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
    <div className="flex h-[100dvh] flex-col overflow-hidden">
      <header className="flex shrink-0 items-center justify-between gap-3 border-b border-bouff-line bg-bouff-surface px-5 py-3">
        <div className="flex min-w-0 items-baseline gap-3">
          <span className="shrink-0 font-bouff-display text-3xl text-bouff-primary">BOUFF</span>
          <span className="truncate text-bouff-text-muted">Caisse · {session.name}</span>
        </div>
        <div className="flex shrink-0 gap-2">
          <button onClick={() => setShowRecent(true)} className="rounded-bouff-md border border-bouff-line px-4 py-2">
            <span className="sm:hidden">Ventes</span><span className="hidden sm:inline">Commandes du jour</span>
          </button>
          <button onClick={() => setShowClose(true)} className="rounded-bouff-md border border-bouff-primary px-4 py-2 text-bouff-primary">
            <span className="sm:hidden">Clôture</span><span className="hidden sm:inline">Clôturer ma caisse</span>
          </button>
          <button onClick={onLogout} className="rounded-bouff-md border border-bouff-line px-4 py-2 text-bouff-text-muted">
            <span className="sm:hidden">Changer</span><span className="hidden sm:inline">Changer d&apos;hôtesse</span>
          </button>
        </div>
      </header>

      <div className="flex min-h-0 flex-1 flex-col md:flex-row">
        {/* Produits */}
        <section className="flex min-h-0 min-w-0 flex-1 flex-col">
          <nav className="flex shrink-0 gap-2 overflow-x-auto border-b border-bouff-line px-4 py-3">
            {tabs.map((c) => (
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
          <div className="grid flex-1 auto-rows-min grid-cols-2 gap-3 overflow-y-auto p-3 sm:grid-cols-[repeat(auto-fill,minmax(170px,1fr))] sm:gap-4 sm:p-5 xl:grid-cols-[repeat(auto-fill,minmax(220px,1fr))]">
            {items.map((item) => {
              const prices = item.variations.filter((v) => !comboTab || v.kind === COMBO_KIND).map((v) => v.price);
              const from = prices.length ? Math.min(...prices) : 0;
              return (
                <button
                  key={item.id}
                  onClick={() => tapItem(item, comboTab ? COMBO_KIND : undefined)}
                  disabled={item.isOutOfStock}
                  className="flex min-w-0 flex-col overflow-hidden rounded-bouff-lg border border-bouff-line bg-bouff-surface text-left transition active:scale-95 disabled:opacity-40"
                >
                  {item.image ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={item.image} alt="" className="aspect-[4/3] w-full object-cover" loading="lazy" />
                  ) : (
                    <div className="aspect-[4/3] w-full bg-bouff-surface-raised" />
                  )}
                  <div className="p-3 lg:p-4">
                    <p className="line-clamp-2 text-base font-semibold leading-tight lg:text-xl">{item.title}</p>
                    <p className="mt-1 text-base text-bouff-primary lg:text-lg">
                      {item.isOutOfStock ? "Rupture" : `${prices.length > 1 ? "dès " : ""}${fcfa(from)}`}
                    </p>
                  </div>
                </button>
              );
            })}
          </div>
        </section>

        {/* Ticket */}
        {ticketOpen && (
          <div className="fixed inset-0 z-30 bg-bouff-background/70 md:hidden" onClick={() => setTicketOpen(false)} />
        )}
        <aside
          className={`${ticketOpen ? "flex" : "hidden"} fixed inset-x-0 bottom-0 z-40 max-h-[88dvh] min-h-0 w-full flex-col rounded-t-bouff-lg border-t border-bouff-line bg-bouff-surface md:static md:z-auto md:flex md:max-h-none md:w-[clamp(300px,32vw,400px)] md:shrink-0 md:rounded-none md:border-t-0 md:border-l`}
        >
          <div className="flex items-center justify-between px-4 pt-3 md:hidden">
            <span className="text-lg font-semibold">Ticket</span>
            <button onClick={() => setTicketOpen(false)} aria-label="Fermer le ticket" className="h-10 w-10 rounded-full bg-bouff-surface-raised text-xl">✕</button>
          </div>
          <div className="grid grid-cols-2 gap-2 p-4">
            {[
              { v: true, label: "Sur place" },
              { v: false, label: "À emporter" },
            ].map((o) => (
              <button
                key={o.label}
                onClick={() => setDineIn(o.v)}
                className={`min-w-0 truncate rounded-bouff-md px-2 py-3 text-base font-semibold lg:text-lg ${
                  dineIn === o.v ? "bg-bouff-primary text-bouff-on-primary" : "bg-bouff-surface-raised"
                }`}
              >
                {o.label}
              </button>
            ))}
            {dineIn && (
              <input
                value={tableLabel}
                onChange={(e) => setTableLabel(e.target.value.slice(0, 12))}
                placeholder="N° de table (facultatif)"
                aria-label="Numéro de table"
                className="col-span-2 w-full min-w-0 rounded-bouff-md border border-bouff-line bg-bouff-background px-3 py-2 text-bouff-text placeholder:text-bouff-text-muted placeholder:opacity-100"
              />
            )}
          </div>
          {editing && (
            <div className="mx-4 mb-2 flex items-center justify-between gap-2 rounded-bouff-md border border-bouff-primary bg-bouff-primary-soft px-3 py-2">
              <span className="min-w-0 text-sm">
                Modification de <span className="font-semibold">{editing.number}</span> · payée <span className="whitespace-nowrap">{fcfa(editing.oldTotal)}</span>
              </span>
              <button onClick={reset} className="shrink-0 text-sm text-bouff-text-muted underline">
                Abandonner
              </button>
            </div>
          )}

          <div className="flex-1 overflow-y-auto px-4">
            {lines.length === 0 && <p className="py-10 text-center text-bouff-text-muted">Touche un produit pour l&apos;ajouter.</p>}
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
            <div className="grid grid-cols-1 gap-2 lg:grid-cols-2">
              <input
                value={customerName}
                disabled={!!editing}
                onChange={(e) => setCustomerName(e.target.value)}
                placeholder="Prénom client"
                className="w-full min-w-0 rounded-bouff-md border border-bouff-line bg-bouff-background px-3 py-2 text-bouff-text placeholder:text-bouff-text-muted placeholder:opacity-100"
              />
              <input
                value={customerPhone}
                disabled={!!editing}
                onChange={(e) => setCustomerPhone(e.target.value)}
                placeholder="N° (points)"
                inputMode="tel"
                className="w-full min-w-0 rounded-bouff-md border border-bouff-line bg-bouff-background px-3 py-2 text-bouff-text placeholder:text-bouff-text-muted placeholder:opacity-100"
              />
            </div>
            <div className="flex items-baseline justify-between">
              <span className="text-lg text-bouff-text-muted">Total</span>
              <span className="font-bouff-display text-3xl lg:text-4xl">{fcfa(total)}</span>
            </div>
            {error && <p className="text-bouff-danger">{error}</p>}
            {editing ? (
              <button
                disabled={!lines.length || busy}
                onClick={() => setConfirmEdit(true)}
                className="w-full rounded-bouff-md bg-bouff-primary py-4 text-lg font-bold text-bouff-on-primary disabled:opacity-40 lg:text-xl"
              >
                Enregistrer la modification
              </button>
            ) : (
            <div className="grid grid-cols-2 gap-2">
              <button
                disabled={!lines.length || busy}
                onClick={() => setConfirmPay("cash")}
                className="min-w-0 rounded-bouff-md bg-bouff-primary py-4 text-lg font-bold lg:text-xl text-bouff-on-primary disabled:opacity-40"
              >
                Espèces
              </button>
              <button
                disabled={!lines.length || busy}
                onClick={() => setConfirmPay("mobile_money")}
                className="min-w-0 rounded-bouff-md border-2 border-bouff-primary py-4 text-lg font-bold lg:text-xl text-bouff-primary disabled:opacity-40"
              >
                MoMo
              </button>
            </div>
            )}
            {lines.length > 0 && !editing && (
              <button onClick={reset} className="w-full py-1 text-sm text-bouff-text-muted">
                Vider le ticket
              </button>
            )}
          </div>
        </aside>

        {/* Téléphone : barre du ticket */}
        <button
          onClick={() => lines.length && setTicketOpen(true)}
          className={`flex shrink-0 items-center justify-between gap-3 px-5 py-4 text-lg font-semibold md:hidden ${
            lines.length ? "bg-bouff-primary text-bouff-on-primary" : "border-t border-bouff-line bg-bouff-surface text-bouff-text-muted"
          }`}
        >
          {lines.length ? (
            <>
              <span>{editing ? `${editing.number} · ` : "Ticket · "}{lines.reduce((s, l) => s + l.quantity, 0)} article{lines.reduce((s, l) => s + l.quantity, 0) > 1 ? "s" : ""}</span>
              <span className="font-bouff-display text-2xl">{fcfa(total)}</span>
            </>
          ) : (
            <span className="w-full text-center">Touche un produit</span>
          )}
        </button>
      </div>

      {picking && (
        <ItemPicker
          item={picking.item}
          preferKind={picking.kind}
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
          <p className="mb-4 text-center text-bouff-text-muted">
            {dineIn ? "Sur place" : "À emporter"}
            {normalizeTable(dineIn, tableLabel) ? ` · Table ${normalizeTable(dineIn, tableLabel)}` : ""}
          </p>
          {confirmPay === "cash" && (
            <div className="mb-5">
              <p className="mb-2 font-semibold">Montant reçu du client</p>
              <div className="mb-2 grid grid-cols-3 gap-2">
                {cashSuggestions(total).map((v) => (
                  <button
                    key={v}
                    onClick={() => setReceived(String(v))}
                    className={`rounded-bouff-md py-3 font-semibold ${received === String(v) ? "bg-bouff-primary text-bouff-on-primary" : "bg-bouff-surface-raised"}`}
                  >
                    {v === total ? "Compte juste" : fcfa(v)}
                  </button>
                ))}
              </div>
              <input
                value={received}
                onChange={(e) => setReceived(e.target.value.replace(/\D/g, ""))}
                inputMode="numeric"
                placeholder="Autre montant (F)"
                className="w-full rounded-bouff-md border border-bouff-line bg-bouff-background px-3 py-3 text-xl text-bouff-text placeholder:text-base placeholder:text-bouff-text-muted placeholder:opacity-100"
              />
              {received !== "" && Number(received) < total && (
                <p className="mt-2 text-bouff-danger">Il manque {fcfa(total - Number(received))}</p>
              )}
              {received !== "" && Number(received) >= total && (
                <p className="mt-3 text-center text-2xl">
                  Monnaie à rendre : <span className="font-bouff-display text-4xl text-bouff-primary">{fcfa(Number(received) - total)}</span>
                </p>
              )}
            </div>
          )}
          <div className="grid grid-cols-2 gap-3">
            <button onClick={() => setConfirmPay(null)} disabled={busy} className="rounded-bouff-md bg-bouff-surface-raised py-4 text-lg">
              Retour
            </button>
            <button
              onClick={() => pay(confirmPay)}
              disabled={busy || (confirmPay === "cash" && received !== "" && Number(received) < total)}
              className="rounded-bouff-md bg-bouff-primary py-4 text-lg font-bold text-bouff-on-primary disabled:opacity-50"
            >
              {busy ? "Envoi…" : confirmPay === "cash" ? "Argent reçu" : "MoMo reçu"}
            </button>
          </div>
        </Modal>
      )}

      {confirmEdit && editing && (
        <ConfirmEdit
          editing={editing}
          total={total}
          busy={busy}
          onCancel={() => setConfirmEdit(false)}
          onConfirm={(extra) => void saveEdit(extra)}
        />
      )}

      {done && (
        <Modal onClose={() => setDone(null)}>
          <p className="text-center text-xl text-bouff-text-muted">{done.edit ? "Commande modifiée" : "Commande envoyée en cuisine"}</p>
          <p className="text-center text-lg text-bouff-text-muted">Numéro de commande</p>
          <p className="my-4 text-center font-bouff-display text-[9rem] leading-none text-bouff-primary">{done.number}</p>
          <p className="text-center text-lg">
            {done.dineIn ? "Sur place" : "À emporter"}
            {done.table ? ` · Table ${done.table}` : ""} · {fcfa(done.total)}
          </p>
          {done.edit?.kind === "refund" && (
            <p className="mt-3 text-center text-2xl">
              Rembourse <span className="font-bouff-display text-3xl text-bouff-primary">{fcfa(done.edit.amount)}</span>
              {done.edit.payment === "mobile_money" ? " au client (MoMo)" : " au client"}
            </p>
          )}
          {done.change !== null && done.change > 0 && (
            <p className="mt-3 text-center text-2xl">
              Rends <span className="font-bouff-display text-3xl text-bouff-primary">{fcfa(done.change)}</span>
            </p>
          )}
          <p className="mt-2 text-center text-bouff-text-muted">
            {done.edit ? "La cuisine voit la commande mise à jour." : "Dis ce numéro au client : il sera appelé quand c'est prêt."}
          </p>
          {done.points && <p className="mt-2 text-center text-bouff-success">Points BOUFF ajoutés à son compte à la remise.</p>}
          {printError && <p className="mt-4 text-center text-bouff-danger">{printError}</p>}
          <button
            onClick={() => void printReceipt(done.orderId, { pointsLinked: done.points })}
            disabled={printing}
            className="mt-6 w-full rounded-bouff-md border-2 border-bouff-primary py-4 text-xl font-bold text-bouff-primary disabled:opacity-40"
          >
            {printing ? "Préparation du reçu…" : "Imprimer le reçu"}
          </button>
          <label className="mt-3 flex cursor-pointer items-center justify-center gap-3 text-bouff-text-muted">
            <input
              type="checkbox"
              checked={autoPrint}
              onChange={(e) => toggleAutoPrint(e.target.checked)}
              className="h-5 w-5 accent-bouff-primary"
            />
            Imprimer automatiquement après chaque vente
          </label>
          <button onClick={() => setDone(null)} className="mt-4 w-full rounded-bouff-md bg-bouff-primary py-4 text-xl font-bold text-bouff-on-primary">
            Client suivant
          </button>
        </Modal>
      )}

      {showRecent && (
        <RecentOrders
          token={session.token}
          onClose={() => setShowRecent(false)}
          onExpired={onExpired}
          onPrint={(ids) => void printReceipt(ids)}
          onEdit={startEdit}
          onAddToTable={addToTable}
          printing={printing}
          printError={printError}
        />
      )}
      {printJob && <ReceiptSheet key={printJob.at} receipts={printJob.receipts} extras={printJob.extras} />}
      {showClose && <CloseDay token={session.token} name={session.name} onClose={() => setShowClose(false)} onExpired={onExpired} />}
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

// Différence à régler quand une commande déjà payée change : la base refait le calcul.
function ConfirmEdit({
  editing,
  total,
  busy,
  onCancel,
  onConfirm,
}: {
  editing: EditingOrder;
  total: number;
  busy: boolean;
  onCancel: () => void;
  onConfirm: (extra: number | null) => void;
}) {
  const settle = editSettlement(editing.oldTotal, total);
  const cash = editing.payment === "cash";
  const [extra, setExtra] = useState("");
  const short = settle.kind === "collect" && cash && extra !== "" && Number(extra) < settle.amount;

  return (
    <Modal onClose={() => !busy && onCancel()}>
      <p className="text-center text-xl">Modifier la commande {editing.number}</p>
      <div className="my-4 grid grid-cols-2 gap-3 text-center">
        <div className="rounded-bouff-md bg-bouff-surface-raised p-3">
          <p className="text-sm text-bouff-text-muted">Déjà payé</p>
          <p className="font-bouff-display text-3xl">{fcfa(editing.oldTotal)}</p>
        </div>
        <div className="rounded-bouff-md bg-bouff-surface-raised p-3">
          <p className="text-sm text-bouff-text-muted">Nouveau total</p>
          <p className="font-bouff-display text-3xl text-bouff-primary">{fcfa(total)}</p>
        </div>
      </div>

      {settle.kind === "none" && <p className="mb-4 text-center text-lg">Même total : rien à encaisser ni à rendre.</p>}

      {settle.kind === "refund" && (
        <p className="mb-4 text-center text-2xl">
          Rembourse <span className="font-bouff-display text-4xl text-bouff-primary">{fcfa(settle.amount)}</span>
          <span className="block text-base text-bouff-text-muted">
            {cash ? "en espèces, depuis le tiroir" : "au client (payé par MoMo : rembourse par MoMo)"}
          </span>
        </p>
      )}

      {settle.kind === "collect" && !cash && (
        <p className="mb-4 text-center text-2xl">
          Vérifie le complément MoMo de <span className="font-bouff-display text-4xl text-bouff-primary">{fcfa(settle.amount)}</span>
        </p>
      )}

      {settle.kind === "collect" && cash && (
        <div className="mb-5">
          <p className="mb-2 text-center text-2xl">
            Encaisse <span className="font-bouff-display text-4xl text-bouff-primary">{fcfa(settle.amount)}</span> en plus
          </p>
          <p className="mb-2 font-semibold">Montant reçu pour le complément</p>
          <div className="mb-2 grid grid-cols-3 gap-2">
            {cashSuggestions(settle.amount).map((v) => (
              <button
                key={v}
                onClick={() => setExtra(String(v))}
                className={`rounded-bouff-md py-3 font-semibold ${extra === String(v) ? "bg-bouff-primary text-bouff-on-primary" : "bg-bouff-surface-raised"}`}
              >
                {v === settle.amount ? "Compte juste" : fcfa(v)}
              </button>
            ))}
          </div>
          <input
            value={extra}
            onChange={(e) => setExtra(e.target.value.replace(/\D/g, ""))}
            inputMode="numeric"
            placeholder="Autre montant (F)"
            className="w-full rounded-bouff-md border border-bouff-line bg-bouff-background px-3 py-3 text-xl text-bouff-text placeholder:text-base placeholder:text-bouff-text-muted placeholder:opacity-100"
          />
          {short && <p className="mt-2 text-bouff-danger">Il manque {fcfa(settle.amount - Number(extra))}</p>}
          {extra !== "" && !short && Number(extra) > settle.amount && (
            <p className="mt-3 text-center text-2xl">
              Monnaie à rendre : <span className="font-bouff-display text-4xl text-bouff-primary">{fcfa(Number(extra) - settle.amount)}</span>
            </p>
          )}
        </div>
      )}

      <p className="mb-4 text-center text-sm text-bouff-text-muted">La modification est enregistrée à ton nom, avec l&apos;ancienne version.</p>
      <div className="grid grid-cols-2 gap-3">
        <button onClick={onCancel} disabled={busy} className="rounded-bouff-md bg-bouff-surface-raised py-4 text-lg">
          Retour
        </button>
        <button
          onClick={() => onConfirm(settle.kind === "collect" && cash ? (extra === "" ? settle.amount : Number(extra)) : null)}
          disabled={busy || short}
          className="rounded-bouff-md bg-bouff-primary py-4 text-lg font-bold text-bouff-on-primary disabled:opacity-50"
        >
          {busy ? "Envoi…" : settle.kind === "collect" ? (cash ? "Argent reçu" : "MoMo reçu") : "Enregistrer"}
        </button>
      </div>
    </Modal>
  );
}

function ItemPicker({
  item,
  preferKind,
  onClose,
  onAdd,
}: {
  item: BouffItem;
  preferKind?: string;
  onClose: () => void;
  onAdd: (line: Omit<TicketLine, "key" | "quantity">) => void;
}) {
  const variants = item.variations.filter((v) => !v.isOutOfStock);
  const [variant, setVariant] = useState<BouffVariant | null>(
    (preferKind && variants.find((v) => v.kind === preferKind)) || variants.find((v) => v.isDefault) || variants[0] || null,
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

function RecentOrders({
  token,
  onClose,
  onExpired,
  onPrint,
  onEdit,
  onAddToTable,
  printing,
  printError,
}: {
  token: string;
  onClose: () => void;
  onExpired: () => void;
  onPrint: (orderIds: string[]) => void;
  onEdit: (row: RecentRow) => void;
  onAddToTable: (row: RecentRow) => void;
  printing: boolean;
  printError: string | null;
}) {
  const [rows, setRows] = useState<RecentRow[] | null>(null);
  const [grouping, setGrouping] = useState(false);
  const [picked, setPicked] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [cancelling, setCancelling] = useState<{ id: string; number: string } | null>(null);
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);

  const load = useCallback(() => {
    counterRecentOrders(token)
      .then(setRows)
      .catch((e) => (isSessionError(e) ? onExpired() : setError(e.message)));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token]);
  useEffect(load, [load]);
  useEffect(() => {
    const timer = window.setInterval(load, 15000);
    return () => window.clearInterval(timer);
  }, [load]);

  const complete = async (orderId: string) => {
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      await counterCompleteOrder(token, orderId);
      load();
    } catch (e) {
      if (isSessionError(e)) onExpired();
      else setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const confirmCancel = async () => {
    if (!cancelling) return;
    setBusy(true);
    setError(null);
    try {
      await counterCancelOrder(token, cancelling.id, reason.trim());
      setCancelling(null);
      setReason("");
      load();
    } catch (e) {
      if (isSessionError(e)) onExpired();
      else setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  if (cancelling) {
    return (
      <Modal onClose={() => !busy && setCancelling(null)}>
        <p className="mb-2 text-2xl font-semibold">Annuler la commande {cancelling.number}</p>
        <p className="mb-4 text-bouff-text-muted">L&apos;annulation est enregistrée à ton nom avec le motif. Rends l&apos;argent au client si besoin.</p>
        <div className="mb-3 flex flex-wrap gap-2">
          {["Erreur de saisie", "Client parti", "Produit indisponible", "Doublon"].map((r) => (
            <button key={r} onClick={() => setReason(r)} className={`rounded-full px-4 py-2 ${reason === r ? "bg-bouff-primary text-bouff-on-primary" : "bg-bouff-surface-raised"}`}>
              {r}
            </button>
          ))}
        </div>
        <input
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          placeholder="Motif (obligatoire)"
          className="w-full rounded-bouff-md border border-bouff-line bg-bouff-background px-3 py-3 text-bouff-text placeholder:text-bouff-text-muted placeholder:opacity-100"
        />
        {error && <p className="mt-3 text-bouff-danger">{error}</p>}
        <div className="mt-5 grid grid-cols-2 gap-3">
          <button onClick={() => setCancelling(null)} disabled={busy} className="rounded-bouff-md bg-bouff-surface-raised py-4 text-lg">
            Retour
          </button>
          <button
            onClick={confirmCancel}
            disabled={busy || reason.trim().length < 3}
            className="rounded-bouff-md bg-bouff-danger py-4 text-lg font-bold text-bouff-text disabled:opacity-40"
          >
            {busy ? "Annulation…" : "Confirmer l'annulation"}
          </button>
        </div>
      </Modal>
    );
  }

  const live = (rows ?? []).filter((r) => r.status !== "cancelled");
  const tables = [...new Set(live.map((r) => r.table_label).filter((t): t is string => !!t))];
  const togglePick = (id: string) => setPicked((p) => (p.includes(id) ? p.filter((x) => x !== id) : [...p, id]));

  return (
    <Modal onClose={onClose}>
      <div className="mb-4 flex items-center justify-between gap-3">
        <p className="text-2xl font-semibold">Commandes du comptoir</p>
        <button
          onClick={() => {
            setGrouping(!grouping);
            setPicked([]);
          }}
          className={`shrink-0 rounded-bouff-md border px-3 py-2 text-sm font-semibold ${grouping ? "border-bouff-primary bg-bouff-primary text-bouff-on-primary" : "border-bouff-line"}`}
        >
          {grouping ? "Annuler le groupé" : "Reçu groupé"}
        </button>
      </div>
      {grouping && (
        <div className="mb-3 rounded-bouff-md bg-bouff-surface-raised p-3">
          <p className="text-sm text-bouff-text-muted">Coche les commandes à mettre sur un seul reçu{tables.length ? ", ou choisis une table :" : "."}</p>
          {tables.length > 0 && (
            <div className="mt-2 flex flex-wrap gap-2">
              {tables.map((t) => {
                const ids = live.filter((r) => r.table_label === t).map((r) => r.id);
                return (
                  <button key={t} onClick={() => setPicked(ids)} className="rounded-full bg-bouff-surface px-4 py-2 font-semibold">
                    Table {t} ({ids.length})
                  </button>
                );
              })}
            </div>
          )}
        </div>
      )}
      {error && <p className="text-bouff-danger">{error}</p>}
      {printError && <p className="text-bouff-danger">{printError}</p>}
      {!rows && !error && <p className="text-bouff-text-muted">Chargement…</p>}
      {rows?.length === 0 && <p className="text-bouff-text-muted">Aucune commande pour l&apos;instant.</p>}
      {rows?.map((r) => (
        <div key={r.order_number} className="flex items-center justify-between gap-3 border-b border-bouff-line py-3">
          {grouping && r.status !== "cancelled" && (
            <input
              type="checkbox"
              checked={picked.includes(r.id)}
              onChange={() => togglePick(r.id)}
              aria-label={`Ajouter ${r.order_number} au reçu groupé`}
              className="h-6 w-6 shrink-0 accent-bouff-primary"
            />
          )}
          <div className="min-w-0 flex-1">
            <p className="font-semibold">
              {r.order_number} · {r.customer_name}
            </p>
            <p className="text-sm text-bouff-text-muted">
              {new Date(r.created_at).toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" })} ·{" "}
              {r.dine_in ? (r.table_label ? `Table ${r.table_label}` : "Sur place") : "À emporter"} ·{" "}
              {r.payment_method === "mobile_money" ? "MoMo" : "Espèces"}
              {r.edited_at ? " · modifiée" : ""}
            </p>
            {r.status === "cancelled" && r.cancel_reason && <p className="text-sm text-bouff-danger">{r.cancel_reason}</p>}
          </div>
          <div className="shrink-0 text-right">
            <p className={r.status === "cancelled" ? "line-through text-bouff-text-muted" : ""}>{fcfa(r.total_fcfa)}</p>
            <p className="text-sm text-bouff-primary">{STATUS_LABEL[r.status] ?? r.status}</p>
            {!grouping && (
              <>
                {r.status === "ready" && (
                  <button disabled={busy} onClick={() => void complete(r.id)} className="mt-2 rounded-bouff-md bg-bouff-primary px-3 py-2 text-sm font-semibold text-bouff-on-primary disabled:opacity-40">
                    Remise au client
                  </button>
                )}
                {canEditCounterOrder(r.status) && (
                  <button onClick={() => onEdit(r)} className="mt-1 block w-full text-right text-sm font-semibold text-bouff-primary underline">
                    Modifier
                  </button>
                )}
                {r.dine_in && r.status !== "cancelled" && (
                  <button onClick={() => onAddToTable(r)} className="mt-1 block w-full text-right text-sm text-bouff-text underline">
                    Ajouter pour {r.table_label ? `la table ${r.table_label}` : "ce client"}
                  </button>
                )}
                {r.status !== "cancelled" && (
                  <button
                    disabled={printing}
                    onClick={() => onPrint([r.id])}
                    className="mt-1 block w-full text-right text-sm text-bouff-text underline disabled:opacity-40"
                  >
                    Réimprimer le reçu
                  </button>
                )}
                {r.status === "received" && (
                  <button onClick={() => { setReason(""); setError(null); setCancelling({ id: r.id, number: r.order_number }); }} className="mt-1 text-sm text-bouff-danger underline">
                    Annuler
                  </button>
                )}
              </>
            )}
          </div>
        </div>
      ))}
      {grouping ? (
        <button
          disabled={printing || picked.length === 0}
          onClick={() => onPrint(rows?.filter((r) => picked.includes(r.id)).map((r) => r.id) ?? [])}
          className="mt-4 w-full rounded-bouff-md bg-bouff-primary py-4 text-lg font-bold text-bouff-on-primary disabled:opacity-40"
        >
          {printing ? "Préparation du reçu…" : `Imprimer le reçu groupé (${picked.length})`}
        </button>
      ) : (
        <button onClick={onClose} className="mt-4 w-full rounded-bouff-md bg-bouff-surface-raised py-3">
          Fermer
        </button>
      )}
    </Modal>
  );
}

function CloseDay({ token, name, onClose, onExpired }: { token: string; name: string; onClose: () => void; onExpired: () => void }) {
  const [summary, setSummary] = useState<CounterDaySummary | null>(null);
  const [counted, setCounted] = useState("");
  const [note, setNote] = useState("");
  const [result, setResult] = useState<CounterDaySummary | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [settled, setSettled] = useState(false);
  const liveGap = summary && counted !== "" ? Number(counted) - summary.cash_fcfa : null;

  useEffect(() => {
    counterDaySummary(token)
      .then(setSummary)
      .catch((e) => (isSessionError(e) ? onExpired() : setError(e.message)));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token]);

  const submit = async () => {
    setBusy(true);
    setError(null);
    try {
      const fix =
        liveGap && settled
          ? liveGap < 0
            ? `Manque de ${fcfa(-liveGap)} remboursé par l'hôtesse.`
            : `Surplus de ${fcfa(liveGap)} retiré du tiroir.`
          : "";
      setResult(await counterCloseDay(token, Number(counted), [fix, note.trim()].filter(Boolean).join(" ")));
    } catch (e) {
      if (isSessionError(e)) onExpired();
      else setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  if (result) {
    const gap = result.gap_fcfa ?? 0;
    return (
      <Modal onClose={onClose}>
        <p className="mb-4 text-center text-2xl font-semibold">Caisse clôturée · {name}</p>
        <Row label="Ventes" value={String(result.orders_count)} />
        <Row label="Espèces attendues" value={fcfa(result.cash_fcfa)} />
        <Row label="Espèces comptées" value={fcfa(result.cash_counted_fcfa ?? 0)} />
        <Row label="MoMo" value={fcfa(result.momo_fcfa)} />
        <p className={`my-5 text-center font-bouff-display text-4xl ${gap === 0 ? "text-bouff-success" : "text-bouff-danger"}`}>
          {gap === 0 ? "Caisse juste" : gap > 0 ? `Surplus ${fcfa(gap)}` : `Manque ${fcfa(-gap)}`}
        </p>
        <button onClick={onClose} className="w-full rounded-bouff-md bg-bouff-primary py-4 text-xl font-bold text-bouff-on-primary">
          Terminer
        </button>
      </Modal>
    );
  }

  return (
    <Modal onClose={() => !busy && onClose()}>
      <p className="mb-1 text-2xl font-semibold">Clôturer ma caisse</p>
      {summary && (
        <p className="mb-4 text-sm text-bouff-text-muted">
          Depuis {new Date(summary.period_start).toLocaleString("fr-FR", { weekday: "long", hour: "2-digit", minute: "2-digit" })}
        </p>
      )}
      {!summary && !error && <p className="text-bouff-text-muted">Chargement…</p>}
      {summary && (
        <>
          <Row label="Ventes" value={String(summary.orders_count)} />
          <Row label="Annulées" value={String(summary.cancelled_count)} />
          <Row label="MoMo" value={fcfa(summary.momo_fcfa)} />
          <Row label="Espèces attendues" value={fcfa(summary.cash_fcfa)} />
          {(summary.change_fcfa ?? 0) > 0 && <Row label="Monnaie rendue" value={fcfa(summary.change_fcfa ?? 0)} />}
          {(summary.edited_count ?? 0) > 0 && <Row label="Commandes modifiées" value={String(summary.edited_count)} />}
          <p className="mt-5 mb-2 font-semibold">Compte l&apos;argent du tiroir et saisis le montant</p>
          <input
            value={counted}
            onChange={(e) => {
              setCounted(e.target.value.replace(/\D/g, ""));
              setSettled(false);
            }}
            inputMode="numeric"
            placeholder="Espèces comptées (F)"
            className="w-full rounded-bouff-md border border-bouff-line bg-bouff-background px-3 py-3 text-2xl text-bouff-text placeholder:text-base placeholder:text-bouff-text-muted placeholder:opacity-100"
          />
          {liveGap !== null && (
            <p className={`mt-3 text-center font-bouff-display text-3xl ${liveGap === 0 ? "text-bouff-success" : "text-bouff-danger"}`}>
              {liveGap === 0 ? "Caisse juste" : liveGap < 0 ? `Il manque ${fcfa(-liveGap)}` : `Surplus de ${fcfa(liveGap)}`}
            </p>
          )}
          {liveGap !== null && liveGap !== 0 && (
            <label className="mt-3 flex cursor-pointer items-start gap-3 rounded-bouff-md border border-bouff-line bg-bouff-surface-raised p-3">
              <input
                type="checkbox"
                checked={settled}
                onChange={(e) => setSettled(e.target.checked)}
                className="mt-1 h-6 w-6 shrink-0 accent-bouff-primary"
              />
              <span className="text-bouff-text">
                {liveGap < 0
                  ? `Je confirme avoir remboursé les ${fcfa(-liveGap)} manquants : le tiroir contient maintenant ${fcfa(summary.cash_fcfa)}.`
                  : `Je confirme avoir retiré et remis le surplus de ${fcfa(liveGap)} : le tiroir contient maintenant ${fcfa(summary.cash_fcfa)}.`}
              </span>
            </label>
          )}
          <input
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="Remarque (facultatif)"
            className="mt-2 w-full rounded-bouff-md border border-bouff-line bg-bouff-background px-3 py-2 text-bouff-text placeholder:text-bouff-text-muted placeholder:opacity-100"
          />
        </>
      )}
      {error && <p className="mt-3 text-bouff-danger">{error}</p>}
      <div className="mt-5 grid grid-cols-2 gap-3">
        <button onClick={onClose} disabled={busy} className="rounded-bouff-md bg-bouff-surface-raised py-4 text-lg">
          Retour
        </button>
        <button
          onClick={submit}
          disabled={busy || !summary || counted === "" || (liveGap !== null && liveGap !== 0 && !settled)}
          className="rounded-bouff-md bg-bouff-primary py-4 text-lg font-bold text-bouff-on-primary disabled:opacity-40"
        >
          {busy ? "Envoi…" : "Clôturer"}
        </button>
      </div>
    </Modal>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between border-b border-bouff-line py-2 text-lg">
      <span className="text-bouff-text-muted">{label}</span>
      <span className="font-semibold">{value}</span>
    </div>
  );
}
