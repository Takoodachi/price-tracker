import { identifyRetailer, toCents, type Condition } from '@pricetracker/shared';
import { config } from '../config';
import { UpstreamError } from '../errors';
import { fetchJson } from '../http';
import type { ProductCluster, Source, SourceOffer } from './types';

/**
 * Google Shopping via the "Real-Time Product Search" API (OpenWeb Ninja),
 * reached either through RapidAPI (same RAPIDAPI_KEY as Amazon, after
 * subscribing) or directly with an OpenWeb Ninja key.
 *
 * This is how Walmart, Target, Newegg, Costco, B&H, GameStop and others are
 * covered: none of them offer a practical public product API. Google already
 * groups offers from different stores into one product, which is the most
 * reliable cross-store product matching available.
 */

interface ShoppingProduct {
  product_id?: string;
  product_title?: string;
  product_photos?: string[];
  price?: string;
  store_name?: string;
}

interface ShoppingOffer {
  offer_title?: string;
  offer_page_url?: string;
  price?: string;
  product_condition?: string;
  store_name?: string;
}

interface Envelope<T> {
  status?: string;
  error?: { message?: string } | string;
  data?: T;
}

const direct = Boolean(config.OPENWEBNINJA_API_KEY);

function endpoint(kind: 'search' | 'offers'): string {
  if (direct) {
    return `https://api.openwebninja.com/realtime-product-search/v2/${kind === 'search' ? 'search' : 'product-offers'}`;
  }
  const path = kind === 'search' ? config.SHOPPING_SEARCH_PATH : config.SHOPPING_OFFERS_PATH;
  return `https://${config.SHOPPING_RAPIDAPI_HOST}${path}`;
}

function headers(): Record<string, string> {
  return direct
    ? { 'x-api-key': config.OPENWEBNINJA_API_KEY! }
    : { 'x-rapidapi-key': config.RAPIDAPI_KEY ?? '', 'x-rapidapi-host': config.SHOPPING_RAPIDAPI_HOST };
}

async function call<T>(kind: 'search' | 'offers', params: Record<string, string>, signal: AbortSignal): Promise<T> {
  let body: Envelope<T>;
  try {
    body = await fetchJson<Envelope<T>>(`${endpoint(kind)}?${new URLSearchParams(params)}`, {
      headers: headers(),
      signal,
      timeoutMs: 20_000,
    });
  } catch (err) {
    if (err instanceof UpstreamError && /not subscribed/i.test(err.message)) {
      throw new UpstreamError(
        403,
        'Not subscribed yet: open "Real-Time Product Search" on RapidAPI and subscribe to the free plan.',
        true,
      );
    }
    throw err;
  }
  if (body.status && body.status !== 'OK') {
    const message = typeof body.error === 'string' ? body.error : body.error?.message;
    throw new UpstreamError(502, message ?? `Google Shopping returned ${body.status}`);
  }
  if (!body.data) throw new UpstreamError(502, 'Google Shopping returned no data');
  return body.data;
}

/**
 * Google product ids look like "catalogid:1157...,productid:8254...,gpcid:4555...,
 * headlineOfferDocid:...". The headline part changes between searches, so the
 * stable key is the product cluster id (gpcid), falling back to catalogid.
 */
export function clusterKey(productId: string): string {
  for (const field of ['gpcid', 'catalogid', 'productid']) {
    const match = productId.match(new RegExp(`(?:^|,)${field}:(\\d+)`));
    if (match) return `${field}:${match[1]}`;
  }
  return productId;
}

function condition(value: string | undefined): Condition {
  const v = (value ?? '').toUpperCase();
  if (v === 'USED') return 'used';
  if (v === 'REFURBISHED') return 'refurbished';
  return 'new';
}

async function searchProducts(query: string, signal: AbortSignal, stores: string): Promise<ShoppingProduct[]> {
  const params: Record<string, string> = {
    q: query,
    country: 'us',
    language: 'en',
    limit: '20',
    product_condition: 'NEW',
  };
  if (stores) params.stores = stores;
  const data = await call<{ products?: ShoppingProduct[] }>('search', params, signal);
  return data.products ?? [];
}

export const shopping: Source = {
  name: 'shopping',
  label: 'Google Shopping',
  disabledReason:
    config.RAPIDAPI_KEY || config.OPENWEBNINJA_API_KEY ? null : 'Add RAPIDAPI_KEY or OPENWEBNINJA_API_KEY to .env',

  async search(query, signal) {
    // Restrict to official retailers; if the store filter matches nothing
    // (e.g. a niche product), fall back to all stores and filter ourselves.
    let products = await searchProducts(query, signal, config.SHOPPING_STORES);
    if (products.length === 0 && config.SHOPPING_STORES) products = await searchProducts(query, signal, '');

    const clusters: ProductCluster[] = [];
    const seen = new Set<string>();
    for (const p of products) {
      if (!p.product_id || !p.product_title) continue;
      const key = clusterKey(p.product_id);
      if (seen.has(key)) continue;
      seen.add(key);
      const retailer = identifyRetailer(p.store_name);
      const price = toCents(p.price);
      clusters.push({
        key,
        ref: p.product_id,
        title: p.product_title,
        imageUrl: p.product_photos?.[0] ?? null,
        teaser: retailer && price ? { retailerName: retailer.name, priceCents: price } : null,
      });
    }
    return { offers: [], clusters };
  },

  async offersFor(ref, signal) {
    const data = await call<{ offers?: ShoppingOffer[] }>(
      'offers',
      { product_id: ref, country: 'us', language: 'en' },
      signal,
    );
    const key = clusterKey(ref);
    // One offer per official retailer: the cheapest new one if there is one.
    const best = new Map<string, SourceOffer>();
    for (const o of data.offers ?? []) {
      const retailer = identifyRetailer(o.store_name, o.offer_page_url);
      if (!retailer || !o.offer_page_url) continue;
      const offer: SourceOffer = {
        source: 'shopping',
        externalId: `${key}|${retailer.slug}`,
        retailer: retailer.slug,
        title: o.offer_title ?? retailer.name,
        url: o.offer_page_url,
        imageUrl: null,
        priceCents: toCents(o.price),
        currency: 'USD',
        inStock: true,
        condition: condition(o.product_condition),
        verified: true,
      };
      const current = best.get(retailer.slug);
      const better =
        !current ||
        (offer.condition === 'new' && current.condition !== 'new') ||
        (offer.condition === current.condition && (offer.priceCents ?? Infinity) < (current.priceCents ?? Infinity));
      if (better) best.set(retailer.slug, offer);
    }
    return [...best.values()];
  },
};
