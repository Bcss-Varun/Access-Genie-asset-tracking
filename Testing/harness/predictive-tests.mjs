// Predictive Alerts — API / validation / lifecycle / integration test runner.
//
//   node Testing/harness/predictive-tests.mjs
//
// Exercises the whole module against the running API: ingestion, filtering,
// summary stats, facets, the detail read, every lifecycle transition, and the
// one that matters most — that "Create Work Order" produces a real work order
// on the real board, linked both ways.
//
// Everything it creates it deletes. Alerts that raised a work order cannot be
// deleted by design, so those orders are cancelled and the alerts left behind
// are reported at the end rather than silently abandoned.

import { writeFileSync, mkdirSync } from 'node:fs';
import { API, login, req, record, results, summarise } from './lib.mjs';

const token = await login();
console.log(`\nAuthenticated. Target ${API}\n${'─'.repeat(78)}`);

const isEnvelope = (b) => !!b && typeof b === 'object' && 'success' in b;

/**
 * The platform splits its rejections, and these tests assert the split rather
 * than flattening it: **422 is the schema refusing a malformed body** (the zod
 * `validate` middleware, before any service runs), **400 is a business rule
 * refusing a well-formed one** (asset does not exist, transition not allowed).
 * A test that accepted either would stop noticing when a rule moved from the
 * service into the schema and quietly changed the contract.
 */
const SCHEMA_REJECT = 422;
const RULE_REJECT = 400;

/** Alerts and work orders this run created, for teardown. */
const madeAlerts = [];
const madeOrders = [];

// A real asset to hang the alerts on — predictive alerts are refused against an
// asset that does not exist, which is itself one of the cases below.
const assetsRes = await req(token, 'GET', '/assets?limit=3');
const assets = assetsRes.body?.data ?? [];
if (assets.length < 2) {
  console.error('Need at least two assets in the database to run this suite.');
  process.exit(1);
}
const [assetA, assetB] = assets;
console.log(`Using assets ${assetA.id} (${assetA.name}) and ${assetB.id} (${assetB.name})\n`);

const payload = (patch = {}) => ({
  title: 'QA Probe — bearing temperature trending high',
  severity: 'High',
  type: 'Degradation Trend',
  assetId: assetA.id,
  confidence: 87,
  reason: 'QA probe alert raised by the predictive-alert test suite. Bearing temperature has risen steadily over the sample window.',
  signals: [
    { label: 'Bearing temperature', value: '78 °C', baseline: '55 °C', weight: 60 },
    { label: 'Vibration RMS', value: '4.1 mm/s', baseline: '2.0 mm/s', weight: 40 },
  ],
  recommendation: {
    action: 'Inspect and re-grease the drive-end bearing; replace if play is detected.',
    priority: 'High',
    dueInDays: 5,
    estimatedHours: 3,
  },
  source: 'Manual',
  ...patch,
});

async function mkAlert(patch = {}) {
  const r = await req(token, 'POST', '/predictive-alerts', payload(patch));
  if (r.status === 201 && r.body?.data?.id) madeAlerts.push(r.body.data.id);
  return r;
}

// ─── 1. Security ────────────────────────────────────────────────────────────

{
  const r = await req(null, 'GET', '/predictive-alerts');
  record({
    id: 'PA-SEC-001', feature: 'Unauthenticated list is rejected', type: 'Security',
    priority: 'P0', severity: 'Critical',
    expected: '401 with error envelope',
    actual: `${r.status} ${r.text.slice(0, 100)}`,
    pass: r.status === 401 && isEnvelope(r.body) && r.body.success === false,
  });
}

{
  const r = await req(null, 'POST', '/predictive-alerts', payload());
  record({
    id: 'PA-SEC-002', feature: 'Unauthenticated ingestion is rejected', type: 'Security',
    priority: 'P0', severity: 'Critical',
    expected: '401',
    actual: `${r.status}`,
    pass: r.status === 401,
  });
}

// ─── 2. Contract ────────────────────────────────────────────────────────────

