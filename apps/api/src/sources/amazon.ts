import { toCents } from '@pricetracker/shared';
import { config } from '../config';
import { UpstreamError } from '../errors';
import { fetchJson } from '../http';
import { sleep } from '../resilience';
import { conditionFromTitle, type Source, type SourceOffer } from './types';

/**
 * Amazon via the "Price Analytics" API on RapidAPI. It's job based: start a
 * job, then poll until it finishes (usually 3-8 seconds). The backend does the
 * polling, so the browser makes one request instead of polling itself.
 */

interface JobStart {
  error?: boolean;
  message?: string;
  job_id?: string;
}

interface JobPoll<T> {
  status?: string;
  results?: { success?: boolean; reason?: string; content?: T }[];
}

interface SearchContent {
  offers?: { asin?: string; name?: string; image?: string; price?: number | string }[];
}

interface LookupContent {
  asin?: string;
  name?: string;
  url?: string;
  currency?: string;
  buybox_price?: number | null;
  is_available?: boolean;
  offers?: { price?: number; condition?: string }[];
}

const host = config.PRICE_ANALYTICS_HOST;

function headers(): Record<string, string> {
  return { 'x-rapidapi-key': config.RAPIDAPI_KEY ?? '', 'x-rapidapi-host': host };
}

async function runJob<T>(endpoint: 'search-by-term' | 'search-by-id', value: string, signal: AbortSignal): Promise<T> {
  const start = await fetchJson<JobStart>(`https://${host}/${endpoint}`, {
    method: 'POST',
    headers: { ...headers(), 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ source: 'amazon', country: 'us', values: value }).toString(),
    signal,
  });
  if (start.error || !start.job_id) throw new UpstreamError(502, start.message ?? 'Amazon search did not start');

  const deadline = Date.now() + 45_000;
  let delay = 1500;
  while (Date.now() < deadline) {
    await sleep(delay, signal);
    delay = Math.min(delay * 1.4, 4000);
    const job = await fetchJson<JobPoll<T>>(`https://${host}/poll-job/${encodeURIComponent(start.job_id)}`, {
      headers: headers(),
      signal,
      retries: 2,
    });
    if (job.status === 'finished') {
      const result = job.results?.[0];
      if (!result?.success || !result.content) throw new UpstreamError(502, result?.reason ?? 'Amazon job failed');
      return result.content;
    }
    if (job.status && !['working', 'new', 'pending', 'queued'].includes(job.status)) {
      throw new UpstreamError(502, `Amazon job ${job.status}`);
    }
  }
  throw new UpstreamError(504, 'Amazon took too long to respond');
}

function productUrl(asin: string): string {
  return `https://www.amazon.com/dp/${asin}`;
}

export const amazon: Source = {
  name: 'amazon',
  label: 'Amazon',
  disabledReason: config.RAPIDAPI_KEY ? null : 'Add RAPIDAPI_KEY to .env',

  async search(query, signal) {
    const content = await runJob<SearchContent>('search-by-term', query, signal);
    const offers: SourceOffer[] = [];
    for (const item of content.offers ?? []) {
      if (!item.asin || !item.name) continue;
      offers.push({
        source: 'amazon',
        externalId: item.asin,
        retailer: 'amazon',
        title: item.name,
        url: productUrl(item.asin),
        imageUrl: item.image ?? null,
        // 0 means "no price shown"; toCents turns it into null.
        priceCents: toCents(item.price),
        currency: 'USD',
        inStock: null,
        condition: conditionFromTitle(item.name),
        // Search prices can be the cheapest *used* offer; confirmed later by lookup().
        verified: false,
      });
    }
    return { offers, clusters: [] };
  },

  async lookup(asin, signal) {
    const c = await runJob<LookupContent>('search-by-id', asin, signal);
    // The API sometimes returns asin: "" alongside valid data, so only an
    // entirely empty result means the product is gone.
    if (!c.name && !c.offers?.length && c.buybox_price == null) return null;
    // Prefer the Buy Box price; otherwise the cheapest *new* offer.
    const newPrices = (c.offers ?? [])
      .filter((o) => /^new/i.test(o.condition ?? ''))
      .map((o) => toCents(o.price))
      .filter((p): p is number => p !== null);
    const priceCents = toCents(c.buybox_price) ?? (newPrices.length ? Math.min(...newPrices) : null);
    const title = c.name ?? asin;
    return {
      source: 'amazon',
      externalId: asin,
      retailer: 'amazon',
      title,
      url: productUrl(asin),
      imageUrl: null,
      priceCents,
      currency: c.currency ?? 'USD',
      inStock: priceCents !== null && (c.is_available !== false || newPrices.length > 0),
      condition: conditionFromTitle(title),
      verified: true,
    };
  },
};
