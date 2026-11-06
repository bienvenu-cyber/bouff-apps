import { describe, expect, it } from "vitest";
import { normalizePhone, validPhone, paymentPayload, paymentState } from "./payment-logic";
describe("Paiement FeexPay", () => {
  it.each(["0165409059", "+229 01 65 40 90 59", "2290165409059", "65409059"])("normalise %s", phone => {
    expect(normalizePhone(phone)).toBe("0165409059"); expect(validPhone(phone)).toBe(true);
  });
  it.each(["", "0265409059", "+2280165409059", "016540905x"])("rejette %s", phone => expect(validPhone(phone)).toBe(false));
  it.each(["mtn", "moov", "celtiis"] as const)("construit le paiement %s", network => {
    expect(paymentPayload({ method: "momo", network, payerPhone: "+22965409059", email: "" })).toEqual({ method: "momo", network, payerPhone: "0165409059" });
  });
  it("ne transmet pas les champs MoMo pour une carte", () => {
    expect(paymentPayload({ method: "card", network: "mtn", payerPhone: "", email: " client@exemple.com " })).toEqual({ method: "card", email: "client@exemple.com" });
  });
  it("exige un e-mail", () => expect(() => paymentPayload({ method: "card", network: "mtn", payerPhone: "", email: "" })).toThrow());
  it("ne confirme pas le statut fournisseur seul", () => expect(paymentState({ ok: true, status: "successful", orderStatus: "awaiting_payment" })).not.toBe("confirmed"));
  it.each([
    [{ ok: true, paid: true }, "confirmed"],
    [{ ok: true, orderStatus: "received" }, "confirmed"],
    [{ ok: true, orderStatus: "cancelled" }, "cancelled"],
    [{ ok: true, orderStatus: "awaiting_payment" }, "idle"],
    [{ ok: false, code: "PAYMENT_IN_PROGRESS" }, "pending"],
    [{ ok: true, status: "failed" }, "failed"],
  ] as const)("réduit la réponse serveur", (reply, expected) => expect(paymentState(reply)).toBe(expected));
});
