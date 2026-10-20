import { Worker } from 'bullmq';
import { config } from './config';
import { pool } from './db/pool';
import { logger } from './logger';
import { closeQueue, enqueueRefresh, getQueue, QUEUE_NAME, type JobName, type RefreshJobData } from './queue';
import { connectCache, redis } from './cache';
import { refreshProduct } from './services/refresh';

/**
 * Background worker: keeps favorited products' prices fresh.
 *
 * Every 15 minutes a "sweep" job finds favorited products whose prices are
 * older than REFRESH_INTERVAL_HOURS and queues one "refresh-product" job each.
 * Rate limits per store are enforced inside the sources, and failed jobs are
 * retried with exponential backoff.
 */

const SWEEP_EVERY_MS = 15 * 60_000;
const PRUNE_AFTER_DAYS = 30;

async function sweep(): Promise<{ queued: number; pruned: number }> {
  const { rows } = await pool.query<{ id: number }>(
    `SELECT p.id FROM products p
     WHERE EXISTS (SELECT 1 FROM favorites f WHERE f.product_id = p.id)
       AND (p.refreshed_at IS NULL OR p.refreshed_at < now() - $1 * interval '1 hour')
     ORDER BY p.refreshed_at NULLS FIRST
     LIMIT 500`,
    [config.REFRESH_INTERVAL_HOURS],
  );
  await enqueueRefresh(rows.map((r) => r.id));

  // Search results nobody favorited and nobody has seen in a month.
  const pruned = await pool.query(
    `DELETE FROM products p
     WHERE NOT EXISTS (SELECT 1 FROM favorites f WHERE f.product_id = p.id)
       AND p.updated_at < now() - make_interval(days => $1)`,
    [PRUNE_AFTER_DAYS],
  );
  return { queued: rows.length, pruned: pruned.rowCount ?? 0 };
}

let running: Promise<() => Promise<void>> | null = null;

/** Starts the worker once per process; repeat calls return the same handle. */
export function startWorker(): Promise<() => Promise<void>> {
  running ??= start();
  return running;
}

async function start(): Promise<() => Promise<void>> {
  await connectCache();
  const worker = new Worker<RefreshJobData, unknown, JobName>(
    QUEUE_NAME,
    async (job) => {
      if (job.name === 'sweep') return sweep();
      if (job.name === 'refresh-product' && job.data.productId) {
        const complete = await refreshProduct(job.data.productId);
        // Throwing makes BullMQ retry later with backoff.
        if (!complete) throw new Error('Some stores did not respond; will retry');
        return { productId: job.data.productId };
      }
      return undefined;
    },
    { connection: { url: config.REDIS_URL, maxRetriesPerRequest: null }, concurrency: 4 },
  );

  worker.on('completed', (job, result) => {
    if (job.name === 'sweep') logger.info(result as object, 'sweep finished');
  });
  worker.on('failed', (job, err) => logger.warn({ job: job?.name, data: job?.data, err: err.message }, 'job failed'));
  worker.on('error', (err) => logger.error({ err: err.message }, 'worker error'));

  await getQueue().upsertJobScheduler('sweep', { every: SWEEP_EVERY_MS }, { name: 'sweep', data: {} });
  logger.info({ everyMinutes: SWEEP_EVERY_MS / 60_000, refreshHours: config.REFRESH_INTERVAL_HOURS }, 'price worker started');

  return async () => {
    await worker.close();
    await closeQueue();
  };
}

// Run standalone: `node dist/worker.js` / `npm run start:worker`.
if (process.argv[1]?.match(/worker\.(ts|js)$/)) {
  const stop = await startWorker();
  const shutdown = async () => {
    logger.info('worker shutting down');
    await stop();
    redis.disconnect();
    await pool.end();
    process.exit(0);
  };
  process.once('SIGTERM', shutdown);
  process.once('SIGINT', shutdown);
}
