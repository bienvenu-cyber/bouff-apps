import { describe, expect, it, vi } from 'vitest';
import { adminOrderReceipts, receiptGroupTotals } from './receipt';

describe('reçus côté gérante', () => {
  it('demande à la base les reçus des commandes choisies', async () => {
    const rpc = vi.fn().mockResolvedValue({ data: [], error: null });
    await adminOrderReceipts({ rpc }, ['a', 'b']);
    expect(rpc).toHaveBeenCalledWith('admin_order_receipts', { p_order_ids: ['a', 'b'] });
  });

  it("refuse quand la base bloque l'accès", async () => {
    const rpc = vi.fn().mockResolvedValue({ data: null, error: { message: 'Commande introuvable.' } });
    await expect(adminOrderReceipts({ rpc }, ['x'])).rejects.toThrow('Commande introuvable.');
  });

  it('ne compte pas les commandes annulées dans le total groupé', () => {
    const r = {
      order_number: 'BF-0001', status: 'delivered', created_at: '2026-11-10T12:00:00Z', paid_at: null,
      dine_in: true, payment_method: 'cash', customer_name: null, items_total_fcfa: 2500, discount_fcfa: 0,
      total_fcfa: 2500, cashier_name: null, restaurant: { name: 'BOUFF', address: null, phone: null, city: null }, items: [],
    };
    expect(receiptGroupTotals([r, { ...r, status: 'cancelled', total_fcfa: 4000 }]).total).toBe(2500);
  });
});
