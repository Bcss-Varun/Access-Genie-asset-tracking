import type { Request, Response } from 'express';
import { asyncHandler } from '../utils/asyncHandler.js';
import { ApiError } from '../utils/ApiError.js';
import { sendData } from '../utils/response.js';
import { recordAudit } from '../services/audit.service.js';
import * as ops from '../services/trackingOps.service.js';

/**
 * The tracking workspace's actions.
 *
 * Every handler here replaces a `setState` — acknowledging alerts, opening
 * incidents, provisioning devices, booking assets out and running audits all
 * used to live in the browser and disappear on reload. They are audited as
 * operations rather than as field edits, because that is what they are: a
 * night-shift acknowledgement is a fact somebody may need to point at later.
 */

/** Who is doing this, for the timeline entry and the audit row. */
function actorOf(req: Request): string {
  return req.auth?.user.name ?? req.auth?.user.email ?? 'system';
}

// ── Alerts ───────────────────────────────────────────────────────────────────

export const transitionAlert = asyncHandler(async (req: Request, res: Response) => {
  const id = req.params.id as string;
  const { to, note } = req.body as { to: ops.AlertTransition; note?: string };

  const alert = await ops.transitionAlert(id, to, actorOf(req), note);

  recordAudit(req, { action: `tracking_alert.${to.toLowerCase().replace(/\s+/g, '_')}`, target: id, category: 'Operations' });
  sendData(res, alert);
});

export const transitionAlerts = asyncHandler(async (req: Request, res: Response) => {
  const { ids, to, note } = req.body as { ids: string[]; to: ops.AlertTransition; note?: string };

  const result = await ops.transitionAlerts(ids, to, actorOf(req), note);

  recordAudit(req, {
    action: 'tracking_alert.bulk_transition',
    target: `${ids.length} alerts`,
    category: 'Operations',
    metadata: { to, ids },
  });
  sendData(res, result);
});

// ── Incidents ────────────────────────────────────────────────────────────────

export const openIncident = asyncHandler(async (req: Request, res: Response) => {
  const body = req.body as Omit<ops.OpenIncidentInput, 'commander'> & { commander?: string };

  // The person opening an incident commands it unless they name someone else —
  // an incident with no commander is the one nobody picks up.
  const incident = await ops.openIncident({ ...body, commander: body.commander || actorOf(req) });

  recordAudit(req, { action: 'incident.open', target: incident._id, category: 'Operations' });
  sendData(res, incident, 201);
});

export const setIncidentState = asyncHandler(async (req: Request, res: Response) => {
  const id = req.params.id as string;
  const { state } = req.body as { state: 'Open' | 'Investigating' | 'Contained' | 'Resolved' | 'Closed' };

  const incident = await ops.setIncidentState(id, state);

  recordAudit(req, { action: 'incident.state', target: id, category: 'Operations', metadata: { state } });
  sendData(res, incident);
});

// ── Automation rules ─────────────────────────────────────────────────────────

export const toggleAutomationRule = asyncHandler(async (req: Request, res: Response) => {
  const id = req.params.id as string;
  const { enabled } = req.body as { enabled: boolean };

  await ops.toggleAutomationRule(id, enabled);

  recordAudit(req, {
    action: `automation_rule.${enabled ? 'enable' : 'disable'}`,
    target: id,
    category: 'Configuration',
  });
  sendData(res, { id, enabled });
});

// ── Devices ──────────────────────────────────────────────────────────────────

export const provisionDevice = asyncHandler(async (req: Request, res: Response) => {
  const device = await ops.provisionDevice(req.body as ops.ProvisionDeviceInput);

  recordAudit(req, { action: 'tracking_device.provision', target: device._id, category: 'Configuration' });
  sendData(res, device, 201);
});

export const bulkUpdateDevices = asyncHandler(async (req: Request, res: Response) => {
  const { ids, ...patch } = req.body as { ids: string[]; state?: string; replaceBy?: string };

  if (!Object.keys(patch).length) throw ApiError.badRequest('Nothing to change');

  const result = await ops.markDevices(ids, patch);

  recordAudit(req, {
    action: 'tracking_device.bulk_update',
    target: `${ids.length} devices`,
    category: 'Configuration',
    metadata: { ...patch, ids },
  });
  sendData(res, result);
});

export const setCampaignState = asyncHandler(async (req: Request, res: Response) => {
  const id = req.params.id as string;
  const { state } = req.body as { state: string };

  const campaign = await ops.setCampaignState(id, state);

  recordAudit(req, { action: 'firmware_campaign.state', target: id, category: 'Configuration', metadata: { state } });
  sendData(res, campaign);
});

// ── Movements ────────────────────────────────────────────────────────────────

export const createMovement = asyncHandler(async (req: Request, res: Response) => {
  const txn = await ops.recordMovement(req.body as ops.MovementInput);

  recordAudit(req, { action: 'movement.create', target: txn._id, category: 'Operations' });
  sendData(res, txn, 201);
});

export const updateMovement = asyncHandler(async (req: Request, res: Response) => {
  const id = req.params.id as string;
  const txn = await ops.updateMovement(id, req.body as Record<string, unknown>);

  recordAudit(req, { action: 'movement.update', target: id, category: 'Operations' });
  sendData(res, txn);
});

// ── Audits ───────────────────────────────────────────────────────────────────

export const startAudit = asyncHandler(async (req: Request, res: Response) => {
  const body = req.body as Omit<ops.AuditInput, 'owner'>;
  const audit = await ops.startAudit({ ...body, owner: actorOf(req) });

  recordAudit(req, { action: 'audit.start', target: audit._id, category: 'Compliance' });
  sendData(res, audit, 201);
});

export const updateAudit = asyncHandler(async (req: Request, res: Response) => {
  const id = req.params.id as string;
  const patch = req.body as Record<string, unknown>;

  // Approving an audit is the moment it becomes evidence, so it is stamped
  // rather than left to the client to send a timestamp for.
  if (patch.state === 'Approved') patch.approvedAt = new Date();

  const audit = await ops.updateAudit(id, patch);

  recordAudit(req, { action: 'audit.update', target: id, category: 'Compliance', metadata: { fields: Object.keys(patch) } });
  sendData(res, audit);
});
