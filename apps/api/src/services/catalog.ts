import {
  normalizeGtin,
  rankOffers,
  retailerName,
  type Condition,
  type Offer,
  type PricePoint,
  type ProductSummary,
  type SourceName,
} from '@pricetracker/shared';
import type pg from 'pg';
import { pool, withTransaction, type Db } from '../db/pool';
import type { ProductCluster, SourceOffer } from '../sources';

export interface ProductRow {
  id: number;
  title: string;
  brand: string | null;
  image_url: string | null;
  gtin: string | null;
  shopping_key: string | null;
  shopping_ref: string | null;
  refreshed_at: Date | null;
}

export interface ListingRow {
  id: number;
  product_id: number;
  source: SourceName;
  external_id: string;
  retailer: string;
  title: string;
  url: string;
  image_url: string | null;
  condition: Condition;
  price_cents: number | null;
  currency: string;
  in_stock: boolean | null;
  checked_at: Date;
  verified_at: Date | null;
}

/**
 * Records a price observation, but only when price or stock changed since the
 * last one (or it's been ~a day, as a heartbeat). This keeps price_history
 * small without losing any change.
 */
export async function recordHistory(db: Db, listingId: number, priceCents: number | null, inStock: boolean | null) {
  await db.query(
    `INSERT INTO price_history (listing_id, price_cents, in_stock)
     SELECT $1, $2::integer, $3::boolean
     WHERE NOT EXISTS (
       SELECT 1 FROM (
         SELECT price_cents, in_stock, observed_at FROM price_history
         WHERE listing_id = $1 ORDER BY observed_at DESC LIMIT 1
       ) last
       WHERE last.price_cents IS NOT DISTINCT FROM $2::integer
         AND last.in_stock IS NOT DISTINCT FROM $3::boolean
         AND last.observed_at > now() - interval '20 hours'
     )`,
    [listingId, priceCents, inStock],
  );
}

/**
 * Inserts or updates a listing. A listing never moves to another product once
 * assigned, so favorites stay stable. An unverified price (Amazon search
 * snippet) never overwrites a recently verified one.
 */
export async function upsertListing(db: Db, productId: number, offer: SourceOffer): Promise<number> {
  const { rows } = await db.query<{ id: number }>(
    `INSERT INTO listings (product_id, source, external_id, retailer, title, url, image_url, condition,
                           price_cents, currency, in_stock, verified_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, CASE WHEN $12::boolean THEN now() END)
     ON CONFLICT (source, external_id) DO UPDATE SET
       retailer    = EXCLUDED.retailer,
       title       = EXCLUDED.title,
       url         = EXCLUDED.url,
       image_url   = COALESCE(EXCLUDED.image_url, listings.image_url),
       condition   = CASE WHEN $12::boolean OR listings.verified_at IS NULL OR listings.verified_at < now() - interval '6 hours'
                          THEN EXCLUDED.condition ELSE listings.condition END,
       price_cents = CASE WHEN $12::boolean OR listings.verified_at IS NULL OR listings.verified_at < now() - interval '6 hours'
                          THEN EXCLUDED.price_cents ELSE listings.price_cents END,
       in_stock    = CASE WHEN $12::boolean OR listings.verified_at IS NULL OR listings.verified_at < now() - interval '6 hours'
                          THEN EXCLUDED.in_stock ELSE listings.in_stock END,
       checked_at  = now(),
       verified_at = CASE WHEN $12::boolean THEN now() ELSE listings.verified_at END
     RETURNING id`,
    [
      productId,
      offer.source,
      offer.externalId,
      offer.retailer,
      offer.title,
      offer.url,
      offer.imageUrl,
      offer.condition,
      offer.priceCents,
      offer.currency,
      offer.inStock,
      offer.verified,
    ],
  );
  const id = rows[0]!.id;
  if (offer.verified) await recordHistory(db, id, offer.priceCents, offer.inStock);
  return id;
}

export async function markUnavailable(db: Db, listingIds: number[]): Promise<void> {
  if (listingIds.length === 0) return;
  await db.query(
    `UPDATE listings SET in_stock = false, checked_at = now(), verified_at = now() WHERE id = ANY($1::bigint[])`,
    [listingIds],
  );
  for (const id of listingIds) await recordHistory(db, id, null, false);
}

export interface CatalogGroup {
  cluster: ProductCluster | null;
  offers: SourceOffer[];
}

async function resolveProduct(client: pg.PoolClient, group: CatalogGroup): Promise<number> {
  const { cluster, offers } = group;
  const gtin = offers.map((o) => normalizeGtin(o.gtin)).find(Boolean) ?? null;

  let productId: number | undefined;
  if (cluster) {
    const { rows } = await client.query<{ id: number }>('SELECT id FROM products WHERE shopping_key = $1', [cluster.key]);
    productId = rows[0]?.id;
  }
  for (const offer of offers) {
    if (productId) break;
    const { rows } = await client.query<{ product_id: number }>(
      'SELECT product_id FROM listings WHERE source = $1 AND external_id = $2',
      [offer.source, offer.externalId],
    );
    productId = rows[0]?.product_id;
  }
  if (!productId && gtin) {
    const { rows } = await client.query<{ id: number }>('SELECT id FROM products WHERE gtin = $1', [gtin]);
    productId = rows[0]?.id;
  }

  // Best Buy names are the cleanest; Amazon titles are often keyword-stuffed.
  const named = offers.find((o) => o.source === 'bestbuy') ?? offers[0];
  const title = cluster?.title ?? named?.title ?? 'Unknown product';
  const image = cluster?.imageUrl ?? offers.find((o) => o.imageUrl)?.imageUrl ?? null;
  const brand = offers.find((o) => o.brand)?.brand ?? null;

  if (productId) {
    await client.query(
      `UPDATE products SET
         shopping_key = COALESCE(shopping_key, $2),
         shopping_ref = CASE WHEN shopping_key IS NULL OR shopping_key = $2 THEN COALESCE($3, shopping_ref) ELSE shopping_ref END,
         image_url    = COALESCE(image_url, $4),
         gtin         = COALESCE(gtin, $5),
         brand        = COALESCE(brand, $6),
         updated_at   = now()
       WHERE id = $1`,
      [productId, cluster?.key ?? null, cluster?.ref ?? null, image, gtin, brand],
    );
    return productId;
  }

  const { rows } = await client.query<{ id: number }>(
    `INSERT INTO products (title, brand, image_url, gtin, shopping_key, shopping_ref)
     VALUES ($1, $2, $3, $4, $5, $6) RETURNING id`,
    [title, brand, image, gtin, cluster?.key ?? null, cluster?.ref ?? null],
  );
  return rows[0]!.id;
}

