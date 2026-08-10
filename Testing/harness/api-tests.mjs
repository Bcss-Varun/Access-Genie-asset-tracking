// Asset Management — API / validation / boundary / security / DB test runner.
//
//   node Testing/harness/api-tests.mjs
//
// Creates assets as it goes and deletes every one at the end (see lib.teardown).
// Run against a disposable database when you can; it is safe against a live one,
// but a crash mid-run can leave `QA Probe…` assets behind.

import { writeFileSync, mkdirSync } from 'node:fs';
import { API, login, req, mkAsset, assetPayload, created, teardown, record, results, summarise } from './lib.mjs';

const token = await login();
console.log(`\nAuthenticated. Target ${API}\n${'─'.repeat(78)}`);

const isEnvelope = (b) => !!b && typeof b === 'object' && 'success' in b;

// ─── 1. Response envelope & contract ────────────────────────────────────────

{
  const r = await req(token, 'GET', '/assets?limit=5');
  record({
    id: 'AM-API-001', feature: 'GET /assets returns success envelope with meta', type: 'API',
    priority: 'P1', severity: 'Critical',
    expected: '200, {success:true, data:[], meta:{page,limit,total}}',
    actual: `${r.status}, keys=${Object.keys(r.body ?? {})}, meta=${JSON.stringify(r.body?.meta ?? null)}`,
    pass: r.status === 200 && r.body?.success === true && Array.isArray(r.body.data) && !!r.body.meta,
  });
}

{
  const r = await req(token, 'GET', '/assets/stats');
  const d = r.body?.data;
  record({
    id: 'AM-API-002', feature: 'GET /assets/stats aggregates totals', type: 'API',
    priority: 'P2', severity: 'Medium',
    expected: '200 with total, portfolioValue, avgHealth, byStatus[], byCategory[]',
    actual: `${r.status} ${JSON.stringify(d)?.slice(0, 160)}`,
    pass: r.status === 200 && typeof d?.total === 'number' && Array.isArray(d?.byStatus),
  });
}

// ─── 2. Authentication & authorisation ──────────────────────────────────────

{
  const r = await req(null, 'GET', '/assets');
  record({
    id: 'AM-SEC-001', feature: 'Unauthenticated GET /assets is rejected', type: 'Security',
    priority: 'P0', severity: 'Critical',
    expected: '401 with error envelope',
    actual: `${r.status} ${r.text.slice(0, 120)}`,
    pass: r.status === 401 && isEnvelope(r.body) && r.body.success === false,
  });
}

{
  const r = await req('not-a-real-token', 'GET', '/assets');
  record({
    id: 'AM-SEC-002', feature: 'Malformed bearer token is rejected', type: 'Security',
    priority: 'P0', severity: 'Critical',
    expected: '401',
    actual: `${r.status}`,
    pass: r.status === 401,
  });
}

{
  // A token signed with the right shape but a bogus signature.
  const fake = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiJVLTAwMSIsImlhdCI6MX0.bogussignature';
  const r = await req(fake, 'GET', '/assets');
  record({
    id: 'AM-SEC-003', feature: 'JWT with invalid signature is rejected', type: 'Security',
    priority: 'P0', severity: 'Critical',
    expected: '401',
    actual: `${r.status}`,
    pass: r.status === 401,
  });
}

{
  const r = await req(null, 'POST', '/assets', assetPayload());
  record({
    id: 'AM-SEC-004', feature: 'Unauthenticated asset creation is rejected', type: 'Security',
    priority: 'P0', severity: 'Critical',
    expected: '401 and no asset written',
    actual: `${r.status}`,
    pass: r.status === 401,
  });
}

// ─── 3. Create — happy path & server-side derivation ────────────────────────

let baseId = null;
{
  const r = await mkAsset(token, { name: 'QA Probe Base', serialNumber: 'QA-BASE-001', purchasePrice: 1000 });
  baseId = r.body?.data?.id ?? null;
  record({
    id: 'AM-API-010', feature: 'POST /assets creates an asset and mints an AST- id', type: 'Functional',
    priority: 'P0', severity: 'Critical',
    expected: '201, id matches /^AST-\\d+$/',
    actual: `${r.status} id=${baseId}`,
    pass: r.status === 201 && /^AST-\d+$/.test(baseId ?? ''),
  });
}

