import type { Condition, SourceName } from '@pricetracker/shared';

/** One store's offer for one product, normalized from any integration. */
export interface SourceOffer {
  source: SourceName;
  /** Unique within the source: ASIN, Best Buy SKU, "<cluster>|<retailer>", ... */
  externalId: string;
  retailer: string;
  title: string;
  url: string;
  imageUrl: string | null;
  priceCents: number | null;
  currency: string;
  inStock: boolean | null;
  condition: Condition;
  /**
   * The price came from an exact product lookup. Amazon search snippets can
   * show a used seller's price, so those are stored as unverified until the
   * ASIN is looked up.
   */
  verified: boolean;
  gtin?: string | null;
  model?: string | null;
  brand?: string | null;
}

/** A product as clustered by an aggregator (Google Shopping groups offers by GTIN). */
export interface ProductCluster {
  /** Stable id used to recognize the same product across searches. */
  key: string;
  /** Id passed back to the aggregator to fetch every store's offer. */
  ref: string;
  title: string;
  imageUrl: string | null;
  /** The single price the aggregator shows in search results. */
  teaser: { retailerName: string; priceCents: number } | null;
}

export interface SearchResult {
  offers: SourceOffer[];
  clusters: ProductCluster[];
}

export interface Source {
  name: SourceName;
  label: string;
  /** Set when the integration is turned off (e.g. missing API key). */
  disabledReason: string | null;
  search(query: string, signal: AbortSignal): Promise<SearchResult>;
  /** Re-price one listing by its external id. `null` = no longer sold. */
  lookup?(externalId: string, signal: AbortSignal): Promise<SourceOffer | null>;
  /** All stores' offers for an aggregator cluster. */
  offersFor?(ref: string, signal: AbortSignal): Promise<SourceOffer[]>;
}

export const EMPTY_RESULT: SearchResult = { offers: [], clusters: [] };

export function conditionFromTitle(title: string): SourceOffer['condition'] {
  if (/\b(renewed|refurbished|reconditioned)\b/i.test(title)) return 'refurbished';
  if (/\b(used|pre-?owned|open[- ]box)\b/i.test(title)) return 'used';
  return 'new';
}
