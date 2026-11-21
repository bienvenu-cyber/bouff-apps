"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import {
  paymentLabel,
  receiptChange,
  receiptDate,
  receiptFcfa,
  receiptItemCount,
  type Receipt,
  type ReceiptExtras,
} from "@/lib/bouff-data/receipt";

// Rendu hors de l'écran de caisse : seul ce bloc sort sur l'imprimante.
export default function ReceiptSheet({ receipt, extras }: { receipt: Receipt; extras: ReceiptExtras }) {
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

  if (!root) return null;
  const r = receipt;
  const change = r.payment_method === "cash" ? receiptChange(r.total_fcfa, extras.receivedFcfa) : null;
  const count = receiptItemCount(r);
  const city = r.restaurant.city && !(r.restaurant.address ?? "").includes(r.restaurant.city) ? r.restaurant.city : null;

  return createPortal(
    <div className="bouff-receipt">
      <div className="r-center">
        <div className="r-logo font-bouff-display">{(r.restaurant.name || "BOUFF").toUpperCase()}</div>
        <div className="r-small">Mange d&apos;abord.</div>
        {r.restaurant.address && <div className="r-small">{[r.restaurant.address, city].filter(Boolean).join(", ")}</div>}
        {r.restaurant.phone && <div className="r-small">Tél. {r.restaurant.phone}</div>}
      </div>

      <hr className="r-rule" />
      <div className="r-center">
        <div className="r-small">REÇU DE CAISSE</div>
        <div className="r-number">{r.order_number}</div>
        <div className="r-strong">{r.dine_in ? "Sur place" : "À emporter"}</div>
      </div>
      {r.status === "cancelled" && <div className="r-cancelled">COMMANDE ANNULÉE</div>}
      <hr className="r-rule" />

      <div className="r-small">
        <div className="r-row"><span>Date</span><span>{receiptDate(r.paid_at ?? r.created_at)}</span></div>
        {r.cashier_name && <div className="r-row"><span>Servi par</span><span>{r.cashier_name}</span></div>}
        {r.customer_name && r.customer_name !== "Client comptoir" && (
          <div className="r-row"><span>Client</span><span>{r.customer_name}</span></div>
        )}
      </div>

      <hr className="r-rule" />
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
      <hr className="r-rule" />

      {r.discount_fcfa > 0 && (
        <>
          <div className="r-row"><span>Sous-total</span><span>{receiptFcfa(r.items_total_fcfa)}</span></div>
          <div className="r-row"><span>Réduction</span><span>− {receiptFcfa(r.discount_fcfa)}</span></div>
        </>
      )}
      <div className="r-row r-total">
        <span>TOTAL · {count} article{count > 1 ? "s" : ""}</span>
        <span>{receiptFcfa(r.total_fcfa)}</span>
      </div>
      <div className="r-row"><span>Payé par</span><span>{paymentLabel(r.payment_method)}</span></div>
      {change !== null && extras.receivedFcfa !== undefined && (
        <>
          <div className="r-row"><span>Reçu</span><span>{receiptFcfa(extras.receivedFcfa)}</span></div>
          <div className="r-row r-strong"><span>Monnaie rendue</span><span>{receiptFcfa(change)}</span></div>
        </>
      )}

      <hr className="r-rule" />
      <div className="r-center">
        {extras.pointsLinked && <div className="r-small">Points BOUFF ajoutés à votre compte à la remise.</div>}
        <div className="r-strong">Merci et à bientôt !</div>
        <div className="r-small">Commandez sur l&apos;appli BOUFF · @bouff.bj</div>
        <div className="r-small">Gardez ce reçu jusqu&apos;à la remise de votre commande.</div>
      </div>
    </div>,
    root,
  );
}
