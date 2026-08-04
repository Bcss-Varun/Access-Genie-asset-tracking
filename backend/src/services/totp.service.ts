import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto';

/**
 * Time-based one-time passwords (RFC 6238).
 *
 * Written here rather than pulled in, because the algorithm is forty lines and
 * the dependency would be a supply-chain risk sitting directly on the
 * authentication path.
 *
 * Deliberately plain HMAC-SHA1 with 6 digits and a 30-second step: that is what
 * every authenticator app assumes when an `otpauth://` URI omits the
 * parameters, and diverging would silently produce codes that never match.
 */

const DIGITS = 6;
const STEP_SECONDS = 30;

/**
 * How many steps either side of now are accepted.
 *
 * One. Phone clocks drift and people finish typing after the code rolls, so
 * zero tolerance rejects honest attempts; more than one widens the window a
 * stolen code stays usable in for no real gain.
 */
const DRIFT_STEPS = 1;

const BASE32_ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';

/** Base32 without padding — the encoding authenticator apps expect. */
function toBase32(buffer: Buffer): string {
  let bits = 0;
  let value = 0;
  let output = '';

  for (const byte of buffer) {
    value = (value << 8) | byte;
    bits += 8;
    while (bits >= 5) {
      output += BASE32_ALPHABET[(value >>> (bits - 5)) & 31];
      bits -= 5;
    }
  }
  if (bits > 0) output += BASE32_ALPHABET[(value << (5 - bits)) & 31];

  return output;
}

function fromBase32(secret: string): Buffer {
  const clean = secret.toUpperCase().replace(/=+$/, '').replace(/\s/g, '');
  let bits = 0;
  let value = 0;
  const bytes: number[] = [];

  for (const char of clean) {
    const index = BASE32_ALPHABET.indexOf(char);
    if (index === -1) throw new Error('Invalid base32 character in secret');
    value = (value << 5) | index;
    bits += 5;
    if (bits >= 8) {
      bytes.push((value >>> (bits - 8)) & 0xff);
      bits -= 8;
    }
  }

  return Buffer.from(bytes);
}

/** A fresh 160-bit secret, base32 encoded. */
export function generateSecret(): string {
  return toBase32(randomBytes(20));
}

/** The code for one time step. */
function codeFor(secret: string, step: number): string {
  const counter = Buffer.alloc(8);
  // Written as two 32-bit halves: `writeBigUInt64BE` would work, but the step
  // count fits comfortably in 32 bits until the year 6000 and this avoids
  // BigInt on the auth path.
  counter.writeUInt32BE(Math.floor(step / 2 ** 32), 0);
  counter.writeUInt32BE(step >>> 0, 4);

  const hmac = createHmac('sha1', fromBase32(secret)).update(counter).digest();

  // Dynamic truncation, RFC 4226 §5.4.
  const offset = (hmac[hmac.length - 1] as number) & 0x0f;
  const binary =
    (((hmac[offset] as number) & 0x7f) << 24) |
    (((hmac[offset + 1] as number) & 0xff) << 16) |
    (((hmac[offset + 2] as number) & 0xff) << 8) |
    ((hmac[offset + 3] as number) & 0xff);

  return String(binary % 10 ** DIGITS).padStart(DIGITS, '0');
}

/**
 * Is this code valid right now?
 *
 * Compared with `timingSafeEqual` rather than `===`: a string comparison that
 * short-circuits on the first wrong character leaks how much of the code was
 * right, which over enough attempts is enough to guess one.
 */
export function verifyCode(secret: string, code: string, now = Date.now()): boolean {
  const cleaned = code.replace(/\D/g, '');
  if (cleaned.length !== DIGITS) return false;

  const currentStep = Math.floor(now / 1000 / STEP_SECONDS);
  const candidate = Buffer.from(cleaned);

  for (let drift = -DRIFT_STEPS; drift <= DRIFT_STEPS; drift++) {
    const expected = Buffer.from(codeFor(secret, currentStep + drift));
    if (expected.length === candidate.length && timingSafeEqual(expected, candidate)) return true;
  }
  return false;
}

/** The URI an authenticator app scans. */
export function otpauthUri(secret: string, account: string, issuer: string): string {
  const label = encodeURIComponent(`${issuer}:${account}`);
  const params = new URLSearchParams({
    secret,
    issuer,
    algorithm: 'SHA1',
    digits: String(DIGITS),
    period: String(STEP_SECONDS),
  });
  return `otpauth://totp/${label}?${params.toString()}`;
}

/**
 * Single-use codes for when the authenticator is lost.
 *
 * Formatted in two groups so they can be read aloud or written down without
 * transcription errors, which is the situation they exist for.
 */
export function generateRecoveryCodes(count = 8): string[] {
  return Array.from({ length: count }, () => {
    const raw = randomBytes(5).toString('hex').toUpperCase();
    return `${raw.slice(0, 5)}-${raw.slice(5, 10)}`;
  });
}
