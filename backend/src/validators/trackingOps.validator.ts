import { z } from 'zod';
import {
  AUDIT_METHODS,
  DEVICE_ROLES,
  DEVICE_STATES,
  INCIDENT_STATES,
  MOVEMENT_DIRECTIONS,
  MOVEMENT_STATES,
  TRACKING_TECHS,
} from '@access-genie/shared';

/**
 * Bodies for the tracking workspace's actions.
 *
 * These screens are the ones an operations team shares, so the schemas are
 * tighter than elsewhere: a state this file does not name cannot be written,
 * which is what stops a UI bug parking an alert in a state nothing queries for.
 */

/** The transitions the alert queue's buttons can reach. */
export const ALERT_TRANSITIONS = ['Acknowledged', 'Assigned', 'In Progress', 'Escalated', 'Resolved', 'Closed'] as const;

export const alertTransitionSchema = z.object({
  to: z.enum(ALERT_TRANSITIONS),
  note: z.string().trim().max(500).optional(),
});

export const bulkAlertTransitionSchema = alertTransitionSchema.extend({
  // Bounded because this is one `updateMany`; a selection larger than a screen
  // of alerts is a script, and a script should page.
  ids: z.array(z.string().trim().min(1).max(64)).min(1).max(200),
});

export const openIncidentSchema = z.object({
  title: z.string().trim().min(1).max(160),
  severity: z.enum(['Sev1', 'Sev2', 'Sev3']),
  facility: z.string().trim().min(1).max(80),
  // Optional on the wire, never optional on the record: the controller falls
  // back to whoever opened it, because an incident with no commander is the one
  // nobody picks up.
  commander: z.string().trim().min(1).max(120).optional(),
  alertIds: z.array(z.string().trim().min(1).max(64)).max(200).default([]),
  summary: z.string().trim().max(1000).optional(),
  nextAction: z.string().trim().max(300).optional(),
});

export const incidentStateSchema = z.object({
  state: z.enum(INCIDENT_STATES),
});

export const toggleSchema = z.object({
  enabled: z.boolean(),
});

export const provisionDeviceSchema = z.object({
  name: z.string().trim().min(1).max(120),
  role: z.enum(DEVICE_ROLES),
  technology: z.enum(TRACKING_TECHS),
  facility: z.string().trim().min(1).max(80),
  zone: z.string().trim().max(80).optional(),
  firmware: z.string().trim().max(40).optional(),
});

/** Bulk device actions — reboot, schedule firmware, mark for replacement. */
export const deviceBulkSchema = z.object({
  ids: z.array(z.string().trim().min(1).max(64)).min(1).max(500),
  state: z.enum(DEVICE_STATES).optional(),
  replaceBy: z.iso.datetime({ offset: true }).or(z.iso.date()).optional(),
});

export const campaignStateSchema = z.object({
  state: z.enum(['Draft', 'Scheduled', 'Running', 'Paused', 'Complete']),
});

export const createMovementSchema = z.object({
  assetId: z.string().trim().min(1).max(64),
  assetName: z.string().trim().min(1).max(160),
  direction: z.enum(MOVEMENT_DIRECTIONS),
  person: z.string().trim().min(1).max(120),
  department: z.string().trim().max(80).optional(),
  purpose: z.string().trim().max(300).optional(),
  location: z.string().trim().max(120).optional(),
  dueBack: z.coerce.date().optional(),
});

export const updateMovementSchema = z
  .object({
    state: z.enum(MOVEMENT_STATES),
    returnedAt: z.coerce.date(),
    verified: z.boolean(),
    approver: z.string().trim().max(120),
  })
  .partial();

export const startAuditSchema = z.object({
  name: z.string().trim().min(1).max(160),
  scope: z.string().trim().min(1).max(160),
  facility: z.string().trim().min(1).max(80),
  method: z.enum(AUDIT_METHODS).optional(),
  expected: z.number().int().min(0).max(1_000_000).optional(),
  dueInDays: z.number().int().min(1).max(365).optional(),
});

export const updateAuditSchema = z
  .object({
    state: z.enum(['Scheduled', 'In Progress', 'Review', 'Approved', 'Closed']),
    detected: z.number().int().min(0),
    missing: z.number().int().min(0),
    unexpected: z.number().int().min(0),
    progress: z.number().min(0).max(100),
    approver: z.string().trim().max(120),
    note: z.string().trim().max(1000),
  })
  .partial();
