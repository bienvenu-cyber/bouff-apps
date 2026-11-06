import { normalizePhone, validPhone, startPayload, paymentState } from './paymentLogic';
test('préfixes et validation Bénin', () => {
  for (const value of ['0165409059', '+229 01 65 40 90 59', '2290165409059']) { expect(normalizePhone(value)).toBe('0165409059'); expect(validPhone(value)).toBe(true); }
  for (const value of ['65409059', '0265409059', '016540905', 'abc0165409059']) expect(validPhone(value)).toBe(false);
});
const base = { orderNumber: 'BF-0042', customerPhone: '+2290165409059' };
test('payload momo séparé du téléphone de commande', () => {
  expect(startPayload({ ...base, method: 'momo', network: 'moov', payerPhone: '01 12 34 56 78' })).toMatchObject({ action: 'start', returnTo: 'app', customerPhone: base.customerPhone, payerPhone: '0112345678', network: 'moov' });
  expect(() => startPayload({ ...base, method: 'momo' })).toThrow();
});
test('carte : e-mail obligatoire, sans réseau ni numéro payeur', () => {
  expect(() => startPayload({ ...base, method: 'card' })).toThrow();
  const result = startPayload({ ...base, method: 'card', email: ' a@b.bj ', network: 'mtn' });
  expect(result).toMatchObject({ email: 'a@b.bj', returnTo: 'app' }); expect(result).not.toHaveProperty('network');
});
test('seul le statut serveur confirme ; deadline locale non probante', () => {
  expect(paymentState({ orderStatus: 'awaiting_payment', deadline: '2000-01-01' })).toBe('waiting');
  expect(paymentState({ orderStatus: 'awaiting_payment', payment: { status: 'successful' } })).toBe('waiting');
  expect(paymentState({ orderStatus: 'received' })).toBe('success');
  expect(paymentState({ paid: true })).toBe('success');
  expect(paymentState({ orderStatus: 'cancelled', paid: true })).toBe('cancelled');
  expect(paymentState({ orderStatus: 'awaiting_payment', payment: { status: 'failed', reason: 'Refusé' } })).toBe('failed');
});