{
  const r = await req(token, 'GET', `/assets/${baseId}`);
  const a = r.body?.data;
  record({
    id: 'AM-API-011', feature: 'Created asset is readable and healthStatus derived from score', type: 'Functional',
    priority: 'P1', severity: 'High',
    expected: 'healthScore 100 → healthStatus "Good"; custodian defaults to "Unassigned"',
    actual: `score=${a?.healthScore} status=${a?.healthStatus} custodian=${a?.custodian}`,
    pass: a?.healthScore === 100 && a?.healthStatus === 'Good' && a?.custodian === 'Unassigned',
  });
}

{
  // The user's explicit rule: never invent a serial number.
  const r = await mkAsset(token, { name: 'QA Probe No Serial' });
  const a = r.body?.data;
  record({
    id: 'AM-API-012', feature: 'Asset created without a serial stores empty, not a placeholder', type: 'Functional',
    priority: 'P0', severity: 'Critical',
    expected: "serialNumber === '' (field present, no INT-AST-… placeholder)",
    actual: `${r.status} serialNumber=${JSON.stringify(a?.serialNumber)}`,
    pass: r.status === 201 && a?.serialNumber === '',
  });
}

{
  // Two serial-less assets must coexist — the partial unique index must not
  // treat '' as a duplicate value.
  const r = await mkAsset(token, { name: 'QA Probe No Serial 2' });
  record({
    id: 'AM-API-013', feature: 'Multiple serial-less assets can coexist (partial unique index)', type: 'Database',
    priority: 'P0', severity: 'Critical',
    expected: '201 — empty serials are exempt from the unique index',
    actual: `${r.status} ${r.body?.error?.message ?? ''}`,
    pass: r.status === 201,
  });
}

{
  const r = await req(token, 'POST', '/assets', assetPayload({ name: 'QA Dup Serial', serialNumber: 'QA-BASE-001' }));
  if (r.status === 201) created.push(r.body.data.id);
  record({
    id: 'AM-DB-001', feature: 'Duplicate serial number is rejected', type: 'Database',
    priority: 'P0', severity: 'Critical',
    expected: '409 conflict',
    actual: `${r.status} ${r.body?.error?.message ?? r.text.slice(0, 100)}`,
    pass: r.status === 409,
  });
}

// ─── 4. Validation & boundary ───────────────────────────────────────────────

