import { describe, expect, it } from 'vitest';
import { countGap, freezerOk, fridgeOk, hygieneAllOk, HYGIENE_ITEMS, isLowStock, lossError, parseAmount, parseQty, parseTemp } from './stock-rules';

describe('Saisie des quantités', () => {
  it('accepte la virgule française', () => {
    expect(parseQty('1,5')).toBe(1.5);
    expect(parseQty('40')).toBe(40);
  });
  it('refuse le vide, le texte et le négatif', () => {
    expect(parseQty('')).toBeNull();
    expect(parseQty('abc')).toBeNull();
    expect(parseQty('-2')).toBeNull();
  });
  it('lit les montants avec espaces', () => {
    expect(parseAmount('12 500')).toBe(12500);
    expect(parseAmount('7500F')).toBe(7500);
    expect(parseAmount('1,5')).toBeNull();
  });
});

describe('Comptage', () => {
  it('il manque 0,5 kg de viande à 4 000 F/kg : écart de -2 000 F', () => {
    expect(countGap(4.5, 4, 4000)).toEqual({ gap: -0.5, value: -2000 });
  });
  it('sans prix d’achat, l’écart en francs est 0', () => {
    expect(countGap(10, 12, null)).toEqual({ gap: 2, value: 0 });
  });
});

describe('Stock bas', () => {
  it('alerte quand le stock atteint le minimum', () => {
    expect(isLowStock({ qty: 20, min_qty: 20 })).toBe(true);
    expect(isLowStock({ qty: 21, min_qty: 20 })).toBe(false);
  });
  it('pas d’alerte sans minimum fixé', () => {
    expect(isLowStock({ qty: 0, min_qty: 0 })).toBe(false);
  });
});

describe('Pertes', () => {
  it('refuse une perte plus grande que le stock', () => {
    expect(lossError(4.5, 100, 'kg', 'Viande')).toContain('Il ne reste que 4,5 kg');
    expect(lossError(4.5, 0.5, 'kg', 'Viande')).toBeNull();
  });
});

describe('Hygiène', () => {
  it('frigo 5 °C maximum, congélateur -18 °C maximum', () => {
    expect(fridgeOk(5)).toBe(true);
    expect(fridgeOk(6)).toBe(false);
    expect(freezerOk(-18)).toBe(true);
    expect(freezerOk(-12)).toBe(false);
    expect(parseTemp('-18')).toBe(-18);
    expect(parseTemp('3,5')).toBe(3.5);
  });
  it('tout doit être coché et les températures bonnes', () => {
    const items = HYGIENE_ITEMS.ouverture;
    const all = Object.fromEntries(items.map((i) => [i.key, true]));
    expect(hygieneAllOk(all, items, 3, -19)).toBe(true);
    expect(hygieneAllOk({ ...all, gaz: false }, items, 3, -19)).toBe(false);
    expect(hygieneAllOk(all, items, 3, -12)).toBe(false);
  });
});
