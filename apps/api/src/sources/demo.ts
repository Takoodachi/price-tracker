import { config } from '../config';
import { sleep } from '../resilience';
import type { ProductCluster, Source, SourceOffer } from './types';

/**
 * Fake store data for developing the UI without spending API quota
 * (DEMO_MODE=true). Prices are deterministic per product and drift a little
 * each day so price history charts have something to show. The web app labels
 * every demo offer, so it can't be mistaken for a real price.
 */

function hash(text: string): number {
  let h = 2166136261;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

const VARIANTS = ['', 'Pro', 'Mini', 'Bundle'];
const STORES = ['amazon', 'bestbuy', 'walmart', 'target', 'newegg', 'costco'];

function titleCase(text: string): string {
  return text.replace(/\b\p{L}/gu, (c) => c.toUpperCase());
}

function basePrice(ref: string): number {
  return (49 + (hash(ref) % 950)) * 100;
}

function storeSearchUrl(retailer: string, title: string): string {
  const q = encodeURIComponent(title);
  const urls: Record<string, string> = {
    amazon: `https://www.amazon.com/s?k=${q}`,
    bestbuy: `https://www.bestbuy.com/site/searchpage.jsp?st=${q}`,
    walmart: `https://www.walmart.com/search?q=${q}`,
    target: `https://www.target.com/s?searchTerm=${q}`,
    newegg: `https://www.newegg.com/p/pl?d=${q}`,
    costco: `https://www.costco.com/CatalogSearch?keyword=${q}`,
  };
  return urls[retailer]!;
}

export const demo: Source = {
  name: 'demo',
  label: 'Demo store',
  disabledReason: config.DEMO_MODE ? null : 'Set DEMO_MODE=true to enable',

  async search(query, signal) {
    await sleep(300, signal);
    const base = titleCase(query.trim());
    const clusters: ProductCluster[] = VARIANTS.map((variant) => {
      const title = variant ? `${base} ${variant}` : base;
      const ref = `demo:${title.toLowerCase()}`;
      // Stands in for the single headline price a real aggregator shows.
      return { key: ref, ref, title, imageUrl: null, teaser: { retailerName: 'Demo store', priceCents: basePrice(ref) } };
    });
    // Like Google's resale-only clusters: no official seller anywhere, so the
    // search must hide it (the API tests rely on this).
    const resale = `demo:${base.toLowerCase()} resale lot`;
    clusters.push({ key: resale, ref: resale, title: `${base} Resale Lot`, imageUrl: null, teaser: null });
    return { offers: [], clusters };
  },

  async offersFor(ref, signal) {
    await sleep(400, signal);
    if (ref.endsWith(' resale lot')) return [];
    const title = titleCase(ref.replace(/^demo:/, ''));
    const base = basePrice(ref);
    const day = Math.floor(Date.now() / 86_400_000);
    return STORES.filter((store) => hash(ref + store) % 5 !== 0).map((retailer): SourceOffer => {
      const drift = ((hash(`${ref}${retailer}${day}`) % 21) - 10) / 100; // -10%..+10%
      const inStock = hash(`${ref}${retailer}stock`) % 7 !== 0;
      return {
        source: 'demo',
        externalId: `${ref}|${retailer}`,
        retailer,
        title,
        url: storeSearchUrl(retailer, title),
        imageUrl: null,
        priceCents: Math.round((base * (1 + drift)) / 100) * 100 - 1,
        currency: 'USD',
        inStock,
        condition: 'new',
        verified: true,
      };
    });
  },
};
