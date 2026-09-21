import { toCents } from '@pricetracker/shared';
import { config } from '../config';
import { UpstreamError } from '../errors';
import { fetchJson } from '../http';
import type { Source, SourceOffer } from './types';

/** Best Buy's official Products API (https://developer.bestbuy.com). */

interface BestBuyProduct {
  sku?: number;
  name?: string;
  salePrice?: number;
  upc?: string | null;
  modelNumber?: string | null;
  manufacturer?: string | null;
  url?: string;
  image?: string | null;
  onlineAvailability?: boolean;
  condition?: string;
}

const FIELDS = 'sku,name,salePrice,upc,modelNumber,manufacturer,url,image,onlineAvailability,condition';

function toOffer(p: BestBuyProduct): SourceOffer | null {
  if (!p.sku || !p.name) return null;
  const condition = p.condition?.toLowerCase();
  return {
    source: 'bestbuy',
    externalId: String(p.sku),
    retailer: 'bestbuy',
    title: p.name,
    url: p.url ?? `https://www.bestbuy.com/site/${p.sku}.p?skuId=${p.sku}`,
    imageUrl: p.image ?? null,
    priceCents: toCents(p.salePrice),
    currency: 'USD',
    inStock: p.onlineAvailability ?? null,
    condition: condition === 'refurbished' ? 'refurbished' : condition === 'preowned' ? 'used' : 'new',
    verified: true,
    gtin: p.upc ?? null,
    model: p.modelNumber ?? null,
    brand: p.manufacturer ?? null,
  };
}

export const bestbuy: Source = {
  name: 'bestbuy',
  label: 'Best Buy',
  disabledReason: config.BESTBUY_API_KEY ? null : 'Add BESTBUY_API_KEY to .env (free at developer.bestbuy.com)',

  async search(query, signal) {
    // Keyword syntax: products((search=word1&search=word2)). Only plain words are allowed.
    const words = query
      .toLowerCase()
      .replace(/[^a-z0-9 ]/g, ' ')
      .split(/\s+/)
      .filter(Boolean)
      .slice(0, 8);
    if (words.length === 0) return { offers: [], clusters: [] };
    const params = new URLSearchParams({
      apiKey: config.BESTBUY_API_KEY ?? '',
      format: 'json',
      show: FIELDS,
      pageSize: '12',
      sort: 'bestSellingRank.asc',
    });
    const url = `https://api.bestbuy.com/v1/products((${words.map((w) => `search=${w}`).join('&')}))?${params}`;
    const data = await fetchJson<{ products?: BestBuyProduct[] }>(url, { signal });
    return { offers: (data.products ?? []).map(toOffer).filter((o) => o !== null), clusters: [] };
  },

  async lookup(sku, signal) {
    const params = new URLSearchParams({ apiKey: config.BESTBUY_API_KEY ?? '', format: 'json', show: FIELDS });
    try {
      const product = await fetchJson<BestBuyProduct>(
        `https://api.bestbuy.com/v1/products/${encodeURIComponent(sku)}.json?${params}`,
        { signal },
      );
      return toOffer(product);
    } catch (err) {
      if (err instanceof UpstreamError && err.status === 404) return null;
      throw err;
    }
  },
};
