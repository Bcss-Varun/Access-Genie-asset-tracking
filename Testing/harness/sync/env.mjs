// Shared environment for the live sync suites.
//
// Boots a throwaway loopback MongoDB, the real API in-process, the real Vite
// client and a headless Chrome — then hands back helpers to drive all three.
// It never reads backend/.env and never touches a hosted cluster.
//
//   const env = await startEnv({ estate: 'fresh', browser: true });
//   const asset = await env.ok('admin', '/assets', 'POST', {...}, 201);
//   await env.login('admin');            // signs in through the login form
//   await env.go('/assets');             // client-side navigation, no reload
//   await env.expectText(asset.name);
//   await env.stop();
//
// `estate: 'fresh'` mirrors a new production install: one org, two
// facilities, a handful of people, and every ID counter at zero — so the first
// asset is AST-1, exactly as after `npm run seed`. `estate: 'demo'` loads the
// prototype's fixture estate on top of the same people.
import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import { once } from 'node:events';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createServer } from 'node:net';
import { mkdtemp, rm } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import mongoose from 'mongoose';
import { MongoMemoryServer } from 'mongodb-memory-server';

export const PASSWORD = 'Sync-suite-password-1!';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/** The location tree every suite starts from. */
export const SCOPE = {
  org: { _id: 'ORG-1', name: 'Sync Test Org', level: 'org' },
  facA: { _id: 'FAC-A', name: 'Hyderabad Plant', level: 'facility', parentId: 'ORG-1' },
  bldA: { _id: 'BLD-A1', name: 'Plant Block 1', level: 'building', parentId: 'FAC-A' },
  facB: { _id: 'FAC-B', name: 'Pune Warehouse', level: 'facility', parentId: 'ORG-1' },
};

/** Personas: key → [display name, role, home scope]. */
export const PEOPLE = {
  admin: ['Asha Admin', 'super_admin', 'ORG-1'],
  orgadmin: ['Omar Orgadmin', 'org_admin', 'ORG-1'],
  fm: ['Farah Facility', 'facility_manager', 'FAC-A'],
  mm: ['Manoj Maintenance', 'maintenance_manager', 'FAC-A'],
  tech: ['Tara Technician', 'technician', 'FAC-A'],
  fmB: ['Bala Pune', 'facility_manager', 'FAC-B'],
  exec: ['Esha Executive', 'executive', 'ORG-1'],
  sec: ['Sam Security', 'security_officer', 'FAC-A'],
};

export const emailOf = (who) => `${who.toLowerCase()}@sync.test`;
export const nameOf = (who) => PEOPLE[who][0];

