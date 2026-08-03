/**
 * Seed the database with nothing but the administrator account.
 *
 *   npm run seed          — create (or reset) the admin; leaves everything else alone
 *   npm run seed:fresh    — wipe every seeded collection first, then create the admin
 *
 * This is the default seeder because the product is meant to open on a real,
 * empty estate: no demo assets, no fabricated work orders, no fixture people.
 * The first sign-in registers the first asset, and every number on every screen
 * from then on is something the operator actually put there.
 *
 * The prototype's fixture set is still available — `npm run seed:demo`, see
 * seed/demo.ts — for design review and screenshots, but it is opt-in now rather
 * than the state a fresh database lands in.
 *
 * Two documents are written, and only two:
 *
 *   • one org-level scope node, because `homeScopeId` is a required reference
 *     and the scope switcher needs a root to sit at;
 *   • one super-admin user.
 *
 * Everything else — classes, facilities, taxonomy — is created through the
 * application by the person who signs in.
 */
import { connectDb, disconnectDb } from '../config/db.js';
import { env } from '../config/env.js';
import { logger } from '../config/logger.js';
import { ScopeNodeModel, User, syncCounter } from '../models/index.js';
import { SEEDED_COLLECTIONS } from './collections.js';

const FRESH = process.argv.includes('--fresh');

/** The organisation the admin's scope resolves to. */
const ROOT_SCOPE_ID = 'ORG-1';

/** `U-001`, so anyone invited afterwards continues the sequence at `U-002`. */
const ADMIN_ID = 'U-001';

/** Up to three characters, per the user schema. */
function initialsFor(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  const letters = parts.length > 1
    ? parts.slice(0, 2).map((p) => p[0]).join('')
    : (parts[0] ?? 'A').slice(0, 2);
  return letters.toUpperCase().slice(0, 3);
}

async function seed(): Promise<void> {
  await connectDb();

  if (FRESH) {
    logger.warn('--fresh: dropping every seeded collection');
    await Promise.all(SEEDED_COLLECTIONS.map((model) => model.deleteMany({})));
  }

  // ── The organisation ───────────────────────────────────────────────────────
  // Upserted rather than inserted so a re-run never clobbers a name the operator
  // has since changed in the app — only the fields that must exist are set.
  await ScopeNodeModel.updateOne(
    { _id: ROOT_SCOPE_ID },
    {
      $set: { level: 'org' },
      $setOnInsert: { name: env.ADMIN_ORG_NAME, assetCount: 0 },
    },
    { upsert: true },
  );
  logger.info(`  scope                ${ROOT_SCOPE_ID}`);

  // ── The administrator ──────────────────────────────────────────────────────
  // Matched on email rather than ID: if the account already exists under some
  // other ID, resetting *that* record is the intent — creating a second user
  // with the same address would fail the unique index anyway.
  //
  // Saved through the document API, not `updateOne`, because the password is
  // hashed by a pre-save hook that a bulk or atomic write bypasses entirely.
  const existing = await User.findOne({ email: env.ADMIN_EMAIL.toLowerCase() }).select('+passwordHash');
  const admin = existing ?? new User({ _id: ADMIN_ID });

  admin.name = env.ADMIN_NAME;
  admin.email = env.ADMIN_EMAIL;
  admin.initials = initialsFor(env.ADMIN_NAME);
  admin.roleId = 'super_admin';
  admin.title = 'Super Admin';
  admin.homeScopeId = ROOT_SCOPE_ID;
  admin.status = 'active';
  // Assigning the plaintext marks the path modified, so the hook hashes it.
  // Re-running the seeder is therefore also the way back in after a lost password.
  admin.passwordHash = env.ADMIN_PASSWORD;

  await admin.save();
  logger.info(`  users                1 (${existing ? 'password reset' : 'created'})`);

  // Keep the ID sequence past the admin so the first invited user is U-002.
  await syncCounter('user', 1);

  logger.info('Seed complete');
  logger.info(`Sign in as ${env.ADMIN_EMAIL} with the password: ${env.ADMIN_PASSWORD}`);
}

seed()
  .then(() => disconnectDb())
  .then(() => process.exit(0))
  .catch((err: unknown) => {
    logger.error('Seed failed', { err: err instanceof Error ? err.stack : String(err) });
    process.exit(1);
  });