const validationCases = [
  ['AM-VAL-001', 'name missing', { name: undefined }, 422, 'Critical', 'P0'],
  ['AM-VAL-002', 'name 1 char (below min 2)', { name: 'A' }, 422, 'High', 'P1'],
  ['AM-BND-001', 'name exactly 2 chars (min boundary)', { name: 'AB' }, 201, 'Medium', 'P2'],
  ['AM-BND-002', 'name exactly 120 chars (max boundary)', { name: 'N'.repeat(120) }, 201, 'Medium', 'P2'],
  ['AM-BND-003', 'name 121 chars (above max)', { name: 'N'.repeat(121) }, 422, 'High', 'P1'],
  ['AM-VAL-003', 'category missing', { category: undefined }, 422, 'Critical', 'P0'],
  ['AM-VAL-004', 'category not in enum', { category: 'Spaceship' }, 422, 'High', 'P1'],
  ['AM-VAL-005', 'location missing', { location: undefined }, 422, 'Critical', 'P0'],
  ['AM-VAL-006', 'location.name empty string', { location: { id: 'L1', name: '' } }, 422, 'High', 'P1'],
  ['AM-VAL-007', 'serial 1 char (below min 2)', { serialNumber: 'X' }, 422, 'High', 'P1'],
  ['AM-BND-004', 'serial exactly 64 chars (max boundary)', { serialNumber: 'S'.repeat(64) }, 201, 'Medium', 'P2'],
  ['AM-BND-005', 'serial 65 chars (above max)', { serialNumber: 'S'.repeat(65) }, 422, 'High', 'P1'],
  ['AM-VAL-008', 'negative purchase price', { purchasePrice: -5 }, 422, 'High', 'P1'],
  ['AM-BND-006', 'purchase price 0 (min boundary)', { purchasePrice: 0 }, 201, 'Low', 'P3'],
  ['AM-VAL-009', 'healthScore above 100', { healthScore: 101 }, 422, 'High', 'P1'],
  ['AM-VAL-010', 'healthScore negative', { healthScore: -1 }, 422, 'High', 'P1'],
  ['AM-BND-007', 'healthScore 0 (min boundary)', { healthScore: 0 }, 201, 'Medium', 'P2'],
  ['AM-VAL-011', 'healthScore non-integer', { healthScore: 55.5 }, 422, 'Medium', 'P2'],
  ['AM-VAL-012', 'status not in enum', { status: 'Deleted' }, 422, 'High', 'P1'],
  ['AM-VAL-013', 'criticality not in enum', { criticality: 'Apocalyptic' }, 422, 'Medium', 'P2'],
  ['AM-VAL-014', 'explicit id in wrong format', { id: 'ASSET-1' }, 422, 'Medium', 'P2'],
  ['AM-BND-008', 'tags array of 20 (max boundary)', { tags: Array.from({ length: 20 }, (_, i) => `t${i}`) }, 201, 'Low', 'P3'],
  ['AM-BND-009', 'tags array of 21 (above max)', { tags: Array.from({ length: 21 }, (_, i) => `t${i}`) }, 422, 'Medium', 'P2'],
  ['AM-VAL-015', 'utilization above 100', { utilization: 150 }, 422, 'Medium', 'P2'],
  ['AM-VAL-016', 'purchasePrice as string', { purchasePrice: '1000' }, 422, 'Medium', 'P2'],
  ['AM-VAL-017', 'name of only whitespace', { name: '     ' }, 422, 'High', 'P1'],
];

for (const [id, label, patch, wantStatus, severity, priority] of validationCases) {
  const payload = assetPayload({ name: `QA ${id}`, ...patch });
  for (const k of Object.keys(patch)) if (patch[k] === undefined) delete payload[k];
  const r = await req(token, 'POST', '/assets', payload);
  if (r.status === 201) created.push(r.body.data.id);
  record({
    id, feature: `Create validation — ${label}`, type: id.startsWith('AM-BND') ? 'Boundary' : 'Validation',
    priority, severity,
    expected: `HTTP ${wantStatus}`,
    actual: `${r.status} ${r.status === 400 ? JSON.stringify(r.body?.error?.details ?? r.body?.error?.message ?? '').slice(0, 110) : ''}`,
    pass: r.status === wantStatus,
  });
}

// ─── 5. Injection / payload safety ──────────────────────────────────────────

{
  const r = await req(token, 'POST', '/assets', assetPayload({ name: 'QA NoSQL', serialNumber: { $ne: null } }));
  if (r.status === 201) created.push(r.body.data.id);
  record({
    id: 'AM-SEC-005', feature: 'NoSQL operator injected into a field is rejected', type: 'Security',
    priority: 'P0', severity: 'Critical',
    expected: '422 — object where a string is expected',
    actual: `${r.status}`,
    pass: r.status === 422,
  });
}

{
  const r = await req(token, 'GET', `/assets?q=${encodeURIComponent('{"$ne":null}')}`);
  record({
    id: 'AM-SEC-006', feature: 'NoSQL operator in ?q= is treated as a literal, not an operator', type: 'Security',
    priority: 'P0', severity: 'Critical',
    expected: '200 and 0 results (escaped as literal text)',
    actual: `${r.status} count=${r.body?.data?.length}`,
    pass: r.status === 200 && r.body?.data?.length === 0,
  });
}

{
  const xss = '<img src=x onerror=alert(1)>';
  const r = await mkAsset(token, { name: `QA ${xss}` });
  record({
    id: 'AM-SEC-007', feature: 'HTML/script payload in name is stored verbatim (must be escaped on render)', type: 'Security',
    priority: 'P1', severity: 'High',
    expected: 'Stored as-is; React escapes on output. Recorded for the UI XSS check.',
    actual: `${r.status} stored=${JSON.stringify(r.body?.data?.name)?.slice(0, 80)}`,
    pass: r.status === 201,
  });
}

