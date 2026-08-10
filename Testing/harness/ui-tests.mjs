// Asset Management — UI / UX / accessibility / responsive test runner.
//
//   node --experimental-websocket Testing/harness/ui-tests.mjs
//
// Drives real Chrome against the running dev server. Screenshots land in
// Testing/evidence/. Assets created through the UI are deleted via the API at
// the end so the database is left as it was found.

import { writeFileSync, mkdirSync } from 'node:fs';
import { Browser } from './cdp.mjs';
import { WEB, EMAIL, PASSWORD, login, req, record, results, summarise } from './lib.mjs';

const token = await login();
const uiCreated = [];

const browser = await Browser.launch();
const page = await browser.page(1440, 900);
console.log(`\nChrome up. Target ${WEB}\n${'─'.repeat(78)}`);

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// ─── 1. Authentication ──────────────────────────────────────────────────────

await page.nav(`${WEB}/auth/login`);
const loginRendered = await page.waitForText('Sign in');
await page.shot('01-login');

record({
  id: 'AM-UI-001', feature: 'Login page renders with the sign-in form', type: 'UI',
  priority: 'P0', severity: 'Critical',
  expected: '"Sign in" heading and email/password inputs visible',
  actual: `rendered=${loginRendered}`,
  pass: loginRendered,
  evidence: 'evidence/01-login.png',
});

await page.fill('#login-email', EMAIL);
await page.fill('#login-password', PASSWORD);
// Confirm both fields actually took before submitting — a missed selector here
// silently cascades into every later case failing for the wrong reason.
const filled = await page.eval(`
  return { email: document.querySelector('#login-email')?.value ?? '',
           pw: (document.querySelector('#login-password')?.value ?? '').length };`);
if (!filled.email || !filled.pw) throw new Error(`login fields not filled: ${JSON.stringify(filled)}`);
page.clearLogs();
await page.clickText('button', 'Sign in');
const loggedIn = await page.waitForText('Asset', 40000);
await sleep(4000);
await page.shot('02-after-login');

record({
  id: 'AM-UI-002', feature: 'Valid credentials sign in and land on the workspace', type: 'Functional',
  priority: 'P0', severity: 'Critical',
  expected: 'Navigates away from /auth/login into the app shell',
  actual: `url=${await page.eval('return location.pathname')} loggedIn=${loggedIn}`,
  pass: loggedIn && !(await page.eval('return location.pathname')).includes('/auth/login'),
  evidence: 'evidence/02-after-login.png',
});

// ─── 2. Asset Registry — empty state ────────────────────────────────────────

page.clearLogs();
await page.nav(`${WEB}/assets`);
await page.waitForText('Asset Registry', 30000);
await sleep(2500);
await page.shot('03-registry-empty');

const registryText = await page.text();
record({
  id: 'AM-UI-010', feature: 'Asset Registry page renders its header and toolbar', type: 'UI',
  priority: 'P0', severity: 'Critical',
  expected: '"Asset Registry" title, Export CSV and + Add Asset actions',
  actual: `title=${registryText.includes('Asset Registry')} export=${registryText.includes('Export CSV')} add=${registryText.includes('Add Asset')}`,
  pass: registryText.includes('Asset Registry') && registryText.includes('Export CSV') && registryText.includes('Add Asset'),
  evidence: 'evidence/03-registry-empty.png',
});

// The lens chips are the registry's triage surface — each names a queue and
// carries its live size. Asserting on an "empty estate" here would be wrong:
// the environment legitimately holds operator-created assets.
const lensChips = await page.eval(`
  const txt = document.body.innerText;
  return ['All Assets','Setup incomplete','Untracked','Unassigned','Needs attention']
    .filter(l => txt.includes(l));`);
record({
  id: 'AM-UX-001', feature: 'Registry shows triage lens chips with live queue counts', type: 'UX',
  priority: 'P1', severity: 'Medium',
  expected: 'All Assets + the exception queues rendered as filter chips',
  actual: `chips present: ${JSON.stringify(lensChips)}`,
  pass: lensChips.length >= 4,
  evidence: 'evidence/03-registry-empty.png',
});

