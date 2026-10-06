// Live sync suite — Assets: registry, registration wizard, edit, bulk, import,
// delete, lifecycle (immediate + approval-gated), custody, transfers,
// reservations, approvals and documents.
//
// Every assertion states the CORRECT behaviour. A failing subtest is an app
// sync bug; a passing one is a regression guard. The comment beside a check
// names the code path that used to break it.
//
// Ordering rule (app-wide): registers, logs and history are newest first;
// boards may be too; IDs compare numerically. So ID lists are asserted to be
// numerically monotonic (either direction) — never string-sorted.
//
// Run:
//   node --experimental-websocket --import tsx --test Testing/harness/sync/assets.test.mjs
import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';
import { startEnv, assetBody, nameOf, SCOPE } from './env.mjs';

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let env;

// ── helpers ────────────────────────────────────────────────────────────────
const J = JSON.stringify;
const num = (id) => Number(String(id).split('-').pop());
/** True when a list of ids is in numeric order (either direction) — never string order. */
function numericOrdered(ids) {
  const n = ids.map(num);
  const asc = n.every((v, i) => i === 0 || n[i - 1] <= v);
  const desc = n.every((v, i) => i === 0 || n[i - 1] >= v);
  return asc || desc;
}
const path = () => env.page.eval('return location.pathname + location.search');

async function shot(name) { try { await env.page.shot(`sync-assets-${name}`); } catch { /* best effort */ } }

/** Wrap a check so a failure leaves a screenshot behind. */
async function check(t, label, fn) {
  await t.test(label, { timeout: 90000 }, async () => {
    try { await fn(); } catch (err) {
      await shot(label.replace(/[^a-z0-9]+/gi, '-').slice(0, 60).toLowerCase());
      throw err;
    }
  });
}

async function clickButton(label, scope = '') {
  const ok = await env.until(() => env.page.clickText(`${scope} button`, label), `button "${label}"`, 10000);
  return ok;
}
async function dialogSubmit() {
  await env.until(() => env.page.eval(`const b=document.querySelector('[role=dialog] button[type=submit]'); return !!b && !b.disabled;`), 'dialog submit enabled');
  await env.page.click('[role=dialog] button[type=submit]');
  await env.until(async () => !(await env.page.eval(`return !!document.querySelector('[role=dialog] form')`)), 'dialog closes', 15000);
}
/** Set a React-controlled select/textarea inside the open dialog (first match). */
async function dialogFill(selector, value) {
  return env.page.fill(`[role=dialog] ${selector}`, value);
}
async function switchUser(who) {
  await env.page.eval(`try { localStorage.clear(); sessionStorage.clear(); } catch {} return true;`);
  await env.page.send('Network.clearBrowserCookies');
  await env.login(who);
}
async function tileValue(label) {
  return env.page.eval(`
    const s=[...document.querySelectorAll('span')].find(e=>e.textContent.trim()===${J(label)});
    return s ? s.parentElement.nextElementSibling.textContent.trim() : null;`);
}
async function boardColumn(stage) {
  return env.page.eval(`
    const h=[...document.querySelectorAll('h2')].find(e=>e.textContent.trim()===${J(stage)});
    if(!h) return null;
    const col=h.closest('.glass-panel');
    return { text: col.innerText, ids: [...col.querySelectorAll('span.font-mono')].map(e=>e.textContent.trim()) };`);
}
/** The registry table row for an asset id, as text (null when not on this page). */
async function registryRow(id) {
  return env.page.eval(`
    const rx=new RegExp('^'+${J(id)}+'(\\\\D|$)');
    const tr=[...document.querySelectorAll('tbody tr')].find(r=>[...r.querySelectorAll('div')].some(d=>rx.test(d.textContent.trim())));
    return tr ? tr.innerText : null;`);
}
async function registrySearch(q) {
  await env.page.fill('input[placeholder^="Filter by name"]', q);
  await sleep(300);
}
async function openPaletteAndSearch(q) {
  await env.page.eval(`document.dispatchEvent(new KeyboardEvent('keydown',{key:'k',metaKey:true,bubbles:true})); return true;`);
  await env.page.waitForSelector('input[placeholder^="Search assets"]', 5000);
  await env.page.fill('input[placeholder^="Search assets"]', q);
  await sleep(1200);
}
async function closePalette() {
  await env.page.eval(`document.dispatchEvent(new KeyboardEvent('keydown',{key:'k',metaKey:true,bubbles:true})); return true;`);
  await sleep(200);
}
async function paletteText() {
  return env.page.eval(`const i=document.querySelector('input[placeholder^="Search assets"]'); if(!i) return ''; let n=i; for(let k=0;k<6&&n.parentElement;k++) n=n.parentElement; return n.innerText;`);
}

/** Click the first button whose trimmed text is exactly `label`. */
async function clickExact(label, scope = '') {
  return env.until(() => env.page.eval(`
    const b=[...document.querySelectorAll(${J(`${scope} button`)})].find(e=>e.innerText.trim()===${J(label)} && !e.disabled);
    if(!b) return false; b.scrollIntoView({block:'center'}); b.click(); return true;`), `button exactly "${label}"`, 10000);
}
/** Click a button inside the first `container` element whose text includes `text`. */
async function clickIn(container, text, label) {
  return env.until(() => env.page.eval(`
    const c=[...document.querySelectorAll(${J(container)})].find(e=>e.innerText.includes(${J(text)}));
    if(!c) return false;
    const b=[...c.querySelectorAll('button')].find(e=>e.innerText.trim()===${J(label)} && !e.disabled);
    if(!b) return false; b.scrollIntoView({block:'center'}); b.click(); return true;`), `"${label}" in ${container} containing "${text}"`, 12000);
}
/** The value printed next to a KPI/metric label (KpiCard, MetricCard). */
async function kpi(label) {
  return env.page.eval(`
    const el=[...document.querySelectorAll('div,span')].find(e=>e.children.length===0 && e.textContent.trim()===${J(label)});
    if(!el) return null;
    let n=el.nextElementSibling; if(n) return n.textContent.trim();
    return el.parentElement?.nextElementSibling?.textContent.trim() ?? null;`);
}
/** Text of the first `tbody tr` containing `text`, or null. */
async function rowText(text) {
  return env.page.eval(`const tr=[...document.querySelectorAll('tbody tr')].find(r=>r.innerText.includes(${J(text)})); return tr?tr.innerText:null;`);
}
async function untilDb(fn, label, timeout = 15000) { return env.until(fn, label, timeout); }
/** Attach a file to the open upload dialog's file input. */
async function attachFile(name, body) {
  return env.page.eval(`
    const input=document.querySelector('[role=dialog] input[type=file]');
    if(!input) return false;
    const dt=new DataTransfer(); dt.items.add(new File([${J(body)}], ${J(name)}, {type:'application/pdf'}));
    input.files=dt.files; input.dispatchEvent(new Event('change',{bubbles:true})); return true;`);
}