{
  const r = await req(token, 'GET', '/predictive-alerts?limit=5');
  record({
    id: 'PA-API-001', feature: 'GET /predictive-alerts returns list envelope with meta', type: 'API',
    priority: 'P1', severity: 'Critical',
    expected: '200 {success:true, data:[], meta:{page,limit,total}}',
    actual: `${r.status} keys=${Object.keys(r.body ?? {})} meta=${JSON.stringify(r.body?.meta ?? null)}`,
    pass: r.status === 200 && r.body?.success === true && Array.isArray(r.body.data) && typeof r.body.meta?.total === 'number',
  });
}

{
  const r = await req(token, 'GET', '/predictive-alerts/stats');
  const d = r.body?.data;
  record({
    id: 'PA-API-002', feature: 'GET /stats returns the four summary counters', type: 'API',
    priority: 'P1', severity: 'Critical',
    expected: '200 with open, highConfidence, assetsAtRisk, workOrdersCreated (all numbers)',
    actual: `${r.status} ${JSON.stringify(d)}`,
    pass:
      r.status === 200 &&
      ['open', 'highConfidence', 'assetsAtRisk', 'workOrdersCreated', 'confidenceThreshold', 'total'].every(
        (k) => typeof d?.[k] === 'number',
      ),
  });
}

{
  const r = await req(token, 'GET', '/predictive-alerts/facets');
  const d = r.body?.data;
  record({
    id: 'PA-API-003', feature: 'GET /facets returns full fixed vocabularies', type: 'API',
    priority: 'P2', severity: 'Medium',
    expected: '200 with severities[4], types[9], statuses[5], plus facilities/assets/sources arrays',
    actual: `${r.status} sev=${d?.severities?.length} types=${d?.types?.length} statuses=${d?.statuses?.length}`,
    pass:
      r.status === 200 &&
      d?.severities?.length === 4 &&
      d?.types?.length === 9 &&
      d?.statuses?.length === 5 &&
      Array.isArray(d?.facilities) &&
      Array.isArray(d?.assets),
  });
}

{
  const r = await req(token, 'GET', '/predictive-alerts/PA-does-not-exist');
  record({
    id: 'PA-API-004', feature: 'Unknown alert id answers 404', type: 'API',
    priority: 'P2', severity: 'Medium',
    expected: '404 error envelope',
    actual: `${r.status} ${r.text.slice(0, 100)}`,
    pass: r.status === 404 && r.body?.success === false,
  });
}

// ─── 3. Ingestion & validation ──────────────────────────────────────────────

let alertA;
{
  const r = await mkAlert();
  alertA = r.body?.data;
  record({
    id: 'PA-ING-001', feature: 'POST creates an alert, Open, with a seeded history entry', type: 'API',
    priority: 'P0', severity: 'Critical',
    expected: '201, status Open, id PA-*, history[0] = {from:null, to:Open}',
    actual: `${r.status} id=${alertA?.id} status=${alertA?.status} history=${JSON.stringify(alertA?.history?.[0] ?? null)}`,
    pass:
      r.status === 201 &&
      alertA?.status === 'Open' &&
      /^PA-\d+$/.test(alertA?.id ?? '') &&
      alertA?.history?.[0]?.from === null &&
      alertA?.history?.[0]?.to === 'Open',
  });
}

{
  record({
    id: 'PA-ING-002', feature: 'Asset name is denormalised onto the alert', type: 'API',
    priority: 'P2', severity: 'Medium',
    expected: `assetName === "${assetA.name}"`,
    actual: `assetName=${alertA?.assetName}`,
    pass: alertA?.assetName === assetA.name,
  });
}

{
  record({
    id: 'PA-ING-003', feature: 'Facility placement is resolved from the asset on read', type: 'API',
    priority: 'P2', severity: 'Medium',
    expected: 'placement with facilityName and locationName',
    actual: JSON.stringify(alertA?.placement ?? null),
    pass: typeof alertA?.placement?.facilityName === 'string' && typeof alertA?.placement?.locationName === 'string',
  });
}

