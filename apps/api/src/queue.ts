import { Queue } from 'bullmq';
import { config } from './config';
import { logger } from './logger';

export const QUEUE_NAME = 'price-refresh';

export type JobName = 'sweep' | 'refresh-product';
export interface RefreshJobData {
  productId?: number;
}

let queue: Queue<RefreshJobData, unknown, JobName> | null = null;

export function getQueue(): Queue<RefreshJobData, unknown, JobName> {
  queue ??= new Queue<RefreshJobData, unknown, JobName>(QUEUE_NAME, {
    connection: { url: config.REDIS_URL, maxRetriesPerRequest: null },
    defaultJobOptions: {
      attempts: 3,
      backoff: { type: 'exponential', delay: 60_000 },
      removeOnComplete: { count: 1000 },
      removeOnFail: { age: 7 * 24 * 3600 },
    },
  });
  return queue;
}

/**
 * Queues a price refresh per product. A product already waiting or running
 * isn't queued twice (deduplication lasts until that job finishes).
 */
export async function enqueueRefresh(productIds: number[]): Promise<void> {
  if (productIds.length === 0) return;
  try {
    await getQueue().addBulk(
      productIds.map((productId) => ({
        name: 'refresh-product' as const,
        data: { productId },
        opts: { deduplication: { id: `product-${productId}` } },
      })),
    );
  } catch (err) {
    // Redis down: the periodic sweep will pick these products up later.
    logger.warn({ err: (err as Error).message }, 'could not queue price refresh');
  }
}

export async function closeQueue(): Promise<void> {
  await queue?.close();
  queue = null;
}
