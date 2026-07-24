import compression from 'compression';
import cookieParser from 'cookie-parser';
import cors from 'cors';
import express, { type Express } from 'express';
import helmet from 'helmet';
import morgan from 'morgan';
import mongoose from 'mongoose';
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

  app.use(express.json({ limit: '1mb' }));
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
    const dbState = mongoose.connection.readyState; // 1 = connected
    res.status(dbState === 1 ? 200 : 503).json({
      success: dbState === 1,
      data: {
        status: dbState === 1 ? 'ok' : 'degraded',
        database: ['disconnected', 'connected', 'connecting', 'disconnecting'][dbState] ?? 'unknown',
        uptime: Math.round(process.uptime()),
        environment: env.NODE_ENV,
      },
    });
  });

  app.use('/api/v1', apiLimiter, routes);

  // Order matters: unmatched route → 404, then the single error funnel.
  app.use(notFoundHandler);
  app.use(errorHandler);

  return app;
}