record({
  id: 'AM-UI-011', feature: 'Registry page loads with no console errors', type: 'UI',
  priority: 'P0', severity: 'Critical',
  expected: '0 console errors / uncaught exceptions',
  actual: page.errors().length ? page.errors().slice(0, 3).join(' | ').slice(0, 220) : '0 errors',
  pass: page.errors().length === 0,
});

const failedApi = page.responses.filter((r) => r.url.includes('/api/') && r.status >= 400);
record({
  id: 'AM-API-060', feature: 'Registry page issues no failing API calls', type: 'API',
  priority: 'P0', severity: 'Critical',
  expected: 'no /api/ response with status >= 400',
  actual: failedApi.length ? JSON.stringify(failedApi.slice(0, 4)) : 'none',
  pass: failedApi.length === 0,
});

{
  const t0 = Date.now();
  await page.nav(`${WEB}/assets`);
  await page.waitForGate();
  await page.waitForText('Asset Registry', 30000);
  const ms = Date.now() - t0;
  record({
    id: 'AM-PERF-010', feature: 'Workspace becomes interactive within 3 s on an empty estate', type: 'Performance',
    priority: 'P1', severity: 'High',
    expected: '< 3000 ms from navigation to the registry being usable',
    actual: `${ms} ms (blocked behind GET /dataset)`,
    pass: ms < 3000,
  });
}

// ─── 3. Create asset — the form ─────────────────────────────────────────────

page.clearLogs();
await page.nav(`${WEB}/assets/new`);
await page.waitForGate();
await page.shot('04-add-asset');
const newText = await page.text();

record({
  id: 'AM-UI-020', feature: '/assets/new renders the registration surface', type: 'UI',
  priority: 'P0', severity: 'Critical',
  expected: 'A form or source picker appears',
  actual: newText.slice(0, 150).replace(/\n+/g, ' / '),
  pass: newText.trim().length > 40 && page.errors().length === 0,
  evidence: 'evidence/04-add-asset.png',
});

record({
  id: 'AM-UI-021', feature: '/assets/new loads with no console errors', type: 'UI',
  priority: 'P0', severity: 'Critical',
  expected: '0 console errors',
  actual: page.errors().length ? page.errors().slice(0, 3).join(' | ').slice(0, 220) : '0 errors',
  pass: page.errors().length === 0,
});

// Required-field labelling: every input the user must fill should be
// programmatically associated with a label, not just visually adjacent.
const labelAudit = await page.eval(`
  const inputs = [...document.querySelectorAll('input:not([type=hidden]):not([type=checkbox]), select, textarea')];
  let labelled = 0;
  const unlabelled = [];
  for (const el of inputs) {
    const has = (el.id && document.querySelector('label[for="' + CSS.escape(el.id) + '"]'))
      || el.getAttribute('aria-label') || el.getAttribute('aria-labelledby') || el.closest('label');
    if (has) labelled++; else unlabelled.push(el.name || el.id || el.placeholder || el.tagName);
  }
  return { total: inputs.length, labelled, unlabelled: unlabelled.slice(0, 8) };`);

record({
  id: 'AM-A11Y-001', feature: 'Form inputs are programmatically labelled', type: 'Accessibility',
  priority: 'P1', severity: 'High',
  expected: 'every input has a <label for>, aria-label or wrapping label',
  actual: `${labelAudit.labelled}/${labelAudit.total} labelled; unlabelled: ${JSON.stringify(labelAudit.unlabelled)}`,
  pass: labelAudit.total === 0 || labelAudit.labelled === labelAudit.total,
});

// ─── 4. Create an asset through the API, then verify the UI renders it ──────
// The registry is the surface most likely to assume a field the API treats as
// optional, so this deliberately creates the *minimal* legal asset.

const madeMinimal = await req(token, 'POST', '/assets', {
  name: 'QA UI Minimal Asset',
  category: 'Compute',
  location: { id: 'LOC-QA-UI', name: 'QA Lab' },
});
if (madeMinimal.status === 201) uiCreated.push(madeMinimal.body.data.id);

const xssName = 'QA <img src=x onerror="window.__xss=1">';
const madeXss = await req(token, 'POST', '/assets', {
  name: xssName,
  category: 'Storage',
  location: { id: 'LOC-QA-UI', name: 'QA Lab' },
});
if (madeXss.status === 201) uiCreated.push(madeXss.body.data.id);

