// Live sync suite — governance, part 2: administration · analytics & reports · settings.
//
// Same contract as governance.test.mjs: drive the write through the real UI,
// then assert every screen that should reflect it does so after CLIENT-SIDE
// navigation (env.go — caches survive), that counts and ordering follow, and
// that MongoDB holds what the UI claims. Assertions describe the CORRECT
// behaviour; a failure is a sync bug.
//
// Run:
//   node --experimental-websocket --import tsx --test Testing/harness/sync/governance-admin.test.mjs
import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';
import { startEnv, assetBody, nameOf, emailOf, SCOPE, PASSWORD } from './env.mjs';

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let env;

before(async () => { env = await startEnv({ estate: 'fresh', browser: true }); }, { timeout: 240000 });
after(async () => { await env?.stop(); });

// ── helpers (local to this file) ────────────────────────────────────────────

const norm = `(s) => (s || '').replace(/\\s+/g, ' ').trim()`;

/** Click the first visible element matching `sel` whose trimmed text equals `label`. */
async function clickLabel(label, { sel = 'button, a', exact = true, last = false } = {}) {
  const ok = await env.page.eval(`
    const norm = ${norm};
    const want = ${JSON.stringify(label)};
    const els = [...document.querySelectorAll(${JSON.stringify(sel)})].filter((e) => e.getClientRects().length);
    const match = els.filter((e) => ${exact} ? norm(e.innerText || e.value) === want : norm(e.innerText || e.value).includes(want));
    const el = ${last} ? match[match.length - 1] : match[0];
    if (!el) return false;
    if (el.disabled) return 'disabled';
    el.scrollIntoView({ block: 'center' });
    el.click();
    return true;`);
  assert.equal(ok, true, `clickable "${label}" (${sel}) — got ${ok}`);
}

/** Click a button inside the smallest row (tr by default) containing `rowText`. */
async function clickInRow(rowText, label, { rowSel = 'tr' } = {}) {
  const ok = await env.page.eval(`
    const norm = ${norm};
    const rows = [...document.querySelectorAll(${JSON.stringify(rowSel)})].filter((r) => (r.innerText || '').includes(${JSON.stringify(rowText)}));
    rows.sort((a, b) => (a.innerText || '').length - (b.innerText || '').length);
    for (const row of rows) {
      const btn = [...row.querySelectorAll('button, a')].find((b) => norm(b.innerText || b.getAttribute('aria-label')) === ${JSON.stringify(label)});
      if (btn) { if (btn.disabled) return 'disabled'; btn.scrollIntoView({ block: 'center' }); btn.click(); return true; }
    }
    return false;`);
  assert.equal(ok, true, `button "${label}" in row containing "${rowText}" — got ${ok}`);
}

/** The value of a KpiCard / MetricCard / dashboard tile by its label. */
async function kpi(label) {
  return env.page.eval(`
    const want = ${JSON.stringify(label)}.toLowerCase();
    for (const c of document.querySelectorAll('div, a')) {
      const kids = [...c.children];
      if (kids.length >= 2 && (kids[0].innerText || '').trim().toLowerCase() === want) return (kids[1].innerText || '').trim();
    }
    // Dashboard KpiTile: the label span sits inside the first child.
    const span = [...document.querySelectorAll('span')].find((s) => (s.textContent || '').trim().toLowerCase() === want);
    const card = span && span.closest('.glass-panel');
    if (card && card.children[1]) return (card.children[1].innerText || '').trim();
    return null;`);
}
const num = (v) => (v === null || v === undefined ? null : Number(String(v).replace(/[^0-9.-]/g, '')));

/** Fill a dialog field by its <label> caption (Field wraps the control in a label). */
async function dialogField(labelText, value) {
  const sel = await env.page.eval(`
    const want = ${JSON.stringify(labelText)}.toLowerCase();
    const labels = [...document.querySelectorAll('[role="dialog"] label')];
    const l = labels.find((x) => (x.innerText || '').replace('*', '').trim().toLowerCase().startsWith(want));
    if (!l) return null;
    const el = l.querySelector('input, textarea, select') || (l.htmlFor && document.getElementById(l.htmlFor));
    if (!el) return null;
    el.id = el.id || ('sync-' + Math.random().toString(36).slice(2));
    return '#' + CSS.escape(el.id);`);
  assert.ok(sel, `dialog field "${labelText}"`);
  assert.equal(await env.page.fill(sel, value), true);
}
const submitDialog = (label) => clickLabel(label, { sel: '[role="dialog"] button' });

