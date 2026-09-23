// Self-contained regression suite. Never reads backend/.env or a running API.
// The only database is a fresh loopback MongoDB owned and stopped by this run.
import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';
import { randomBytes } from 'node:crypto';
import { once } from 'node:events';
import { createServer } from 'node:net';
import { spawn } from 'node:child_process';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { mkdtemp, rm } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import mongoose from 'mongoose';
import { MongoMemoryServer } from 'mongodb-memory-server';
import { ApiRequestError, toApiError } from '../../frontend/src/api/errors.ts';
import { canAccessRoute } from '../../frontend/src/app/route-access.ts';

let database;
let server;
let api;
let models;
const tokens = {};
const password = 'Stage2-test-password!';
const fixtureAsset = (id, location, value) => ({
  _id: id, name: `Fixture ${id}`, category: 'Compute', location: { id: location, name: location },
  custodian: 'Fixture owner', purchaseDate: new Date('2025-01-01'), purchasePrice: value,
  bookValue: value, healthScore: value === 100 ? 80 : 20, lifecycleStage: 'Available',
  warrantyExpiry: new Date(Date.now() + 10 * 86400000),
});
const fixtureTransition = (id, assetId) => ({
  _id: id, assetId, assetName: `Fixture ${assetId}`, fromStage: 'Available', toStage: 'Retired',
  reason: 'Fixture retirement', requester: 'Fixture requester', status: 'Pending',
  approvals: [{ role: 'org_admin', status: 'Pending' }],
});

