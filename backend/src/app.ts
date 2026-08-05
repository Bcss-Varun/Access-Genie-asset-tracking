import compression from 'compression';
import cookieParser from 'cookie-parser';
import cors from 'cors';
import express, { type Express } from 'express';
import helmet from 'helmet';
import morgan from 'morgan';
import { dbStatus } from './config/db.js';
import { env } from './config/env.js';
import { apiLimiter, errorHandler, notFoundHandler, requestId } from './middleware/index.js';
import routes from './routes/index.js';

/**
 * Assemble the Express application.
 *
 * Kept separate from `index.ts` (which owns the database connection and the
 * listening socket) so tests can import a fully-wired app and drive it in
 * process, without binding a port.
 */
export function createApp(): Express {
  const app = express();

  // Behind a load balancer, `req.ip` is only correct with this set — and the
  // rate limiter keys on `req.ip`.
  app.set('trust proxy', 1);
  app.disable('x-powered-by');

  app.use(requestId);
  app.use(helmet());

  app.use(
    cors({
      origin: env.corsOrigins,
      credentials: true, // required for the refresh cookie
      exposedHeaders: ['x-request-id'],
    }),
  );

  /**
   * 1MB is the right ceiling for a JSON API — every other endpoint takes a form
   * payload, and accepting megabytes on all of them is free DoS surface.
   *
   * Document upload is the one exception: a 5MB file is ~6.7MB once base64'd.
   * Rather than raise the limit everywhere, the large parser is mounted on that
   * single path. It has to be selected here rather than added on the route,
   * because whichever `express.json` runs first is the one that consumes the
   * stream — a stricter global parser would reject the upload before the
   * route's own parser ever saw it.
   */
  const UPLOAD_PATH = `${env.API_PREFIX}/asset-documents`;
  const largeJson = express.json({ limit: '8mb' });
  const standardJson = express.json({ limit: '1mb' });
  app.use((req, res, next) =>
    req.method === 'POST' && req.path === UPLOAD_PATH
      ? largeJson(req, res, next)
      : standardJson(req, res, next),
  );
  app.use(express.urlencoded({ extended: true, limit: '1mb' }));
  app.use(cookieParser());
  app.use(compression());

  if (!env.isTest) {
    app.use(
      morgan(env.isProd ? 'combined' : 'dev', {
        skip: (req) => req.path === '/health',
      }),
    );
  }

  /** Liveness + readiness in one probe: up, and able to reach Mongo. */
  app.get('/health', (_req, res) => {
    const { ready, state } = dbStatus();
    res.status(ready ? 200 : 503).json({
      success: ready,
      data: {
        status: ready ? 'ok' : 'degraded',
        database: state,
        uptime: Math.round(process.uptime()),
        environment: env.NODE_ENV,
        version: env.API_PREFIX,
      },
    });
  });

  app.use(env.API_PREFIX, apiLimiter, routes);

  // Order matters: unmatched route → 404, then the single error funnel.
  app.use(notFoundHandler);
  app.use(errorHandler);

  return app;
}
