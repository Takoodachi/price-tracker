import { favoriteCreateSchema, favoriteUpdateSchema, loginSchema, registerSchema, searchSchema } from '@pricetracker/shared';
import { Router } from 'express';
import { rateLimit } from 'express-rate-limit';
import { endSession, requireUser, startSession } from './auth';
import { redis } from './cache';
import { pool } from './db/pool';
import { HttpError } from './errors';
import { sources } from './sources';
import { addFavorite, listFavorites, removeFavorite, updateFavorite } from './services/favorites';
import { getProductDetail } from './services/products';
import { searchProducts } from './services/search';
import { createUser, verifyUser } from './services/users';
import { parse, parseId } from './validate';

const limiter = (windowMs: number, limit: number, message: string) =>
  rateLimit({
    windowMs,
    limit,
    standardHeaders: 'draft-8',
    legacyHeaders: false,
    handler: (_req, _res, next) => next(new HttpError(429, message, 'rate_limited')),
  });

// Login attempts per IP: slows down password guessing.
const authLimiter = limiter(15 * 60_000, 20, 'Too many attempts. Try again in a few minutes.');
// Searches cost paid API calls; the client polls, so leave room for that.
const searchLimiter = limiter(60_000, 90, 'You are searching very fast. Wait a moment and try again.');

export const router = Router();

// --- Auth ---

router.post('/auth/register', authLimiter, async (req, res) => {
  const { email, password } = parse(registerSchema, req.body);
  const user = await createUser(email, password);
  startSession(res, user);
  res.status(201).json({ user });
});

router.post('/auth/login', authLimiter, async (req, res) => {
  const { email, password } = parse(loginSchema, req.body);
  const user = await verifyUser(email, password);
  startSession(res, user);
  res.json({ user });
});

router.post('/auth/logout', (_req, res) => {
  endSession(res);
  res.status(204).end();
});

router.get('/auth/me', (req, res) => {
  res.json({ user: req.user });
});

// --- Search & products (no login needed) ---

router.get('/search', searchLimiter, async (req, res) => {
  const { q } = parse(searchSchema, req.query);
  res.json(await searchProducts(q, req.user?.id ?? null));
});

router.get('/products/:id', async (req, res) => {
  res.json(await getProductDetail(parseId(req.params.id), req.user?.id ?? null));
});

// --- Favorites ---

router.get('/favorites', requireUser, async (req, res) => {
  res.json({ favorites: await listFavorites(req.user!.id) });
});

router.post('/favorites', requireUser, async (req, res) => {
  const { productId, targetPriceCents } = parse(favoriteCreateSchema, req.body);
  await addFavorite(req.user!.id, productId, targetPriceCents);
  res.status(201).json({ ok: true });
});

router.patch('/favorites/:productId', requireUser, async (req, res) => {
  const { targetPriceCents } = parse(favoriteUpdateSchema, req.body);
  await updateFavorite(req.user!.id, parseId(req.params.productId), targetPriceCents);
  res.json({ ok: true });
});

router.delete('/favorites/:productId', requireUser, async (req, res) => {
  await removeFavorite(req.user!.id, parseId(req.params.productId));
  res.status(204).end();
});

// --- Health ---

router.get('/health', async (_req, res) => {
  const [db, cache] = await Promise.all([
    pool.query('SELECT 1').then(
      () => true,
      () => false,
    ),
    redis.ping().then(
      () => true,
      () => false,
    ),
  ]);
  res.status(db ? 200 : 503).json({
    ok: db,
    database: db,
    redis: cache,
    sources: sources.map((s) => ({
      source: s.name,
      enabled: !s.disabledReason,
      reason: s.disabledReason ?? (s.breaker.isOpen ? s.breaker.lastError : undefined),
    })),
  });
});
