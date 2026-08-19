// Administration — approval workflows that actually gate transactions.
//
//   node Testing/harness/admin-tests.mjs
//
// The question this suite exists to answer is the one the rework was asked for:
// does an approval workflow *affect the module it governs*, or is it a settings
// screen that stores an opinion? Configuration CRUD passing tells you nothing
// about that, so almost every assertion here ends by re-reading the **transfer**
// and checking where it actually got to.
//
// The chain under test: an asset transfer governed by a two-step workflow
// (facility manager, then organisation admin). What has to hold:
//
//   • Raising the transfer opens a real approval request, automatically.
//   • The transfer cannot be approved around the chain — by anyone, including
//     someone who is not the requester and would otherwise be allowed to.
//   • A step can only be decided by the role that owns it.
//   • Nobody approves their own request.
//   • The transfer moves only when the *last* step approves.
//   • A rejection at any step settles the whole request and stops the transfer.
//   • The history records every decision with its actor, step and comment.
//
// Runs against live Atlas data as real signed-in users; everything is torn down.

import { writeFileSync, mkdirSync } from 'node:fs';
import { API, login, req, teardown, onTeardown, guardAgainstCrash, record, results, summarise } from './lib.mjs';

const admin = await login();
console.log(`\nAuthenticated as super admin. Target ${API}\n${'─'.repeat(78)}`);
guardAgainstCrash(admin);

const STAMP = Date.now();

const tree = (await req(admin, 'GET', '/scope/tree')).body?.data;
const facility = tree?.children?.[0];
const building = facility?.children?.[0];
if (!facility || !building) {
  console.error('This database has no facility/building to test against.');
  process.exit(1);
}

// ── Fixtures ─────────────────────────────────────────────────────────────────

async function makeUser(roleId, homeScopeId, title) {
  const email = `qa.admin.${roleId}.${STAMP}@example.test`;
  const r = await req(admin, 'POST', '/users', {
    name: `QA ${roleId}`,
    email,
    password: 'ProbeTest123',
    roleId,
    title,
    homeScopeId,
  });
  const id = r.body?.data?.id;
  if (id) onTeardown(() => req(admin, 'DELETE', `/users/${id}`));
  return { id, email, status: r.status, token: id ? await login(email, 'ProbeTest123') : null };
}

const fm = await makeUser('facility_manager', facility.id, 'Facility Manager');
const oa = await makeUser('org_admin', tree.id, 'Organization Admin');
const tech = await makeUser('technician', building.id, 'Technician');

record({
  id: 'ADM-000', feature: 'Provision facility-manager, org-admin and technician users', type: 'Setup',
  priority: 'P0', severity: 'Critical',
  expected: 'three users and three sessions',
  actual: `fm=${fm.id} oa=${oa.id} tech=${tech.id}`,
  pass: Boolean(fm.token && oa.token && tech.token),
});
if (!fm.token || !oa.token || !tech.token) {
  console.error('Could not provision approvers; aborting.');
  process.exit(1);
}

/** A two-step workflow over asset transfers, scoped to the whole organisation. */
async function makeWorkflow(steps, status = 'Active', scopeId) {
  const r = await req(admin, 'POST', '/approval-workflows', {
    name: `QA Transfer Workflow ${STAMP}-${Math.random().toString(36).slice(2, 7)}`,
    description: 'Raised by the administration harness.',
    trigger: 'asset_transfer',
    status,
    scopeId,
    steps,
  });
  const id = r.body?.data?.id;
  if (id) onTeardown(() => req(admin, 'DELETE', `/approval-workflows/${id}`));
  return { id, status: r.status, body: r.body };
}

const TWO_STEP = [
  { order: 1, name: 'Facility manager release', approverRole: 'facility_manager' },
  { order: 2, name: 'Organisation admin confirm', approverRole: 'org_admin' },
];

/** An asset in the building, and a transfer of it raised by `who`. */
async function raiseTransfer(who) {
  const asset = await req(admin, 'POST', '/assets', {
    name: `QA Approval Asset ${STAMP}-${Math.random().toString(36).slice(2, 7)}`,
    category: 'Compute',
    location: { id: building.id, name: building.name },
  });
  const assetId = asset.body?.data?.id;
  if (assetId) onTeardown(() => req(admin, 'DELETE', `/assets/${assetId}`));

  const transfer = await req(who, 'POST', '/operations/transfers', {
    assetId,
    to: 'Pune plant',
    reason: 'Administration harness',
  });
  return { assetId, transfer };
}

