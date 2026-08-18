import type { Server } from 'node:http';
import { createApp } from './app.js';
import { connectDb, disconnectDb } from './config/db.js';
import { env } from './config/env.js';
import { logger } from './config/logger.js';
import {
  startComplianceScheduler,
  startDerivationScheduler,
  startLifecycleNotificationScheduler,
} from './services/derivation.scheduler.js';



/**
 * Process entry point: connect the database, start listening, and shut both
 * down cleanly on a signal so in-flight requests are allowed to finish.
 */
async function start(): Promise<void> {
  await connectDb();

  const app = createApp();
  const server: Server = app.listen(env.PORT, env.HOST, () => {
    logger.info(`Access Genie API listening on http://${env.HOST}:${env.PORT}${env.API_PREFIX}`, {
      environment: env.NODE_ENV,
      database: env.MONGODB_DB_NAME,
      cors: env.corsOrigins.join(', '),
    });

    // Health, risk and overdue findings are partly functions of the clock, so
    // they need a pass that is not triggered by a request. Started after the
    // listener so a slow first pass cannot delay accepting connections.
    startDerivationScheduler();
    startLifecycleNotificationScheduler();
    startComplianceScheduler();
  });

  const shutdown = (signal: string) => {
    logger.info(`${signal} received — shutting down`);

    // Stop accepting connections, then close the DB once the last request ends.
    server.close(() => {
      void disconnectDb().then(() => {
        logger.info('Shutdown complete');
        process.exit(0);
      });
    });

    // Do not hang forever on a stuck connection.
    setTimeout(() => {
      logger.error('Forced shutdown after 10s timeout');
      process.exit(1);
    }, 10_000).unref();
  };

  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT', () => shutdown('SIGINT'));

  // An unhandled rejection leaves the process in an unknown state; log loudly
  // and let the orchestrator restart it rather than limping on.
  process.on('unhandledRejection', (reason) => {
    logger.error('Unhandled promise rejection', { reason: String(reason) });
    process.exit(1);
  });
}

start().catch((err: unknown) => {
  logger.error('Failed to start server', { err: err instanceof Error ? err.stack : String(err) });
  process.exit(1);
});
