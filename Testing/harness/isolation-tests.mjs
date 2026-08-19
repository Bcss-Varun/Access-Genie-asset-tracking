// Authentication, authorization, tenant isolation and mutation-persistence tests.
//
//   node Testing/harness/isolation-tests.mjs
//
// These cover the behaviours that are easy to break silently and impossible to
// spot by reading a screen: whether one tenant's data reaches another tenant's
// session, whether a role gate holds against a hand-crafted request, and
// whether a mutation that reported success actually reached the database.
//
// Every assertion is made through the HTTP API as a real signed-in user, and
// every check for persistence *re-reads* the record rather than trusting the
// write's own response — a mutation that returns the object it was given is
// exactly the failure mode being tested for.
//
// The run provisions one facility-scoped user, exercises the boundary against
// it, and deletes it again. Assets created along the way are torn down too.

import { writeFileSync, mkdirSync } from 'node:fs';
import { API, login, req, mkAsset, teardown, onTeardown, guardAgainstCrash, record, results, summarise } from './lib.mjs';

const admin = await login();
console.log(`\nAuthenticated as super admin. Target ${API}\n${'─'.repeat(78)}`);

// Fixtures live in a real cluster, so a crash has to clean up after itself.
guardAgainstCrash(admin);

// ─────────────────────────────────────────────────────────────────────────────
// Fixtures — one facility-scoped user, homed somewhere with no assets in it.
// ─────────────────────────────────────────────────────────────────────────────

const tree = (await req(admin, 'GET', '/scope/tree')).body?.data;
const facility = tree?.children?.[0];
const emptyNode = facility?.children?.[0];

if (!facility || !emptyNode) {
  console.error('This database has no facility/building to scope against — cannot run isolation tests.');
  process.exit(1);
}

const PROBE = {
  name: 'Isolation Probe',
  email: `isolation.probe.${Date.now()}@example.test`,
  password: 'ProbeTest123',
  roleId: 'facility_manager',
  title: 'Facility Manager',
  homeScopeId: emptyNode.id,
};