/** The option labels of a <select>. */
async function selectOptions(sel) {
  return env.page.eval(`const s = document.querySelector(${JSON.stringify(sel)}); return s ? [...s.options].map((o) => o.textContent.trim()) : null;`);
}

/** Top-bar bell unread count, from its aria-label. */
async function bellUnread() {
  return env.page.eval(`
    const a = document.querySelector('a[href="/notifications"][aria-label^="Notifications"]');
    if (!a) return null;
    const m = a.getAttribute('aria-label').match(/\\((\\d+) unread\\)/);
    return m ? Number(m[1]) : 0;`);
}

/** Text of the table rows only — toasts repeat record names and must not count. */
const rowsText = () => env.page.eval(`return [...document.querySelectorAll('tbody tr')].map((r) => r.innerText).join('\\n')`);

async function shot(name) { try { await env.page.shot(`sync-gov-admin-${name}`); } catch { /* best effort */ } }
async function withShot(name, fn) { try { return await fn(); } catch (err) { await shot(name); throw err; } }
const pathNow = () => env.page.eval('return location.pathname');
const waitText = (t, timeout = 12000) => env.expectText(t, timeout);

/** Drive the add-asset wizard (blank) to Register; returns the new asset id from the URL. */
async function registerAssetViaUi(name) {
  await env.go('/assets/new?source=blank');
  await env.page.waitForSelector('#f-name', 20000);
  await env.page.fill('#f-name', name);
  await env.page.fill('#f-category', 'Compute');
  for (let i = 0; i < 12; i++) {
    if (await env.page.eval(`return [...document.querySelectorAll('button')].some((b) => b.innerText.includes('Register asset'))`)) break;
    await env.page.clickText('button', 'Next →');
    await sleep(250);
  }
  await env.until(() => env.page.eval(`return document.body.innerText.includes('Ready to register')`), 'wizard says Ready to register', 10000);
  await clickLabel('Register asset', { exact: false });
  const landed = await env.until(async () => {
    const p = await pathNow();
    return /^\/assets\/[^/]+$/.test(p) && p !== '/assets/new' ? p : null;
  }, 'wizard lands on the new Asset 360', 20000);
  return decodeURIComponent(landed.split('/').pop());
}

/** Raise a work order through /maintenance/new; returns its id. */
async function raiseWorkOrderViaUi(assetName, title) {
  await env.go('/maintenance/new');
  await env.page.waitForSelector('#wo-title', 20000);
  await env.page.fill('input[placeholder*="assets by name"]', assetName);
  await env.until(() => env.page.eval(`
    const btn = [...document.querySelectorAll('button')].find((b) => b.getClientRects().length > 0 && (b.innerText || '').includes(${JSON.stringify(assetName)}));
    if (!btn) return false;
    btn.click();
    return true;`), `pick asset ${assetName}`);
  await env.page.fill('#wo-title', title);
  const due = new Date(Date.now() + 7 * 86_400_000).toISOString().slice(0, 10);
  await env.page.fill('#wo-due', due);
  await clickLabel('Create work order');
  const landed = await env.until(async () => {
    const p = await pathNow();
    return /^\/maintenance\/[^/]+$/.test(p) && p !== '/maintenance/new' ? p : null;
  }, 'navigates to the new work order', 20000);
  return decodeURIComponent(landed.split('/').pop());
}

const fx = {};

test('setup: assets through the API, admin signs in', { timeout: 120000 }, async () => {
  fx.assets = [];
  for (let i = 1; i <= 3; i++) fx.assets.push(await env.ok('admin', '/assets', 'POST', assetBody(`Adm asset ${i}`)));
  fx.alert = await env.ok('admin', '/alerts', 'POST', { title: 'Adm alert for owner picker', severity: 'Warning', type: 'Temperature', source: 'Manual', assetId: fx.assets[0].id }, 201);
  await env.login('admin');
});