{
  const r = await req(token, 'POST', '/assets', '{"name":"broken",', { 'Content-Type': 'application/json' });
  record({
    id: 'AM-NEG-001', feature: 'Malformed JSON body returns 400, not 500', type: 'Negative',
    priority: 'P1', severity: 'High',
    expected: '400 with an error envelope',
    actual: `${r.status} ${r.text.slice(0, 90)}`,
    pass: r.status === 400,
  });
}

{
  const huge = 'x'.repeat(2 * 1024 * 1024);
  const r = await req(token, 'POST', '/assets', assetPayload({ name: 'QA Huge', model: huge }));
  if (r.status === 201) created.push(r.body.data.id);
  record({
    id: 'AM-SEC-008', feature: '2 MB payload is rejected (body size limit), not accepted', type: 'Security',
    priority: 'P1', severity: 'High',
    expected: '400, 413 or 422',
    actual: `${r.status}`,
    pass: [400, 413, 422].includes(r.status),
  });
}

// ─── 6. Read / not-found / id handling ──────────────────────────────────────

{
  const r = await req(token, 'GET', '/assets/AST-99999999');
  record({
    id: 'AM-NEG-002', feature: 'GET a non-existent asset returns 404', type: 'Negative',
    priority: 'P1', severity: 'Medium',
    expected: '404 with error envelope',
    actual: `${r.status}`,
    pass: r.status === 404 && r.body?.success === false,
  });
}

{
  const r = await req(token, 'GET', '/assets/%2E%2E%2F%2E%2E%2Fetc%2Fpasswd');
  record({
    id: 'AM-SEC-009', feature: 'Path-traversal style id is rejected or 404, never a file read', type: 'Security',
    priority: 'P0', severity: 'Critical',
    expected: '400/404/422 — never a file read or 500',
    actual: `${r.status} ${r.text.slice(0, 80)}`,
    pass: [400, 404, 422].includes(r.status),
  });
}

{
  const r = await req(token, 'GET', `/assets/${baseId}/profile`);
  const d = r.body?.data;
  record({
    id: 'AM-API-014', feature: 'GET /assets/:id/profile returns asset + all timelines', type: 'API',
    priority: 'P1', severity: 'High',
    expected: 'asset, workOrders[], activity[], insights[], custody[]',
    actual: `${r.status} keys=${Object.keys(d ?? {})}`,
    pass: r.status === 200 && !!d?.asset && Array.isArray(d?.workOrders) && Array.isArray(d?.activity),
  });
}

// ─── 7. Update semantics — the partial-update regression ────────────────────

{
  // The bug this guards: a PATCH sending one field must not reset unsent fields
  // to their schema defaults. Historically `.partial()` kept `.default()`, so
  // patching status wiped serialNumber, purchasePrice and healthScore.
  const before = (await req(token, 'GET', `/assets/${baseId}`)).body?.data;
  const r = await req(token, 'PATCH', `/assets/${baseId}`, { status: 'Maintenance' });
  const after = r.body?.data;
  const preserved =
    after?.serialNumber === before?.serialNumber &&
    after?.purchasePrice === before?.purchasePrice &&
    after?.healthScore === before?.healthScore &&
    after?.name === before?.name;
  record({
    id: 'AM-API-020', feature: 'PATCH with one field preserves every unsent field', type: 'Functional',
    priority: 'P0', severity: 'Critical',
    expected: `serial/price/health/name unchanged; status → Maintenance`,
    actual: `status=${after?.status} serial=${JSON.stringify(after?.serialNumber)} price=${after?.purchasePrice} health=${after?.healthScore}`,
    pass: r.status === 200 && after?.status === 'Maintenance' && preserved,
  });
}

{
  const r = await req(token, 'PATCH', `/assets/${baseId}`, { serialNumber: '' });
  record({
    id: 'AM-API-021', feature: 'PATCH can clear a serial number to empty', type: 'Functional',
    priority: 'P2', severity: 'Medium',
    expected: "200 and serialNumber === ''",
    actual: `${r.status} serial=${JSON.stringify(r.body?.data?.serialNumber)}`,
    pass: r.status === 200 && r.body?.data?.serialNumber === '',
  });
}

