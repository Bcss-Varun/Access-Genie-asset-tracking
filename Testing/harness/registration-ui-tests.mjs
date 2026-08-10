// Add Asset (wizard) — browser tests.
//
//   node --experimental-websocket Testing/harness/registration-ui-tests.mjs
//
// Drives the four-source picker, the step-per-section add-asset wizard, the
// template editor wizard and the clone flow in real Chrome. Also proves the
// Asset Classes screen and its API are gone. Screenshots land in
// Testing/evidence/. Cleans up every asset and template it creates.

import { writeFileSync, mkdirSync, readFileSync } from 'node:fs';
import { MongoClient } from 'mongodb';
import { Browser } from './cdp.mjs';
import { WEB, EMAIL, PASSWORD, login, req, record, results, summarise } from './lib.mjs';

const token = await login();
const madeAssets = [];

const browser = await Browser.launch();
const page = await browser.page(1440, 900);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
console.log(`\nChrome up. Target ${WEB}\n${'─'.repeat(78)}`);

/** Click a step in the wizard rail by its visible label. */
const gotoStep = (label) => page.clickText('button', label);

// ── Sign in ─────────────────────────────────────────────────────────────────
await page.nav(`${WEB}/auth/login`);
await page.waitForText('Sign in');
await page.fill('#login-email', EMAIL);
await page.fill('#login-password', PASSWORD);
await page.clickText('button', 'Sign in');
await page.waitForText('Asset', 40000);
await page.waitForGate();

// ═══ 1. Source picker ═══════════════════════════════════════════════════════
page.clearLogs();
await page.nav(`${WEB}/assets/new`);
await page.waitForGate();
await page.waitForText('Where is this asset coming from', 20000);
await sleep(600);
await page.shot('20-source-picker');
const picker = await page.text();

record({
  id: 'ARU-001', feature: 'Source picker offers exactly the four remaining sources', type: 'UI',
  priority: 'P0', severity: 'Critical',
  expected: 'Add an asset · From a template · Clone an existing asset · Bulk import',
  actual: `found=${['Add an asset', 'From a template', 'Clone an existing asset', 'Bulk import'].filter((s) => picker.includes(s)).length}/4`,
  pass: ['Add an asset', 'From a template', 'Clone an existing asset', 'Bulk import'].every((s) => picker.includes(s)),
  evidence: 'evidence/20-source-picker.png',
});

