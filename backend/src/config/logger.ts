import { env } from './env.js';

/**
 * Minimal structured logger. In production every line is a single JSON object
 * so a log shipper can index it; in development it stays human-readable.
 */
type Level = 'debug' | 'info' | 'warn' | 'error';

const LEVEL_RANK: Record<Level, number> = { debug: 10, info: 20, warn: 30, error: 40 };
const MIN_RANK = LEVEL_RANK[env.logLevel];

const PREFIX: Record<Level, string> = {
  debug: '\x1b[90mdebug\x1b[0m',
  info: '\x1b[36minfo \x1b[0m',
  warn: '\x1b[33mwarn \x1b[0m',
  error: '\x1b[31merror\x1b[0m',
};

function emit(level: Level, message: string, context?: Record<string, unknown>): void {
  if (LEVEL_RANK[level] < MIN_RANK) return;

  if (env.isProd) {
    console[level === 'debug' ? 'log' : level](
      JSON.stringify({ level, time: new Date().toISOString(), message, ...context }),
    );
    return;
  }

  const suffix = context && Object.keys(context).length ? ` \x1b[90m${JSON.stringify(context)}\x1b[0m` : '';
  console[level === 'debug' ? 'log' : level](`${PREFIX[level]} ${message}${suffix}`);
}

export const logger = {
  debug: (message: string, context?: Record<string, unknown>) => emit('debug', message, context),
  info: (message: string, context?: Record<string, unknown>) => emit('info', message, context),
  warn: (message: string, context?: Record<string, unknown>) => emit('warn', message, context),
  error: (message: string, context?: Record<string, unknown>) => emit('error', message, context),
};