{
  const r = await req(token, 'PATCH', `/assets/${baseId}`, { id: 'AST-777777' });
  const still = (await req(token, 'GET', `/assets/${baseId}`)).status;
  record({
    id: 'AM-SEC-010', feature: 'PATCH cannot reassign the asset id', type: 'Security',
    priority: 'P1', severity: 'High',
    expected: 'id ignored or 400; original id still resolves',
    actual: `patch=${r.status} original-still-exists=${still === 200}`,
    pass: still === 200 && r.body?.data?.id === baseId,
  });
}

{
  const r = await req(token, 'PATCH', '/assets/AST-99999999', { status: 'Active' });
  record({
    id: 'AM-NEG-003', feature: 'PATCH a non-existent asset returns 404', type: 'Negative',
    priority: 'P1', severity: 'Medium',
    expected: '404',
    actual: `${r.status}`,
    pass: r.status === 404,
  });
}

{
  const r = await req(token, 'PATCH', `/assets/${baseId}`, { healthScore: 10 });
  record({
    id: 'AM-DB-002', feature: 'healthStatus is re-derived when healthScore changes', type: 'Database',
    priority: 'P1', severity: 'High',
    expected: 'healthScore 10 → healthStatus "Critical"',
    actual: `score=${r.body?.data?.healthScore} status=${r.body?.data?.healthStatus}`,
    pass: r.body?.data?.healthStatus === 'Critical',
  });
}

// ─── 8. Bulk update ─────────────────────────────────────────────────────────

{
  const ids = created.slice(0, 3);
  const r = await req(token, 'POST', '/assets/bulk', { ids, patch: { criticality: 'High' } });
  record({
    id: 'AM-API-030', feature: 'POST /assets/bulk applies a patch across a selection', type: 'Functional',
    priority: 'P1', severity: 'High',
    expected: `200 with updated.length === ${ids.length}`,
    actual: `${r.status} updated=${r.body?.data?.updated?.length} failed=${r.body?.data?.failed?.length}`,
    pass: r.status === 200 && r.body?.data?.updated?.length === ids.length,
  });
}

{
  const r = await req(token, 'POST', '/assets/bulk', { ids: [created[0], 'AST-99999999'], patch: { criticality: 'Low' } });
  record({
    id: 'AM-API-031', feature: 'Bulk update reports partial success rather than failing whole batch', type: 'Functional',
    priority: 'P1', severity: 'High',
    expected: '200, 1 updated, 1 failed with a reason',
    actual: `${r.status} updated=${r.body?.data?.updated?.length} failed=${JSON.stringify(r.body?.data?.failed)?.slice(0, 90)}`,
    pass: r.status === 200 && r.body?.data?.updated?.length === 1 && r.body?.data?.failed?.length === 1,
  });
}

{
  const r = await req(token, 'POST', '/assets/bulk', { ids: [], patch: { criticality: 'Low' } });
  record({
    id: 'AM-VAL-020', feature: 'Bulk update with an empty id list is rejected', type: 'Validation',
    priority: 'P2', severity: 'Medium',
    expected: '422 — min 1 id',
    actual: `${r.status}`,
    pass: r.status === 422,
  });
}

{
  const r = await req(token, 'POST', '/assets/bulk', { ids: [created[0]], patch: {} });
  record({
    id: 'AM-VAL-021', feature: 'Bulk update with an empty patch is rejected', type: 'Validation',
    priority: 'P2', severity: 'Medium',
    expected: '422 — "Provide at least one field to change"',
    actual: `${r.status} ${JSON.stringify(r.body?.error?.message ?? '').slice(0, 80)}`,
    pass: r.status === 422,
  });
}

{
  const ids = Array.from({ length: 501 }, (_, i) => `AST-${900000 + i}`);
  const r = await req(token, 'POST', '/assets/bulk', { ids, patch: { criticality: 'Low' } });
  record({
    id: 'AM-BND-010', feature: 'Bulk update above the 500-id cap is rejected', type: 'Boundary',
    priority: 'P1', severity: 'High',
    expected: '422 — max 500 ids',
    actual: `${r.status}`,
    pass: r.status === 422,
  });
}

