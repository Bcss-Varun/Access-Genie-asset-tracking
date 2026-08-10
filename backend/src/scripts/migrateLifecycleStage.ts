/**
 * One-time: move every asset's `lifecycleStage` from the old free-string
 * 6-value board vocabulary (`Procurement`/`Commissioning`/`In Service`/
 * `Maintenance`/`EOL Planning`/`Retired/Disposed`, or nothing at all — it was
 * never enforced) onto the new 10-stage enum in `shared/src/domain.ts`.
 *
 *   npm run migrate:lifecycle -w @access-genie/backend
 *
 * Idempotent: an asset already holding a valid new-enum value is left alone,
 * so running this twice (or against a database seeded after the cutover) is
 * a no-op. The mapping is `deriveStage()`'s old client-side guesswork
 * (`frontend/src/pages/lifecycle/page.tsx`), made permanent and moved
 * server-side instead of recomputed on every page load.
 */
import mongoose from 'mongoose';
import { LIFECYCLE_STAGES, type LifecycleStage } from '@access-genie/shared';
import { connectDb, disconnectDb } from '../config/db.js';
import { logger } from '../config/logger.js';
import { Asset, type AssetDoc } from '../models/index.js';

const VALID = new Set<string>(LIFECYCLE_STAGES);

function migrate(asset: Pick<AssetDoc, 'status' | 'custodian' | 'lifecycleStage'>): LifecycleStage {
  if (asset.lifecycleStage && VALID.has(asset.lifecycleStage)) return asset.lifecycleStage as LifecycleStage;

  switch (asset.status) {
    case 'End_Of_Life':
      return 'Retired';
    case 'Maintenance':
      return 'Maintenance';
    case 'Staging':
      return 'Commissioning';
    case 'Missing':
      // Still counted as deployed — being untracked is a tracking-status
      // concern, not a lifecycle one.
      return 'Assigned / In Service';
    default:
      return asset.custodian && asset.custodian !== 'Unassigned' ? 'Assigned / In Service' : 'Available';
  }
}

async function run(): Promise<void> {
  await connectDb();

  // Bypass the schema's own enum validation to read whatever is actually
  // stored today, including the pre-cutover free-text values this script
  // exists to fix.
  const assets = await mongoose.connection
    .collection<{ _id: string; status: string; custodian: string; lifecycleStage?: string }>('assets')
    .find({})
    .toArray();

  let migrated = 0;
  let unchanged = 0;

  for (const asset of assets) {
    const next = migrate(asset as unknown as Pick<AssetDoc, 'status' | 'custodian' | 'lifecycleStage'>);
    if (asset.lifecycleStage === next) {
      unchanged += 1;
      continue;
    }

    await Asset.updateOne({ _id: asset._id }, { $set: { lifecycleStage: next } });
    migrated += 1;
  }

  logger.info('Lifecycle stage migration complete', { total: assets.length, migrated, unchanged });
  await disconnectDb();
}

run().catch((err: unknown) => {
  logger.error('Lifecycle stage migration failed', { err: err instanceof Error ? err.stack : String(err) });
  process.exit(1);
});
