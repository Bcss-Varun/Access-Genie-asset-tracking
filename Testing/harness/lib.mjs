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

export async function teardown(token) {
  const removed = [];
  const stuck = [];
  for (const id of [...created].reverse()) {
    const r = await req(token, 'DELETE', `/assets/${id}`);
    if (r.status === 204) removed.push(id);
    else stuck.push({ id, status: r.status });
  }
  return { removed, stuck };
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