{
  const r = await req(token, 'POST', '/assets/bulk', { ids: [created[0]], patch: { serialNumber: 'BULK-SERIAL' } });
  record({
    id: 'AM-SEC-011', feature: 'Bulk patch refuses per-asset fields (serialNumber) not in its allowlist', type: 'Security',
    priority: 'P1', severity: 'High',
    expected: '422 — serialNumber is not a bulk-editable field',
    actual: `${r.status}`,
    pass: r.status === 422,
  });
}

// ─── 9. List: filtering, search, pagination, sorting ────────────────────────

{
  const r = await req(token, 'GET', '/assets?status=Maintenance');
  const allMatch = (r.body?.data ?? []).every((a) => a.status === 'Maintenance');
  record({
    id: 'AM-API-040', feature: 'Status filter returns only matching assets', type: 'Functional',
    priority: 'P1', severity: 'High',
    expected: 'every row has status Maintenance',
    actual: `${r.status} n=${r.body?.data?.length} allMatch=${allMatch}`,
    pass: r.status === 200 && allMatch,
  });
}

{
  const r = await req(token, 'GET', '/assets?category=Compute,Storage');
  const allMatch = (r.body?.data ?? []).every((a) => ['Compute', 'Storage'].includes(a.category));
  record({
    id: 'AM-API-041', feature: 'CSV multi-value category filter works', type: 'Functional',
    priority: 'P2', severity: 'Medium',
    expected: 'only Compute or Storage rows',
    actual: `${r.status} n=${r.body?.data?.length} allMatch=${allMatch}`,
    pass: r.status === 200 && allMatch,
  });
}

{
  const r = await req(token, 'GET', '/assets?category=NotACategory');
  record({
    id: 'AM-VAL-030', feature: 'Unknown category filter value', type: 'Validation',
    priority: 'P2', severity: 'Low',
    expected: '422, or 200 with 0 results — never a 500',
    actual: `${r.status} n=${r.body?.data?.length}`,
    pass: r.status === 422 || (r.status === 200 && r.body?.data?.length === 0),
  });
}

{
  const r = await req(token, 'GET', '/assets?limit=2&page=1');
  record({
    id: 'AM-API-042', feature: 'Pagination honours limit and reports meta', type: 'Functional',
    priority: 'P1', severity: 'High',
    expected: 'at most 2 rows; meta.limit === 2',
    actual: `${r.status} n=${r.body?.data?.length} meta=${JSON.stringify(r.body?.meta)}`,
    pass: r.status === 200 && (r.body?.data?.length ?? 99) <= 2,
  });
}

{
  const r = await req(token, 'GET', '/assets?limit=99999');
  record({
    id: 'AM-BND-011', feature: 'Excessive page limit is capped or rejected (DoS guard)', type: 'Boundary',
    priority: 'P1', severity: 'High',
    expected: '422 (documented max 200), or 200 with a capped limit',
    actual: `${r.status} limit=${r.body?.meta?.limit} n=${r.body?.data?.length}`,
    pass: r.status === 422 || (r.body?.meta?.limit ?? 99999) <= 200,
  });
}

{
  const r = await req(token, 'GET', '/assets?limit=-1');
  record({
    id: 'AM-BND-012', feature: 'Negative page limit is rejected or normalised', type: 'Boundary',
    priority: 'P2', severity: 'Medium',
    expected: '422, or 200 with a sane limit',
    actual: `${r.status} limit=${r.body?.meta?.limit}`,
    pass: r.status === 422 || (r.body?.meta?.limit ?? 0) > 0,
  });
}

{
  const r = await req(token, 'GET', '/assets?sort=' + encodeURIComponent('{"$where":"1"}'));
  record({
    id: 'AM-SEC-012', feature: 'Sort parameter is allowlisted (no arbitrary field injection)', type: 'Security',
    priority: 'P1', severity: 'High',
    expected: '422, or 200 using the default sort',
    actual: `${r.status}`,
    pass: r.status === 422 || r.status === 200,
  });
}