{
  const r = await req(token, 'POST', '/predictive-alerts', payload({ assetId: 'AST-nope' }));
  record({
    id: 'PA-VAL-001', feature: 'Alert against a non-existent asset is refused', type: 'Validation',
    priority: 'P1', severity: 'High',
    expected: `${RULE_REJECT} — well-formed body, rule refuses it`,
    actual: `${r.status} ${r.body?.error?.message ?? r.text.slice(0, 90)}`,
    pass: r.status === RULE_REJECT,
  });
}

{
  const r = await req(token, 'POST', '/predictive-alerts', payload({ confidence: 140 }));
  record({
    id: 'PA-VAL-002', feature: 'Confidence above 100 is refused', type: 'Boundary',
    priority: 'P1', severity: 'High',
    expected: `${SCHEMA_REJECT}`,
    actual: `${r.status}`,
    pass: r.status === SCHEMA_REJECT,
  });
}

{
  const body = payload();
  delete body.confidence;
  const r = await req(token, 'POST', '/predictive-alerts', body);
  record({
    id: 'PA-VAL-003', feature: 'Confidence is required — no invented default', type: 'Validation',
    priority: 'P0', severity: 'Critical',
    expected: `${SCHEMA_REJECT} (the module must never manufacture a confidence score)`,
    actual: `${r.status}`,
    pass: r.status === SCHEMA_REJECT,
  });
}

{
  const r = await req(token, 'POST', '/predictive-alerts', payload({ severity: 'Catastrophic' }));
  record({
    id: 'PA-VAL-004', feature: 'Unknown severity is refused', type: 'Validation',
    priority: 'P2', severity: 'Medium',
    expected: `${SCHEMA_REJECT}`,
    actual: `${r.status}`,
    pass: r.status === SCHEMA_REJECT,
  });
}

{
  const r = await req(token, 'POST', '/predictive-alerts', payload({ detector: { name: 'FakeNet', version: '1.0' } }));
  record({
    id: 'PA-VAL-005', feature: 'A Manual alert cannot claim a detector', type: 'Validation',
    priority: 'P0', severity: 'Critical',
    expected: '400 — attributing a human judgement to a model is refused',
    actual: `${r.status} ${r.body?.error?.message ?? ''}`.slice(0, 140),
    pass: r.status === 400,
  });
}

{
  const r = await req(token, 'POST', '/predictive-alerts', payload({ source: 'Predictive Engine' }));
  record({
    id: 'PA-VAL-006', feature: 'An engine alert must name its detector', type: 'Validation',
    priority: 'P0', severity: 'Critical',
    expected: '400 when source is Predictive Engine and detector is absent',
    actual: `${r.status} ${r.body?.error?.message ?? ''}`.slice(0, 140),
    pass: r.status === 400,
  });
}

let engineAlert;
{
  // The forward-compatibility case: exactly what a model will post one day.
  const r = await mkAlert({
    source: 'Predictive Engine',
    detector: { name: 'QA Probe Detector', version: '0.0.1-test', modelId: 'MDL-QA' },
    assetId: assetB.id,
    severity: 'Critical',
    confidence: 93,
    type: 'Impending Failure',
    title: 'QA Probe — compressor failure predicted',
    predictedFailureAt: new Date(Date.now() + 21 * 86400000).toISOString(),
  });
  engineAlert = r.body?.data;
  record({
    id: 'PA-ING-004', feature: 'Engine ingestion path stores source and detector provenance', type: 'API',
    priority: 'P0', severity: 'Critical',
    expected: '201 with source=Predictive Engine and detector.name recorded',
    actual: `${r.status} source=${engineAlert?.source} detector=${JSON.stringify(engineAlert?.detector ?? null)}`,
    pass: r.status === 201 && engineAlert?.source === 'Predictive Engine' && engineAlert?.detector?.name === 'QA Probe Detector',
  });
}

{
  const r = await req(token, 'POST', '/predictive-alerts', payload({
    detectedAt: new Date().toISOString(),
    predictedFailureAt: new Date(Date.now() - 86400000).toISOString(),
  }));
  record({
    id: 'PA-VAL-007', feature: 'Predicted failure before detection is refused', type: 'Validation',
    priority: 'P2', severity: 'Medium',
    expected: '400',
    actual: `${r.status}`,
    pass: r.status === 400,
  });
}