// ═════════════════════════════════════════════════════════════════════════════
// USERS
// ═════════════════════════════════════════════════════════════════════════════

const INVITEE = { name: 'Isha Invitee', email: 'isha.invitee@sync.test', title: 'Field Technician' };

test('users: invite through /admin/users → listed, stored, and offered in the alert-owner and work-order assignee pickers without reload', { timeout: 90000 }, async () => {
  // Warm the pickers' caches first, the way somebody who had them open would.
  await env.go('/maintenance/new');
  await env.page.waitForSelector('#wo-assignee', 20000);
  await env.go(`/alerts/${fx.alert.id}`);
  await waitText('Adm alert for owner picker');

  await env.go('/admin/users');
  await waitText('Invite User', 15000);
  const totalBefore = num(await kpi('Total Users'));
  await clickLabel('+ Invite User');
  await env.page.waitForSelector('#invite-name');
  await env.page.fill('#invite-name', INVITEE.name);
  await env.page.fill('#invite-email', INVITEE.email);
  await env.page.fill('#invite-title', INVITEE.title);
  await env.page.fill('#invite-scope', SCOPE.facA._id);
  await submitDialog('Create account');
  await env.until(async () => env.models.User.findOne({ email: INVITEE.email }).lean(), 'user stored');
  const doc = await env.models.User.findOne({ email: INVITEE.email }).lean();
  fx.inviteeId = doc._id;
  assert.equal(doc.name, INVITEE.name);
  assert.equal(doc.roleId, 'technician');
  assert.equal(doc.homeScopeId, SCOPE.facA._id);
  assert.equal(doc.status, 'active');
  const withHash = await env.models.User.findById(doc._id).select('+passwordHash').lean();
  assert.ok(withHash.passwordHash && !withHash.passwordHash.includes(INVITEE.email), 'password stored hashed');

  await withShot('invite-list', async () => {
    await waitText(INVITEE.name);
    await env.until(async () => num(await kpi('Total Users')) === totalBefore + 1, 'Total Users KPI increments');
  });
  await env.until(async () => env.models.AuditLog.findOne({ target: fx.inviteeId }).lean(), 'audit row for the invite', 5000);

  // Pickers elsewhere — client-side navigation only.
  await env.go(`/alerts/${fx.alert.id}`);
  await waitText('Adm alert for owner picker');
  await clickLabel('Assign');
  await env.page.waitForSelector('[role="dialog"] select');
  await withShot('invite-alert-owner', async () => {
    const owners = await selectOptions('[role="dialog"] select');
    assert.ok(owners.includes(INVITEE.name), `alert owner picker offers the new user (${owners.join(', ')})`);
  });
  await clickLabel('Cancel', { sel: '[role="dialog"] button' });

  await env.go('/maintenance/new');
  await env.page.waitForSelector('#wo-assignee', 20000);
  await withShot('invite-wo-assignee', async () => {
    await env.until(async () => (await selectOptions('#wo-assignee'))?.some((o) => o.includes(INVITEE.name)), 'work-order assignee picker offers the new user', 8000);
  });
});

test('users: changing the role in Edit is stored and reflected in the list', async () => {
  await env.go('/admin/users');
  await waitText(INVITEE.name);
  await clickInRow(INVITEE.email, 'Edit');
  await env.page.waitForSelector('[role="dialog"]');
  await dialogField('Role', 'maintenance_manager');
  await submitDialog('Save');
  await env.until(async () => (await env.models.User.findById(fx.inviteeId).lean())?.roleId === 'maintenance_manager', 'role stored');
  await env.until(async () => env.page.eval(`return [...document.querySelectorAll('tr')].some((r) => r.innerText.includes(${JSON.stringify(INVITEE.email)}) && /Maintenance Manager/i.test(r.innerText))`), 'row shows the new role');
});

