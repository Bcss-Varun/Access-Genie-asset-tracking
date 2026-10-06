// Live sync suite — Maintenance: work orders, PM schedules, inspections,
// predictive alerts, technicians / field work and the maintenance dashboard.
//
// Every test asserts the CORRECT behaviour: a record created or changed on one
// screen must show up — stored, displayed, counted and ordered properly — on
// every other screen that lists it, after client-side navigation and without a
// reload. Tests that fail are app bugs (each one names its root cause in the
// suite report), not flaky waits.
//
// Run:
//   node --experimental-websocket --import tsx --test Testing/harness/sync/maintenance.test.mjs
import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';
import { startEnv, assetBody, nameOf } from './env.mjs';

let env;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const DAY = 86_400_000;
const isoInDays = (d) => new Date(Date.now() + d * DAY).toISOString();
const dateInDays = (d) => isoInDays(d).slice(0, 10);

/** Shared state — the tests run in order and build on each other. */
const S = { assets: {}, wo: {} };

before(async () => { env = await startEnv({ estate: 'fresh', browser: true }); }, { timeout: 240000 });
after(async () => { await env?.stop(); });

// ─────────────────────────────────────────────────────────────────────────────
// Helpers (kept in this file — env.mjs is shared with other suites)
// ─────────────────────────────────────────────────────────────────────────────

const page = () => env.page;

/**
 * Sign in as someone else. `env.login` drives the login form, which a signed-in
 * session never sees (it is redirected straight back to the workspace), so the
 * session cookie and storage are cleared first.
 */
async function switchUser(who) {
  await page().send('Network.clearBrowserCookies');
  await page().eval('try { localStorage.clear(); sessionStorage.clear(); } catch {} return true;');
  await env.login(who);
}

/** Wait for a KPI tile to render (its caption is CSS-uppercased, so not matchable by innerText). */
async function waitTile(label, timeout = 15000) {
  return env.until(async () => (await tile(label)) !== null, `tile "${label}" renders`, timeout);
}

/** Visible text of the routed screen only — excludes the sidebar and toasts. */
async function mainText() {
  return page().eval(`const m = document.querySelector('#main'); return m ? m.innerText : (document.body?.innerText ?? '');`);
}

async function expectMain(text, timeout = 12000, label) {
  const t0 = Date.now();
  while (Date.now() - t0 < timeout) {
    if ((await mainText()).includes(text)) return;
    await sleep(200);
  }
  const path = await page().eval('return location.pathname + location.search');
  await page().shot(`sync-maint-missing-${String(label ?? text).replace(/[^a-z0-9]+/gi, '-').slice(0, 60)}`);
  assert.fail(`${label ? `${label}: ` : ''}expected "${text}" on ${path}. Screen text starts:\n${(await mainText()).slice(0, 1200)}`);
}

async function expectNoMain(text, wait = 1500, label) {
  await sleep(wait);
  const body = await mainText();
  const path = await page().eval('return location.pathname + location.search');
  assert.ok(!body.includes(text), `${label ? `${label}: ` : ''}did not expect "${text}" on ${path}`);
}

/** Wait for a clickable element by exact text / aria-label / title (falls back to contains). */
async function click(label, { sel = 'button,[role=menuitem],a', within = '', timeout = 10000 } = {}) {
  const js = `
    const root = ${within ? `document.querySelector(${JSON.stringify(within)})` : 'document'};
    if (!root) return 'no-root';
    const els = [...root.querySelectorAll(${JSON.stringify(sel)})].filter((e) => e.getClientRects().length > 0);
    const want = ${JSON.stringify(label)};
    const txt = (e) => (e.innerText || e.value || '').trim();
    const el = els.find((e) => txt(e) === want)
      || els.find((e) => e.getAttribute('aria-label') === want)
      || els.find((e) => e.getAttribute('title') === want)
      || els.find((e) => txt(e).includes(want));
    if (!el) return 'missing';
    if (el.disabled) return 'disabled';
    el.scrollIntoView({ block: 'center' });
    el.click();
    return 'ok';`;
  let last;
  const t0 = Date.now();
  while (Date.now() - t0 < timeout) {
    last = await page().eval(js);
    if (last === 'ok') return;
    await sleep(200);
  }
  await page().shot(`sync-maint-click-${label.replace(/[^a-z0-9]+/gi, '-').slice(0, 40)}`);
  assert.fail(`could not click "${label}" (${last}) on ${await page().eval('return location.pathname')}`);
}

/** Set a React-controlled control found by a CSS selector run inside the page. */
const SET_VALUE = `
  function setValue(el, value) {
    const proto = el.tagName === 'SELECT' ? HTMLSelectElement.prototype
      : el.tagName === 'TEXTAREA' ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
    Object.getOwnPropertyDescriptor(proto, 'value').set.call(el, value);
    el.dispatchEvent(new Event('input', { bubbles: true }));
    el.dispatchEvent(new Event('change', { bubbles: true }));
  }`;

/** Fill the control inside the <label> whose text starts with `label`. */
async function fillLabel(label, value, { within = '' } = {}) {
  const ok = await env.until(() => page().eval(`${SET_VALUE}
    const root = ${within ? `document.querySelector(${JSON.stringify(within)})` : 'document'};
    if (!root) return false;
    const labels = [...root.querySelectorAll('label')].filter((l) => l.getClientRects().length > 0);
    const want = ${JSON.stringify(label)};
    // textContent, not innerText: the caption is CSS-uppercased, and innerText
    // reports the transformed text ("NAME*").
    const l = labels.find((x) => (x.textContent || '').trim().toLowerCase().startsWith(want.toLowerCase()));
    if (!l) return false;
    const el = l.querySelector('input,select,textarea') || (l.htmlFor && document.getElementById(l.htmlFor));
    if (!el) return false;
    setValue(el, ${JSON.stringify(value)});
    return true;`), `fill "${label}"`);
  return ok;
}

async function fillPlaceholder(fragment, value, { blur = false } = {}) {
  return env.until(() => page().eval(`${SET_VALUE}
    const el = [...document.querySelectorAll('input,textarea')].find((e) => (e.placeholder || '').includes(${JSON.stringify(fragment)}) && e.getClientRects().length > 0);
    if (!el) return false;
    el.focus();
    setValue(el, ${JSON.stringify(value)});
    ${blur ? `el.dispatchEvent(new FocusEvent('focusout', { bubbles: true })); el.blur();` : ''}
    return true;`), `fill placeholder "${fragment}"`);
}

/** Drive the shared <AssetPicker>: search, then click the match. */
async function pickAsset(name) {
  await fillPlaceholder('assets by name', name);
  await env.until(() => page().eval(`
    const btn = [...document.querySelectorAll('button')].find((b) => b.getClientRects().length > 0 && b.querySelector('span') && b.querySelector('span').innerText.trim() === ${JSON.stringify(name)});
    if (!btn) return false;
    btn.click();
    return true;`), `pick asset ${name}`);
}

/** Submit the open <FormDialog>. */
async function submitDialog(label) {
  await click(label, { within: '[role=dialog]', sel: 'button[type=submit]' });
}

/**
 * Close the "work order completed" summary if it is showing. It can unmount
 * with the row it was opened from (a completed job leaves /my-work), in which
 * case there is nothing to dismiss.
 */
async function dismissSummary() {
  await sleep(500);
  await page().eval(`const b = [...document.querySelectorAll('[role=dialog] button[type=submit]')].find((x) => x.innerText.trim() === 'Done'); if (b) b.click(); return true;`);
}

/** Read a KPI / metric tile by its label (MetricCard, KpiCard, KpiTile, KpiStrip). */
async function tile(label) {
  return page().eval(`
    const want = ${JSON.stringify(label)}.toLowerCase();
    const root = document.querySelector('#main') || document.body;
    const leaves = [...root.querySelectorAll('div,span')].filter((e) => e.children.length === 0 && e.textContent.trim().toLowerCase() === want);
    for (const leaf of leaves) {
      let node = leaf;
      for (let i = 0; i < 3 && node; i++) {
        let sib = node.nextElementSibling;
        while (sib) {
          const t = sib.textContent.trim();
          if (/^[\\d,.]+%?$/.test(t)) return Number(t.replace(/[,%]/g, ''));
          sib = sib.nextElementSibling;
        }
        node = node.parentElement;
      }
    }
    return null;`);
}

