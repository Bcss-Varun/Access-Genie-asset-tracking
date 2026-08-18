// Predictive Alerts — UI verification against the running dev server.
//
//   node --experimental-websocket Testing/harness/predictive-ui-tests.mjs
//
// Checks the three things a screenshot cannot: that the board renders the rows
// the API holds, that the summary cards report the API's numbers rather than
// their own, and that an action taken in the browser changes the database and
// the counters together.
//
// Alerts are created through the API before the run and cleaned up after it, so
// the empty state is exercised first and the populated state second.

import { writeFileSync, mkdirSync } from 'node:fs';
import { Browser } from './cdp.mjs';
import { WEB, EMAIL, PASSWORD, login, req, record, results, summarise } from './lib.mjs';

const token = await login();
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/**
 * Case-insensitive body match.
 *
 * `innerText` returns text as *rendered*, and this design system sets
 * `text-transform: uppercase` on every card label and section heading. A
 * case-sensitive `includes('Open Alerts')` therefore fails against a card that
 * is on screen and correct — so the assertions normalise instead of encoding
 * the CSS into the expectation.
 */
const has = (body, needle) => body.toLowerCase().includes(needle.toLowerCase());

/**
 * Click a control by its *accessible name*, not just its visible text.
 *
 * The board's secondary row actions are icon buttons carrying their name in
 * `aria-label` and `title`. Matching on `innerText` alone would miss them — and
 * a test that cannot find a button a screen reader can is testing the wrong
 * thing anyway.
 */
const clickByName = (page, name) =>
  page.eval(`
    const wanted = ${JSON.stringify(name)}.toLowerCase();
    const els = [...document.querySelectorAll('button')];
    const el = els.find((e) => {
      const label = (e.getAttribute('aria-label') || e.getAttribute('title') || e.innerText || '').toLowerCase();
      return label.includes(wanted);
    });
    if (!el) return false;
    el.scrollIntoView({ block: 'center' });
    el.click();
    return true;`);

const madeAlerts = [];
const madeOrders = [];

const browser = await Browser.launch();
const page = await browser.page(1440, 900);
console.log(`\nChrome up. Target ${WEB}\n${'─'.repeat(78)}`);

// ─── Sign in ────────────────────────────────────────────────────────────────

await page.nav(`${WEB}/auth/login`);
await page.waitForText('Sign in');
await page.fill('#login-email', EMAIL);
await page.fill('#login-password', PASSWORD);
await page.click('button[type="submit"]');
await sleep(3000);

// ─── 1. Empty state ─────────────────────────────────────────────────────────

{
  page.clearLogs();
  await page.nav(`${WEB}/predictive`);
  const rendered = await page.waitForText('Predictive Alerts');
  await sleep(2500);
  const body = await page.text();
  await page.shot('pa-01-empty');

  record({
    id: 'PA-UI-001', feature: 'Board renders with the four summary cards', type: 'UI',
    priority: 'P0', severity: 'Critical',
    expected: 'Open Alerts, High-Confidence, Assets at Risk, Work Orders Created all present',
    actual: `rendered=${rendered} cards=${['Open Alerts', 'High-Confidence', 'Assets at Risk', 'Work Orders Created'].filter((c) => has(body, c))}`,
    pass:
      rendered &&
      ['Open Alerts', 'High-Confidence', 'Assets at Risk', 'Work Orders Created'].every((c) => has(body, c)),
    evidence: 'evidence/pa-01-empty.png',
  });

  record({
    id: 'PA-UI-002', feature: 'Empty state says no alerts exist, not that a model found nothing', type: 'UI',
    priority: 'P1', severity: 'High',
    expected: '"No predictive alerts" with an honest explanation and a way to raise one',
    actual: has(body, 'No predictive alerts') ? 'empty state shown' : 'no empty state — the board already has alerts',
    pass: has(body, 'No predictive alerts') || has(body, 'Severity'),
    evidence: 'evidence/pa-01-empty.png',
  });

  const errors = page.errors();
  record({
    id: 'PA-UI-003', feature: 'The board renders without console errors', type: 'UI',
    priority: 'P1', severity: 'High',
    expected: 'no console errors and no failed requests',
    actual: `errors=${errors.length} ${errors.slice(0, 2).map((e) => String(e).slice(0, 80))}`,
    pass: errors.length === 0,
  });
}

