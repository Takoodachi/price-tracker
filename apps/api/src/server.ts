import { createApp } from './app';
import { connectCache, redis } from './cache';
import { config } from './config';
import { migrate } from './db/migrate';
import { pool } from './db/pool';
import { logger } from './logger';
import { closeQueue } from './queue';
import { startWorker } from './worker';

export async function startServer(): Promise<() => Promise<void>> {
  if (config.MIGRATE_ON_START) await migrate();
  await connectCache();
  if (config.RUN_WORKER) await startWorker();
  const server = createApp().listen(config.PORT, () => {
    logger.info(`API listening on http://localhost:${config.PORT}`);
  });
  return () =>
    new Promise<void>((resolve) => {
      server.close(() => resolve());
    });
}

// Run standalone: `node dist/server.js` / `npm start`.
if (process.argv[1]?.match(/server\.(ts|js)$/)) {
  const stop = await startServer();
  const shutdown = async () => {
    logger.info('shutting down');
    await stop();
    await closeQueue();
    redis.disconnect();
    await pool.end();
    process.exit(0);
  };
  process.once('SIGTERM', shutdown);
  process.once('SIGINT', shutdown);
}