async function expectTile(label, expected, why) {
  let last;
  try {
    await env.until(async () => { last = await tile(label); return last === expected; }, `tile ${label}`, 8000);
  } catch {
    await page().shot(`sync-maint-tile-${label.replace(/[^a-z0-9]+/gi, '-')}`);
    assert.fail(`${why ?? ''} tile "${label}" on ${await page().eval('return location.pathname')} shows ${last}, expected ${expected}`);
  }
}

/** WO ids in the order the screen shows them (first appearance). */
async function woOrder() {
  const text = await mainText();
  return [...new Set(text.match(/WO-\d+/g) ?? [])];
}

/** The ids must read as numbers — monotone ascending or descending — never as strings. */
function assertNumericOrder(ids, where) {
  const nums = ids.map((id) => Number(id.split('-')[1]));
  const asc = nums.every((n, i) => i === 0 || n > nums[i - 1]);
  const desc = nums.every((n, i) => i === 0 || n < nums[i - 1]);
  assert.ok(asc || desc, `${where}: work orders are ordered as strings, not numbers → ${ids.join(', ')}`);
}

/** Which board column a card sits in, and that column's header count. */
async function boardColumnOf(id) {
  return page().eval(`
    const link = [...document.querySelectorAll('#main a')].find((a) => a.getAttribute('href') === '/maintenance/${id}' && a.textContent.trim() === '${id}');
    if (!link) return null;
    let n = link;
    while (n && !(typeof n.className === 'string' && n.className.includes('min-w-[15.5rem]'))) n = n.parentElement;
    if (!n) return null;
    const head = n.firstElementChild;
    return { status: head.querySelector('.font-semibold')?.textContent.trim(), count: Number(head.querySelector('.rounded-full.bg-white')?.textContent.trim()) };`);
}

async function boardColumnCount(status) {
  return page().eval(`
    const cols = [...document.querySelectorAll('#main div')].filter((d) => typeof d.className === 'string' && d.className.includes('min-w-[15.5rem]'));
    for (const c of cols) {
      const head = c.firstElementChild;
      if (head.querySelector('.font-semibold')?.textContent.trim() === ${JSON.stringify(status)}) return Number(head.querySelector('.rounded-full.bg-white')?.textContent.trim());
    }
    return null;`);
}

/** The lifecycle board column (on /lifecycle) that holds an asset card. */
async function lifecycleColumnOf(assetName) {
  return page().eval(`
    const cols = [...document.querySelectorAll('#main .glass-panel')].filter((d) => d.className.includes('w-80'));
    for (const c of cols) if (c.innerText.includes(${JSON.stringify(assetName)})) return c.querySelector('h2')?.textContent.trim();
    return null;`);
}

/** Text of the Asset 360 "Lifecycle" key/value. */
async function asset360Lifecycle() {
  return page().eval(`
    const dt = [...document.querySelectorAll('#main dt')].find((d) => d.textContent.trim() === 'Lifecycle');
    return dt ? dt.nextElementSibling?.textContent.trim() : null;`);
}

async function inService(id) {
  for (const toStage of ['Available', 'Assigned / In Service']) {
    const r = await env.request('admin', `/assets/${id}/lifecycle/transition`, 'POST', { toStage, reason: 'Sync suite setup' });
    assert.ok([200, 201].includes(r.status), `lifecycle ${id} → ${toStage}: ${r.status} ${JSON.stringify(r.body)}`);
  }
  const doc = await env.models.Asset.findById(id).lean();
  assert.equal(doc.lifecycleStage, 'Assigned / In Service', `${id} set up in service`);
}

async function newAsset(key, name, overrides) {
  const a = await env.ok('admin', '/assets', 'POST', assetBody(name, overrides));
  await inService(a.id);
  S.assets[key] = { id: a.id, name };
  return S.assets[key];
}

async function apiWo(assetId, title, extra = {}) {
  return env.ok('admin', '/work-orders', 'POST', {
    title, assetId, type: 'Corrective', priority: 'Medium', source: 'Manual', dueDate: isoInDays(10), ...extra,
  }, 201);
}

const stageOf = async (assetId) => (await env.models.Asset.findById(assetId).lean()).lifecycleStage;

/** Pause long enough for the server's debounced derivation pass to settle. */
const settle = () => sleep(300);

// ─────────────────────────────────────────────────────────────────────────────
// Setup
// ─────────────────────────────────────────────────────────────────────────────

test('setup: assets in service, admin signed in', { timeout: 120000 }, async () => {
  await newAsset('pump', 'Sync Pump Alpha');
  await newAsset('compressor', 'Sync Compressor Beta');
  await newAsset('chiller', 'Sync Chiller Gamma');
  await newAsset('boiler', 'Sync Boiler Delta');
  await newAsset('panel', 'Sync Fire Panel Epsilon');
  await newAsset('motor', 'Sync Motor Zeta');
  await newAsset('conveyor', 'Sync Conveyor Eta');
  await newAsset('fan', 'Sync Fan Theta');
  await newAsset('crane', 'Sync Crane Iota');
  await env.login('admin');
});

// ─────────────────────────────────────────────────────────────────────────────
// 1. Create through /maintenance/new
// ─────────────────────────────────────────────────────────────────────────────

test('WO created via /maintenance/new is stored correctly and shows on board, list, /work-orders, /scheduling, /my-work and Asset 360', { timeout: 120000 }, async () => {
  const asset = S.assets.pump;
  const title = 'Sync replace pump seal';
  await env.go('/maintenance');
  await expectMain('Automated Work Orders');

  await env.go('/maintenance/new');
  await expectMain('New Work Order');
  await pickAsset(asset.name);
  await page().fill('#wo-title', title);
  await page().fill('#wo-priority', 'High');
  await page().fill('#wo-due', dateInDays(7));
  await click('Create work order');
  await env.until(async () => /^\/maintenance\/WO-\d+$/.test(await page().eval('return location.pathname')), 'navigates to the new work order');
  const id = (await page().eval('return location.pathname')).split('/').pop();
  S.wo.ui = { id, title, assetId: asset.id };
  assert.equal(id, 'WO-1', 'fresh install numbers work orders from WO-1');
  await expectMain(title);

  // Stored with who / when / what.
  const doc = await env.models.WorkOrder.findById(id).lean();
  assert.equal(doc.title, title);
  assert.equal(doc.assetId, asset.id);
  assert.equal(doc.assetName, asset.name);
  assert.equal(doc.status, 'New');
  assert.equal(doc.priority, 'High');
  assert.equal(doc.source, 'Manual');
  assert.equal(doc.history.length, 1);
  assert.equal(doc.history[0].actor, nameOf('admin'));
  assert.ok(doc.createdAt, 'createdAt stored');
  // Type Maintenance: the automated lifecycle move writes its own 'Lifecycle'
  // row whose reason also names the order.
  const activity = await env.models.Activity.find({ assetId: asset.id, type: 'Maintenance', description: new RegExp(`${id} raised`) }).lean();
  assert.equal(activity.length, 1, 'one maintenance activity row for the raise');
  assert.equal(activity[0].actor, nameOf('admin'));

  await env.go('/maintenance');
  await expectMain(title, 12000, 'board');
  const col = await boardColumnOf(id);
  assert.deepEqual(col?.status, 'New', `board column for ${id}`);
  assert.equal(col.count, 1, 'New column count');
  await expectTile('Open', 1);
  await expectTile('Unassigned', 1);

  await click('list');
  await expectMain(title, 12000, 'list view');

  await env.go('/work-orders');
  await expectMain(title, 12000, '/work-orders');
  await expectTile('Open', 1);

  await env.go('/scheduling');
  await expectMain(title, 12000, '/scheduling unassigned queue');

  await env.go('/my-work');
  await expectMain(title, 12000, '/my-work');

  await env.go(`/assets/${asset.id}?tab=maintenance`);
  await expectMain(title, 12000, 'Asset 360 maintenance tab');
});

