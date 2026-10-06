// Live sync suite — governance module group:
//   alerts · notifications · compliance & audit · administration · analytics & reports · settings
//
// Each test drives a write (through the real UI wherever the UI allows it) and
// then asserts that every other screen which should reflect it does so after a
// CLIENT-SIDE navigation (env.go — caches survive), that ordering is sensible,
// that counters follow, and that MongoDB holds what the UI claims.
//
// The assertions describe the CORRECT behaviour. A failing test is a sync bug.
//
// Run:
//   node --experimental-websocket --import tsx --test Testing/harness/sync/governance.test.mjs
import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';
import { startEnv, assetBody, nameOf, emailOf, SCOPE } from './env.mjs';

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let env;

before(async () => { env = await startEnv({ estate: 'fresh', browser: true }); }, { timeout: 240000 });
after(async () => { await env?.stop(); });

// ── helpers (local to this file) ────────────────────────────────────────────

/** Click the first visible element matching `sel` whose trimmed text equals (or, loosely, contains) `label`. */
async function clickLabel(label, { sel = 'button, a, [role="tab"], [role="menuitem"], [role="option"]', exact = true, last = false } = {}) {
  const ok = await env.page.eval(`
    const want = ${JSON.stringify(label)};
    const els = [...document.querySelectorAll(${JSON.stringify(sel)})].filter((e) => e.offsetParent !== null || e.getClientRects().length);
    const norm = (s) => (s || '').replace(/\\s+/g, ' ').trim();
    const match = els.filter((e) => ${exact} ? norm(e.innerText || e.value) === want : norm(e.innerText || e.value).includes(want));
    const el = ${last} ? match[match.length - 1] : match[0];
    if (!el) return false;
    if (el.disabled) return 'disabled';
    el.scrollIntoView({ block: 'center' });
    el.click();
    return true;`);
  assert.equal(ok, true, `clickable "${label}" (${sel}) — got ${ok}`);
}

/** Click a button inside the row (tr / li / card) that contains `rowText`. */
async function clickInRow(rowText, label, { rowSel = 'tr, li, [data-row], .glass-panel > div, .glass-panel' } = {}) {
  const ok = await env.page.eval(`
    const rows = [...document.querySelectorAll(${JSON.stringify(rowSel)})].filter((r) => (r.innerText || '').includes(${JSON.stringify(rowText)}));
    // Smallest row that contains the text — the most specific container.
    rows.sort((a, b) => (a.innerText || '').length - (b.innerText || '').length);
    for (const row of rows) {
      const btn = [...row.querySelectorAll('button, a')].find((b) => (b.innerText || b.getAttribute('aria-label') || '').replace(/\\s+/g, ' ').trim() === ${JSON.stringify(label)});
      if (btn) { if (btn.disabled) return 'disabled'; btn.scrollIntoView({ block: 'center' }); btn.click(); return true; }
    }
    return false;`);
  assert.equal(ok, true, `button "${label}" in row containing "${rowText}" — got ${ok}`);
}

/** The value shown on a KpiCard (or any label/value tile) whose label matches. */
async function kpi(label) {
  return env.page.eval(`
    const want = ${JSON.stringify(label)}.toLowerCase();
    // KpiCard, MetricCard and dashboard tiles all render [label, value, …] siblings.
    const cards = [...document.querySelectorAll('div, a')];
    for (const c of cards) {
      const kids = [...c.children];
      if (kids.length >= 2 && (kids[0].innerText || '').trim().toLowerCase() === want) return (kids[1].innerText || '').trim();
    }
    return null;`);
}

/** Fill the input/textarea/select that follows a <label> with this text (FormDialog Field). */
async function fillField(labelText, value) {
  const sel = await env.page.eval(`
    const want = ${JSON.stringify(labelText)}.toLowerCase();
    const labels = [...document.querySelectorAll('label')].filter((l) => (l.innerText || '').replace(/\\*/g, '').trim().toLowerCase().startsWith(want));
    for (const l of labels) {
      let el = l.htmlFor ? document.getElementById(l.htmlFor) : null;
      if (!el) el = l.querySelector('input, textarea, select');
      if (!el) el = l.parentElement && l.parentElement.querySelector('input, textarea, select');
      if (el) { const id = el.id || ('sync-' + Math.random().toString(36).slice(2)); el.id = id; return '#' + CSS.escape(id); }
    }
    return null;`);
  assert.ok(sel, `field labelled "${labelText}"`);
  assert.equal(await env.page.fill(sel, value), true, `fill "${labelText}"`);
}

async function shot(name) { try { await env.page.shot(`sync-gov-${name}`); } catch { /* best effort */ } }

/** Wrap an assertion block so a screenshot is taken on failure. */
async function withShot(name, fn) {
  try { return await fn(); } catch (err) { await shot(name); throw err; }
}

const pathNow = () => env.page.eval('return location.pathname');

/** Run `fn` and wait until a toast/text appears. */
async function waitText(text, timeout = 12000) { await env.expectText(text, timeout); }

// ── fixtures ─────────────────────────────────────────────────────────────────
const fx = { assets: [], alerts: [] };