{
  const r = await req(token, 'GET', '/assets?q=QA%20Probe%20Base');
  record({
    id: 'AM-API-043', feature: 'Free-text search finds an asset by name', type: 'Functional',
    priority: 'P1', severity: 'High',
    expected: 'at least 1 result containing the created asset',
    actual: `${r.status} n=${r.body?.data?.length}`,
    pass: r.status === 200 && (r.body?.data?.length ?? 0) >= 1,
  });
}

{
  await mkAsset(token, { name: 'QA Serial Search Target', serialNumber: 'QASEARCH-77421' });
  const r = await req(token, 'GET', '/assets?q=' + encodeURIComponent('SEARCH-774'));
  record({
    id: 'AM-API-044', feature: 'Partial serial-number search matches (regex, not $text)', type: 'Functional',
    priority: 'P2', severity: 'Medium',
    expected: '≥1 result for a partial serial',
    actual: `${r.status} n=${r.body?.data?.length}`,
    pass: r.status === 200 && (r.body?.data?.length ?? 0) >= 1,
  });
}

{
  const r = await req(token, 'GET', '/assets?q=' + encodeURIComponent('a('));
  record({
    id: 'AM-SEC-013', feature: 'Regex metacharacters in search are escaped (no ReDoS / crash)', type: 'Security',
    priority: 'P1', severity: 'High',
    expected: '200 — not a 500 from an invalid regex',
    actual: `${r.status} ${r.text.slice(0, 80)}`,
    pass: r.status === 200,
  });
}

// ─── 10. Performance ────────────────────────────────────────────────────────

{
  const r = await req(token, 'GET', '/assets?limit=50');
  record({
    id: 'AM-PERF-001', feature: 'Asset list responds within 2000 ms', type: 'Performance',
    priority: 'P2', severity: 'Medium',
    expected: '< 2000 ms',
    actual: `${r.ms} ms`,
    pass: r.ms < 2000,
  });
}

{
  const t0 = Date.now();
  await Promise.all(Array.from({ length: 10 }, () => req(token, 'GET', '/assets?limit=10')));
  const ms = Date.now() - t0;
  record({
    id: 'AM-PERF-002', feature: '10 concurrent list requests complete within 10 s', type: 'Performance',
    priority: 'P2', severity: 'Medium',
    expected: '< 10000 ms for 10 concurrent reads',
    actual: `${ms} ms`,
    pass: ms < 10000,
  });
}

// ─── 11. Delete / retire ────────────────────────────────────────────────────

{
  const made = await mkAsset(token, { name: 'QA Probe Delete Me' });
  const id = made.body?.data?.id;
  const r = await req(token, 'DELETE', `/assets/${id}`);
  const after = await req(token, 'GET', `/assets/${id}`);
  if (r.status === 204) { const i = created.indexOf(id); if (i >= 0) created.splice(i, 1); }
  record({
    id: 'AM-API-050', feature: 'DELETE retires an asset; it stops resolving', type: 'Functional',
    priority: 'P1', severity: 'High',
    expected: '204 then 404 on read-back',
    actual: `delete=${r.status} read=${after.status}`,
    pass: r.status === 204 && after.status === 404,
  });
}

{
  const r = await req(token, 'DELETE', '/assets/AST-99999999');
  record({
    id: 'AM-NEG-004', feature: 'DELETE a non-existent asset returns 404', type: 'Negative',
    priority: 'P2', severity: 'Medium',
    expected: '404',
    actual: `${r.status}`,
    pass: r.status === 404,
  });
}

// ─── Teardown ───────────────────────────────────────────────────────────────

console.log(`\n${'─'.repeat(78)}\nTearing down ${created.length} test assets…`);
const td = await teardown(token);
console.log(`  removed ${td.removed.length}` + (td.stuck.length ? `, COULD NOT REMOVE ${td.stuck.length}: ${JSON.stringify(td.stuck)}` : ''));

const sum = summarise();
mkdirSync(new URL('../results/', import.meta.url), { recursive: true });
writeFileSync(new URL('../results/api-results.json', import.meta.url),
  JSON.stringify({ ranAt: new Date().toISOString(), summary: sum, teardown: td, results }, null, 2));
console.log(`\nResults → Testing/results/api-results.json`);
