import {
  AuditSession,
  AutomationRule,
  FirmwareCampaign,
  Incident,
  MovementTxn,
  TrackingAlert,
  TrackingDevice,
  type AuditSessionDoc,
  type IncidentDoc,
  type MovementTxnDoc,
  type TrackingAlertDoc,
  type TrackingDeviceDoc,
} from '../models/index.js';
import { nextId } from '../models/Counter.js';
import { ApiError } from '../utils/ApiError.js';

/**
 * The tracking workspace's write side.
 *
 * These screens were the largest block of state that only existed in the
 * browser: acknowledging an alert, opening an incident, provisioning a device,
 * booking an asset out of a room and closing an audit all changed React state
 * and nothing else. An operator who acknowledged twenty alerts and refreshed
 * got twenty open alerts back, and the colleague looking at the same queue
 * never saw the acknowledgement at all — which is the failure that matters,
 * because these screens exist to be shared.
 *
 * Each action below is written as the transition it actually is, rather than as
 * a field patch, so the timeline entry and the state change cannot come apart.
 */

// ── Alerts ───────────────────────────────────────────────────────────────────

/**
 * Only these transitions are reachable from the queue's buttons.
 *
 * `New → Closed` is not among them on purpose: an alert leaves the queue by
 * being resolved or escalated, and a button that made it simply disappear would
 * be the easiest way to lose a real problem.
 */
const ALERT_TRANSITIONS = {
  Acknowledged: { field: 'ackAt', verb: 'acknowledged' },
  Assigned: { field: undefined, verb: 'assigned' },
  'In Progress': { field: undefined, verb: 'started work on' },
  Escalated: { field: undefined, verb: 'escalated' },
  Resolved: { field: 'resolvedAt', verb: 'resolved' },
  Closed: { field: undefined, verb: 'closed' },
} as const;

export type AlertTransition = keyof typeof ALERT_TRANSITIONS;

export async function transitionAlert(
  id: string,
  to: AlertTransition,
  actor: string,
  note?: string,
): Promise<TrackingAlertDoc> {
  const at = new Date();
  const transition = ALERT_TRANSITIONS[to];

  const alert = await TrackingAlert.findByIdAndUpdate(
    id,
    {
      $set: { state: to, ...(transition.field ? { [transition.field]: at } : {}) },
      // The timeline is the reason the state is what it is. Pushing it in the
      // same update means there is no window where an alert is resolved with
      // nothing saying who resolved it.
      $push: { timeline: { at, actor, action: transition.verb, note: note ?? '' } },
    },
    { new: true, runValidators: true },
  ).lean();

  if (!alert) throw ApiError.notFound('Alert');
  return alert;
}

/** Bulk form of the above — the queue acknowledges a selection at a time. */
export async function transitionAlerts(
  ids: string[],
  to: AlertTransition,
  actor: string,
  note?: string,
): Promise<{ updated: number }> {
  const at = new Date();
  const transition = ALERT_TRANSITIONS[to];

  const result = await TrackingAlert.updateMany(
    { _id: { $in: ids } },
    {
      $set: { state: to, ...(transition.field ? { [transition.field]: at } : {}) },
      $push: { timeline: { at, actor, action: transition.verb, note: note ?? '' } },
    },
  );

  return { updated: result.modifiedCount };
}

// ── Incidents ────────────────────────────────────────────────────────────────

export interface OpenIncidentInput {
  title: string;
  severity: 'Sev1' | 'Sev2' | 'Sev3';
  facility: string;
  commander: string;
  alertIds: string[];
  summary?: string;
  nextAction?: string;
}

/**
 * Open an incident over a set of alerts.
 *
 * The alerts are stamped with the incident id in the same call: an incident
 * whose alerts do not point back at it is invisible from the queue, which is
 * where anyone responding actually starts.
 */
export async function openIncident(input: OpenIncidentInput): Promise<IncidentDoc> {
  const _id = await nextId('incident', 'INC');

  const incident = await Incident.create({
    _id,
    title: input.title,
    severity: input.severity,
    state: 'Open',
    alertIds: input.alertIds,
    openedAt: new Date(),
    commander: input.commander,
    facility: input.facility,
    summary: input.summary ?? '',
    nextAction: input.nextAction ?? '',
    assetsAffected: input.alertIds.length,
  });

  if (input.alertIds.length) {
    await TrackingAlert.updateMany({ _id: { $in: input.alertIds } }, { $set: { incidentId: _id } });
  }

  return incident.toJSON() as IncidentDoc;
}

export async function setIncidentState(id: string, state: IncidentDoc['state']): Promise<IncidentDoc> {
  const incident = await Incident.findByIdAndUpdate(
    id,
    { $set: { state, ...(state === 'Resolved' ? { resolvedAt: new Date() } : {}) } },
    { new: true, runValidators: true },
  ).lean();

  if (!incident) throw ApiError.notFound('Incident');
  return incident;
}

