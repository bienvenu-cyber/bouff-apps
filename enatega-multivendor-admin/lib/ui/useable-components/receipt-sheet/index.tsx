"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import "./receipt.css";
import {
  paymentLabel,
  receiptDate,
  receiptFcfa,
  receiptGroupTotals,
  receiptIsPaid,
  receiptItemCount,
  receiptTime,
  serviceLabel,
  type Receipt,
  type ReceiptExtras,
} from "@/lib/bouff-data/receipt";

// Rendu hors de l'écran : seul ce bloc sort sur l'imprimante (même reçu que la caisse).
export default function ReceiptSheet({ receipts, extras }: { receipts: Receipt[]; extras: ReceiptExtras }) {
  const [root, setRoot] = useState<HTMLElement | null>(null);

  useEffect(() => {
    let el = document.getElementById("bouff-receipt-root");
    if (!el) {
      el = document.createElement("div");
      el.id = "bouff-receipt-root";
      document.body.appendChild(el);
    }
    setRoot(el);
  }, []);

  if (!root || receipts.length === 0) return null;
  return createPortal(
    receipts.length === 1 ? <SingleReceipt r={receipts[0]} extras={extras} /> : <GroupReceipt list={receipts} />,
    root,
  );
}

function Header({ r }: { r: Receipt }) {
  const city = r.restaurant.city && !(r.restaurant.address ?? "").includes(r.restaurant.city) ? r.restaurant.city : null;
  return (
    <div className="r-center">
      <div className="r-logo font-bouff-display">{(r.restaurant.name || "BOUFF").toUpperCase()}</div>
      <div className="r-small">Mange d&apos;abord.</div>
      {r.restaurant.address && <div className="r-small">{[r.restaurant.address, city].filter(Boolean).join(", ")}</div>}
      {r.restaurant.phone && <div className="r-small">Tél. {r.restaurant.phone}</div>}
    </div>
  );
}

function Lines({ r }: { r: Receipt }) {
  return (
    <>
      {r.items.map((l, i) => (
        <div key={i} className="r-line">
          <div className="r-row">
            <span className="r-line-name">
              {l.quantity} × {l.name}
              {l.variant ? ` · ${l.variant}` : ""}
            </span>
            <span>{receiptFcfa(l.line_total_fcfa)}</span>
          </div>
          {l.options.length > 0 && <div className="r-sub">{l.options.join(", ")}</div>}
          {l.quantity > 1 && <div className="r-sub">{receiptFcfa(l.unit_price_fcfa)} l&apos;unité</div>}
        </div>
      ))}
    </>
  );
}

function Footer({ pointsLinked }: { pointsLinked?: boolean }) {
  return (
    <div className="r-center">
      {pointsLinked && <div className="r-small">Points BOUFF ajoutés à votre compte à la remise.</div>}
      <div className="r-strong">Merci et à bientôt !</div>
      <div className="r-small">Commandez sur l&apos;appli BOUFF · @bouff.bj</div>
    </div>
  );
}