test('setup: assets and alerts through the API, admin signs in', { timeout: 120000 }, async () => {
  for (let i = 1; i <= 3; i++) {
    fx.assets.push(await env.ok('admin', '/assets', 'POST', assetBody(`Gov asset ${i}`)));
  }
  // One asset at the other facility, for scope checks.
  fx.assetB = await env.ok('admin', '/assets', 'POST', assetBody('Gov Pune asset', { location: { id: SCOPE.facB._id, name: SCOPE.facB.name } }));
  // Twelve alerts so ALT-10..12 exist — exposes string-ordering of ids.
  for (let i = 1; i <= 12; i++) {
    fx.alerts.push(await env.ok('admin', '/alerts', 'POST', {
      title: `Gov alert ${String(i).padStart(2, '0')}`, severity: i % 3 === 0 ? 'Critical' : 'Warning',
      type: 'Temperature', source: 'Manual', assetId: fx.assets[0].id,
    }, 201));
    await sleep(15); // distinct createdAt
  }
  fx.alertB = await env.ok('admin', '/alerts', 'POST', { title: 'Gov Pune alert', severity: 'Critical', type: 'Theft', source: 'Manual', assetId: fx.assetB.id }, 201);
  assert.equal(fx.alerts[0].id, 'ALT-1');
  await env.login('admin');
});

// ═════════════════════════════════════════════════════════════════════════════
// ALERTS
// ═════════════════════════════════════════════════════════════════════════════

test('alerts: /alerts lists newest first (ALT-12 above ALT-2 above ALT-1)', async () => {
  await env.go('/alerts');
  await waitText('Gov alert 12');
  const [p12, p10, p2, p1] = await env.positions('Gov alert 12', 'Gov alert 10', 'Gov alert 02', 'Gov alert 01');
  assert.ok(p12 >= 0 && p12 < p10 && p10 < p2 && p2 < p1, `newest-first order expected, got positions ${[p12, p10, p2, p1]}`);
});

test('alerts: acknowledging from the /alerts row updates the row, the KPIs, the detail page and MongoDB', async () => {
  await env.reload('/alerts');
  await waitText('Gov alert 01');
  const openBefore = Number(await kpi('Open'));
  assert.equal(openBefore, 13, 'admin sees 13 open alerts');
  await clickInRow('Gov alert 01', 'Ack', { rowSel: 'tr' });
  await env.until(async () => Number(await kpi('Open')) === openBefore - 1, 'Open KPI decrements');
  await env.until(async () => (await env.models.Alert.findById('ALT-1').lean())?.status === 'Acknowledged', 'ALT-1 acknowledged in DB');
  const doc = await env.models.Alert.findById('ALT-1').lean();
  assert.equal(doc.acknowledgedBy, nameOf('admin'), 'acknowledgedBy is the acting user');
  assert.ok(doc.acknowledgedAt, 'acknowledgedAt stored');

  // Audit trail row for the action.
  await env.until(async () => env.models.AuditLog.findOne({ action: 'alert.acknowledge', target: 'ALT-1' }).lean(), 'audit row for alert.acknowledge');

  // Detail page after client-side navigation.
  await env.go('/alerts/ALT-1');
  await waitText('Gov alert 01');
  await waitText('Acknowledged');
});

test('alerts: detail page Acknowledge → timeline names the real acknowledger, not a hard-coded person', async () => {
  await env.go('/alerts/ALT-2');
  await waitText('Gov alert 02');
  await clickLabel('Acknowledge');
  await env.until(async () => (await env.models.Alert.findById('ALT-2').lean())?.status === 'Acknowledged', 'ALT-2 acknowledged in DB');
  await env.until(async () => (await env.text()).includes('Acknowledged'), 'status badge updates in place');
  await withShot('alert-timeline-actor', async () => {
    const body = await env.text();
    assert.ok(!body.includes('Sneha Iyer'), 'timeline must not credit a fixture person ("Sneha Iyer") who did not act');
    assert.ok(body.includes(nameOf('admin')), `timeline shows the acknowledger "${nameOf('admin')}"`);
  });
});

test('alerts: Acknowledged → Resolved without escalation must not show "Escalated to on-call" as done', async () => {
  await env.go('/alerts/ALT-2');
  await waitText('Gov alert 02');
  await clickLabel('Resolve');
  await env.until(async () => (await env.models.Alert.findById('ALT-2').lean())?.status === 'Resolved', 'ALT-2 resolved in DB');
  const doc = await env.models.Alert.findById('ALT-2').lean();
  assert.equal(doc.resolvedBy, nameOf('admin'));
  await env.until(async () => (await env.text()).includes('Resolved'), 'status badge Resolved');
  // The timeline marks each step "done" by index — Escalated (idx 2) is shown as done although it never happened.
  const escalatedDone = await env.page.eval(`
    const li = [...document.querySelectorAll('ol li')].find((l) => (l.innerText || '').includes('Escalated to on-call'));
    if (!li) return null;
    return !(li.querySelector('.opacity-50') || li.innerText.includes('Pending'));`);
  await withShot('alert-timeline-escalated', async () => {
    // Absent (null) or shown as pending (false) are both truthful; drawn as done is not.
    assert.notEqual(escalatedDone, true, 'an alert that was never escalated must not show the escalation step as completed');
  });
});

