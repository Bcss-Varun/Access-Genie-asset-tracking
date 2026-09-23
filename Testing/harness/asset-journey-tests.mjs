// Self-contained regression suite. Never reads backend/.env or a running API.
// The only database is a fresh loopback MongoDB owned and stopped by this run.
import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';
import { randomBytes } from 'node:crypto';
import { once } from 'node:events';
import { createServer } from 'node:net';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import mongoose from 'mongoose';
import { MongoMemoryServer } from 'mongodb-memory-server';

let database;
let server;
let api;
let models;
let browser, page, vite, profile, web;
const faults = { path: null, status: 502, delay: 0, method: null, skip: 0, hits: 0 };
let registeredId;
const tokens = {};
const password = 'Stage3-test-password!';
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
    MONGODB_DB_NAME: 'access_genie_asset_journey', BCRYPT_ROUNDS: '4',
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
    await User.create({ _id: id, name: id, email: `${id}@stage3.test`, passwordHash: password,
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
    const auth = await ok(null, '/auth/login', 'POST', { email: `${id}@stage3.test`, password });
    tokens[id] = auth.accessToken;
  }
  const { createServer: createViteServer } = await import('vite');
  const { default: react } = await import('@vitejs/plugin-react');
  const { default: tailwindcss } = await import('@tailwindcss/vite');
  const { Browser } = await import('./cdp.mjs');
  profile = await mkdtemp(join(tmpdir(), 'ag-stage3-browser-'));
  vite = await createViteServer({
    configFile: false, envFile: false,
    root: fileURLToPath(new URL('../../frontend', import.meta.url)), cacheDir: join(profile, 'vite-cache'),
    plugins: [react(), tailwindcss(), { name: 'stage3-faults', configureServer(devServer) {
      devServer.middlewares.use((req, res, next) => {
        if (!faults.path || !req.url?.startsWith(faults.path) || (faults.method && req.method !== faults.method)) return next();
        if (faults.hits++ < faults.skip) return next();
        if (faults.delay) return setTimeout(next, faults.delay);
        res.statusCode = faults.status;
        res.setHeader('Content-Type', 'application/json');
        res.end(JSON.stringify({ success: false, error: { code: 'TEST_FAILURE', message: 'Temporary test failure. Please retry.' } }));
      });
    } }],
    resolve: { alias: { '@': fileURLToPath(new URL('../../frontend/src', import.meta.url)) } },
    define: { 'import.meta.env.VITE_API_URL': JSON.stringify('/api/v1') },
    server: { host: '127.0.0.1', port: 0, proxy: { '/api': { target: new URL(api).origin } } }, logLevel: 'error',
  });
  await vite.listen();
  web = `http://127.0.0.1:${vite.httpServer.address().port}`;
  const socket = createServer().listen(0, '127.0.0.1');
  await once(socket, 'listening');
  const port = socket.address().port;
  await new Promise((resolve) => socket.close(resolve));
  browser = await Browser.launch({ port, userDataDir: profile });
  page = await browser.page();
}, { timeout: 120000 });

