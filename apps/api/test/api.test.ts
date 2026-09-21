import type { Favorite, ProductDetail, SearchResponse } from '@pricetracker/shared';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

/**
 * End-to-end tests of the HTTP API against a real Postgres (the test database)
 * using the deterministic demo source instead of paid store APIs.
 */
describe.skipIf(!process.env.PT_TEST_DB_READY)('API', async () => {
  const { createApp } = await import('../src/app');
  const { migrate } = await import('../src/db/migrate');
  const { pool } = await import('../src/db/pool');
  const { redis, connectCache } = await import('../src/cache');
  const { closeQueue } = await import('../src/queue');

  const app = createApp();
  const agent = request.agent(app); // keeps the session cookie between requests

  beforeAll(async () => {
    await migrate();
    await pool.query('TRUNCATE users, products RESTART IDENTITY CASCADE');
    await connectCache();
    await redis.flushdb();
  });

  afterAll(async () => {
    await closeQueue();
    redis.disconnect();
    await pool.end();
  });

  async function searchUntilDone(q: string): Promise<SearchResponse> {
    for (let i = 0; i < 20; i++) {
      const res = await agent.get('/api/search').query({ q }).expect(200);
      if (!res.body.pending) return res.body;
    }
    throw new Error('search never finished');
  }

  it('validates registration input and returns JSON errors', async () => {
    const res = await agent.post('/api/auth/register').send({ email: 'nope', password: 'short' }).expect(400);
    expect(res.body.error.fields).toMatchObject({ email: expect.any(String), password: expect.any(String) });
  });

  it('registers, logs in case-insensitively, and reports the session', async () => {
    await agent.post('/api/auth/register').send({ email: 'Shopper@Example.com', password: 'long enough pw' }).expect(201);
    await request(app).post('/api/auth/register').send({ email: 'shopper@example.com', password: 'long enough pw' }).expect(409);
    await request(app).post('/api/auth/login').send({ email: 'shopper@example.com', password: 'wrong password' }).expect(401);
    const me = await agent.get('/api/auth/me').expect(200);
    expect(me.body.user).toMatchObject({ email: 'shopper@example.com' });
  });

  it('rejects favorites without a session', async () => {
    const res = await request(app).get('/api/favorites').expect(401);
    expect(res.body.error.code).toBe('unauthenticated');
  });

  let productId = 0;

  it('searches, compares stores, and picks the lowest eligible price', async () => {
    const result = await searchUntilDone('Acme Blender');
    expect(result.products.map((p) => p.title)).toEqual([
      'Acme Blender',
      'Acme Blender Pro',
      'Acme Blender Mini',
      'Acme Blender Bundle',
    ]);
    const first = result.products[0]!;
    expect(first.offers.length).toBeGreaterThan(1);
    const eligible = first.offers.filter((o) => o.inStock !== false && o.priceCents);
    expect(first.best!.priceCents).toBe(Math.min(...eligible.map((o) => o.priceCents!)));
    // Only the top results get a full price check up front; the rest load on demand.
    expect(result.products[3]!.moreOffersAvailable).toBe(true);
    productId = first.id;
  });

  it('returns product detail with price history', async () => {
    const res = await agent.get(`/api/products/${productId}`).expect(200);
    const detail = res.body as ProductDetail;
    expect(detail.history.at(-1)?.priceCents).toBe(detail.best!.priceCents);
    expect(detail.lowestEverCents).toBe(detail.best!.priceCents);
    await agent.get('/api/products/999999').expect(404);
  });

  it('favorites a product, tracks a target price, and removes it', async () => {
    await agent.post('/api/favorites').send({ productId, targetPriceCents: 100 }).expect(201);
    // Favoriting twice doesn't duplicate.
    await agent.post('/api/favorites').send({ productId }).expect(201);

    let favorites: Favorite[] = (await agent.get('/api/favorites').expect(200)).body.favorites;
    expect(favorites).toHaveLength(1);
    expect(favorites[0]!.savedPriceCents).toBe(favorites[0]!.product.best!.priceCents);
    expect(favorites[0]!.targetPriceCents).toBe(100);
    expect(favorites[0]!.belowTarget).toBe(false);

    await agent.patch(`/api/favorites/${productId}`).send({ targetPriceCents: 10_000_000 }).expect(200);
    favorites = (await agent.get('/api/favorites').expect(200)).body.favorites;
    expect(favorites[0]!.belowTarget).toBe(true);

    const search = await searchUntilDone('Acme Blender');
    expect(search.products[0]!.isFavorite).toBe(true);

    await agent.delete(`/api/favorites/${productId}`).expect(204);
    expect((await agent.get('/api/favorites').expect(200)).body.favorites).toHaveLength(0);
  });

  it('logs out', async () => {
    await agent.post('/api/auth/logout').expect(204);
    expect((await agent.get('/api/auth/me').expect(200)).body.user).toBeNull();
  });

  it('returns JSON 404 for unknown API routes', async () => {
    const res = await request(app).get('/api/nope').expect(404);
    expect(res.body.error.message).toBeTruthy();
  });
});