test('WO raised against an in-service asset moves it to lifecycle stage Maintenance on Asset 360 and /lifecycle', { timeout: 60000 }, async () => {
  const asset = S.assets.pump;
  assert.equal(await stageOf(asset.id), 'Maintenance', 'stored stage');
  await env.go(`/assets/${asset.id}`);
  await env.until(async () => (await asset360Lifecycle()) === 'Maintenance', 'Asset 360 lifecycle shows Maintenance');
  await env.go('/lifecycle');
  await env.until(async () => (await lifecycleColumnOf(asset.name)) === 'Maintenance', '/lifecycle board puts the asset under Maintenance');
  await env.go(`/assets/${asset.id}?tab=timeline`);
  await expectMain(`Work order ${S.wo.ui.id} raised`, 12000, 'Asset 360 timeline shows the raise');
});

test('home dashboard "Under maintenance" tile counts the asset the open work order pulled into Maintenance', { timeout: 60000 }, async () => {
  // The asset is in lifecycle stage Maintenance (previous test) — the home
  // dashboard should agree it is under maintenance.
  await env.reload('/');
  await waitTile('Open work orders');
  const api = await env.ok('admin', '/dashboard/summary?period=30d');
  const shown = await tile('Under maintenance');
  assert.ok(shown >= 1 && api.kpis.assetsUnderMaintenance.value >= 1,
    `"Under maintenance" shows ${shown} (API ${api.kpis.assetsUnderMaintenance.value}) although ${S.assets.pump.id} is in lifecycle stage ${await stageOf(S.assets.pump.id)} with an open work order`);
});

// ─────────────────────────────────────────────────────────────────────────────
// 2. Create through Asset 360 — the board/dashboards must not be stale
// ─────────────────────────────────────────────────────────────────────────────

test('WO created from Asset 360 appears on the /maintenance board after client-side navigation (no reload)', { timeout: 90000 }, async () => {
  const asset = S.assets.compressor;
  await env.go('/maintenance'); // the board is in the cache now — as it is for anyone who looked at it
  await expectMain(S.wo.ui.title);
  await env.go(`/assets/${asset.id}`);
  await expectMain(asset.name);
  await click('+ Create Work Order');
  await expectMain(`Health check — ${asset.name}`, 12000, 'Asset 360 maintenance tab after create');
  const doc = await env.models.WorkOrder.findOne({ assetId: asset.id }).lean();
  assert.ok(doc, 'stored');
  S.wo.a360 = { id: doc._id, title: doc.title, assetId: asset.id };
  assert.equal(doc._id, 'WO-2');

  await env.go('/maintenance');
  await expectMain(doc.title, 6000, '/maintenance board after Asset 360 create');
  await expectTile('Open', 2, 'header count');
});

test('home dashboard and /maintenance/dashboard KPIs update after a work order is created (no reload)', { timeout: 90000 }, async () => {
  const asset = S.assets.fan;
  await env.go('/');
  await waitTile('Open work orders');
  await env.go('/maintenance/dashboard');
  await expectMain('Maintenance Dashboard');
  const before = await tile('Open Work Orders');

  // Create through the UI form, the way a planner would.
  await env.go('/maintenance/new');
  await pickAsset(asset.name);
  await page().fill('#wo-title', 'Sync fan bearing noise');
  await click('Create work order');
  await env.until(async () => /^\/maintenance\/WO-\d+$/.test(await page().eval('return location.pathname')), 'created');
  S.wo.fan = { id: (await page().eval('return location.pathname')).split('/').pop(), title: 'Sync fan bearing noise', assetId: asset.id };

  const md = await env.ok('admin', '/maintenance-dashboard');
  const mdOpen = md.kpis.find((k) => k.id === 'open').value;
  assert.equal(mdOpen, before + 1, 'API counts the new order');
  await env.go('/maintenance/dashboard');
  await expectTile('Open Work Orders', mdOpen, '/maintenance/dashboard');

  const home = await env.ok('admin', '/dashboard/summary?period=30d');
  await env.go('/');
  await expectTile('Open work orders', home.kpis.openWorkOrders.value, 'home dashboard');
});

// ─────────────────────────────────────────────────────────────────────────────
// 3. Ordering — enough work orders to cross WO-9 → WO-10
// ─────────────────────────────────────────────────────────────────────────────

test('ordering: lists never sort work orders as strings (WO-10 before WO-4)', { timeout: 120000 }, async () => {
  const asset = S.assets.chiller;
  const due = isoInDays(12);
  S.bulk = [];
  for (let i = 0; i < 9; i++) {
    const wo = await apiWo(asset.id, `Sync chiller task ${String(i + 1).padStart(2, '0')}`, { dueDate: due });
    S.bulk.push(wo.id);
  }
  const nums = S.bulk.map((id) => Number(id.split('-')[1]));
  assert.ok(nums.some((n) => n < 10) && nums.some((n) => n >= 10), `bulk crossed WO-9 → WO-10: ${S.bulk.join(',')}`);
  const dataset = await env.ok('admin', '/dataset');
  console.log('dataset WO order:', dataset.workOrders.map((w) => w.id).join(','));

  const failures = [];
  const check = async (where, scopeIds = S.bulk) => {
    const shown = (await woOrder()).filter((id) => scopeIds.includes(id));
    try {
      assert.equal(shown.length, scopeIds.length, `${where}: all ${scopeIds.length} same-due orders listed (saw ${shown.join(',')})`);
      assertNumericOrder(shown, where);
    } catch (err) { failures.push(err.message); }
  };

  await env.reload('/maintenance');
  await expectMain('Sync chiller task 09');
  await check('/maintenance board (New column, due-date sort)');
  await click('list');
  await expectMain('Sync chiller task 09');
  await check('/maintenance list (default due-date sort)');

  await env.go('/work-orders');
  await expectMain('Sync chiller task 09');
  await check('/work-orders register');

  await env.go('/scheduling');
  await expectMain('Sync chiller task 09');
  await check('/scheduling unassigned queue');

  await env.go('/my-work');
  await expectMain('Sync chiller task 09');
  await check('/my-work queue');

  await env.go(`/assets/${asset.id}?tab=maintenance`);
  await expectMain('Sync chiller task 09');
  await check('Asset 360 maintenance tab');

  assert.deepEqual(failures, [], failures.join('\n'));
});

test('ordering: the Asset 360 maintenance tab lists newest work orders first', { timeout: 60000 }, async () => {
  await env.go(`/assets/${S.assets.chiller.id}?tab=maintenance`);
  await expectMain('Sync chiller task 09');
  const shown = (await woOrder()).filter((id) => S.bulk.includes(id));
  const newestFirst = [...S.bulk].sort((a, b) => Number(b.split('-')[1]) - Number(a.split('-')[1]));
  assert.deepEqual(shown, newestFirst, 'Asset 360 maintenance history should read newest first');
});

// ─────────────────────────────────────────────────────────────────────────────
// 4. Transitions from the board and the detail page
// ─────────────────────────────────────────────────────────────────────────────

