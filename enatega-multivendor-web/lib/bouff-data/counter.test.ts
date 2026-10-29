import { beforeEach, describe, expect, it, vi } from "vitest";

const { rpc } = vi.hoisted(() => ({ rpc: vi.fn() }));
vi.mock("@supabase/supabase-js", () => ({ createClient: () => ({ rpc }) }));
vi.mock("./config", () => ({ RESTAURANT_SLUG: "bouff", SUPABASE_URL: "https://example.test", SUPABASE_PUBLISHABLE_KEY: "test" }));
import { counterCompleteOrder } from "./counter";

describe("Counter handover", () => {
  beforeEach(() => rpc.mockReset());

  it("sends the cashier token and exact order to the protected handover function", async () => {
    rpc.mockResolvedValue({ error: null });
    await counterCompleteOrder("cashier-test-token", "order-22");
    expect(rpc).toHaveBeenCalledWith("counter_complete_order", { p_token: "cashier-test-token", p_order_id: "order-22" });
  });

  it.each([
    "Session caisse expirée. Entre ton code.",
    "Commande comptoir introuvable.",
    "Commande non payée.",
    "La cuisine doit confirmer que la commande est prête.",
  ])("does not silently accept a denied handover: %s", async (message) => {
    rpc.mockResolvedValue({ error: { message } });
    await expect(counterCompleteOrder("invalid-test-token", "order-22")).rejects.toThrow(message);
  });
});