const transferById = async (id) => {
  const all = await req(admin, 'GET', '/operations/transfers');
  return (all.body?.data ?? []).find((t) => t.id === id);
};

const openRequestFor = async (transferId) => {
  const all = await req(admin, 'GET', '/approvals?status=Pending');
  return (all.body?.data ?? []).find((a) => a.subjectId === transferId);
};

// ─────────────────────────────────────────────────────────────────────────────
// 1. Workflow configuration
// ─────────────────────────────────────────────────────────────────────────────

{
  const wf = await makeWorkflow(TWO_STEP);
  record({
    id: 'ADM-WF-001', feature: 'Create an approval workflow', type: 'Functional',
    priority: 'P0', severity: 'Critical',
    expected: '201 with two ordered steps',
    actual: `${wf.status} steps=${wf.body?.data?.steps?.length}`,
    pass: wf.status === 201 && wf.body?.data?.steps?.length === 2,
  });

  const reread = await req(admin, 'GET', '/approval-workflows');
  const found = (reread.body?.data ?? []).find((w) => w.id === wf.id);
  record({
    id: 'ADM-WF-002', feature: 'The workflow is readable back from the database', type: 'Functional',
    priority: 'P0', severity: 'Critical',
    expected: 'listed with its trigger and status',
    actual: `${found ? `${found.trigger}/${found.status}` : 'missing'}`,
    pass: found?.trigger === 'asset_transfer' && found?.status === 'Active',
  });

  await req(admin, 'PATCH', `/approval-workflows/${wf.id}`, { status: 'Inactive' });
  const after = await req(admin, 'GET', '/approval-workflows');
  record({
    id: 'ADM-WF-003', feature: 'A workflow edit persists (verified by re-reading)', type: 'Functional',
    priority: 'P1', severity: 'High',
    expected: 'status = Inactive',
    actual: `status = ${(after.body?.data ?? []).find((w) => w.id === wf.id)?.status}`,
    pass: (after.body?.data ?? []).find((w) => w.id === wf.id)?.status === 'Inactive',
  });
}

// A step must name exactly one approver — neither zero nor two.
for (const [id, steps, why] of [
  ['ADM-VAL-001', [{ order: 1, name: 'Nobody' }], 'no approver'],
  [
    'ADM-VAL-002',
    [{ order: 1, name: 'Both', approverRole: 'org_admin', approverUserId: 'U-001' }],
    'two approvers',
  ],
  ['ADM-VAL-003', [], 'no steps at all'],
]) {
  const r = await req(admin, 'POST', '/approval-workflows', {
    name: `QA Invalid ${STAMP}`, trigger: 'asset_transfer', status: 'Draft', steps,
  });
  record({
    id, feature: `A workflow with ${why} is refused`, type: 'Negative',
    priority: 'P1', severity: 'High',
    expected: '422', actual: `${r.status}`, pass: r.status === 422,
  });
}