after(async () => {
  if (page) console.log('Uncaught browser errors:', JSON.stringify(page.pageErrors));
  page?.ws.close();
  if (browser) await browser.close();
  if (vite) await vite.close();
  if (server) { server.closeAllConnections(); await new Promise((resolve) => server.close(resolve)); }
  await mongoose.disconnect();
  if (database) await database.stop();
  if (profile) await rm(profile, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
});

async function until(check, message, timeout = 10000) {
  const deadline = Date.now() + timeout;
  while (Date.now() < deadline) {
    if (await check()) return;
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  assert.fail(message + ': ' + (await page.text()).slice(-1500));
}
async function clickText(text) {
  const clicked = await page.eval(`const elements = [...document.querySelectorAll('button,a')]; const el = elements.find(e => e.textContent.trim() === ${JSON.stringify(text)}) ?? elements.find(e => e.textContent.trim().includes(${JSON.stringify(text)})); if (!el || el.disabled) return false; el.click(); return true;`);
  assert.ok(clicked, `Clickable action: ${text}`);
}
async function visit(path, text) {
  await page.nav(web + path);
  assert.ok(await page.waitForText(text, 10000), await page.text());
}
async function login(who = 'operator') {
  await page.eval(`return fetch('/api/v1/auth/logout', {method:'POST',credentials:'include'})`);
  await visit('/login', 'Work email');
  await page.fill('#login-email', `${who}@stage3.test`);
  await page.fill('#login-password', password);
  await page.click('button[type="submit"]');
  // Cold Vite transforms can exceed the generic 20-second selector timeout.
  assert.ok(await page.waitForSelector('#main', 30000));
}

test('sign in, dashboard and registry are navigable', async () => {
  await visit('/login', 'Work email');
  await login();
  await visit('/assets', 'Fixture AST-A');
  assert.doesNotMatch(await page.text(), /Fixture AST-B/);
});

test('blank registration validates, prevents duplicate submits, persists and opens detail', async () => {
  await visit('/assets/new?source=blank', 'Asset name');
  await page.fill('#f-name', 'Journey laptop');
  await page.fill('#f-category', 'Compute');
  await page.fill('#f-facilityId', 'FA');
  await clickText('Review & register');
  await until(() => page.eval(`return [...document.querySelectorAll('button')].some(e => e.textContent.trim() === 'Register asset' && !e.disabled)`), 'Registration should become valid');
  faults.path = '/api/v1/assets/registration/validate'; faults.delay = 300;
  try {
    await page.eval(`const b = [...document.querySelectorAll('button')].find(e => e.textContent.trim() === 'Register asset'); b.click(); b.click();`);
    await until(async () => (await models.Asset.countDocuments({name:'Journey laptop'})) > 0, 'Asset must persist');
    await until(() => page.eval(`return location.pathname.startsWith('/assets/') && !location.pathname.endsWith('/new')`), 'Navigate to detail');
    registeredId = (await models.Asset.findOne({name:'Journey laptop'}))._id;
    assert.equal(await models.Asset.countDocuments({name:'Journey laptop'}), 1, 'A repeated submit must not create two records');
    await visit(`/assets/${registeredId}`, 'Journey laptop');
    await page.shot('stage3-asset-desktop');
  } finally { faults.path = null; faults.delay = 0; }
});

test('editing a tag and submitting by keyboard persists the draft tag', async () => {
  await visit(`/assets/${registeredId}/edit`, 'Save Changes');
  await page.fill('#f-tags', 'journey-tag');
  await page.fill('#f-price', '2500');
  await page.fill('#f-manufacturer', 'Journey maker');
  await page.fill('#f-warranty', '2027-01-01');
  await page.eval('document.querySelector("form").requestSubmit();');
  await until(() => page.eval(`return !location.pathname.endsWith('/edit')`), 'Edit should save');
  const saved = await models.Asset.findById(registeredId).lean();
  assert.ok(saved.tags.includes('journey-tag'));
  assert.equal(saved.onboarding.commercial.purchasePrice, 2500);
  assert.equal(saved.purchasePrice, 2500);
  await visit(`/assets/${registeredId}/edit`, 'Save Changes');
  assert.equal(await page.eval('return document.querySelector("#f-price").value'), '2500');
  await page.fill('#f-manufacturer', ''); await page.fill('#f-warranty', '');
  await page.eval('document.querySelector("form").requestSubmit();');
  await until(() => page.eval(`return !location.pathname.endsWith('/edit')`), 'Cleared fields should save');
  const cleared = await models.Asset.findById(registeredId).lean();
  assert.equal(cleared.manufacturer, ''); assert.equal(cleared.warrantyExpiry, undefined);
  assert.equal(cleared.onboarding.commercial.warrantyEnd, undefined);
});

test('asset detail tab responds to browser back navigation', async () => {
  await visit(`/assets/${registeredId}?tab=overview`, 'Journey laptop');
  await clickText('Financials');
  await until(() => page.eval(`return location.search.includes('financials')`), 'Financial tab URL');
  await page.eval('history.back();');
  await until(() => page.eval(`return location.search.includes('overview')`), 'Back must restore previous tab');
});

test('import opens a real file picker instead of substituting sample records', async () => {
  await visit('/assets/import', 'Bulk Import Assets');
  assert.ok(await page.eval('return !!document.querySelector("input[type=file]")'), 'CSV upload control must exist');
});

test('failed lifecycle save keeps the entered reason available for retry', async () => {
  await visit(`/assets/${registeredId}`, 'Journey laptop');
  await page.eval(`const b = [...document.querySelectorAll('button')].find(e => e.textContent.includes('More')); b?.click();`);
  await clickText('Change Stage');
  assert.ok(await page.waitForSelector('[role=dialog] textarea'));
  await page.fill('[role=dialog] textarea', 'Journey commissioning complete');
  faults.path = `/api/v1/assets/${registeredId}/lifecycle/transition`;
  try {
    await clickText('Change stage');
    assert.ok(await page.waitForText('Temporary test failure', 6000));
    assert.equal(await page.eval(`return document.querySelector('[role=dialog] textarea')?.value`), 'Journey commissioning complete');
  } finally { faults.path = null; }
  await clickText('Change stage');
  await until(async () => (await models.Asset.findById(registeredId)).lifecycleStage === 'Available', 'Retry must apply commissioning');
});

async function uploadCsv(name, contents) {
  const path = join(profile, name);
  await writeFile(path, contents);
  const { root } = await page.send('DOM.getDocument');
  const { nodeId } = await page.send('DOM.querySelector', { nodeId: root.nodeId, selector: 'input[type=file]' });
  await page.send('DOM.setFileInputFiles', { nodeId, files: [path] });
}

test('CSV parser preserves quoted content and rejects malformed records', async () => {
  const { parseAssetCsv } = await import('../../frontend/src/lib/csv.ts');
  assert.deepEqual(parseAssetCsv('\uFEFFName,Category\r\n"Laptop, ""Pro""\nEdition",Compute\r\n'), { headers:['Name','Category'], rows:[['Laptop, "Pro"\nEdition','Compute']] });
  for (const input of ['', 'Name,Name\nA,B', 'Name,Category\n"unfinished,Compute', 'Name,Category\nA,B,C', 'Name,Category\n"A"bad,Compute']) assert.throws(() => parseAssetCsv(input));
});

test('real CSV upload validates rows, preserves mapped status, and retries only failed writes', async () => {
  await visit('/assets/import', 'Bulk Import Assets');
  await uploadCsv('broken.csv', 'Name,Category\n"unterminated,Compute');
  assert.ok(await page.waitForText('not closed'));
  await uploadCsv('journey.csv', 'Name,Category,Serial,Purchase Price,Status\n"Imported, laptop",Compute,CSV-01,300,Active\nImported spare,Compute,CSV-02,100,Staging\nBad price,Compute,CSV-03,-50,Active\nBad category,Unknown,CSV-04,10,Active\n');
  assert.ok(await page.waitForText('4 rows'));
  await clickText('Next →');
  assert.equal(await page.eval(`return document.querySelector('select[aria-label="Destination site"]').value`), 'FA');
  await clickText('Next →');
  assert.ok(await page.waitForText('2 errors'));
  await clickText('Next →');
  faults.path = '/api/v1/assets'; faults.method = 'POST'; faults.skip = 1; faults.hits = 0;
  try {
    await clickText('Import 2 assets');
    assert.ok(await page.waitForText('Imported 1 asset'));
    assert.ok(await page.waitForText('Retry failed rows'));
  } finally { faults.path = null; faults.method = null; faults.skip = 0; faults.hits = 0; }
  await clickText('Retry failed rows');
  assert.ok(await page.waitForText('Imported 2 assets'));
  assert.equal(await models.Asset.countDocuments({serialNumber:'CSV-01'}), 1);
  const spare = await models.Asset.findOne({serialNumber:'CSV-02'}).lean();
  assert.equal(spare.status, 'Staging'); assert.equal(spare.location.id, 'FA');
  assert.equal(await models.Asset.countDocuments({serialNumber:{$in:['CSV-03','CSV-04']}}), 0);
  await visit(`/assets/${spare._id}`, 'Imported spare');
});

test('template authoring, registration and cloning preserve provenance and clear unique identity', async () => {
  await visit('/assets/templates/new', 'New template');
  await page.fill('#t-name', 'Journey computer template');
  await page.fill('#t-category', 'Compute');
  await page.eval(`document.querySelector('#main aside ol li:last-child button').click();`);
  await clickText('Create template');
  await until(async () => !!await models.AssetTemplate.findOne({name:'Journey computer template'}), 'Template should save');
  const template = await models.AssetTemplate.findOne({name:'Journey computer template'}).lean();
  await visit(`/assets/new?source=template&templateId=${template._id}`, 'Asset name');
  await page.fill('#f-name', 'Template journey laptop');
  assert.equal(await page.eval('return !!document.querySelector("#f-category")'), false, 'Category is determined by template');
  await clickText('Review & register'); await clickText('Register asset');
  await until(async () => !!await models.Asset.findOne({name:'Template journey laptop'}), 'Template asset should save');
  const asset = await models.Asset.findOne({name:'Template journey laptop'}).lean();
  assert.equal(asset.category, 'Compute'); assert.equal(asset.onboarding.templateId, template._id);
  await until(async () => (await models.AssetTemplate.findById(template._id)).usageCount === 1, 'Template usage should persist after registration completes');
  await visit(`/assets/new?source=clone&cloneOf=${registeredId}`, 'Copied from');
  await until(() => page.eval('return !!document.querySelector("#f-name")'), 'Clone form loads');
  await page.fill('#f-name', 'Cloned journey laptop');
  await clickText('Review & register'); await clickText('Register asset');
  await until(async () => !!await models.Asset.findOne({name:'Cloned journey laptop'}), 'Clone asset should save');
  const clone = await models.Asset.findOne({name:'Cloned journey laptop'}).lean();
  const original = await models.Asset.findById(registeredId).lean();
  assert.equal(clone.onboarding.clonedFromId, registeredId);
  assert.notEqual(clone.onboarding.assetTag, original.onboarding.assetTag);
  assert.equal(clone.serialNumber, '');
  await visit(`/assets/${clone._id}`, 'Cloned journey laptop');
});

test('registration rejects missing fields, retries validation outages and handles invalid source links', async () => {
  await visit('/assets/new?source=unexpected', 'Pick how this asset reached you');
  assert.ok(await page.eval('return document.querySelectorAll("#main button, #main a").length > 2'));
  await visit('/assets/new?source=blank', 'Asset name');
  await clickText('Review & register'); await clickText('Register asset');
  assert.ok(await page.waitForText('Asset name is required'));
  await page.fill('#f-name', 'Recovery journey laptop'); await page.fill('#f-category', 'Compute');
  await clickText('Review & register');
  faults.path = '/api/v1/assets/registration/validate';
  try {
    await clickText('Register asset'); assert.ok(await page.waitForText('Temporary test failure'));
    assert.equal(await models.Asset.countDocuments({name:'Recovery journey laptop'}), 0);
  } finally { faults.path = null; }
  await clickText('Register asset');
  await until(async () => !!await models.Asset.findOne({name:'Recovery journey laptop'}), 'Validation recovery');
});

test('QR label binding waits for persistence, survives reload, and does not invent a scan', async () => {
  await visit(`/assets/labels?ids=${registeredId}`, 'Label Printing');
  await page.eval('window.__prints = 0; window.print = () => { window.__prints++; };');
  faults.path = `/api/v1/assets/${registeredId}`; faults.method = 'PATCH';
  try {
    await page.eval(`const b = [...document.querySelectorAll('#main button')].find(e => e.textContent.includes('🖨 Print')); b.click();`);
    assert.ok(await page.waitForText('Could not bind that tag'));
    assert.equal(await page.eval('return window.__prints'), 0);
    assert.equal((await models.Asset.findById(registeredId)).onboarding.bindings.length, 0);
  } finally { faults.path = null; faults.method = null; }
  await page.eval(`const b = [...document.querySelectorAll('#main button')].find(e => e.textContent.includes('🖨 Print')); b.click(); b.click();`);
  await until(() => page.eval('return window.__prints === 1'), 'Print opens once after persistence');
  const saved = await models.Asset.findById(registeredId).lean();
  assert.equal(saved.onboarding.bindings.length, 1);
  assert.equal(saved.onboarding.bindings[0].state, 'Bound');
  assert.equal(saved.onboarding.bindings[0].verifiedAt, undefined);
  assert.equal(saved.trackingId, saved.onboarding.bindings[0].tagId);
  await visit(`/assets/labels?ids=${registeredId}`, 'Label Printing');
  const qrPayload = await page.eval(`return document.querySelector('svg[aria-label^="QR code encoding "]').getAttribute('aria-label').replace('QR code encoding ', '')`);
  const scannedUrl = new URL(qrPayload);
  assert.equal(scannedUrl.pathname, `/a/${registeredId.replace('AST-', 'ag')}`);
  assert.equal(scannedUrl.origin, new URL(web).origin);
  await page.send('Emulation.setEmulatedMedia', {media:'print'});
  assert.equal(await page.eval('return getComputedStyle(document.querySelector(".app-sidebar")).display'), 'none');
  await page.shot('stage3-label-print');
  await page.send('Emulation.setEmulatedMedia', {media:''});
  await page.eval(`const b = [...document.querySelectorAll('#main button')].find(e => e.textContent.trim() === 'Barcode'); b.click();`);
  assert.ok(await page.eval(`const svg = document.querySelector('svg[aria-label^="Barcode code encoding "]'); return svg && svg.querySelectorAll('rect').length > 20;`));
  assert.equal(await page.eval(`return [...document.querySelectorAll('#main button')].find(e => e.textContent.includes('🖨 Print')).disabled`), false);
  await visit(scannedUrl.pathname, 'Journey laptop');
});

test('lifecycle approval and financial values remain consistent with saved asset data', async () => {
  const requested = await ok('operator', `/assets/${registeredId}/lifecycle/transition`, 'POST', {toStage:'Retired',reason:'Journey retirement'}, 202);
  assert.equal(requested.status, 'Pending');
  assert.equal((await models.Asset.findById(registeredId)).lifecycleStage, 'Available');
  await ok('approver', `/assets/lifecycle/transitions/${requested.transition.id}/decide`, 'POST', {decision:'Approved'});
  await visit(`/assets/${registeredId}?tab=lifecycle`, 'Journey laptop');
  assert.ok(await page.waitForText('Retired'));
  await visit(`/assets/${registeredId}?tab=financials`, 'Journey laptop');
  assert.match(await page.text(), /2,500/);
  assert.doesNotMatch(await page.text(), /\$2,500/);
  const bookText = await page.eval(`const label = [...document.querySelectorAll('#main div')].find(e => e.textContent === 'Book Value'); return label.parentElement.innerText;`);
  const financialAsset = await models.Asset.findById(registeredId).lean();
  const start = financialAsset.onboarding.commercial.commissionDate ?? financialAsset.purchaseDate;
  const expectedBook = 2500 * Math.max(0, 1 - (Date.now() - new Date(start).getTime()) / (5 * 365 * 86400000));
  const shownBook = Number(bookText.split('₹')[1].replaceAll(',', ''));
  assert.ok(Math.abs(shownBook - expectedBook) <= 1, 'Book value reflects elapsed depreciation, rounded to INR');
  await visit('/financials', 'Asset Financials');
  assert.match(await page.text(), /5,500/); // original, clone and CSV records + fixture
});

async function chooseScope(name) {
  await page.click('button[aria-haspopup="listbox"]');
  const clicked = await page.eval(`const e = [...document.querySelectorAll('[role=option]')].find(e => e.textContent.includes(${JSON.stringify(name)})); e?.click(); return !!e;`);
  assert.ok(clicked, `Scope option ${name}`);
}

test('switching A to B to A and an empty scope cannot reuse another scope dataset', async () => {
  await login('admin'); await visit('/assets', 'Fixture AST-B');
  await chooseScope('Facility A'); assert.ok(await page.waitForText('Fixture AST-A'));
  assert.doesNotMatch(await page.text(), /Fixture AST-B/);
  await chooseScope('Facility B'); assert.ok(await page.waitForText('Fixture AST-B'));
  assert.doesNotMatch(await page.text(), /Journey laptop|Fixture AST-A/);
  await chooseScope('Facility A'); assert.ok(await page.waitForText('Journey laptop'));
  assert.doesNotMatch(await page.text(), /Fixture AST-B/);
  await chooseScope('Empty facility'); assert.ok(await page.waitForText('No assets match'));
  await login('operator'); await visit('/assets', 'Journey laptop');
  assert.equal(await page.eval('return localStorage.getItem("ag.scope")'), null);
});

test('registry search and mobile primary pages remain usable without document overflow', async () => {
  await visit('/assets', 'Journey laptop');
  await page.fill('input[placeholder="Filter by name, serial, tag, custodian…"]', 'zz-nothing-matches');
  assert.ok(await page.waitForText('No assets match your filters')); await clickText('Clear filters');
  assert.ok(await page.waitForText('Journey laptop'));
  await page.setViewport(390, 844);
  for (const [path, heading] of [['/assets','Asset Registry'], [`/assets/${registeredId}`,'Journey laptop'],['/assets/new?source=blank','Asset name'],['/assets/import','Bulk Import Assets']]) {
    await visit(path, heading);
    assert.ok(await page.eval('return document.documentElement.scrollWidth <= innerWidth + 1'), `No page overflow at ${path}`);
    assert.ok(await page.eval(`const r = document.querySelector('button[aria-label="Account menu"]').getBoundingClientRect(); return r.right <= innerWidth && r.left >= 0;`), 'Mobile account menu is reachable');
    await page.shot(`stage3-mobile-${path.includes('/new') ? 'registration' : path.includes('/import') ? 'import' : path === '/assets' ? 'registry' : 'detail'}`);
  }
  await page.setViewport(1440,900);
});

test('dataset gateway error provides a working retry and no uncaught browser exception', async () => {
  faults.path = '/api/v1/dataset';
  try {
    await visit('/assets', 'Could not load your workspace');
  } finally { faults.path = null; }
  await clickText('Retry');
  assert.ok(await page.waitForText('Journey laptop'));
  assert.deepEqual(page.pageErrors, []);
});

test('late scope responses cannot overwrite the currently selected estate', async () => {
  await login('admin'); await visit('/assets', 'Fixture AST-B');
  faults.path = '/api/v1/dataset?scope=FB'; faults.delay = 800;
  try {
    const result = await page.eval(`return (async () => {
      const scope = await import('/src/api/dataset.ts');
      scope.setActiveScope('FB');
      const old = scope.datasetOptions();
      const pending = old.queryFn({signal:new AbortController().signal});
      scope.setActiveScope('FA');
      await scope.datasetOptions().queryFn({signal:new AbortController().signal});
      await pending;
      const data = await import('/src/lib/dataset.ts');
      return {active:scope.getActiveScope(), ids:data.allAssets.map(a => a.id)};
    })();`);
    assert.equal(result.active, 'FA'); assert.ok(result.ids.includes(registeredId)); assert.ok(!result.ids.includes('AST-B'));
  } finally { faults.path = null; faults.delay = 0; }
  await login('operator');
});

test('template, clone and defaults failures show recovery controls', async () => {
  for (const [path, fault, error] of [
    ['/assets/templates/new','/api/v1/assets/registration/catalog','Could not load the field catalogue'],
    ['/assets/new?source=template','/api/v1/assets/templates','Templates could not be loaded'],
    ['/assets/new?source=clone','/api/v1/assets?','Assets could not be loaded'],
    ['/assets/new?source=blank','/api/v1/assets/registration/defaults','This form could not be loaded'],
  ]) {
    faults.path = fault;
    try { await visit(path, error); }
    finally { faults.path = null; }
    await clickText(path.endsWith('source=blank') ? 'Retry loading' : 'Retry');
    await until(async () => !(await page.text()).includes(error), 'Retry should recover '+path);
  }
});

test('read-only asset edits fail visibly and preserve the saved record and entered draft', async () => {
  await login('reader');
  await visit(`/assets/${registeredId}/edit`, 'Save Changes');
  await page.fill('#f-name', 'Forbidden rename');
  await clickText('Save Changes');
  assert.ok(await page.waitForText('Could not save those changes'));
  assert.equal(await page.eval('return document.querySelector("#f-name").value'), 'Forbidden rename');
  assert.equal((await models.Asset.findById(registeredId)).name, 'Journey laptop');
  await page.click('button[aria-label="Account menu"]'); await clickText('Sign out');
  assert.ok(await page.waitForText('Work email'));
  await login('operator');
});

test('CSV without serial numbers imports and undo removes only the newly imported records', async () => {
  await visit('/assets/import', 'Bulk Import Assets');
  await uploadCsv('no-serial.csv', 'Name,Category\nNo serial import,Compute\n');
  assert.ok(await page.waitForText('1 rows'));
  await clickText('Next →'); await clickText('Next →'); await clickText('Next →'); await clickText('Import 1 asset');
  assert.ok(await page.waitForText('Imported 1 asset'));
  const asset = await models.Asset.findOne({name:'No serial import'}).lean(); assert.equal(asset.serialNumber,'');
  await clickText('Imported the wrong file?');
  assert.ok(await page.waitForSelector('[role=dialog]'));
  assert.equal(await models.Asset.countDocuments({_id:asset._id}),1, 'Opening confirmation must not delete');
  await clickText('Delete 1');
  await until(async () => await models.Asset.countDocuments({_id:asset._id}) === 0, 'Undo removes imported record');
  assert.ok(await models.Asset.findById(registeredId), 'Other records remain');
});

test('lifecycle dialog contains keyboard focus and supports Escape', async () => {
  await visit('/assets/AST-A', 'Fixture AST-A');
  await clickText('More'); await clickText('Change Stage');
  assert.ok(await page.waitForSelector('[role=dialog] textarea'));
  await page.fill('[role=dialog] textarea', 'Keyboard test only');
  const first = await page.eval(`const dialog = document.querySelector('[role=dialog]'); const buttons = dialog.querySelectorAll('button:not(:disabled)'); buttons[buttons.length-1].focus(); return dialog.querySelector('select').outerHTML;`);
  await page.send('Input.dispatchKeyEvent', {type:'keyDown',key:'Tab',code:'Tab',windowsVirtualKeyCode:9});
  assert.equal(await page.eval('return document.activeElement.outerHTML'), first);
  await page.send('Input.dispatchKeyEvent', {type:'keyDown',key:'Escape',code:'Escape',windowsVirtualKeyCode:27});
  assert.ok(await page.waitForSelector('#main'));
  await until(() => page.eval('return !document.querySelector("[role=dialog]")'), 'Escape closes the form');
  assert.deepEqual(page.pageErrors, []);
});

test('registry pagination, sorting and page selection operate on the visible rows', async () => {
  await models.Asset.create(Array.from({length:12}, (_, i) => ({...fixtureAsset(`AST-PAGE-${i}`, 'FA', 10), name:`Pagination ${String(i).padStart(2, '0')}`})));
  await visit('/assets', 'Asset Registry');
  await page.fill('input[placeholder="Filter by name, serial, tag, custodian…"]', 'Pagination');
  assert.ok(await page.waitForText('Showing 1–10 of 12'));
  const first = await page.eval(`return [...document.querySelectorAll('#main tbody tr')].map(r => r.textContent);`);
  assert.equal(first.length, 10);
  await page.click('input[aria-label="Select all on page"]');
  assert.ok(await page.waitForText('10 selected'));
  await clickText('Next →'); assert.ok(await page.waitForText('Showing 11–12 of 12'));
  const last = await page.eval(`return [...document.querySelectorAll('#main tbody tr')].map(r => r.textContent);`);
  assert.equal(last.length, 2); assert.ok(last.every(r => !first.includes(r)));
  await clickText('← Prev');
  await page.eval(`const button = [...document.querySelectorAll('#main th button')].find(b => b.textContent.includes('Asset ID / Name')); button.click();`);
  assert.ok(await page.eval(`return ['ascending','descending'].includes(document.querySelector('#main th[aria-sort]:not([aria-sort="none"])').getAttribute('aria-sort'));`));
  assert.deepEqual(page.pageErrors, []);
});
