// Analytics & Reporting — scope boundary, aggregation integrity and persistence.
//
//   node Testing/harness/analytics-tests.mjs
//
// The isolation suite covers the record-serving modules. Analytics needs its own
// because it fails differently: every other module leaks by *returning a row*,
// which a scoped `find()` prevents. This one can leak by returning a **number** —
// a total, a facility bar, a category slice — computed over records the caller
// may not read. A count of somebody else's assets is a disclosure even though no
// document of theirs ever crosses the wire, and no row-level filter catches it.
//
// So there are two families of assertion here:
//
//   1. Boundary. A facility-scoped session must not be able to reach the wider
//      estate through the dashboard, a preview, a saved report, or an export —
//      including by naming a foreign facility outright, which must be refused
//      rather than quietly narrowed back to what they may see.
//
//   2. Integrity. The figures must equal what the underlying modules hold for
//      the same scope. This is the requirement that analytics keeps no second
//      copy of the estate: if the dashboard says 3 assets, the registry must
//      also say 3, for the same caller, at the same moment.
//
// Both run against live Atlas data as real signed-in users. Everything created
// is torn down at the end.

import { writeFileSync, mkdirSync } from 'node:fs';
import { API, login, req, mkAsset, teardown, onTeardown, guardAgainstCrash, record, results, summarise } from './lib.mjs';

const admin = await login();
console.log(`\nAuthenticated as super admin. Target ${API}\n${'─'.repeat(78)}`);

guardAgainstCrash(admin);

// ─────────────────────────────────────────────────────────────────────────────
// Fixtures
//
// A facility-scoped user homed on a node *inside* the tree but away from the
// estate's assets, plus one asset placed in their node. The asset matters: a
// probe that sees zero everywhere proves only that the query returned nothing,
// not that it returned the right nothing. With one asset of their own, the
// correct answer is a specific non-zero number that is still smaller than the
// organisation's — which a broken filter fails in either direction.
// ─────────────────────────────────────────────────────────────────────────────

const tree = (await req(admin, 'GET', '/scope/tree')).body?.data;
const facility = tree?.children?.[0];
const probeNode = facility?.children?.[0];

if (!facility || !probeNode) {
  console.error('This database has no facility/building to scope against — cannot run analytics tests.');
  process.exit(1);
}

/** Custodian strings unique to this run, used to trace records across a boundary. */
const STAMP = Date.now();
const PROBE_MARK = `QA-CUSTODIAN-INSIDE-${STAMP}`;
const FOREIGN_MARK = `QA-CUSTODIAN-OUTSIDE-${STAMP}`;

const PROBE = {
  name: 'Analytics Probe',
  email: `analytics.probe.${Date.now()}@example.test`,
  password: 'ProbeTest123',
  roleId: 'facility_manager',
  title: 'Facility Manager',
  homeScopeId: probeNode.id,
};

const mk = await req(admin, 'POST', '/users', PROBE);
const probeId = mk.body?.data?.id;
record({
  id: 'AN-000', feature: 'Provision a facility-scoped user for the analytics boundary tests', type: 'Setup',
  priority: 'P0', severity: 'Critical',
  expected: '201 and a user id',
  actual: `${mk.status} ${probeId ?? JSON.stringify(mk.body?.error ?? {})}`,
  pass: mk.status === 201 && Boolean(probeId),
});
if (!probeId) {
  console.error('Could not provision the probe user; aborting.');
  process.exit(1);
}

onTeardown(() => req(admin, 'DELETE', `/users/${probeId}`));

const probe = await login(PROBE.email, PROBE.password);

// One asset inside the probe's estate, so their correct total is 1 and not 0.
const probeAsset = await mkAsset(admin, {
  name: `QA Analytics Probe Asset ${Date.now()}`,
  category: 'Compute',
  custodian: PROBE_MARK,
  location: { id: probeNode.id, name: probeNode.name },
});
record({
  id: 'AN-001', feature: 'Place one asset inside the probe’s estate', type: 'Setup',
  priority: 'P0', severity: 'Critical',
  expected: '201 and an asset id',
  actual: `${probeAsset.status} ${probeAsset.body?.data?.id ?? ''}`,
  pass: probeAsset.status === 201 && Boolean(probeAsset.body?.data?.id),
});