test('board "→" advance to Assigned asks who, then moves the card, updates column counts, /work-orders and the detail page', { timeout: 90000 }, async () => {
  const id = S.bulk[0];
  await env.go('/maintenance');
  await expectMain(id);
  const newBefore = await boardColumnCount('New');
  await click(`Move ${id} to Assigned`);
  // Assigned names a person, so the advance asks for one first.
  await expectMain(`Assign ${id}`, 8000, 'the advance asks for a technician');
  await env.until(() => page().eval(`return [...document.querySelectorAll('[role=dialog] option')].some((o) => o.value === ${JSON.stringify(nameOf('tech'))})`), 'roster in the dialog');
  await fillLabel('Technician', nameOf('tech'), { within: '[role=dialog]' });
  await submitDialog('Assign');
  await env.until(async () => (await boardColumnOf(id))?.status === 'Assigned', `${id} lands in Assigned`);
  assert.equal(await boardColumnCount('New'), newBefore - 1, 'New column count drops');
  assert.equal(await boardColumnCount('Assigned'), 1, 'Assigned column count rises');
  const doc = await env.models.WorkOrder.findById(id).lean();
  assert.equal(doc.status, 'Assigned');
  assert.equal(doc.assignedTo, nameOf('tech'));
  assert.equal(doc.history.at(-1).actor, nameOf('admin'));
  assert.equal(doc.history.at(-1).note, `Assigned to ${nameOf('tech')}`);

  await env.go('/work-orders');
  await expectTile('Assigned', 1, '/work-orders');
  await env.go(`/maintenance/${id}`);
  await expectMain('Status History');
  await expectMain('New\n→\nAssigned', 8000, 'history shows New → Assigned');
});

test('a WO cannot be moved to Assigned with nobody on it, and unassigning returns it to New', { timeout: 30000 }, async () => {
  // The board's primary action used to move New → Assigned without asking who,
  // storing a job counted as dispatched that sat in nobody's queue.
  const wo = await apiWo(S.assets.crane.id, 'Sync crane pendant check');
  const refused = await env.request('admin', `/work-orders/${wo.id}/status`, 'POST', { status: 'Assigned' });
  assert.equal(refused.status, 400, `POST /status Assigned on an unassigned order → ${refused.status}`);
  let doc = await env.models.WorkOrder.findById(wo.id).lean();
  assert.equal(doc.status, 'New', 'nothing written');

  await env.ok('admin', `/work-orders/${wo.id}/assign`, 'POST', { assignedTo: nameOf('tech') });
  await env.ok('admin', `/work-orders/${wo.id}/assign`, 'POST', { assignedTo: 'Unassigned' });
  doc = await env.models.WorkOrder.findById(wo.id).lean();
  assert.equal(doc.assignedTo, 'Unassigned');
  assert.equal(doc.status, 'New', `released order is stored as status=${doc.status}, assignedTo=${doc.assignedTo}`);
  assert.deepEqual(doc.history.map((h) => `${h.from ?? '∅'}→${h.to}`), ['∅→New', 'New→Assigned', 'Assigned→New']);
  await env.ok('admin', `/work-orders/${wo.id}/status`, 'POST', { status: 'Cancelled' });
});

test('detail page: assign via "Assign ▾" updates the page, the board, /work-orders and the facets count', { timeout: 90000 }, async () => {
  const { id, title } = S.wo.ui;
  await env.go(`/maintenance/${id}`);
  await expectMain(title);
  await click('Assign ▾');
  await click(nameOf('tech'), { sel: '[role=menuitem]' });
  // textContent: the "Assigned to" caption is CSS-uppercased in innerText.
  await env.until(() => page().eval(`const d = [...document.querySelectorAll('#main div')].find((x) => x.children.length === 0 && x.textContent.trim() === 'Assigned to'); return d?.nextElementSibling?.textContent.trim() === ${JSON.stringify(nameOf('tech'))};`), 'detail page shows the assignee');
  const doc = await env.models.WorkOrder.findById(id).lean();
  assert.equal(doc.assignedTo, nameOf('tech'));
  assert.equal(doc.status, 'Assigned', 'assigning a New order advances it');

  await env.go('/maintenance');
  await env.until(async () => (await boardColumnOf(id))?.status === 'Assigned', 'board shows it under Assigned');
  await env.go('/work-orders');
  await expectMain(title);
  const row = await page().eval(`const tr = [...document.querySelectorAll('#main tr')].find((r) => r.innerText.includes(${JSON.stringify(id)})); return tr ? tr.innerText : null;`);
  assert.ok(row?.includes(nameOf('tech')), `/work-orders row shows the technician: ${row}`);
});

test('detail page field panel: "Accept" updates the field stage on the page without a reload', { timeout: 60000 }, async () => {
  const { id } = S.wo.ui;
  await env.go(`/maintenance/${id}`);
  await expectMain('Field: Assigned');
  await click('Accept');
  await env.until(async () => (await env.models.WorkOrder.findById(id).lean()).comments.some((c) => c.text === 'Stage: Accepted'), 'comment stored');
  try {
    await env.until(async () => (await mainText()).includes('Field: Accepted'), 'field badge updates', 6000);
  } catch {
    await page().shot('sync-maint-field-accept-stale');
    assert.fail('After "Accept" the work order page still shows "Field: Assigned" and still offers "Accept" — the comment was saved but the page never re-read the work order');
  }
});

test('detail page field panel: En Route → On Site → Start → Complete closes the order, history in order, asset back In Service everywhere', { timeout: 120000 }, async () => {
  const { id, title, assetId } = S.wo.ui;
  const asset = S.assets.pump;
  // Each step reloads first, so this test exercises persistence even while the
  // previous test's refresh bug stands.
  const step = async (button, stored) => {
    await env.reload(`/maintenance/${id}`);
    await expectMain(title);
    await click(button);
    await env.until(async () => stored(await env.models.WorkOrder.findById(id).lean()), `${button} stored`);
  };
  await step('En Route', (d) => d.comments.some((c) => c.text === 'Stage: En Route'));
  await step('Arrived — On Site', (d) => d.comments.some((c) => c.text === 'Stage: On Site'));
  await step('Start Work', (d) => d.status === 'In Progress');

  await env.reload(`/maintenance/${id}`);
  await expectMain('Field: In Progress');
  await click('Complete', { sel: 'button' });
  await expectMain('Complete ' + id, 8000);
  await fillPlaceholder('Full name', nameOf('admin'));
  await submitDialog('Complete Work Order');
  await env.until(async () => (await env.models.WorkOrder.findById(id).lean()).status === 'Completed', 'completed');
  await dismissSummary();

  const doc = await env.models.WorkOrder.findById(id).lean();
  assert.ok(doc.completedAt, 'completedAt stored');
  assert.deepEqual(doc.history.map((h) => `${h.from ?? '∅'}→${h.to}`), ['∅→New', 'New→Assigned', 'Assigned→In Progress', 'In Progress→Completed']);
  for (let i = 1; i < doc.history.length; i++) assert.ok(new Date(doc.history[i].at) >= new Date(doc.history[i - 1].at), 'history chronological');
  assert.equal(await stageOf(assetId), 'Assigned / In Service', 'last open order completed → asset back in service');

  const failures = [];
  // The page the technician completed it on — without a reload.
  const statusKV = () => page().eval(`const dt = [...document.querySelectorAll('#main dt')].find((d) => d.textContent.trim() === 'Status'); return dt?.nextElementSibling?.textContent.trim();`);
  try { await env.until(async () => (await statusKV()) === 'Completed', 'detail page status', 6000); }
  catch { failures.push(`after "Complete Work Order" the detail page still shows status "${await statusKV()}" (and still offers the field panel) until reloaded`); }

  await env.reload(`/maintenance/${id}`);
  await expectMain('Completed — closed');
  const historyText = await page().eval(`const h = [...document.querySelectorAll('#main h3')].find((x) => x.textContent.startsWith('Status History')); return h ? h.parentElement.innerText : '';`);
  const order = ['In Progress\n→\nCompleted', 'Assigned\n→\nIn Progress', 'New\n→\nAssigned', 'Created as\nNew'].map((t) => historyText.indexOf(t));
  if (!order.every((p, i) => p >= 0 && (i === 0 || p > order[i - 1]))) failures.push(`status history not newest-first: ${historyText}`);

  await env.go(`/assets/${asset.id}`);
  try { await env.until(async () => (await asset360Lifecycle()) === 'Assigned / In Service', 'Asset 360 lifecycle', 8000); }
  catch { failures.push(`Asset 360 lifecycle shows "${await asset360Lifecycle()}"`); }
  await env.go('/lifecycle');
  try { await env.until(async () => (await lifecycleColumnOf(asset.name)) === 'Assigned / In Service', '/lifecycle', 8000); }
  catch { failures.push(`/lifecycle board shows the asset under "${await lifecycleColumnOf(asset.name)}"`); }
  await env.go('/maintenance');
  try { await env.until(async () => (await boardColumnOf(id))?.status === 'Completed', 'board', 8000); }
  catch { failures.push(`/maintenance board shows ${id} under "${(await boardColumnOf(id))?.status}"`); }
  assert.deepEqual(failures, [], failures.join('\n'));
});