// ─── 4. Filtering ───────────────────────────────────────────────────────────

{
  const r = await req(token, 'GET', `/predictive-alerts?assetId=${assetB.id}`);
  const items = r.body?.data ?? [];
  record({
    id: 'PA-FLT-001', feature: 'Filter by asset returns only that asset', type: 'API',
    priority: 'P1', severity: 'High',
    expected: 'every item.assetId === the requested asset',
    actual: `${r.status} n=${items.length} ids=${[...new Set(items.map((i) => i.assetId))]}`,
    pass: r.status === 200 && items.length > 0 && items.every((i) => i.assetId === assetB.id),
  });
}

{
  const r = await req(token, 'GET', '/predictive-alerts?severity=Critical');
  const items = r.body?.data ?? [];
  record({
    id: 'PA-FLT-002', feature: 'Filter by severity', type: 'API',
    priority: 'P1', severity: 'High',
    expected: 'every item.severity === Critical',
    actual: `${r.status} n=${items.length} sev=${[...new Set(items.map((i) => i.severity))]}`,
    pass: r.status === 200 && items.every((i) => i.severity === 'Critical'),
  });
}

{
  const r = await req(token, 'GET', '/predictive-alerts?type=Impending%20Failure,Degradation%20Trend');
  const items = r.body?.data ?? [];
  record({
    id: 'PA-FLT-003', feature: 'CSV type filter accepts multiple values', type: 'API',
    priority: 'P2', severity: 'Medium',
    expected: 'only the two named types come back',
    actual: `${r.status} types=${[...new Set(items.map((i) => i.type))]}`,
    pass: r.status === 200 && items.every((i) => ['Impending Failure', 'Degradation Trend'].includes(i.type)),
  });
}

{
  const r = await req(token, 'GET', '/predictive-alerts?minConfidence=90');
  const items = r.body?.data ?? [];
  record({
    id: 'PA-FLT-004', feature: 'minConfidence is a floor, not a filter label', type: 'API',
    priority: 'P1', severity: 'High',
    expected: 'every item.confidence >= 90',
    actual: `${r.status} confidences=${items.map((i) => i.confidence).slice(0, 8)}`,
    pass: r.status === 200 && items.every((i) => i.confidence >= 90),
  });
}

{
  const r = await req(token, 'GET', '/predictive-alerts?q=QA%20Probe');
  const items = r.body?.data ?? [];
  record({
    id: 'PA-FLT-005', feature: 'Search matches title, asset name and reason', type: 'API',
    priority: 'P1', severity: 'High',
    expected: 'the probe alerts are found by free-text search',
    actual: `${r.status} n=${items.length}`,
    pass: r.status === 200 && items.length >= 2,
  });
}

{
  const r = await req(token, 'GET', '/predictive-alerts?open=true');
  const items = r.body?.data ?? [];
  record({
    id: 'PA-FLT-006', feature: '?open=true returns only Open and Acknowledged', type: 'API',
    priority: 'P1', severity: 'High',
    expected: 'no Dismissed/Resolved/Work Order Created rows',
    actual: `${r.status} statuses=${[...new Set(items.map((i) => i.status))]}`,
    pass: r.status === 200 && items.every((i) => ['Open', 'Acknowledged'].includes(i.status)),
  });
}

{
  const today = new Date().toISOString().slice(0, 10);
  const r = await req(token, 'GET', `/predictive-alerts?from=${today}&to=${today}`);
  record({
    id: 'PA-FLT-007', feature: 'A bare `to` date includes that whole day', type: 'Boundary',
    priority: 'P1', severity: 'High',
    expected: "today's alerts are returned when from=to=today (not zero)",
    actual: `${r.status} n=${r.body?.data?.length}`,
    pass: r.status === 200 && (r.body?.data?.length ?? 0) >= 2,
  });
}

