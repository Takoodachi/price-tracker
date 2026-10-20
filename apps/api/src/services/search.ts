import { groupByProduct, type SearchResponse, type SourceName, type SourceState } from '@pricetracker/shared';
import { cacheGet, cacheSet, singleFlight } from '../cache';
import { config } from '../config';
import { logger } from '../logger';
import { sleep } from '../resilience';
import { sources, type ProductCluster, type ProtectedSource, type SearchResult, type SourceOffer } from '../sources';
import { getProductRow, loadSummaries, saveGroup, type Teasers } from './catalog';
import { isRefreshing, needsRefresh, refreshProduct } from './refresh';

type Outcome = { ok: true; result: SearchResult } | { ok: false; message: string };

const ERROR_CACHE_SECONDS = 60;
// Generous, because the filter below drops a lot: for some queries Google
// returns mostly resale-only clusters, and a low cap would crowd out the real
// retailer listings that come after them.
const MAX_PRODUCTS = 40;
/** Products without a Google Shopping cluster whose Amazon/Best Buy prices get confirmed right away. */
const DIRECT_LOOKUP_PREFETCH = 6;

function normalizeQuery(q: string): string {
  return q.trim().toLowerCase().replace(/\s+/g, ' ');
}

function cacheKey(source: SourceName, q: string): string {
  return `search:v1:${source}:${q}`;
}

/** Runs one source's search once (shared by concurrent callers) and caches the outcome. */
function runSearch(source: ProtectedSource, q: string): Promise<Outcome> {
  return singleFlight(cacheKey(source.name, q), async () => {
    let outcome: Outcome;
    try {
      outcome = { ok: true, result: await source.search(q, AbortSignal.timeout(60_000)) };
      await cacheSet(cacheKey(source.name, q), outcome, config.SEARCH_CACHE_SECONDS);
    } catch (err) {
      logger.warn({ source: source.name, q, err: (err as Error).message }, 'search failed');
      outcome = { ok: false, message: (err as Error).message };
      // Cache failures briefly so polling doesn't hammer a broken source.
      await cacheSet(cacheKey(source.name, q), outcome, ERROR_CACHE_SECONDS);
    }
    return outcome;
  });
}

/** A promise plus a synchronous "has it finished?" flag. */
function track<T>(promise: Promise<T>) {
  const state: { done: boolean; value?: T } = { done: false };
  const settled = promise.then((value) => {
    state.done = true;
    state.value = value;
  });
  return { state, settled };
}

/**
 * Searches every enabled source in parallel and merges the results into
 * products with store-by-store prices.
 *
 * Sources are slow (Amazon takes 3-8s), so this waits at most SEARCH_WAIT_MS,
 * returns what's ready, and sets `pending`. The client simply asks again;
 * the in-flight searches keep running and land in the cache.
 */
export async function searchProducts(rawQuery: string, userId: number | null): Promise<SearchResponse> {
  const q = normalizeQuery(rawQuery);
  const startedAt = Date.now();
  const enabled = sources.filter((s) => !s.disabledReason);

  const outcomes = new Map<SourceName, Outcome>();
  const running = new Map<SourceName, ReturnType<typeof track<Outcome>>>();
  await Promise.all(
    enabled.map(async (source) => {
      const cached = await cacheGet<Outcome>(cacheKey(source.name, q));
      if (cached) outcomes.set(source.name, cached);
      else running.set(source.name, track(runSearch(source, q)));
    }),
  );
  if (running.size > 0) {
    await Promise.race([Promise.all([...running.values()].map((r) => r.settled)), sleep(config.SEARCH_WAIT_MS)]);
  }
  for (const [name, run] of running) if (run.state.done) outcomes.set(name, run.state.value!);

  // Google Shopping clusters are the anchors; retailer-API listings attach to them.
  const clusters: ProductCluster[] = [];
  const offers: SourceOffer[] = [];
  for (const source of enabled) {
    const outcome = outcomes.get(source.name);
    if (!outcome?.ok) continue;
    clusters.push(...outcome.result.clusters);
    offers.push(...outcome.result.offers);
  }
  const groups = groupByProduct(clusters, offers);

  const productIds: number[] = [];
  const teasers: Teasers = new Map();
  for (const group of groups) {
    if (productIds.length >= MAX_PRODUCTS) break;
    const id = await saveGroup({ cluster: group.anchor, offers: group.members });
    if (productIds.includes(id)) continue;
    productIds.push(id);
    if (group.anchor?.teaser) teasers.set(id, group.anchor.teaser);
  }

  // Confirm prices for the top results in the background: a full
  // store-by-store check for the first few Google Shopping products (each
  // costs a paid request), and exact Amazon/Best Buy lookups for the first
  // few others. Everything else loads when the product is opened.
  const refreshing: Promise<boolean>[] = [];
  const watched: number[] = [];
  let shoppingBudget = config.SHOPPING_OFFERS_PREFETCH;
  let lookupBudget = DIRECT_LOOKUP_PREFETCH;
  for (const id of productIds) {
    const product = await getProductRow(id);
    if (!product) continue;
    const budgetLeft = product.shopping_ref ? shoppingBudget-- > 0 : lookupBudget-- > 0;
    if (!budgetLeft) continue;
    watched.push(id);
    if (isRefreshing(id) || (await needsRefresh(product))) refreshing.push(refreshProduct(id));
  }
  if (refreshing.length > 0) {
    const remaining = Math.max(1000, config.SEARCH_WAIT_MS - (Date.now() - startedAt));
    await Promise.race([Promise.allSettled(refreshing), sleep(remaining)]);
  }

  // Hide products we can't say anything useful about: no offer from an official
  // retailer, and no official headline price either. Google clusters a lot of
  // resale listings whose sellers are all rejected, and those render as empty
  // cards that cost a request to open and show nothing.
  const products = (await loadSummaries(productIds, userId, teasers)).filter(
    (p) => p.offers.length > 0 || p.teaser !== null,
  );
  const stillRefreshing = watched.some(isRefreshing);

  const states: SourceState[] = sources.map((source) => {
    const base = { source: source.name, label: source.label };
    if (source.disabledReason) return { ...base, status: 'disabled', message: source.disabledReason };
    const outcome = outcomes.get(source.name);
    if (!outcome) return { ...base, status: 'pending' };
    return outcome.ok ? { ...base, status: 'ok' } : { ...base, status: 'error', message: outcome.message };
  });
  // Sources you haven't set up are only worth showing when nothing is working;
  // otherwise they're permanent noise (e.g. Best Buy, whose prices arrive via
  // Google Shopping anyway).
  const anyActive = states.some((s) => s.status !== 'disabled');
  const visibleStates = anyActive ? states.filter((s) => s.status !== 'disabled') : states;

  return {
    query: rawQuery.trim(),
    products,
    sources: visibleStates,
    pending: states.some((s) => s.status === 'pending') || stillRefreshing,
  };
}
