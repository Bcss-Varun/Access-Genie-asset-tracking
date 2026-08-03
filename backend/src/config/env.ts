import 'dotenv/config';
import { z } from 'zod';

/**
 * Environment is validated once, at boot. A missing or malformed variable
 * crashes the process here with a readable message rather than surfacing as a
 * confusing runtime error three layers deep.
 */
const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().positive().default(4000),
  CORS_ORIGIN: z.string().default('http://localhost:5173'),

  /** Empty in development → the in-memory Mongo fallback takes over (db.ts). */
  MONGODB_URI: z.string().default(''),

  JWT_ACCESS_SECRET: z.string().min(32, 'JWT_ACCESS_SECRET must be at least 32 characters'),
  JWT_REFRESH_SECRET: z.string().min(32, 'JWT_REFRESH_SECRET must be at least 32 characters'),
  JWT_ACCESS_TTL: z.string().default('15m'),
  JWT_REFRESH_TTL: z.string().default('7d'),

  SEED_PASSWORD: z.string().min(8).default('Genie@2026'),
});

const parsed = envSchema.safeParse(process.env);

if (!parsed.success) {
  const issues = parsed.error.issues.map((i) => `  • ${i.path.join('.')}: ${i.message}`).join('\n');
  console.error(`\n✖ Invalid environment configuration:\n${issues}\n\nCopy server/.env.example to server/.env and fill it in.\n`);
  process.exit(1);
}

const raw = parsed.data;

export const env = {
  ...raw,
  isProd: raw.NODE_ENV === 'production',
  isDev: raw.NODE_ENV === 'development',
  isTest: raw.NODE_ENV === 'test',
  /** Origins allowed to send credentialed requests. */
  corsOrigins: raw.CORS_ORIGIN.split(',').map((o) => o.trim()).filter(Boolean),
};

// A production deploy must never fall back to an ephemeral database, and must
// never run on the placeholder secrets shipped in .env.example.
if (env.isProd) {
  if (!env.MONGODB_URI) {
    console.error('✖ MONGODB_URI is required when NODE_ENV=production.');
    process.exit(1);
  }
  if (env.JWT_ACCESS_SECRET.startsWith('change-me') || env.JWT_REFRESH_SECRET.startsWith('change-me')) {
    console.error('✖ Refusing to start: JWT secrets are still the .env.example placeholders.');
    process.exit(1);
  }
}