// And one *outside* it, on the parent facility itself, carrying a custodian
// string that appears nowhere else in the database. Asserting on names of
// facilities cannot distinguish a leak from correct labelling — the probe's own
// rows roll up to the nearest facility above them, which is legitimately the
// parent's name. A marker on a record the probe may not read has no such
// ambiguity: if it reaches their export, the boundary failed.
const foreignAsset = await mkAsset(admin, {
  name: `QA Analytics Foreign Asset ${Date.now()}`,
  category: 'Compute',
  custodian: FOREIGN_MARK,
  location: { id: facility.id, name: facility.name },
});
record({
  id: 'AN-002', feature: 'Place a marked asset outside the probe’s estate', type: 'Setup',
  priority: 'P0', severity: 'Critical',
  expected: '201 and an asset id',
  actual: `${foreignAsset.status} ${foreignAsset.body?.data?.id ?? ''}`,
  pass: foreignAsset.status === 201 && Boolean(foreignAsset.body?.data?.id),
});

/** The KPI map from a dashboard payload. */
const kpis = (body) => Object.fromEntries((body?.data?.kpis ?? []).map((k) => [k.id, k.value]));

// ─────────────────────────────────────────────────────────────────────────────
// 1. Authentication
// ─────────────────────────────────────────────────────────────────────────────