test('alerts: Assign from the detail page stores the owner and the owner is visible on the detail page and the list', async () => {
  await env.go('/alerts/ALT-3');
  await waitText('Gov alert 03');
  await clickLabel('Assign');
  await env.page.waitForSelector('select');
  // Pick the facility manager as owner.
  const sel = await env.page.eval(`const s = document.querySelector('[role="dialog"] select, form select, select'); if (!s) return null; s.id = s.id || 'sync-owner'; return '#' + s.id;`);
  await env.page.fill(sel, nameOf('fm'));
  await clickLabel('Assign', { sel: '[role="dialog"] button, form button', last: true });
  await env.until(async () => (await env.models.Alert.findById('ALT-3').lean())?.assignedTo === nameOf('fm'), 'assignedTo stored');
  const doc = await env.models.Alert.findById('ALT-3').lean();
  assert.equal(doc.status, 'Acknowledged', 'assigning an open alert acknowledges it');
  await withShot('alert-assignee-visible', async () => {
    await env.until(async () => !(await env.text()).includes('Assign ALT-3'), 'dialog closes');
    assert.ok((await env.text()).includes(nameOf('fm')), 'detail page shows who the alert is assigned to');
  });
  // The assignment should also leave a trace on the asset timeline, like the other transitions do.
  const act = await env.models.Activity.findOne({ assetId: fx.assets[0].id, description: /ALT-3/ }).lean();
  assert.ok(act, 'assigning (and thereby acknowledging) ALT-3 writes an asset activity row like the other transitions');
});

test('alerts: bulk acknowledge from /alerts updates rows, KPIs, DB and writes asset activity', async () => {
  await env.go('/alerts');
  await waitText('Gov alert 05');
  const openBefore = Number(await kpi('Open'));
  for (const t of ['ALT-5', 'ALT-6']) {
    assert.equal(await env.page.click(`input[aria-label="Select ${t}"]`), true, `select ${t}`);
  }
  await clickLabel('Acknowledge (2)');
  await env.until(async () => Number(await kpi('Open')) === openBefore - 2, 'Open KPI drops by two');
  await env.until(async () => (await env.models.Alert.countDocuments({ _id: { $in: ['ALT-5', 'ALT-6'] }, status: 'Acknowledged' })) === 2, 'both acknowledged in DB');
  const docs = await env.models.Alert.find({ _id: { $in: ['ALT-5', 'ALT-6'] } }).lean();
  for (const d of docs) assert.equal(d.acknowledgedBy, nameOf('admin'));
  // Single acknowledgements write an asset Activity row; bulk ones should too (Asset 360 timeline).
  const acts = await env.models.Activity.find({ assetId: fx.assets[0].id, description: /ALT-(5|6) Open → Acknowledged/ }).lean();
  assert.equal(acts.length, 2, 'bulk acknowledgement records one asset activity row per alert, like single acknowledgement does');
});

test('alerts (API): POST /alerts/bulk/acknowledge acknowledges the given alerts', async () => {
  const r = await env.request('admin', '/alerts/bulk/acknowledge', 'POST', { ids: [fx.alerts[8].id] });
  assert.equal(r.status, 200, `bulk acknowledge → ${r.status} ${JSON.stringify(r.body)}`);
  assert.equal(r.body?.data?.acknowledged, 1);
});

test('alerts: Asset 360 shows the asset\'s alerts (raised + transitions) after client-side navigation', async () => {
  await env.go(`/assets/${fx.assets[0].id}?tab=timeline`);
  await waitText('Gov asset 1');
  await withShot('asset360-alerts', async () => {
    // ALT-1 was acknowledged through the UI → its transition must be on the timeline without reload.
    await env.expectText('ALT-1', 6000);
    // Raising an alert is itself an event on the asset.
    const raised = await env.models.Activity.findOne({ assetId: fx.assets[0].id, type: 'Alert', description: /ALT-12/ }).lean();
    assert.ok(raised, 'raising ALT-12 against the asset records an asset activity / is visible on Asset 360');
  });
});

test('alerts: home dashboard alert figures follow acknowledgements made in /alerts (client-side nav)', async () => {
  // Read what the dashboard says now, acknowledge one more through the UI, and come back.
  await env.go('/');
  const before = await withShot('dashboard-alerts-before', () =>
    env.until(async () => { const f = await dashboardAlertFigures(); return f.open !== null ? f : null; }, 'dashboard "Open alerts" tile renders'));
  await env.go('/alerts');
  await waitText('Gov alert 12');
  await clickInRow('Gov alert 12', 'Ack', { rowSel: 'tr' });
  await env.until(async () => (await env.models.Alert.findById('ALT-12').lean())?.status === 'Acknowledged', 'ALT-12 (Critical) acknowledged');
  await sleep(500);
  await env.go('/');
  await env.until(async () => (await dashboardAlertFigures()).open !== null, 'dashboard tile renders again');
  await sleep(1500);
  const afterFig = await dashboardAlertFigures();
  // Server definition of "open": Open + Escalated (backend/src/models/Alert.ts OPEN_ALERT_STATUSES).
  const dbOpen = await env.models.Alert.countDocuments({ status: { $in: ['Open', 'Escalated'] } });
  const dbCritical = await env.models.Alert.countDocuments({ severity: 'Critical', status: { $in: ['Open', 'Escalated'] } });
  await withShot('dashboard-alerts', async () => {
    assert.ok(before.open !== null, `dashboard shows an "Open alerts" tile (${JSON.stringify(before)})`);
    assert.equal(afterFig.open, dbOpen, `dashboard "Open alerts" tile (${afterFig.open}, was ${before.open}) equals open alerts in DB (${dbOpen}) after acknowledging in /alerts`);
    assert.equal(afterFig.critical, dbCritical, `triage strip critical-alert chip (${afterFig.critical}, was ${before.critical}) equals DB (${dbCritical})`);
  });
});