export async function startEnv({ estate = 'fresh', browser: withBrowser = true } = {}) {
  Object.assign(process.env, {
    DOTENV_CONFIG_PATH: '/dev/null', NODE_ENV: 'test', LOG_LEVEL: 'error',
    MONGODB_DB_NAME: `access_genie_sync_${estate}`, BCRYPT_ROUNDS: '4',
    JWT_ACCESS_SECRET: randomBytes(48).toString('hex'), JWT_REFRESH_SECRET: randomBytes(48).toString('hex'),
    COOKIE_SECURE: 'false', COOKIE_SAME_SITE: 'lax', API_PREFIX: '/api/v1',
    RATE_LIMIT_MAX: '100000', AUTH_RATE_LIMIT_MAX: '100000',
    MONGODB_SERVER_SELECTION_TIMEOUT_MS: '2000', SEED_PASSWORD: PASSWORD,
  });

  const database = await MongoMemoryServer.create({
    binary: { downloadDir: join(tmpdir(), 'access-genie-mongodb-binaries') },
    instance: { ip: '127.0.0.1' },
  });
  process.env.MONGODB_URI = database.getUri();
  const { connectDb } = await import('../../../backend/src/config/db.ts');
  await connectDb();
  const models = await import('../../../backend/src/models/index.ts');
  await Promise.all(Object.values(mongoose.models).map((model) => model.init()));

  if (estate === 'demo') {
    const { seedDemo } = await import('../../../backend/src/seed/demo.ts');
    await seedDemo({ skipConnect: true, fresh: true });
  }

  const { ScopeNodeModel, User, Technician, syncCounter } = models;
  for (const node of Object.values(SCOPE)) {
    await ScopeNodeModel.updateOne({ _id: node._id }, { $set: node }, { upsert: true });
  }
  let n = 0;
  for (const [who, [name, roleId, homeScopeId]] of Object.entries(PEOPLE)) {
    n += 1;
    await User.create({
      _id: `U-SYNC-${n}`, name, email: emailOf(who), passwordHash: PASSWORD,
      initials: name.split(' ').map((p) => p[0]).join('').slice(0, 3), roleId, homeScopeId, title: roleId,
    });
  }
  // The technician is also on the field roster, as an installation would have them.
  await Technician.create({
    _id: 'TECH-SYNC-1', name: nameOf('tech'), title: 'Field technician', department: 'Maintenance',
    location: { id: SCOPE.facA._id, name: SCOPE.facA.name }, shift: { label: 'Morning', start: 8, end: 17 },
    workingDays: ['Mon', 'Tue', 'Wed', 'Thu', 'Fri'], email: emailOf('tech'),
  });
  if (estate === 'fresh') await syncCounter('user', 1);

  const { createApp } = await import('../../../backend/src/app.ts');
  const server = createApp().listen(0, '127.0.0.1');
  await once(server, 'listening');
  const api = `http://127.0.0.1:${server.address().port}/api/v1`;

  const tokens = {};
  async function request(who, path, method = 'GET', body) {
    const response = await fetch(`${api}${path}`, {
      method,
      headers: { ...(tokens[who] ? { Authorization: `Bearer ${tokens[who]}` } : {}), 'Content-Type': 'application/json' },
      body: body === undefined ? undefined : JSON.stringify(body),
      signal: AbortSignal.timeout(20000),
    });
    const text = await response.text();
    let parsed = null;
    try { parsed = text ? JSON.parse(text) : null; } catch { parsed = { raw: text }; }
    return { status: response.status, body: parsed };
  }
  async function ok(who, path, method = 'GET', body, status) {
    const result = await request(who, path, method, body);
    const expected = status ?? (method === 'POST' ? [200, 201] : [200]);
    const accepted = Array.isArray(expected) ? expected : [expected];
    assert.ok(accepted.includes(result.status), `${method} ${path} as ${who} → ${result.status}: ${JSON.stringify(result.body)}`);
    return result.body?.data;
  }
  for (const who of Object.keys(PEOPLE)) {
    const auth = await ok(null, '/auth/login', 'POST', { email: emailOf(who), password: PASSWORD }, 200);
    tokens[who] = auth.accessToken;
  }

  const env = {
    api, models, tokens, request, ok, page: null, web: null,
    /** Poll a predicate until it holds. */
    async until(fn, label, timeout = 15000) {
      const t0 = Date.now();
      let last;
      while (Date.now() - t0 < timeout) {
        try { last = await fn(); if (last) return last; } catch (err) { last = err; }
        await sleep(200);
      }
      assert.fail(`Timed out: ${label}${last instanceof Error ? ` (${last.message})` : ''}`);
    },
  };

  let browser, vite, profile;
  if (withBrowser) {
    const { createServer: createViteServer } = await import('vite');
    const { default: react } = await import('@vitejs/plugin-react');
    const { default: tailwindcss } = await import('@tailwindcss/vite');
    const { Browser } = await import('../cdp.mjs');
    profile = await mkdtemp(join(tmpdir(), 'ag-sync-browser-'));
    vite = await createViteServer({
      configFile: false, envFile: false,
      root: fileURLToPath(new URL('../../../frontend', import.meta.url)), cacheDir: join(profile, 'vite-cache'),
      plugins: [react(), tailwindcss()],
      resolve: { alias: { '@': fileURLToPath(new URL('../../../frontend/src', import.meta.url)) } },
      define: { 'import.meta.env.VITE_API_URL': JSON.stringify('/api/v1') },
      server: { host: '127.0.0.1', port: 0, proxy: { '/api': { target: new URL(api).origin } } }, logLevel: 'error',
    });
    await vite.listen();
    env.web = `http://127.0.0.1:${vite.httpServer.address().port}`;
    const socket = createServer().listen(0, '127.0.0.1');
    await once(socket, 'listening');
    const port = socket.address().port;
    await new Promise((resolve) => socket.close(resolve));
    browser = await Browser.launch({ port, userDataDir: profile });
    env.page = await browser.page();
  }

  Object.assign(env, {
    /** Sign in through the real login form and wait for the workspace to load. */
    async login(who) {
      const page = env.page;
      await page.nav(`${env.web}/login`);
      await page.waitForSelector('#login-email');
      await page.fill('#login-email', emailOf(who));
      await page.fill('#login-password', PASSWORD);
      await page.eval(`document.querySelector('form').requestSubmit(); return true;`);
      await env.until(async () => !(await page.eval('return location.pathname')).startsWith('/login'), `${who} leaves the login page`);
      assert.ok(await page.waitForGate(), 'workspace gate clears after login');
    },
    /** Full page load (re-fetches everything) — what a browser refresh does. */
    async reload(path) {
      await env.page.nav(`${env.web}${path}`);
      assert.ok(await env.page.waitForGate(), `gate clears on ${path}`);
    },
    /**
     * Client-side navigation, the way clicking a link in the app moves between
     * screens. Caches survive, which is exactly what exposes stale data.
     */
    async go(path) {
      await env.page.eval(`history.pushState({}, '', ${JSON.stringify(path)}); window.dispatchEvent(new PopStateEvent('popstate', { state: {} })); return true;`);
      await env.until(async () => (await env.page.eval('return location.pathname + location.search')) === path, `navigate to ${path}`);
      assert.ok(await env.page.waitForGate(), `gate clears on ${path}`);
      await sleep(400);
    },
    async text() { return env.page.text(); },
    async expectText(text, timeout = 12000) {
      const found = await env.page.waitForText(text, timeout);
      if (!found) {
        const body = (await env.page.text()).slice(0, 1500);
        assert.fail(`Expected "${text}" on ${await env.page.eval('return location.pathname')}. Page text starts:\n${body}`);
      }
    },
    async expectNoText(text, wait = 1500) {
      await sleep(wait);
      const body = await env.page.text();
      assert.ok(!body.includes(text), `Did not expect "${text}" on ${await env.page.eval('return location.pathname')}`);
    },
    /** Index of each needle in the page text — for asserting display order. */
    async positions(...needles) {
      const body = await env.page.text();
      return needles.map((n) => body.indexOf(n));
    },
    async stop() {
      if (env.page) await env.page.close();
      if (browser) await browser.close();
      if (vite) await vite.close();
      if (profile) await rm(profile, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
      server.closeAllConnections();
      await new Promise((resolve) => server.close(resolve));
      await mongoose.disconnect();
      await database.stop();
    },
  });
  return env;
}

/** A minimal valid asset body for POST /assets. */
export function assetBody(name, overrides = {}) {
  return {
    name, category: 'Compute',
    location: { id: SCOPE.facA._id, name: SCOPE.facA.name },
    custodian: 'Unassigned', purchasePrice: 1000, ...overrides,
  };
}