for (const [id, method, path, payload] of [
  ['AN-AUTH-001', 'GET', '/analytics/dashboard', undefined],
  ['AN-AUTH-002', 'GET', '/analytics/catalogue', undefined],
  ['AN-AUTH-003', 'POST', '/analytics/preview', { definition: { source: 'assets', measures: ['count'] } }],
  ['AN-AUTH-004', 'GET', '/analytics/reports', undefined],
  ['AN-AUTH-005', 'GET', '/analytics/schedules', undefined],
]) {
  const r = await req(null, method, path, payload);
  record({
    id, feature: `Unauthenticated access is rejected (${method} ${path})`, type: 'Security',
    priority: 'P0', severity: 'Critical',
    expected: '401', actual: `${r.status}`, pass: r.status === 401,
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// 2. Scope boundary — the dashboard
// ─────────────────────────────────────────────────────────────────────────────

const adminDash = await req(admin, 'GET', '/analytics/dashboard');
const probeDash = await req(probe, 'GET', '/analytics/dashboard');
const adminTotal = kpis(adminDash.body)['total-assets'];
const probeTotal = kpis(probeDash.body)['total-assets'];

record({
  id: 'AN-SCOPE-001', feature: 'The dashboard resolves to the caller’s own estate, not the organisation', type: 'Security',
  priority: 'P0', severity: 'Critical',
  expected: `scope = ${probeNode.name} (the probe’s home node)`,
  actual: `scope = ${probeDash.body?.data?.scope?.name}`,
  pass: probeDash.status === 200 && probeDash.body?.data?.scope?.id === probeNode.id,
});

record({
  id: 'AN-SCOPE-002', feature: 'Dashboard totals do not count assets outside the caller’s estate', type: 'Security',
  priority: 'P0', severity: 'Critical',
  expected: `probe total (1, its own asset) < org total (${adminTotal})`,
  actual: `probe = ${probeTotal}, org = ${adminTotal}`,
  pass: typeof probeTotal === 'number' && probeTotal === 1 && adminTotal > probeTotal,
  evidence: 'A count is a disclosure even when no row is returned.',
});

record({
  id: 'AN-SCOPE-003', feature: 'The facility picker offers only the caller’s permitted subtree', type: 'Security',
  priority: 'P0', severity: 'Critical',
  expected: `no option outside ${probeNode.name}; the organisation root absent`,
  actual: JSON.stringify((probeDash.body?.data?.filterOptions?.facilities ?? []).map((f) => f.id)),
  pass:
    Array.isArray(probeDash.body?.data?.filterOptions?.facilities) &&
    !probeDash.body.data.filterOptions.facilities.some((f) => f.id === tree.id || f.id === facility.id),
});

// Note what this asserts and what it deliberately does not. A row here may
// legitimately carry the *name* of the facility above the caller: assets roll up
// to the nearest facility ancestor, and for a building-scoped user that ancestor
// is their own parent, which their pruned scope tree already shows them. What
// must never happen is the row carrying the parent's *figures*. So the test is
// on magnitudes — the breakdown may not account for a single asset the caller's
// own headline total does not.
{
  const rows = probeDash.body?.data?.assetsByFacility ?? [];
  const sum = rows.reduce((n, f) => n + (f.assets ?? 0), 0);
  record({
    id: 'AN-SCOPE-004', feature: 'The facility breakdown accounts for no asset outside the caller’s estate', type: 'Security',
    priority: 'P0', severity: 'Critical',
    expected: `sum(assetsByFacility) = the caller’s own total (${probeTotal}), not the organisation’s (${adminTotal})`,
    actual: `sum = ${sum} across ${JSON.stringify(rows.map((f) => [f.name, f.assets]))}`,
    pass: sum === probeTotal && sum < adminTotal,
  });
}

// Naming a foreign scope outright. Refused, not narrowed: answering a narrower
// question than the one asked would hide the boundary instead of enforcing it.
for (const [id, target, label] of [
  ['AN-ESC-001', tree.id, 'the organisation root'],
  ['AN-ESC-002', facility.id, 'the parent facility'],
]) {
  const r = await req(probe, 'GET', `/analytics/dashboard?facility=${target}`);
  record({
    id, feature: `Naming ${label} in the dashboard filter is refused`, type: 'Security',
    priority: 'P0', severity: 'Critical',
    expected: '403',
    actual: `${r.status} ${r.body?.data?.scope?.name ?? ''}`,
    pass: r.status === 403,
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// 2b. Multi-facility selection
//
// The selection may name several nodes and is then the union of their subtrees.
// Two things have to hold that do not arise for a single node: the union must
// not double-count anything sitting in two chosen branches, and it must not
// become a way to attach one foreign facility to a list of permitted ones.
// ─────────────────────────────────────────────────────────────────────────────

{
  const children = (facility.children ?? []).map((c) => c.id);
  const pair = children.slice(0, 2);

  if (pair.length === 2) {
    const [a, b] = pair;
    const one = kpis((await req(admin, 'GET', `/analytics/dashboard?facility=${a}`)).body)['total-assets'];
    const other = kpis((await req(admin, 'GET', `/analytics/dashboard?facility=${b}`)).body)['total-assets'];
    const both = await req(admin, 'GET', `/analytics/dashboard?facility=${a},${b}`);
    record({
      id: 'AN-MULTI-001', feature: 'Selecting two facilities aggregates the union of both', type: 'Functional',
      priority: 'P1', severity: 'High',
      expected: `${one} + ${other} = ${one + other}`,
      actual: `${kpis(both.body)['total-assets']} (scope "${both.body?.data?.scope?.name}")`,
      pass: both.status === 200 && kpis(both.body)['total-assets'] === one + other,
    });
  }

  // A node and its own parent. The overlapping subtree must be counted once —
  // a union of sets, not a sum of branches.
  const withParent = await req(admin, 'GET', `/analytics/dashboard?facility=${facility.id},${probeNode.id}`);
  const parentAlone = kpis((await req(admin, 'GET', `/analytics/dashboard?facility=${facility.id}`)).body)['total-assets'];
  record({
    id: 'AN-MULTI-002', feature: 'A selection overlapping itself does not double-count', type: 'Data integrity',
    priority: 'P0', severity: 'Critical',
    expected: `facility + one of its own children = the facility alone (${parentAlone})`,
    actual: `${kpis(withParent.body)['total-assets']}`,
    pass: withParent.status === 200 && kpis(withParent.body)['total-assets'] === parentAlone,
  });

  // Naming the root alongside narrower nodes selects the root, since the union
  // of the whole estate with part of it is the whole estate.
  const withRoot = await req(admin, 'GET', `/analytics/dashboard?facility=${tree.id},${probeNode.id}`);
  record({
    id: 'AN-MULTI-003', feature: 'Naming the root among several nodes selects the whole estate', type: 'Functional',
    priority: 'P2', severity: 'Medium',
    expected: `isRoot = true and total = ${adminTotal}`,
    actual: `isRoot = ${withRoot.body?.data?.scope?.isRoot}, total = ${kpis(withRoot.body)['total-assets']}`,
    pass: withRoot.body?.data?.scope?.isRoot === true && kpis(withRoot.body)['total-assets'] === adminTotal,
  });

  // The one that matters. A permitted node and a foreign one in the same list:
  // every member is checked, so the whole selection is refused rather than
  // quietly honouring the half that happens to be allowed.
  const smuggle = await req(probe, 'GET', `/analytics/dashboard?facility=${probeNode.id},${facility.id}`);
  record({
    id: 'AN-ESC-003', feature: 'A foreign facility cannot ride along in a multi-facility selection', type: 'Security',
    priority: 'P0', severity: 'Critical',
    expected: '403 — not a silent fallback to the permitted member',
    actual: `${smuggle.status}, total = ${kpis(smuggle.body)['total-assets'] ?? 'n/a'}`,
    pass: smuggle.status === 403,
    evidence: 'Every member of the union is checked, not just the first.',
  });

  const smugglePreview = await req(probe, 'POST', '/analytics/preview', {
    definition: { source: 'assets', dimensions: ['facility'], measures: ['count'], filters: [], visualization: 'table' },
    facility: `${probeNode.id},${facility.id}`,
  });
  record({
    id: 'AN-ESC-004', feature: 'The same smuggling attempt is refused by the report builder', type: 'Security',
    priority: 'P0', severity: 'Critical',
    expected: '403', actual: `${smugglePreview.status}`, pass: smugglePreview.status === 403,
  });

  // Shape, not existence: a selection carrying anything but ids is refused
  // before it reaches a lookup.
  const malformed = await req(admin, 'GET', '/analytics/dashboard?facility=FAC-1;DROP');
  record({
    id: 'AN-VAL-005', feature: 'A malformed facility selection is refused', type: 'Negative',
    priority: 'P1', severity: 'High',
    expected: '422', actual: `${malformed.status}`, pass: malformed.status === 422,
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// 3. Scope boundary — the report builder
// ─────────────────────────────────────────────────────────────────────────────

const byFacility = { source: 'assets', dimensions: ['facility'], measures: ['count', 'bookValue'], filters: [], visualization: 'table' };

{
  const r = await req(probe, 'POST', '/analytics/preview', { definition: byFacility });
  const rows = r.body?.data?.rows ?? [];
  record({
    id: 'AN-PREV-001', feature: 'A preview grouped by facility returns only the caller’s estate', type: 'Security',
    priority: 'P0', severity: 'Critical',
    expected: 'every row inside the probe’s estate; total count = 1',
    actual: `${r.status} rows=${JSON.stringify(rows)}`,
    pass: r.status === 200 && (r.body?.data?.totals?.count ?? -1) === 1,
  });
}

{
  const r = await req(probe, 'POST', '/analytics/preview', { definition: byFacility, facility: tree.id });
  record({
    id: 'AN-PREV-002', feature: 'Naming a foreign facility in a preview is refused', type: 'Security',
    priority: 'P0', severity: 'Critical',
    expected: '403', actual: `${r.status}`, pass: r.status === 403,
  });
}

{
  // A filter naming a foreign facility by value must not widen the result
  // either — the scope clause has to survive whatever the filter list says.
  const r = await req(probe, 'POST', '/analytics/preview', {
    definition: { ...byFacility, filters: [{ field: 'facility', op: 'eq', value: facility.name }] },
  });
  record({
    id: 'AN-PREV-003', feature: 'A filter naming a foreign facility cannot widen the result', type: 'Security',
    priority: 'P0', severity: 'Critical',
    expected: '200 with 0 rows (or 403) — never the foreign facility’s figures',
    actual: `${r.status} totals=${JSON.stringify(r.body?.data?.totals ?? {})}`,
    pass: r.status === 403 || (r.status === 200 && (r.body?.data?.totals?.count ?? 0) === 0),
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// 4. Scope boundary — saved reports, run and exported
//
// The report is authored by the super admin over the whole organisation. The
// question is whether it re-scopes to whoever *runs* it: a saved definition must
// be a question, not a stored answer, or the library becomes a way to hand out
// the estate.
// ─────────────────────────────────────────────────────────────────────────────

const savedReport = await req(admin, 'POST', '/analytics/reports', {
  name: `QA Analytics Probe Report ${Date.now()}`,
  description: 'Created by the analytics harness; deleted at teardown.',
  definition: byFacility,
});
const reportId = savedReport.body?.data?.id;
record({
  id: 'AN-RPT-001', feature: 'Create a saved report', type: 'Functional',
  priority: 'P0', severity: 'Critical',
  expected: '201 and a report id',
  actual: `${savedReport.status} ${reportId ?? JSON.stringify(savedReport.body?.error ?? {})}`,
  pass: savedReport.status === 201 && Boolean(reportId),
});

if (reportId) {
  {
    const r = await req(admin, 'GET', `/analytics/reports/${reportId}`);
    record({
      id: 'AN-RPT-002', feature: 'The saved report is readable back from the database', type: 'Functional',
      priority: 'P0', severity: 'Critical',
      expected: `200 and id ${reportId}`,
      actual: `${r.status} ${r.body?.data?.id}`,
      pass: r.status === 200 && r.body?.data?.id === reportId,
    });
  }

  {
    const renamed = `QA Analytics Renamed ${Date.now()}`;
    await req(admin, 'PATCH', `/analytics/reports/${reportId}`, { name: renamed });
    const after = await req(admin, 'GET', `/analytics/reports/${reportId}`);
    record({
      id: 'AN-RPT-003', feature: 'A report edit persists (verified by re-reading the record)', type: 'Functional',
      priority: 'P1', severity: 'High',
      expected: `name = ${renamed}`,
      actual: `name = ${after.body?.data?.name}`,
      pass: after.body?.data?.name === renamed,
    });
  }

  {
    const adminRun = await req(admin, 'POST', `/analytics/reports/${reportId}/run`, {});
    const probeRun = await req(probe, 'POST', `/analytics/reports/${reportId}/run`, {});
    const adminCount = adminRun.body?.data?.result?.totals?.count ?? adminRun.body?.data?.totals?.count;
    const probeCount = probeRun.body?.data?.result?.totals?.count ?? probeRun.body?.data?.totals?.count;
    record({
      id: 'AN-RUN-001', feature: 'A report authored org-wide re-scopes to whoever runs it', type: 'Security',
      priority: 'P0', severity: 'Critical',
      expected: `probe sees 1, admin sees the whole estate (${adminCount})`,
      actual: `probe = ${probeCount}, admin = ${adminCount}`,
      pass: probeCount === 1 && adminCount > probeCount,
      evidence: 'A saved definition must be a question, not a stored answer.',
    });
  }

  {
    const r = await req(probe, 'POST', `/analytics/reports/${reportId}/run`, { facility: tree.id });
    record({
      id: 'AN-RUN-002', feature: 'Naming a foreign facility when running a saved report is refused', type: 'Security',
      priority: 'P0', severity: 'Critical',
      expected: '403', actual: `${r.status}`, pass: r.status === 403,
    });
  }

  {
    // The export path is a separate execution with the row cap lifted, so it is
    // a separate opportunity to forget the boundary. Assert on the bytes, using
    // a report grouped by custodian so the marker planted outside the probe's
    // estate would have to appear verbatim in the file if it leaked.
    const byCustodian = await req(admin, 'POST', '/analytics/reports', {
      name: `QA Analytics Custodian Report ${STAMP}`,
      description: 'Created by the analytics harness; deleted at teardown.',
      definition: { source: 'assets', dimensions: ['custodian'], measures: ['count'], filters: [], visualization: 'table' },
    });
    const custodianReportId = byCustodian.body?.data?.id;

    const mine = await req(admin, 'GET', `/analytics/reports/${custodianReportId}/export?format=csv`);
    const theirs = await req(probe, 'GET', `/analytics/reports/${custodianReportId}/export?format=csv`);

    record({
      id: 'AN-EXP-001', feature: 'An export carries no record from outside the caller’s estate', type: 'Security',
      priority: 'P0', severity: 'Critical',
      expected: 'the admin’s file holds both markers; the probe’s holds only its own',
      actual:
        `admin: inside=${mine.text?.includes(PROBE_MARK)} outside=${mine.text?.includes(FOREIGN_MARK)} · ` +
        `probe: inside=${theirs.text?.includes(PROBE_MARK)} outside=${theirs.text?.includes(FOREIGN_MARK)}`,
      pass:
        mine.status === 200 && theirs.status === 200 &&
        mine.text.includes(PROBE_MARK) && mine.text.includes(FOREIGN_MARK) &&
        theirs.text.includes(PROBE_MARK) && !theirs.text.includes(FOREIGN_MARK),
      evidence: (theirs.text ?? '').slice(0, 400),
    });

    if (custodianReportId) await req(admin, 'DELETE', `/analytics/reports/${custodianReportId}`);
  }

  {
    const r = await req(probe, 'GET', `/analytics/reports/${reportId}/export?format=csv&facility=${tree.id}`);
    record({
      id: 'AN-EXP-002', feature: 'Naming a foreign facility in an export is refused', type: 'Security',
      priority: 'P0', severity: 'Critical',
      expected: '403', actual: `${r.status}`, pass: r.status === 403,
    });
  }

  {
    const r = await req(admin, 'GET', `/analytics/reports/${reportId}/export?format=xlsx`);
    const ct = r.headers?.get('content-type') ?? '';
    record({
      id: 'AN-EXP-003', feature: 'An Excel export returns a real spreadsheet, not a renamed CSV', type: 'Functional',
      priority: 'P1', severity: 'High',
      expected: 'content-type spreadsheetml.sheet and a PK zip header',
      actual: `${r.status} ${ct.slice(0, 60)} first bytes=${JSON.stringify((r.text ?? '').slice(0, 2))}`,
      pass: r.status === 200 && ct.includes('spreadsheetml.sheet') && (r.text ?? '').startsWith('PK'),
    });
  }

  {
    const r = await req(admin, 'GET', `/analytics/reports/${reportId}/export?format=pdf`);
    record({
      id: 'AN-EXP-004', feature: 'A PDF export returns a real PDF', type: 'Functional',
      priority: 'P2', severity: 'Medium',
      expected: 'content-type application/pdf and a %PDF header',
      actual: `${r.status} first bytes=${JSON.stringify((r.text ?? '').slice(0, 5))}`,
      pass: r.status === 200 && (r.text ?? '').startsWith('%PDF'),
    });
  }

  // ───────────────────────────────────────────────────────────────────────────
  // 5. Schedules
  // ───────────────────────────────────────────────────────────────────────────

  let scheduleId;
  {
    const r = await req(admin, 'POST', '/analytics/schedules', {
      reportId,
      frequency: 'Weekly',
      format: 'csv',
      recipients: ['qa.harness@example.test'],
      startDate: new Date(Date.now() + 86_400_000).toISOString().slice(0, 10),
      enabled: true,
    });
    scheduleId = r.body?.data?.id;
    record({
      id: 'AN-SCH-001', feature: 'Create a schedule against a saved report', type: 'Functional',
      priority: 'P1', severity: 'High',
      expected: '201, an id and a computed nextRun',
      actual: `${r.status} ${scheduleId ?? ''} nextRun=${r.body?.data?.nextRun ?? 'none'}`,
      pass: r.status === 201 && Boolean(scheduleId) && Boolean(r.body?.data?.nextRun),
    });
  }

  if (scheduleId) {
    {
      const r = await req(admin, 'GET', '/analytics/schedules');
      const row = (r.body?.data ?? []).find((s) => s.id === scheduleId);
      record({
        id: 'AN-SCH-002', feature: 'The schedule is readable back and reports no delivery it did not make', type: 'Functional',
        priority: 'P1', severity: 'High',
        expected: 'the row is listed and lastRun is absent (no fabricated history)',
        actual: `listed = ${Boolean(row)}, lastRun = ${row?.lastRun ?? 'absent'}`,
        pass: Boolean(row) && !row.lastRun,
      });
    }

    {
      await req(admin, 'PATCH', `/analytics/schedules/${scheduleId}`, { enabled: false });
      const after = await req(admin, 'GET', '/analytics/schedules');
      const row = (after.body?.data ?? []).find((s) => s.id === scheduleId);
      record({
        id: 'AN-SCH-003', feature: 'Pausing a schedule persists (verified by re-reading)', type: 'Functional',
        priority: 'P1', severity: 'High',
        expected: 'enabled = false',
        actual: `enabled = ${row?.enabled}`,
        pass: row?.enabled === false,
      });
    }

    {
      const del = await req(admin, 'DELETE', `/analytics/schedules/${scheduleId}`);
      const after = await req(admin, 'GET', '/analytics/schedules');
      const gone = !(after.body?.data ?? []).some((s) => s.id === scheduleId);
      record({
        id: 'AN-SCH-004', feature: 'Deleting a schedule persists', type: 'Functional',
        priority: 'P1', severity: 'High',
        expected: '204/200 and the row is gone on re-read',
        actual: `${del.status}, gone = ${gone}`,
        pass: (del.status === 204 || del.status === 200) && gone,
      });
    }
  }

  // A report with a live schedule must not vanish and leave the schedule
  // pointing at nothing — the delete either cascades or is refused.
  {
    const del = await req(admin, 'DELETE', `/analytics/reports/${reportId}`);
    const after = await req(admin, 'GET', `/analytics/reports/${reportId}`);
    record({
      id: 'AN-RPT-004', feature: 'Deleting a report persists', type: 'Functional',
      priority: 'P0', severity: 'Critical',
      expected: '204/200 and 404 on re-read',
      actual: `${del.status}, re-read ${after.status}`,
      pass: (del.status === 204 || del.status === 200) && after.status === 404,
    });
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// 6. Aggregation integrity
//
// Analytics must be a view over the modules, not a copy of them. Each of these
// compares a dashboard figure with what the owning module reports for the same
// caller and the same scope; a mismatch means a second source of truth exists.
// ─────────────────────────────────────────────────────────────────────────────

{
  const dash = await req(admin, 'GET', '/analytics/dashboard');
  const registry = await req(admin, 'GET', '/assets?limit=1');
  const dashTotal = kpis(dash.body)['total-assets'];
  const registryTotal = registry.body?.meta?.total;
  record({
    id: 'AN-INT-001', feature: 'Total assets equals the registry’s own count for the same scope', type: 'Data integrity',
    priority: 'P0', severity: 'Critical',
    expected: `dashboard total = registry total (${registryTotal})`,
    actual: `dashboard = ${dashTotal}, registry = ${registryTotal}`,
    pass: typeof dashTotal === 'number' && dashTotal === registryTotal,
    evidence: 'Proves the dashboard aggregates the registry rather than storing its own copy.',
  });

  const byFacilitySum = (dash.body?.data?.assetsByFacility ?? []).reduce((n, f) => n + (f.assets ?? 0), 0);
  record({
    id: 'AN-INT-002', feature: 'The facility breakdown sums to the headline total', type: 'Data integrity',
    priority: 'P0', severity: 'Critical',
    expected: `sum(assetsByFacility) = ${dashTotal}`,
    actual: `sum = ${byFacilitySum}`,
    pass: byFacilitySum === dashTotal,
  });

  const byStatusSum = (dash.body?.data?.assetsByStatus ?? []).reduce((n, s) => n + (s.value ?? 0), 0);
  record({
    id: 'AN-INT-003', feature: 'The status breakdown sums to the headline total', type: 'Data integrity',
    priority: 'P0', severity: 'Critical',
    expected: `sum(assetsByStatus) = ${dashTotal}`,
    actual: `sum = ${byStatusSum}`,
    pass: byStatusSum === dashTotal,
  });

  const byCategorySum = (dash.body?.data?.assetsByCategory ?? []).reduce((n, c) => n + (c.value ?? 0), 0);
  record({
    id: 'AN-INT-004', feature: 'The category breakdown sums to the headline total', type: 'Data integrity',
    priority: 'P0', severity: 'Critical',
    expected: `sum(assetsByCategory) = ${dashTotal}`,
    actual: `sum = ${byCategorySum}`,
    pass: byCategorySum === dashTotal,
  });
}

{
  // A filter must narrow the aggregate the same way it narrows the registry.
  const dash = await req(admin, 'GET', '/analytics/dashboard?category=Compute');
  const registry = await req(admin, 'GET', '/assets?category=Compute&limit=1');
  const dashTotal = kpis(dash.body)['total-assets'];
  record({
    id: 'AN-INT-005', feature: 'A category filter narrows the aggregate exactly as it narrows the registry', type: 'Data integrity',
    priority: 'P0', severity: 'Critical',
    expected: `dashboard = registry (${registry.body?.meta?.total})`,
    actual: `dashboard = ${dashTotal}, registry = ${registry.body?.meta?.total}`,
    pass: typeof dashTotal === 'number' && dashTotal === registry.body?.meta?.total,
  });
}

{
  // The builder and the dashboard must agree; they are two entry points to one
  // engine, and a disagreement means they are not.
  const dash = await req(admin, 'GET', '/analytics/dashboard');
  const preview = await req(admin, 'POST', '/analytics/preview', {
    definition: { source: 'assets', dimensions: [], measures: ['count'], filters: [], visualization: 'table' },
  });
  const dashTotal = kpis(dash.body)['total-assets'];
  const previewTotal = preview.body?.data?.totals?.count;
  record({
    id: 'AN-INT-006', feature: 'The report builder and the dashboard agree on the same figure', type: 'Data integrity',
    priority: 'P0', severity: 'Critical',
    expected: `preview count = dashboard total (${dashTotal})`,
    actual: `preview = ${previewTotal}, dashboard = ${dashTotal}`,
    pass: previewTotal === dashTotal,
  });
}

{
  // The estate changes → the aggregate changes, with no rebuild step in
  // between. This is the whole claim of the module, so it is asserted directly.
  const before = kpis((await req(admin, 'GET', '/analytics/dashboard')).body)['total-assets'];
  const extra = await mkAsset(admin, {
    name: `QA Analytics Delta Asset ${Date.now()}`,
    category: 'Compute',
    location: { id: probeNode.id, name: probeNode.name },
  });
  const after = kpis((await req(admin, 'GET', '/analytics/dashboard')).body)['total-assets'];
  record({
    id: 'AN-INT-007', feature: 'Registering an asset moves the dashboard total immediately', type: 'Data integrity',
    priority: 'P0', severity: 'Critical',
    expected: `${before} → ${before + 1} with no rebuild`,
    actual: `${before} → ${after}`,
    pass: extra.status === 201 && after === before + 1,
  });

  const assetId = extra.body?.data?.id;
  if (assetId) {
    const beforeStatus = (await req(admin, 'GET', '/analytics/dashboard')).body;
    const wasUnderMaintenance = kpis(beforeStatus)['under-maintenance'];
    await req(admin, 'PATCH', `/assets/${assetId}`, { status: 'Maintenance' });
    const afterStatus = (await req(admin, 'GET', '/analytics/dashboard')).body;
    record({
      id: 'AN-INT-008', feature: 'Changing an asset’s status moves the maintenance KPI immediately', type: 'Data integrity',
      priority: 'P0', severity: 'Critical',
      expected: `under-maintenance ${wasUnderMaintenance} → ${wasUnderMaintenance + 1}`,
      actual: `${wasUnderMaintenance} → ${kpis(afterStatus)['under-maintenance']}`,
      pass: kpis(afterStatus)['under-maintenance'] === wasUnderMaintenance + 1,
    });
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// 7. Input handling — a rejected definition must be rejected, not guessed at
// ─────────────────────────────────────────────────────────────────────────────

for (const [id, definition, why] of [
  ['AN-VAL-001', { source: 'assets', dimensions: [], measures: [], filters: [] }, 'no measure'],
  ['AN-VAL-002', { source: 'not_a_source', dimensions: [], measures: ['count'], filters: [] }, 'unknown source'],
  ['AN-VAL-003', { source: 'assets', dimensions: ['nonexistent_field'], measures: ['count'], filters: [] }, 'unknown dimension'],
  ['AN-VAL-004', { source: 'assets', dimensions: [], measures: ['nonexistent_measure'], filters: [] }, 'unknown measure'],
]) {
  const r = await req(admin, 'POST', '/analytics/preview', { definition });
  record({
    id, feature: `A definition with ${why} is refused with an error, not silently coerced`, type: 'Negative',
    priority: 'P1', severity: 'High',
    expected: '400 or 422',
    actual: `${r.status} ${JSON.stringify(r.body?.error?.message ?? r.body?.data ?? {}).slice(0, 90)}`,
    pass: r.status === 400 || r.status === 422,
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// Teardown
// ─────────────────────────────────────────────────────────────────────────────

console.log(`\n${'─'.repeat(78)}\nTearing down…`);
// The probe user is removed by the cleanup registered at provisioning time.
const td = await teardown(admin);
console.log(
  `  assets removed ${td.removed.length}` +
    (td.stuck.length ? `, STUCK ${JSON.stringify(td.stuck)}` : '') +
    `, probe user removed = ${!td.stuck.some((s) => s.cleanup)}`,
);

const sum = summarise();
mkdirSync(new URL('../results/', import.meta.url), { recursive: true });
writeFileSync(
  new URL('../results/analytics-results.json', import.meta.url),
  JSON.stringify({ ranAt: new Date().toISOString(), summary: sum, teardown: td, results }, null, 2),
);
console.log('\nResults → Testing/results/analytics-results.json');

process.exit(results.some((r) => !r.pass) ? 1 : 0);
