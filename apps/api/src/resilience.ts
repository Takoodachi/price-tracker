import { UpstreamError } from './errors';

export function sleep(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) return reject(signal.reason);
    const timer = setTimeout(resolve, ms);
    signal?.addEventListener(
      'abort',
      () => {
        clearTimeout(timer);
        reject(signal.reason);
      },
      { once: true },
    );
  });
}

/**
 * Keeps calls to one source under its rate limit: at most `concurrency` at a
 * time, and at least `minIntervalMs` between starts.
 */
export class RateLimiter {
  private active = 0;
  private lastStart = 0;
  private readonly waiting: (() => void)[] = [];

  constructor(
    private readonly concurrency: number,
    private readonly minIntervalMs: number,
  ) {}

  async run<T>(fn: () => Promise<T>): Promise<T> {
    if (this.active >= this.concurrency) {
      // The finishing call hands its slot directly to us.
      await new Promise<void>((resolve) => this.waiting.push(resolve));
    } else {
      this.active++;
    }
    const wait = this.lastStart + this.minIntervalMs - Date.now();
    this.lastStart = Math.max(Date.now(), this.lastStart + this.minIntervalMs);
    if (wait > 0) await sleep(wait);
    try {
      return await fn();
    } finally {
      const next = this.waiting.shift();
      if (next) next();
      else this.active--;
    }
  }
}

/**
 * Stops calling a source that keeps failing, so one broken integration can't
 * slow down every search. After `threshold` consecutive failures it stays
 * open for `cooldownMs` (longer for permanent errors like a bad API key).
 */
export class CircuitBreaker {
  private failures = 0;
  private openUntil = 0;
  lastError: string | null = null;

  constructor(
    private readonly threshold = 3,
    private readonly cooldownMs = 60_000,
  ) {}

  get isOpen(): boolean {
    return Date.now() < this.openUntil;
  }

  async run<T>(fn: () => Promise<T>): Promise<T> {
    if (this.isOpen) throw new UpstreamError(503, this.lastError ?? 'Temporarily unavailable');
    try {
      const result = await fn();
      this.failures = 0;
      this.lastError = null;
      return result;
    } catch (err) {
      const permanent = err instanceof UpstreamError && err.permanent;
      this.failures++;
      this.lastError = (err as Error).message;
      if (permanent) this.openUntil = Date.now() + 10 * this.cooldownMs;
      else if (this.failures >= this.threshold) this.openUntil = Date.now() + this.cooldownMs;
      throw err;
    }
  }
}
