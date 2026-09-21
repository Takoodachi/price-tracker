/**
 * All prices are stored and passed around as integer cents. Floats are only
 * used at the edges (parsing provider responses, formatting for display).
 */

/**
 * Converts a provider price ("$1,299.99", "1299.99", 1299.99) into cents.
 * Returns null for anything that isn't a real positive price: several
 * providers report 0 or "" when an item has no price shown, and treating that
 * as $0.00 would make it the "best price".
 */
export function toCents(value: unknown): number | null {
  let amount: number;
  if (typeof value === 'number') {
    amount = value;
  } else if (typeof value === 'string') {
    const match = value.replace(/,/g, '').match(/\d+(?:\.\d+)?/);
    if (!match) return null;
    amount = Number(match[0]);
  } else {
    return null;
  }
  if (!Number.isFinite(amount) || amount <= 0) return null;
  return Math.round(amount * 100);
}

export function formatCents(cents: number, currency = 'USD', locale = 'en-US'): string {
  return new Intl.NumberFormat(locale, {
    style: 'currency',
    currency,
    minimumFractionDigits: cents % 100 === 0 ? 0 : 2,
    maximumFractionDigits: 2,
  }).format(cents / 100);
}