test('users: suspending keeps the account visible (filterable as Suspended), removes it from pickers and blocks sign-in', { timeout: 60000 }, async () => {
  await env.go('/admin/users');
  await waitText(INVITEE.name);
  await clickInRow(INVITEE.email, 'Edit');
  await env.page.waitForSelector('[role="dialog"]');
  await dialogField('Status', 'suspended');
  await submitDialog('Save');
  await env.until(async () => (await env.models.User.findById(fx.inviteeId).lean())?.status === 'suspended', 'suspension stored');

  await withShot('suspended-visible', async () => {
    // Still on Users & Roles — otherwise there is nowhere to reactivate them from.
    await env.until(async () => (await env.text()).includes(INVITEE.name), 'suspended user still listed', 8000);
    await env.page.fill('select[aria-label="Status"]', 'suspended');
    await env.until(async () => (await env.text()).includes(INVITEE.name), 'Suspended filter shows them', 5000);
  });
  await env.page.fill('select[aria-label="Status"]', 'all');

  // The detail page must still resolve (it offers Reactivate).
  await env.go(`/admin/users/${fx.inviteeId}`);
  await withShot('suspended-detail', async () => { await waitText(INVITEE.name, 8000); });

  // Out of the pickers.
  await env.go('/maintenance/new');
  await env.page.waitForSelector('#wo-assignee', 20000);
  await env.until(async () => !((await selectOptions('#wo-assignee')) ?? []).some((o) => o.includes(INVITEE.name)), 'suspended user no longer offered as assignee', 8000);

  const login = await env.request(null, '/auth/login', 'POST', { email: INVITEE.email, password: 'whatever-Password-1' });
  assert.ok([401, 403].includes(login.status), `suspended account cannot sign in (${login.status})`);
});

// ═════════════════════════════════════════════════════════════════════════════
// ORGANISATION STRUCTURE
// ═════════════════════════════════════════════════════════════════════════════

