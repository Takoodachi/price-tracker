import { Redis } from 'ioredis';
import { config } from './config';
import { logger } from './logger';

/**
 * JSON cache on Redis. Every call degrades gracefully: if Redis is down the
 * app keeps working, it just calls the price sources more often.
 */
export const redis = new Redis(config.REDIS_URL, {
  lazyConnect: true,
  maxRetriesPerRequest: 1,
  enableOfflineQueue: false,
});

let warned = false;
redis.on('error', (err) => {
  if (!warned) logger.warn({ err: err.message }, 'Redis unavailable, caching disabled until it reconnects');
  warned = true;
});
redis.on('ready', () => {
  warned = false;
});

export async function connectCache(): Promise<void> {
  try {
    await redis.connect();
  } catch {
    // Logged by the error handler above; the app runs without cache.
  }
}

export async function cacheGet<T>(key: string): Promise<T | undefined> {
  try {
    const raw = await redis.get(key);
    return raw === null ? undefined : (JSON.parse(raw) as T);
  } catch {
    return undefined;
  }
}

export async function cacheSet(key: string, value: unknown, ttlSeconds: number): Promise<void> {
  try {
    await redis.set(key, JSON.stringify(value), 'EX', ttlSeconds);
  } catch {
    // ignore
  }
}

const inFlight = new Map<string, Promise<unknown>>();

/**
 * Runs `fn` at most once at a time per key within this process: if ten people
 * search "ps5" at the same moment, the store APIs are called once.
 */
export function singleFlight<T>(key: string, fn: () => Promise<T>): Promise<T> {
  const existing = inFlight.get(key);
  if (existing) return existing as Promise<T>;
  const promise = fn().finally(() => inFlight.delete(key));
  inFlight.set(key, promise);
  return promise;
}

export function isInFlight(key: string): boolean {
  return inFlight.has(key);
}
