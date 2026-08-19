// Shared helpers for the Access Genie QA harness.
//
// Everything the runners need to talk to the API as a real signed-in user, plus
// bookkeeping so a test run leaves the database exactly as it found it. Assets
// created during a run are registered here and torn down at the end — this suite
// runs against a live Atlas cluster, not a disposable fixture.

export const API = process.env.AG_API ?? 'http://localhost:4000/api/v1';
export const WEB = process.env.AG_WEB ?? 'http://localhost:5173';
export const EMAIL = process.env.AG_EMAIL ?? 'raj@bcss.in';
export const PASSWORD = process.env.AG_PASSWORD ?? 'raj@bcss';

/** Assets (and other docs) this run created, newest first, for teardown. */
export const created = [];

export async function login(email = EMAIL, password = PASSWORD) {
  const res = await fetch(`${API}/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password }),
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(`login failed ${res.status}: ${JSON.stringify(body).slice(0, 200)}`);
  return body.data.accessToken;
}

/**
 * One request. Returns status, parsed body, elapsed ms and the raw text so a
 * test can assert on the envelope shape as well as the payload.
 */
export async function req(token, method, path, body, extraHeaders = {}) {
  const t0 = Date.now();
  const res = await fetch(`${API}${path}`, {
    method,
    headers: {
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}),
      ...extraHeaders,
    },
    body: body === undefined ? undefined : typeof body === 'string' ? body : JSON.stringify(body),
  });
  const text = await res.text();
  let json;
  try { json = JSON.parse(text); } catch { json = undefined; }
  return { status: res.status, body: json, text, ms: Date.now() - t0, headers: res.headers };
}

/** A minimal valid asset payload. Override any field via `patch`. */
export function assetPayload(patch = {}) {
  return {
    name: 'QA Probe Asset',
    category: 'Compute',
    location: { id: 'LOC-QA', name: 'QA Lab' },
    ...patch,
  };
}

/** Create an asset and remember it for teardown. */
export async function mkAsset(token, patch = {}) {
  const r = await req(token, 'POST', '/assets', assetPayload(patch));
  if (r.status === 201 && r.body?.data?.id) created.push(r.body.data.id);
  return r;
}

/**
 * Extra cleanup steps a runner registers — a probe user, a saved report, a
 * schedule. Assets are tracked automatically by `mkAsset`; anything else a
 * runner creates has to say how to remove itself.
 */
export const cleanups = [];

export function onTeardown(fn) {
  cleanups.push(fn);
}

export async function teardown(token) {
  const removed = [];
  const stuck = [];
  for (const id of [...created].reverse()) {
    const r = await req(token, 'DELETE', `/assets/${id}`);
    if (r.status === 204) removed.push(id);
    else stuck.push({ id, status: r.status });
  }
  created.length = 0;

  // Registered cleanups run after the assets, and one that throws must not stop
  // the rest — a half-finished teardown is what leaves the next run's fixtures
  // sitting in the database.
  for (const fn of cleanups.splice(0)) {
    try {
      await fn();
    } catch (err) {
      stuck.push({ cleanup: err?.message ?? String(err) });
    }
  }

  return { removed, stuck };
}

/**
 * Tear down fixtures even when the run dies unexpectedly.
 *
 * These suites create real records in a live Atlas cluster, so a crash between
 * setup and teardown does not just lose a test result — it leaves a probe asset
 * sitting in somebody's estate, where the next run finds it and reports a
 * tenancy leak that is really just litter. That failure is confusing precisely
 * because it looks exactly like the bug the suite exists to catch.
 *
 * Registered for the three ways a run ends early: a throw, a rejected promise
 * nobody awaited, and Ctrl-C.
 */
export function guardAgainstCrash(token) {
  let bailing = false;

  const bail = async (label, err) => {
    if (bailing) return;
    bailing = true;
    console.error(`\n${label}: ${err?.message ?? err}`);
    console.error('Tearing down fixtures before exiting…');
    try {
      const td = await teardown(token);
      console.error(`  assets removed ${td.removed.length}${td.stuck.length ? `, STUCK ${JSON.stringify(td.stuck)}` : ''}`);
    } catch (teardownErr) {
      console.error(`  teardown itself failed: ${teardownErr?.message ?? teardownErr}`);
    }
    process.exit(1);
  };

  process.on('uncaughtException', (err) => void bail('Uncaught exception', err));
  process.on('unhandledRejection', (err) => void bail('Unhandled rejection', err));
  process.on('SIGINT', () => void bail('Interrupted', new Error('SIGINT')));
}

// ── Result recording ─────────────────────────────────────────────────────────

export const results = [];

/**
 * Record one executed test case.
 *
 * `pass` decides Status; a failing case carries the evidence that proves it
 * failed, which is what the bug report is written from.
 */
export function record({ id, feature, type, priority, severity, expected, actual, pass, evidence }) {
  results.push({
    id, feature, type, priority,
    severity: pass ? '—' : severity,
    expected, actual,
    status: pass ? 'PASS' : 'FAIL',
    // Kept as a boolean alongside the display string because the runners decide
    // their exit code with `results.some((r) => !r.pass)`. Without it that test
    // reads `undefined` on every row, is therefore true on every row, and the
    // process exits 1 on a clean run — which makes the suite useless in CI and,
    // chained with `&&`, stops any later suite from running at all.
    pass,
    evidence: evidence ?? null,
  });
  const mark = pass ? '\x1b[32mPASS\x1b[0m' : '\x1b[31mFAIL\x1b[0m';
  console.log(`${mark}  ${id.padEnd(12)} ${feature.slice(0, 52).padEnd(52)} ${pass ? '' : '→ ' + String(actual).slice(0, 90)}`);
}

export function summarise() {
  const pass = results.filter((r) => r.status === 'PASS').length;
  const fail = results.filter((r) => r.status === 'FAIL').length;
  console.log(`\n${'─'.repeat(78)}\n  ${results.length} executed · ${pass} passed · ${fail} failed`);
  if (fail) {
    console.log('\n  Failures:');
    for (const r of results.filter((x) => x.status === 'FAIL')) {
      console.log(`    ${r.id}  [${r.severity}]  ${r.feature}`);
      console.log(`        expected: ${r.expected}`);
      console.log(`        actual:   ${r.actual}`);
    }
  }
  return { total: results.length, pass, fail };
}
