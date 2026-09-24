export const formatNumber = (amount: number) => {
  return new Intl.NumberFormat('fr-FR', {
    maximumFractionDigits: 0,
  }).format(amount);
};

export const formatNumberWithCurrency = (
  amount: number,
  currency: string = 'USD',
  locale: string = 'en-US'
) => {
  // BOUFF : tous les montants sont en FCFA entiers (« 1 500 FCFA »).
  void currency;
  void locale;
  return `${new Intl.NumberFormat('fr-FR', { maximumFractionDigits: 0 }).format(Math.round(Number(amount) || 0))} FCFA`;
  // eslint-disable-next-line no-unreachable
  const _locale = locale || 'en-US';
  const _currency = currency || 'USD';

  return new Intl.NumberFormat(_locale, {
    style: 'currency',
    currency: _currency,
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(amount);
};