test('Asset 360 "Open Work Orders" counts only open orders', { timeout: 30000 }, async () => {
  const asset = S.assets.pump; // its only order was completed above
  await env.go(`/assets/${asset.id}`);
  await expectMain('Key Attributes');
  const value = await page().eval(`const dt = [...document.querySelectorAll('#main dt')].find((d) => d.textContent.trim() === 'Open Work Orders'); return dt?.nextElementSibling?.textContent.trim();`);
  const open = await env.models.WorkOrder.countDocuments({ assetId: asset.id, status: { $nin: ['Completed', 'Cancelled'] } });
  assert.equal(Number(value), open, `Asset 360 says ${value} open work orders; the database has ${open}`);
});

test('detail page: comments and checklist ticks show immediately and persist', { timeout: 60000 }, async () => {
  const wo = await apiWo(S.assets.crane.id, 'Sync crane rope inspection', {
    checklist: [{ label: 'Check rope wear' }, { label: 'Lubricate drum' }],
  });
  S.wo.crane = { id: wo.id, title: wo.title };
  await env.go(`/maintenance/${wo.id}`);
  await expectMain('0/2 done');
  await page().eval(`const cb = [...document.querySelectorAll('#main input[type=checkbox]')][0]; cb.click(); return true;`);
  await expectMain('1/2 done', 8000, 'checklist tick');
  await fillPlaceholder('Add a comment', 'Sync rope looks frayed near hook');
  await click('Comment');
  await expectMain('Sync rope looks frayed near hook', 8000, 'comment');
  const doc = await env.models.WorkOrder.findById(wo.id).lean();
  assert.equal(doc.checklist[0].done, true);
  assert.equal(doc.comments.at(-1).author, nameOf('admin'));
  await env.reload(`/maintenance/${wo.id}`);
  await expectMain('1/2 done');
  await expectMain('Sync rope looks frayed near hook');
});

test('cancelling the only open WO on an asset returns it to In Service (not stuck in Maintenance)', { timeout: 60000 }, async () => {
  const asset = S.assets.conveyor;
  const wo = await apiWo(asset.id, 'Sync conveyor belt tracking');
  assert.equal(await stageOf(asset.id), 'Maintenance');
  await env.go(`/maintenance/${wo.id}`);
  await expectMain(wo.title);
  await click('Status ▾');
  await click('Cancelled', { sel: '[role=menuitem]' });
  await env.until(async () => (await env.models.WorkOrder.findById(wo.id).lean()).status === 'Cancelled', 'cancelled');
  await expectMain('Cancelled — closed', 8000);
  const stage = await stageOf(asset.id);
  await env.go(`/assets/${asset.id}`);
  const shown = await asset360Lifecycle();
  assert.equal(stage, 'Assigned / In Service', `asset ${asset.id} has no open work order but is stored in "${stage}" (Asset 360 shows "${shown}")`);
});

test('creating a WO with a technician stores it as Assigned, not New-with-an-assignee', { timeout: 60000 }, async () => {
  await env.go('/maintenance/new');
  await pickAsset(S.assets.crane.name);
  await page().fill('#wo-title', 'Sync crane brake test');
  await env.until(() => page().eval(`return [...document.querySelectorAll('#wo-assignee option')].some((o) => o.value === ${JSON.stringify(nameOf('tech'))})`), 'roster loaded');
  await page().fill('#wo-assignee', nameOf('tech'));
  await click('Create work order');
  await env.until(async () => /^\/maintenance\/WO-\d+$/.test(await page().eval('return location.pathname')), 'created');
  const id = (await page().eval('return location.pathname')).split('/').pop();
  const doc = await env.models.WorkOrder.findById(id).lean();
  assert.equal(doc.assignedTo, nameOf('tech'));
  assert.equal(doc.status, 'Assigned', `created with a technician but stored as "${doc.status}" (the board shows it under ${doc.status}, /work-orders counts it as "Open — Not yet assigned")`);
  assert.deepEqual(doc.history.map((h) => `${h.from ?? '∅'}→${h.to}`), ['∅→New', 'New→Assigned'], 'trail records the raise and the assignment');
  await expectMain('Status History');
  const kv = await page().eval(`const dt = [...document.querySelectorAll('#main dt')].find((d) => d.textContent.trim() === 'Status'); return dt?.nextElementSibling?.textContent.trim();`);
  assert.equal(kv, 'Assigned', 'the new order\'s page shows Assigned');
});

test('a facility manager of another site cannot change a work order outside their scope (nothing is written)', { timeout: 30000 }, async () => {
  const wo = await apiWo(S.assets.crane.id, 'Sync crane hook latch');
  const before = await env.models.WorkOrder.findById(wo.id).lean();
  const calls = {
    status: await env.request('fmB', `/work-orders/${wo.id}/status`, 'POST', { status: 'Cancelled' }),
    assign: await env.request('fmB', `/work-orders/${wo.id}/assign`, 'POST', { assignedTo: nameOf('tech') }),
    patch: await env.request('fmB', `/work-orders/${wo.id}`, 'PATCH', { title: 'Sync hijacked title' }),
    comment: await env.request('fmB', `/work-orders/${wo.id}/comments`, 'POST', { text: 'Sync cross-site comment' }),
    remove: await env.request('fmB', `/work-orders/${wo.id}`, 'DELETE'),
    create: await env.request('fmB', '/work-orders', 'POST', { title: 'Sync cross-site raise', assetId: S.assets.crane.id, type: 'Corrective', priority: 'Low', source: 'Manual', dueDate: isoInDays(5) }),
  };
  for (const [name, r] of Object.entries(calls)) assert.ok([403, 404].includes(r.status), `fmB ${name} on a FAC-A order → HTTP ${r.status}`);
  const doc = await env.models.WorkOrder.findById(wo.id).lean();
  assert.ok(doc, 'not deleted');
  assert.equal(doc.status, 'New', `FAC-A order is now stored as "${doc.status}"`);
  assert.equal(doc.assignedTo, 'Unassigned', `FAC-A order is now assigned to "${doc.assignedTo}"`);
  assert.equal(doc.title, before.title, 'title unchanged');
  assert.equal(doc.comments.length, before.comments.length, 'no comment added');
  assert.equal(await env.models.WorkOrder.countDocuments({ title: 'Sync cross-site raise' }), 0, 'no order raised against a FAC-A asset');
  await env.ok('admin', `/work-orders/${wo.id}/status`, 'POST', { status: 'Cancelled' }); // keep later counts simple
});

test('deleting the last open WO releases the asset and leaves no dangling links', { timeout: 30000 }, async () => {
  const asset = S.assets.conveyor; // back in service after the cancel test
  const wo = await apiWo(asset.id, 'Sync conveyor roller swap');
  assert.equal(await stageOf(asset.id), 'Maintenance');
  const r = await env.request('admin', `/work-orders/${wo.id}`, 'DELETE');
  assert.equal(r.status, 204);
  assert.equal(await stageOf(asset.id), 'Assigned / In Service', 'asset released when its only open order is deleted');
});

// ─────────────────────────────────────────────────────────────────────────────
// 5. Dispatch and the technician's own queue
// ─────────────────────────────────────────────────────────────────────────────