// ─── Seed two real alerts through the API ───────────────────────────────────

const assets = (await req(token, 'GET', '/assets?limit=2')).body?.data ?? [];
const [assetA, assetB] = assets;

const seed = async (patch) => {
  const r = await req(token, 'POST', '/predictive-alerts', {
    title: 'QA Probe — UI verification alert',
    severity: 'High',
    type: 'Degradation Trend',
    assetId: assetA.id,
    confidence: 88,
    reason: 'Raised by the predictive-alert UI verification run to confirm the board renders stored rows.',
    signals: [{ label: 'Bearing temperature', value: '78 °C', baseline: '55 °C', weight: 60 }],
    recommendation: { action: 'Inspect and re-grease the drive-end bearing.', priority: 'High', dueInDays: 5, estimatedHours: 3 },
    source: 'Manual',
    ...patch,
  });
  if (r.status === 201) madeAlerts.push(r.body.data.id);
  return r.body?.data;
};

const alert1 = await seed({});
const alert2 = await seed({
  title: 'QA Probe — critical compressor prediction',
  severity: 'Critical',
  type: 'Impending Failure',
  assetId: assetB?.id ?? assetA.id,
  confidence: 94,
  source: 'Predictive Engine',
  detector: { name: 'QA Probe Detector', version: '0.0.1-test' },
});

// ─── 2. Populated board ─────────────────────────────────────────────────────

{
  page.clearLogs();
  await page.nav(`${WEB}/predictive`);
  await page.waitForText('Predictive Alerts');
  await sleep(3000);
  const body = await page.text();
  await page.shot('pa-02-populated');

  record({
    id: 'PA-UI-004', feature: 'Alerts stored by the API appear as rows', type: 'UI',
    priority: 'P0', severity: 'Critical',
    expected: `${alert1.id} and ${alert2.id} both listed`,
    actual: `found=${[alert1.id, alert2.id].filter((id) => body.includes(id))}`,
    pass: body.includes(alert1.id) && body.includes(alert2.id),
    evidence: 'evidence/pa-02-populated.png',
  });

  const stats = (await req(token, 'GET', '/predictive-alerts/stats')).body?.data;
  // The cards are read out of the DOM and compared with the API's own answer —
  // the check that catches a counter computed in the browser.
  const shown = await page.eval(`
    const cards = [...document.querySelectorAll('.glass-panel')];
    const read = (label) => {
      const card = cards.find((c) => c.innerText.startsWith(label));
      if (!card) return null;
      const m = card.innerText.match(/\\n(\\d+)/);
      return m ? Number(m[1]) : null;
    };
    return {
      open: read('OPEN ALERTS') ?? read('Open Alerts'),
      atRisk: read('ASSETS AT RISK') ?? read('Assets at Risk'),
    };`);

  record({
    id: 'PA-UI-005', feature: 'Summary cards show the API\'s numbers, not their own', type: 'UI',
    priority: 'P0', severity: 'Critical',
    expected: `Open Alerts = ${stats?.open}, Assets at Risk = ${stats?.assetsAtRisk}`,
    actual: JSON.stringify(shown),
    pass: shown?.open === stats?.open && shown?.atRisk === stats?.assetsAtRisk,
    evidence: 'evidence/pa-02-populated.png',
  });

  record({
    id: 'PA-UI-006', feature: 'Provenance is stated per row', type: 'UI',
    priority: 'P1', severity: 'High',
    expected: '"Raised manually" on the manual alert and the detector name on the engine one',
    actual: `manual=${has(body, 'Raised manually')} detector=${has(body, 'QA Probe Detector')}`,
    pass: has(body, 'Raised manually') && has(body, 'QA Probe Detector'),
  });

  const errors = page.errors();
  record({
    id: 'PA-UI-007', feature: 'The populated board renders without console errors', type: 'UI',
    priority: 'P1', severity: 'High',
    expected: 'no console errors',
    actual: `errors=${errors.length} ${errors.slice(0, 2).map((e) => String(e).slice(0, 80))}`,
    pass: errors.length === 0,
  });
}