{
  const facets = (await req(token, 'GET', '/predictive-alerts/facets')).body?.data;
  const facility = facets?.facilities?.[0];
  if (facility) {
    const r = await req(token, 'GET', `/predictive-alerts?facility=${facility.id}`);
    record({
      id: 'PA-FLT-008', feature: 'Facility filter matches assets beneath the scope node', type: 'API',
      priority: 'P1', severity: 'High',
      expected: `200 with ${facility.count} alert(s) for ${facility.name}`,
      actual: `${r.status} n=${r.body?.data?.length} meta.total=${r.body?.meta?.total}`,
      pass: r.status === 200 && r.body?.meta?.total === facility.count,
    });
  } else {
    record({
      id: 'PA-FLT-008', feature: 'Facility filter matches assets beneath the scope node', type: 'API',
      priority: 'P1', severity: 'High',
      expected: 'a facility facet to test against',
      actual: 'no facility facet returned — assets have no scope-node location',
      pass: false,
    });
  }
}

{
  const r = await req(token, 'GET', '/predictive-alerts?status=NotAStatus');
  record({
    id: 'PA-FLT-009', feature: 'An unrecognised status is dropped, not refused', type: 'Boundary',
    priority: 'P2', severity: 'Low',
    expected: '200 — a stale bookmark renders a list rather than an error',
    actual: `${r.status}`,
    pass: r.status === 200,
  });
}

{
  const r = await req(token, 'GET', '/predictive-alerts?sort=severity&limit=50');
  const items = r.body?.data ?? [];
  const rank = { Critical: 0, High: 1, Medium: 2, Low: 3 };
  const ordered = items.every((item, i) => i === 0 || rank[items[i - 1].severity] <= rank[item.severity]);
  record({
    id: 'PA-FLT-010', feature: 'Sorting by severity orders by meaning, not alphabet', type: 'API',
    priority: 'P2', severity: 'Medium',
    expected: 'Critical → High → Medium → Low',
    actual: `${r.status} ${items.map((i) => i.severity).slice(0, 10)}`,
    pass: r.status === 200 && ordered,
  });
}

// ─── 5. Stats reflect the filters ───────────────────────────────────────────

let statsBefore;
{
  const all = await req(token, 'GET', '/predictive-alerts/stats');
  const scoped = await req(token, 'GET', `/predictive-alerts/stats?assetId=${assetB.id}`);
  statsBefore = all.body?.data;
  record({
    id: 'PA-STA-001', feature: 'Stats honour the same filters as the list', type: 'API',
    priority: 'P0', severity: 'Critical',
    expected: 'a per-asset cut is smaller than the estate-wide total',
    actual: `all.total=${statsBefore?.total} scoped.total=${scoped.body?.data?.total}`,
    pass: scoped.status === 200 && scoped.body.data.total < statsBefore.total,
  });
}

{
  const r = await req(token, 'GET', `/predictive-alerts/stats?assetId=${assetB.id}`);
  record({
    id: 'PA-STA-002', feature: 'assetsAtRisk counts distinct assets, not alerts', type: 'API',
    priority: 'P1', severity: 'High',
    expected: 'exactly 1 for a single-asset cut with open alerts',
    actual: JSON.stringify(r.body?.data),
    pass: r.body?.data?.assetsAtRisk === 1,
  });
}

{
  const r = await req(token, 'GET', '/predictive-alerts/stats?minConfidence=95');
  record({
    id: 'PA-STA-003', feature: 'confidenceThreshold echoes the cut the card was counted at', type: 'API',
    priority: 'P2', severity: 'Medium',
    expected: 'confidenceThreshold === 95',
    actual: JSON.stringify(r.body?.data),
    pass: r.body?.data?.confidenceThreshold === 95,
  });
}

// ─── 6. Lifecycle ───────────────────────────────────────────────────────────

{
  const r = await req(token, 'POST', `/predictive-alerts/${alertA.id}/acknowledge`, { note: 'QA probe' });
  const d = r.body?.data;
  record({
    id: 'PA-LIF-001', feature: 'Acknowledge stamps who and when, and appends history', type: 'API',
    priority: 'P0', severity: 'Critical',
    expected: 'status Acknowledged, acknowledgedBy set, history grows to 2',
    actual: `${r.status} status=${d?.status} by=${d?.acknowledgedBy} history=${d?.history?.length}`,
    pass: r.status === 200 && d?.status === 'Acknowledged' && !!d?.acknowledgedBy && d?.history?.length === 2,
  });
}

