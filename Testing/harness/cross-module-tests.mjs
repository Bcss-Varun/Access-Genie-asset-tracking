// Self-contained regression suite. Never reads backend/.env or a running API.
// The only database is a fresh loopback MongoDB owned and stopped by this run.
import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';
import { randomBytes } from 'node:crypto';
import { once } from 'node:events';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createServer } from 'node:net';
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
const tokens = {};
const password = 'Stage4-test-password!';
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
  return { status: response.status, body: response.status === 204 ? null : await response.json() };
}
async function ok(who, path, method, body, status = 200) {
  const result = await request(who, path, method, body);
  assert.equal(result.status, status, JSON.stringify(result.body));
  return result.body?.data;
}

before(async () => {
  // Deliberately override caller-provided connection/credential settings.
  Object.assign(process.env, {
    DOTENV_CONFIG_PATH: '/dev/null', NODE_ENV: 'test', LOG_LEVEL: 'error',
    MONGODB_DB_NAME: 'access_genie_cross_module', BCRYPT_ROUNDS: '4',
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
    await User.create({ _id: id, name: id, email: `${id}@stage4.test`, passwordHash: password,
      initials: id.slice(0, 2), roleId, homeScopeId, title: 'Test user',
      extraModules: ['extra', 'financeExtra'].includes(id) ? ['assets'] : [] });
  }
  await Asset.create([fixtureAsset('AST-101', 'BA', 100), fixtureAsset('AST-102', 'FB', 900)]);
  await LifecycleTransition.create([fixtureTransition('LTX-A', 'AST-101'), fixtureTransition('LTX-B', 'AST-102')]);
  for (const assetId of ['AST-101', 'AST-102']) {
    await PmSchedule.create({ _id: `PM-${assetId}`, title: 'Due schedule', assetId, assetName: assetId,
      frequency: 'Monthly', type: 'Preventive', nextDue: new Date(Date.now() - 10000),
      lastDone: new Date('2025-01-01'), estHours: 1, compliancePct: 100, assignedTeam: 'Fixture' });
  }
  const { createApp } = await import('../../backend/src/app.ts');
  server = createApp().listen(0, '127.0.0.1');
  await once(server, 'listening');
  api = `http://127.0.0.1:${server.address().port}/api/v1`;
  for (const id of ['admin', 'operator', 'approver', 'foreign', 'reader', 'denied', 'finance', 'financeExtra', 'extra']) {
    const auth = await ok(null, '/auth/login', 'POST', { email: `${id}@stage4.test`, password });
    tokens[id] = auth.accessToken;
  }
  const { createServer: createViteServer } = await import('vite');
  const { default: react } = await import('@vitejs/plugin-react');
  const { default: tailwindcss } = await import('@tailwindcss/vite');
  const { Browser } = await import('./cdp.mjs');
  profile = await mkdtemp(join(tmpdir(), 'ag-stage4-browser-'));
  vite = await createViteServer({
    configFile: false, envFile: false,
    root: fileURLToPath(new URL('../../frontend', import.meta.url)), cacheDir: join(profile, 'vite-cache'),
    plugins: [react(), tailwindcss(), { name: 'stage4-faults', configureServer(devServer) {
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
}, { timeout:120000 });
after(async () => {
  if (page) console.log('Uncaught browser errors:', JSON.stringify(page.pageErrors));
  page?.ws.close();
  if (browser) await browser.close();
  if (vite) await vite.close();
  if (profile) await rm(profile, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
  if (server) { server.closeAllConnections(); await new Promise(resolve => server.close(resolve)); }
  await mongoose.disconnect(); if (database) await database.stop();
});

test('observation intake refuses a foreign asset and does not write presence', async () => {
  const result = await request('operator','/tracking/observations','POST',{assetId:'AST-102', source:'manual',zone:'Foreign zone'});
  assert.equal(result.status,404,JSON.stringify(result.body));
  assert.equal(await models.AssetPresence.countDocuments({_id:'AST-102'}),0);
});

test('PM schedules cannot be created for a foreign asset', async () => {
  const result = await request('operator','/pm-schedules','POST',{assetId:'AST-102', title:'Forbidden maintenance',frequency:'Monthly',nextDue:'2026-09-01'});
  assert.equal(result.status,404,JSON.stringify(result.body));
});

test('inspection create and detail reads enforce the asset estate', async () => {
  const template = await ok('admin','/inspection-templates','POST',{name:'Stage 4 safety',checkpoints:[{key:'guard',label:'Guard is secure',type:'Pass/Fail',required:true}]},201);
  const input={templateId:template.id,assetId:'AST-102',scheduledFor:'2026-09-22'};
  const foreign = await ok('foreign','/inspections','POST',input,201);
  assert.equal((await request('operator',`/inspections/${foreign.id}`)).status,404);
  assert.equal((await request('operator','/inspections','POST',input)).status,404);
  assert.equal((await request('operator',`/inspections/${foreign.id}/start`,'POST',{})).status,404);
  assert.equal((await models.Inspection.findById(foreign.id)).status,'Scheduled');
});

test('transfer and reservation creation refuse foreign assets', async () => {
  assert.equal((await request('operator','/operations/transfers','POST',{assetId:'AST-102',to:'Facility A',reason:'Forbidden move'})).status,404);
  assert.equal((await request('operator','/operations/reservations','POST',{assetId:'AST-102',reservedBy:'operator',startDay:1,endDay:2,startLabel:'Monday',endLabel:'Tuesday'})).status,404);
});

test('workforce queue omits foreign and cancelled work', async () => {
  await ok('foreign','/work-orders','POST',{title:'Foreign work',assetId:'AST-102',dueDate:'2026-09-22'},201);
  const queue = await ok('operator','/field/queue/all');
  assert.ok(!queue.some(row => row.assetId === 'AST-102'),JSON.stringify(queue));
  assert.equal((await request('operator','/field/scan/AST-102','POST',{})).status,404);
});

test('intelligence explanation refuses foreign asset identifiers', async () => {
  assert.equal((await request('operator','/intelligence/explain/AST-102')).status,404);
});

test('asset edits preserve observed zone, timestamp and position', async () => {
  const at = new Date(Date.now()-60000).toISOString();
  await ok('operator','/tracking/observations','POST',{assetId:'AST-101',source:'uwb',at,zone:'Observed room',facility:'Facility A',position:{x:12,y:18}},201);
  const prior=await models.AssetPresence.findById('AST-101').lean();
  await ok('operator','/assets/AST-101','PATCH',{name:'Renamed observation asset'});
  const after=await models.AssetPresence.findById('AST-101').lean();
  assert.equal(after.zone,prior.zone); assert.equal(after.lastSeen.toISOString(),prior.lastSeen.toISOString());
  assert.deepEqual(after.position,prior.position);
});

test('an older observation cannot rewind the latest sighting', async () => {
  await ok('operator','/tracking/observations','POST',{assetId:'AST-101',source:'manual',at:new Date(Date.now()-3600000).toISOString(),zone:'Old room'},201);
  assert.equal((await models.AssetPresence.findById('AST-101')).zone,'Observed room');
});

test('lifecycle notifications are delivered only to users who can see the asset', async () => {
  await models.Notification.deleteMany({});
  await ok('operator','/assets/AST-101/lifecycle/transition','POST',{toStage:'Assigned / In Service',reason:'Stage 4 assignment'});
  const own=await ok('operator','/notifications'); const foreign=await ok('foreign','/notifications');
  assert.ok(own.some(row => row.category === 'Lifecycle'));
  assert.ok(!foreign.some(row => row.category === 'Lifecycle'),JSON.stringify(foreign));
});

test('batch observation preflight prevents partial writes across facilities', async () => {
  const before = await models.AssetPresence.findById('AST-101').lean();
  assert.equal((await request('operator','/tracking/observations/batch','POST',{observations:[
    {assetId:'AST-101',source:'manual',zone:'Should not commit'}, {assetId:'AST-102',source:'manual'},
  ]})).status,404);
  assert.equal((await models.AssetPresence.findById('AST-101')).zone,before.zone);
});

test('tracking workspace, counts and device actions stay within the selected estate', async () => {
  await ok('foreign','/tracking/observations','POST',{assetId:'AST-102',source:'manual',facility:'Facility B'},201);
  const device=await ok('foreign','/tracking/devices','POST',{name:'Foreign radio',role:'Tag',technology:'BLE',facility:'Facility B'},201);
  assert.equal(device.state,'Unprovisioned');
  await until(async()=>Boolean(await models.AuditLog.exists({action:'tracking_device.provision',target:device.id})), 'Device provisioning audit persists');
  assert.equal((await request('operator','/tracking/devices/bulk','POST',{ids:[device.id],state:'Offline'})).status,404);
  const workspace=await ok('operator','/tracking/workspace');
  assert.deepEqual(workspace.presence.map(r=>r.assetId),['AST-101']);
  assert.ok(!workspace.devices.some(r=>r.id===device.id));
  assert.deepEqual(workspace.facilities.map(r=>r.name),['Facility A']);
  const empty=await ok('admin','/tracking/workspace?scope=EMPTY');
  assert.equal(empty.presence.length,0); assert.equal(empty.movements.length,0);
  assert.equal((await request('operator','/tracking/movements','POST',{assetId:'AST-102',assetName:'Foreign',direction:'Out',person:'operator'})).status,404);
});

test('new registry records do not invent presence or healthy hardware', async () => {
  const asset=await ok('operator','/assets','POST',{name:'Unobserved asset',category:'Compute',location:{id:'FA',name:'Facility A'},trackingId:'BLE-NEW',trackingTech:'BLE'},201);
  assert.equal(await models.AssetPresence.countDocuments({_id:asset.id}),0);
  assert.equal(await models.TrackingDevice.countDocuments({assetId:asset.id}),0);
  assert.equal(await models.Sensor.countDocuments({assetId:asset.id}),0);
  assert.equal(asset.mapPosition,undefined);
});

test('concurrent old and new observations preserve latest sighting; coordinate-free reads clear old position', async () => {
  await Promise.all([0,1000,2000,3000].reverse().map(offset => ok('operator','/tracking/observations','POST',{
    assetId:'AST-101',source:'manual',at:new Date(Date.now()-10000+offset).toISOString(),zone:`Zone ${offset}`,
  },201)));
  const presence=await models.AssetPresence.findById('AST-101').lean();
  assert.equal(presence.zone,'Zone 3000'); assert.equal(presence.position,undefined);
});

test('PM automation raises only due work in scope and does not duplicate open occurrences', async () => {
  const foreign=await models.PmSchedule.findById('PM-AST-102').lean();
  const result=await ok('operator','/pm-schedules/run-automation','POST',{});
  assert.equal(result.pmRaised,1);
  assert.equal((await models.PmSchedule.findById('PM-AST-102')).nextDue.toISOString(),foreign.nextDue.toISOString());
  assert.equal((await ok('operator','/pm-schedules/run-automation','POST',{})).pmRaised,0);
  const created=await ok('operator','/pm-schedules','POST',{assetId:'AST-101',title:'Never completed plan',frequency:'Monthly',nextDue:'2030-01-01'},201);
  assert.equal(created.lastDone,undefined);
  assert.equal((await request('foreign',`/pm-schedules/${created.id}`,'PATCH',{title:'Foreign edit'})).status,404);
  assert.equal((await request('foreign',`/pm-schedules/${created.id}`,'DELETE')).status,404);
});

test('inspection failure produces one corrective order and completed work leaves the field queue', async () => {
  const template=await ok('admin','/inspection-templates','POST',{name:'Corrective test',checkpoints:[{key:'guard',label:'Guard secure',type:'Pass/Fail',required:true}]},201);
  const assets=await ok('operator',`/inspection-templates/${template.id}/assets`);
  assert.ok(!assets.some(a=>a.id==='AST-102'));
  const inspection=await ok('operator','/inspections','POST',{templateId:template.id,assetId:'AST-101',scheduledFor:'2026-09-22'},201);
  await ok('operator',`/inspections/${inspection.id}/start`,'POST',{});
  assert.equal((await request('operator',`/inspections/${inspection.id}/complete`,'POST',{})).status,400);
  await ok('operator',`/inspections/${inspection.id}/responses`,'POST',{responses:[{key:'guard',value:'Fail',finding:'Guard is loose'}]});
  assert.equal((await ok('operator',`/inspections/${inspection.id}/complete`,'POST',{})).status,'Failed');
  const raised=await ok('operator',`/inspections/${inspection.id}/corrective`,'POST',{},201);
  const id=raised.workOrderIds[0]; assert.ok(id,JSON.stringify(raised));
  const second=await ok('operator',`/inspections/${inspection.id}/corrective`,'POST',{});
  assert.equal(second.workOrderIds.length,0);
  await ok('operator',`/work-orders/${id}/status`,'POST',{status:'In Progress'});
  await ok('operator',`/work-orders/${id}/labor`,'POST',{technician:'operator',hours:1,note:'Secured guard'},201);
  const done=await ok('operator',`/work-orders/${id}/status`,'POST',{status:'Completed',note:'Guard tested'});
  assert.ok(done.completedAt); assert.equal(done.laborLog.length,1);
  assert.ok(!(await ok('operator','/field/queue/all')).some(r=>r.id===id));
});

test('reservation overlap is rejected, cancellation persists, and foreign lists stay private', async () => {
  const input={assetId:'AST-101',reservedBy:'operator',startDay:1,endDay:2,startLabel:'Monday',endLabel:'Tuesday'};
  const booking=await ok('operator','/operations/reservations','POST',input,201);
  assert.equal((await request('operator','/operations/reservations','POST',input)).status,409);
  assert.ok(!(await ok('foreign','/operations/reservations')).some(r=>r.id===booking.id));
  assert.equal((await request('foreign',`/operations/reservations/${booking.id}/cancel`,'POST',{})).status,404);
  assert.equal((await ok('operator',`/operations/reservations/${booking.id}/cancel`,'POST',{})).status,'Cancelled');
});

test('transfer approval, receipt and custody agree after a real location move', async () => {
  assert.equal((await request('operator','/operations/transfers','POST',{assetId:'AST-101',to:'Facility B',reason:'Cross facility'})).status,404);
  const tr=await ok('operator','/operations/transfers','POST',{assetId:'AST-101',to:'Facility A',reason:'Stage 4 relocation',newCustodian:'New owner'},201);
  assert.equal((await request('operator',`/operations/transfers/${tr.id}/status`,'POST',{status:'Approved'})).status,403);
  for(const status of ['Approved','Picked Up','In Transit','Received','Completed']) await ok('approver',`/operations/transfers/${tr.id}/status`,'POST',{status});
  const asset=await ok('operator','/assets/AST-101');
  assert.equal(asset.location.id,'FA'); assert.equal(asset.location.name,'Facility A'); assert.equal(asset.custodian,'New owner');
  assert.ok((await ok('operator','/custody?assetId=AST-101')).some(r=>r.holder==='New owner'));
  assert.equal((await request('foreign','/custody?assetId=AST-101')).status,404);
});

test('AI recomputation changes only selected assets and leaves foreign findings intact', async () => {
  const foreign=await models.Asset.findById('AST-102').lean();
  const result=await ok('operator','/intelligence/recompute','POST',{});
  assert.equal(result.metrics.scanned,await models.Asset.countDocuments({'location.id':{$in:['FA','BA']}}));
  const after=await models.Asset.findById('AST-102').lean();
  assert.equal(after.healthScore,foreign.healthScore); assert.equal(after.updatedAt.toISOString(),foreign.updatedAt.toISOString());
  const explanation=await ok('operator','/intelligence/explain/AST-101'); assert.ok(explanation.drivers.length);
});

test('compliance finding resolution persists and refuses foreign reads and writes', async () => {
  const item=await ok('operator','/compliance-records','POST',{assetId:'AST-101',title:'Missing guard record',description:'Guard evidence absent',category:'Safety',severity:'High'},201);
  assert.equal((await request('foreign',`/compliance-records/${item.id}`)).status,404);
  assert.equal((await request('foreign',`/compliance-records/${item.id}/resolve`,'POST',{status:'Resolved'})).status,404);
  await ok('operator',`/compliance-records/${item.id}/resolve`,'POST',{status:'Resolved',resolutionNote:'Inspection evidence attached'});
  const saved=await ok('operator',`/compliance-records/${item.id}`); assert.equal(saved.status,'Resolved');assert.ok(saved.resolvedAt);
});

test('audit evidence and finding closure remain linked to compliance', async () => {
  const audit=await ok('operator','/audits','POST',{name:'Stage 4 safety audit',type:'Safety',scopeId:'FA',leadAuditor:'operator',startDate:'2026-09-22',dueDate:'2026-09-30'},201);
  await ok('operator',`/audits/${audit.id}/transition`,'POST',{status:'In Progress'});
  const finding=await ok('operator',`/audits/${audit.id}/findings`,'POST',{assetId:'AST-101',title:'Evidence missing',description:'Safety checklist evidence absent',severity:'High'},201);
  await ok('operator',`/audits/${audit.id}/findings/${finding.id}/evidence`,'POST',{label:'Inspection note',note:'Guard repaired and tested'},201);
  await ok('operator',`/audits/${audit.id}/findings/${finding.id}`,'PATCH',{status:'Resolved',correctiveAction:'Completed inspection and repair'});
  const findings=await ok('operator',`/audits/${audit.id}/findings`); assert.equal(findings[0].evidence.length,1);assert.equal(findings[0].status,'Resolved');
  assert.equal((await request('foreign',`/audits/${audit.id}`)).status,404);
  await ok('operator',`/audits/${audit.id}/transition`,'POST',{status:'Completed'});
});

test('saved report, preview and CSV export agree with the scoped registry', async () => {
  const definition={source:'assets',dimensions:['custodian'],measures:['count'],visualization:'table'};
  const preview=await ok('operator','/analytics/preview','POST',{definition});
  const count=await models.Asset.countDocuments({'location.id':{$in:['FA','BA']}});assert.equal(preview.totals.count,count);
  const report=await ok('operator','/analytics/reports','POST',{name:'Stage 4 scoped report',definition},201);
  const run=await ok('operator',`/analytics/reports/${report.id}/run`,'POST',{});assert.equal(run.result.totals.count,count);
  const response=await fetch(`${api}/analytics/reports/${report.id}/export?format=csv`,{headers:{Authorization:`Bearer ${tokens.operator}`}});
  assert.equal(response.status,200);const csv=await response.text();assert.ok(csv.includes('New owner'));assert.ok(!csv.includes('Fixture owner'));
  assert.equal((await request('operator','/analytics/preview','POST',{definition,facility:'FB'})).status,403);
});

test('admin workflow blocks direct approval and releases the transfer after authorized approval', async () => {
  const workflow=await ok('admin','/approval-workflows','POST',{name:'Stage 4 transfer control',trigger:'asset_transfer',status:'Active',scopeId:'FA',steps:[{order:1,name:'Organization release',approverRole:'org_admin'}]},201);
  const transfer=await ok('operator','/operations/transfers','POST',{assetId:'AST-101',to:'Building A',reason:'Workflow test'},201);
  assert.equal((await request('approver',`/operations/transfers/${transfer.id}/status`,'POST',{status:'Approved'})).status,409);
  const approvals=await ok('approver','/approvals');const approval=approvals.find(r=>r.subjectId===transfer.id);assert.ok(approval);
  assert.equal((await request('operator',`/approvals/${approval.id}/decide`,'POST',{decision:'Approved'})).status,403);
  await ok('approver',`/approvals/${approval.id}/decide`,'POST',{decision:'Approved',comment:'Reviewed move'});
  assert.equal((await models.Transfer.findById(transfer.id)).status,'Approved');
  await ok('admin',`/approval-workflows/${workflow.id}`,'DELETE',undefined,204);
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
  await page.fill('#login-email', `${who}@stage4.test`);
  await page.fill('#login-password', password);
  await page.click('button[type="submit"]');
  assert.ok(await page.waitForSelector('#main', 30000));
}


test('notification delivery records successful and failed loopback webhooks independently', async () => {
  const {createServer: createHttpServer}=await import('node:http');
  const received=[];
  const receiver=createHttpServer((req,res)=>{let body='';req.on('data',chunk=>body+=chunk);req.on('end',()=>{received.push(JSON.parse(body));res.statusCode=req.url==='/fail'?503:204;res.end();});}).listen(0,'127.0.0.1');
  await once(receiver,'listening');
  try {
    const url=`http://127.0.0.1:${receiver.address().port}`;
    await models.Webhook.create([{_id:'WH-OK',url:`${url}/ok`,events:['Stage4'],enabled:true},{_id:'WH-FAIL',url:`${url}/fail`,events:['Stage4'],enabled:true}]);
    const {notify}=await import('../../backend/src/services/notification.service.ts');
    await notify({title:'Stage 4 delivery',body:'Isolated delivery fixture',category:'Stage4',userId:'operator',scopeId:'FA'});
    const row=await models.Notification.findOne({category:'Stage4'}).lean();
    assert.equal(received.length,2);assert.ok(row.delivery.some(d=>d.channel==='webhook'&&d.status==='sent'));
    assert.ok(row.delivery.some(d=>d.channel==='webhook'&&d.status==='failed'&&d.error==='HTTP 503'));
    assert.ok(row.delivery.some(d=>d.channel==='email'&&d.status==='skipped'));
    assert.equal((await models.Webhook.findById('WH-FAIL')).ok,false);
  } finally {await models.Webhook.deleteMany({_id:{$in:['WH-OK','WH-FAIL']}});receiver.closeAllConnections();await new Promise(resolve=>receiver.close(resolve));}
});

test('tracking alert acknowledgement persists while foreign mutations and counts remain isolated', async () => {
  for(const [id,assetId,facility] of [['TAL-A','AST-101','Facility A'],['TAL-B','AST-102','Facility B']]) {
    await models.TrackingAlert.collection.insertOne({_id:id,assetId,facility,title:id,category:'Misplaced',priority:'High',state:'New',raisedAt:new Date(),slaDueAt:new Date(Date.now()+3600000),timeline:[]});
  }
  assert.equal((await ok('operator','/tracking/alerts/count')).open,1);
  assert.equal((await request('operator','/tracking/alerts/TAL-B/transition','POST',{to:'Acknowledged'})).status,404);
  await ok('operator','/tracking/alerts/TAL-A/transition','POST',{to:'Acknowledged',note:'Investigating'});
  const row=await models.TrackingAlert.findById('TAL-A').lean();assert.equal(row.state,'Acknowledged');assert.equal(row.timeline[0].actor,'operator');
  assert.equal((await models.TrackingAlert.findById('TAL-B')).state,'New');
});

test('browser PM action opens a real prefilled form and persists a work order through reload', async () => {
  await visit('/login','Work email'); await login();
  await visit('/pm/PM-AST-101','No completed work orders recorded for this plan.');
  assert.doesNotMatch(await page.text(),/Completed \(late\)/);
  await clickText('Create Work Order');
  await until(()=>page.eval(`return Boolean(document.querySelector('[role="dialog"]'))`),'Open work-order form');
  assert.ok((await page.text()).includes('New work order'));
  const before=await models.WorkOrder.countDocuments({assetId:'AST-101'});
  await clickText('Create Work Order');
  await until(async()=>await models.WorkOrder.countDocuments({assetId:'AST-101'})===before+1,'Persist PM work order');
  await visit('/work-orders','Due schedule — manual request');
  assert.equal(await models.WorkOrder.countDocuments({assetId:'AST-101',title:'Due schedule — manual request'}),1);
  await page.send('Page.captureScreenshot',{format:'png'}).then(result=>writeFile('Testing/evidence/stage4-work-orders.png',Buffer.from(result.data,'base64')));
});

test('remaining module routes load without uncaught exceptions or foreign asset names', async () => {
  const routes=['/tracking','/tracking/inventory','/tracking/journey','/tracking/alerts','/tracking/infrastructure','/ai-insights','/ai/feedback','/maintenance','/inspections','/workforce','/asset-movement','/compliance-reports','/audit','/analytics','/reports','/admin/users','/admin/org'];
  for(const route of routes) {
    await page.nav(web+route);
    await until(()=>page.eval(`return Boolean(document.querySelector('#main h1')) && !document.querySelector('[role="progressbar"]')`),`${route} renders`,15000);
    const text=await page.eval(`return document.querySelector('#main').innerText`);
    assert.doesNotMatch(text,/Something went wrong|Unexpected Application Error|Coming soon|Fixture AST-102/i,route+': '+text.slice(0,600));
  }
  await visit('/ai/feedback','Feedback submission is unavailable');
  assert.doesNotMatch(await page.text(),/1,284|Improvements shipped/);
  assert.deepEqual(page.pageErrors,[]);
  await page.send('Page.captureScreenshot',{format:'png'}).then(result=>writeFile('Testing/evidence/stage4-feedback.png',Buffer.from(result.data,'base64')));
});

test('predictive alert triage preserves manual provenance and reuses its corrective work order', async () => {
  const input={assetId:'AST-101',title:'Bearing vibration review',severity:'High',type:'Vibration',confidence:82,reason:'Technician measured vibration above baseline',recommendation:{action:'Inspect bearing and confirm measurement'},source:'Manual'};
  const alert=await ok('operator','/predictive-alerts','POST',input,201);
  assert.equal((await request('foreign',`/predictive-alerts/${alert.id}/detail`)).status,404);
  assert.equal((await request('foreign',`/predictive-alerts/${alert.id}/acknowledge`,'POST',{})).status,404);
  assert.equal((await request('foreign','/predictive-alerts','POST',input)).status,404);
  await ok('operator',`/predictive-alerts/${alert.id}/acknowledge`,'POST',{note:'Reviewed evidence'});
  const first=await ok('operator',`/predictive-alerts/${alert.id}/work-order`,'POST',{},201);
  const repeat=await ok('operator',`/predictive-alerts/${alert.id}/work-order`,'POST',{});
  assert.equal(repeat.workOrderId,first.workOrderId);assert.equal(repeat.reused,true);
  const work=await models.WorkOrder.findById(first.workOrderId).lean(); assert.equal(work.aiGenerated,false);
});

test('latest observed coordinates drive the live map and future readings are rejected', async () => {
  const input={assetId:'AST-101',source:'uwb',zone:'Live room',facility:'Facility A',position:{x:33,y:44}};
  await ok('operator','/tracking/observations','POST',input,201);
  const live=await ok('operator','/tracking/live');const dot=live.assets.find(a=>a.id==='AST-101');
  assert.deepEqual(dot.mapPosition,{x:33,y:44});assert.equal(dot.zone,'Live room');
  assert.ok(!live.assets.some(a=>a.id==='AST-102'));
  assert.equal((await request('operator','/tracking/observations','POST',{...input,at:'2099-01-01T00:00:00.000Z'})).status,400);
});

test('custody changes update the registry and observed custody without refreshing last seen', async () => {
  const before=await models.AssetPresence.findById('AST-101').lean();
  await ok('operator','/custody','POST',{assetId:'AST-101',holder:'Field owner',action:'Checked Out'},201);
  const after=await models.AssetPresence.findById('AST-101').lean();
  assert.equal(after.custodian,'Field owner');assert.equal(after.custody,'Checked Out');assert.equal(after.lastSeen.toISOString(),before.lastSeen.toISOString());
  assert.equal((await request('foreign','/custody','POST',{assetId:'AST-101',holder:'Foreign owner',action:'Checked Out'})).status,404);
});

test('technician roster mutations and lists remain facility scoped', async () => {
  const {TECHNICIAN_SKILLS,SHIFT_LABELS,WEEKDAY_LABELS}=await import('@access-genie/shared');
  const input={name:'Foreign technician',title:'Field technician',department:'Maintenance',skills:[TECHNICIAN_SKILLS[0]],locationId:'FB',shift:{label:SHIFT_LABELS[0],start:8,end:16},workingDays:[WEEKDAY_LABELS[0]],email:'roster@stage4.test'};
  assert.equal((await request('operator','/technicians','POST',input)).status,404);
  const tech=await ok('foreign','/technicians','POST',input,201);
  assert.ok(!(await ok('operator','/technicians')).some(r=>r.id===tech.id));
  assert.equal((await request('operator',`/technicians/${tech.id}`,'PATCH',{active:false})).status,404);
  assert.equal((await ok('foreign',`/technicians/${tech.id}`,'PATCH',{active:false})).active,false);
});

test('explicit asset and mismatched tag are refused before recording a sighting', async () => {
  const before=await models.AssetPresence.findById('AST-101').lean();
  assert.equal((await request('operator','/tracking/observations','POST',{assetId:'AST-101',tagId:'FOREIGN-TAG',source:'ble'})).status,400);
  assert.equal((await models.AssetPresence.findById('AST-101')).lastSeen.toISOString(),before.lastSeen.toISOString());
});