test('alerts (scope): a FAC-A facility manager\'s open-alert count excludes FAC-B alerts', async () => {
  const stats = await env.ok('fm', '/alerts/stats');
  const list = await env.ok('fm', '/alerts?status=Open,Escalated,Acknowledged&limit=100');
  // "open" on the server means Open + Escalated (OPEN_ALERT_STATUSES).
  const visibleOpen = list.filter((a) => a.status === 'Open' || a.status === 'Escalated').length;
  assert.ok(!list.some((a) => a.id === fx.alertB.id), 'FAC-B alert hidden from the FAC-A list');
  assert.equal(stats.open, visibleOpen, `badge count (${stats.open}) must match the alerts the user can see (${visibleOpen})`);
});

test('alerts (scope): a FAC-B manager cannot acknowledge a FAC-A alert', async () => {
  const r = await env.request('fmB', `/alerts/${fx.alerts[7].id}/acknowledge`, 'POST', {});
  assert.ok([403, 404].includes(r.status), `expected 403/404, got ${r.status}`);
  const doc = await env.models.Alert.findById(fx.alerts[7].id).lean();
  assert.equal(doc.status, 'Open', 'alert untouched');
});

test('alerts: "Resolved today" counts alerts resolved today, and the owner shows in the list', async () => {
  // An alert resolved long ago must not count as today's.
  await env.models.Alert.updateOne({ _id: 'ALT-11' }, { $set: { status: 'Resolved', resolvedBy: 'Old hand', resolvedAt: new Date(Date.now() - 3 * 86_400_000) } });
  await env.reload('/alerts');
  await waitText('Gov alert 11');
  const startOfToday = new Date(); startOfToday.setHours(0, 0, 0, 0);
  const dbToday = await env.models.Alert.countDocuments({ status: 'Resolved', resolvedAt: { $gte: startOfToday } });
  assert.equal(Number(await kpi('Resolved today')), dbToday, `"Resolved today" equals alerts resolved since midnight (${dbToday})`);
  assert.ok(await env.page.eval(`return [...document.querySelectorAll('tr')].some((r) => r.innerText.includes('Gov alert 03') && r.innerText.includes(${JSON.stringify(`Owner: ${nameOf('fm')}`)}))`), 'owner shown on the ALT-3 row');
});

test('alerts (scope): a FAC-B manager cannot raise an alert against a FAC-A asset', async () => {
  const r = await env.request('fmB', '/alerts', 'POST', { title: 'Gov cross-site alert', severity: 'Info', type: 'Test', source: 'Manual', assetId: fx.assets[0].id });
  assert.ok([403, 404].includes(r.status), `expected 403/404, got ${r.status}`);
  assert.equal(await env.models.Alert.countDocuments({ title: 'Gov cross-site alert' }), 0);
});

test('alert rules: create on /alert-rules/new → list + KPIs; toggle; delete — each stored and reflected without reload', async () => {
  await env.go('/alert-rules');
  await waitText('Alert Rules');
  const totalBefore = Number(await kpi('Total rules'));
  await clickLabel('+ New Rule');
  await env.page.waitForSelector('#rule-name');
  await env.page.fill('#rule-name', 'Gov overheat rule');
  await env.page.fill('select[aria-label="Metric"]', 'telemetry.temperature');
  await env.page.fill('input[aria-label="Threshold value"]', '80');
  await clickLabel('Create rule');
  await env.until(async () => env.models.AlertRule.findOne({ name: 'Gov overheat rule' }).lean(), 'rule stored');
  const rule = await env.models.AlertRule.findOne({ name: 'Gov overheat rule' }).lean();
  assert.equal(rule.condition, 'telemetry.temperature > 80');
  assert.equal(rule.enabled, true);
  await env.until(async () => (await pathNow()) === '/alert-rules', 'back on /alert-rules');
  await waitText('Gov overheat rule');
  await env.until(async () => Number(await kpi('Total rules')) === totalBefore + 1, 'Total rules KPI increments');
  const enabledBefore = Number(await kpi('Enabled'));

  assert.equal(await env.page.click('button[aria-label="Toggle Gov overheat rule"]'), true);
  await env.until(async () => (await env.models.AlertRule.findById(rule._id).lean())?.enabled === false, 'disabled in DB');
  await env.until(async () => Number(await kpi('Enabled')) === enabledBefore - 1, 'Enabled KPI follows');
  await env.go('/alerts');
  await env.go('/alert-rules');
  await waitText('Gov overheat rule');
  assert.equal(await env.page.eval(`return document.querySelector('button[aria-label="Toggle Gov overheat rule"]').getAttribute('aria-checked')`), 'false', 'toggle state survives client-side navigation');

  await clickInRow('Gov overheat rule', 'Delete', { rowSel: 'tr' });
  await env.page.waitForSelector('[role="dialog"]');
  await clickLabel('Delete', { sel: '[role="dialog"] button' });
  await env.until(async () => !(await env.models.AlertRule.findById(rule._id).lean()), 'rule deleted');
  await env.until(async () => !(await env.page.eval(`return [...document.querySelectorAll('tbody tr')].some((r) => r.innerText.includes('Gov overheat rule'))`)), 'row gone');
  await env.until(async () => Number(await kpi('Total rules')) === totalBefore, 'Total rules KPI back');
  await env.until(async () => env.models.AuditLog.findOne({ action: 'alert_rule.delete', target: rule._id }).lean(), 'audit row for the delete', 5000);
});

