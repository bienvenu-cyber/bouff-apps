import { bouffStorage } from "./storage";
import { CART_STORAGE_KEY, ZONE_STORAGE_KEY } from "./config";
import {
  loadMenu,
  optionById,
  type BouffMenu,
} from "./catalog";

export interface CartLine {
  lineId: string;
  foodId: string;
  variationId: string;
  quantity: number;
  optionIds: string[];
  note?: string | null;
}

function read(): CartLine[] {
  if (false) return [];
  try {
    const raw = bouffStorage.getItem(CART_STORAGE_KEY);
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function write(lines: CartLine[]) {
  if (false) return;
  bouffStorage.setItem(CART_STORAGE_KEY, JSON.stringify(lines));
}

export function getCartLines(): CartLine[] {
  return read();
}

export function clearCart() {
  write([]);
}

function signature(line: Omit<CartLine, "lineId" | "quantity">) {
  return [line.foodId, line.variationId, [...line.optionIds].sort().join("-"), line.note ?? ""].join("|");
}

export function upsertLine(input: {
  foodId: string;
  variationId: string;
  quantity: number;
  optionIds?: string[];
  note?: string | null;
}) {
  const lines = read();
  const candidate = {
    foodId: input.foodId,
    variationId: input.variationId,
    optionIds: input.optionIds ?? [],
    note: input.note ?? null,
  };
  const existing = lines.find((l) => signature(l) === signature(candidate));
  if (existing) {
    existing.quantity = Math.max(0, existing.quantity + input.quantity);
  } else if (input.quantity > 0) {
    lines.push({
      lineId: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      quantity: input.quantity,
      ...candidate,
    });
  }
  write(lines.filter((l) => l.quantity > 0));
}

export function setLineQuantity(lineId: string, quantity: number) {
  const lines = read()
    .map((l) => (l.lineId === lineId ? { ...l, quantity } : l))
    .filter((l) => l.quantity > 0);
  write(lines);
}

export function removeLine(lineId: string) {
  write(read().filter((l) => l.lineId !== lineId));
}

export function getSelectedZoneId(): string | null {
  if (false) return null;
  return bouffStorage.getItem(ZONE_STORAGE_KEY);
}

export function setSelectedZoneId(zoneId: string | null) {
  if (false) return;
  if (zoneId) bouffStorage.setItem(ZONE_STORAGE_KEY, zoneId);
  else bouffStorage.removeItem(ZONE_STORAGE_KEY);
}

export interface PricedLine {
  line: CartLine;
  foodTitle: string;
  foodImage: string | null;
  categoryId: string | null;
  variationTitle: string;
  unitPrice: number;
  addons: { id: string; addonId: string; title: string; price: number }[];
  addonsTotal: number;
  itemTotal: number;
}

export interface PricedCart {
  lines: PricedLine[];
  subtotal: number;
  menu: BouffMenu;
}

// Le prix affiché est reconstruit depuis la base ; le total qui compte
// reste celui recalculé par la base au moment de la commande.
export async function priceCart(): Promise<PricedCart> {
  const menu = await loadMenu();
  const lines: PricedLine[] = [];

  for (const line of read()) {
    const item = menu.items.find((i) => i.id === line.foodId);
    const variant = item?.variations.find((v) => v.id === line.variationId);
    if (!item || !variant) continue;

    const addons = line.optionIds
      .map((optionId) => optionById(menu, optionId))
      .filter(Boolean)
      .map((found) => ({
        id: found!.option.id,
        addonId: found!.group.id,
        title: found!.option.title,
        price: found!.option.price,
      }));
    const addonsTotal = addons.reduce((sum, a) => sum + a.price, 0);
    const unitPrice = variant.price + addonsTotal;

    lines.push({
      line,
      foodTitle: item.title,
      foodImage: item.image,
      categoryId: item.categoryId,
      variationTitle: variant.title,
      unitPrice: variant.price,
      addons,
      addonsTotal,
      itemTotal: unitPrice * line.quantity,
    });
  }

  return {
    lines,
    subtotal: lines.reduce((sum, l) => sum + l.itemTotal, 0),
    menu,
  };
}

export function deliveryFeeFor(menu: BouffMenu, zoneId: string | null): number {
  if (!zoneId) return menu.zones[0]?.fee ?? 0;
  return menu.zones.find((z) => z.id === zoneId)?.fee ?? menu.zones[0]?.fee ?? 0;
}

// Le site Enatega n'a pas de sélecteur de zone : on retrouve la zone
// à partir du texte de l'adresse, sinon on garde la zone choisie ou la première.
export function resolveZoneId(menu: BouffMenu, address?: string | null): string | null {
  const stored = getSelectedZoneId();
  if (stored && menu.zones.some((z) => z.id === stored)) return stored;
  if (address) {
    const needle = address.toLowerCase();
    const match = menu.zones.find((z) => needle.includes(z.name.toLowerCase()));
    if (match) return match.id;
  }
  return menu.zones[0]?.id ?? null;
}