async function request(who, path, method = 'GET', body) {
  const response = await fetch(`${api}${path}`, {
    method,
    headers: { ...(tokens[who] ? { Authorization: `Bearer ${tokens[who]}` } : {}), 'Content-Type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
    signal: AbortSignal.timeout(15000),
  });
  return { status: response.status, body: await response.json() };
}
async function ok(who, path, method, body, status = 200) {
  const result = await request(who, path, method, body);
  assert.equal(result.status, status, JSON.stringify(result.body));
  return result.body.data;
}

before(async () => {
  // Deliberately override caller-provided connection/credential settings.
  Object.assign(process.env, {
    DOTENV_CONFIG_PATH: '/dev/null', NODE_ENV: 'test', LOG_LEVEL: 'error',
    MONGODB_DB_NAME: 'access_genie_stabilization', BCRYPT_ROUNDS: '4',
    JWT_ACCESS_SECRET: randomBytes(48).toString('hex'), JWT_REFRESH_SECRET: randomBytes(48).toString('hex'),
    COOKIE_SECURE: 'false', COOKIE_SAME_SITE: 'lax', API_PREFIX: '/api/v1',
    RATE_LIMIT_MAX: '10000', AUTH_RATE_LIMIT_MAX: '10000',
    MONGODB_SERVER_SELECTION_TIMEOUT_MS: '100',
  });
  database = await MongoMemoryServer.create({
    binary: { downloadDir: join(tmpdir(), 'access-genie-mongodb-binaries') },
    instance: { ip: '127.0.0.1' },
  });
  process.env.MONGODB_URI = database.getUri();
  const { connectDb } = await import('../../backend/src/config/db.ts');
  await connectDb();
  models = await import('../../backend/src/models/index.ts');
  await Promise.all(Object.values(mongoose.models).map((model) => model.init()));
  const { ScopeNodeModel, User, Asset, RoleGrant, LifecycleTransition, PmSchedule } = models;
  await ScopeNodeModel.create([
    { _id: 'ORG', name: 'Test organization', level: 'org' },
    { _id: 'FA', name: 'Facility A', level: 'facility', parentId: 'ORG' },
    { _id: 'BA', name: 'Building A', level: 'building', parentId: 'FA' },
    { _id: 'FB', name: 'Facility B', level: 'facility', parentId: 'ORG' },
    { _id: 'EMPTY', name: 'Empty facility', level: 'facility', parentId: 'ORG' },
  ]);
  await RoleGrant.create([
    { _id: 'facility_manager', updatedAt: new Date(), modules: ['workspace', 'assets'], actions: { assets: ['view'] } },
    { _id: 'security_officer', updatedAt: new Date(), modules: ['workspace'] },
    { _id: 'executive', updatedAt: new Date(), modules: ['workspace', 'assets'] },
  ]);
  for (const [id, roleId, homeScopeId] of [
    ['admin', 'super_admin', 'ORG'], ['operator', 'org_admin', 'FA'],
    ['approver', 'org_admin', 'FA'], ['foreign', 'org_admin', 'FB'],
    ['reader', 'facility_manager', 'FA'], ['denied', 'security_officer', 'FA'],
    ['finance', 'executive', 'FA'], ['financeExtra', 'executive', 'FA'],
    ['extra', 'security_officer', 'FA'],
  ]) {
    await User.create({ _id: id, name: id, email: `${id}@stage2.test`, passwordHash: password,
      initials: id.slice(0, 2), roleId, homeScopeId, title: 'Test user',
      extraModules: ['extra', 'financeExtra'].includes(id) ? ['assets'] : [] });
  }
  await Asset.create([fixtureAsset('AST-A', 'BA', 100), fixtureAsset('AST-B', 'FB', 900)]);
  await LifecycleTransition.create([fixtureTransition('LTX-A', 'AST-A'), fixtureTransition('LTX-B', 'AST-B')]);
  for (const assetId of ['AST-A', 'AST-B']) {
    await PmSchedule.create({ _id: `PM-${assetId}`, title: 'Due schedule', assetId, assetName: assetId,
      frequency: 'Monthly', type: 'Preventive', nextDue: new Date(Date.now() - 10000),
      lastDone: new Date('2025-01-01'), estHours: 1, compliancePct: 100, assignedTeam: 'Fixture' });
  }
  const { createApp } = await import('../../backend/src/app.ts');
  server = createApp().listen(0, '127.0.0.1');
  await once(server, 'listening');
  api = `http://127.0.0.1:${server.address().port}/api/v1`;
  for (const id of ['admin', 'operator', 'approver', 'foreign', 'reader', 'denied', 'finance', 'financeExtra', 'extra']) {
    const auth = await ok(null, '/auth/login', 'POST', { email: `${id}@stage2.test`, password });
    tokens[id] = auth.accessToken;
  }
}, { timeout: 120000 });

after(async () => {
  if (server) { server.closeAllConnections(); await new Promise((resolve) => server.close(resolve)); }
  await mongoose.disconnect();
  if (database) await database.stop();
});

test('lifecycle board respects descendants, explicit selection and empty scopes', async () => {
  for (const [who, query, count, value] of [
    ['operator', '', 1, 100], ['admin', '', 2, 1000],
    ['admin', '?scope=FA', 1, 100], ['admin', '?scope=EMPTY', 0, 0],
  ]) {
    const rows = await ok(who, `/assets/lifecycle/board${query}`);
    assert.equal(rows.reduce((sum, row) => sum + row.total, 0), count);
    assert.equal(rows.reduce((sum, row) => sum + row.totalValue, 0), value);
  }
});

test('lifecycle KPIs restrict assets, maintenance and approval records to the same scope', async () => {
  const own = await ok('operator', '/assets/lifecycle/kpis');
  assert.equal(own.portfolioValue, 100);
  assert.equal(own.awaitingAssignment, 1);
  assert.equal(own.maintenanceDue, 1);
  assert.equal(own.requiringApproval, 1);
  assert.equal(own.warrantyExpiring, 1);
  assert.equal(own.avgHealth, 80);
  const empty = await ok('admin', '/assets/lifecycle/kpis?scope=EMPTY');
  for (const value of Object.values(empty)) assert.equal(value, 0);
});

test('a caller cannot widen lifecycle scope by naming another facility', async () => {
  assert.equal((await request('operator', '/assets/lifecycle/board?scope=FB')).status, 403);
});

test('foreign and nonexistent history and clone records are indistinguishable', async () => {
  for (const suffix of ['lifecycle', 'clone-source']) {
    const own = await ok('operator', `/assets/AST-A/${suffix}`);
    assert.ok(own);
    const foreign = await request('operator', `/assets/AST-B/${suffix}`);
    const absent = await request('operator', `/assets/AST-MISSING/${suffix}`);
    assert.equal(foreign.status, 404);
    assert.equal(absent.status, 404);
    assert.deepEqual(foreign.body.error, absent.body.error);
    assert.equal((await request('admin', `/assets/AST-B/${suffix}?scope=FA`)).status, 404);
  }
});

test('foreign lifecycle request leaves asset and history unchanged', async () => {
  const beforeCount = await models.LifecycleTransition.countDocuments({ assetId: 'AST-B' });
  const result = await request('operator', '/assets/AST-B/lifecycle/transition', 'POST', {
    toStage: 'Assigned / In Service', reason: 'Unauthorized move',
  });
  assert.equal(result.status, 404);
  assert.equal((await models.Asset.findById('AST-B')).lifecycleStage, 'Available');
  assert.equal(await models.LifecycleTransition.countDocuments({ assetId: 'AST-B' }), beforeCount);
});

test('foreign approval and rejection cannot modify a pending request or asset', async () => {
  for (const decision of ['Approved', 'Rejected']) {
    assert.equal((await request('operator', '/assets/lifecycle/transitions/LTX-B/decide', 'POST', { decision })).status, 404);
    assert.equal((await models.LifecycleTransition.findById('LTX-B')).status, 'Pending');
    assert.equal((await models.Asset.findById('AST-B')).lifecycleStage, 'Available');
  }
});

test('mixed-scope bulk transition changes only authorized records and persists history', async () => {
  await models.Asset.create(fixtureAsset('AST-BULK', 'BA', 100));
  const result = await ok('operator', '/assets/lifecycle/bulk-transition', 'POST', {
    ids: ['AST-BULK', 'AST-B', 'AST-MISSING'], toStage: 'Assigned / In Service', reason: 'Bulk assignment',
  });
  assert.deepEqual(result.updated, ['AST-BULK']);
  assert.deepEqual(result.failed.map((row) => row.id), ['AST-B', 'AST-MISSING']);
  assert.equal((await models.Asset.findById('AST-BULK')).lifecycleStage, 'Assigned / In Service');
  assert.equal((await models.Asset.findById('AST-B')).lifecycleStage, 'Available');
  assert.equal((await ok('operator', '/assets/AST-BULK/lifecycle'))[0].toStage, 'Assigned / In Service');
});

test('authorized approval persists the stage, while self-approval and repeat decisions are refused', async () => {
  await models.Asset.create(fixtureAsset('AST-APPROVE', 'BA', 100));
  const pending = await ok('operator', '/assets/AST-APPROVE/lifecycle/transition', 'POST', {
    toStage: 'Retired', reason: 'Retirement request',
  }, 202);
  const path = `/assets/lifecycle/transitions/${pending.transition.id}/decide`;
  assert.equal((await request('operator', path, 'POST', { decision: 'Approved' })).status, 403);
  await ok('approver', path, 'POST', { decision: 'Approved' });
  assert.equal((await models.Asset.findById('AST-APPROVE')).lifecycleStage, 'Retired');
  assert.equal((await models.LifecycleTransition.findById(pending.transition.id)).status, 'Approved');
  assert.equal((await request('approver', path, 'POST', { decision: 'Approved' })).status, 400);
});

test('read-only action grants deny both creation entry points without inserting records', async () => {
  const count = await models.Asset.countDocuments();
  for (const path of ['/assets', '/assets/registration']) {
    assert.equal((await request('reader', path, 'POST', {})).status, 403);
  }
  assert.equal(await models.Asset.countDocuments(), count);
  assert.equal((await request('reader', '/assets')).status, 200);
});

test('read-only action overrides cannot request, bulk-change or approve lifecycle stages', async () => {
  for (const [path, body] of [
    ['/assets/AST-A/lifecycle/transition', { toStage: 'Assigned / In Service', reason: 'Denied move' }],
    ['/assets/lifecycle/bulk-transition', { ids: ['AST-A'], toStage: 'Assigned / In Service', reason: 'Denied bulk' }],
    ['/assets/lifecycle/transitions/LTX-A/decide', { decision: 'Approved' }],
  ]) assert.equal((await request('reader', path, 'POST', body)).status, 403);
  assert.equal((await models.Asset.findById('AST-A')).lifecycleStage, 'Available');
  assert.equal((await models.LifecycleTransition.findById('LTX-A')).status, 'Pending');
});

test('finance retains disposal approval when granted Assets but cannot edit or approve other stages', async () => {
  await models.Asset.create({ ...fixtureAsset('AST-DISPOSE', 'BA', 100), lifecycleStage: 'Retired' });
  const pending = await ok('operator', '/assets/AST-DISPOSE/lifecycle/transition', 'POST', {
    toStage: 'Disposed', reason: 'Approved disposal plan',
  }, 202);
  await ok('finance', `/assets/lifecycle/transitions/${pending.transition.id}/decide`, 'POST', { decision: 'Approved' });
  assert.equal((await models.Asset.findById('AST-DISPOSE')).lifecycleStage, 'Disposed');
  assert.equal((await request('finance', '/assets/lifecycle/transitions/LTX-A/decide', 'POST', { decision: 'Approved' })).status, 403);
  assert.equal((await request('finance', '/assets/AST-A/lifecycle/transition', 'POST', {
    toStage: 'Assigned / In Service', reason: 'Not permitted',
  })).status, 403);
  // An explicit action override must still be able to withdraw finance approval.
  await models.RoleGrant.updateOne({ _id: 'executive' }, { $set: { actions: { assets: ['view'] } } });
  assert.equal((await request('finance', '/assets/lifecycle/transitions/LTX-A/decide', 'POST', { decision: 'Rejected' })).status, 403);
});

test('per-user module grants retain action defaults without expanding another user’s access', async () => {
  const created = await ok('extra', '/assets/registration', 'POST', {
    source: 'blank', values: { name: 'Extra grant asset', category: 'Compute', facilityId: 'FA' },
  }, 201);
  assert.equal((await models.Asset.findById(created.id)).name, 'Extra grant asset');
  assert.equal((await request('denied', '/assets/registration', 'POST', {})).status, 403);

  // Without a role-level Assets grant, only the explicitly granted finance user
  // can still exercise the documented disposal-approval action.
  await models.RoleGrant.deleteOne({ _id: 'executive' });
  const { invalidateRoleGrants } = await import('../../backend/src/services/roleGrant.service.ts');
  invalidateRoleGrants();
  await models.Asset.create({ ...fixtureAsset('AST-EXTRA-DISPOSE', 'BA', 100), lifecycleStage: 'Retired' });
  const pending = await ok('operator', '/assets/AST-EXTRA-DISPOSE/lifecycle/transition', 'POST', {
    toStage: 'Disposed', reason: 'Finance disposal request',
  }, 202);
  const path = `/assets/lifecycle/transitions/${pending.transition.id}/decide`;
  assert.equal((await request('finance', path, 'POST', { decision: 'Approved' })).status, 403);
  await ok('financeExtra', path, 'POST', { decision: 'Approved' });
  assert.equal((await models.Asset.findById('AST-EXTRA-DISPOSE')).lifecycleStage, 'Disposed');
});

test('missing module and missing/invalid token are denied on the repaired routes', async () => {
  tokens.invalid = 'invalid-token';
  for (const path of ['/assets/lifecycle/board', '/assets/lifecycle/kpis', '/assets/AST-A/clone-source']) {
    assert.equal((await request('denied', path)).status, 403);
    assert.equal((await request(null, path)).status, 401);
    assert.equal((await request('invalid', path)).status, 401);
  }
});

test('registration cannot reference a foreign clone source even when values are supplied directly', async () => {
  const count = await models.Asset.countDocuments();
  const result = await request('operator', '/assets/registration', 'POST', {
    source: 'clone', cloneOfId: 'AST-B', values: { name: 'Foreign clone', category: 'Compute', facilityId: 'FA' },
  });
  assert.equal(result.status, 404);
  assert.equal(await models.Asset.countDocuments(), count);
});

test('authorized registration persists and can be read again by API and database', async () => {
  const created = await ok('operator', '/assets/registration', 'POST', {
    source: 'blank', values: { name: 'Stage 2 registration', category: 'Compute', facilityId: 'FA' },
  }, 201);
  assert.equal((await ok('operator', `/assets/${created.id}`)).name, 'Stage 2 registration');
  assert.equal((await models.Asset.findById(created.id)).location.id, 'FA');
  assert.equal((await request('foreign', `/assets/${created.id}`)).status, 404);
});

test('configured database retains records across application reconnects', async () => {
  await mongoose.disconnect();
  const { connectDb } = await import('../../backend/src/config/db.ts');
  await connectDb();
  assert.equal((await models.Asset.findById('AST-A')).name, 'Fixture AST-A');
  assert.equal((await request('operator', '/assets/AST-A')).status, 200);
});

test('unavailable configured database fails without creating or seeding a fallback', async () => {
  const socket = createServer().listen(0, '127.0.0.1');
  await once(socket, 'listening');
  const port = socket.address().port;
  await new Promise((resolve) => socket.close(resolve));
  const child = spawn(process.execPath, ['--import', 'tsx', '--input-type=module', '-e', `
    import {connectDb, dbStatus, disconnectDb} from './backend/src/config/db.ts';
    try { await connectDb(); process.exitCode = 2; }
    catch (error) {
      if (dbStatus().ready || !error.message.includes('configured MongoDB')) process.exitCode = 3;
      else console.log('EXPECTED_DATABASE_FAILURE');
    } finally { await disconnectDb(); }
  `], { env: { ...process.env, MONGODB_URI: `mongodb://127.0.0.1:${port}`, MONGODB_SERVER_SELECTION_TIMEOUT_MS: '100' }, stdio: ['ignore', 'pipe', 'pipe'] });
  let output = '';
  child.stdout.on('data', (data) => { output += data; });
  child.stderr.on('data', (data) => { output += data; });
  const timer = setTimeout(() => child.kill('SIGKILL'), 15000);
  const [code] = await once(child, 'exit');
  clearTimeout(timer);
  assert.equal(code, 0, output);
  assert.match(output, /EXPECTED_DATABASE_FAILURE/);
  assert.doesNotMatch(output, /Seeding|in-memory MongoDB server running/);
});

test('API errors preserve validation details and request IDs', () => {
  const result = toApiError({ response: { status: 422, data: {
    success: false, error: { code: 'VALIDATION_ERROR', message: 'Invalid input', details: [
      { path: 'name', message: 'Required' }, null, 'bad detail', { path: 1 },
    ] }, requestId: 'request-test',
  } } });
  assert.ok(result instanceof ApiRequestError);
  assert.equal(result.status, 422);
  assert.equal(result.code, 'VALIDATION_ERROR');
  assert.equal(result.requestId, 'request-test');
  assert.deepEqual(result.fieldErrors, { name: 'Required' });
});

test('gateway HTML, malformed JSON and absent responses produce safe errors', () => {
  for (const data of ['<html>Bad gateway</html>', { message: 'Bad gateway' }, { success: false },
    { success: false, error: null }, { success: true }, [], null, undefined]) {
    const result = toApiError({ response: { status: 502, data } });
    assert.equal(result.code, 'NETWORK_ERROR');
    assert.equal(result.status, 502);
  }
  assert.equal(toApiError({}).code, 'NETWORK_ERROR');
  for (const code of ['ETIMEDOUT', 'ECONNABORTED']) assert.equal(toApiError({ code }).code, 'TIMEOUT');
  const malformedDetails = toApiError({ response: { status: 400, data: {
    success: false, error: { code: 'BAD_REQUEST', message: 'Invalid', details: {} },
  } } });
  assert.deepEqual(malformedDetails.fieldErrors, {});
});

test('direct-route policy blocks restricted modules and preserves shared/personal workflows', () => {
  for (const path of ['/assets', '/ASSETS', '/%61ssets', '/assets/AST-A/edit', '/tracking/twin/site', '/admin/users', '/ai/models/1', '/reports/builder']) {
    assert.equal(canAccessRoute(path, ['workspace']), false, path);
  }
  for (const [path, modules] of [
    ['/assets/AST-A', ['assets']], ['/my-work', ['maintenance']], ['/my-work', ['assets']],
    ['/custody/AST-A', ['compliance']], ['/admin/api-keys', ['system']],
    ['/settings/security', []], ['/notifications', []], ['/approvals', []],
  ]) assert.equal(canAccessRoute(path, modules), true, path);
});

// Opt-in because CI environments may not have Chrome. This still owns its API,
// database, Vite server and browser profile; it cannot target a deployed estate.
test('browser: recovery, direct URL denial and permitted navigation', {
  skip: process.env.AG_STAGE2_BROWSER !== '1', timeout: 90000,
}, async (t) => {
  const { createServer: createViteServer } = await import('vite');
  const { default: react } = await import('@vitejs/plugin-react');
  const { default: tailwindcss } = await import('@tailwindcss/vite');
  const { Browser } = await import('./cdp.mjs');
  const profile = await mkdtemp(join(tmpdir(), 'ag-stage2-browser-'));
  let vite, browser, page;
  let simulateGatewayFailure = false;
  try {
    vite = await createViteServer({
      configFile: false, envFile: false,
      root: fileURLToPath(new URL('../../frontend', import.meta.url)),
      cacheDir: join(profile, 'vite-cache'),
      plugins: [react(), tailwindcss(), {
        name: 'stage2-gateway-failure',
        configureServer(devServer) {
          devServer.middlewares.use((req, res, next) => {
            if (!simulateGatewayFailure || req.url !== '/api/v1/auth/login') return next();
            res.statusCode = 502;
            res.setHeader('Content-Type', 'text/html');
            res.end('<html>Bad gateway</html>');
          });
        },
      }],
      resolve: { alias: { '@': fileURLToPath(new URL('../../frontend/src', import.meta.url)) } },
      define: { 'import.meta.env.VITE_API_URL': JSON.stringify('/api/v1') },
      server: { host: '127.0.0.1', port: 0, proxy: { '/api': { target: new URL(api).origin } } },
      logLevel: 'error',
    });
    await vite.listen();
    const web = `http://127.0.0.1:${vite.httpServer.address().port}`;
    const socket = createServer().listen(0, '127.0.0.1');
    await once(socket, 'listening');
    const port = socket.address().port;
    await new Promise((resolve) => socket.close(resolve));
    browser = await Browser.launch({ port, userDataDir: profile });
    page = await browser.page();

    await t.test('password recovery shows the supported path and no false send action', async () => {
      await page.nav(`${web}/forgot-password`);
      assert.ok(await page.waitForText('Recover your account'));
      const text = await page.text();
      assert.match(text, /Contact your organization administrator/);
      assert.doesNotMatch(text, /reset link is on|Check your email|Send reset link/);
      assert.equal(await page.eval('return document.querySelectorAll("form").length'), 0);
    });

    await t.test('gateway HTML produces a recoverable login error instead of a JavaScript crash', async () => {
      await page.nav(`${web}/login`);
      assert.ok(await page.waitForSelector('#login-email'));
      await page.fill('#login-email', 'denied@stage2.test');
      await page.fill('#login-password', password);
      simulateGatewayFailure = true;
      try {
        await page.click('button[type="submit"]');
        assert.ok(await page.waitForText('Cannot reach the Access Genie API'), await page.text());
        assert.deepEqual(page.pageErrors, []);
      } finally { simulateGatewayFailure = false; }
    });

    await t.test('restricted user can sign in, but direct asset/admin/tracking URLs are denied', async () => {
      await page.nav(`${web}/login`);
      assert.ok(await page.waitForSelector('#login-email'));
      await page.fill('#login-email', 'denied@stage2.test');
      await page.fill('#login-password', password);
      await page.click('button[type="submit"]');
      assert.ok(await page.waitForSelector('#main', 30000));
      for (const path of ['/assets', '/ASSETS', '/%61ssets', '/admin/users', '/tracking']) {
        const start = page.responses.length;
        await page.nav(`${web}${path}`);
        assert.ok(await page.waitForText('You do not have access to this module'), await page.text());
        assert.equal(await page.eval('return !!document.querySelector("#main")'), true);
        assert.equal(page.responses.slice(start).some((r) => r.url.includes('/tracking/workspace')), false);
      }
      await page.nav(`${web}/settings/profile`);
      assert.ok(await page.waitForText('Profile'));
      assert.doesNotMatch(await page.text(), /You do not have access/);
    });

    await t.test('authorized user can reopen the asset registry after a full reload', async () => {
      await page.eval(`return fetch('/api/v1/auth/logout', {method:'POST', credentials:'include'})`);
      await page.nav(`${web}/login`);
      assert.ok(await page.waitForSelector('#login-email'));
      await page.fill('#login-email', 'operator@stage2.test');
      await page.fill('#login-password', password);
      await page.click('button[type="submit"]');
      assert.ok(await page.waitForSelector('#main', 30000));
      await page.nav(`${web}/assets`);
      assert.ok(await page.waitForText('Stage 2 registration'), await page.text());
      assert.doesNotMatch(await page.text(), /You do not have access/);
      assert.deepEqual(page.pageErrors, []);
    });
  } finally {
    page?.ws.close();
    if (browser) await browser.close();
    if (vite) await vite.close();
    await rm(profile, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
  }
});
