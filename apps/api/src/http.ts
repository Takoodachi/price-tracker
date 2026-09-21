import { UpstreamError } from './errors';
import { sleep } from './resilience';

interface FetchJsonOptions {
  method?: 'GET' | 'POST';
  headers?: Record<string, string>;
  body?: string;
  signal?: AbortSignal;
  timeoutMs?: number;
  /** Extra attempts for 429 / 5xx / network errors. */
  retries?: number;
}

function retryAfterMs(res: Response): number | null {
  const header = res.headers.get('retry-after');
  if (!header) return null;
  const seconds = Number(header);
  return Number.isFinite(seconds) ? Math.min(seconds * 1000, 10_000) : null;
}

/**
 * fetch() + JSON with a timeout, retries with exponential backoff (honoring
 * Retry-After), and errors that say which failures are worth retrying.
 */
export async function fetchJson<T = unknown>(url: string, options: FetchJsonOptions = {}): Promise<T> {
  const { method = 'GET', headers, body, signal, timeoutMs = 10_000, retries = 1 } = options;

  for (let attempt = 0; ; attempt++) {
    const timeout = AbortSignal.timeout(timeoutMs);
    const combined = signal ? AbortSignal.any([signal, timeout]) : timeout;
    let res: Response;
    try {
      res = await fetch(url, { method, headers, body, signal: combined });
    } catch (err) {
      if (signal?.aborted) throw err;
      if (attempt < retries) {
        await sleep(500 * 2 ** attempt, signal);
        continue;
      }
      const reason = timeout.aborted ? 'timed out' : (err as Error).message;
      throw new UpstreamError(504, `Request ${reason}`);
    }

    if (res.ok) {
      try {
        return (await res.json()) as T;
      } catch {
        throw new UpstreamError(502, 'Source returned invalid JSON');
      }
    }

    const text = await res.text().catch(() => '');
    let message = text.slice(0, 200);
    try {
      const parsed = JSON.parse(text) as { message?: string; error?: unknown; errorMessage?: string };
      message = parsed.message ?? parsed.errorMessage ?? (typeof parsed.error === 'string' ? parsed.error : message);
    } catch {
      // not JSON
    }

    const retryable = res.status === 429 || res.status >= 500;
    if (retryable && attempt < retries) {
      await sleep(retryAfterMs(res) ?? 500 * 2 ** attempt + Math.random() * 250, signal);
      continue;
    }
    const permanent = res.status === 401 || res.status === 403;
    throw new UpstreamError(res.status, message || `HTTP ${res.status}`, permanent);
  }
}
