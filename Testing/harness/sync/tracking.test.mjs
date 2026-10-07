// Live sync suite — Asset Tracking (fresh estate).
//
// Drives the real SPA against the real API on an empty estate, the way a new
// customer meets it: they register assets with tags, readers start reporting,
// and they work the live map, journey, geofences, inventory, alerts and
// infrastructure screens. Every assertion states the CORRECT behaviour, so a
// failing test is a sync bug (see the report for root causes).
//
//   node --experimental-websocket --import tsx --test Testing/harness/sync/tracking.test.mjs
import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';
import { startEnv, assetBody, nameOf } from './env.mjs';

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const FAC_A = 'Hyderabad Plant';
const minsAgo = (m) => new Date(Date.now() - m * 60_000).toISOString();

let env;
before(async () => { env = await startEnv({ estate: 'fresh', browser: true }); }, { timeout: 240000 });
after(async () => { await env?.stop(); });

// ── helpers ─────────────────────────────────────────────────────────────────

/** Soft checks: a test reports every broken expectation, not just the first. */
function checker(name) {
  const problems = [];
  return {
    check(cond, msg) { if (!cond) problems.push(msg); return !!cond; },
    async done() {
      if (problems.length) {
        await env.page.shot(`sync-track-${name}`).catch(() => {});
        assert.fail(`${problems.length} sync problem(s):\n  - ${problems.join('\n  - ')}`);
      }
    },
  };
}

const occurrences = (body, needle) => body.split(needle).length - 1;
const clickTab = (label) => env.page.clickText('[role=tab]', label);
const clickButton = (label) => env.page.clickText('button', label);
const hasText = async (t, timeout = 6000) => env.page.waitForText(t, timeout);
const pathNow = () => env.page.eval('return location.pathname + location.search');

/** innerText of the first <tr> containing `needle`, or null. */
const rowText = (needle) => env.page.eval(`
  const tr = [...document.querySelectorAll('tr')].find(r => r.innerText.includes(${JSON.stringify(needle)}));
  return tr ? tr.innerText : null;`);

/** Number of table rows containing `needle`. */
const rowCount = (needle) => env.page.eval(`
  return [...document.querySelectorAll('tbody tr')].filter(r => r.innerText.includes(${JSON.stringify(needle)})).length;`);

/** The value shown on a StatTile, found by its label (textContent, so CSS uppercase does not matter). */
const tileValue = (label) => env.page.eval(`
  const span = [...document.querySelectorAll('.glass-panel span')].find(s => s.textContent.trim() === ${JSON.stringify(label)});
  if (!span) return null;
  const tile = span.closest('.glass-panel');
  const v = tile && tile.querySelector('.font-heading');
  return v ? v.textContent.trim() : null;`);

/** Uncaught exceptions plus React's logged render errors since the last clear. */
const pageErrors = () => [
  ...env.page.pageErrors,
  ...env.page.console.filter((m) => m.type === 'error').map((m) => m.text),
].filter((e) => !/favicon|ERR_ABORTED|Failed to load resource|401/i.test(e));
/** Page text lower-cased — tracking headings are CSS-uppercased, which innerText reflects. */
const lower = async () => (await env.text()).toLowerCase();

async function makeTaggedAsset(name, tag, overrides = {}) {
  return env.ok('admin', '/assets', 'POST', assetBody(name, { trackingTech: 'RFID', trackingId: tag, ...overrides }), 201);
}
async function observe(body) {
  return env.ok('admin', '/tracking/observations', 'POST', { source: 'rfid', facility: FAC_A, ...body });
}

// Shared fixtures (created up-front, before the browser ever loads the workspace).
const A1 = { name: 'Sync Tracked Laptop', tag: 'EPC-SYNC-0001' };
const A2 = { name: 'Sync Tracked Scanner', tag: 'EPC-SYNC-0002' };
let a1Id, a2Id;

test('setup: tagged assets are registered and first sightings recorded before anyone opens tracking', async () => {
  // Warm the org-settings singleton first: on a brand-new database the first
  // concurrent reads of it race (find-then-create) and one of /dataset or
  // /dashboard/summary answers 409 — see the report (incidental finding).
  await env.ok('admin', '/dataset');
  a1Id = (await makeTaggedAsset(A1.name, A1.tag)).id;
  a2Id = (await makeTaggedAsset(A2.name, A2.tag)).id;
  const r1 = await observe({ tagId: A1.tag, zone: 'Receiving Dock', at: minsAgo(20), position: { x: 20, y: 30 } });
  const r2 = await observe({ tagId: A2.tag, zone: 'Assembly Line', at: minsAgo(3), position: { x: 60, y: 40 } });
  assert.equal(r1.accepted, true);
  assert.equal(r2.accepted, true);
  const p1 = await env.models.AssetPresence.findById(a1Id).lean();
  assert.equal(p1.zone, 'Receiving Dock');
  await env.login('admin');
});

