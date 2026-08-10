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
/**
 * Attempts to make before giving up on the first connection.
 *
 * Eight with exponential backoff spans about a minute, which is the difference
 * between surviving a hosted cluster's bad patch and refusing to boot during
 * one. Five attempts covered ~7 seconds — enough for a DNS blip, not enough for
 * a shared-tier cluster that is refusing a good share of new connections.
 */
const CONNECT_ATTEMPTS = 8;
/** Cap the backoff so the last waits stay useful rather than doubling forever. */
const MAX_BACKOFF_MS = 15_000;

// Reference to in-memory MongoDB server instance when used
let memoryServerInstance: any = null;

export async function connectDb(): Promise<typeof mongoose> {
  // Reject unknown keys instead of silently dropping them, so a typo in a
  // filter can never widen a query to "match everything".
  mongoose.set('strictQuery', 'throw');

  mongoose.connection.on('error', (err) => logger.error('MongoDB connection error', { err: String(err) }));
  mongoose.connection.on('disconnected', () => logger.warn('MongoDB disconnected'));
  mongoose.connection.on('reconnected', () => logger.info('MongoDB reconnected'));

  // 1. Try connecting to Atlas cluster with a shorter initial timeout for fast fallback
  const attempts = env.isProd ? CONNECT_ATTEMPTS : 2;
  for (let attempt = 1; attempt <= attempts; attempt++) {
    try {
      await mongoose.connect(env.MONGODB_URI, {
        dbName: env.MONGODB_DB_NAME,
        maxPoolSize: env.MONGODB_MAX_POOL_SIZE,
        maxIdleTimeMS: 0,
        serverSelectionTimeoutMS: env.isProd ? env.MONGODB_SERVER_SELECTION_TIMEOUT_MS : 3000,
        autoIndex: !env.isProd,
      });
      const { host, name } = mongoose.connection;
      logger.info('MongoDB connected', { host, database: name });
      return mongoose;
    } catch (err) {
      if (attempt >= attempts) {
        logger.warn(`Could not reach MongoDB Atlas cluster (${err instanceof Error ? err.message.split('\n')[0] : String(err)})`);
      } else {
        const backoff = Math.min(500 * 2 ** (attempt - 1), MAX_BACKOFF_MS);
        logger.warn(`MongoDB connection failed, retrying in ${backoff}ms...`);
        await new Promise((resolve) => setTimeout(resolve, backoff));
      }
    }
  }

  // 2. In non-production environments, fallback to in-memory MongoDB server
  if (!env.isProd) {
    logger.info('Starting local in-memory MongoDB server for development...');
    try {
      const { MongoMemoryServer } = await import('mongodb-memory-server');
      memoryServerInstance = await MongoMemoryServer.create({
        instance: {
          dbName: env.MONGODB_DB_NAME,
        },
      });
      const memoryUri = memoryServerInstance.getUri();

      await mongoose.connect(memoryUri, {
        dbName: env.MONGODB_DB_NAME,
        autoIndex: true,
      });

      const { host, name } = mongoose.connection;
      logger.info('In-memory MongoDB server running and connected!', { host, database: name });

      // Auto-seed in-memory database with demo fixtures so logins and data work immediately
      logger.info('Seeding in-memory database with demo personas and data...');
      const { seedDemo } = await import('../seed/demo.js');
      await seedDemo({ skipConnect: true });

      return mongoose;
    } catch (memErr) {
      logger.error('Failed to initialize in-memory MongoDB fallback', {
        err: memErr instanceof Error ? memErr.message : String(memErr),
      });
      throw memErr;
    }
  }

  throw new Error(`Could not connect to MongoDB after ${CONNECT_ATTEMPTS} attempts`);
}

export async function disconnectDb(): Promise<void> {
  await mongoose.connection.close();
  if (memoryServerInstance) {
    await memoryServerInstance.stop();
    memoryServerInstance = null;
  }
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
