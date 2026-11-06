import { describe, expect, it } from "vitest";
import { beninLocal, frenchReason } from "./feexpay-rules";

describe("Règles serveur FeexPay", () => {
  it.each(["0165409059", "+229 01 65 40 90 59", "2290165409059", "002290165409059", "65409059"])(
    "accepte le numéro béninois %s",
    (input) => expect(beninLocal(input)).toBe("0165409059"),
  );
  it.each(["", "0265409059", "+2280165409059", "1234"])("refuse le numéro %s", (input) =>
    expect(beninLocal(input)).toBeNull(),
  );
  it("traduit un solde insuffisant", () =>
    expect(frenchReason("LOW_BALANCE_OR_PAYEE_LIMIT_REACHED_OR_NOT_ALLOWED")).toBe(
      "Solde insuffisant ou plafond atteint sur ce compte Mobile Money.",
    ));
  it("n'affiche jamais un code technique anglais", () =>
    expect(frenchReason("SOME_UNKNOWN_PROVIDER_CODE")).toBe("Paiement refusé ou non validé."));
});
