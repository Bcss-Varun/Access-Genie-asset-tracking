import mongoose from 'mongoose';
import { env } from './env.js';
import { logger } from './logger.js';

/** Held so `disconnectDb` can stop the in-memory server it started. */
let memoryServer: { stop: () => Promise<boolean> } | null = null;

/**
 * Resolve the connection string.
 *
 * With no MONGODB_URI set outside production we spin up `mongodb-memory-server`
 * so `npm run dev` works on a machine with no MongoDB installed. The data is
 * ephemeral — it disappears with the process — which is exactly what you want
 * for a scratch dev database, and never what you want in production (guarded
 * in config/env.ts).
 */
async function resolveUri(): Promise<string> {
  if (env.MONGODB_URI) return env.MONGODB_URI;

  logger.warn('MONGODB_URI is not set — starting an ephemeral in-memory MongoDB (data is lost on exit)');
  const { MongoMemoryServer } = await import('mongodb-memory-server');
  const server = await MongoMemoryServer.create();
  memoryServer = server;
  return server.getUri('access_genie');
}

export async function connectDb(): Promise<typeof mongoose> {
  // Reject unknown keys instead of silently dropping them, so a typo in a
  // filter can never widen a query to "match everything".
  mongoose.set('strictQuery', 'throw');

  const uri = await resolveUri();

  mongoose.connection.on('error', (err) => logger.error('MongoDB connection error', { err: String(err) }));
  mongoose.connection.on('disconnected', () => logger.warn('MongoDB disconnected'));

  await mongoose.connect(uri, {
    serverSelectionTimeoutMS: 10_000,
    autoIndex: !env.isProd, // in production, indexes are built by a migration, not on boot
  });

  const { host, name } = mongoose.connection;
  logger.info('MongoDB connected', { host, database: name });
  return mongoose;
}

export async function disconnectDb(): Promise<void> {
  await mongoose.connection.close();
  if (memoryServer) {
    await memoryServer.stop();
    memoryServer = null;
  }
}
