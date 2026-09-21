import type { Condition } from './types';

export interface PricedOffer {
  retailer: string;
  priceCents: number | null;
  inStock: boolean | null;
  condition: Condition;
  currency: string;
  /** Aggregator-sourced offers lose ties to a retailer's own API. */
  source: string;
  checkedAt: string;
  /** Unconfirmed prices rank after confirmed ones (see Offer.verified). */
  verified?: boolean;
}

/**
 * An offer can be the "best price" only if it is a real, buyable, new item:
 * a price > 0, not known to be out of stock, new condition, and in the same
 * currency as the comparison. Used/renewed items and $0 placeholders are
 * shown, but never win.
 */
export function isEligible(offer: PricedOffer, currency = 'USD'): boolean {
  return (
    offer.priceCents !== null &&
    offer.priceCents > 0 &&
    offer.inStock !== false &&
    offer.condition === 'new' &&
    offer.currency === currency
  );
}

function compareOffers(a: PricedOffer, b: PricedOffer): number {
  const ea = isEligible(a);
  const eb = isEligible(b);
  if (ea !== eb) return ea ? -1 : 1;
  // A confirmed price beats an unconfirmed one: an Amazon search snippet
  // can be a used seller's price, which would be a false "best price".
  const va = a.verified !== false;
  const vb = b.verified !== false;
  if (va !== vb) return va ? -1 : 1;
  const pa = a.priceCents ?? Number.POSITIVE_INFINITY;
  const pb = b.priceCents ?? Number.POSITIVE_INFINITY;
  if (pa !== pb) return pa - pb;
  if ((a.inStock === true) !== (b.inStock === true)) return a.inStock === true ? -1 : 1;
  return a.retailer.localeCompare(b.retailer);
}

/**
 * Keeps one offer per retailer. Preference: eligible over not, the retailer's
 * own API over an aggregator, then fresher data, then lower price.
 */
export function onePerRetailer<T extends PricedOffer>(offers: T[]): T[] {
  const chosen = new Map<string, T>();
  for (const offer of offers) {
    const current = chosen.get(offer.retailer);
    if (!current || preferOver(offer, current)) chosen.set(offer.retailer, offer);
  }
  return [...chosen.values()];
}

function preferOver(a: PricedOffer, b: PricedOffer): boolean {
  const ea = isEligible(a);
  const eb = isEligible(b);
  if (ea !== eb) return ea;
  const va = a.verified !== false;
  const vb = b.verified !== false;
  if (va !== vb) return va;
  const directA = a.source !== 'shopping';
  const directB = b.source !== 'shopping';
  if (directA !== directB) return directA;
  if (a.checkedAt !== b.checkedAt) return a.checkedAt > b.checkedAt;
  return (a.priceCents ?? Infinity) < (b.priceCents ?? Infinity);
}

export interface Ranking<T> {
  ranked: T[];
  best: T | null;
  savingsCents: number | null;
}

/** Sorts offers cheapest-eligible first and picks the best one. */
export function rankOffers<T extends PricedOffer>(offers: T[]): Ranking<T> {
  const ranked = onePerRetailer(offers).sort(compareOffers);
  const eligible = ranked.filter((o) => isEligible(o));
  const best = eligible[0] ?? null;
  const runnerUp = eligible[1];
  const savingsCents =
    best && runnerUp && runnerUp.priceCents! > best.priceCents! ? runnerUp.priceCents! - best.priceCents! : null;
  return { ranked, best, savingsCents };
}