{
  const r = await req(admin, 'POST', '/approval-workflows', {
    name: `QA Bad Scope ${STAMP}`, trigger: 'asset_transfer', status: 'Draft',
    scopeId: 'NO-SUCH-NODE', steps: TWO_STEP,
  });
  record({
    id: 'ADM-VAL-004', feature: 'A workflow scoped to a location that does not exist is refused', type: 'Negative',
    priority: 'P1', severity: 'High',
    expected: '400', actual: `${r.status}`, pass: r.status === 400,
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// 2. An inactive workflow does not fire
//
// The status field has to mean something. If a Draft or Inactive workflow still
// gated transfers, an administrator could never safely write one.
// ─────────────────────────────────────────────────────────────────────────────

{
  const wf = await makeWorkflow(TWO_STEP, 'Draft');
  const { transfer } = await raiseTransfer(admin);
  const request = await openRequestFor(transfer.body?.data?.id);
  record({
    id: 'ADM-GATE-001', feature: 'A Draft workflow raises no approval request', type: 'Functional',
    priority: 'P0', severity: 'Critical',
    expected: 'the transfer is created and no request is opened',
    actual: `transfer ${transfer.status}, request = ${request?.id ?? 'none'}`,
    pass: transfer.status === 201 && !request,
    evidence: `workflow ${wf.id} left in Draft`,
  });
  await req(admin, 'DELETE', `/approval-workflows/${wf.id}`);
}

// ─────────────────────────────────────────────────────────────────────────────
// 3. The chain — the whole point of the feature
// ─────────────────────────────────────────────────────────────────────────────

// The workflow that governs every transfer raised from here on.
await makeWorkflow(TWO_STEP);

{
  // Raised by the technician, so neither approver is the requester and the
  // "cannot approve your own" rule cannot mask the bypass guard being tested.
  const { transfer } = await raiseTransfer(tech.token);
  const transferId = transfer.body?.data?.id;
  const request = await openRequestFor(transferId);

  record({
    id: 'ADM-CHAIN-001', feature: 'Raising a governed transfer opens an approval request automatically', type: 'Functional',
    priority: 'P0', severity: 'Critical',
    expected: 'a Pending request on step 1 of 2, linked to the transfer',
    actual: `${request?.id ?? 'none'} step=${request?.currentStep} steps=${request?.steps?.length}`,
    pass: Boolean(request) && request.currentStep === 0 && request.steps.length === 2,
  });

  // The bypass. The org admin is not the requester and holds every module, so
  // nothing *except* the workflow guard stands between them and an approval.
  const bypass = await req(oa.token, 'POST', `/operations/transfers/${transferId}/status`, { status: 'Approved' });
  const afterBypass = await transferById(transferId);
  record({
    id: 'ADM-CHAIN-002', feature: 'A governed transfer cannot be approved around the chain', type: 'Security',
    priority: 'P0', severity: 'Critical',
    expected: '409 and the transfer still Pending',
    actual: `${bypass.status} — ${bypass.body?.error?.message?.slice(0, 70) ?? ''} · transfer ${afterBypass?.status}`,
    pass: bypass.status === 409 && afterBypass?.status === 'Pending',
    evidence: 'Without this the workflow is advisory.',
  });

  const wrongRole = await req(oa.token, 'POST', `/approvals/${request.id}/decide`, { decision: 'Approved' });
  record({
    id: 'ADM-CHAIN-003', feature: 'A step can only be decided by the role that owns it', type: 'Security',
    priority: 'P0', severity: 'Critical',
    expected: '403 — step 1 belongs to facility_manager',
    actual: `${wrongRole.status} ${wrongRole.body?.error?.message?.slice(0, 60) ?? ''}`,
    pass: wrongRole.status === 403,
  });

  const ownRequest = await req(tech.token, 'POST', `/approvals/${request.id}/decide`, { decision: 'Approved' });
  record({
    id: 'ADM-CHAIN-004', feature: 'Nobody can approve a request they raised themselves', type: 'Security',
    priority: 'P0', severity: 'Critical',
    expected: '403 for the requester',
    actual: `${ownRequest.status} ${ownRequest.body?.error?.message?.slice(0, 60) ?? ''}`,
    pass: ownRequest.status === 403,
  });

  const step1 = await req(fm.token, 'POST', `/approvals/${request.id}/decide`, {
    decision: 'Approved', comment: 'released by facility',
  });
  const midway = await transferById(transferId);
  record({
    id: 'ADM-CHAIN-005', feature: 'Approving a non-final step does not move the transfer', type: 'Functional',
    priority: 'P0', severity: 'Critical',
    expected: 'request advances to step 2; transfer still Pending',
    actual: `decide ${step1.status}, request step=${step1.body?.data?.currentStep}, transfer ${midway?.status}`,
    pass: step1.status === 200 && step1.body?.data?.currentStep === 1 && midway?.status === 'Pending',
  });

  const step2 = await req(oa.token, 'POST', `/approvals/${request.id}/decide`, {
    decision: 'Approved', comment: 'confirmed by org',
  });
  const settled = await transferById(transferId);
  record({
    id: 'ADM-CHAIN-006', feature: 'The final approval moves the real transfer to Approved', type: 'Functional',
    priority: 'P0', severity: 'Critical',
    expected: 'request Approved and the transfer Approved',
    actual: `request ${step2.body?.data?.status}, transfer ${settled?.status}, approver ${settled?.approver}`,
    pass: step2.body?.data?.status === 'Approved' && settled?.status === 'Approved',
    evidence: 'This is the assertion that separates a workflow feature from a settings screen.',
  });

  const full = await req(admin, 'GET', `/approvals/${request.id}`);
  const history = full.body?.data?.history ?? [];
  record({
    id: 'ADM-CHAIN-007', feature: 'Every decision is stored with actor, step and comment', type: 'Data integrity',
    priority: 'P0', severity: 'Critical',
    expected: '3 entries: opened, approved(step 1), approved(step 2)',
    actual: history.map((h) => `${h.action}:${h.actorName}:${h.step ?? '-'}`).join(' | '),
    pass:
      history.length === 3 &&
      history[0].action === 'opened' &&
      history[1].action === 'approved' && history[1].step === 1 && history[1].comment === 'released by facility' &&
      history[2].action === 'approved' && history[2].step === 2,
  });

  const redecide = await req(oa.token, 'POST', `/approvals/${request.id}/decide`, { decision: 'Rejected' });
  record({
    id: 'ADM-CHAIN-008', feature: 'A settled request cannot be decided again', type: 'Negative',
    priority: 'P1', severity: 'High',
    expected: '400', actual: `${redecide.status}`, pass: redecide.status === 400,
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// 4. Rejection settles immediately
// ─────────────────────────────────────────────────────────────────────────────

{
  const { transfer } = await raiseTransfer(tech.token);
  const transferId = transfer.body?.data?.id;
  const request = await openRequestFor(transferId);

  const rejected = await req(fm.token, 'POST', `/approvals/${request.id}/decide`, {
    decision: 'Rejected', comment: 'not this quarter',
  });
  const after = await transferById(transferId);

  record({
    id: 'ADM-REJ-001', feature: 'A rejection at step 1 settles the request without asking step 2', type: 'Functional',
    priority: 'P0', severity: 'Critical',
    expected: 'request Rejected and the transfer Rejected',
    actual: `request ${rejected.body?.data?.status}, transfer ${after?.status}`,
    pass: rejected.body?.data?.status === 'Rejected' && after?.status === 'Rejected',
  });

  record({
    id: 'ADM-REJ-002', feature: 'The rejection reason is stored on the step', type: 'Data integrity',
    priority: 'P1', severity: 'High',
    expected: 'comment = "not this quarter"',
    actual: `${rejected.body?.data?.steps?.[0]?.comment}`,
    pass: rejected.body?.data?.steps?.[0]?.comment === 'not this quarter',
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// 5. Cancellation, and the approver's own queue
// ─────────────────────────────────────────────────────────────────────────────

{
  const { transfer } = await raiseTransfer(tech.token);
  const request = await openRequestFor(transfer.body?.data?.id);

  const byStranger = await req(fm.token, 'POST', `/approvals/${request.id}/cancel`, { reason: 'nope' });
  record({
    id: 'ADM-CAN-001', feature: 'Only the requester or an administrator can cancel a request', type: 'Security',
    priority: 'P1', severity: 'High',
    expected: '403 for an unrelated approver',
    actual: `${byStranger.status}`,
    pass: byStranger.status === 403,
  });

  const byRequester = await req(tech.token, 'POST', `/approvals/${request.id}/cancel`, { reason: 'withdrawn' });
  record({
    id: 'ADM-CAN-002', feature: 'The requester can withdraw their own request', type: 'Functional',
    priority: 'P1', severity: 'High',
    expected: 'status Cancelled',
    actual: `${byRequester.status} ${byRequester.body?.data?.status}`,
    pass: byRequester.body?.data?.status === 'Cancelled',
  });
}

{
  const { transfer } = await raiseTransfer(tech.token);
  const transferId = transfer.body?.data?.id;

  const fmQueue = await req(fm.token, 'GET', '/approvals?mine=true');
  const oaQueue = await req(oa.token, 'GET', '/approvals?mine=true');
  const inFm = (fmQueue.body?.data ?? []).some((a) => a.subjectId === transferId);
  const inOa = (oaQueue.body?.data ?? []).some((a) => a.subjectId === transferId);

  record({
    id: 'ADM-QUEUE-001', feature: 'A request appears only in the queue of whoever owns the current step', type: 'Functional',
    priority: 'P1', severity: 'High',
    expected: 'in the facility manager’s queue, not the org admin’s (step 1 of 2)',
    actual: `facility_manager=${inFm}, org_admin=${inOa}`,
    pass: inFm === true && inOa === false,
  });

  await req(tech.token, 'POST', `/approvals/${(await openRequestFor(transferId)).id}/cancel`, { reason: 'cleanup' });
}

// ─────────────────────────────────────────────────────────────────────────────
// Teardown
// ─────────────────────────────────────────────────────────────────────────────

console.log(`\n${'─'.repeat(78)}\nTearing down…`);
const td = await teardown(admin);
console.log(`  assets removed ${td.removed.length}${td.stuck.length ? `, STUCK ${JSON.stringify(td.stuck)}` : ''}`);

const sum = summarise();
mkdirSync(new URL('../results/', import.meta.url), { recursive: true });
writeFileSync(
  new URL('../results/admin-results.json', import.meta.url),
  JSON.stringify({ ranAt: new Date().toISOString(), summary: sum, teardown: td, results }, null, 2),
);
console.log('\nResults → Testing/results/admin-results.json');

process.exit(results.some((r) => !r.pass) ? 1 : 0);