/** Drive the add-asset wizard to its review step and press Register. Returns the new id. */
async function finishWizard() {
  for (let i = 0; i < 12; i++) {
    if (await env.page.eval(`return [...document.querySelectorAll('button')].some(b=>b.innerText.includes('Register asset'))`)) break;
    await env.page.clickText('button', 'Next →');
    await sleep(250);
  }
  await env.until(() => env.page.eval(`return document.body.innerText.includes('Ready to register')`), 'wizard says Ready to register', 10000);
  await clickButton('Register asset');
  const landed = await env.until(async () => {
    const p = await path();
    return /^\/assets\/AST-\d+$/.test(p) ? p : null;
  }, 'wizard lands on the new Asset 360', 20000);
  return landed.split('/').pop();
}

async function datasetIds(who = 'admin') {
  const ds = await env.ok(who, '/dataset');
  return ds.assets.map((a) => a.id ?? a._id);
}

const A = {}; // ids shared between tests
const WIZARD_NAME = 'Zeta Wizard Pump';

before(async () => {
  env = await startEnv({ estate: 'fresh', browser: true });
  // Eleven assets through the API so the wizard's asset is AST-12 — past the
  // AST-9 → AST-10 boundary where string ordering shows.
  for (let i = 1; i <= 11; i++) {
    const a = await env.ok('admin', '/assets', 'POST', assetBody(`Alpha Asset ${String(i).padStart(2, '0')}`));
    A[`alpha${i}`] = a.id;
  }
  await env.login('admin');
}, { timeout: 240000 });

after(async () => { await env?.stop(); });

