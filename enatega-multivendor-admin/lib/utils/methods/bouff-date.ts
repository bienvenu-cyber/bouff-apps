/** Accepte un horodatage en millisecondes (ancien format) ou une date ISO (BOUFF). */
export function toDate(value: unknown): Date | null {
  if (value === null || value === undefined || value === '') return null;
  if (value instanceof Date) return isNaN(value.getTime()) ? null : value;
  const s = String(value).trim();
  const d = /^\d{10,}$/.test(s) ? new Date(Number(s)) : new Date(s);
  return isNaN(d.getTime()) ? null : d;
}

export function formatDateFr(
  value: unknown,
  options: Intl.DateTimeFormatOptions = {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }
): string {
  const d = toDate(value);
  return d ? d.toLocaleString('fr-FR', options) : '-';
}
