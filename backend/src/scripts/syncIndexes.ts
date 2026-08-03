/**
 * Build the indexes every model declares.
 *
 *   npm run db:indexes -w @access-genie/backend
 *
 * Production connects with `autoIndex: false` (see config/db.ts): building
 * indexes on boot would stall startup on a large collection, and would do it
 * once per instance. So it happens here instead — deliberately, as a deploy
 * step, before the new API starts taking traffic.
 *
 * `syncIndexes` also *drops* indexes the schema no longer declares, which is
 * what keeps a cluster that has been through several schema revisions matching
 * the code rather than accumulating dead indexes forever.
 */
import mongoose from 'mongoose';
import { connectDb, disconnectDb } from '../config/db.js';
import { logger } from '../config/logger.js';
// Side-effect import: registers every model on the mongoose singleton, which is
// what `mongoose.models` below enumerates.
import '../models/index.js';

async function run(): Promise<void> {
  await connectDb();

  const names = Object.keys(mongoose.models).sort();
  let built = 0;
  let dropped = 0;

  for (const name of names) {
    const model = mongoose.models[name];
    if (!model) continue; // `names` came from the same object, so this is unreachable

    // Returns the indexes it removed; an empty array is the steady state.
    const removed = await model.syncIndexes();
    const indexes = await model.listIndexes();

    built += indexes.length - 1; // every collection has _id_; it is not ours
    dropped += removed.length;

    if (removed.length) {
      logger.info(`${name}: dropped ${removed.length} stale index(es)`, { removed: removed.join(', ') });
    }
  }

  logger.info(`Indexes in sync across ${names.length} collections`, {
    indexes: String(built),
    droppedStale: String(dropped),
  });

  await disconnectDb();
}

run().catch((err: unknown) => {
  logger.error('Index sync failed', { err: err instanceof Error ? err.stack : String(err) });
  process.exit(1);
});