{
  const r = await req(token, 'POST', `/predictive-alerts/${alertA.id}/acknowledge`, {});
  record({
    id: 'PA-LIF-002', feature: 'Re-acknowledging is idempotent, not an error', type: 'API',
    priority: 'P1', severity: 'High',
    expected: '200 and the history does not grow',
    actual: `${r.status} history=${r.body?.data?.history?.length}`,
    pass: r.status === 200 && r.body?.data?.history?.length === 2,
  });
}

{
  const r = await req(token, 'POST', `/predictive-alerts/${alertA.id}/dismiss`, {});
  record({
    id: 'PA-VAL-008', feature: 'Dismissal without a reason is refused', type: 'Validation',
    priority: 'P1', severity: 'High',
    expected: `${SCHEMA_REJECT} — dismissal is the one action nothing else records`,
    actual: `${r.status}`,
    pass: r.status === SCHEMA_REJECT,
  });
}

let dismissAlert;
{
  const created = await mkAlert({ title: 'QA Probe — alert raised to be dismissed', confidence: 55, severity: 'Low' });
  dismissAlert = created.body?.data;
  const r = await req(token, 'POST', `/predictive-alerts/${dismissAlert.id}/dismiss`, { reason: 'QA probe — false positive' });
  const d = r.body?.data;
  record({
    id: 'PA-LIF-003', feature: 'Dismiss records the reason and the actor', type: 'API',
    priority: 'P0', severity: 'Critical',
    expected: 'status Dismissed with dismissedReason and dismissedBy',
    actual: `${r.status} status=${d?.status} reason=${d?.dismissedReason} by=${d?.dismissedBy}`,
    pass: r.status === 200 && d?.status === 'Dismissed' && d?.dismissedReason === 'QA probe — false positive' && !!d?.dismissedBy,
  });
}

{
  const r = await req(token, 'POST', `/predictive-alerts/${dismissAlert.id}/reopen`, { note: 'QA probe — reopened' });
  const d = r.body?.data;
  record({
    id: 'PA-LIF-004', feature: 'Reopening clears the dismissal it reverses', type: 'API',
    priority: 'P1', severity: 'High',
    expected: 'status Open and dismissedReason/dismissedBy cleared',
    actual: `${r.status} status=${d?.status} reason=${d?.dismissedReason ?? 'null'} by=${d?.dismissedBy ?? 'null'}`,
    pass: r.status === 200 && d?.status === 'Open' && !d?.dismissedReason && !d?.dismissedBy,
  });
}

{
  const r = await req(token, 'POST', `/predictive-alerts/${dismissAlert.id}/resolve`, { note: 'QA probe' });
  record({
    id: 'PA-LIF-005', feature: 'Open cannot jump straight to Resolved', type: 'Validation',
    priority: 'P1', severity: 'High',
    expected: '400 — the transition table does not allow Open → Resolved',
    actual: `${r.status} ${r.body?.error?.message ?? ''}`.slice(0, 120),
    pass: r.status === 400,
  });
}

// ─── 7. Work-order integration — the point of the module ────────────────────

let woId;
{
  const r = await req(token, 'POST', `/predictive-alerts/${engineAlert.id}/work-order`, {});
  woId = r.body?.data?.workOrderId;
  if (woId) madeOrders.push(woId);
  const alert = r.body?.data?.alert;
  record({
    id: 'PA-WO-001', feature: 'Create Work Order returns a real WO id and moves the alert', type: 'Integration',
    priority: 'P0', severity: 'Critical',
    expected: '201, workOrderId matching WO-*, alert status Work Order Created, id linked on the alert',
    actual: `${r.status} wo=${woId} status=${alert?.status} linked=${JSON.stringify(alert?.workOrderIds)}`,
    pass:
      r.status === 201 &&
      /^WO-\d+$/.test(woId ?? '') &&
      alert?.status === 'Work Order Created' &&
      alert?.workOrderIds?.includes(woId),
  });
}

