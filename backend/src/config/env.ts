import 'dotenv/config';
import { z } from 'zod';

/**
 * Environment is validated once, at boot. A missing or malformed variable
 * crashes the process here with a readable message rather than surfacing as a
 * confusing runtime error three layers deep.
 *
 * Everything the API needs to run somewhere else — port, database, allowed
 * origins, token lifetimes, cookie scope, rate limits — is a variable. There are
 * no environment checks scattered through the codebase: the rest of the code
 * reads `env.X` and nothing else.
 */

/** `true` / `1` / `yes` / `on` → true. Anything else → false. */
const boolish = z.string().transform((v) => ['1', 'true', 'yes', 'on'].includes(v.trim().toLowerCase()));

const envSchema = z.object({
  // ── Runtime ────────────────────────────────────────────────────────────────
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().positive().max(65_535).default(4000),
  /** Interface to bind. `0.0.0.0` accepts external traffic; `127.0.0.1` does not. */
  HOST: z.string().min(1).default('0.0.0.0'),
  /** Version prefix every route is mounted under. */
  API_PREFIX: z.string().startsWith('/').default('/api/v1'),
  LOG_LEVEL: z.enum(['debug', 'info', 'warn', 'error']).optional(),

  // ── CORS ───────────────────────────────────────────────────────────────────
  /** Comma-separated origins allowed to send credentialed requests. */
  CORS_ORIGIN: z.string().default('http://localhost:5173'),

  // ── Database ───────────────────────────────────────────────────────────────
  MONGODB_URI: z.string().min(1, 'MONGODB_URI is required'),
  /**
   * Database name, as its own variable because an Atlas URI is commonly pasted
   * without a path (`…mongodb.net/?appName=…`) — and Mongoose would then quietly
   * connect to a database called `test`.
   */
  MONGODB_DB_NAME: z.string().min(1).default('access_genie'),
  MONGODB_MAX_POOL_SIZE: z.coerce.number().int().positive().default(10),
  MONGODB_SERVER_SELECTION_TIMEOUT_MS: z.coerce.number().int().positive().default(10_000),

  // ── Auth ───────────────────────────────────────────────────────────────────
  JWT_ACCESS_SECRET: z.string().min(32, 'JWT_ACCESS_SECRET must be at least 32 characters'),
  JWT_REFRESH_SECRET: z.string().min(32, 'JWT_REFRESH_SECRET must be at least 32 characters'),
  JWT_ACCESS_TTL: z.string().regex(/^\d+[smhd]?$/, 'Use a value like 15m, 2h or 900').default('15m'),
  JWT_REFRESH_TTL: z.string().regex(/^\d+[smhd]?$/, 'Use a value like 7d, 24h or 604800').default('7d'),
  BCRYPT_ROUNDS: z.coerce.number().int().min(4).max(15).default(10),

  // ── Refresh cookie ─────────────────────────────────────────────────────────
  COOKIE_NAME: z.string().min(1).default('ag_refresh'),
  /** Leave unset for a host-only cookie — correct unless you serve subdomains. */
  COOKIE_DOMAIN: z.string().optional(),
  /** Defaults to on in production, where the app must be served over HTTPS. */
  COOKIE_SECURE: boolish.optional(),
  COOKIE_SAME_SITE: z.enum(['strict', 'lax', 'none']).optional(),

  // ── Rate limiting ──────────────────────────────────────────────────────────
  RATE_LIMIT_WINDOW_MS: z.coerce.number().int().positive().default(60_000),
  RATE_LIMIT_MAX: z.coerce.number().int().positive().optional(),
  AUTH_RATE_LIMIT_WINDOW_MS: z.coerce.number().int().positive().default(15 * 60_000),
  AUTH_RATE_LIMIT_MAX: z.coerce.number().int().positive().optional(),

  // ── Seed ───────────────────────────────────────────────────────────────────
  // The default seeder creates one administrator and nothing else. These are
  // that account, as variables so a deployment can own its own credentials
  // rather than inherit the ones checked in here.
  ADMIN_EMAIL: z.string().regex(/^\S+@\S+\.\S+$/, 'ADMIN_EMAIL must be an email address').default('raj@bcss.in'),
  ADMIN_PASSWORD: z.string().min(8, 'ADMIN_PASSWORD must be at least 8 characters').default('raj@bcss'),
  ADMIN_NAME: z.string().min(1).default('Raj'),
  /** Name of the root scope node the admin's `homeScopeId` points at. */
  ADMIN_ORG_NAME: z.string().min(1).default('Access Genie'),

  /** Password given to every persona loaded by the opt-in demo seeder. */
  SEED_PASSWORD: z.string().min(8).default('Genie@2026'),
});