// ═════════════════════════════════════════════════════════════════════════════
// NOTIFICATIONS
// ═════════════════════════════════════════════════════════════════════════════

/** Top-bar bell unread count, from its aria-label ("Notifications (3 unread)"). */
async function bellUnread() {
  return env.page.eval(`
    const a = document.querySelector('a[href="/notifications"][aria-label^="Notifications"]');
    if (!a) return null;
    const m = a.getAttribute('aria-label').match(/\\((\\d+) unread\\)/);
    return m ? Number(m[1]) : 0;`);
}

/** Drive a lifecycle stage change through Asset 360 → Lifecycle → Change Stage (no approval needed). */
async function changeStageViaUi(assetId, reason) {
  await env.go(`/assets/${assetId}?tab=lifecycle`);
  // ("Current stage" is CSS-uppercased, so innerText never contains it in that case.)
  await waitText('Change Stage');
  await clickLabel('Change Stage');
  await env.page.waitForSelector('[role="dialog"] select');
  // Pick a next stage that does not need approval.
  const picked = await env.page.eval(`
    const s = document.querySelector('[role="dialog"] select');
    s.id = s.id || 'sync-stage';
    const opts = [...s.options].map((o) => o.value).filter((v) => !['Maintenance', 'Retired', 'Disposed'].includes(v));
    return opts[0] || null;`);
  assert.ok(picked, 'an ungated next stage exists');
  await env.page.fill('[role="dialog"] select', picked);
  await env.page.fill('[role="dialog"] textarea', reason);
  await clickLabel('Change stage', { sel: '[role="dialog"] button' });
  await env.until(async () => (await env.models.Asset.findById(assetId).lean())?.lifecycleStage === picked, `asset ${assetId} moved to ${picked}`);
  return picked;
}

test('notifications: a lifecycle change made in the UI lands in the inbox and the top-bar unread count follows without reload', async () => {
  await env.reload('/');
  await sleep(800);
  const bellBefore = await bellUnread();
  const dbBefore = await env.models.Notification.countDocuments({ userId: 'U-SYNC-1', read: false });
  assert.equal(bellBefore, dbBefore, `bell (${bellBefore}) matches DB unread (${dbBefore}) after a full load`);

  const stage = await changeStageViaUi(fx.assets[1].id, 'Gov sync stage change');
  await env.until(async () => (await env.models.Notification.countDocuments({ userId: 'U-SYNC-1', read: false })) > dbBefore, 'notification stored for admin');
  const n = await env.models.Notification.findOne({ userId: 'U-SYNC-1' }).sort({ at: -1 }).lean();
  assert.match(n.title, new RegExp(`Gov asset 2 → ${stage}`));
  fx.title2 = n.title;
  assert.match(n.body, new RegExp(nameOf('admin')), 'notification body names the actor');
  const dbAfter = await env.models.Notification.countDocuments({ userId: 'U-SYNC-1', read: false });

  await withShot('bell-after-write', async () => {
    await env.until(async () => (await bellUnread()) === dbAfter,
      `top-bar unread badge follows the new notification (bell ${await bellUnread()}, DB ${dbAfter})`, 8000);
  });
});

test('notifications: /notifications shows the new item newest-first after client-side navigation', async () => {
  // A second, later notification so order can be checked.
  const stage = await changeStageViaUi(fx.assets[2].id, 'Gov sync second stage change');
  fx.title3 = `Gov asset 3 → ${stage}`;
  await env.go('/notifications');
  await waitText(fx.title3);
  await waitText(fx.title2);
  const [p3, p2] = await env.positions(fx.title3, fx.title2);
  assert.ok(p3 < p2, 'newest notification first');
  const unreadKpi = Number(await kpi('Unread'));
  const dbUnread = await env.models.Notification.countDocuments({ userId: 'U-SYNC-1', read: false });
  assert.equal(unreadKpi, dbUnread, 'Unread KPI equals DB');
});

test('notifications: marking one read updates the page, MongoDB and the top-bar badge', async () => {
  await env.reload('/notifications');
  await waitText(fx.title3);
  const bellBefore = await bellUnread();
  assert.ok(bellBefore > 0, 'bell shows unread after reload');
  const clicked = await env.page.eval(`
    const btns = [...document.querySelectorAll('button')].filter((b) => (b.innerText || '').includes(${JSON.stringify(fx.title3)}));
    btns.sort((a, b) => a.innerText.length - b.innerText.length);
    if (!btns[0]) return false;
    btns[0].click();
    return true;`);
  assert.ok(clicked, 'notification row button found');
  await env.until(async () => {
    const n = await env.models.Notification.findOne({ userId: 'U-SYNC-1', title: fx.title3 }).lean();
    return n?.read === true;
  }, 'notification marked read in DB');
  const dbUnread = await env.models.Notification.countDocuments({ userId: 'U-SYNC-1', read: false });
  await env.until(async () => Number(await kpi('Unread')) === dbUnread, 'Unread KPI follows');
  await withShot('bell-after-mark-read', async () => {
    await env.until(async () => (await bellUnread()) === dbUnread, `bell follows mark-read (bell ${await bellUnread()}, DB ${dbUnread})`, 8000);
  });
});