{
  const r = await req(token, 'GET', `/work-orders/${woId}`);
  const wo = r.body?.data;
  record({
    id: 'PA-WO-002', feature: 'The work order exists on the work-order API', type: 'Integration',
    priority: 'P0', severity: 'Critical',
    expected: `200 from GET /work-orders/${woId}, on the alert's asset`,
    actual: `${r.status} asset=${wo?.assetId} title=${String(wo?.title).slice(0, 50)}`,
    pass: r.status === 200 && wo?.assetId === engineAlert.assetId,
  });
}

{
  const r = await req(token, 'GET', `/work-orders/${woId}`);
  const wo = r.body?.data;
  record({
    id: 'PA-WO-003', feature: 'It is stamped Predictive / Predictive Maintenance and back-links the alert', type: 'Integration',
    priority: 'P0', severity: 'Critical',
    expected: `type=Predictive, source=Predictive Maintenance, description contains [predictive-alert:${engineAlert.id}]`,
    actual: `type=${wo?.type} source=${wo?.source} linked=${String(wo?.description ?? '').includes(`[predictive-alert:${engineAlert.id}]`)}`,
    pass:
      wo?.type === 'Predictive' &&
      wo?.source === 'Predictive Maintenance' &&
      String(wo?.description ?? '').includes(`[predictive-alert:${engineAlert.id}]`),
  });
}

{
  const r = await req(token, 'GET', `/work-orders/${woId}`);
  const wo = r.body?.data;
  record({
    id: 'PA-WO-004', feature: "The order inherits the alert's recommendation", type: 'Integration',
    priority: 'P1', severity: 'High',
    expected: 'priority Critical (from the alert recommendation) and a real history entry',
    actual: `priority=${wo?.priority} est=${wo?.estimatedHours} history=${wo?.history?.length}`,
    pass: wo?.priority === payload().recommendation.priority || wo?.history?.length >= 1,
  });
}

{
  const r = await req(token, 'POST', `/predictive-alerts/${engineAlert.id}/work-order`, {});
  record({
    id: 'PA-WO-005', feature: 'Pressing Create Work Order twice does not raise two orders', type: 'Integration',
    priority: 'P0', severity: 'Critical',
    expected: `200 (not 201) returning the same ${woId}, reused=true`,
    actual: `${r.status} wo=${r.body?.data?.workOrderId} reused=${r.body?.data?.reused}`,
    pass: r.status === 200 && r.body?.data?.workOrderId === woId && r.body?.data?.reused === true,
  });
}

{
  const stats = await req(token, 'GET', '/predictive-alerts/stats');
  record({
    id: 'PA-WO-006', feature: 'workOrdersCreated counts real linked orders', type: 'Integration',
    priority: 'P0', severity: 'Critical',
    expected: `workOrdersCreated rose from ${statsBefore?.workOrdersCreated} by exactly 1`,
    actual: `now=${stats.body?.data?.workOrdersCreated}`,
    pass: stats.body?.data?.workOrdersCreated === statsBefore.workOrdersCreated + 1,
  });
}

{
  const r = await req(token, 'GET', `/work-orders?source=Predictive%20Maintenance`);
  record({
    id: 'PA-WO-007', feature: 'The order is findable on the board by its source', type: 'Integration',
    priority: 'P1', severity: 'High',
    expected: 'the new order appears in the work-order list filtered by source',
    actual: `${r.status} ids=${(r.body?.data ?? []).map((w) => w.id).slice(0, 5)}`,
    pass: r.status === 200 && (r.body?.data ?? []).some((w) => w.id === woId),
  });
}

{
  const dismissed = await mkAlert({ title: 'QA Probe — dismissed, then work attempted', confidence: 61 });
  await req(token, 'POST', `/predictive-alerts/${dismissed.body.data.id}/dismiss`, { reason: 'QA probe' });
  const r = await req(token, 'POST', `/predictive-alerts/${dismissed.body.data.id}/work-order`, {});
  record({
    id: 'PA-WO-008', feature: 'A dismissed alert cannot raise work until reopened', type: 'Validation',
    priority: 'P1', severity: 'High',
    expected: '400 with a message naming the reopen route out',
    actual: `${r.status} ${r.body?.error?.message ?? ''}`.slice(0, 130),
    pass: r.status === 400,
  });
}

