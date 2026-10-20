import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { z } from 'zod';

// Load .env from the package dir or the repo root (whichever exists). Real
// environment variables always win, so containers can override anything.
for (const path of [resolve(process.cwd(), '.env'), resolve(process.cwd(), '../../.env')]) {
  if (existsSync(path)) {
    const before = { ...process.env };
    process.loadEnvFile(path);
    Object.assign(process.env, before);
    break;
  }
}

const bool = (fallback: boolean) =>
  z
    .enum(['true', 'false', '1', '0', ''])
    .optional()
    .transform((v) => (v === undefined || v === '' ? fallback : v === 'true' || v === '1'));

const optionalString = z
  .string()
  .optional()
  .transform((v) => (v?.trim() ? v.trim() : undefined));

const isProd = process.env.NODE_ENV === 'production';

const schema = z.object({
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  PORT: z.coerce.number().int().positive().default(4000),
  DATABASE_URL: z.string().min(1, 'DATABASE_URL is required'),
  REDIS_URL: z.string().default('redis://localhost:6379'),
  JWT_SECRET: z.string().min(32, 'JWT_SECRET must be at least 32 characters (run `npm run setup`)'),
  CORS_ORIGINS: optionalString,
  COOKIE_SECURE: bool(isProd),
  TRUST_PROXY: bool(false),
  SERVE_WEB: bool(false),
  MIGRATE_ON_START: bool(!isProd),
  LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent']).default('info'),

  RAPIDAPI_KEY: optionalString,
  PRICE_ANALYTICS_HOST: z.string().default('price-analytics.p.rapidapi.com'),
  BESTBUY_API_KEY: optionalString,
  OPENWEBNINJA_API_KEY: optionalString,
  SHOPPING_RAPIDAPI_HOST: z.string().default('real-time-product-search.p.rapidapi.com'),
  SHOPPING_SEARCH_PATH: z.string().default('/search'),
  SHOPPING_OFFERS_PATH: z.string().default('/product-offers'),
  // Empty by default: filtering Google's search by store name narrows it to odd
  // bundles and marketplace listings instead of the main product. Offers are
  // filtered to official retailers when they are fetched, which is the right place.
  SHOPPING_STORES: z.string().default(''),
  DEMO_MODE: bool(false),

  SHOPPING_OFFERS_PREFETCH: z.coerce.number().int().min(0).max(10).default(3),
  REFRESH_INTERVAL_HOURS: z.coerce.number().positive().default(6),
  SEARCH_CACHE_SECONDS: z.coerce.number().int().positive().default(30 * 60),
  SEARCH_WAIT_MS: z.coerce.number().int().positive().default(2500),
});

const parsed = schema.safeParse(process.env);
if (!parsed.success) {
  const problems = parsed.error.issues.map((i) => `  - ${i.path.join('.')}: ${i.message}`).join('\n');
  console.error(`Invalid configuration:\n${problems}\n\nSee .env.example.`);
  process.exit(1);
}

export const config = parsed.data;
export type Config = typeof config;
