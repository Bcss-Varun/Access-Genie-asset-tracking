import { z } from 'zod';
import { INTEGRATION_STATUSES } from '@access-genie/shared';
import { SUBSCRIPTION_CADENCES } from '../models/configuration.js';

/**
 * Bodies for the configuration screens.
 *
 * Everything here backs a button that previously opened a toast: connecting an
 * integration, drafting an approval chain, writing a checklist, subscribing to
 * a report, changing the organisation's own branding.
 */

// ── Integrations ─────────────────────────────────────────────────────────────
export const createIntegrationSchema = z.object({
  name: z.string().trim().min(1).max(80),
  category: z.string().trim().min(1).max(60),
  description: z.string().trim().max(400).default(''),
  // A new integration starts disconnected: adding the row is not the same as
  // authorising it, and pretending otherwise would show a green tick over a
  // connection nobody has made.
  status: z.enum(INTEGRATION_STATUSES).default('Disconnected'),
});

export const updateIntegrationSchema = createIntegrationSchema.partial();

// ── Approval workflows ───────────────────────────────────────────────────────
const workflowStepSchema = z.object({
  name: z.string().trim().min(1).max(80),
  approver: z.string().trim().min(1).max(80),
});

export const createApprovalWorkflowSchema = z.object({
  name: z.string().trim().min(1).max(120),
  trigger: z.string().trim().min(1).max(160),
  // Order carries meaning, so this is a sequence the client controls.
  steps: z.array(workflowStepSchema).min(1).max(12),
  status: z.enum(['Active', 'Draft']).default('Draft'),
});

export const updateApprovalWorkflowSchema = createApprovalWorkflowSchema.partial();

// ── Checklist templates ──────────────────────────────────────────────────────
export const createChecklistTemplateSchema = z.object({
  name: z.string().trim().min(1).max(120),
  category: z.string().trim().min(1).max(60).default('General'),
  icon: z.string().trim().max(8).default('📋'),
  description: z.string().trim().max(400).default(''),
  items: z.array(z.string().trim().min(1).max(200)).min(1).max(80),
});

export const updateChecklistTemplateSchema = createChecklistTemplateSchema.partial();

// ── Report subscriptions ─────────────────────────────────────────────────────
export const createReportSubscriptionSchema = z.object({
  reportId: z.string().trim().min(1).max(64),
  cadence: z.enum(SUBSCRIPTION_CADENCES).default('Weekly'),
  format: z.string().trim().min(1).max(16).default('PDF'),
  recipients: z.array(z.email().max(200)).min(1).max(50),
  enabled: z.boolean().default(true),
});

export const updateReportSubscriptionSchema = z
  .object({
    cadence: z.enum(SUBSCRIPTION_CADENCES),
    format: z.string().trim().min(1).max(16),
    recipients: z.array(z.email().max(200)).min(1).max(50),
    enabled: z.boolean(),
  })
  .partial();

// ── Organisation branding ────────────────────────────────────────────────────
const hexColor = z
  .string()
  .trim()
  .regex(/^#[0-9a-fA-F]{6}$/, 'Use a six-digit hex colour, e.g. #4f46e5');

export const updateOrgSettingsSchema = z
  .object({
    name: z.string().trim().min(1).max(120),
    legalName: z.string().trim().max(200),
    logoEmoji: z.string().trim().max(8),
    primaryColor: hexColor,
    accentColor: hexColor,
    loginMessage: z.string().trim().max(300),
    supportEmail: z.union([z.email(), z.literal('')]),
    timezone: z.string().trim().max(60),
    dateFormat: z.string().trim().max(30),
    currency: z.string().trim().max(8),
  })
  .partial();

// ── AI model registry ────────────────────────────────────────────────────────
/**
 * Registering a model records one that already exists elsewhere.
 *
 * Nothing here trains anything — the platform does not host training — so the
 * fields are the ones a registry needs to answer "what is running, whose is it,
 * and when was it last retrained".
 */
export const createAiModelSchema = z.object({
  name: z.string().trim().min(2).max(120),
  task: z.string().trim().min(2).max(120),
  status: z.enum(['Production', 'Staging', 'Training', 'Retired']).default('Staging'),
  version: z.string().trim().min(1).max(30).default('v1.0'),
  accuracy: z.coerce.number().min(0).max(100).default(0),
  driftPct: z.coerce.number().min(0).max(100).default(0),
  lastTrained: z.iso.datetime({ offset: true }).or(z.iso.date()),
  owner: z.string().trim().min(2).max(120),
  framework: z.string().trim().min(1).max(60).default('scikit-learn'),
  predictionsPerDay: z.coerce.number().int().min(0).default(0),
});

export const updateAiModelSchema = createAiModelSchema.partial();

// ── Passkeys ─────────────────────────────────────────────────────────────────
export const createPasskeySchema = z.object({
  name: z.string().trim().min(1).max(80),
  kind: z.string().trim().max(80).default('Platform authenticator'),
});

export type CreateIntegrationInput = z.infer<typeof createIntegrationSchema>;
export type CreateApprovalWorkflowInput = z.infer<typeof createApprovalWorkflowSchema>;
export type CreateChecklistTemplateInput = z.infer<typeof createChecklistTemplateSchema>;
export type CreateReportSubscriptionInput = z.infer<typeof createReportSubscriptionSchema>;
export type UpdateReportSubscriptionInput = z.infer<typeof updateReportSubscriptionSchema>;
export type UpdateOrgSettingsInput = z.infer<typeof updateOrgSettingsSchema>;
export type CreatePasskeyInput = z.infer<typeof createPasskeySchema>;
