import { beforeEach, describe, expect, it, vi } from "vitest";

const { rpc } = vi.hoisted(() => ({ rpc: vi.fn() }));
vi.mock("@supabase/supabase-js", () => ({ createClient: () => ({ rpc }) }));
vi.mock("./config", () => ({ RESTAURANT_SLUG: "bouff", SUPABASE_URL: "https://example.test", SUPABASE_PUBLISHABLE_KEY: "test" }));
import { counterOrderReceipt } from "./counter";
import { paymentLabel, receiptChange, receiptDate } from "./receipt";

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