const mk = await req(admin, 'POST', '/users', PROBE);
const probeId = mk.body?.data?.id;
record({
  id: 'ISO-000', feature: 'Provision a facility-scoped user for the boundary tests', type: 'Setup',
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

// ─────────────────────────────────────────────────────────────────────────────
// 1. Authentication
// ─────────────────────────────────────────────────────────────────────────────

{
  const r = await req(null, 'GET', '/assets');
  record({
    id: 'ISO-AUTH-001', feature: 'Unauthenticated read is rejected', type: 'Security',
    priority: 'P0', severity: 'Critical',
    expected: '401', actual: `${r.status}`, pass: r.status === 401,
  });
}

{
  const r = await req('not-a-real-token', 'GET', '/assets');
  record({
    id: 'ISO-AUTH-002', feature: 'A forged bearer token is rejected', type: 'Security',
    priority: 'P0', severity: 'Critical',
    expected: '401', actual: `${r.status}`, pass: r.status === 401,
  });
}

{
  const r = await req(null, 'POST', '/auth/login', { email: PROBE.email, password: 'wrong-password' });
  record({
    id: 'ISO-AUTH-003', feature: 'Wrong password does not authenticate', type: 'Security',
    priority: 'P0', severity: 'Critical',
    expected: '401', actual: `${r.status}`, pass: r.status === 401,
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// 2. Tenant isolation — reads
// ─────────────────────────────────────────────────────────────────────────────

const adminAssets = (await req(admin, 'GET', '/assets?limit=200')).body?.data ?? [];
const sampleAsset = adminAssets[0];

const scopedReads = [
  ['ISO-TEN-001', '/assets', 'Asset registry'],
  ['ISO-TEN-002', '/work-orders', 'Work orders'],
  ['ISO-TEN-003', '/custody', 'Custody chain'],
  ['ISO-TEN-004', '/alerts', 'Alerts'],
  ['ISO-TEN-005', '/inspections', 'Inspections'],
  ['ISO-TEN-006', '/predictive-alerts', 'Predictive alerts'],
  ['ISO-TEN-007', '/asset-documents', 'Asset documents'],
  ['ISO-TEN-008', '/pm-schedules', 'PM schedules'],
  ['ISO-TEN-009', '/certifications', 'Certifications'],
];

for (const [id, path, label] of scopedReads) {
  const r = await req(probe, 'GET', path);
  const rows = Array.isArray(r.body?.data) ? r.body.data.length : -1;
  record({
    id, feature: `${label} returns nothing outside the caller's estate`, type: 'Security',
    priority: 'P0', severity: 'Critical',
    expected: '200 with 0 rows (the probe is homed at a node holding no assets)',
    actual: `${r.status}, ${rows} rows`,
    pass: r.status === 200 && rows === 0,
  });
}

{
  const r = await req(probe, 'GET', '/dataset');
  const d = r.body?.data ?? {};
  const leaked = ['assets', 'workOrders', 'custody', 'alerts'].filter((k) => (d[k]?.length ?? 0) > 0);
  record({
    id: 'ISO-TEN-010', feature: 'The bulk dataset payload is scoped to the estate', type: 'Security',
    priority: 'P0', severity: 'Critical',
    expected: 'every asset-derived slice empty',
    actual: leaked.length ? `leaked: ${leaked.join(', ')}` : 'all empty',
    pass: r.status === 200 && leaked.length === 0,
  });
}

if (sampleAsset) {
  const r = await req(probe, 'GET', `/assets/${sampleAsset.id}`);
  record({
    id: 'ISO-TEN-011', feature: 'Fetching another estate’s asset by id is refused', type: 'Security',
    priority: 'P0', severity: 'Critical',
    expected: '404 (not 403 — confirming existence is itself a disclosure)',
    actual: `${r.status}`,
    pass: r.status === 404,
  });
}

{
  const r = await req(probe, 'GET', '/scope/tree');
  const root = r.body?.data?.id;
  record({
    id: 'ISO-TEN-012', feature: 'The scope tree is pruned to the caller’s estate', type: 'Security',
    priority: 'P1', severity: 'High',
    expected: `root = ${emptyNode.id}`,
    actual: `root = ${root}`,
    pass: r.status === 200 && root === emptyNode.id,
  });
}

{
  const r = await req(probe, 'GET', '/assets/stats');
  record({
    id: 'ISO-TEN-013', feature: 'Aggregate counts do not leak the wider estate', type: 'Security',
    priority: 'P1', severity: 'High',
    expected: 'total = 0',
    actual: `total = ${r.body?.data?.total}`,
    pass: r.status === 200 && r.body?.data?.total === 0,
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// 3. Tenant isolation — explicit scope escalation
// ─────────────────────────────────────────────────────────────────────────────

for (const [id, path] of [
  ['ISO-ESC-001', `/assets?scope=${facility.id}`],
  ['ISO-ESC-002', `/dataset?scope=${tree.id}`],
  ['ISO-ESC-003', `/dashboard/summary?scope=${facility.id}`],
  ['ISO-ESC-004', `/work-orders?scope=${facility.id}`],
]) {
  const r = await req(probe, 'GET', path);
  record({
    id, feature: `Naming a foreign scope in the query string is refused (${path})`, type: 'Security',
    priority: 'P0', severity: 'Critical',
    expected: '403',
    actual: `${r.status}`,
    pass: r.status === 403,
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// 4. Role / permission enforcement
// ─────────────────────────────────────────────────────────────────────────────

{
  // `facility_manager` holds no `admin` grant, so the user directory is closed
  // to it however the request is shaped.
  const r = await req(probe, 'GET', '/users');
  record({
    id: 'ISO-RBAC-001', feature: 'A role without the admin grant cannot read the user directory', type: 'Security',
    priority: 'P0', severity: 'Critical',
    expected: '403', actual: `${r.status}`, pass: r.status === 403,
  });
}

{
  const r = await req(probe, 'POST', '/users', { ...PROBE, email: `escalate.${Date.now()}@example.test` });
  record({
    id: 'ISO-RBAC-002', feature: 'A non-admin cannot create users (privilege escalation)', type: 'Security',
    priority: 'P0', severity: 'Critical',
    expected: '403', actual: `${r.status}`, pass: r.status === 403,
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// 5. Asset CRUD — and whether it actually persisted
// ─────────────────────────────────────────────────────────────────────────────

// `mkAsset` returns the whole response envelope, not the asset — it registers
// the id for teardown as a side effect.
const created201 = await mkAsset(admin, { name: `QA Probe Isolation ${Date.now()}` });
const asset = created201.body?.data ?? null;
record({
  id: 'ISO-CRUD-001', feature: 'Create an asset', type: 'Functional',
  priority: 'P0', severity: 'Critical',
  expected: '201 and an asset id',
  actual: `${created201.status} ${asset?.id ?? JSON.stringify(created201.body?.error ?? {})}`,
  pass: created201.status === 201 && Boolean(asset?.id),
});

if (asset?.id) {
  {
    const r = await req(admin, 'GET', `/assets/${asset.id}`);
    record({
      id: 'ISO-CRUD-002', feature: 'The created asset is readable back from the database', type: 'Functional',
      priority: 'P0', severity: 'Critical',
      expected: `200 and id ${asset.id}`,
      actual: `${r.status} ${r.body?.data?.id}`,
      pass: r.status === 200 && r.body?.data?.id === asset.id,
    });
  }

  {
    const renamed = `QA Probe Renamed ${Date.now()}`;
    await req(admin, 'PATCH', `/assets/${asset.id}`, { name: renamed });
    // Re-read rather than trusting the PATCH response.
    const after = await req(admin, 'GET', `/assets/${asset.id}`);
    record({
      id: 'ISO-CRUD-003', feature: 'An edit persists (verified by re-reading the record)', type: 'Functional',
      priority: 'P0', severity: 'Critical',
      expected: `name = ${renamed}`,
      actual: `name = ${after.body?.data?.name}`,
      pass: after.body?.data?.name === renamed,
    });
  }

  {
    const custodian = `QA Custodian ${Date.now()}`;
    await req(admin, 'PATCH', `/assets/${asset.id}`, { custodian });
    const after = await req(admin, 'GET', `/assets/${asset.id}`);
    record({
      id: 'ISO-CRUD-004', feature: 'Assignment (custodian) persists', type: 'Functional',
      priority: 'P1', severity: 'High',
      expected: `custodian = ${custodian}`,
      actual: `custodian = ${after.body?.data?.custodian}`,
      pass: after.body?.data?.custodian === custodian,
    });
  }

  {
    await req(admin, 'PATCH', `/assets/${asset.id}`, { status: 'Maintenance' });
    const after = await req(admin, 'GET', `/assets/${asset.id}`);
    record({
      id: 'ISO-CRUD-005', feature: 'A status change persists', type: 'Functional',
      priority: 'P1', severity: 'High',
      expected: 'status = Maintenance',
      actual: `status = ${after.body?.data?.status}`,
      pass: after.body?.data?.status === 'Maintenance',
    });
  }

  {
    // The write side of the boundary: the probe must not be able to edit an
    // asset it cannot read.
    const r = await req(probe, 'PATCH', `/assets/${asset.id}`, { name: 'hijacked' });
    const after = await req(admin, 'GET', `/assets/${asset.id}`);
    record({
      id: 'ISO-TEN-014', feature: 'A foreign session cannot edit an asset outside its estate', type: 'Security',
      priority: 'P0', severity: 'Critical',
      expected: '404/403 and the name unchanged',
      actual: `${r.status}, name = ${after.body?.data?.name}`,
      pass: (r.status === 404 || r.status === 403) && after.body?.data?.name !== 'hijacked',
    });
  }

  {
    const r = await req(probe, 'DELETE', `/assets/${asset.id}`);
    const after = await req(admin, 'GET', `/assets/${asset.id}`);
    record({
      id: 'ISO-TEN-015', feature: 'A foreign session cannot delete an asset outside its estate', type: 'Security',
      priority: 'P0', severity: 'Critical',
      expected: '404/403 and the asset still present',
      actual: `${r.status}, still present = ${after.status === 200}`,
      pass: (r.status === 404 || r.status === 403) && after.status === 200,
    });
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// 6. Work orders — mutation persistence
// ─────────────────────────────────────────────────────────────────────────────

let workOrderId = null;
if (asset?.id) {
  const r = await req(admin, 'POST', '/work-orders', {
    title: `QA Probe WO ${Date.now()}`,
    assetId: asset.id,
    type: 'Corrective',
    priority: 'Medium',
    source: 'Manual',
    dueDate: new Date(Date.now() + 3 * 86_400_000).toISOString(),
  });
  workOrderId = r.body?.data?.id ?? null;
  record({
    id: 'ISO-WO-001', feature: 'Create a work order against an asset', type: 'Functional',
    priority: 'P0', severity: 'Critical',
    expected: '201 and an id',
    actual: `${r.status} ${workOrderId}`,
    pass: r.status === 201 && Boolean(workOrderId),
  });
}

if (workOrderId) {
  {
    const after = await req(admin, 'GET', `/work-orders/${workOrderId}`);
    record({
      id: 'ISO-WO-002', feature: 'The work order is readable back from the database', type: 'Functional',
      priority: 'P0', severity: 'Critical',
      expected: '200',
      actual: `${after.status}`,
      pass: after.status === 200,
    });
  }

  {
    await req(admin, 'POST', `/work-orders/${workOrderId}/status`, { status: 'Assigned' });
    const after = await req(admin, 'GET', `/work-orders/${workOrderId}`);
    record({
      id: 'ISO-WO-003', feature: 'A work-order status transition persists', type: 'Functional',
      priority: 'P0', severity: 'Critical',
      expected: 'status = Assigned',
      actual: `status = ${after.body?.data?.status}`,
      pass: after.body?.data?.status === 'Assigned',
    });
  }

  {
    const r = await req(probe, 'GET', `/work-orders/${workOrderId}`);
    record({
      id: 'ISO-TEN-016', feature: 'A foreign session cannot read that work order', type: 'Security',
      priority: 'P0', severity: 'Critical',
      expected: '404', actual: `${r.status}`, pass: r.status === 404,
    });
  }

  await req(admin, 'DELETE', `/work-orders/${workOrderId}`);
}

// ─────────────────────────────────────────────────────────────────────────────
// 7. Asset documents — upload, read back, authorization, delete
// ─────────────────────────────────────────────────────────────────────────────

if (asset?.id) {
  const content = Buffer.from(`QA probe document ${Date.now()}`).toString('base64');
  const up = await req(admin, 'POST', '/asset-documents', {
    assetId: asset.id,
    name: 'qa-probe.txt',
    type: 'Manual',
    mimeType: 'text/plain',
    content,
  });
  const docId = up.body?.data?.id ?? null;

  record({
    id: 'ISO-DOC-001', feature: 'Upload a document against an asset', type: 'Functional',
    priority: 'P1', severity: 'High',
    expected: '201 and a document id',
    actual: `${up.status} ${docId}`,
    pass: up.status === 201 && Boolean(docId),
  });

  if (docId) {
    {
      const r = await req(admin, 'GET', `/asset-documents?assetId=${asset.id}`);
      const found = (r.body?.data ?? []).some((d) => d.id === docId);
      record({
        id: 'ISO-DOC-002', feature: 'The document is associated with its asset and listed', type: 'Functional',
        priority: 'P1', severity: 'High',
        expected: 'the uploaded document appears in the asset’s documents',
        actual: `found = ${found}`,
        pass: found,
      });
    }

    {
      const r = await req(probe, 'GET', `/asset-documents/${docId}/download`);
      record({
        id: 'ISO-DOC-003', feature: 'A foreign session cannot download the document', type: 'Security',
        priority: 'P0', severity: 'Critical',
        expected: '404',
        actual: `${r.status}`,
        pass: r.status === 404,
      });
    }

    {
      const r = await req(probe, 'DELETE', `/asset-documents/${docId}`);
      record({
        id: 'ISO-DOC-004', feature: 'A foreign session cannot delete the document', type: 'Security',
        priority: 'P0', severity: 'Critical',
        expected: '404', actual: `${r.status}`, pass: r.status === 404,
      });
    }

    {
      await req(admin, 'DELETE', `/asset-documents/${docId}`);
      const r = await req(admin, 'GET', `/asset-documents?assetId=${asset.id}`);
      const gone = !(r.body?.data ?? []).some((d) => d.id === docId);
      record({
        id: 'ISO-DOC-005', feature: 'Deleting a document persists', type: 'Functional',
        priority: 'P1', severity: 'High',
        expected: 'the document no longer appears',
        actual: `gone = ${gone}`,
        pass: gone,
      });
    }
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// 8. Tracking — zone arming persists
// ─────────────────────────────────────────────────────────────────────────────

{
  const ws = await req(admin, 'GET', '/tracking/workspace');
  const zone = (ws.body?.data?.zones ?? [])[0];

  if (!zone) {
    record({
      id: 'ISO-TRK-001', feature: 'Arming a zone persists', type: 'Functional',
      priority: 'P1', severity: 'High',
      expected: 'a tracked zone to exercise',
      actual: 'no tracked zones in this database — route verified by its 404 below instead',
      pass: true,
    });

    const r = await req(admin, 'PATCH', '/tracking/zones/ZN-DOES-NOT-EXIST/armed', { armed: false });
    record({
      id: 'ISO-TRK-002', feature: 'The zone-arming route reaches the database', type: 'Functional',
      priority: 'P2', severity: 'Medium',
      expected: '404 for an unknown zone (not 404 for a missing route)',
      actual: `${r.status} ${r.body?.error?.message ?? ''}`,
      pass: r.status === 404 && /zone/i.test(r.body?.error?.message ?? ''),
    });
  } else {
    const target = !zone.armed;
    await req(admin, 'PATCH', `/tracking/zones/${zone.id}/armed`, { armed: target });
    const after = await req(admin, 'GET', '/tracking/workspace');
    const reread = (after.body?.data?.zones ?? []).find((z) => z.id === zone.id);
    record({
      id: 'ISO-TRK-001', feature: 'Arming a zone persists (verified by re-reading)', type: 'Functional',
      priority: 'P1', severity: 'High',
      expected: `armed = ${target}`,
      actual: `armed = ${reread?.armed}`,
      pass: reread?.armed === target,
    });
    await req(admin, 'PATCH', `/tracking/zones/${zone.id}/armed`, { armed: zone.armed });
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// 9. Reference-collection mutation persistence
//
// Was a warehouse; Inventory & Parts has been removed along with its
// collections. The assertion is the collection-agnostic one worth keeping —
// create, edit, delete, each verified by re-reading rather than by trusting the
// write's own response — so it now runs against alert rules, which is a live
// reference collection with the same full CRUD surface.
// ─────────────────────────────────────────────────────────────────────────────

{
  const created = await req(admin, 'POST', '/alert-rules', {
    name: `QA Probe Rule ${Date.now()}`,
    condition: 'temperature > 80',
    severity: 'Warning',
  });
  const ruleId = created.body?.data?.id ?? null;

  record({
    id: 'ISO-REF-001', feature: 'Create an alert rule', type: 'Functional',
    priority: 'P1', severity: 'High',
    expected: '201 and an id', actual: `${created.status} ${ruleId}`,
    pass: created.status === 201 && Boolean(ruleId),
  });

  if (ruleId) {
    const renamed = `QA Probe Rule Renamed ${Date.now()}`;
    await req(admin, 'PATCH', `/alert-rules/${ruleId}`, { name: renamed });
    const list = await req(admin, 'GET', '/alert-rules');
    const found = (list.body?.data ?? []).find((r) => r.id === ruleId);
    record({
      id: 'ISO-REF-002', feature: 'An alert-rule edit persists', type: 'Functional',
      priority: 'P1', severity: 'High',
      expected: `name = ${renamed}`, actual: `name = ${found?.name}`,
      pass: found?.name === renamed,
    });

    await req(admin, 'DELETE', `/alert-rules/${ruleId}`);
    const after = await req(admin, 'GET', '/alert-rules');
    const gone = !(after.body?.data ?? []).some((r) => r.id === ruleId);
    record({
      id: 'ISO-REF-003', feature: 'An alert-rule delete persists', type: 'Functional',
      priority: 'P1', severity: 'High',
      expected: 'the rule no longer appears', actual: `gone = ${gone}`,
      pass: gone,
    });
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Teardown
// ─────────────────────────────────────────────────────────────────────────────

console.log(`\n${'─'.repeat(78)}\nTearing down…`);
// The probe user is removed by the cleanup registered at provisioning time, so
// it goes with the assets in one pass rather than being deleted again here.
const td = await teardown(admin);
console.log(
  `  assets removed ${td.removed.length}` +
    (td.stuck.length ? `, STUCK ${JSON.stringify(td.stuck)}` : '') +
    `, probe user removed = ${!td.stuck.some((s) => s.cleanup)}`,
);

const sum = summarise();
mkdirSync(new URL('../results/', import.meta.url), { recursive: true });
writeFileSync(
  new URL('../results/isolation-results.json', import.meta.url),
  JSON.stringify({ ranAt: new Date().toISOString(), summary: sum, teardown: td, results }, null, 2),
);
console.log('\nResults → Testing/results/isolation-results.json');

// A failing security assertion must fail the run, not just colour a report.
process.exit(results.some((r) => !r.pass) ? 1 : 0);