test('notifications: Mark all read → page, DB and top-bar badge all reach zero; survives reload', async () => {
  await env.go('/notifications');
  await waitText('Notifications');
  await clickLabel('Mark all read');
  await env.until(async () => (await env.models.Notification.countDocuments({ userId: 'U-SYNC-1', read: false })) === 0, 'all read in DB');
  await env.until(async () => Number(await kpi('Unread')) === 0, 'Unread KPI zero');
  await withShot('bell-after-read-all', async () => {
    await env.until(async () => (await bellUnread()) === 0, `bell clears after Mark all read (bell ${await bellUnread()})`, 8000);
  });
});

test('notifications: re-opening /notifications (client-side) after Mark all read does not resurrect unread items', async () => {
  await env.go('/');
  await env.go('/notifications');
  await waitText('Notifications');
  assert.equal(Number(await kpi('Unread')), 0, 'inbox remembers everything is read');
});

// ═════════════════════════════════════════════════════════════════════════════
// COMPLIANCE · AUDITS · CERTIFICATIONS · AUDIT LOG
// ═════════════════════════════════════════════════════════════════════════════

/** Pick an asset in the shared AssetPicker inside the open dialog. */
async function pickAsset(name) {
  await env.page.waitForSelector('[role="dialog"] input[placeholder*="assets by name"]');
  await env.page.fill('[role="dialog"] input[placeholder*="assets by name"]', name);
  await env.until(async () => env.page.eval(`return [...document.querySelectorAll('[role="dialog"] button')].some((b) => (b.innerText || '').includes(${JSON.stringify(name)}))`), `asset "${name}" offered by picker`);
  assert.equal(await env.page.clickText('[role="dialog"] button', name), true);
  await env.until(async () => env.page.eval(`return [...document.querySelectorAll('[role="dialog"] button')].some((b) => (b.innerText || '').trim() === 'Change')`), 'asset picked');
}

/** Fill a dialog field by its label text (Field wraps the control in a <label>). */
async function dialogField(labelText, value) {
  const ok = await env.page.eval(`
    const want = ${JSON.stringify(labelText)}.toLowerCase();
    const labels = [...document.querySelectorAll('[role="dialog"] label')];
    const l = labels.find((x) => (x.innerText || '').replace('*', '').trim().toLowerCase().startsWith(want));
    if (!l) return null;
    const el = l.querySelector('input, textarea, select') || (l.htmlFor && document.getElementById(l.htmlFor));
    if (!el) return null;
    el.id = el.id || ('sync-' + Math.random().toString(36).slice(2));
    return '#' + CSS.escape(el.id);`);
  assert.ok(ok, `dialog field "${labelText}"`);
  assert.equal(await env.page.fill(ok, value), true);
}

const submitDialog = (label) => clickLabel(label, { sel: '[role="dialog"] button' });

/** Does /audit-log (currently displayed) list this action+target? */
async function auditLogShows(action, target) {
  return env.page.eval(`
    return [...document.querySelectorAll('tr')].some((r) => (r.innerText || '').includes(${JSON.stringify(action)}) && (r.innerText || '').includes(${JSON.stringify(target)}));`);
}

test('compliance: raising a finding on /compliance-reports updates the list + KPIs, stores who raised it, and shows in /audit-log right away', async () => {
  // Warm the audit-log cache the way a user who just looked at it would.
  await env.go('/audit-log');
  await sleep(800);
  await env.go('/compliance-reports');
  await waitText('Raise finding');
  const openBefore = Number(await kpi('Open') ?? 0);
  await clickLabel('+ Raise finding');
  await pickAsset('Gov asset 1');
  await dialogField('Title', 'Gov finding missing placard');
  await dialogField('Description', 'Fire placard missing at the east door');
  await submitDialog('Raise finding');
  await env.until(async () => env.models.ComplianceRecord.findOne({ title: 'Gov finding missing placard' }).lean(), 'record stored');
  const rec = await env.models.ComplianceRecord.findOne({ title: 'Gov finding missing placard' }).lean();
  fx.cmr = rec._id;
  assert.equal(rec.assetId, fx.assets[0].id);
  assert.equal(rec.status, 'Open');
  assert.equal(rec.createdBy, emailOf('admin'));
  await waitText('Gov finding missing placard');
  await env.until(async () => Number(await kpi('Open')) === openBefore + 1, 'Open KPI increments');

  await env.go('/audit-log');
  await withShot('auditlog-after-compliance', async () => {
    await env.until(async () => auditLogShows('compliance_record.create', fx.cmr), `/audit-log shows compliance_record.create ${fx.cmr} after client-side nav`, 5000);
  });
});

test('compliance: closing a finding (Close → Resolved) updates status + KPIs and records resolver', async () => {
  await env.go('/compliance-reports');
  await waitText('Gov finding missing placard');
  const resolvedBefore = Number(await kpi('Resolved') ?? 0);
  await clickInRow('Gov finding missing placard', 'Close →', { rowSel: 'tr' });
  await env.page.waitForSelector('[role="dialog"]');
  await submitDialog('Resolved');
  await env.until(async () => (await env.models.ComplianceRecord.findById(fx.cmr).lean())?.status === 'Resolved', 'resolved in DB');
  const rec = await env.models.ComplianceRecord.findById(fx.cmr).lean();
  assert.equal(rec.resolvedBy, emailOf('admin'));
  assert.ok(rec.resolvedAt);
  await env.until(async () => Number(await kpi('Resolved')) === resolvedBefore + 1, 'Resolved KPI increments');
});

