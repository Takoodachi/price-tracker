import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    // Isolated database and Redis db so tests never touch dev data.
    env: {
      NODE_ENV: 'test',
      DATABASE_URL:
        process.env.TEST_DATABASE_URL ?? 'postgres://pricetracker:pricetracker@localhost:5433/pricetracker_test',
      REDIS_URL: process.env.TEST_REDIS_URL ?? 'redis://localhost:6379/1',
      JWT_SECRET: 'test-secret-that-is-at-least-32-characters-long',
      // Only the deterministic demo source is live, so tests never call (or pay
      // for) real store APIs. Their parsing is tested against recorded responses.
      DEMO_MODE: 'true',
      RAPIDAPI_KEY: '',
      BESTBUY_API_KEY: '',
      OPENWEBNINJA_API_KEY: '',
      MIGRATE_ON_START: 'false',
    },
    globalSetup: ['./test/global-setup.ts'],
    fileParallelism: false,
    testTimeout: 20_000,
  },
});