page.clearLogs();
await page.nav(`${WEB}/assets`);
await page.waitForText('Asset Registry', 30000);
await sleep(4000);
await page.shot('05-registry-with-assets');
const withAssets = await page.text();

record({
  id: 'AM-UI-030', feature: 'API-created asset with no onboarding record renders in the registry', type: 'Functional',
  priority: 'P0', severity: 'Critical',
  expected: 'Row appears; page does not crash on the optional onboarding field',
  actual: `visible=${withAssets.includes('QA UI Minimal Asset')} errors=${page.errors().length}`,
  pass: withAssets.includes('QA UI Minimal Asset') && page.errors().length === 0,
  evidence: 'evidence/05-registry-with-assets.png',
});

const xssFired = await page.eval('return window.__xss === 1');
record({
  id: 'AM-SEC-020', feature: 'Script payload in an asset name does not execute (stored XSS)', type: 'Security',
  priority: 'P0', severity: 'Critical',
  expected: 'window.__xss undefined — React escapes the name as text',
  actual: `xssExecuted=${xssFired === true}`,
  pass: xssFired !== true,
  evidence: 'evidence/05-registry-with-assets.png',
});

record({
  id: 'AM-UI-031', feature: 'Registry with data loads with no console errors', type: 'UI',
  priority: 'P0', severity: 'Critical',
  expected: '0 console errors',
  actual: page.errors().length ? page.errors().slice(0, 3).join(' | ').slice(0, 240) : '0 errors',
  pass: page.errors().length === 0,
});

// ─── 5. Search / filter behaviour ───────────────────────────────────────────

const searchSel = 'input[placeholder*="Filter by name"]';
if (await page.waitForSelector(searchSel, 8000)) {
  await page.fill(searchSel, 'QA UI Minimal');
  await sleep(1200);
  const filtered = await page.text();
  await page.shot('06-search-filter');
  record({
    id: 'AM-UI-040', feature: 'Registry search narrows the table to matching rows', type: 'Functional',
    priority: 'P1', severity: 'High',
    expected: 'Matching asset visible; non-matching hidden',
    actual: `minimalVisible=${filtered.includes('QA UI Minimal Asset')}`,
    pass: filtered.includes('QA UI Minimal Asset'),
    evidence: 'evidence/06-search-filter.png',
  });

  await page.fill(searchSel, 'zzz-no-such-asset-zzz');
  await sleep(1200);
  const none = await page.text();
  await page.shot('07-search-no-results');
  record({
    id: 'AM-UX-002', feature: 'Search with no matches shows a no-results state with a way out', type: 'UX',
    priority: 'P1', severity: 'Medium',
    expected: '"No assets match your filters" plus a Clear filters action',
    actual: `noResults=${/no assets match/i.test(none)} clearAction=${/clear filters/i.test(none)}`,
    pass: /no assets match/i.test(none) && /clear filters/i.test(none),
    evidence: 'evidence/07-search-no-results.png',
  });

  await page.fill(searchSel, '');
  await sleep(900);

  // The URL is meant to carry the whole view so a link reproduces it.
  await page.fill(searchSel, 'QA');
  await sleep(1200);
  const url = await page.eval('return location.search');
  record({
    id: 'AM-UX-003', feature: 'Filter state is reflected in the URL (shareable view)', type: 'UX',
    priority: 'P2', severity: 'Medium',
    expected: '?q=QA present in the query string',
    actual: `search=${url}`,
    pass: url.includes('q=QA'),
  });
  await page.fill(searchSel, '');
  await sleep(800);
} else {
  record({
    id: 'AM-UI-040', feature: 'Registry search input is present', type: 'UI',
    priority: 'P1', severity: 'High',
    expected: 'search input rendered',
    actual: 'search input not found',
    pass: false,
  });
}

// ─── 6. Asset 360 detail page ───────────────────────────────────────────────

const minimalId = madeMinimal.body?.data?.id;
if (minimalId) {
  page.clearLogs();
  await page.nav(`${WEB}/assets/${minimalId}`);
  await page.waitForGate();
  await page.shot('08-asset-360');
  const detail = await page.text();
  record({
    id: 'AM-UI-050', feature: 'Asset 360 detail page opens for a minimal asset', type: 'Functional',
    priority: 'P0', severity: 'Critical',
    expected: 'Asset name shown; no crash on absent onboarding/telemetry',
    actual: `nameShown=${detail.includes('QA UI Minimal Asset')} errors=${page.errors().length} first=${page.errors()[0]?.slice(0, 120) ?? ''}`,
    pass: detail.includes('QA UI Minimal Asset') && page.errors().length === 0,
    evidence: 'evidence/08-asset-360.png',
  });
}