test('/scheduling assign → the /maintenance board shows the new assignee without a reload', { timeout: 90000 }, async () => {
  const id = S.bulk[1];
  await env.go('/maintenance');
  await expectMain(id);
  assert.equal((await boardColumnOf(id))?.status, 'New');
  await env.go('/scheduling');
  await expectMain(id);
  await click(id, { sel: 'button' });
  await click(`Assign to ${nameOf('tech').split(' ')[0]}`);
  await env.until(async () => (await env.models.WorkOrder.findById(id).lean()).assignedTo === nameOf('tech'), 'stored');
  S.wo.dispatched = { id, title: (await env.models.WorkOrder.findById(id).lean()).title };

  await env.go('/maintenance');
  await expectMain(id);
  const col = await boardColumnOf(id);
  assert.equal(col?.status, 'Assigned', `${id} was assigned in /scheduling but the board still shows it under "${col?.status}"`);
});

test('/workforce shows the dispatched job against the technician', { timeout: 60000 }, async () => {
  await env.go('/workforce');
  await expectMain(nameOf('tech'));
  await env.go('/workforce-reports');
  await expectMain(nameOf('tech'), 12000, '/workforce-reports lists the technician');
});

test('technician: /my-work lists the dispatched job; "Accept" updates the row without a reload', { timeout: 120000 }, async () => {
  const { id, title } = S.wo.dispatched;
  await switchUser('tech');
  await env.go('/my-work');
  await expectMain(title, 12000, 'tech /my-work');
  const rowText = () => page().eval(`const tr = [...document.querySelectorAll('#main tr')].find((r) => r.innerText.includes(${JSON.stringify(id)})); return tr ? tr.innerText : '';`);
  assert.ok((await rowText()).includes('Assigned'));
  await page().eval(`const tr = [...document.querySelectorAll('#main tr')].find((r) => r.innerText.includes(${JSON.stringify(id)})); [...tr.querySelectorAll('button')].find((b) => b.innerText.trim() === 'Accept').click(); return true;`);
  await env.until(async () => (await env.models.WorkOrder.findById(id).lean()).comments.some((c) => c.text === 'Stage: Accepted' && c.author === nameOf('tech')), 'stored as Tara');
  try {
    await env.until(async () => (await rowText()).includes('Accepted') && (await rowText()).includes('En Route'), 'row advances', 6000);
  } catch {
    await page().shot('sync-maint-mywork-stale');
    assert.fail(`/my-work row for ${id} still reads "${(await rowText()).replace(/\s+/g, ' ')}" after Accept — the stage was stored but the queue did not refresh`);
  }
});

test('technician: completing from /my-work removes the job from the queue and the KPI drops', { timeout: 120000 }, async () => {
  const { id } = S.wo.dispatched;
  // Walk it to In Progress through the API, then complete in the UI.
  for (const text of ['Stage: En Route', 'Stage: On Site']) await env.ok('tech', `/work-orders/${id}/comments`, 'POST', { text });
  await env.ok('tech', `/work-orders/${id}/status`, 'POST', { status: 'In Progress', note: 'Stage: In Progress' });
  await env.reload('/my-work');
  await expectMain(id);
  const before = await tile('Assigned');
  await page().eval(`const tr = [...document.querySelectorAll('#main tr')].find((r) => r.innerText.includes(${JSON.stringify(id)})); [...tr.querySelectorAll('button')].find((b) => b.innerText.trim() === 'Complete').click(); return true;`);
  await fillPlaceholder('Full name', nameOf('tech'));
  await submitDialog('Complete Work Order');
  await env.until(async () => (await env.models.WorkOrder.findById(id).lean()).status === 'Completed', 'completed');
  await dismissSummary();
  try {
    await env.until(async () => !(await woOrder()).includes(id), 'row leaves the queue', 6000);
  } catch {
    assert.fail(`${id} is Completed in the database but still listed on /my-work (Assigned tile ${await tile('Assigned')}, was ${before})`);
  }
  // Their last job done, a technician's queue is empty — not refilled with
  // everybody else's open work.
  if (before === 1) await expectMain("You're all caught up", 8000, 'empty queue after the last job');
  else await expectTile('Assigned', before - 1);
});

// ─────────────────────────────────────────────────────────────────────────────
// 6. Preventive maintenance
// ─────────────────────────────────────────────────────────────────────────────

test('PM schedule created on /pm appears in the table immediately, on /pm/:id, and in the KPI', { timeout: 90000 }, async () => {
  await switchUser('admin');
  await env.go('/pm');
  await expectMain('Preventive Maintenance');
  await click('New PM Schedule');
  await fillLabel('What the work is', 'Sync quarterly boiler overhaul');
  await pickAsset(S.assets.boiler.name);
  await fillLabel('First due', dateInDays(-1)); // already due
  await submitDialog('Create schedule');
  await env.until(async () => (await env.models.PmSchedule.countDocuments({ title: 'Sync quarterly boiler overhaul' })) === 1, 'stored');
  const pm = await env.models.PmSchedule.findOne({ title: 'Sync quarterly boiler overhaul' }).lean();
  S.pm = { id: pm._id, title: pm.title, nextDue: pm.nextDue };
  assert.equal(pm.assetId, S.assets.boiler.id);
  await expectTile('Total PM Plans', 1);
  await expectMain('Sync quarterly boiler overhaul', 6000, '/pm table right after "Create schedule"');
});

test('PM schedule is listed after navigating away and back, and on /pm/:id', { timeout: 60000 }, async () => {
  await env.go(`/pm/${S.pm.id}`);
  await expectMain(S.pm.title);
  await expectMain('No recorded completion');
  await env.go('/pm');
  await expectMain(S.pm.title, 12000, '/pm after client-side navigation');
  await expectMain('overdue');
});

test('"Raise due work" on /pm: the generated WO shows on /maintenance without a reload', { timeout: 90000 }, async () => {
  await env.go('/maintenance');
  await expectMain('Automated Work Orders');
  await env.go('/pm');
  await expectMain(S.pm.title);
  await click('Raise due work');
  await env.until(async () => (await env.models.WorkOrder.countDocuments({ title: new RegExp(`^${S.pm.title} —`) })) >= 1, 'PM work order raised');
  const wo = await env.models.WorkOrder.findOne({ title: new RegExp(`^${S.pm.title} —`) }).lean();
  S.wo.pm = { id: wo._id, title: wo.title };
  assert.equal(wo.source, 'Scheduled Maintenance');
  assert.equal(wo.history[0].actor, 'Maintenance automation');
  await env.go('/maintenance');
  await expectMain(wo.title, 6000, '/maintenance board after "Raise due work"');
});

test('"Raise due work": the generated WO is on /work-orders, Asset 360, and the schedule rolled forward on /pm', { timeout: 60000 }, async () => {
  await env.go('/work-orders');
  await expectMain(S.wo.pm.title, 12000, '/work-orders');
  await env.go(`/assets/${S.assets.boiler.id}?tab=maintenance`);
  await expectMain(S.wo.pm.title, 12000, 'Asset 360');
  const pm = await env.models.PmSchedule.findById(S.pm.id).lean();
  assert.ok(new Date(pm.nextDue) > new Date(S.pm.nextDue), 'nextDue advanced');
  await env.go('/pm');
  await expectMain(S.pm.title);
  const row = await page().eval(`const tr = [...document.querySelectorAll('#main tr')].find((r) => r.innerText.includes('${S.pm.id} ·')); return tr ? tr.innerText : '';`);
  assert.ok(/in \d+d/.test(row) && !row.includes('overdue'), `/pm shows the rolled-forward due date: ${row}`);
});