function SingleReceipt({ r, extras }: { r: Receipt; extras: ReceiptExtras }) {
  const count = receiptItemCount(r);
  const paid = receiptIsPaid(r);
  const fee = r.delivery_fee_fcfa ?? 0;
  const wallet = r.wallet_used_fcfa ?? 0;
  const tip = r.tip_fcfa ?? 0;
  const showDetail = r.discount_fcfa > 0 || fee > 0 || wallet > 0 || tip > 0;

  return (
    <div className="bouff-receipt">
      <Header r={r} />
      <hr className="r-rule" />
      <div className="r-center">
        <div className="r-small">REÇU DE CAISSE</div>
        <div className="r-number">{r.order_number}</div>
        <div className="r-strong">{serviceLabel(r)}</div>
      </div>
      {r.status === "cancelled" && <div className="r-cancelled">COMMANDE ANNULÉE</div>}
      <hr className="r-rule" />

      <div className="r-small">
        <div className="r-row"><span>Date</span><span>{receiptDate(r.paid_at ?? r.created_at)}</span></div>
        {r.edited_at && <div className="r-row"><span>Modifiée</span><span>{receiptTime(r.edited_at)}</span></div>}
        {r.cashier_name && <div className="r-row"><span>Servi par</span><span>{r.cashier_name}</span></div>}
        {r.source && r.source !== "counter" && <div className="r-row"><span>Commande</span><span>Appli / site</span></div>}
        {r.customer_name && r.customer_name !== "Client comptoir" && (
          <div className="r-row"><span>Client</span><span>{r.customer_name}</span></div>
        )}
        {r.delivery_address && <div className="r-sub">Livraison : {r.delivery_address}</div>}
      </div>

      <hr className="r-rule" />
      <Lines r={r} />
      <hr className="r-rule" />

      {showDetail && (
        <>
          <div className="r-row"><span>Sous-total</span><span>{receiptFcfa(r.items_total_fcfa)}</span></div>
          {r.discount_fcfa > 0 && <div className="r-row"><span>Réduction</span><span>− {receiptFcfa(r.discount_fcfa)}</span></div>}
          {fee > 0 && (
            <div className="r-row"><span>Livraison</span><span>{r.free_delivery_used ? "Offerte" : receiptFcfa(fee)}</span></div>
          )}
          {wallet > 0 && <div className="r-row"><span>Portefeuille BOUFF</span><span>− {receiptFcfa(wallet)}</span></div>}
          {tip > 0 && <div className="r-row"><span>Pourboire livreur</span><span>{receiptFcfa(tip)}</span></div>}
        </>
      )}
      <div className="r-row r-total">
        <span>TOTAL · {count} article{count > 1 ? "s" : ""}</span>
        <span>{receiptFcfa(r.total_fcfa)}</span>
      </div>
      <div className="r-row">
        <span>{paid ? "Payé par" : "À payer"}</span>
        <span>{paymentLabel(r.payment_method)}</span>
      </div>
      {r.cash_received_fcfa != null && r.cash_received_fcfa > 0 && (
        <>
          <div className="r-row"><span>Reçu</span><span>{receiptFcfa(r.cash_received_fcfa)}</span></div>
          <div className="r-row r-strong"><span>Monnaie rendue</span><span>{receiptFcfa(r.change_fcfa ?? 0)}</span></div>
        </>
      )}

      <hr className="r-rule" />
      <Footer pointsLinked={extras.pointsLinked} />
      {r.source === "counter" && r.status !== "delivered" && r.status !== "cancelled" && (
        <div className="r-center r-small">Gardez ce reçu jusqu&apos;à la remise de votre commande.</div>
      )}
    </div>
  );
}

function GroupReceipt({ list }: { list: Receipt[] }) {
  const t = receiptGroupTotals(list);
  const first = list[0];
  return (
    <div className="bouff-receipt">
      <Header r={first} />
      <hr className="r-rule" />
      <div className="r-center">
        <div className="r-small">REÇU GROUPÉ</div>
        {t.tables.length > 0 && <div className="r-number">Table {t.tables.join(", ")}</div>}
        <div className="r-strong">{list.length} commandes</div>
        <div className="r-small">Édité le {receiptDate(new Date().toISOString())}</div>
      </div>
      <hr className="r-rule" />

      {list.map((r) => (
        <div key={r.order_number} className="r-order">
          <div className="r-row r-strong">
            <span>{r.order_number} · {receiptTime(r.paid_at ?? r.created_at)}</span>
            <span>{r.status === "cancelled" ? "ANNULÉE" : paymentLabel(r.payment_method)}</span>
          </div>
          <Lines r={r} />
          <div className="r-row r-strong">
            <span>Total {r.order_number}</span>
            <span className={r.status === "cancelled" ? "r-strike" : ""}>{receiptFcfa(r.total_fcfa)}</span>
          </div>
          <hr className="r-rule" />
        </div>
      ))}

      <div className="r-row r-total">
        <span>TOTAL · {t.items} article{t.items > 1 ? "s" : ""}</span>
        <span>{receiptFcfa(t.total)}</span>
      </div>
      {t.byPayment.map((p) => (
        <div key={p.method} className="r-row"><span>Payé par {paymentLabel(p.method)}</span><span>{receiptFcfa(p.total)}</span></div>
      ))}
      <hr className="r-rule" />
      <Footer />
    </div>
  );
}