// ── Automation rules ─────────────────────────────────────────────────────────

export async function toggleAutomationRule(id: string, enabled: boolean): Promise<void> {
  const rule = await AutomationRule.findByIdAndUpdate(id, { $set: { enabled } }, { new: true }).lean();
  if (!rule) throw ApiError.notFound('Automation rule');
}

// ── Devices ──────────────────────────────────────────────────────────────────

export interface ProvisionDeviceInput {
  name: string;
  role: TrackingDeviceDoc['role'];
  technology: TrackingDeviceDoc['technology'];
  facility: string;
  zone?: string;
  firmware?: string;
}

export async function provisionDevice(input: ProvisionDeviceInput): Promise<TrackingDeviceDoc> {
  const _id = await nextId('trackingDevice', 'DEV');
  const now = new Date();
  const firmware = input.firmware ?? '1.0.0';

  // A device that has not checked in yet is `Unprovisioned`, not `Healthy`. The
  // screen used to add it as healthy immediately, which meant the coverage
  // figures counted hardware nobody had heard from.
  const device = await TrackingDevice.create({
    _id,
    name: input.name,
    role: input.role,
    technology: input.technology,
    facility: input.facility,
    zone: input.zone ?? '',
    firmware,
    firmwareLatest: firmware,
    state: 'Unprovisioned',
    uptimePct: 0,
    lastSeen: now,
    installedAt: now,
  });

  return device.toJSON() as TrackingDeviceDoc;
}

/** Queue an action against a set of devices — reboot, firmware, replacement. */
export async function markDevices(ids: string[], patch: Record<string, unknown>): Promise<{ updated: number }> {
  const result = await TrackingDevice.updateMany({ _id: { $in: ids } }, { $set: patch });
  return { updated: result.modifiedCount };
}

export async function setCampaignState(id: string, state: string): Promise<unknown> {
  const campaign = await FirmwareCampaign.findByIdAndUpdate(id, { $set: { state } }, { new: true, runValidators: true }).lean();
  if (!campaign) throw ApiError.notFound('Firmware campaign');
  return campaign;
}

// ── Movements ────────────────────────────────────────────────────────────────

export interface MovementInput {
  assetId: string;
  assetName: string;
  direction: MovementTxnDoc['direction'];
  person: string;
  department?: string;
  purpose?: string;
  location?: string;
  dueBack?: Date;
}

export async function recordMovement(input: MovementInput): Promise<MovementTxnDoc> {
  const _id = await nextId('movementTxn', 'MOV');

  const txn = await MovementTxn.create({
    _id,
    ...input,
    at: new Date(),
    // A booking out is open until it comes back; a return closes on the spot.
    state: input.direction === 'Out' ? 'Open' : 'Returned',
    ...(input.direction === 'In' ? { returnedAt: new Date() } : {}),
    // Booked at a desk rather than seen by a reader: asserted, not verified.
    // The distinction is the whole point of the column.
    verified: false,
  });

  return txn.toJSON() as MovementTxnDoc;
}

export async function updateMovement(id: string, patch: Record<string, unknown>): Promise<MovementTxnDoc> {
  const txn = await MovementTxn.findByIdAndUpdate(id, { $set: patch }, { new: true, runValidators: true }).lean();
  if (!txn) throw ApiError.notFound('Movement');
  return txn;
}

// ── Audits ───────────────────────────────────────────────────────────────────

export interface AuditInput {
  name: string;
  scope: string;
  facility: string;
  owner: string;
  method?: AuditSessionDoc['method'];
  expected?: number;
  /** Days from now the count is due. */
  dueInDays?: number;
}

export async function startAudit(input: AuditInput): Promise<AuditSessionDoc> {
  const _id = await nextId('auditSession', 'AUD');
  const startedAt = new Date();

  const audit = await AuditSession.create({
    _id,
    name: input.name,
    scope: input.scope,
    facility: input.facility,
    owner: input.owner,
    method: input.method ?? 'Assisted',
    // An audit someone just started is in progress, not scheduled — the
    // distinction is what the compliance view counts.
    state: 'In Progress',
    startedAt,
    dueAt: new Date(startedAt.getTime() + (input.dueInDays ?? 7) * 86_400_000),
    expected: input.expected ?? 0,
    detected: 0,
    missing: 0,
    unexpected: 0,
    progress: 0,
  });

  return audit.toJSON() as AuditSessionDoc;
}

export async function updateAudit(id: string, patch: Record<string, unknown>): Promise<AuditSessionDoc> {
  const audit = await AuditSession.findByIdAndUpdate(id, { $set: patch }, { new: true, runValidators: true }).lean();
  if (!audit) throw ApiError.notFound('Audit session');
  return audit;
}