test('PM-raised WO moves the asset to Maintenance and is on its timeline, like any other raised WO', { timeout: 60000 }, async () => {
  const failures = [];
  const stage = await stageOf(S.assets.boiler.id);
  if (stage !== 'Maintenance') failures.push(`asset ${S.assets.boiler.id} stage is "${stage}" with open PM order ${S.wo.pm.id}`);
  const activity = await env.models.Activity.countDocuments({ assetId: S.assets.boiler.id, description: new RegExp(S.wo.pm.id) });
  if (activity === 0) failures.push(`no Activity row for ${S.wo.pm.id} — the asset timeline never shows it was raised`);
  await env.go(`/assets/${S.assets.boiler.id}?tab=timeline`);
  if (!(await mainText()).includes(S.wo.pm.id)) failures.push(`Asset 360 timeline does not mention ${S.wo.pm.id}`);
  assert.deepEqual(failures, [], failures.join('\n'));
});

test('completing the PM work order shows on /pm (completed work, plans serviced) and /pm/:id (last done)', { timeout: 60000 }, async () => {
  const id = S.wo.pm.id;
  await env.ok('admin', `/work-orders/${id}/status`, 'POST', { status: 'In Progress' });
  await env.go(`/maintenance/${id}`);
  await expectMain(S.wo.pm.title);
  await click('Advance to Completed →');
  await env.until(async () => (await env.models.WorkOrder.findById(id).lean()).status === 'Completed', 'completed');
  await env.go('/pm');
  await expectTile('Plans serviced', 1);
  await env.go(`/pm/${S.pm.id}`);
  await expectNoMain('No recorded completion', 500, '/pm/:id last done');
});

test('PM history matches schedule ids exactly (PM-1 does not absorb PM-10\'s completions)', { timeout: 90000 }, async () => {
  // Fill PM-2 … PM-9 elsewhere, then PM-10 on the same asset as PM-1.
  for (let i = 2; i <= 9; i++) {
    await env.ok('admin', '/pm-schedules', 'POST', { title: `Sync filler plan ${i}`, assetId: S.assets.fan.id, frequency: 'Annual', type: 'Preventive', nextDue: isoInDays(200), estHours: 1, assignedTeam: 'Unassigned' });
  }
  const pm10 = await env.ok('admin', '/pm-schedules', 'POST', { title: 'Sync boiler burner tune', assetId: S.assets.boiler.id, frequency: 'Monthly', type: 'Preventive', nextDue: isoInDays(-1), estHours: 1, assignedTeam: 'Unassigned' });
  assert.equal(pm10.id, 'PM-10');
  await env.ok('admin', '/pm-schedules/run-automation', 'POST', {});
  const wo = await env.models.WorkOrder.findOne({ title: /^Sync boiler burner tune —/ }).lean();
  assert.ok(wo, 'PM-10 order raised');
  await env.ok('admin', `/work-orders/${wo._id}/status`, 'POST', { status: 'In Progress' });
  await env.ok('admin', `/work-orders/${wo._id}/status`, 'POST', { status: 'Completed' });
  await env.reload('/pm');
  await expectMain('Sync boiler burner tune');
  const cell = await page().eval(`const tr = [...document.querySelectorAll('#main tr')].find((r) => r.innerText.includes('${S.pm.id} ·')); return tr ? tr.children[4].innerText.trim() : null;`);
  assert.equal(cell, '1', `${S.pm.id} "Completed work" shows ${cell} — it counts PM-10's completion because "schedule PM-1" is a substring of "schedule PM-10"`);
});

test('automation run twice at once raises one work order per due schedule (no duplicates)', { timeout: 60000 }, async () => {
  const pm = await env.ok('admin', '/pm-schedules', 'POST', { title: 'Sync motor alignment', assetId: S.assets.motor.id, frequency: 'Monthly', type: 'Preventive', nextDue: isoInDays(-2), estHours: 1, assignedTeam: 'Unassigned' });
  await Promise.all([
    env.ok('admin', '/pm-schedules/run-automation', 'POST', {}),
    env.ok('admin', '/pm-schedules/run-automation', 'POST', {}),
    env.ok('orgadmin', '/pm-schedules/run-automation', 'POST', {}),
  ]);
  const raised = await env.models.WorkOrder.find({ title: /^Sync motor alignment —/ }).lean();
  assert.equal(raised.length, 1, `${pm.id} raised ${raised.length} work orders for one occurrence: ${raised.map((w) => w._id).join(', ')}`);
  const doc = await env.models.PmSchedule.findById(pm.id).lean();
  assert.ok(new Date(doc.nextDue) - Date.now() < 40 * DAY, `${pm.id} rolled forward ${Math.round((new Date(doc.nextDue) - Date.now()) / DAY)} days for one monthly occurrence`);
  // Leave nothing open on the motor for the predictive test.
  for (const w of raised) await env.models.WorkOrder.updateOne({ _id: w._id }, { $set: { status: 'Cancelled' } });
  await env.models.PmSchedule.deleteOne({ _id: pm.id });
});

// ─────────────────────────────────────────────────────────────────────────────
// 7. Inspections
// ─────────────────────────────────────────────────────────────────────────────

test('inspection template created on the Templates tab is listed and schedulable', { timeout: 90000 }, async () => {
  await env.go('/inspections');
  await expectMain('Inspections & Checklists');
  await click('Templates');
  await click('+ New Template');
  await fillLabel('Name', 'Sync fire safety walk', { within: '[role=dialog]' });
  await fillPlaceholder('What is being checked?', 'Extinguisher in date');
  await submitDialog('Create template');
  await env.until(async () => (await env.models.InspectionTemplate.countDocuments({ name: 'Sync fire safety walk' })) === 1, 'template stored');
  const tpl = await env.models.InspectionTemplate.findOne({ name: 'Sync fire safety walk' }).lean();
  S.tpl = { id: tpl._id, name: tpl.name };
  assert.equal(tpl.createdBy, nameOf('admin'));
  await expectMain('Sync fire safety walk', 8000, 'templates list');
});

test('inspection scheduled from the dialog shows in Records with the right counts', { timeout: 90000 }, async () => {
  await click('Records');
  await click('+ Schedule Inspection');
  await fillLabel('Template', S.tpl.id, { within: '[role=dialog]' });
  await env.until(() => page().eval(`return [...document.querySelectorAll('[role=dialog] label')].some((l) => l.innerText.includes(${JSON.stringify(S.assets.panel.name)}))`), 'template assets load');
  await page().eval(`const l = [...document.querySelectorAll('[role=dialog] label')].find((x) => x.innerText.includes(${JSON.stringify(S.assets.panel.name)})); l.querySelector('input').click(); return true;`);
  await submitDialog('Schedule inspection');
  await env.until(async () => (await env.models.Inspection.countDocuments({ assetId: S.assets.panel.id })) === 1, 'inspection stored');
  const ins = await env.models.Inspection.findOne({ assetId: S.assets.panel.id }).lean();
  S.ins = { id: ins._id, title: ins.title };
  // A single schedule opens the new record; the list is one step back.
  await expectMain(ins._id, 8000, 'the scheduled inspection');
  await env.go('/inspections');
  await expectMain(ins._id, 8000, 'records list');
  await expectTile('Scheduled', 1);
  assert.equal(ins.assetName, S.assets.panel.name);
  assert.equal(ins.status, 'Scheduled');
});

test('inspection runner: fail a checkpoint with a finding, complete → Failed in the list and the KPIs', { timeout: 90000 }, async () => {
  await env.go(`/inspections/${S.ins.id}`);
  await expectMain('Extinguisher in date');
  await click('Fail', { sel: 'button' });
  await env.until(async () => (await env.models.Inspection.findById(S.ins.id).lean()).responses[0].result === 'Fail', 'fail stored');
  await fillPlaceholder('Describe the defect', 'Sync extinguisher expired in May', { blur: true });
  await env.until(async () => (await env.models.Inspection.findById(S.ins.id).lean()).responses[0].finding === 'Sync extinguisher expired in May', 'finding stored');
  await click('Complete inspection');
  await env.until(async () => (await env.models.Inspection.findById(S.ins.id).lean()).status === 'Failed', 'inspection failed');
  const doc = await env.models.Inspection.findById(S.ins.id).lean();
  assert.ok(doc.completedAt);
  assert.equal(doc.performedBy, nameOf('admin'));
  await env.go('/inspections');
  await expectTile('Failed', 1);
  const row = await page().eval(`const tr = [...document.querySelectorAll('#main tr')].find((r) => r.innerText.includes(${JSON.stringify(S.ins.id)})); return tr ? tr.innerText : '';`);
  assert.ok(row.includes('Failed'), `records row shows Failed: ${row}`);
});