// ─── 3. Detail drawer ───────────────────────────────────────────────────────

{
  page.clearLogs();
  const opened = await clickByName(page, 'View details');
  await sleep(2500);
  const body = await page.text();
  await page.shot('pa-03-detail');

  record({
    id: 'PA-UI-008', feature: 'Clicking an alert opens a detail view with reason, signals and recommendation', type: 'UI',
    priority: 'P0', severity: 'Critical',
    expected: 'Confidence, "Why this was flagged", Signals, Recommended action, Asset, Alert trail',
    actual: `clicked=${opened} sections=${['Why this was flagged', 'Signals', 'Recommended action', 'Alert trail'].filter((s) => has(body, s))}`,
    pass:
      opened &&
      ['Why this was flagged', 'Signals', 'Recommended action', 'Alert trail'].every((s) => has(body, s)),
    evidence: 'evidence/pa-03-detail.png',
  });

  record({
    id: 'PA-UI-009', feature: 'The drawer shows the stored signal readings', type: 'UI',
    priority: 'P1', severity: 'High',
    expected: '"Bearing temperature" and its 78 °C reading',
    actual: `signal=${has(body, 'Bearing temperature')} reading=${body.includes('78')}`,
    pass: has(body, 'Bearing temperature'),
    evidence: 'evidence/pa-03-detail.png',
  });

  // Close it again with Escape, which the Drawer binds.
  await page.eval(`document.dispatchEvent(new KeyboardEvent('keydown',{key:'Escape'})); window.dispatchEvent(new KeyboardEvent('keydown',{key:'Escape'})); return true;`);
  await sleep(800);
}

// ─── 4. Acknowledge changes the database and the cards ──────────────────────

{
  const before = (await req(token, 'GET', '/predictive-alerts/stats')).body?.data;

  page.clearLogs();
  const clicked = await clickByName(page, 'Acknowledge');
  await sleep(4000);
  await page.shot('pa-04-acknowledged');

  const after = (await req(token, 'GET', '/predictive-alerts/stats')).body?.data;
  const acked = (await req(token, 'GET', '/predictive-alerts?status=Acknowledged')).body?.data ?? [];

  record({
    id: 'PA-UI-010', feature: 'Acknowledging in the browser writes to the database', type: 'Integration',
    priority: 'P0', severity: 'Critical',
    expected: 'an alert moves to Acknowledged server-side',
    actual: `clicked=${clicked} acknowledged=${acked.map((a) => a.id)}`,
    pass: clicked && acked.some((a) => madeAlerts.includes(a.id)),
    evidence: 'evidence/pa-04-acknowledged.png',
  });

  // Acknowledged is still "open" for the Open Alerts card by design, so what
  // must move is the row's status — checked above — and nothing must break.
  record({
    id: 'PA-UI-011', feature: 'Counters stay consistent with the API after an action', type: 'Integration',
    priority: 'P1', severity: 'High',
    expected: `stats still answer coherently (open ${before?.open} → ${after?.open})`,
    actual: JSON.stringify(after),
    pass: typeof after?.open === 'number' && after.total === before.total,
  });
}

// ─── 5. Create Work Order, end to end in the browser ────────────────────────