const parsed = envSchema.safeParse(process.env);

if (!parsed.success) {
  const issues = parsed.error.issues.map((i) => `  • ${i.path.join('.')}: ${i.message}`).join('\n');
  console.error(
    `\n✖ Invalid environment configuration:\n${issues}\n\nCopy backend/.env.example to backend/.env and fill it in.\n`,
  );
  process.exit(1);
}

const raw = parsed.data;
const isProd = raw.NODE_ENV === 'production';

/**
 * One `CORS_ORIGIN` entry against one request `Origin` header, with `*`
 * matching any run of characters within that one entry — enough to write
 * `https://my-app-*.vercel.app` for a project whose preview deployments each
 * get their own hostname, without opening the door to every origin the way a
 * bare `*` would (still refused outright below, since that combined with
 * credentialed requests is a real hole, not just a convenience trade-off).
 */
function originMatches(origin: string, pattern: string): boolean {
  if (!pattern.includes('*')) return origin === pattern;
  const re = new RegExp(`^${pattern.split('*').map((s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('.*')}$`);
  return re.test(origin);
}

export const env = {
  ...raw,
  isProd,
  isDev: raw.NODE_ENV === 'development',
  isTest: raw.NODE_ENV === 'test',

  /** Origins allowed to send credentialed requests — each entry may use `*` as a wildcard segment. */
  corsOrigins: raw.CORS_ORIGIN.split(',')
    .map((o) => o.trim())
    .filter(Boolean),

  /** Whether a request's `Origin` header matches any configured entry, wildcard or exact. */
  isOriginAllowed(origin: string): boolean {
    return this.corsOrigins.some((pattern) => originMatches(origin, pattern));
  },

  /** Debug-level logs in development, info and above in production. */
  logLevel: raw.LOG_LEVEL ?? (isProd ? 'info' : 'debug'),

  /** The refresh cookie only travels over HTTPS in production unless told otherwise. */
  cookieSecure: raw.COOKIE_SECURE ?? isProd,
  cookieSameSite: raw.COOKIE_SAME_SITE ?? (isProd ? ('strict' as const) : ('lax' as const)),
  /** Scoped to the auth routes, so it is not attached to every ordinary call. */
  cookiePath: `${raw.API_PREFIX}/auth`,

  // Development gets loose limits so clicking around never trips them; the
  // production defaults are the ones that matter.
  rateLimitMax: raw.RATE_LIMIT_MAX ?? (isProd ? 300 : 10_000),
  authRateLimitMax: raw.AUTH_RATE_LIMIT_MAX ?? (isProd ? 10 : 100),
};

export type Env = typeof env;

// A production deploy must never run on the placeholder secrets shipped in
// .env.example, and must never send a session cookie in the clear.
if (env.isProd) {
  const fatal: string[] = [];

  if (env.JWT_ACCESS_SECRET.startsWith('change-me') || env.JWT_REFRESH_SECRET.startsWith('change-me')) {
    fatal.push('JWT secrets are still the .env.example placeholders.');
  }
  if (env.JWT_ACCESS_SECRET === env.JWT_REFRESH_SECRET) {
    fatal.push('JWT_ACCESS_SECRET and JWT_REFRESH_SECRET must differ.');
  }
  if (!env.cookieSecure) {
    fatal.push('COOKIE_SECURE must be on — the refresh cookie would otherwise travel in the clear.');
  }
  if (env.corsOrigins.includes('*')) {
    fatal.push('CORS_ORIGIN cannot be "*" while credentials are allowed.');
  }

  if (fatal.length) {
    console.error(`\n✖ Refusing to start in production:\n${fatal.map((f) => `  • ${f}`).join('\n')}\n`);
    process.exit(1);
  }
}