test('live map & list show an observed tagged asset with its zone, facility and last seen', async () => {
  const c = checker('live-list');
  env.page.clearLogs();
  await env.go('/tracking');
  c.check(await hasText(A2.name, 12000), `/tracking (map) does not list ${A2.name} (observed with a position 3 min ago)`);
  await clickTab('List');
  await hasText(A1.name, 8000);
  const row1 = await rowText(A1.name);
  c.check(row1, `/tracking list has no row for ${A1.name}`);
  if (row1) {
    c.check(row1.includes('Receiving Dock'), `list row for ${A1.name} should show zone "Receiving Dock": ${row1}`);
    c.check(/20m ago|19m ago|21m ago/.test(row1), `list row for ${A1.name} should show last seen ~20m ago: ${row1}`);
  }
  const row2 = await rowText(A2.name);
  c.check(row2 && row2.includes('Assembly Line') && row2.includes('Online'), `list row for ${A2.name} should be Online in Assembly Line: ${row2}`);
  c.check((await tileValue('Tracked')) === '2', `"Tracked" KPI should be 2, got ${await tileValue('Tracked')}`);
  c.check(pageErrors().length === 0, `page errors on /tracking: ${pageErrors().join(' | ')}`);
  await c.done();
});

test('Asset 360 and the registry reflect the latest sighting of a tagged asset', async () => {
  const c = checker('asset360-sighting');
  // What the registry (/assets "Last Ping" column) and Asset 360 read: the dataset row.
  const dataset = await env.ok('admin', '/dataset');
  const row = dataset.assets.find((a) => (a.id ?? a._id) === a1Id);
  c.check(row?.telemetry?.lastPing, `/dataset asset ${a1Id} has no telemetry.lastPing after being observed — registry "Last Ping" shows "Unknown"`);
  await env.go(`/assets/${a1Id}?tab=tracking`);
  await hasText(A1.name, 8000);
  const body = await env.text();
  c.check(!body.includes('No tracking device attached'),
    `Asset 360 Live Tracking says "No tracking device attached" for ${a1Id}, which has tag ${A1.tag} and was observed in Receiving Dock`);
  c.check(body.includes('Receiving Dock'), `Asset 360 Live Tracking does not show the observed zone "Receiving Dock"`);
  await c.done();
});

test('a second sighting: the open live screen updates on the 60s poll; journey shows both stops oldest first', async () => {
  const c = checker('journey-poll');
  await env.reload('/tracking?tab=list');
  await hasText(A1.name, 10000);
  c.check(((await rowText(A1.name)) ?? '').includes('Receiving Dock'), 'precondition: list shows A1 in Receiving Dock');
  const moved = await observe({ tagId: A1.tag, zone: 'Server Room', at: minsAgo(1), position: { x: 70, y: 70 } });
  assert.equal(moved.zone, 'Server Room');
  // Leave the screen open across one workspace poll (refetchInterval 60s).
  const t0 = Date.now();
  let updated = false;
  while (Date.now() - t0 < 75_000) {
    if (((await rowText(A1.name)) ?? '').includes('Server Room')) { updated = true; break; }
    await sleep(2000);
  }
  const polled = env.page.responses.filter((r) => r.url.includes('/tracking/workspace')).length;
  c.check(updated, `/tracking list left open for 75s still shows ${A1.name} in Receiving Dock after it was seen in Server Room (workspace fetched ${polled}x — the poll ran but the screen never re-rendered)`);

  // Client-side navigation to the journey screen (fresh mount, reads the polled data).
  env.page.clearLogs();
  await env.go('/tracking/journey');
  c.check(await hasText(A1.name, 8000), `/tracking/journey does not list ${A1.name} after two sightings in different zones`);
  const jrow = (await rowText(A1.name)) ?? '';
  c.check(jrow.includes('Server Room'), `journey row "Currently in" should be Server Room: ${jrow}`);
  // Open the trail.
  await env.page.eval(`const tr=[...document.querySelectorAll('tbody tr')].find(r=>r.innerText.includes(${JSON.stringify(A1.name)})); tr && tr.click(); return !!tr;`);
  await sleep(800);
  const errs = pageErrors();
  c.check(errs.length === 0, `opening ${A1.name}'s trail throws: ${errs.slice(0, 2).join(' | ').slice(0, 300)}`);
  const trail = await env.text();
  c.check(trail.toLowerCase().includes('the trail, oldest first'), `the trail drawer did not render for ${A1.name}; page shows: ${trail.slice(0, 160).replace(/\n/g, ' ')}`);
  // Read the drawer alone: the journey table behind it also says "Server Room"
  // (its "Currently in" column), which made a whole-page search meaningless.
  const [dock, server] = await env.page.eval(`
    const d = document.querySelector('[role=dialog]'); const t = d ? d.innerText : '';
    return [t.indexOf('Receiving Dock'), t.indexOf('Server Room')];`);
  c.check(dock >= 0 && server > dock, `trail should list Receiving Dock before Server Room (positions ${dock}, ${server})`);
  c.check(!/undefined|NaN/.test(trail), 'trail drawer renders "undefined"/"NaN" text');
  const db = await env.models.AssetJourney.findById(a1Id).lean();
  c.check(db?.stops?.length === 2 && db.stops.every((s) => s.kind), `AssetJourney stops should be 2 with a kind each: ${JSON.stringify(db?.stops)}`);

  // The live map drawer's "Recent journey" for the same asset.
  await env.reload('/tracking?tab=list');
  await hasText(A1.name, 10000);
  env.page.clearLogs();
  await env.page.eval(`const tr=[...document.querySelectorAll('tbody tr')].find(r=>r.innerText.includes(${JSON.stringify(A1.name)})); tr && tr.click(); return !!tr;`);
  await sleep(800);
  const drawer = await env.text();
  c.check(drawer.toLowerCase().includes('recent journey'), '/tracking drawer has no "Recent journey" section for an asset with a journey');
  c.check(!/undefined ·|NaN/.test(drawer), `/tracking drawer renders "undefined"/"NaN": ${(drawer.match(/.{0,30}(undefined ·|NaN).{0,30}/) ?? [''])[0]}`);
  c.check(pageErrors().length === 0, `page errors in /tracking drawer: ${pageErrors().join(' | ').slice(0, 300)}`);
  await c.done();
});