/** Saves one matched group (product + its listings) and returns the product id. */
export async function saveGroup(group: CatalogGroup): Promise<number> {
  const attempt = () =>
    withTransaction(async (client) => {
      const productId = await resolveProduct(client, group);
      for (const offer of group.offers) await upsertListing(client, productId, offer);
      return productId;
    });
  try {
    return await attempt();
  } catch (err) {
    // Two requests created the same product at the same moment: the retry finds it.
    if ((err as { code?: string }).code === '23505') return attempt();
    throw err;
  }
}

export async function getProductRow(id: number): Promise<ProductRow | undefined> {
  const { rows } = await pool.query<ProductRow>('SELECT * FROM products WHERE id = $1', [id]);
  return rows[0];
}

function toOffer(row: ListingRow): Offer {
  return {
    id: row.id,
    retailer: row.retailer,
    retailerName: retailerName(row.retailer),
    title: row.title,
    url: row.url,
    priceCents: row.price_cents,
    currency: row.currency,
    inStock: row.in_stock,
    condition: row.condition,
    source: row.source,
    checkedAt: row.checked_at.toISOString(),
    verified: row.verified_at !== null,
  };
}

export type Teasers = Map<number, ProductSummary['teaser']>;

/** Builds the product cards (offers ranked, best price picked), in the given order. */
export async function loadSummaries(
  productIds: number[],
  userId: number | null,
  teasers: Teasers = new Map(),
): Promise<ProductSummary[]> {
  if (productIds.length === 0) return [];
  const [products, listings] = await Promise.all([
    pool.query<ProductRow & { is_favorite: boolean }>(
      `SELECT p.*, (f.user_id IS NOT NULL) AS is_favorite
       FROM products p
       LEFT JOIN favorites f ON f.product_id = p.id AND f.user_id = $2
       WHERE p.id = ANY($1::bigint[])`,
      [productIds, userId],
    ),
    pool.query<ListingRow>('SELECT * FROM listings WHERE product_id = ANY($1::bigint[])', [productIds]),
  ]);

  const listingsByProduct = new Map<number, Offer[]>();
  for (const row of listings.rows) {
    const list = listingsByProduct.get(row.product_id) ?? [];
    list.push(toOffer(row));
    listingsByProduct.set(row.product_id, list);
  }

  const byId = new Map(products.rows.map((p) => [p.id, p]));
  return productIds.flatMap((id) => {
    const p = byId.get(id);
    if (!p) return [];
    const { ranked, best, savingsCents } = rankOffers(listingsByProduct.get(id) ?? []);
    const moreOffersAvailable = p.shopping_ref !== null && p.refreshed_at === null;
    return [
      {
        id: p.id,
        title: p.title,
        imageUrl: p.image_url,
        brand: p.brand,
        offers: ranked,
        best,
        savingsCents,
        isFavorite: p.is_favorite,
        moreOffersAvailable,
        teaser: moreOffersAvailable ? (teasers.get(id) ?? null) : null,
        refreshedAt: p.refreshed_at?.toISOString() ?? null,
      },
    ];
  });
}

/**
 * Lowest in-stock new price per day across all stores, carrying each
 * listing's last known price forward (history only stores changes).
 */
export async function loadHistory(productIds: number[], days: number): Promise<Map<number, PricePoint[]>> {
  const result = new Map<number, PricePoint[]>();
  if (productIds.length === 0) return result;
  const { rows } = await pool.query<{ product_id: number; day: string; price: number }>(
    `SELECT l.product_id, to_char(d.day, 'YYYY-MM-DD') AS day, min(last.price_cents)::int AS price
     FROM listings l
     CROSS JOIN generate_series(date_trunc('day', now()) - make_interval(days => $2), date_trunc('day', now()), interval '1 day') AS d(day)
     CROSS JOIN LATERAL (
       SELECT h.price_cents, h.in_stock FROM price_history h
       WHERE h.listing_id = l.id AND h.observed_at < d.day + interval '1 day'
       ORDER BY h.observed_at DESC LIMIT 1
     ) last
     WHERE l.product_id = ANY($1::bigint[])
       AND l.condition = 'new'
       AND last.price_cents IS NOT NULL
       AND last.in_stock IS NOT FALSE
     GROUP BY l.product_id, d.day
     ORDER BY l.product_id, d.day`,
    [productIds, days],
  );
  for (const row of rows) {
    const points = result.get(row.product_id) ?? [];
    points.push({ date: row.day, priceCents: row.price });
    result.set(row.product_id, points);
  }
  return result;
}