test('compliance (scope): a scope-only finding at FAC-B is not visible to a FAC-A facility manager', async () => {
  const created = await env.ok('admin', '/compliance-records', 'POST', {
    title: 'Gov Pune scope finding', description: 'Org-level finding for Pune only', category: 'Safety', severity: 'High', scopeId: SCOPE.facB._id,
  }, 201);
  const list = await env.ok('fm', '/compliance-records?limit=100');
  assert.ok(!list.some((r) => r.id === created.id || r._id === created.id), 'FAC-B scope finding must not leak to FAC-A');
  const get = await env.request('fm', `/compliance-records/${created.id}`);
  assert.equal(get.status, 404, 'nor be readable by id');
  const resolve = await env.request('fm', `/compliance-records/${created.id}/resolve`, 'POST', { status: 'Resolved' });
  assert.equal(resolve.status, 404, 'nor be closable from FAC-A');
  // The Pune manager still sees and can work it.
  const own = await env.ok('fmB', '/compliance-records?limit=100');
  assert.ok(own.some((r) => r.id === created.id), 'visible to the FAC-B manager');
});

test('audits: open audit → In Progress → raise finding → evidence → close finding → Completed; counters, lists and audit log follow', { timeout: 120000 }, async () => {
  await env.go('/audit');
  await waitText('Open audit');
  await clickLabel('+ Open audit');
  await env.page.waitForSelector('[role="dialog"]');
  await dialogField('Audit name', 'Gov Q4 safety audit');
  await dialogField('Facility', SCOPE.facA._id);
  await dialogField('Due date', '2026-12-31');
  await submitDialog('Open audit');
  await env.until(async () => env.models.Audit.findOne({ name: 'Gov Q4 safety audit' }).lean(), 'audit stored');
  const audit = await env.models.Audit.findOne({ name: 'Gov Q4 safety audit' }).lean();
  fx.audit = audit._id;
  assert.equal(audit.createdBy, emailOf('admin'));
  await env.until(async () => (await pathNow()) === `/audit/${fx.audit}`, 'navigated to the new audit');
  await waitText('Gov Q4 safety audit');

  await clickLabel('In Progress →');
  await env.until(async () => (await env.models.Audit.findById(fx.audit).lean())?.status === 'In Progress', 'In Progress in DB');

  await clickLabel('+ Raise finding');
  await env.page.waitForSelector('[role="dialog"]');
  await dialogField('Title', 'Gov extinguisher overdue');
  await dialogField('Description', 'Extinguisher inspection tag expired');
  await submitDialog('Raise finding');
  await env.until(async () => env.models.AuditFinding.findOne({ title: 'Gov extinguisher overdue' }).lean(), 'finding stored');
  await waitText('Gov extinguisher overdue');
  await env.until(async () => (await env.text()).includes('1 open / 1 total'), 'Findings counter 1 open / 1 total on detail');

  await clickInRow('Gov extinguisher overdue', '+ Evidence', { rowSel: 'tr' });
  await env.page.waitForSelector('[role="dialog"]');
  await dialogField('Label', 'Gov tag photo');
  await submitDialog('Attach');
  await env.until(async () => ((await env.models.AuditFinding.findOne({ title: 'Gov extinguisher overdue' }).lean())?.evidence ?? []).length === 1, 'evidence stored');
  const finding = await env.models.AuditFinding.findOne({ title: 'Gov extinguisher overdue' }).lean();
  assert.equal(finding.evidence[0].uploadedBy, emailOf('admin'));

  await clickInRow('Gov extinguisher overdue', 'Close →', { rowSel: 'tr' });
  await env.page.waitForSelector('[role="dialog"]');
  await submitDialog('Resolved');
  await env.until(async () => (await env.models.AuditFinding.findById(finding._id).lean())?.status === 'Resolved', 'finding resolved');
  await env.until(async () => (await env.text()).includes('0 open / 1 total'), 'detail counter 0 open / 1 total');

  await clickLabel('Completed →');
  await env.until(async () => (await env.models.Audit.findById(fx.audit).lean())?.status === 'Completed', 'Completed in DB');

  await env.go('/audit');
  await waitText('Gov Q4 safety audit');
  await env.until(async () => env.page.eval(`return [...document.querySelectorAll('tr')].some((r) => r.innerText.includes('Gov Q4 safety audit') && r.innerText.includes('0 open / 1 total') && r.innerText.includes('Completed'))`), 'list row shows Completed and 0 open / 1 total');

  // Audit log — every action, newest first.
  await env.go('/audit-log');
  await withShot('auditlog-audit-actions', async () => {
    await env.until(async () => auditLogShows('audit.transition', fx.audit), 'audit.transition visible', 5000);
    await env.until(async () => auditLogShows('audit_finding.evidence', finding._id), 'audit_finding.evidence visible', 3000);
    const [pTransition, pCreate] = await env.positions('audit.transition', 'audit.create');
    assert.ok(pTransition >= 0 && pCreate >= 0 && pTransition < pCreate, 'latest audit action listed above the earlier audit.create');
  });
});

