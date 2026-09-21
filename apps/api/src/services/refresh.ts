import { cacheGet, cacheSet, isInFlight, singleFlight } from '../cache';
import { config } from '../config';
import { pool } from '../db/pool';
import { logger } from '../logger';
import { clusterSource, getSource } from '../sources';
import { getProductRow, loadSummaries, markUnavailable, upsertListing, type ListingRow } from './catalog';

const FAILED_TTL_SECONDS = 5 * 60;

function refreshKey(productId: number) {
  return `refresh:${productId}`;
}

/**
 * Re-prices one product at every store: fetches all store offers for its
 * Google Shopping cluster and looks up each retailer-API listing by id.
 * Returns true when every source answered.
 */
async function doRefresh(productId: number): Promise<boolean> {
  const product = await getProductRow(productId);
  if (!product) return true;
  const signal = AbortSignal.timeout(60_000);
  const failures: string[] = [];

  if (product.shopping_ref) {
    const source = clusterSource(product.shopping_ref);
    if (source?.offersFor) {
      try {
        const offers = await source.offersFor(product.shopping_ref, signal);
        const seen = new Set<number>();
        for (const offer of offers) seen.add(await upsertListing(pool, productId, offer));
        // Stores that dropped out of the offer list are no longer selling it.
        const { rows } = await pool.query<{ id: number }>(
          'SELECT id FROM listings WHERE product_id = $1 AND source = $2 AND in_stock IS NOT FALSE',
          [productId, source.name],
        );
        await markUnavailable(pool, rows.map((r) => r.id).filter((id) => !seen.has(id)));
      } catch (err) {
        failures.push(`${source.name}: ${(err as Error).message}`);
      }
    }
  }

  const { rows: listings } = await pool.query<ListingRow>(
    `SELECT * FROM listings WHERE product_id = $1 AND source IN ('amazon', 'bestbuy')`,
    [productId],
  );
  await Promise.all(
    listings.map(async (listing) => {
      const source = getSource(listing.source);
      if (!source?.lookup) return;
      try {
        const offer = await source.lookup(listing.external_id, signal);
        if (offer) await upsertListing(pool, productId, offer);
        else await markUnavailable(pool, [listing.id]);
      } catch (err) {
        failures.push(`${listing.source} ${listing.external_id}: ${(err as Error).message}`);
      }
    }),
  );

  await checkTargets(productId);

  if (failures.length > 0) {
    logger.warn({ productId, failures }, 'price refresh incomplete');
    await cacheSet(`refresh-failed:${productId}`, true, FAILED_TTL_SECONDS);
    return false;
  }
  await pool.query('UPDATE products SET refreshed_at = now() WHERE id = $1', [productId]);
  return true;
}

/** Refreshes a product, deduplicating concurrent requests for the same one. */
export function refreshProduct(productId: number): Promise<boolean> {
  return singleFlight(refreshKey(productId), () => doRefresh(productId));
}

export function isRefreshing(productId: number): boolean {
  return isInFlight(refreshKey(productId));
}

/** True if the product's prices are old enough to re-check (and it didn't just fail). */
export async function needsRefresh(product: { id: number; refreshed_at: Date | null }): Promise<boolean> {
  const maxAgeMs = config.REFRESH_INTERVAL_HOURS * 3_600_000;
  if (product.refreshed_at && Date.now() - product.refreshed_at.getTime() < maxAgeMs) return false;
  return !(await cacheGet<boolean>(`refresh-failed:${product.id}`));
}

/**
 * Flags favorites whose best price just reached the user's target, and
 * re-arms the alert once the price goes back above it. Delivering the alert
 * (email, push) plugs in where the log line is.
 */
async function checkTargets(productId: number): Promise<void> {
  const [summary] = await loadSummaries([productId], null);
  const best = summary?.best?.priceCents ?? null;
  const { rows } = await pool.query<{ user_id: number; target_price_cents: number }>(
    `UPDATE favorites SET alerted_at = now()
     WHERE product_id = $1 AND alerted_at IS NULL AND target_price_cents IS NOT NULL
       AND $2::integer IS NOT NULL AND $2::integer <= target_price_cents
     RETURNING user_id, target_price_cents`,
    [productId, best],
  );
  for (const row of rows) {
    logger.info({ userId: row.user_id, productId, priceCents: best, targetCents: row.target_price_cents }, 'price target reached');
  }
  await pool.query(
    `UPDATE favorites SET alerted_at = NULL
     WHERE product_id = $1 AND alerted_at IS NOT NULL
       AND ($2::integer IS NULL OR target_price_cents IS NULL OR $2::integer > target_price_cents)`,
    [productId, best],
  );
}
