import type { ApiErrorBody } from '@pricetracker/shared';
import cookieParser from 'cookie-parser';
import cors from 'cors';
import express, { type ErrorRequestHandler } from 'express';
import helmet from 'helmet';
import { existsSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { pinoHttp } from 'pino-http';
import { attachUser } from './auth';
import { config } from './config';
import { HttpError } from './errors';
import { logger } from './logger';
import { router } from './routes';
import { ValidationError } from './validate';

function webDistDir(): string | null {
  let dir = dirname(fileURLToPath(import.meta.url));
  for (let i = 0; i < 5; i++) {
    const candidate = resolve(dir, 'apps/web/dist');
    if (existsSync(resolve(candidate, 'index.html'))) return candidate;
    const sibling = resolve(dir, '../web/dist');
    if (existsSync(resolve(sibling, 'index.html'))) return sibling;
    dir = dirname(dir);
  }
  return null;
}

const errorHandler: ErrorRequestHandler = (err, req, res, _next) => {
  let status = 500;
  const body: ApiErrorBody = { error: { message: 'Something went wrong on our side. Please try again.' } };

  if (err instanceof HttpError) {
    status = err.status;
    body.error = { message: err.message, code: err.code };
    if (err instanceof ValidationError) body.error.fields = err.fields;
  } else if ((err as { type?: string }).type === 'entity.parse.failed') {
    status = 400;
    body.error = { message: 'Request body must be valid JSON.', code: 'invalid_json' };
  } else {
    req.log.error({ err }, 'unhandled error');
  }
  // Always JSON, so the web app can always show the real message.
  res.status(status).json(body);
};

export function createApp() {
  const app = express();
  app.disable('x-powered-by');
  app.set('trust proxy', config.TRUST_PROXY ? 1 : false);

  app.use(
    helmet({
      contentSecurityPolicy: {
        directives: {
          // Product photos come from store CDNs (Amazon, Best Buy, Google...).
          'img-src': ["'self'", 'data:', 'https:'],
          // Only force HTTPS subresources when the site is actually served over HTTPS.
          'upgrade-insecure-requests': config.COOKIE_SECURE ? [] : null,
        },
      },
    }),
  );
  if (config.CORS_ORIGINS) {
    app.use(cors({ origin: config.CORS_ORIGINS.split(',').map((o) => o.trim()), credentials: true }));
  }
  app.use(
    pinoHttp({
      logger,
      autoLogging: { ignore: (req) => req.url === '/api/health' },
      customLogLevel: (_req, res, err) => (err || res.statusCode >= 500 ? 'error' : res.statusCode >= 400 ? 'warn' : 'info'),
      customSuccessMessage: (req, res, ms) => `${req.method} ${req.url} ${res.statusCode} ${Math.round(ms)}ms`,
      customErrorMessage: (req, res) => `${req.method} ${req.url} ${res.statusCode}`,
      // The message already says everything; don't dump headers into the log.
      serializers: { req: () => undefined, res: () => undefined, responseTime: () => undefined },
    }),
  );
  app.use(express.json({ limit: '20kb' }));
  app.use(cookieParser());
  app.use(attachUser);

  app.use('/api', router);
  app.use('/api', (_req, _res, next) => next(new HttpError(404, 'Not found.', 'not_found')));

  if (config.SERVE_WEB) {
    const dist = webDistDir();
    if (!dist) {
      logger.warn('SERVE_WEB is on but apps/web/dist was not found; run `npm run build` first');
    } else {
      app.use(express.static(dist, { index: false, maxAge: '1h' }));
      // Client-side routes (/product/12, /dashboard, ...) all load the SPA.
      app.get('/{*path}', (_req, res) => res.sendFile(resolve(dist, 'index.html')));
    }
  }

  app.use(errorHandler);
  return app;
}