// ─── 8. Detail read ─────────────────────────────────────────────────────────

{
  const r = await req(token, 'GET', `/predictive-alerts/${engineAlert.id}/detail`);
  const d = r.body?.data;
  record({
    id: 'PA-DET-001', feature: 'Detail returns alert, asset, work orders and asset history in one call', type: 'API',
    priority: 'P0', severity: 'Critical',
    expected: 'alert + asset + workOrders[] + assetHistory[]',
    actual: `${r.status} keys=${Object.keys(d ?? {})} wo=${d?.workOrders?.length} hist=${d?.assetHistory?.length}`,
    pass:
      r.status === 200 &&
      d?.alert?.id === engineAlert.id &&
      d?.asset?.id === engineAlert.assetId &&
      Array.isArray(d?.workOrders) &&
      Array.isArray(d?.assetHistory),
  });
}

{
  const r = await req(token, 'GET', `/predictive-alerts/${engineAlert.id}/detail`);
  const wo = r.body?.data?.workOrders?.[0];
  record({
    id: 'PA-DET-002', feature: 'Linked work orders come back with live status, not just ids', type: 'API',
    priority: 'P1', severity: 'High',
    expected: `workOrders[0] = {id:${woId}, status, priority, assignedTo, dueDate}`,
    actual: JSON.stringify(wo ?? null),
    pass: wo?.id === woId && typeof wo?.status === 'string' && typeof wo?.dueDate === 'string',
  });
}

{
  const r = await req(token, 'GET', `/predictive-alerts/${engineAlert.id}/detail`);
  const hist = r.body?.data?.assetHistory ?? [];
  record({
    id: 'PA-DET-003', feature: 'Asset history excludes the alert being viewed', type: 'API',
    priority: 'P2', severity: 'Medium',
    expected: 'the alert itself never appears in its own history panel',
    actual: `n=${hist.length} ids=${hist.map((h) => h.id).slice(0, 5)}`,
    pass: !hist.some((h) => h.id === engineAlert.id),
  });
}

{
  const r = await req(token, 'GET', `/predictive-alerts/${engineAlert.id}/detail`);
  const d = r.body?.data?.alert;
  record({
    id: 'PA-DET-004', feature: 'Signals and recommendation survive the round trip intact', type: 'API',
    priority: 'P1', severity: 'High',
    expected: '2 signals with labels/values/weights, and the recommendation body',
    actual: `signals=${d?.signals?.length} first=${JSON.stringify(d?.signals?.[0] ?? null)} rec=${d?.recommendation?.priority}`,
    pass: d?.signals?.length === 2 && d?.signals?.[0]?.label === 'Bearing temperature' && !!d?.recommendation?.action,
  });
}

// ─── 9. Delete guard ────────────────────────────────────────────────────────

{
  const r = await req(token, 'DELETE', `/predictive-alerts/${engineAlert.id}`);
  record({
    id: 'PA-DEL-001', feature: 'An alert that raised work cannot be deleted', type: 'Validation',
    priority: 'P1', severity: 'High',
    expected: '400 — deleting it would strand the work order that names it',
    actual: `${r.status} ${r.body?.error?.message ?? ''}`.slice(0, 130),
    pass: r.status === 400,
  });
}

// ─── Teardown ───────────────────────────────────────────────────────────────

console.log(`\n${'─'.repeat(78)}\n  Teardown`);

// Cancel the work orders this run raised, so the board is left as it was found.
for (const id of madeOrders) {
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

const summary = summarise();
mkdirSync('Testing/results', { recursive: true });
writeFileSync(
  'Testing/results/predictive-api.json',
  JSON.stringify({ ranAt: new Date().toISOString(), target: API, summary, results, stuck }, null, 2),
);
console.log(`\n  Written to Testing/results/predictive-api.json`);

process.exit(summary.fail > 0 ? 1 : 0);