test('inspection "Raise work order": corrective WO appears on /maintenance without a reload', { timeout: 90000 }, async () => {
  await env.go('/maintenance');
  await expectMain('Automated Work Orders');
  await env.go(`/inspections/${S.ins.id}`);
  await expectMain('Findings');
  await click('Raise work order', { sel: 'button' });
  await env.until(async () => (await env.models.Inspection.findById(S.ins.id).lean()).workOrderIds.length === 1, 'linked');
  const woId = (await env.models.Inspection.findById(S.ins.id).lean()).workOrderIds[0];
  const wo = await env.models.WorkOrder.findById(woId).lean();
  S.wo.corrective = { id: woId, title: wo.title };
  assert.equal(wo.source, 'Inspection Failure');
  await expectMain(`${woId} →`, 8000, 'inspection page links the order');
  await env.go('/maintenance');
  await expectMain(wo.title, 6000, '/maintenance board after raising corrective work');
});

test('inspection corrective WO is on /work-orders and Asset 360, and moves the asset to Maintenance', { timeout: 60000 }, async () => {
  await env.go('/work-orders');
  await expectMain(S.wo.corrective.title, 12000, '/work-orders');
  await env.go(`/assets/${S.assets.panel.id}?tab=maintenance`);
  await expectMain(S.wo.corrective.title, 12000, 'Asset 360');
  const stage = await stageOf(S.assets.panel.id);
  assert.equal(stage, 'Maintenance', `asset ${S.assets.panel.id} has open corrective order ${S.wo.corrective.id} but stays "${stage}"`);
});

test('inspection records list never sorts ids as strings (INS-10 before INS-2)', { timeout: 60000 }, async () => {
  // A bulk schedule gives every record the same date, so the tie-break decides
  // the order of the whole batch.
  const scheduledFor = isoInDays(20);
  const ids = [];
  for (let i = 0; i < 10; i++) {
    const ins = await env.ok('admin', '/inspections', 'POST', { templateId: S.tpl.id, assetId: S.assets.fan.id, scheduledFor });
    ids.push(ins.id);
  }
  const nums = ids.map((id) => Number(id.split('-')[1]));
  assert.ok(nums.some((n) => n < 10) && nums.some((n) => n >= 10), `crossed INS-9 → INS-10: ${ids.join(',')}`);
  const api = await env.ok('admin', `/inspections?assetId=${S.assets.fan.id}&limit=50`);
  const apiOrder = (Array.isArray(api) ? api : api.items ?? []).map((r) => r.id).filter((id) => ids.includes(id));
  const failures = [];
  const monotone = (list) => list.every((id, i) => i === 0 || Number(id.split('-')[1]) > Number(list[i - 1].split('-')[1]));
  if (!monotone(apiOrder)) failures.push(`GET /inspections: ${apiOrder.join(', ')}`);
  await env.go('/inspections');
  await expectMain(ids.at(-1));
  const text = await mainText();
  const shown = [...new Set(text.match(/INS-\d+/g) ?? [])].filter((id) => ids.includes(id));
  if (!monotone(shown)) failures.push(`/inspections records: ${shown.join(', ')}`);
  assert.deepEqual(failures, [], failures.join('\n'));
  // Out of the way of later counts.
  for (const id of ids) await env.request('admin', `/inspections/${id}`, 'DELETE');
});

// ─────────────────────────────────────────────────────────────────────────────
// 8. Predictive alerts
// ─────────────────────────────────────────────────────────────────────────────

test('predictive: raise alert → acknowledge → create WO; alert status, counts and links update', { timeout: 120000 }, async () => {
  await env.go('/predictive');
  await expectMain('Predictive Alerts');
  await click('+ Raise Alert');
  await fillLabel('What is predicted', 'Sync motor bearing heading for seizure');
  await pickAsset(S.assets.motor.name);
  await fillPlaceholder('What has been observed', 'Vibration has doubled over two weeks on the drive end.');
  await fillPlaceholder('Inspect and re-grease', 'Replace the drive-end bearing.');
  await submitDialog('Raise alert');
  await env.until(async () => (await env.models.PredictiveAlert.countDocuments({ assetId: S.assets.motor.id })) === 1, 'alert stored');
  const alert = await env.models.PredictiveAlert.findOne({ assetId: S.assets.motor.id }).lean();
  S.alert = { id: alert._id, title: alert.title };
  await expectMain(alert.title, 8000, 'alert table');
  await expectTile('Open Alerts', 1);

  await click('Acknowledge');
  await env.until(async () => (await env.models.PredictiveAlert.findById(alert._id).lean()).status === 'Acknowledged', 'acknowledged');
  await expectMain('Acknowledged', 8000);

  await env.go('/maintenance'); // warm the board
  await expectMain('Automated Work Orders');
  await env.go('/predictive');
  await expectMain(alert.title);
  await click('Create WO');
  await submitDialog('Create work order');
  await env.until(async () => (await env.models.PredictiveAlert.findById(alert._id).lean()).workOrderIds.length === 1, 'linked');
  const after = await env.models.PredictiveAlert.findById(alert._id).lean();
  assert.equal(after.status, 'Work Order Created');
  S.wo.predictive = { id: after.workOrderIds[0], title: (await env.models.WorkOrder.findById(after.workOrderIds[0]).lean()).title };
  await expectTile('Work Orders Created', 1);
  await expectMain('Work Order Created', 8000);
  assert.equal(await stageOf(S.assets.motor.id), 'Maintenance', 'raised through createWorkOrder → asset to Maintenance');
});

test('predictive: the WO raised from an alert appears on /maintenance without a reload', { timeout: 60000 }, async () => {
  await env.go('/maintenance');
  await expectMain(S.wo.predictive.title, 6000, '/maintenance board after raising from an alert');
});

test('predictive: the alert\'s WO is on /work-orders and Asset 360', { timeout: 60000 }, async () => {
  await env.go('/work-orders');
  await expectMain(S.wo.predictive.title, 12000, '/work-orders');
  await env.go(`/assets/${S.assets.motor.id}?tab=maintenance`);
  await expectMain(S.wo.predictive.title, 12000, 'Asset 360');
});

// ─────────────────────────────────────────────────────────────────────────────
// 9. Reload parity — nothing lost, nothing doubled
// ─────────────────────────────────────────────────────────────────────────────

test('reload parity: board, /work-orders and the maintenance dashboard agree with the database', { timeout: 90000 }, async () => {
  const all = await env.models.WorkOrder.find().lean();
  const open = all.filter((w) => !['Completed', 'Cancelled'].includes(w.status));
  await env.reload('/maintenance');
  await expectTile('Open', open.length, '/maintenance after reload');
  for (const status of ['New', 'Assigned', 'In Progress', 'Completed', 'Cancelled']) {
    assert.equal(await boardColumnCount(status), all.filter((w) => w.status === status).length, `board column ${status}`);
  }
  await env.reload('/work-orders');
  const text = await mainText();
  assert.ok(text.includes(`${all.length} of ${all.length} shown`), `/work-orders shows every order once (${all.length})`);
  const ids = (text.match(/WO-\d+/g) ?? []);
  assert.equal(ids.length, new Set(ids).size, 'no work order listed twice');
  await env.reload('/maintenance/dashboard');
  await expectTile('Open Work Orders', open.length + (await env.models.Inspection.countDocuments({ status: { $in: ['Scheduled', 'In Progress'] } })), 'maintenance dashboard after reload');
});