test('geofence: a breach of a fence or an armed zone reaches /alerts, /tracking/alerts and the geofence screen', async () => {
  const c = checker('geofence-breach');
  // A legacy fence rectangle (general alert centre) …
  await env.ok('admin', '/tracking/geofences', 'POST', {
    name: 'Secure Cage Fence', zoneId: 'Secure Cage', x: 10, y: 10, width: 20, height: 20, rule: 'Restricted',
  }, 201);
  // … and a tracked zone, which is what the Geofences screen lists and arms.
  // There is no API to draw tracked zones yet, so it is installed directly, as
  // a site survey would; arming it then goes through the real screen.
  await env.models.TrackedZone.create({
    _id: 'TZ-SYNC-CAGE', name: 'Secure Cage', facility: 'fac-a', kind: 'Storeroom',
    x: 10, y: 10, width: 20, height: 20, policy: 'Authorised only', armed: false,
  });
  await env.reload('/tracking/geofences');
  c.check(await hasText('Secure Cage', 8000), '/tracking/geofences does not list the tracked zone "Secure Cage"');
  c.check(await env.page.click('[aria-label="Arm Secure Cage"]'), 'no arm switch for Secure Cage on /tracking/geofences');
  await env.until(async () => (await env.models.TrackedZone.findById('TZ-SYNC-CAGE').lean())?.armed === true, 'zone armed in MongoDB');

  const res = await observe({ tagId: A2.tag, zone: 'Secure Cage', facility: FAC_A, at: minsAgo(0.5), position: { x: 15, y: 15 } });
  c.check(res.geofencesBreached?.includes('Secure Cage Fence'), `observation did not report the fence breach: ${JSON.stringify(res)}`);
  c.check(res.geofencesBreached?.includes('Secure Cage'), `observation did not report the armed-zone breach: ${JSON.stringify(res)}`);
  const alert = await env.models.Alert.findOne({ assetId: a2Id, type: 'Geofence' }).lean();
  c.check(alert, 'no general Alert row was created for the fence breach');
  const zone = await env.models.TrackedZone.findById('TZ-SYNC-CAGE').lean();
  c.check(zone?.violations24h === 1, `armed zone violations24h should be 1, is ${zone?.violations24h}`);
  const trackingAlerts = await env.models.TrackingAlert.find({ assetId: a2Id }).lean();
  c.check(trackingAlerts.length === 1, `one tracking alert expected for one asset in one place (fence + zone dedupe), got ${trackingAlerts.length}`);

  // The breach came from a reader, not this browser: an open browser sees it on
  // its next refresh (navigation once the data is 30s old, a poll, or a
  // reload). A reload is the deterministic one to assert on.
  const title = alert?.title ?? `${A2.name} entered restricted area Secure Cage Fence`;
  await env.reload('/alerts');
  c.check(await hasText(title, 10000), `/alerts does not show "${title}" after a reload`);
  await env.go('/');
  c.check(await hasText(title, 8000) || await hasText('Secure Cage', 1000), `dashboard does not surface the breach alert "${title}"`);
  await env.reload('/tracking/alerts');
  c.check(await hasText('Secure Cage', 8000), '/tracking/alerts queue does not show the breach');
  await env.go('/tracking/geofences');
  await hasText('Secure Cage', 6000);
  const v = await tileValue('Violations 24h');
  c.check(v === '1', `/tracking/geofences "Violations 24h" should count the breach (1), shows ${v}`);
  await env.go('/tracking?tab=list');
  await hasText(A2.name, 6000);
  const r2 = (await rowText(A2.name)) ?? '';
  c.check(r2.includes('Secure Cage'), `/tracking list should show ${A2.name} in Secure Cage: ${r2}`);
  await c.done();
});