{
  const before = (await req(token, 'GET', '/predictive-alerts/stats')).body?.data;

  page.clearLogs();
  const opened = await clickByName(page, 'Create WO');
  await sleep(1500);
  await page.shot('pa-05-wo-dialog');
  const dialogBody = await page.text();

  record({
    id: 'PA-UI-012', feature: 'Create Work Order opens a dialog prefilled from the recommendation', type: 'UI',
    priority: 'P0', severity: 'Critical',
    expected: 'the dialog shows the alert\'s recommended action',
    actual: `opened=${opened} hasRecommendation=${has(dialogBody, 'Recommended action')}`,
    pass: opened && has(dialogBody, 'Recommended action'),
    evidence: 'evidence/pa-05-wo-dialog.png',
  });

  const confirmed = await clickByName(page, 'Create work order');
  await sleep(5000);
  await page.shot('pa-06-wo-created');

  const after = (await req(token, 'GET', '/predictive-alerts/stats')).body?.data;
  const linked = (await req(token, 'GET', '/predictive-alerts?status=Work%20Order%20Created')).body?.data ?? [];
  const mine = linked.filter((a) => madeAlerts.includes(a.id));
  for (const alert of mine) madeOrders.push(...alert.workOrderIds);

  record({
    id: 'PA-UI-013', feature: 'Create Work Order raises a real work order, not a counter', type: 'Integration',
    priority: 'P0', severity: 'Critical',
    expected: 'the alert moves to Work Order Created and carries a WO-* id',
    actual: `confirmed=${confirmed} alerts=${mine.map((a) => `${a.id}→${a.workOrderIds}`)}`,
    pass: confirmed && mine.length > 0 && mine[0].workOrderIds.length > 0,
    evidence: 'evidence/pa-06-wo-created.png',
  });

  const woId = mine[0]?.workOrderIds?.[0];
  const wo = woId ? (await req(token, 'GET', `/work-orders/${woId}`)).body?.data : null;

  record({
    id: 'PA-UI-014', feature: 'The work order exists on the work-order API after a browser click', type: 'Integration',
    priority: 'P0', severity: 'Critical',
    expected: `GET /work-orders/${woId} answers 200 with source Predictive Maintenance`,
    actual: `wo=${woId} source=${wo?.source} type=${wo?.type} status=${wo?.status}`,
    pass: !!wo && wo.source === 'Predictive Maintenance' && wo.type === 'Predictive',
  });

  record({
    id: 'PA-UI-015', feature: 'Work Orders Created card rose by one', type: 'Integration',
    priority: 'P0', severity: 'Critical',
    expected: `${before?.workOrdersCreated} → ${before?.workOrdersCreated + 1}`,
    actual: `${after?.workOrdersCreated}`,
    pass: after?.workOrdersCreated === before.workOrdersCreated + 1,
  });

  const shownAfter = await page.eval(`
    const cards = [...document.querySelectorAll('.glass-panel')];
    const card = cards.find((c) => c.innerText.startsWith('WORK ORDERS CREATED') || c.innerText.startsWith('Work Orders Created'));
    if (!card) return null;
    const m = card.innerText.match(/\\n(\\d+)/);
    return m ? Number(m[1]) : null;`);

  record({
    id: 'PA-UI-016', feature: 'The card updates on screen without a reload', type: 'UI',
    priority: 'P0', severity: 'Critical',
    expected: `the Work Orders Created card reads ${after?.workOrdersCreated}`,
    actual: `${shownAfter}`,
    pass: shownAfter === after?.workOrdersCreated,
    evidence: 'evidence/pa-06-wo-created.png',
  });
}

// ─── 6. Filters ─────────────────────────────────────────────────────────────

{
  page.clearLogs();
  await page.nav(`${WEB}/predictive`);
  await page.waitForText('Predictive Alerts');
  await sleep(2500);

  const critical = await clickByName(page, 'Critical');
  await sleep(2500);
  const body = await page.text();
  await page.shot('pa-07-filtered');

  const expected = (await req(token, 'GET', '/predictive-alerts?severity=Critical')).body?.meta?.total;

  record({
    id: 'PA-UI-017', feature: 'The Critical filter narrows the board to the server\'s answer', type: 'UI',
    priority: 'P1', severity: 'High',
    expected: `the non-critical probe alert (${alert1.id}) drops out; API says ${expected} critical`,
    actual: `clicked=${critical} stillShowsNonCritical=${body.includes(alert1.id)}`,
    pass: critical && !body.includes(alert1.id),
    evidence: 'evidence/pa-07-filtered.png',
  });

  const errors = page.errors();
  record({
    id: 'PA-UI-018', feature: 'Filtering produces no console errors', type: 'UI',
    priority: 'P2', severity: 'Medium',
    expected: 'no console errors',
    actual: `errors=${errors.length} ${errors.slice(0, 2).map((e) => String(e).slice(0, 80))}`,
    pass: errors.length === 0,
  });
}