record({
  id: 'ARU-002', feature: 'Retired sources are gone from the picker', type: 'UI',
  priority: 'P1', severity: 'High',
  expected: 'no Purchase Order, Scan, ERP or Adopt cards',
  actual: `po=${/purchase order/i.test(picker)} scan=${/scan \(mobile/i.test(picker)} erp=${/ERP \/ API/i.test(picker)} adopt=${/adopt an unknown/i.test(picker)}`,
  pass: !/purchase order/i.test(picker) && !/scan \(mobile/i.test(picker) && !/ERP \/ API/i.test(picker) && !/adopt an unknown/i.test(picker),
  evidence: 'evidence/20-source-picker.png',
});

record({
  id: 'ARU-003', feature: 'Source picker renders with no console errors', type: 'UI',
  priority: 'P0', severity: 'Critical',
  expected: '0 console errors',
  actual: page.errors().length ? page.errors().slice(0, 2).join(' | ').slice(0, 200) : '0 errors',
  pass: page.errors().length === 0,
});

// ═══ 2. Blank wizard — step 1 ═══════════════════════════════════════════════
page.clearLogs();
await page.nav(`${WEB}/assets/new?source=blank`);
await page.waitForGate();
await page.waitForText('What is it?', 25000);
await sleep(1500);
await page.shot('21-wizard-step1');
const step1 = await page.text();

record({
  id: 'ARU-010', feature: 'Add-asset opens as a wizard on step 1 of 8', type: 'UI',
  priority: 'P0', severity: 'Critical',
  expected: '"Step 1 of 8" and the identity section heading',
  actual: step1.match(/Step \d+ of \d+/i)?.[0] ?? '(no step indicator)',
  pass: /Step 1 of 8/i.test(step1) && step1.includes('What is it?'),
  evidence: 'evidence/21-wizard-step1.png',
});

// Only the current step's fields exist in the DOM — that is the whole point of
// splitting the form up.
const step1Fields = await page.eval(`
  return [...document.querySelectorAll('input[id^="f-"], select[id^="f-"], textarea[id^="f-"]')].map(e => e.id.replace('f-',''));`);
record({
  id: 'ARU-011', feature: 'Only the current step is rendered, not the whole form', type: 'UX',
  priority: 'P0', severity: 'Critical',
  expected: 'identity fields present; assignment/commercial fields absent',
  actual: `fields=${JSON.stringify(step1Fields)}`,
  pass: step1Fields.includes('name') && step1Fields.includes('serialNumber') &&
    !step1Fields.includes('custodianName') && !step1Fields.includes('purchasePrice'),
  evidence: 'evidence/21-wizard-step1.png',
});

record({
  id: 'ARU-012', feature: 'Rail lists every step with optional ones marked', type: 'UX',
  priority: 'P1', severity: 'High',
  expected: 'Review & register step present; optional steps flagged',
  actual: `review=${step1.includes('Review & register')} optMarkers=${(step1.match(/\bOpt\b/gi) ?? []).length}`,
  pass: step1.includes('Review & register') && (step1.match(/\bOpt\b/gi) ?? []).length >= 3,
  evidence: 'evidence/21-wizard-step1.png',
});

record({
  id: 'ARU-013', feature: 'Criticality and asset class are not asked anywhere', type: 'Functional',
  priority: 'P1', severity: 'High',
  expected: 'no criticality field, no asset-class field',
  actual: `criticality=${/criticality/i.test(step1)} assetClass=${/asset class/i.test(step1)}`,
  pass: !/criticality/i.test(step1) && !/asset class/i.test(step1),
});

record({
  id: 'ARU-014', feature: 'Step 1 does not ask anyone to invent an asset tag', type: 'Functional',
  priority: 'P0', severity: 'Critical',
  expected: 'no asset-tag input — the number is issued by the server',
  actual: `assetTagInput=${step1Fields.includes('assetTag')}`,
  pass: !step1Fields.includes('assetTag'),
  evidence: 'evidence/21-wizard-step1.png',
});

record({
  id: 'ARU-015', feature: 'Wizard loads with no console errors', type: 'UI',
  priority: 'P0', severity: 'Critical',
  expected: '0 console errors',
  actual: page.errors().length ? page.errors().slice(0, 2).join(' | ').slice(0, 200) : '0 errors',
  pass: page.errors().length === 0,
});

// ═══ 3. Steps and the cross-field rule ══════════════════════════════════════
await page.fill('#f-name', 'QA Wizard Laptop');
await page.fill('#f-category', 'Compute');
await sleep(900);

await page.clickText('button', 'Next →');
await sleep(1400);
await page.shot('22-wizard-step2');
const step2 = await page.text();
const step2Fields = await page.eval(`
  return [...document.querySelectorAll('input[id^="f-"]')].map(e => e.id.replace('f-',''));`);

record({
  id: 'ARU-020', feature: 'Next advances to the assignment step', type: 'Functional',
  priority: 'P0', severity: 'Critical',
  expected: 'Step 2 of 8, custodian fields present',
  actual: `${step2.match(/Step \d+ of \d+/i)?.[0]} fields=${JSON.stringify(step2Fields)}`,
  pass: /Step 2 of 8/i.test(step2) && step2Fields.includes('custodianName'),
  evidence: 'evidence/22-wizard-step2.png',
});

// Name a custodian, leave the ID blank, then leave the step — the error must
// appear, because the rule is cross-field and the ID was never touched.
await page.fill('#f-custodianName', 'Anita Rao');
await sleep(1200);
await page.clickText('button', 'Next →');
await sleep(900);
await gotoStep('Who holds it?');
await sleep(1600);
await page.shot('23-wizard-employee-id');
const empStep = await page.text();

record({
  id: 'ARU-021', feature: 'Custodian without an employee ID raises a visible error', type: 'Validation',
  priority: 'P0', severity: 'Critical',
  expected: 'an inline message asking for the employee ID',
  actual: empStep.match(/An employee ID[^\n]*/)?.[0]?.slice(0, 90) ?? '(no message)',
  pass: /employee id is required/i.test(empStep),
  evidence: 'evidence/23-wizard-employee-id.png',
});

const railError = await page.eval(`
  return [...document.querySelectorAll('button')]
    .some(b => b.innerText.includes('Who holds it?') && b.innerText.includes('!'));`);
record({
  id: 'ARU-022', feature: 'The rail marks the step that has the error', type: 'UX',
  priority: 'P1', severity: 'High',
  expected: 'a "!" marker on the assignment step',
  actual: `railShowsError=${railError}`,
  pass: railError === true,
  evidence: 'evidence/23-wizard-employee-id.png',
});

await page.fill('#f-custodianEmployeeId', 'BCSS-2291');
await sleep(1400);

// ═══ 4. Review step ═════════════════════════════════════════════════════════
await gotoStep('Review & register');
await sleep(1800);
await page.shot('24-wizard-review');
const review = await page.text();

record({
  id: 'ARU-030', feature: 'Review step summarises what will be saved', type: 'UX',
  priority: 'P0', severity: 'Critical',
  expected: 'the entered name and custodian shown back, with Edit links',
  actual: `name=${review.includes('QA Wizard Laptop')} custodian=${review.includes('Anita Rao')} edit=${review.includes('Edit')}`,
  pass: review.includes('QA Wizard Laptop') && review.includes('Anita Rao') && review.includes('Edit'),
  evidence: 'evidence/24-wizard-review.png',
});

const readyState = await page.eval(`
  const b = [...document.querySelectorAll('button')].find(x => x.textContent.includes('Register asset'));
  return { present: !!b, disabled: b ? b.disabled : null, ready: document.body.innerText.includes('Ready to register') };`);
record({
  id: 'ARU-031', feature: 'Register appears only on the review step and is enabled when valid', type: 'Functional',
  priority: 'P0', severity: 'Critical',
  expected: 'button present, enabled, "Ready to register"',
  actual: JSON.stringify(readyState),
  pass: readyState.present && readyState.disabled === false && readyState.ready,
  evidence: 'evidence/24-wizard-review.png',
});

const reviewCards = await page.eval(`
  return [...document.querySelectorAll('[data-review-card]')].map(e => e.getAttribute('data-review-card'));`);
record({
  id: 'ARU-034', feature: 'Review is one card per section, not a single stacked sheet', type: 'UX',
  priority: 'P0', severity: 'Critical',
  expected: 'a separate card for each section that has values, plus the derived ones',
  actual: `cards=${JSON.stringify(reviewCards)}`,
  pass: reviewCards.length >= 3 && reviewCards.includes('What is it?') && reviewCards.includes('Who holds it?'),
  evidence: 'evidence/24-wizard-review.png',
});

record({
  id: 'ARU-035', feature: 'Review names the numbers the server will issue', type: 'UX',
  priority: 'P0', severity: 'Critical',
  expected: '"Issued for you" card naming the asset tag, so a blank field is not read as a missing one',
  actual: `card=${reviewCards.includes('Issued for you')} tag=${/Asset tag/i.test(review)} onSave=${/On save/i.test(review)}`,
  pass: reviewCards.includes('Issued for you') && /Asset tag/i.test(review) && /On save/i.test(review),
  evidence: 'evidence/24-wizard-review.png',
});

record({
  id: 'ARU-036', feature: 'Skipped sections are gathered into one card, not repeated', type: 'UX',
  priority: 'P1', severity: 'High',
  expected: 'a "Left blank" card instead of "Nothing entered" once per empty section',
  actual: `leftBlank=${reviewCards.includes('Left blank')} nothingEntered=${(review.match(/Nothing entered/gi) ?? []).length}`,
  pass: reviewCards.includes('Left blank') && (review.match(/Nothing entered/gi) ?? []).length === 0,
  evidence: 'evidence/24-wizard-review.png',
});

page.clearLogs();
await page.clickText('button', 'Register asset');
await sleep(5000);
await page.waitForGate();
await sleep(1500);
await page.shot('25-registered');
const landed = await page.eval('return location.pathname');
const landedId = landed.split('/').pop();
if (landedId && /^AST-\d+$/.test(landedId)) madeAssets.push(landedId);

record({
  id: 'ARU-032', feature: 'Registering from the wizard creates the asset', type: 'Functional',
  priority: 'P0', severity: 'Critical',
  expected: 'lands on /assets/AST-…',
  actual: `url=${landed}`,
  pass: /^\/assets\/AST-\d+$/.test(landed),
  evidence: 'evidence/25-registered.png',
});

{
  const r = await req(token, 'GET', `/assets/${landedId}`);
  const a = r.body?.data;
  record({
    id: 'ARU-033', feature: 'Wizard-registered asset is stored correctly', type: 'Database',
    priority: 'P0', severity: 'Critical',
    expected: 'name, custodian, employee ID and a resolved site; serial empty',
    actual: `name=${a?.name} custodian=${a?.custodian} emp=${a?.onboarding?.custodianEmployeeId} site=${a?.location?.name} serial=${JSON.stringify(a?.serialNumber)}`,
    pass: a?.name === 'QA Wizard Laptop' && a?.custodian === 'Anita Rao' &&
      a?.onboarding?.custodianEmployeeId === 'BCSS-2291' && !!a?.location?.name && a?.serialNumber === '',
  });

  record({
    id: 'ARU-037', feature: 'The asset the wizard created carries a minted asset tag', type: 'Database',
    priority: 'P0', severity: 'Critical',
    expected: 'onboarding.assetTag matches AG-<n>, without anyone having typed it',
    actual: `assetTag=${a?.onboarding?.assetTag}`,
    pass: /^AG-\d+$/.test(a?.onboarding?.assetTag ?? ''),
  });
}

// ═══ 5. Template editor wizard ══════════════════════════════════════════════
page.clearLogs();
await page.nav(`${WEB}/assets/templates/new`);
await page.waitForGate();
await page.waitForText('What is this template for', 25000);
await sleep(1500);
await page.shot('26-template-wizard-step1');
const tplStep1 = await page.text();

record({
  id: 'ARU-040', feature: 'Template editor opens as a wizard', type: 'UI',
  priority: 'P0', severity: 'Critical',
  expected: 'Step 1 of 8 on the template details step',
  actual: tplStep1.match(/Step \d+ of \d+/i)?.[0] ?? '(none)',
  pass: /Step 1 of 8/i.test(tplStep1) && tplStep1.includes('What is this template for'),
  evidence: 'evidence/26-template-wizard-step1.png',
});

const iconGrid = await page.eval(`
  const g = document.querySelector('[role="radiogroup"][aria-label="Template icon"]');
  return { present: !!g, count: g ? g.querySelectorAll('[role="radio"]').length : 0 };`);
record({
  id: 'ARU-041', feature: 'Icon is chosen from a grid, not typed', type: 'UX',
  priority: 'P1', severity: 'High',
  expected: 'a radiogroup of 20+ IT icons',
  actual: JSON.stringify(iconGrid),
  pass: iconGrid.present && iconGrid.count >= 20,
  evidence: 'evidence/26-template-wizard-step1.png',
});

record({
  id: 'ARU-042', feature: 'Template editor loads with no console errors', type: 'UI',
  priority: 'P0', severity: 'Critical',
  expected: '0 console errors',
  actual: page.errors().length ? page.errors().slice(0, 2).join(' | ').slice(0, 200) : '0 errors',
  pass: page.errors().length === 0,
});

await page.fill('#t-name', 'QA Wizard Template');
await page.fill('#t-desc', 'Only what a laptop needs');
await page.eval(`
  const b = [...document.querySelectorAll('[role="radio"]')].find(x => x.getAttribute('aria-label') === 'Icon 💻');
  if (b) b.click();
  return !!b;`);
await sleep(600);

await page.clickText('button', 'Next →');
await sleep(1600);
await page.shot('27-template-wizard-fields');
const tplFieldsStep = await page.text();

record({
  id: 'ARU-043', feature: 'Next moves to the first field section, one section per step', type: 'UX',
  priority: 'P0', severity: 'Critical',
  expected: 'Step 2 of 8 showing the identity fields with Mandatory toggles',
  actual: `${tplFieldsStep.match(/Step \d+ of \d+/i)?.[0]} mandatory=${(tplFieldsStep.match(/Mandatory/gi) ?? []).length}`,
  pass: /Step 2 of 8/i.test(tplFieldsStep) && (tplFieldsStep.match(/Mandatory/gi) ?? []).length >= 4,
  evidence: 'evidence/27-template-wizard-fields.png',
});

const coreLocked = await page.eval(`
  const c = [...document.querySelectorAll('input[type=checkbox]')].find(x => x.getAttribute('aria-label') === 'Include Asset name');
  return c ? { checked: c.checked, disabled: c.disabled } : null;`);
record({
  id: 'ARU-044', feature: 'Core fields are pre-ticked and cannot be removed', type: 'Functional',
  priority: 'P1', severity: 'High',
  expected: 'Asset name checked and disabled',
  actual: JSON.stringify(coreLocked),
  pass: coreLocked?.checked === true && coreLocked?.disabled === true,
});

record({
  id: 'ARU-047', feature: 'The template editor does not re-offer questions it already answers', type: 'UX',
  priority: 'P0', severity: 'Critical',
  expected: 'no Category tick-box and no Asset tag tick-box on the identity step',
  actual: `category=${/Include Category/.test(tplFieldsStep)} assetTag=${/Asset tag/i.test(tplFieldsStep)}`,
  pass: !(await page.eval(`
    return [...document.querySelectorAll('input[type=checkbox]')]
      .some(x => ['Include Category', 'Include Asset tag'].includes(x.getAttribute('aria-label')));`)),
});

await page.eval(`
  const tick = (label) => {
    const c = [...document.querySelectorAll('input[type=checkbox]')].find(x => x.getAttribute('aria-label') === label);
    if (c && !c.checked && !c.disabled) c.click();
  };
  tick('Include Serial number'); tick('Include Manufacturer');
  return true;`);
await sleep(500);
await page.eval(`
  const c = [...document.querySelectorAll('input[type=checkbox]')].find(x => x.getAttribute('aria-label') === 'Make Serial number mandatory');
  if (c && !c.checked && !c.disabled) c.click();
  return true;`);
await sleep(700);

// Jump to the last step, where the save action lives.
await gotoStep('Tag & tracking');
await sleep(1400);
await page.shot('28-template-wizard-last');
page.clearLogs();
await page.clickText('button', 'Create template');
await sleep(5000);
await page.waitForGate();
await sleep(1400);
await page.shot('29-templates-list');
const tplListUrl = await page.eval('return location.pathname');
const tplList = await page.text();

record({
  id: 'ARU-045', feature: 'Saving from the last step creates the template', type: 'Functional',
  priority: 'P0', severity: 'Critical',
  expected: 'navigates to /assets/templates with the new template listed',
  actual: `url=${tplListUrl} listed=${tplList.includes('QA Wizard Template')}`,
  pass: tplListUrl === '/assets/templates' && tplList.includes('QA Wizard Template'),
  evidence: 'evidence/29-templates-list.png',
});

{
  const r = await req(token, 'GET', '/assets/templates?status=all');
  const mine = (r.body?.data ?? []).find((t) => t.name === 'QA Wizard Template');
  const requiredKeys = (mine?.fields ?? []).filter((f) => f.required).map((f) => f.key);
  record({
    id: 'ARU-046', feature: 'Wizard-authored template stores fields, icon and required flags', type: 'Database',
    priority: 'P0', severity: 'Critical',
    expected: 'serialNumber required; icon 💻',
    actual: `icon=${mine?.icon} fields=${(mine?.fields ?? []).length} required=${JSON.stringify(requiredKeys)}`,
    pass: !!mine && requiredKeys.includes('serialNumber') && mine.icon === '💻',
  });
}

// ═══ 6. Template-driven registration ════════════════════════════════════════
page.clearLogs();
await page.nav(`${WEB}/assets/new?source=template`);
await page.waitForGate();
await page.waitForText('Which template', 25000);
await sleep(1400);
await page.clickText('button', 'QA Wizard Template');
await sleep(2800);
await page.shot('30-template-registration');
const tplReg = await page.text();
const tplRegFields = await page.eval(`
  return [...document.querySelectorAll('input[id^="f-"], select[id^="f-"]')].map(e => e.id.replace('f-',''));`);

record({
  id: 'ARU-050', feature: 'Template registration asks only the chosen fields', type: 'Functional',
  priority: 'P0', severity: 'Critical',
  expected: 'identity step shows serial and manufacturer; no purchase price on it',
  actual: `step=${tplReg.match(/Step \d+ of \d+/i)?.[0]} fields=${JSON.stringify(tplRegFields)}`,
  pass: tplRegFields.includes('serialNumber') && tplRegFields.includes('manufacturer') && !tplRegFields.includes('purchasePrice'),
  evidence: 'evidence/30-template-registration.png',
});

// ═══ 7. Clone ═══════════════════════════════════════════════════════════════
page.clearLogs();
await page.nav(`${WEB}/assets/new?source=clone`);
await page.waitForGate();
await page.waitForText('Which asset are you copying', 25000);
await sleep(1800);
await page.shot('31-clone-chooser');
const cloneList = await page.text();
const cloneSearch = await page.eval(`return !!document.querySelector('input[aria-label="Search assets to clone"]')`);

record({
  id: 'ARU-060', feature: 'Clone chooser lists assets with a search box', type: 'UI',
  priority: 'P0', severity: 'Critical',
  expected: 'search input plus at least one asset row',
  actual: `searchInput=${cloneSearch} rows=${cloneList.includes('Copy →')}`,
  pass: cloneSearch && cloneList.includes('Copy →'),
  evidence: 'evidence/31-clone-chooser.png',
});

await page.clickText('button', 'Copy →');
await sleep(3200);
await page.shot('32-clone-wizard');
const cloneForm = await page.text();

record({
  id: 'ARU-061', feature: 'Clone wizard warns which fields could not be copied', type: 'UX',
  priority: 'P0', severity: 'Critical',
  expected: 'a callout naming the identity fields left empty',
  actual: cloneForm.match(/\d+ fields? could not be copied/)?.[0] ?? '(no callout)',
  pass: /could not be copied/.test(cloneForm),
  evidence: 'evidence/32-clone-wizard.png',
});

const cloneState = await page.eval(`
  const s = document.querySelector('#f-serialNumber');
  return { serial: s ? s.value : null, name: document.querySelector('#f-name')?.value ?? null };`);
record({
  id: 'ARU-062', feature: 'Clone copies shared values but blanks the identity fields', type: 'Functional',
  priority: 'P0', severity: 'Critical',
  expected: 'serial empty, name carried over',
  actual: JSON.stringify(cloneState),
  pass: cloneState.serial === '' && !!cloneState.name,
  evidence: 'evidence/32-clone-wizard.png',
});

record({
  id: 'ARU-063', feature: 'Clone flow renders with no console errors', type: 'UI',
  priority: 'P0', severity: 'Critical',
  expected: '0 console errors',
  actual: page.errors().length ? page.errors().slice(0, 2).join(' | ').slice(0, 220) : '0 errors',
  pass: page.errors().length === 0,
});

// ═══ 8. Asset Classes must be gone ══════════════════════════════════════════
page.clearLogs();
await page.nav(`${WEB}/assets`);
await page.waitForGate();
await sleep(2200);
const nav = await page.text();
record({
  id: 'ARU-070', feature: 'Asset Classes is gone from the navigation', type: 'Functional',
  priority: 'P0', severity: 'Critical',
  expected: 'no "Asset Class" row; "Asset Templates" present instead',
  actual: `classes=${/asset class/i.test(nav)} templates=${nav.includes('Asset Templates')}`,
  pass: !/asset class/i.test(nav) && nav.includes('Asset Templates'),
});

{
  const r = await req(token, 'GET', '/asset-classes');
  record({
    id: 'ARU-071', feature: 'The asset-classes API no longer exists', type: 'API',
    priority: 'P0', severity: 'Critical',
    expected: '404',
    actual: `${r.status}`,
    pass: r.status === 404,
  });
}

await page.nav(`${WEB}/admin/classes`);
await page.waitForGate();
await sleep(2500);
await page.shot('33-admin-classes-gone');
const gonePage = await page.text();
record({
  id: 'ARU-072', feature: 'The Administration class screen no longer resolves', type: 'Functional',
  priority: 'P0', severity: 'Critical',
  expected: 'a not-found state, not the class editor',
  actual: gonePage.trim().slice(0, 90).replace(/\n+/g, ' / '),
  pass: !/asset classes & templates/i.test(gonePage),
  evidence: 'evidence/33-admin-classes-gone.png',
});

// ═══ 9. Responsive ══════════════════════════════════════════════════════════
for (const [id, label, w] of [['ARU-080', 'mobile 390', 390], ['ARU-081', 'desktop 1440', 1440]]) {
  await page.setViewport(w, w === 390 ? 844 : 900);
  await page.nav(`${WEB}/assets/new?source=blank`);
  await page.waitForGate();
  await page.waitForText('What is it?', 25000);
  await sleep(1400);
  await page.shot(`34-wizard-${w}`);
  const o = await page.eval(`return { docW: document.documentElement.scrollWidth, winW: window.innerWidth };`);
  record({
    id, feature: `Add-asset wizard at ${label} does not scroll horizontally`, type: 'Responsive',
    priority: 'P2', severity: 'Medium',
    expected: 'scrollWidth <= viewport width',
    actual: `scrollWidth=${o.docW} viewport=${o.winW}`,
    pass: o.docW <= o.winW + 2,
    evidence: `evidence/34-wizard-${w}.png`,
  });
}
await page.setViewport(1440, 900);

// ═══ 10. Accessibility ══════════════════════════════════════════════════════
await page.nav(`${WEB}/assets/new?source=blank`);
await page.waitForGate();
await page.waitForText('What is it?', 25000);
await sleep(1400);

const a11y = await page.eval(`
  const inputs = [...document.querySelectorAll('input:not([type=hidden]), select, textarea')];
  const unlabelled = inputs.filter(el => !(
    (el.id && document.querySelector('label[for="' + CSS.escape(el.id) + '"]'))
    || el.getAttribute('aria-label') || el.getAttribute('aria-labelledby') || el.closest('label')));
  const stepMarked = document.querySelectorAll('[aria-current="step"]').length;
  return { total: inputs.length, unlabelled: unlabelled.length, stepMarked };`);

record({
  id: 'ARU-090', feature: 'Every wizard input is programmatically labelled', type: 'Accessibility',
  priority: 'P1', severity: 'High',
  expected: '0 unlabelled inputs',
  actual: `${a11y.unlabelled} of ${a11y.total} unlabelled`,
  pass: a11y.unlabelled === 0,
});

record({
  id: 'ARU-091', feature: 'The active step is exposed with aria-current', type: 'Accessibility',
  priority: 'P1', severity: 'High',
  expected: 'exactly one aria-current="step"',
  actual: `${a11y.stepMarked} marked`,
  pass: a11y.stepMarked === 1,
});

// ═══ Teardown ═══════════════════════════════════════════════════════════════
console.log(`\n${'─'.repeat(78)}\nTearing down ${madeAssets.length} assets and any QA templates…`);
let removedAssets = 0;
for (const id of madeAssets) {
  const r = await req(token, 'DELETE', `/assets/${id}`);
  if (r.status === 204) removedAssets++;
}
let removedTemplates = 0;
try {
  const env = Object.fromEntries(
    readFileSync(new URL('../../backend/.env', import.meta.url), 'utf8')
      .split('\n').filter((l) => l.includes('=') && !l.trim().startsWith('#'))
      .map((l) => { const i = l.indexOf('='); return [l.slice(0, i).trim(), l.slice(i + 1).trim().replace(/^["']|["']$/g, '')]; }),
  );
  // Atlas intermittently refuses a fresh TLS handshake here; a teardown that
  // loses that race leaves rows behind which then fail the *next* run against
  // the unique index and look like a product bug.
  let client;
  for (let attempt = 1; attempt <= 6; attempt++) {
    try {
      client = new MongoClient(env.MONGODB_URI, { serverSelectionTimeoutMS: 20000 });
      await client.connect();
      break;
    } catch (err) {
      client = undefined;
      if (attempt === 6) throw err;
      await new Promise((r) => setTimeout(r, 3000));
    }
  }
  if (!client) throw new Error('could not reach MongoDB for teardown');
  const db = client.db(env.MONGODB_DB_NAME);
  removedTemplates = (await db.collection('assettemplates').deleteMany({ name: /^QA / })).deletedCount;
  await db.collection('assets').deleteMany({ name: /^QA / });
  await client.close();
} catch (e) {
  console.log(`  template sweep failed: ${String(e).split('\n')[0]}`);
}
console.log(`  removed ${removedAssets}/${madeAssets.length} assets, ${removedTemplates} templates`);

await page.close();
await browser.close();

const sum = summarise();
mkdirSync(new URL('../results/', import.meta.url), { recursive: true });
writeFileSync(new URL('../results/registration-ui-results.json', import.meta.url),
  JSON.stringify({ ranAt: new Date().toISOString(), summary: sum, results }, null, 2));
console.log(`\nResults → Testing/results/registration-ui-results.json`);
