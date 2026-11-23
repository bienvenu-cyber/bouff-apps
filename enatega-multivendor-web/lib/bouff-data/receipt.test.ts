import { beforeEach, describe, expect, it, vi } from "vitest";

const { rpc } = vi.hoisted(() => ({ rpc: vi.fn() }));
vi.mock("@supabase/supabase-js", () => ({ createClient: () => ({ rpc }) }));
vi.mock("./config", () => ({ RESTAURANT_SLUG: "bouff", SUPABASE_URL: "https://example.test", SUPABASE_PUBLISHABLE_KEY: "test" }));
import { counterOrderReceipt } from "./counter";
import { paymentLabel, receiptChange, receiptDate, receiptGroupTotals, serviceLabel } from "./receipt";

describe("Counter receipt", () => {
  beforeEach(() => rpc.mockReset());

  it("reads the receipt from the protected function with the cashier token and order", async () => {
    rpc.mockResolvedValue({ data: { order_number: "BF-0001", items: [] }, error: null });
    const r = await counterOrderReceipt("cashier-test-token", "order-1");
    expect(rpc).toHaveBeenCalledWith("counter_order_receipt", { p_token: "cashier-test-token", p_order_id: "order-1" });
    expect(r.order_number).toBe("BF-0001");
  });

  it.each(["Session caisse expirée. Entre ton code.", "Commande comptoir introuvable."])(
    "refuses to print when the database denies it: %s",
    async (message) => {
      rpc.mockResolvedValue({ data: null, error: { message } });
      await expect(counterOrderReceipt("bad-token", "order-1")).rejects.toThrow(message);
    },
  );

  it("prints the time in Benin time (UTC+1)", () => {
    expect(receiptDate("2026-11-21T23:30:00Z")).toBe("22/11/2026 à 00:30");
  });

  it("gives back change only from the cash received, never negative", () => {
    expect(receiptChange(4500, 5000)).toBe(500);
    expect(receiptChange(4500, 4000)).toBe(0);
    expect(receiptChange(4500, undefined)).toBeNull();
  });

  it("names the payment method used", () => {
    expect(paymentLabel("cash")).toBe("Espèces");
    expect(paymentLabel("mobile_money")).toBe("Mobile Money");
  });
});

describe("reçu groupé", () => {
  const base = {
    order_number: "BF-0001",
    status: "received",
    created_at: "2026-11-10T12:00:00Z",
    paid_at: "2026-11-10T12:00:00Z",
    dine_in: true,
    payment_method: "cash",
    customer_name: null,
    items_total_fcfa: 2500,
    discount_fcfa: 0,
    total_fcfa: 2500,
    cashier_name: null,
    restaurant: { name: "BOUFF", address: null, phone: null, city: null },
    items: [{ name: "Smash", variant: null, quantity: 1, unit_price_fcfa: 2500, line_total_fcfa: 2500, options: [] }],
  };
  it("additionne les commandes de la table sans compter les annulées", () => {
    const t = receiptGroupTotals([
      { ...base, table_label: "5" },
      { ...base, order_number: "BF-0002", table_label: "5", payment_method: "mobile_money", total_fcfa: 1000 },
      { ...base, order_number: "BF-0003", table_label: "5", status: "cancelled", total_fcfa: 3000 },
    ]);
    expect(t.total).toBe(3500);
    expect(t.orders).toBe(2);
    expect(t.tables).toEqual(["5"]);
    expect(t.byPayment).toEqual([
      { method: "cash", total: 2500 },
      { method: "mobile_money", total: 1000 },
    ]);
  });
  it("affiche la table seulement sur place", () => {
    expect(serviceLabel({ dine_in: true, table_label: "5" })).toBe("Sur place · Table 5");
    expect(serviceLabel({ dine_in: false, table_label: null })).toBe("À emporter");
    expect(serviceLabel({ order_type: "delivery", dine_in: false, table_label: null })).toBe("Livraison");
  });
});
