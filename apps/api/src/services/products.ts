import type { ProductDetail } from '@pricetracker/shared';
import { pool } from '../db/pool';
import { HttpError } from '../errors';
import { sleep } from '../resilience';
import { getProductRow, loadHistory, loadSummaries } from './catalog';
import { isRefreshing, needsRefresh, refreshProduct } from './refresh';

const HISTORY_DAYS = 180;
const WAIT_FOR_REFRESH_MS = 6000;

/**
 * A product with every store's price and its price history. Stale prices are
 * re-checked first (waiting a few seconds); if that takes longer the response
 * says `pending` and the client polls.
 */
export async function getProductDetail(productId: number, userId: number | null): Promise<ProductDetail> {
  const product = await getProductRow(productId);
  if (!product) throw new HttpError(404, 'Product not found.', 'not_found');

  if (isRefreshing(productId) || (await needsRefresh(product))) {
    await Promise.race([refreshProduct(productId).catch(() => false), sleep(WAIT_FOR_REFRESH_MS)]);
  }

  const [[summary], history, favorite] = await Promise.all([
    loadSummaries([productId], userId),
    loadHistory([productId], HISTORY_DAYS),
    userId
      ? pool.query<{ target_price_cents: number | null }>(
          'SELECT target_price_cents FROM favorites WHERE user_id = $1 AND product_id = $2',
          [userId, productId],
        )
      : null,
  ]);
  const points = history.get(productId) ?? [];

  return {
    ...summary!,
    history: points,
    lowestEverCents: points.length ? Math.min(...points.map((p) => p.priceCents)) : null,
    targetPriceCents: favorite?.rows[0]?.target_price_cents ?? null,
    pending: isRefreshing(productId),
  };
}