// ═══════════════════════════════════════════════════════════════════════════
test('1. registration wizard (blank) — new asset propagates to every screen', { timeout: 300000 }, async (t) => {
  assert.equal(A.alpha1, 'AST-1');
  assert.equal(A.alpha11, 'AST-11');

  // Prime the caches the way a user would: dashboard and a palette search
  // shortly before registering.
  await env.go('/');
  await env.until(() => tileValue('Assets in scope'), 'dashboard tile renders', 20000);
  const tileBefore = await tileValue('Assets in scope');
  await openPaletteAndSearch('Zeta');
  await closePalette();

  // ── register through the UI ──
  await env.go('/assets/new?source=blank');
  await env.page.waitForSelector('#f-name', 20000);
  await env.page.fill('#f-name', WIZARD_NAME);
  await env.page.fill('#f-category', 'Compute');
  const id = await finishWizard();
  A.wizard = id;

  await check(t, 'server minted AST-12 and stored who/when/what', async () => {
    assert.equal(id, 'AST-12');
    const doc = await env.models.Asset.findById(id).lean();
    assert.equal(doc.name, WIZARD_NAME);
    assert.equal(doc.location.id, SCOPE.facA._id);
    assert.equal(doc.onboarding.registeredBy, nameOf('admin'));
    assert.equal(doc.lifecycleStage, 'Commissioning');
    const reg = await env.models.Activity.findOne({ assetId: id, type: 'Registration' }).lean();
    assert.ok(reg, 'Registration activity stored');
    assert.equal(reg.actor, nameOf('admin'));
    const ltx = await env.models.LifecycleTransition.findOne({ assetId: id, toStage: 'Commissioning' }).lean();
    assert.ok(ltx, 'Commissioning transition stored');
  });

  await check(t, 'Asset 360 shows the asset and a Registration entry in its timeline', async () => {
    await env.expectText(WIZARD_NAME);
    await env.go(`/assets/${id}?tab=timeline`);
    await env.expectText('registered into the asset graph');
  });

  await check(t, 'Asset 360 lifecycle tab shows Commissioning', async () => {
    await env.go(`/assets/${id}?tab=lifecycle`);
    await env.expectText('Commissioning');
  });

  await check(t, 'dashboard "Assets in scope" tile counts the new asset after client-side navigation', async () => {
    // Was: frontend/src/api/dashboard.ts (DASHBOARD_KEY, staleTime 60s) was never
    // invalidated by a write — only ['dataset'] was.
    await env.go('/');
    await env.until(() => tileValue('Assets in scope'), 'tile', 15000);
    const now = await tileValue('Assets in scope');
    assert.equal(Number(now), Number(tileBefore) + 1, `tile was ${tileBefore} before registering, still shows ${now}`);
  });

  await check(t, 'command palette (⌘K) finds the new asset', async () => {
    // Guards CommandPalette's ['assets','search',q] query against keeping the
    // pre-registration result for its 30s staleTime.
    await openPaletteAndSearch('Zeta');
    const txt = await paletteText();
    await closePalette();
    assert.ok(txt.includes(WIZARD_NAME), `palette results did not include the new asset:\n${txt.slice(0, 300)}`);
  });

  await check(t, 'registry count "x of y" includes the new asset', async () => {
    await env.go('/assets');
    await env.expectText('12 of 12');
  });

  await check(t, 'registry shows the just-registered asset on the first page with the default sort', async () => {
    // Was: frontend/src/pages/assets/page.tsx defaulted to sortKey='name' asc with
    // PAGE_SIZE=10, so "Zeta…" landed on page 2. Default is now newest first.
    await env.go('/assets');
    const row = await registryRow(id);
    assert.ok(row, `${id} "${WIZARD_NAME}" is not on page 1 of /assets`);
  });

  await check(t, 'registry search finds it (it is stored, just not visible)', async () => {
    await registrySearch('Zeta');
    await env.expectText(WIZARD_NAME);
    await registrySearch('');
  });

  await check(t, 'lifecycle board shows it in the Commissioning column', async () => {
    await env.go('/lifecycle');
    const col = await env.until(() => boardColumn('Commissioning'), 'Commissioning column');
    assert.ok(col.text.includes(WIZARD_NAME));
  });

  await check(t, 'lifecycle board orders asset IDs numerically (never AST-10 before AST-2)', async () => {
    // Was: dataset.service sorted Asset by string _id ({ _id: 1 }).
    const col = await boardColumn('Commissioning');
    assert.ok(numericOrdered(col.ids), `Commissioning column order: ${col.ids.join(', ')}`);
  });

  await check(t, 'financial valuation register lists it', async () => {
    await env.go('/financials?tab=register');
    await env.expectText(WIZARD_NAME);
  });

  await check(t, 'labels → tag coverage lists it as Unlabelled', async () => {
    await env.go('/assets/labels?tab=tags');
    await env.expectText(WIZARD_NAME);
    const row = await env.page.eval(`const tr=[...document.querySelectorAll('tbody tr')].find(r=>r.innerText.includes(${J(WIZARD_NAME)})); return tr?tr.innerText:''`);
    assert.match(row, /Unlabelled/);
  });

  await check(t, 'labels → tag coverage orders asset IDs numerically', async () => {
    const ids = await env.page.eval(`return [...document.querySelectorAll('tbody tr span.font-mono')].map(e=>e.textContent.trim()).filter(t=>/^AST-\\d+$/.test(t))`);
    assert.ok(ids.length >= 12, `expected ≥12 ids, got ${ids.length}`);
    assert.ok(numericOrdered(ids), `coverage order: ${ids.join(', ')}`);
  });

  await check(t, '/dataset returns assets in numeric ID order', async () => {
    const ids = await datasetIds();
    assert.ok(numericOrdered(ids), `dataset order: ${ids.join(',')}`);
  });

  await check(t, 'custody log does not invent an "Assigned → Unassigned" record for an asset nobody holds', async () => {
    // Was: assetGraph.service projectNewAsset() always wrote an 'Assigned' row,
    // even when custodian === 'Unassigned'.
    const rows = await env.models.CustodyRecord.find({ assetId: id }).lean();
    assert.deepEqual(rows.map((r) => `${r.action}:${r.holder}`), [], 'custody rows for an unassigned new asset');
  });

  await check(t, 'nothing duplicated: one asset doc, one Registration activity, one registry row', async () => {
    assert.equal(await env.models.Asset.countDocuments({ name: WIZARD_NAME }), 1);
    assert.equal(await env.models.Activity.countDocuments({ assetId: id, type: 'Registration' }), 1);
    await env.go('/assets');
    await registrySearch('Zeta');
    const count = await env.page.eval(`return [...document.querySelectorAll('tbody tr')].filter(r=>r.innerText.includes(${J(WIZARD_NAME)})).length`);
    assert.equal(count, 1);
    await registrySearch('');
  });

  await check(t, 'survives a full reload', async () => {
    await env.reload(`/assets/${id}`);
    await env.expectText(WIZARD_NAME);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
test('2. registration via clone and template', { timeout: 300000 }, async (t) => {
  // ── clone ──
  await env.go(`/assets/new?source=clone&cloneOf=${A.wizard}`);
  await env.page.waitForSelector('#f-name', 20000);
  await env.until(() => env.page.eval(`return document.querySelector('#f-name')?.value === ${J(WIZARD_NAME)}`), 'clone prefill');
  await env.page.fill('#f-name', 'Zeta Clone Pump');
  const cloneId = await finishWizard();
  A.clone = cloneId;

  await check(t, 'clone is stored with its provenance', async () => {
    const doc = await env.models.Asset.findById(cloneId).lean();
    assert.equal(doc.name, 'Zeta Clone Pump');
    assert.equal(doc.onboarding.source, 'clone');
    assert.equal(doc.onboarding.clonedFromId, A.wizard);
    assert.equal(doc.category, 'Compute');
  });
  await check(t, 'clone appears first in the registry (newest first) and the count updates', async () => {
    await env.go('/assets');
    await env.expectText('13 of 13');
    const ids = await env.page.eval(`return [...document.querySelectorAll('tbody tr')].map(r=>(r.innerText.match(/AST-\\d+/)||[''])[0])`);
    assert.equal(ids[0], cloneId, `first row is ${ids[0]}`);
  });

  // ── template ──
  const tpl = await env.ok('admin', '/assets/templates', 'POST', {
    name: 'Sync Laptop Template', category: 'Compute',
    fields: [{ key: 'name', required: true, order: 0 }, { key: 'facilityId', required: true, order: 1 }, { key: 'serialNumber', order: 2 }],
  });
  await env.reload(`/assets/new?source=template&templateId=${tpl.id}`);
  await env.page.waitForSelector('#f-name', 20000);
  await env.page.fill('#f-name', 'Zeta Template Laptop');
  const tplAsset = await finishWizard();
  A.template = tplAsset;

  await check(t, 'template asset takes the template category and bumps its usage', async () => {
    const doc = await env.models.Asset.findById(tplAsset).lean();
    assert.equal(doc.category, 'Compute');
    assert.equal(doc.onboarding.templateId, tpl.id);
    const stored = await env.models.AssetTemplate.findById(tpl.id).lean();
    assert.equal(stored.usageCount, 1);
  });
  await check(t, 'template asset is on the lifecycle board and the financial register', async () => {
    await env.go('/lifecycle');
    const col = await env.until(() => boardColumn('Commissioning'), 'column');
    assert.ok(col.text.includes('Zeta Template Laptop'));
    await env.go('/financials?tab=register');
    await env.expectText('Zeta Template Laptop');
  });
});

// ═══════════════════════════════════════════════════════════════════════════
test('3. asset edit — rename, move and reassign propagate everywhere', { timeout: 300000 }, async (t) => {
  const id = A.alpha1;
  const wo = await env.ok('admin', '/work-orders', 'POST', {
    title: 'Inspect Alpha 01 bearings', assetId: id, dueDate: new Date(Date.now() + 5 * 86400000).toISOString(),
  });
  await env.reload(`/assets/${id}/edit`);
  await env.page.waitForSelector('#f-name', 20000);
  await env.until(() => env.page.eval(`return !!document.querySelector('#f-locname option[value="FAC-B"]')`), 'location options load');
  await env.page.fill('#f-name', 'Renamed Alpha One');
  await env.page.fill('#f-custodian', nameOf('orgadmin'));
  await env.page.fill('#f-locname', 'FAC-B');
  await clickButton('Save Changes');
  await env.until(async () => (await path()) === `/assets/${id}`, 'lands on Asset 360');

  await check(t, 'DB: name, custodian, location, work order name, custody row and activity are written', async () => {
    const doc = await env.models.Asset.findById(id).lean();
    assert.equal(doc.name, 'Renamed Alpha One');
    assert.equal(doc.custodian, nameOf('orgadmin'));
    assert.equal(doc.location.id, 'FAC-B');
    assert.equal(doc.location.name, 'Pune Warehouse');
    const w = await env.models.WorkOrder.findById(wo.id).lean();
    assert.equal(w.assetName, 'Renamed Alpha One', 'open work order carries the new name');
    const cus = await env.models.CustodyRecord.find({ assetId: id }).lean();
    assert.ok(cus.some((c) => c.holder === nameOf('orgadmin') && c.by === nameOf('admin')), 'custody row for the new custodian');
    assert.ok(await env.models.Activity.exists({ assetId: id, type: 'Movement' }), 'movement activity');
    assert.ok(await env.models.Activity.exists({ assetId: id, type: 'Custody' }), 'custody activity');
  });
  await check(t, 'Asset 360 header shows the new name, custodian and location', async () => {
    await env.expectText('Renamed Alpha One');
    await env.expectText('Pune Warehouse');
    await env.expectText(nameOf('orgadmin'));
  });
  await check(t, 'Asset 360 custody tab: current custodian and the chain include the change', async () => {
    await env.go(`/assets/${id}?tab=custody`);
    // "Current Custodian" is CSS-uppercased, so innerText would not match it; the
    // custodian's name sits beside it and in the chain.
    const chain = await env.until(async () => {
      const c = await env.page.eval(`return [...document.querySelectorAll('[data-custody-row]')].map(e=>e.innerText).join('\\n')`);
      return c.includes(nameOf('orgadmin')) ? c : null;
    }, 'chain of custody names the new custodian');
    assert.ok(chain);
  });
  await check(t, 'Asset 360 history tab shows the move and the custodian change', async () => {
    await env.go(`/assets/${id}?tab=history`);
    await env.expectText('Moved from Hyderabad Plant to Pune Warehouse');
    await env.expectText(`Custodian changed from Unassigned to ${nameOf('orgadmin')}`);
  });
  await check(t, 'registry row shows the new name, location and custodian; old name is gone', async () => {
    await env.go('/assets');
    await registrySearch('Renamed Alpha');
    const row = await registryRow(id);
    assert.ok(row, 'row present');
    assert.match(row, /Pune Warehouse/);
    assert.match(row, new RegExp(nameOf('orgadmin')));
    await registrySearch('Alpha Asset 01');
    assert.equal(await registryRow(id), null, 'old name still matches');
    await registrySearch('');
  });
  await check(t, 'work orders screen shows the new asset name', async () => {
    await env.go('/work-orders');
    await env.expectText('Renamed Alpha One');
  });
  await check(t, 'custody log lists the reassignment', async () => {
    await env.go('/custody');
    const row = await env.until(() => rowText(nameOf('orgadmin')), 'custody row');
    assert.match(row, /Renamed Alpha One/);
  });
  await check(t, 'lifecycle card shows the new custodian and location', async () => {
    await env.go('/lifecycle');
    const col = await env.until(() => boardColumn('Commissioning'), 'column');
    assert.ok(col.text.includes('Renamed Alpha One'));
    assert.ok(col.text.includes('Pune Warehouse'));
  });
});

// ═══════════════════════════════════════════════════════════════════════════
test('4. bulk actions on the registry — custodian, status, location', { timeout: 300000 }, async (t) => {
  const total = await env.models.Asset.countDocuments({});
  await env.go('/assets');
  await registrySearch('Alpha Asset 0');
  await env.page.click('input[aria-label="Select Alpha Asset 02"]');
  await env.page.click('input[aria-label="Select Alpha Asset 03"]');
  await clickButton('Assign Custodian');
  await env.page.waitForSelector('[role=dialog] select');
  await dialogFill('select', nameOf('tech'));
  await dialogSubmit();

  await check(t, 'custodian bulk change is stored with a custody row each', async () => {
    await untilDb(async () => (await env.models.Asset.countDocuments({ _id: { $in: [A.alpha2, A.alpha3] }, custodian: nameOf('tech') })) === 2, 'both updated');
    assert.equal(await env.models.CustodyRecord.countDocuments({ assetId: { $in: [A.alpha2, A.alpha3] }, holder: nameOf('tech') }), 2);
  });
  await check(t, 'registry rows show the new custodian without a reload', async () => {
    await env.until(async () => /Tara Technician/.test((await registryRow(A.alpha2)) ?? ''), 'row 2 custodian');
    assert.match(await registryRow(A.alpha3), /Tara Technician/);
  });
  await check(t, 'Asset 360 custody chain shows the bulk assignment', async () => {
    await env.go(`/assets/${A.alpha2}?tab=custody`);
    await env.until(async () => (await env.page.eval(`return [...document.querySelectorAll('[data-custody-row]')].map(e=>e.innerText).join(' ')`)).includes(nameOf('tech')), 'chain row');
  });

  // status
  await env.go('/assets');
  await registrySearch('Alpha Asset 04');
  await env.page.click('input[aria-label="Select Alpha Asset 04"]');
  await clickButton('Change Status');
  await env.page.waitForSelector('[role=dialog] select');
  await dialogFill('select', 'Maintenance');
  await dialogSubmit();
  await check(t, 'status change is stored, audited and shown in the registry', async () => {
    await untilDb(async () => (await env.models.Asset.findById(A.alpha4).lean()).status === 'Maintenance', 'status stored');
    assert.ok(await env.models.Activity.exists({ assetId: A.alpha4, type: 'Audit', description: /Active to Maintenance/ }));
    await env.until(async () => /Maintenance/.test((await registryRow(A.alpha4)) ?? ''), 'row status');
  });
  await check(t, 'registry Maintenance filter counts it', async () => {
    await registrySearch('');
    await env.page.fill('select', 'Maintenance');
    await sleep(300);
    await env.expectText(`1 of ${total}`);
    await env.page.fill('select', 'All');
  });

  // location
  await env.go('/assets');
  await registrySearch('Alpha Asset 0');
  await env.page.click('input[aria-label="Select Alpha Asset 05"]');
  await env.page.click('input[aria-label="Select Alpha Asset 06"]');
  await clickButton('Move Location');
  await env.page.waitForSelector('[role=dialog] select');
  await dialogFill('select', 'BLD-A1');
  await dialogSubmit();
  await check(t, 'location bulk move is stored and shown everywhere', async () => {
    await untilDb(async () => (await env.models.Asset.countDocuments({ _id: { $in: [A.alpha5, A.alpha6] }, 'location.id': 'BLD-A1' })) === 2, 'both moved');
    await env.until(async () => /Plant Block 1/.test((await registryRow(A.alpha5)) ?? ''), 'registry location');
    await env.go(`/assets/${A.alpha5}?tab=timeline`);
    await env.expectText('Moved from Hyderabad Plant to Plant Block 1');
  });
  await check(t, 'no duplicate assets after bulk actions', async () => {
    assert.equal(await env.models.Asset.countDocuments({}), total);
    await env.go('/assets');
    await env.expectText(`${total} of ${total}`);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
test('5. CSV import — correct count, no duplicates, undo, visible everywhere, re-import refused', { timeout: 300000 }, async (t) => {
  const before = await env.models.Asset.countDocuments({});
  /** Run the sample file through the wizard; returns how many rows it offered to import. */
  async function importSample() {
    await env.until(() => env.page.clickText('button', 'sample CSV'), 'load sample');
    await clickExact('Next →');
    await env.until(() => env.page.eval(`return !!document.querySelector('select[aria-label="Destination site"] option[value="FAC-A"]')`), 'sites load');
    await env.page.fill('select[aria-label="Destination site"]', 'FAC-A');
    await clickExact('Next →');
    await clickExact('Next →');
    const label = await env.until(() => env.page.eval(`return [...document.querySelectorAll('button')].map(b=>b.innerText.trim()).find(t=>/^Import \\d+ assets?$/.test(t))`), 'import button');
    const n = Number(label.match(/\d+/)[0]);
    await clickExact(label);
    await env.expectText(`Imported ${n} asset`, 20000);
    return n;
  }

  await env.go('/assets/import');
  const expected = await importSample();
  await check(t, `exactly ${expected} assets were stored, none twice`, async () => {
    assert.equal(await env.models.Asset.countDocuments({}), before + expected);
    const names = (await env.models.Asset.find({ serialNumber: /^SN-/ }).lean()).map((a) => a.name);
    assert.equal(new Set(names).size, names.length, `duplicate names: ${names.join(', ')}`);
    assert.ok(names.includes('Dell PowerEdge R740 Server'));
  });
  await check(t, 'undo deletes exactly what the run imported, and the registry count follows', async () => {
    await env.until(() => env.page.clickText('button', 'Imported the wrong file?'), 'undo link');
    await clickExact(`Delete ${expected}`);
    await untilDb(async () => (await env.models.Asset.countDocuments({})) === before, 'assets removed');
    await env.go('/assets');
    await env.expectText(`${before} of ${before}`);
    await registrySearch('Dell PowerEdge');
    assert.ok(!(await env.text()).includes('Dell PowerEdge R740 Server'), 'deleted import still listed');
    await registrySearch('');
  });

  await env.go('/assets/import');
  await importSample();
  await check(t, 'registry count and first page show the imported rows', async () => {
    await env.go('/assets');
    await env.expectText(`${before + expected} of ${before + expected}`);
    await env.expectText('Dell PowerEdge R740 Server');
  });
  await check(t, 'imported asset has a Registration entry and a custody row for its custodian', async () => {
    const doc = await env.models.Asset.findOne({ name: 'Dell PowerEdge R740 Server' }).lean();
    await env.go(`/assets/${doc._id}?tab=timeline`);
    await env.expectText('registered into the asset graph');
    assert.ok(await env.models.CustodyRecord.exists({ assetId: doc._id, holder: 'IT Ops', action: 'Assigned' }));
  });
  await check(t, 're-importing the same file is refused at validation (would duplicate)', async () => {
    await env.go('/assets/import');
    await env.until(() => env.page.clickText('button', 'sample CSV'), 'load sample');
    await clickExact('Next →');
    await env.until(() => env.page.eval(`return !!document.querySelector('select[aria-label="Destination site"] option[value="FAC-A"]')`), 'sites');
    await env.page.fill('select[aria-label="Destination site"]', 'FAC-A');
    await clickExact('Next →');
    await env.expectText('already in the registry');
    const nextEnabled = await env.page.eval(`return [...document.querySelectorAll('button')].some(b=>/^Next/.test(b.innerText.trim()) && !b.disabled)`);
    assert.equal(nextEnabled, false);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
test('6. lifecycle — immediate stage change from Asset 360', { timeout: 300000 }, async (t) => {
  const id = A.wizard;
  await env.go(`/assets/${id}?tab=lifecycle`);
  await clickExact('Change Stage');
  await env.page.waitForSelector('[role=dialog] select');
  await dialogFill('select', 'Available');
  await dialogFill('textarea', 'Commissioning checklist complete');
  await dialogSubmit();

  await check(t, 'stored as an Applied transition with who and why', async () => {
    await untilDb(async () => (await env.models.Asset.findById(id).lean()).lifecycleStage === 'Available', 'stage');
    const tx = await env.models.LifecycleTransition.findOne({ assetId: id, toStage: 'Available' }).lean();
    assert.equal(tx.status, 'Applied');
    assert.equal(tx.requester, nameOf('admin'));
    assert.equal(tx.reason, 'Commissioning checklist complete');
  });
  await check(t, 'Asset 360 lifecycle tab and timeline show it immediately', async () => {
    await env.until(() => env.page.eval(`return document.body.innerText.includes('Commissioning → Available')`), 'lifecycle row');
    await env.go(`/assets/${id}?tab=timeline`);
    await env.expectText('Stage changed from Commissioning to Available');
  });
  await check(t, 'lifecycle board moves the card from Commissioning to Available', async () => {
    await env.go('/lifecycle');
    const avail = await env.until(() => boardColumn('Available'), 'Available column');
    assert.ok(avail.text.includes(WIZARD_NAME));
    const comm = await boardColumn('Commissioning');
    assert.ok(!comm.text.includes(WIZARD_NAME));
  });
});

// ═══════════════════════════════════════════════════════════════════════════
test('7. custody — check out and return from Asset 360', { timeout: 300000 }, async (t) => {
  const id = A.wizard;
  await env.go(`/assets/${id}?tab=custody`);
  await clickExact('Custody');
  await env.page.waitForSelector('[role=dialog] select');
  await env.page.eval(`const s=document.querySelectorAll('[role=dialog] select'); return s.length;`);
  await env.page.fill('[role=dialog] select:nth-of-type(1)', 'Checked Out');
  await env.page.eval(`
    const s=[...document.querySelectorAll('[role=dialog] select')][1];
    const setter=Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype,'value').set;
    setter.call(s, ${J(nameOf('tech'))}); s.dispatchEvent(new Event('change',{bubbles:true})); return true;`);
  await dialogSubmit();

  await check(t, 'check-out stored: custody row, custodian, automatic In Service stage', async () => {
    await untilDb(async () => (await env.models.Asset.findById(id).lean()).custodian === nameOf('tech'), 'custodian');
    const row = await env.models.CustodyRecord.findOne({ assetId: id, action: 'Checked Out' }).lean();
    assert.equal(row.holder, nameOf('tech'));
    assert.equal(row.by, nameOf('admin'));
    assert.equal((await env.models.Asset.findById(id).lean()).lifecycleStage, 'Assigned / In Service');
  });
  await check(t, 'Asset 360 custody tab shows the new custodian and the chain entry', async () => {
    await env.until(() => env.page.eval(`return [...document.querySelectorAll('[data-custody-row]')].some(e=>e.innerText.includes('Checked Out — ${nameOf('tech')}'))`), 'chain row');
  });
  await check(t, 'registry and lifecycle board show the custodian / new stage', async () => {
    await env.go('/assets');
    await registrySearch('Zeta Wizard');
    assert.match(await env.until(() => registryRow(id), 'row'), /Tara Technician/);
    await registrySearch('');
    await env.go('/lifecycle');
    const col = await env.until(() => boardColumn('Assigned / In Service'), 'column');
    assert.ok(col.text.includes(WIZARD_NAME));
  });
  await check(t, '/custody lists the check-out first and counts it in the field', async () => {
    await env.go('/custody');
    const first = await env.page.eval(`return document.querySelector('tbody tr')?.innerText ?? ''`);
    assert.match(first, /Checked Out/);
    assert.match(first, new RegExp(WIZARD_NAME));
    assert.equal(await kpi('Checked Out'), '1');
  });

  // return
  await env.go(`/assets/${id}?tab=custody`);
  await clickExact('Custody');
  await env.page.waitForSelector('[role=dialog] select');
  await dialogSubmit();
  await check(t, 'check-in returns the asset to the pool', async () => {
    await untilDb(async () => (await env.models.Asset.findById(id).lean()).custodian === 'Unassigned', 'custodian cleared');
  });
  await check(t, 'custody chain is newest first: Checked In above Checked Out', async () => {
    await env.go(`/custody/${id}`);
    const [inAt, outAt] = await env.positions('Checked In', 'Checked Out');
    assert.ok(inAt >= 0 && outAt >= 0 && inAt < outAt, `positions in=${inAt} out=${outAt}`);
  });
  await check(t, '/custody "Checked Out — currently in the field" drops back to 0 after the return', async () => {
    await env.go('/custody');
    assert.equal(await kpi('Checked Out'), '0');
  });
});

// ═══════════════════════════════════════════════════════════════════════════
test('8. lifecycle — approval-gated change requested by fm, approved by mm from /approvals', { timeout: 300000 }, async (t) => {
  const id = A.wizard; // In Service, FAC-A
  await switchUser('fm');
  await env.go(`/assets/${id}?tab=lifecycle`);
  await clickExact('Change Stage');
  await env.page.waitForSelector('[role=dialog] select');
  await dialogFill('select', 'Maintenance');
  await dialogFill('textarea', 'Bearing noise on the drive end');
  await dialogSubmit();

  let txId;
  await check(t, 'a Pending transition is stored with the requester id; the stage is untouched', async () => {
    const tx = await untilDb(() => env.models.LifecycleTransition.findOne({ assetId: id, toStage: 'Maintenance', status: 'Pending' }).lean(), 'pending row');
    txId = tx._id;
    assert.equal(tx.requester, nameOf('fm'));
    assert.ok(tx.requesterId, 'requesterId stored');
    assert.equal((await env.models.Asset.findById(id).lean()).lifecycleStage, 'Assigned / In Service');
  });
  await check(t, 'Asset 360 shows "Awaiting approval" and /lifecycle counts it', async () => {
    await env.expectText('Awaiting approval');
    await env.go('/lifecycle');
    assert.equal(await kpi('Requiring Approval'), '1');
  });
  await check(t, 'approvers are notified; the requester is not asked', async () => {
    const mm = await env.models.User.findOne({ email: 'mm@sync.test' }).lean();
    const fm = await env.models.User.findOne({ email: 'fm@sync.test' }).lean();
    assert.ok(await env.models.Notification.exists({ userId: String(mm._id), title: `Approval needed: ${WIZARD_NAME} → Maintenance` }));
    assert.ok(!(await env.models.Notification.exists({ userId: String(fm._id), title: /^Approval needed/ })));
  });

  await switchUser('mm');
  await check(t, 'mm sees the request in /notifications', async () => {
    await env.go('/notifications');
    await env.expectText(`Approval needed: ${WIZARD_NAME} → Maintenance`);
  });
  await check(t, 'mm finds it on /approvals ("Waiting on me") and approves it there', async () => {
    await env.go('/approvals');
    await env.expectText(`${WIZARD_NAME} → Maintenance`);
    await clickIn('[data-stage-change]', `${WIZARD_NAME} → Maintenance`, 'Approve');
    await untilDb(async () => (await env.models.LifecycleTransition.findById(txId).lean()).status === 'Approved', 'approved');
    // The card leaves the queue (the success toast repeats the same words, so
    // the check is on the card, not on page text).
    await env.until(async () => !(await env.page.eval(`return [...document.querySelectorAll('[data-stage-change]')].some(e=>e.innerText.includes(${J(`${WIZARD_NAME} → Maintenance`)}))`)), 'card leaves the queue');
  });
  await check(t, 'approval moves the stage AND the registry status, once', async () => {
    const doc = await env.models.Asset.findById(id).lean();
    assert.equal(doc.lifecycleStage, 'Maintenance');
    assert.equal(doc.status, 'Maintenance', 'registry status follows the approved stage');
    const rows = await env.models.LifecycleTransition.find({ assetId: id, toStage: 'Maintenance' }).lean();
    assert.equal(rows.length, 1, `lifecycle rows for →Maintenance: ${rows.map((r) => r.status).join(', ')}`);
  });
  await check(t, 'Asset 360 lifecycle tab shows Maintenance with a single entry', async () => {
    await env.go(`/assets/${id}?tab=lifecycle`);
    await env.until(() => env.page.eval(`return /Current stage\\s*Maintenance/i.test(document.body.innerText)`), 'current stage');
    const count = await env.page.eval(`return (document.body.innerText.match(/Assigned \\/ In Service → Maintenance/g)||[]).length`);
    assert.equal(count, 1);
  });
  await check(t, 'registry and lifecycle board reflect Maintenance', async () => {
    await env.go('/assets');
    await registrySearch('Zeta Wizard');
    assert.match(await env.until(() => registryRow(id), 'row'), /Maintenance/);
    await registrySearch('');
    await env.go('/lifecycle');
    const col = await env.until(() => boardColumn('Maintenance'), 'column');
    assert.ok(col.text.includes(WIZARD_NAME));
  });
  await check(t, 'the requester is told the move happened', async () => {
    const fm = await env.models.User.findOne({ email: 'fm@sync.test' }).lean();
    assert.ok(await env.models.Notification.exists({ userId: String(fm._id), title: `${WIZARD_NAME} → Maintenance` }));
  });
});

// ═══════════════════════════════════════════════════════════════════════════
test('9. lifecycle — a disposal workflow holds Disposed and Approvals settles it', { timeout: 300000 }, async (t) => {
  const id = A.alpha11;
  await env.ok('admin', '/approval-workflows', 'POST', {
    name: 'Disposal sign-off', trigger: 'asset_disposal', status: 'Active',
    steps: [{ order: 1, name: 'Platform owner', approverRole: 'super_admin' }],
  });
  await env.ok('admin', `/assets/${id}/lifecycle/transition`, 'POST', { toStage: 'Available', reason: 'Ready' });
  const retire = await env.ok('fm', `/assets/${id}/lifecycle/transition`, 'POST', { toStage: 'Retired', reason: 'End of service' }, 202);
  await env.ok('orgadmin', `/assets/lifecycle/transitions/${retire.transition.id}/decide`, 'POST', { decision: 'Approved' });
  const dispose = await env.ok('orgadmin', `/assets/${id}/lifecycle/transition`, 'POST', { toStage: 'Disposed', reason: 'Scrapped' }, 202);

  let request;
  await check(t, 'requesting Disposed opens an asset_disposal approval request', async () => {
    request = await env.models.ApprovalRequest.findOne({ subjectType: 'asset_disposal', subjectId: dispose.transition.id }).lean();
    assert.ok(request, 'approval request opened');
    assert.equal(request.status, 'Pending');
  });
  await check(t, 'the lifecycle decide endpoint refuses to go around the chain', async () => {
    const r = await env.request('admin', `/assets/lifecycle/transitions/${dispose.transition.id}/decide`, 'POST', { decision: 'Approved' });
    assert.equal(r.status, 409);
  });
  await check(t, 'deciding the approval request disposes the asset', async () => {
    await env.ok('admin', `/approvals/${request._id}/decide`, 'POST', { decision: 'Approved', comment: 'ok' });
    const doc = await env.models.Asset.findById(id).lean();
    assert.equal(doc.lifecycleStage, 'Disposed');
    assert.equal(doc.status, 'End_Of_Life');
    assert.equal((await env.models.LifecycleTransition.findById(dispose.transition.id).lean()).status, 'Approved');
  });
  await check(t, 'Retired → Disposed shows once per move on the asset timeline', async () => {
    const rows = await env.models.LifecycleTransition.find({ assetId: id, toStage: { $in: ['Retired', 'Disposed'] } }).lean();
    assert.equal(rows.length, 2, rows.map((r) => `${r.toStage}:${r.status}`).join(', '));
  });
});

// ═══════════════════════════════════════════════════════════════════════════
test('10. transfers — workflow approval, bulk request, receive moves the asset', { timeout: 300000 }, async (t) => {
  await env.ok('admin', '/approval-workflows', 'POST', {
    name: 'Transfer sign-off', trigger: 'asset_transfer', status: 'Active',
    steps: [{ order: 1, name: 'Operations', approverRole: 'org_admin' }],
  });
  const id = A.alpha3;
  await switchUser('fm');
  await env.go(`/assets/${id}?tab=custody`);
  await clickExact('Transfer');
  await env.page.waitForSelector('[role=dialog] select');
  await check(t, 'the transfer dialog only offers destinations inside the requester\'s estate', async () => {
    // Was: every site in the tree, so fm could pick Pune Warehouse and be refused.
    const options = await env.page.eval(`return [...document.querySelector('[role=dialog] select').options].map(o=>o.value)`);
    assert.ok(options.includes('Plant Block 1'), options.join(', '));
    assert.ok(!options.includes('Pune Warehouse'), `offered: ${options.join(', ')}`);
  });
  await dialogFill('select', 'Plant Block 1');
  await dialogFill('textarea', 'Line 2 needs a spare');
  await dialogSubmit();

  let tr;
  await check(t, 'transfer stored as Pending with requester id, and an approval request opened', async () => {
    tr = await untilDb(() => env.models.Transfer.findOne({ assetId: id }).lean(), 'transfer row');
    assert.equal(tr.status, 'Pending');
    assert.equal(tr.requester, nameOf('fm'));
    assert.ok(tr.requesterId, 'requesterId stored');
    assert.ok(await env.models.ApprovalRequest.exists({ subjectType: 'asset_transfer', subjectId: tr._id, status: 'Pending' }));
  });
  await check(t, '/asset-movement lists it as pending and counts it', async () => {
    await env.go('/asset-movement');
    assert.match(await env.until(() => rowText('Alpha Asset 03'), 'row'), /Pending/);
    assert.equal(await kpi('Pending Approval'), '1');
  });
  await check(t, 'a transfer raised by Bulk Import on this screen appears without navigating away', async () => {
    await clickExact('Bulk Import');
    await env.page.waitForSelector('[role=dialog] textarea');
    await dialogFill('textarea', `${A.alpha7},Plant Block 1,Rebalance line stock`);
    await clickExact('Validate rows');
    await clickExact('Create Transfer Batch (1)');
    await untilDb(() => env.models.Transfer.exists({ assetId: A.alpha7 }), 'batch row stored');
    await env.until(() => rowText('Alpha Asset 07'), 'batch row visible', 10000);
    assert.equal(await kpi('Pending Approval'), '2');
  });

  await switchUser('orgadmin');
  await check(t, 'org admin approves it from /approvals', async () => {
    await env.go('/approvals');
    await env.expectText(`Alpha Asset 03 → Plant Block 1`);
    await clickIn('.glass-panel', 'Alpha Asset 03 → Plant Block 1', 'Approve');
    await dialogSubmit();
    await untilDb(async () => (await env.models.Transfer.findById(tr._id).lean()).status === 'Approved', 'transfer approved');
    assert.equal((await env.models.Transfer.findById(tr._id).lean()).approver, nameOf('orgadmin'));
  });
  await check(t, 'dispatch and receive on /asset-movement move the asset', async () => {
    await env.go('/asset-movement');
    for (const [label, status] of [['Mark Picked Up', 'Picked Up'], ['Dispatch', 'In Transit'], ['Receive', 'Received']]) {
      await clickIn('tbody tr', 'Alpha Asset 03', label);
      await untilDb(async () => (await env.models.Transfer.findById(tr._id).lean()).status === status, `transfer ${status}`);
      await sleep(400);
    }
    const doc = await env.models.Asset.findById(id).lean();
    assert.equal(doc.location.id, 'BLD-A1');
    assert.equal(doc.location.name, 'Plant Block 1');
  });
  await check(t, 'the move shows in the registry and the asset timeline', async () => {
    await env.go('/assets');
    await registrySearch('Alpha Asset 03');
    assert.match(await env.until(() => registryRow(id), 'row'), /Plant Block 1/);
    await registrySearch('');
    await env.go(`/assets/${id}?tab=timeline`);
    await env.expectText('Moved from Hyderabad Plant to Plant Block 1');
  });
});

// ═══════════════════════════════════════════════════════════════════════════
test('11. reservations are visible on the movement screen and on Asset 360', { timeout: 120000 }, async (t) => {
  const r = await env.ok('admin', '/operations/reservations', 'POST', {
    assetId: A.alpha6, reservedBy: nameOf('tech'), startDay: 1, endDay: 2, startLabel: '09:00', endLabel: '17:00', purpose: 'Line trial booking',
  });
  A.reservation = r.id;
  await switchUser('admin');
  await check(t, '/asset-movement → Reservations lists the booking', async () => {
    await env.go('/asset-movement?tab=reservations');
    await env.expectText('Line trial booking');
  });
  await check(t, 'Asset 360 custody tab lists the booking', async () => {
    await env.go(`/assets/${A.alpha6}?tab=custody`);
    await env.expectText('Line trial booking');
  });
});

// ═══════════════════════════════════════════════════════════════════════════
test('12. documents uploaded on Asset 360 appear newest first and on the timeline', { timeout: 180000 }, async (t) => {
  const id = A.wizard;
  await env.go(`/assets/${id}?tab=documents`);
  await clickExact('Attach a document');
  await env.page.waitForSelector('[role=dialog] input[type=file]');
  await attachFile('older-invoice.pdf', 'older bytes');
  await dialogSubmit();
  await env.expectText('older-invoice.pdf');
  await sleep(1100);
  await clickExact('+ Attach');
  await env.page.waitForSelector('[role=dialog] input[type=file]');
  await attachFile('newer-warranty.pdf', 'newer bytes');
  await dialogFill('select', 'Warranty');
  await dialogSubmit();

  await check(t, 'both documents stored with uploader and type', async () => {
    const docs = await env.models.AssetDocument.find({ assetId: id }).lean();
    assert.deepEqual(docs.map((d) => d.name).sort(), ['newer-warranty.pdf', 'older-invoice.pdf']);
    assert.ok(docs.every((d) => d.uploadedBy === nameOf('admin')));
    assert.equal(docs.find((d) => d.name === 'newer-warranty.pdf').type, 'Warranty');
  });
  await check(t, 'documents tab lists them newest first with a count', async () => {
    await env.expectText('newer-warranty.pdf');
    await env.expectText('2 documents');
    const [n, o] = await env.positions('newer-warranty.pdf', 'older-invoice.pdf');
    assert.ok(n < o, `newer at ${n}, older at ${o}`);
  });
  await check(t, 'timeline records both attachments', async () => {
    await env.go(`/assets/${id}?tab=timeline`);
    await env.expectText('Warranty attached — newer-warranty.pdf');
    await env.expectText('Invoice attached — older-invoice.pdf');
  });
});

// ═══════════════════════════════════════════════════════════════════════════
test('13. delete — guards, and the asset disappears everywhere', { timeout: 180000 }, async (t) => {
  await check(t, 'an asset with a transfer in progress cannot be deleted', async () => {
    const r = await env.request('admin', `/assets/${A.alpha7}`, 'DELETE');
    assert.equal(r.status, 409, JSON.stringify(r.body));
    assert.ok(await env.models.Asset.exists({ _id: A.alpha7 }));
  });
  await check(t, 'a cancelled work order does not block deletion', async () => {
    const wo = await env.ok('admin', '/work-orders', 'POST', { title: 'Cancelled job for Alpha 08', assetId: A.alpha8, dueDate: new Date(Date.now() + 86400000).toISOString() });
    await env.models.WorkOrder.updateOne({ _id: wo.id }, { $set: { status: 'Cancelled' } });
    const r = await env.request('admin', `/assets/${A.alpha8}`, 'DELETE');
    assert.ok([200, 204].includes(r.status), `${r.status} ${JSON.stringify(r.body)}`);
  });
  await check(t, 'deleting a booked asset releases its reservation', async () => {
    const r = await env.request('admin', `/assets/${A.alpha6}`, 'DELETE');
    assert.ok([200, 204].includes(r.status), `${r.status} ${JSON.stringify(r.body)}`);
    assert.equal((await env.models.Reservation.findById(A.reservation).lean()).status, 'Cancelled');
  });
  await check(t, 'deleted assets are gone from the registry, lifecycle board, labels and financials', async () => {
    await env.reload('/assets');
    await registrySearch('Alpha Asset 08');
    assert.equal(await registryRow(A.alpha8), null);
    await registrySearch('');
    for (const p of ['/lifecycle', '/assets/labels?tab=tags', '/financials?tab=register']) {
      await env.go(p);
      await sleep(300);
      const txt = await env.text();
      assert.ok(!txt.includes('Alpha Asset 08') && !txt.includes('Alpha Asset 06'), `still listed on ${p}`);
    }
  });
});

// ═══════════════════════════════════════════════════════════════════════════
test('14. segregation of duties is by user id — renaming yourself does not let you self-approve', { timeout: 120000 }, async (t) => {
  const id = A.alpha9;
  await env.ok('admin', `/assets/${id}/lifecycle/transition`, 'POST', { toStage: 'Available', reason: 'Ready' });
  // fm may approve Retired (LIFECYCLE_ROLE_MATRIX), just not their own request.
  const req = await env.ok('fm', `/assets/${id}/lifecycle/transition`, 'POST', { toStage: 'Retired', reason: 'Worn out' }, 202);
  await env.ok('fm', '/auth/me', 'PATCH', { name: 'Farah Renamed' });
  await check(t, 'lifecycle: the renamed requester is still refused', async () => {
    const r = await env.request('fm', `/assets/lifecycle/transitions/${req.transition.id}/decide`, 'POST', { decision: 'Approved' });
    assert.equal(r.status, 403, JSON.stringify(r.body));
  });
  await check(t, 'lifecycle: the queue does not offer the requester a decision', async () => {
    const rows = await env.ok('fm', '/assets/lifecycle/pending');
    const row = rows.find((x) => x.id === req.transition.id);
    assert.ok(row, 'listed');
    assert.equal(row.canDecide, false);
  });
  await env.ok('fm', '/auth/me', 'PATCH', { name: nameOf('fm') });
  await check(t, 'transfers: the renamed requester cannot approve their own transfer', async () => {
    // No workflow for this check — the transfer is decided on the transfers board.
    await env.models.ApprovalWorkflow.updateMany({ trigger: 'asset_transfer' }, { $set: { status: 'Inactive' } });
    const tr = await env.ok('fm', '/operations/transfers', 'POST', { assetId: A.alpha10, to: 'Plant Block 1', reason: 'Self-approval probe' });
    await env.ok('fm', '/auth/me', 'PATCH', { name: 'Farah Renamed' });
    const r = await env.request('fm', `/operations/transfers/${tr.id}/status`, 'POST', { status: 'Approved' });
    await env.ok('fm', '/auth/me', 'PATCH', { name: nameOf('fm') });
    assert.equal(r.status, 403, JSON.stringify(r.body));
  });
});

// ═══════════════════════════════════════════════════════════════════════════
test('15. Asset 360 details — open WO count, newest WOs first, alerts, tracking tag, links, resume, double submit', { timeout: 240000 }, async (t) => {
  const id = A.clone;
  const due = new Date(Date.now() + 3 * 86400000).toISOString();
  const first = await env.ok('admin', '/work-orders', 'POST', { title: 'Older clone job', assetId: id, dueDate: due });
  await sleep(50);
  const second = await env.ok('admin', '/work-orders', 'POST', { title: 'Newer clone job', assetId: id, dueDate: due });
  await env.models.WorkOrder.updateOne({ _id: first.id }, { $set: { status: 'Cancelled' } });
  await env.models.Alert.create({
    _id: 'ALT-SYNC-1', title: 'Clone pump over-temperature', severity: 'Warning', type: 'Threshold', assetId: id,
    assetName: 'Zeta Clone Pump', status: 'Open', source: 'Sync test',
  });
  await env.ok('admin', `/assets/${id}`, 'PATCH', { trackingTech: 'RFID', trackingId: 'EPC-E2801170000002SYNC' });
  await env.reload(`/assets/${id}`);

  await check(t, '"Open Work Orders" counts only open orders', async () => {
    await env.until(() => env.page.eval(`
      const el=[...document.querySelectorAll('dt,div,span')].find(e=>e.children.length===0 && e.textContent.trim()==='Open Work Orders');
      return el && (el.nextElementSibling?.textContent.trim()==='1');`), 'open WO = 1');
  });
  await check(t, 'overview lists this asset\'s alerts', async () => {
    await env.expectText('Clone pump over-temperature');
  });
  await check(t, 'maintenance tab lists the newest work order first', async () => {
    await env.go(`/assets/${id}?tab=maintenance`);
    await env.expectText('Newer clone job');
    const [n, o] = await env.positions('Newer clone job', 'Older clone job');
    assert.ok(n >= 0 && o >= 0 && n < o, `newer=${n} older=${o}`);
    assert.ok(second.id);
  });
  await check(t, 'live tracking shows the bound tag even without a sensor record', async () => {
    await env.go(`/assets/${id}?tab=tracking`);
    await env.expectText('EPC-E2801170000002SYNC');
    await env.expectNoText('No tracking device attached', 300);
  });
  await check(t, 'no links to routes that do not exist', async () => {
    const bad = [];
    for (const tab of ['warranty', 'sensors']) {
      await env.go(`/assets/${id}?tab=${tab}`);
      bad.push(...(await env.page.eval(`return [...document.querySelectorAll('a')].map(a=>a.getAttribute('href')).filter(h=>['/alerts/rules','/compliance/certifications','/tracking/devices'].includes(h))`)));
    }
    assert.deepEqual(bad, []);
  });
  await check(t, '/assets/new?resume=<id> opens that asset for editing instead of a blank wizard', async () => {
    await env.page.eval(`history.pushState({}, '', '/assets/new?resume=${id}'); window.dispatchEvent(new PopStateEvent('popstate', { state: {} })); return true;`);
    await env.until(async () => (await path()) === `/assets/${id}/edit`, 'redirect to edit', 8000);
  });
  await check(t, 'a double click on the empty-state "Create Work Order" raises one order', async () => {
    const target = A.template;
    await env.go(`/assets/${target}?tab=maintenance`);
    await env.expectText('No work orders');
    // The empty-state button (the last of the two "+ Create Work Order" buttons).
    await env.page.eval(`const b=[...document.querySelectorAll('button')].filter(e=>e.innerText.trim()==='+ Create Work Order').pop(); b.click(); b.click(); return true;`);
    await untilDb(() => env.models.WorkOrder.exists({ assetId: target }), 'work order created');
    await sleep(1500);
    assert.equal(await env.models.WorkOrder.countDocuments({ assetId: target }), 1);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
test('16. a quiet asset keeps its timeline after the estate grows past the dataset caps', { timeout: 300000 }, async (t) => {
  // 185 more assets push >370 activity rows and >185 lifecycle rows into the
  // estate — past /dataset's 200-row caps for both.
  for (let i = 0; i < 185; i++) {
    await env.ok('admin', '/assets', 'POST', assetBody(`Bulk Filler ${String(i).padStart(3, '0')}`));
  }
  const quiet = A.alpha10;
  await env.reload(`/assets/${quiet}?tab=timeline`);
  await check(t, 'Asset 360 timeline still shows the Registration entry', async () => {
    await env.expectText('registered into the asset graph');
  });
  await check(t, 'Asset 360 lifecycle tab still shows the Commissioning entry', async () => {
    await env.go(`/assets/${quiet}?tab=lifecycle`);
    await env.expectText('→ Commissioning');
  });
  await check(t, 'registry count matches the database', async () => {
    const n = await env.models.Asset.countDocuments({});
    await env.go('/assets');
    await env.expectText(`${n} of ${n}`);
  });
});