test('org: a facility added from /admin/org appears in /admin/org, the top-bar scope switcher and the asset location picker without reload', { timeout: 90000 }, async () => {
  // Open the asset edit form first so its location list is cached.
  await env.go(`/assets/${fx.assets[0].id}/edit`);
  await env.page.waitForSelector('#f-locname', 20000);
  await env.until(async () => ((await selectOptions('#f-locname')) ?? []).includes(SCOPE.facB.name), 'location picker loaded');

  await env.go('/admin/org');
  await waitText('Scope Hierarchy');
  const facilitiesBefore = num(await kpi('Facilities'));

  await clickLabel('+ Add Facility');
  await env.page.waitForSelector('#scope-name');
  await env.page.fill('#scope-name', 'Gov Chennai Depot');
  await clickLabel('Add facility');
  await env.until(async () => env.models.ScopeNodeModel.findOne({ name: 'Gov Chennai Depot' }).lean(), 'facility stored');
  const node = await env.models.ScopeNodeModel.findOne({ name: 'Gov Chennai Depot' }).lean();
  fx.facility = node._id;
  assert.equal(node.level, 'facility');
  assert.equal(node.parentId, SCOPE.org._id);
  await waitText('Gov Chennai Depot');

  await env.go('/admin/org');
  await waitText('Gov Chennai Depot');
  await env.until(async () => num(await kpi('Facilities')) === facilitiesBefore + 1, 'Facilities KPI increments');

  // Top-bar scope switcher.
  await env.page.click('button[aria-haspopup="listbox"]');
  await withShot('org-switcher', async () => {
    await env.until(async () => env.page.eval(`return [...document.querySelectorAll('[role="listbox"] [role="option"]')].some((o) => o.innerText.includes('Gov Chennai Depot'))`), 'scope switcher lists the new facility', 6000);
  });
  await env.page.click('button[aria-haspopup="listbox"]');

  // Asset location picker.
  await env.go(`/assets/${fx.assets[0].id}/edit`);
  await env.page.waitForSelector('#f-locname', 20000);
  await withShot('org-location-picker', async () => {
    await env.until(async () => ((await selectOptions('#f-locname')) ?? []).includes('Gov Chennai Depot'), 'asset location picker offers the new facility', 6000);
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// NOTIFICATION RULES
// ═════════════════════════════════════════════════════════════════════════════

test('notification rules: create → list; Test send → inbox + bell; pause; edit; delete', { timeout: 90000 }, async () => {
  await env.reload('/admin/notification-rules');
  await waitText('New rule', 15000);
  const bellBefore = await bellUnread();
  await clickLabel('+ New rule');
  await env.page.waitForSelector('[role="dialog"]');
  await dialogField('Rule name', 'Gov approval watch');
  await dialogField('Send to role', 'super_admin');
  await dialogField('Status', 'active');
  await submitDialog('Create');
  await env.until(async () => env.models.NotificationRule.findOne({ name: 'Gov approval watch' }).lean(), 'rule stored');
  const rule = await env.models.NotificationRule.findOne({ name: 'Gov approval watch' }).lean();
  fx.rule = rule._id;
  assert.equal(rule.status, 'active');
  assert.equal(rule.event, 'approval.requested');
  assert.ok(rule.createdBy, 'createdBy stored');
  await waitText('Gov approval watch');
  await waitText('Rules (1)');

  // Test send → the admin (a super_admin) receives it.
  await clickInRow('Gov approval watch', 'Test send');
  await env.until(async () => env.models.Notification.findOne({ userId: 'U-SYNC-1', title: '[Test] Gov approval watch' }).lean(), 'test notification stored for admin');
  const dbUnread = await env.models.Notification.countDocuments({ userId: 'U-SYNC-1', read: false });
  await withShot('nr-bell', async () => {
    await env.until(async () => (await bellUnread()) === dbUnread, `bell follows the test send (bell ${await bellUnread()}, was ${bellBefore}, DB ${dbUnread})`, 8000);
  });
  await env.go('/notifications');
  await waitText('[Test] Gov approval watch');
  await env.go('/admin/notification-rules');
  await waitText('Gov approval watch');

  // Pause.
  await clickInRow('Gov approval watch', 'Pause');
  await env.until(async () => (await env.models.NotificationRule.findById(fx.rule).lean())?.status === 'inactive', 'paused in DB');
  await env.until(async () => env.page.eval(`return [...document.querySelectorAll('tr')].some((r) => r.innerText.includes('Gov approval watch') && /inactive/i.test(r.innerText))`), 'row shows inactive');

  // Edit name.
  await clickInRow('Gov approval watch', 'Edit');
  await env.page.waitForSelector('[role="dialog"]');
  await dialogField('Rule name', 'Gov approval watch v2');
  await submitDialog('Save');
  await env.until(async () => (await env.models.NotificationRule.findById(fx.rule).lean())?.name === 'Gov approval watch v2', 'rename stored');
  await waitText('Gov approval watch v2');

  // Delete.
  await clickInRow('Gov approval watch v2', 'Delete');
  await env.page.waitForSelector('[role="dialog"]');
  await clickLabel('Delete', { sel: '[role="dialog"] button' });
  await env.until(async () => !(await env.models.NotificationRule.findById(fx.rule).lean()), 'rule deleted');
  await env.until(async () => !(await rowsText()).includes('Gov approval watch v2'), 'row gone');
  await waitText('Rules (0)');
});

// ═════════════════════════════════════════════════════════════════════════════
// REPORTS
// ═════════════════════════════════════════════════════════════════════════════

test('reports: save in builder → runs on /reports/:id → top of /reports; rename; schedule; delete removes report and its schedule', { timeout: 120000 }, async () => {
  await env.go('/reports');
  await waitText('New report', 15000);
  await env.go('/reports/builder');
  await env.page.waitForSelector('#report-name', 20000);
  await env.page.fill('#report-name', 'Gov asset census');
  await clickLabel('Save report');
  await env.until(async () => env.models.Report.findOne({ name: 'Gov asset census' }).lean(), 'report stored');
  const report = await env.models.Report.findOne({ name: 'Gov asset census' }).lean();
  fx.report = report._id;
  assert.ok(report.createdBy, 'createdBy stored');
  await env.until(async () => (await pathNow()) === `/reports/${fx.report}`, 'lands on the report');
  await waitText('Gov asset census');

  await env.go('/reports');
  await withShot('reports-list', async () => {
    await waitText('Gov asset census', 8000);
  });

  // Rename through the builder.
  await env.go(`/reports/builder?report=${fx.report}`);
  await env.page.waitForSelector('#report-name', 20000);
  await env.until(async () => (await env.page.eval(`return document.querySelector('#report-name').value`)) === 'Gov asset census', 'builder loads the saved name');
  await env.page.fill('#report-name', 'Gov asset census v2');
  await clickLabel('Save changes');
  await env.until(async () => (await env.models.Report.findById(fx.report).lean())?.name === 'Gov asset census v2', 'rename stored');
  await env.go('/reports');
  await withShot('reports-renamed', async () => {
    await waitText('Gov asset census v2', 8000);
    const rows = await rowsText();
    assert.ok(!rows.replace(/Gov asset census v2/g, '').includes('Gov asset census'), 'old name gone from the list');
  });

  // Schedule it from /reports/schedules.
  await env.go('/reports/schedules');
  await waitText('Scheduled Reports');
  const schedulesBefore = num(await kpi('Schedules'));
  await clickLabel('Schedule a report', { exact: false });
  await env.page.waitForSelector('#schedule-report');
  await env.page.fill('#schedule-report', fx.report);
  assert.equal(await env.page.fill('#schedule-recipients', 'ops@sync.test'), true);
  await clickLabel('Create schedule');
  await env.until(async () => env.models.ReportSchedule ? env.models.ReportSchedule.findOne({ reportId: fx.report }).lean() : env.models.ReportSubscription.findOne({ reportId: fx.report }).lean(), 'schedule stored');
  await env.until(async () => num(await kpi('Schedules')) === (schedulesBefore ?? 0) + 1, 'Schedules KPI increments');
  await waitText('Gov asset census v2');

  // Delete from the report page.
  await env.go(`/reports/${fx.report}`);
  await waitText('Gov asset census v2');
  await clickLabel('Delete');
  await env.page.waitForSelector('[role="dialog"]');
  await clickLabel('Delete', { sel: '[role="dialog"] button' });
  await env.until(async () => !(await env.models.Report.findById(fx.report).lean()), 'report deleted');
  await env.until(async () => (await pathNow()) === '/reports', 'back on /reports');
  await env.until(async () => !(await rowsText()).includes('Gov asset census v2'), 'gone from /reports');
  await env.go('/reports/schedules');
  await waitText('Scheduled Reports');
  await withShot('reports-schedule-gone', async () => {
    await env.until(async () => !(await rowsText()).includes('Gov asset census v2'), 'its schedule is gone from /reports/schedules', 6000);
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// ANALYTICS / DASHBOARD
// ═════════════════════════════════════════════════════════════════════════════

test('analytics: /analytics and the home dashboard reflect an asset and a work order created in the UI (client-side nav)', { timeout: 150000 }, async () => {
  await env.go('/analytics');
  await env.until(async () => num(await kpi('Total assets')) !== null, '/analytics Total assets renders', 20000);
  const totalBefore = num(await kpi('Total assets'));
  await env.go('/');
  await env.until(async () => num(await kpi('Open work orders')) !== null, 'dashboard Open work orders renders', 20000);
  const woBefore = num(await kpi('Open work orders'));
  const assetsTileBefore = num(await kpi('Assets in scope'));

  fx.uiAsset = await registerAssetViaUi('Adm analytics asset');
  fx.uiWo = await raiseWorkOrderViaUi('Adm asset 2', 'Adm analytics work order');

  const dbAssets = await env.models.Asset.countDocuments({});
  await env.go('/analytics');
  await withShot('analytics-total', async () => {
    await env.until(async () => num(await kpi('Total assets')) === totalBefore + 1,
      `/analytics Total assets follows (${await kpi('Total assets')}, was ${totalBefore}, DB ${dbAssets})`, 8000);
  });
  await env.go('/');
  await withShot('dashboard-after-create', async () => {
    await env.until(async () => num(await kpi('Open work orders')) === woBefore + 1, `dashboard Open work orders follows (${await kpi('Open work orders')}, was ${woBefore})`, 8000);
    await env.until(async () => num(await kpi('Assets in scope')) === assetsTileBefore + 1, `dashboard Assets in scope follows (${await kpi('Assets in scope')}, was ${assetsTileBefore})`, 8000);
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// NUMBERING
// ═════════════════════════════════════════════════════════════════════════════

test('numbering: an active asset rule issues the next ids in its pattern, and the registry still lists newest first', { timeout: 150000 }, async () => {
  await env.go('/admin/numbering');
  await waitText('New rule', 15000);
  await clickLabel('+ New rule');
  await env.page.waitForSelector('[role="dialog"]');
  await dialogField('Rule name', 'Gov asset tags');
  await dialogField('Prefix', 'GOV');
  await dialogField('Pattern', '{PREFIX}-{SEQ:4}');
  await dialogField('Status', 'active');
  await submitDialog('Create');
  await env.until(async () => env.models.NumberingRule.findOne({ name: 'Gov asset tags' }).lean(), 'rule stored');
  const rule = await env.models.NumberingRule.findOne({ name: 'Gov asset tags' }).lean();
  fx.numberingRule = rule._id;
  assert.equal(rule.status, 'active');
  await waitText('Gov asset tags');

  const first = await registerAssetViaUi('Adm numbered asset A');
  assert.equal(first, 'GOV-0001', 'the next asset id follows the active rule');
  // Through the UI as well: a record written behind the SPA's back is only
  // expected once the dataset's stale window passes, which is not this test.
  const second = await registerAssetViaUi('Adm numbered asset B');
  assert.equal(second, 'GOV-0002');

  await env.go('/assets');
  await waitText('Adm numbered asset A');
  await withShot('numbering-order', async () => {
    await env.until(async () => (await env.text()).includes('Adm numbered asset B'), 'second numbered asset listed', 8000);
    const [pB, pA, pOld] = await env.positions('Adm numbered asset B', 'Adm numbered asset A', 'Adm asset 1');
    assert.ok(pB >= 0 && pB < pA && (pOld === -1 || pA < pOld), `newest first: GOV-0002, GOV-0001, then older AST ids (${[pB, pA, pOld]})`);
  });

  // Switch it off again so later records use the default sequence.
  await env.go('/admin/numbering');
  await waitText('Gov asset tags');
  await clickInRow('Gov asset tags', 'Deactivate');
  await env.until(async () => (await env.models.NumberingRule.findById(fx.numberingRule).lean())?.status === 'inactive', 'rule deactivated');
  const third = await env.ok('admin', '/assets', 'POST', assetBody('Adm unnumbered asset'));
  assert.match(third.id, /^AST-\d+$/, 'default sequence resumes once the rule is inactive');
});

// ═════════════════════════════════════════════════════════════════════════════
// SETTINGS (last — it renames the admin)
// ═════════════════════════════════════════════════════════════════════════════

test('settings: a profile name change shows in the top bar at once and is the actor on the next action', { timeout: 60000 }, async () => {
  const NEW_NAME = 'Asha Renamed';
  await env.go('/settings/profile');
  await env.page.waitForSelector('#pf-name', 20000);
  await env.page.fill('#pf-name', NEW_NAME);
  await clickLabel('Save changes');
  await env.until(async () => (await env.models.User.findById('U-SYNC-1').lean())?.name === NEW_NAME, 'name stored');
  await withShot('profile-topbar', async () => {
    await env.until(async () => env.page.eval(`return [...document.querySelectorAll('button[aria-label="Account menu"]')].some((b) => b.innerText.includes(${JSON.stringify(NEW_NAME)}))`), 'top bar shows the new name', 8000);
  });

  // The next thing the admin does is recorded under the new name.
  await env.go(`/alerts/${fx.alert.id}`);
  await waitText('Adm alert for owner picker');
  await clickLabel('Escalate');
  await env.until(async () => (await env.models.Alert.findById(fx.alert.id).lean())?.status === 'Escalated', 'escalated');
  const doc = await env.models.Alert.findById(fx.alert.id).lean();
  assert.equal(doc.escalatedBy, NEW_NAME, 'actor recorded under the new name');
  await waitText(`${NEW_NAME} escalated the alert.`);

  // Directory pickers carry the new name too.
  await clickLabel('Assign');
  await env.page.waitForSelector('[role="dialog"] select');
  const owners = await selectOptions('[role="dialog"] select');
  assert.ok(owners.includes(NEW_NAME) && !owners.includes(nameOf('admin')), `owner picker shows the renamed user (${owners.join(', ')})`);
});
