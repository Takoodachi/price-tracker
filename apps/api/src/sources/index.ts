import type { SourceName } from '@pricetracker/shared';
import { CircuitBreaker, RateLimiter } from '../resilience';
import { amazon } from './amazon';
import { bestbuy } from './bestbuy';
import { demo } from './demo';
import { shopping } from './shopping';
import type { Source } from './types';

export type { ProductCluster, SearchResult, Source, SourceOffer } from './types';

/** Per-source limits, well under each API's published rate limit. */
const limits: Record<SourceName, { concurrency: number; minIntervalMs: number }> = {
  amazon: { concurrency: 3, minIntervalMs: 300 },
  bestbuy: { concurrency: 2, minIntervalMs: 250 }, // Best Buy allows 5 req/s
  shopping: { concurrency: 2, minIntervalMs: 500 },
  demo: { concurrency: 10, minIntervalMs: 0 },
};

/** Wraps every network call of a source in its rate limiter and circuit breaker. */
function protect(source: Source): Source & { breaker: CircuitBreaker } {
  const limiter = new RateLimiter(limits[source.name].concurrency, limits[source.name].minIntervalMs);
  const breaker = new CircuitBreaker();
  const guard =
    <A extends unknown[], R>(fn: (...args: A) => Promise<R>) =>
    (...args: A) =>
      breaker.run(() => limiter.run(() => fn(...args)));
  return {
    ...source,
    breaker,
    search: guard(source.search.bind(source)),
    lookup: source.lookup && guard(source.lookup.bind(source)),
    offersFor: source.offersFor && guard(source.offersFor.bind(source)),
  };
}

export const sources = [shopping, bestbuy, amazon, demo].map(protect);

export type ProtectedSource = (typeof sources)[number];

export function getSource(name: string): ProtectedSource | undefined {
  return sources.find((s) => s.name === name && !s.disabledReason);
}

/** Which aggregator owns a product's cluster ref. */
export function clusterSource(ref: string): ProtectedSource | undefined {
  return getSource(ref.startsWith('demo:') ? 'demo' : 'shopping');
}