test('audits: raising an audit finding notifies through an "audit.finding_raised" rule addressed to the requester', async () => {
  const rule = await env.ok('admin', '/notification-rules', 'POST', {
    name: 'Gov requester audit finding', event: 'audit.finding_raised', conditions: [], channels: ['in_app'],
    recipients: [{ kind: 'requester' }], throttleMinutes: 0, quietHours: { enabled: false, start: '22:00', end: '07:00' },
    escalation: { enabled: false, afterMinutes: 60 }, status: 'active',
  });
  fx.requesterRule = rule.id;
  const audit = await env.ok('fm', '/audits', 'POST', { name: 'Gov FM audit', type: 'Internal', scopeId: SCOPE.facA._id, leadAuditor: emailOf('fm'), startDate: '2026-10-01', dueDate: '2026-11-01' }, 201);
  await env.ok('fm', `/audits/${audit.id ?? audit._id}/findings`, 'POST', { title: 'Gov FM finding', description: 'Raised by the facility manager', severity: 'High' }, 201);
  await env.until(async () => env.models.NotificationRuleLog.findOne({ ruleId: rule.id }).lean(), 'rule evaluated');
  const log = await env.models.NotificationRuleLog.findOne({ ruleId: rule.id }).lean();
  assert.equal(log.outcome, 'sent', `requester rule outcome "${log.outcome}" (${log.detail ?? ''}) — the requester is the user who raised it`);
  const n = await env.models.Notification.findOne({ userId: 'U-SYNC-3', title: /Gov FM finding/ }).lean();
  assert.ok(n, 'facility manager (requester) receives the notification');
});

test('certifications: record → list; edit → list; certificate shows on Asset 360; audit log rows', async () => {
  await env.go('/certifications');
  await waitText('Record Certificate');
  await clickLabel('+ Record Certificate');
  await pickAsset('Gov asset 1');
  await dialogField('Certificate', 'Gov electrical safety');
  await dialogField('Issuing authority', 'TUV Sud');
  await submitDialog('Record');
  await env.until(async () => env.models.Certification.findOne({ name: 'Gov electrical safety' }).lean(), 'certificate stored');
  const cert = await env.models.Certification.findOne({ name: 'Gov electrical safety' }).lean();
  fx.cert = cert._id;
  assert.equal(cert.assetId, fx.assets[0].id);
  assert.equal(cert.status, 'Valid');
  await waitText('Gov electrical safety');

  await clickInRow('Gov electrical safety', 'Edit', { rowSel: 'tr' });
  await env.page.waitForSelector('[role="dialog"]');
  await dialogField('Certificate', 'Gov electrical safety v2');
  await submitDialog('Save');
  await env.until(async () => (await env.models.Certification.findById(fx.cert).lean())?.name === 'Gov electrical safety v2', 'rename stored');
  await waitText('Gov electrical safety v2');

  const audit = await env.until(async () => env.models.AuditLog.findOne({ target: fx.cert, action: /certification\./ }).lean(), 'certification audit row');
  assert.ok(audit);

  await env.go(`/assets/${fx.assets[0].id}?tab=warranty`);
  await waitText('Gov asset 1');
  await withShot('asset360-cert', async () => {
    await env.expectText('Gov electrical safety v2', 5000);
  });
});

test('certifications: a certificate recorded already expired raises a compliance finding when the expiry sweep runs', async () => {
  const yesterday = new Date(Date.now() - 86_400_000).toISOString();
  const lastYear = new Date(Date.now() - 400 * 86_400_000).toISOString();
  const cert = await env.ok('admin', '/certifications', 'POST', { assetId: fx.assets[1].id, name: 'Gov lapsed pressure cert', authority: 'BIS', issuedAt: lastYear, expiresAt: yesterday }, 201);
  const { sweepCertificationExpiry } = await import('../../../backend/src/services/complianceSweep.service.ts');
  await sweepCertificationExpiry();
  const rec = await env.models.ComplianceRecord.findOne({ relatedCertificationId: cert.id ?? cert._id }).lean()
    ?? await env.models.ComplianceRecord.findOne({ title: /Gov lapsed pressure cert/ }).lean();
  assert.ok(rec, 'an expired certificate produces a compliance finding (even if it was stored as Expired at creation)');
});

// ── shared readers ───────────────────────────────────────────────────────────

/** The sidebar badge next to the Alerts nav entry, as a number (null if absent). */
async function sidebarAlertBadge() {
  return env.page.eval(`
    const links = [...document.querySelectorAll('nav a, aside a')].filter((a) => /alert/i.test(a.getAttribute('href') || '') && !/rules|tracking/.test(a.getAttribute('href') || ''));
    for (const a of links) {
      const m = (a.innerText || '').match(/(\\d+)\\s*$/m);
      if (m) return Number(m[1]);
    }
    return null;`);
}

/** Pull the "Open alerts" KPI tile and the triage-strip critical chip from the home dashboard. */
async function dashboardAlertFigures() {
  return env.page.eval(`
    const tileValue = (label) => {
      const span = [...document.querySelectorAll('span')].find((s) => (s.textContent || '').trim().toLowerCase() === label);
      const card = span && span.closest('.glass-panel');
      if (!card) return null;
      const v = (card.children[1] && card.children[1].innerText || '').replace(/[^0-9]/g, '');
      return v === '' ? null : Number(v);
    };
    const text = document.body.innerText;
    const crit = text.match(/(\\d+) critical alerts?/i);
    return { open: tileValue('open alerts'), critical: crit ? Number(crit[1]) : (text.includes('Nothing needs you right now') ? 0 : null) };`);
}
