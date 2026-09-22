import { formatCents, RETAILERS } from '@pricetracker/shared';
import type { Lang } from './translations';

/** Prices are USD, so they always use US formatting ($1,299.99). */
export function price(cents: number | null | undefined): string {
  return cents == null ? '—' : formatCents(cents);
}

const locales: Record<Lang, string> = { en: 'en-US', vi: 'vi-VN' };

export function relativeTime(iso: string, lang: Lang): string {
  const seconds = (new Date(iso).getTime() - Date.now()) / 1000;
  const rtf = new Intl.RelativeTimeFormat(locales[lang], { numeric: 'auto' });
  const abs = Math.abs(seconds);
  if (abs < 60) return rtf.format(Math.round(seconds), 'second');
  if (abs < 3600) return rtf.format(Math.round(seconds / 60), 'minute');
  if (abs < 86_400) return rtf.format(Math.round(seconds / 3600), 'hour');
  return rtf.format(Math.round(seconds / 86_400), 'day');
}

export function shortDate(isoDay: string, lang: Lang): string {
  return new Intl.DateTimeFormat(locales[lang], { month: 'short', day: 'numeric' }).format(
    new Date(`${isoDay}T12:00:00`),
  );
}

/** Parses "$1,299.99" / "1299.99" typed by a user into cents. */
export function parseDollars(input: string): number | null {
  const n = Number(input.replace(/[$,\s]/g, ''));
  return Number.isFinite(n) && n > 0 ? Math.round(n * 100) : null;
}

export function domainFor(retailer: string): string | null {
  return RETAILERS.find((r) => r.slug === retailer)?.domains[0] ?? null;
}