// A deleted/unknown asset must not white-screen.
page.clearLogs();
await page.nav(`${WEB}/assets/AST-99999999`);
await page.waitForGate();
await page.shot('09-asset-404');
const notFound = await page.text();
record({
  id: 'AM-NEG-010', feature: 'Unknown asset id shows a not-found state, not a blank page', type: 'Negative',
  priority: 'P1', severity: 'High',
  expected: 'A "not found" message with a way back',
  actual: `text=${notFound.trim().slice(0, 120).replace(/\n+/g, ' / ')} errors=${page.errors().length}`,
  pass: notFound.trim().length > 30 && /not found|doesn'?t exist|no longer|unknown/i.test(notFound),
  evidence: 'evidence/09-asset-404.png',
});

// ─── 7. Responsive ──────────────────────────────────────────────────────────

for (const [id, label, w, h] of [
  ['AM-RSP-001', 'mobile 390×844', 390, 844],
  ['AM-RSP-002', 'tablet 768×1024', 768, 1024],
  ['AM-RSP-003', 'desktop 1440×900', 1440, 900],
]) {
  await page.setViewport(w, h);
  await page.nav(`${WEB}/assets`);
  await page.waitForText('Asset Registry', 25000);
  await sleep(2500);
  await page.shot(`10-responsive-${w}`);
  const overflow = await page.eval(`
    return { docW: document.documentElement.scrollWidth, winW: window.innerWidth };`);
  const overflows = overflow.docW > overflow.winW + 2;
  record({
    id, feature: `Registry at ${label} does not scroll horizontally`, type: 'Responsive',
    priority: 'P2', severity: 'Medium',
    expected: 'document scrollWidth <= viewport width',
    actual: `scrollWidth=${overflow.docW} viewport=${overflow.winW}${overflows ? ' → OVERFLOW' : ''}`,
    pass: !overflows,
    evidence: `evidence/10-responsive-${w}.png`,
  });
}
await page.setViewport(1440, 900);

// ─── 8. Accessibility sweep ─────────────────────────────────────────────────

await page.nav(`${WEB}/assets`);
await page.waitForText('Asset Registry', 25000);
await sleep(2500);

const a11y = await page.eval(`
  const imgs = [...document.querySelectorAll('img')];
  const noAlt = imgs.filter(i => !i.hasAttribute('alt')).length;
  const btns = [...document.querySelectorAll('button')];
  const namelessBtns = btns.filter(b =>
    !(b.innerText||'').trim() && !b.getAttribute('aria-label') && !b.getAttribute('title')).length;
  const boxes = [...document.querySelectorAll('input[type=checkbox]')];
  const namelessBoxes = boxes.filter(c =>
    !c.getAttribute('aria-label') && !c.getAttribute('aria-labelledby') &&
    !(c.id && document.querySelector('label[for="' + CSS.escape(c.id) + '"]')) && !c.closest('label')).length;
  const h1 = document.querySelectorAll('h1').length;
  const tables = [...document.querySelectorAll('table')];
  const headerless = tables.filter(t => !t.querySelector('th')).length;
  return { imgs: imgs.length, noAlt, btns: btns.length, namelessBtns, boxes: boxes.length, namelessBoxes, h1, tables: tables.length, headerless };`);

record({
  id: 'AM-A11Y-002', feature: 'All images carry an alt attribute', type: 'Accessibility',
  priority: 'P2', severity: 'Medium',
  expected: '0 images without alt',
  actual: `${a11y.noAlt} of ${a11y.imgs} missing alt`,
  pass: a11y.noAlt === 0,
});

record({
  id: 'AM-A11Y-003', feature: 'Icon-only buttons expose an accessible name', type: 'Accessibility',
  priority: 'P1', severity: 'High',
  expected: '0 buttons without text, aria-label or title',
  actual: `${a11y.namelessBtns} of ${a11y.btns} buttons unnamed`,
  pass: a11y.namelessBtns === 0,
});

