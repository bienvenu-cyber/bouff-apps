import { describe, expect, it } from "vitest";
import { canEditCounterOrder, editSettlement, normalizeTable } from "./till";

describe("modification d'une commande payée", () => {
  it("demande la différence quand le total augmente", () => {
    expect(editSettlement(2500, 3500)).toEqual({ kind: "collect", amount: 1000 });
  });
  it("rend la différence quand le total baisse", () => {
    expect(editSettlement(4000, 3000)).toEqual({ kind: "refund", amount: 1000 });
  });
  it("ne demande rien quand le total ne change pas", () => {
    expect(editSettlement(3000, 3000)).toEqual({ kind: "none", amount: 0 });
  });
  it("n'autorise la modification qu'avant l'acceptation par la cuisine", () => {
    expect(canEditCounterOrder("received")).toBe(true);
    expect(canEditCounterOrder("in_kitchen")).toBe(false);
    expect(canEditCounterOrder("ready")).toBe(false);
    expect(canEditCounterOrder("cancelled")).toBe(false);
  });
});

describe("numéro de table", () => {
  it("est facultatif et ignoré à emporter", () => {
    expect(normalizeTable(true, "  ")).toBeNull();
    expect(normalizeTable(false, "5")).toBeNull();
    expect(normalizeTable(true, " 5 ")).toBe("5");
  });
  it("est limité à 12 caractères", () => {
    expect(normalizeTable(true, "Terrasse-gauche-2")).toHaveLength(12);
  });
});
