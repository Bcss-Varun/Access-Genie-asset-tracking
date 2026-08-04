import { z } from 'zod';

/**
 * Bodies for the platform collections that screens actually write to.
 *
 * These collections were read-only while their screens mutated React state — an
 * API key "revoked" in Administration came back on reload, a support ticket
 * raised from the help centre never existed. Each schema below is the contract
 * that stopped being implicit when those actions started reaching the database.
 */

// ── API credentials ──────────────────────────────────────────────────────────
/**
 * Note what is *not* here: the secret. The server mints the key, returns it
 * once, and stores only the last four characters — so this body describes what
 * the key may do, never what it is.
 */
export const createApiKeySchema = z.object({
  name: z.string().trim().min(1).max(80),
  scope: z.enum(['organization', 'personal']),
  scopes: z.array(z.string().trim().min(1).max(60)).max(30).default([]),
});

export const updateApiKeySchema = z
  .object({
    name: z.string().trim().min(1).max(80),
    scopes: z.array(z.string().trim().min(1).max(60)).max(30),
  })
  .partial();

// ── Webhooks ─────────────────────────────────────────────────────────────────
export const createWebhookSchema = z.object({
  url: z.url().max(500),
  events: z.array(z.string().trim().min(1).max(60)).min(1).max(30),
  enabled: z.boolean().default(true),
});

export const updateWebhookSchema = z
  .object({
    url: z.url().max(500),
    events: z.array(z.string().trim().min(1).max(60)).min(1).max(30),
    enabled: z.boolean(),
  })
  .partial();

// ── Teams ────────────────────────────────────────────────────────────────────
export const createTeamSchema = z.object({
  name: z.string().trim().min(1).max(80),
  emoji: z.string().trim().max(8).default('👥'),
  department: z.string().trim().min(1).max(80),
  description: z.string().trim().max(400).default(''),
  memberIds: z.array(z.string().trim().min(1).max(64)).max(200).default([]),
  extra: z.number().int().min(0).max(10_000).default(0),
});

export const updateTeamSchema = createTeamSchema.partial();

// ── Support ──────────────────────────────────────────────────────────────────
export const createSupportTicketSchema = z.object({
  subject: z.string().trim().min(1).max(160),
  category: z.string().trim().min(1).max(60),
  priority: z.string().trim().min(1).max(30).default('Normal'),
  body: z.string().trim().max(4000).optional(),
  // A ticket arrives open; the client does not get to declare it resolved.
  status: z.literal('Open').default('Open'),
});

export const updateSupportTicketSchema = z
  .object({
    subject: z.string().trim().min(1).max(160),
    category: z.string().trim().min(1).max(60),
    priority: z.string().trim().min(1).max(30),
    status: z.string().trim().min(1).max(30),
    body: z.string().trim().max(4000),
  })
  .partial();

// ── Governance ───────────────────────────────────────────────────────────────
const escalationTierSchema = z.object({
  tier: z.number().int().min(1).max(10),
  notify: z.string().trim().min(1).max(120),
  afterMin: z.number().int().min(0).max(10_080),
  channels: z.array(z.string().trim().min(1).max(40)).max(10).default([]),
});

export const createEscalationPolicySchema = z.object({
  name: z.string().trim().min(1).max(120),
  scope: z.string().trim().max(120).default(''),
  severity: z.string().trim().min(1).max(30),
  tone: z.string().trim().max(30).default('slate'),
  tiers: z.array(escalationTierSchema).max(10).default([]),
});

export const updateEscalationPolicySchema = createEscalationPolicySchema.partial();

/**
 * Deliberately narrow. Retention is a compliance control, so the screen may
 * change the period, the disposal method and the legal hold — never the data
 * class a policy applies to, which would silently re-point it at other records.
 */
export const updateRetentionPolicySchema = z
  .object({
    retention: z.string().trim().min(1).max(60),
    disposal: z.string().trim().min(1).max(120),
    legalHold: z.boolean(),
  })
  .partial();

/**
 * Creating one, unlike updating one, does name the data class: that is the
 * whole content of a new policy. Removing a class from the programme is the
 * only way to un-govern it, so delete is allowed too.
 */
export const createRetentionPolicySchema = z.object({
  dataClass: z.string().trim().min(1).max(80),
  retention: z.string().trim().min(1).max(60),
  disposal: z.string().trim().min(1).max(120),
  legalHold: z.boolean().default(false),
});

// ── Reports ──────────────────────────────────────────────────────────────────
export const createReportSchema = z.object({
  name: z.string().trim().min(1).max(160),
  category: z.string().trim().min(1).max(60),
  persona: z.string().trim().min(1).max(60),
  description: z.string().trim().max(500).default(''),
  format: z.string().trim().min(1).max(30),
  metrics: z.array(z.string().trim().min(1).max(60)).max(30).default([]),
  scheduled: z.boolean().default(false),
});

export const updateReportSchema = createReportSchema.partial();

// ── Exports ──────────────────────────────────────────────────────────────────
export const createExportJobSchema = z.object({
  report: z.string().trim().min(1).max(160),
  format: z.string().trim().min(1).max(20),
  requestedBy: z.string().trim().min(1).max(120),
  status: z.literal('Queued').default('Queued'),
  sizeKb: z.number().int().min(0).default(0),
});