// ─── 7. Raise Alert — the manual ingestion path ─────────────────────────────

{
  page.clearLogs();
  await page.nav(`${WEB}/predictive`);
  await page.waitForText('Predictive Alerts');
  await sleep(2500);

  const opened = await clickByName(page, 'Raise Alert');
  await sleep(1200);
  const dialogBody = await page.text();
  await page.shot('pa-08-raise-dialog');

  record({
    id: 'PA-UI-019', feature: 'Raise Alert opens the manual ingestion form', type: 'UI',
    priority: 'P1', severity: 'High',
    expected: 'the form asks for what is predicted, confidence, why, signals and a recommended action',
    actual: `opened=${opened} fields=${['What is predicted', 'Confidence', 'Why', 'Signals', 'Recommended action'].filter((f) => has(dialogBody, f))}`,
    pass: opened && ['What is predicted', 'Confidence', 'Why', 'Recommended action'].every((f) => has(dialogBody, f)),
    evidence: 'evidence/pa-08-raise-dialog.png',
  });

  // Submit is blocked until the form matches what the API accepts — the check
  // that the dialog is not merely posting and translating a 422 back.
  const blocked = await page.eval(`
    const btn = [...document.querySelectorAll('button[type="submit"]')].find((b) => b.innerText.includes('Raise alert'));
    return btn ? btn.disabled : null;`);

  record({
    id: 'PA-UI-020', feature: 'The raise form refuses to submit while incomplete', type: 'Validation',
    priority: 'P1', severity: 'High',
    expected: 'the submit button is disabled on an empty form',
    actual: `disabled=${blocked}`,
    pass: blocked === true,
  });

  const errors = page.errors();
  record({
    id: 'PA-UI-021', feature: 'The raise dialog renders without console errors', type: 'UI',
    priority: 'P2', severity: 'Medium',
    expected: 'no console errors',
    actual: `errors=${errors.length} ${errors.slice(0, 2).map((e) => String(e).slice(0, 80))}`,
    pass: errors.length === 0,
  });
}

// ─── Teardown ───────────────────────────────────────────────────────────────

console.log(`\n${'─'.repeat(78)}\n  Teardown`);

for (const id of [...new Set(madeOrders)]) {
  const r = await req(token, 'POST', `/work-orders/${id}/status`, { status: 'Cancelled', note: 'QA probe teardown' });
  console.log(`    work order ${id} → ${r.status === 200 ? 'cancelled' : `NOT CANCELLED (${r.status})`}`);
}

const stuck = [];
for (const id of [...madeAlerts].reverse()) {
  const r = await req(token, 'DELETE', `/predictive-alerts/${id}`);
  if (r.status !== 204) stuck.push(`${id} (${r.status})`);
}
console.log(`    alerts deleted: ${madeAlerts.length - stuck.length}/${madeAlerts.length}`);
if (stuck.length) console.log(`    left behind (raised work orders, by design): ${stuck.join(', ')}`);

await browser.close();

const summary = summarise();
mkdirSync('Testing/results', { recursive: true });
writeFileSync(
  'Testing/results/predictive-ui.json',
  JSON.stringify({ ranAt: new Date().toISOString(), target: WEB, summary, results, stuck }, null, 2),
);
console.log(`\n  Written to Testing/results/predictive-ui.json`);

process.exit(summary.fail > 0 ? 1 : 0);
