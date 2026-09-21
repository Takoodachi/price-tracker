import type { Favorite } from '@pricetracker/shared';
import { pool } from '../db/pool';
import { HttpError } from '../errors';
import { enqueueRefresh } from '../queue';
import { loadHistory, loadSummaries } from './catalog';

const SPARKLINE_DAYS = 90;

interface FavoriteRow {
  product_id: number;
  target_price_cents: number | null;
  saved_price_cents: number | null;
  created_at: Date;
}

export async function listFavorites(userId: number): Promise<Favorite[]> {
  const { rows } = await pool.query<FavoriteRow>(
    `SELECT product_id, target_price_cents, saved_price_cents, created_at
     FROM favorites WHERE user_id = $1 ORDER BY created_at DESC`,
    [userId],
  );
  const ids = rows.map((r) => r.product_id);
  const [summaries, history] = await Promise.all([loadSummaries(ids, userId), loadHistory(ids, SPARKLINE_DAYS)]);
  const byId = new Map(summaries.map((s) => [s.id, s]));

  return rows.flatMap((row) => {
    const product = byId.get(row.product_id);
    if (!product) return [];
    const best = product.best?.priceCents ?? null;
    return [
      {
        product,
        targetPriceCents: row.target_price_cents,
        savedPriceCents: row.saved_price_cents,
        createdAt: row.created_at.toISOString(),
        history: history.get(row.product_id) ?? [],
        belowTarget: best !== null && row.target_price_cents !== null && best <= row.target_price_cents,
      },
    ];
  });
}

export async function addFavorite(userId: number, productId: number, targetPriceCents: number | null | undefined) {
  const [summary] = await loadSummaries([productId], userId);
  if (!summary) throw new HttpError(404, 'Product not found.', 'not_found');
  await pool.query(
    `INSERT INTO favorites (user_id, product_id, target_price_cents, saved_price_cents)
     VALUES ($1, $2, $3, $4)
     ON CONFLICT (user_id, product_id) DO UPDATE
       SET target_price_cents = COALESCE(EXCLUDED.target_price_cents, favorites.target_price_cents)`,
    [userId, productId, targetPriceCents ?? null, summary.best?.priceCents ?? null],
  );
  // Make sure the worker starts tracking it right away.
  await enqueueRefresh([productId]);
}

export async function updateFavorite(userId: number, productId: number, targetPriceCents: number | null) {
  const { rowCount } = await pool.query(
    `UPDATE favorites SET target_price_cents = $3, alerted_at = NULL WHERE user_id = $1 AND product_id = $2`,
    [userId, productId, targetPriceCents],
  );
  if (!rowCount) throw new HttpError(404, 'That item is not in your favorites.', 'not_found');
}

export async function removeFavorite(userId: number, productId: number) {
  await pool.query('DELETE FROM favorites WHERE user_id = $1 AND product_id = $2', [userId, productId]);
}
