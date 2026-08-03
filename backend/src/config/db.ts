import mongoose from 'mongoose';
import { env } from './env.js';
import { logger } from './logger.js';

/**
 * Connect to MongoDB.
 *
 * `dbName` is passed explicitly rather than relying on the path segment of the
 * URI: connection strings copied out of Atlas usually have no path at all, and
 * the silent fallback in that case is a database literally named `test`. Being
 * explicit means the same URI can serve staging and production by changing one
 * variable.
 */
/** Attempts to make before giving up on the first connection. */
const CONNECT_ATTEMPTS = 5;

export async function connectDb(): Promise<typeof mongoose> {
  // Reject unknown keys instead of silently dropping them, so a typo in a
  // filter can never widen a query to "match everything".
  mongoose.set('strictQuery', 'throw');

  mongoose.connection.on('error', (err) => logger.error('MongoDB connection error', { err: String(err) }));
  mongoose.connection.on('disconnected', () => logger.warn('MongoDB disconnected'));
  mongoose.connection.on('reconnected', () => logger.info('MongoDB reconnected'));

  // The driver reconnects on its own once a connection has been established;
  // what it does not do is retry the *first* one. On a hosted cluster that
  // first handshake is exactly what a cold network, a DNS blip or a paused
  // Atlas instance interferes with — so a boot that would have worked five
  // seconds later fails permanently instead.
  for (let attempt = 1; ; attempt++) {
    try {
      await mongoose.connect(env.MONGODB_URI, {
        dbName: env.MONGODB_DB_NAME,
        maxPoolSize: env.MONGODB_MAX_POOL_SIZE,
        serverSelectionTimeoutMS: env.MONGODB_SERVER_SELECTION_TIMEOUT_MS,
        // In production, indexes are built by a deliberate migration — not on
        // boot, where a large collection would stall startup.
        autoIndex: !env.isProd,
      });
      break;
    } catch (err) {
      if (attempt >= CONNECT_ATTEMPTS) {
        logger.error(`Could not reach MongoDB after ${CONNECT_ATTEMPTS} attempts`, {
          database: env.MONGODB_DB_NAME,
          err: err instanceof Error ? err.message : String(err),
        });
        throw err;
      }

      const backoff = 500 * 2 ** (attempt - 1);
      logger.warn(`MongoDB connection failed, retrying in ${backoff}ms`, {
        attempt: `${attempt}/${CONNECT_ATTEMPTS - 1}`,
        err: err instanceof Error ? err.message.split('\n')[0] : String(err),
      });
      await new Promise((resolve) => setTimeout(resolve, backoff));
    }
  }

  const { host, name } = mongoose.connection;
  logger.info('MongoDB connected', { host, database: name });
  return mongoose;
}

export async function disconnectDb(): Promise<void> {
  await mongoose.connection.close();
}

/** Driver connection states, including the `99` the driver uses pre-init. */
const READY_STATES: Record<number, string> = {
  0: 'disconnected',
  1: 'connected',
  2: 'connecting',
  3: 'disconnecting',
  99: 'uninitialized',
};

/** Whether the driver currently has a usable connection — used by /health. */
export function dbStatus(): { ready: boolean; state: string } {
  const readyState = mongoose.connection.readyState;
  return { ready: readyState === 1, state: READY_STATES[readyState] ?? 'unknown' };
}