record({
  id: 'AM-A11Y-004', feature: 'Row-selection checkboxes are labelled for screen readers', type: 'Accessibility',
  priority: 'P1', severity: 'High',
  expected: '0 unlabelled checkboxes',
  actual: `${a11y.namelessBoxes} of ${a11y.boxes} checkboxes unlabelled`,
  pass: a11y.namelessBoxes === 0,
});

record({
  id: 'AM-A11Y-005', feature: 'Page exposes exactly one H1 landmark', type: 'Accessibility',
  priority: 'P2', severity: 'Low',
  expected: 'exactly 1 <h1>',
  actual: `${a11y.h1} h1 elements`,
  pass: a11y.h1 === 1,
});

record({
  id: 'AM-A11Y-006', feature: 'Data table uses <th> header cells', type: 'Accessibility',
  priority: 'P2', severity: 'Medium',
  expected: 'every table has header cells',
  actual: `${a11y.headerless} of ${a11y.tables} tables without <th>`,
  pass: a11y.headerless === 0,
});

// Keyboard reachability — a registry you cannot tab through is unusable
// without a mouse.
const focusable = await page.eval(`
  const sel = 'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';
  return document.querySelectorAll(sel).length;`);
record({
  id: 'AM-A11Y-007', feature: 'Registry exposes keyboard-focusable controls', type: 'Accessibility',
  priority: 'P2', severity: 'Medium',
  expected: '> 5 focusable elements',
  actual: `${focusable} focusable`,
  pass: focusable > 5,
});

// Sortable column headers are <th onClick> with no button/role — check whether
// a keyboard user can reach them at all.
const sortHeaders = await page.eval(`
  const ths = [...document.querySelectorAll('th')];
  const clickable = ths.filter(t => t.className.includes('cursor-pointer'));
  const reachable = clickable.filter(t =>
    t.hasAttribute('tabindex') || t.querySelector('button') || t.getAttribute('role') === 'button');
  return { clickable: clickable.length, reachable: reachable.length };`);
record({
  id: 'AM-A11Y-008', feature: 'Sortable column headers are keyboard operable', type: 'Accessibility',
  priority: 'P2', severity: 'Medium',
  expected: 'every clickable header is focusable (tabindex/button/role)',
  actual: `${sortHeaders.reachable} of ${sortHeaders.clickable} sortable headers keyboard-reachable`,
  pass: sortHeaders.clickable === 0 || sortHeaders.reachable === sortHeaders.clickable,
});

// ─── 9. Permission / route guarding ─────────────────────────────────────────

page.clearLogs();
await page.eval("return (async () => { await fetch('/api/v1/auth/logout', {method:'POST'}); })()").catch(() => {});
await page.eval('return localStorage.clear()');
await page.eval('return sessionStorage.clear()');
await page.nav(`${WEB}/assets`);
await sleep(4000);
await page.shot('11-unauthenticated-assets');
const guardUrl = await page.eval('return location.pathname');
const guardText = await page.text();
record({
  id: 'AM-PERM-001', feature: 'Assets route is guarded when the session is cleared', type: 'Permission',
  priority: 'P0', severity: 'Critical',
  expected: 'Redirect to /auth/login, or an explicit signed-out state — never the registry with data',
  actual: `path=${guardUrl} showsRegistryRows=${guardText.includes('QA UI Minimal Asset')}`,
  pass: guardUrl.includes('/auth/login') || !guardText.includes('QA UI Minimal Asset'),
  evidence: 'evidence/11-unauthenticated-assets.png',
});

// ─── Teardown ───────────────────────────────────────────────────────────────

console.log(`\n${'─'.repeat(78)}\nRemoving ${uiCreated.length} UI test assets…`);
let removed = 0;
for (const id of uiCreated) {
  const r = await req(token, 'DELETE', `/assets/${id}`);
  if (r.status === 204) removed++;
}
console.log(`  removed ${removed}/${uiCreated.length}`);

await page.close();
await browser.close();

const sum = summarise();
mkdirSync(new URL('../results/', import.meta.url), { recursive: true });
writeFileSync(new URL('../results/ui-results.json', import.meta.url),
  JSON.stringify({ ranAt: new Date().toISOString(), summary: sum, results }, null, 2));
console.log(`\nResults → Testing/results/ui-results.json · screenshots → Testing/evidence/`);
