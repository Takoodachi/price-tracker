/** Shapes of the JSON exchanged between apps/api and apps/web. */

export type Condition = 'new' | 'used' | 'refurbished';

export type SourceName = 'amazon' | 'bestbuy' | 'shopping' | 'demo';

export interface Offer {
  /** Listing id in our database. */
  id: number;
  retailer: string;
  retailerName: string;
  title: string;
  url: string;
  priceCents: number | null;
  currency: string;
  inStock: boolean | null;
  condition: Condition;
  source: SourceName;
  checkedAt: string;
  /**
   * False while the price only comes from a search snippet that may show a
   * used seller's price (Amazon). The UI marks these as approximate.
   */
  verified: boolean;
}

export interface ProductSummary {
  id: number;
  title: string;
  imageUrl: string | null;
  brand: string | null;
  /** One offer per retailer, cheapest eligible first. */
  offers: Offer[];
  best: Offer | null;
  /** How much cheaper the best offer is than the next retailer's. */
  savingsCents: number | null;
  isFavorite: boolean;
  /**
   * The product came from Google Shopping but its store-by-store prices
   * haven't been fetched yet. `teaser` holds the one price Google showed.
   */
  moreOffersAvailable: boolean;
  teaser: { retailerName: string; priceCents: number } | null;
  refreshedAt: string | null;
}

export type SourceStatus = 'ok' | 'pending' | 'error' | 'disabled';

export interface SourceState {
  source: SourceName;
  label: string;
  status: SourceStatus;
  message?: string;
}

export interface SearchResponse {
  query: string;
  products: ProductSummary[];
  sources: SourceState[];
  /** More results or prices are still loading; poll again shortly. */
  pending: boolean;
}

export interface PricePoint {
  /** ISO date (day). */
  date: string;
  /** Lowest in-stock new price seen that day across all retailers. */
  priceCents: number;
}

export interface ProductDetail extends ProductSummary {
  history: PricePoint[];
  lowestEverCents: number | null;
  targetPriceCents: number | null;
  pending: boolean;
}

export interface Favorite {
  product: ProductSummary;
  targetPriceCents: number | null;
  /** Best price at the moment the item was favorited. */
  savedPriceCents: number | null;
  createdAt: string;
  history: PricePoint[];
  belowTarget: boolean;
}

export interface User {
  id: number;
  email: string;
}

export interface ApiErrorBody {
  error: { message: string; code?: string; fields?: Record<string, string> };
}
