import type {
  NotificationChannel,
  NotificationEvent,
  NotificationRule as NotificationRuleView,
  RoleId,
} from '@access-genie/shared';
import {
  NotificationRule,
  NotificationRuleLog,
  ScopeNodeModel,
  User,
  nextId,
  type NotificationRuleDoc,
  type NotificationRuleLogDoc,
  type ScopeNodeDoc,
} from '../models/index.js';
import { notify } from './notification.service.js';
import { logger } from '../config/logger.js';

/**
 * The notification rule engine.
 *
 * `fireEvent` is called from the code paths that actually do the thing — an
 * approval opening, a transfer being raised, an asset's status changing. That
 * direction matters: the rules screen configures reactions to events the system
 * already emits, rather than describing events somebody still has to wire up.
 *
 * The pipeline for each event, in order, is the one the brief asks for:
 *
 *   EVENT → CONDITION → CHANNEL → RECIPIENT → THROTTLE → QUIET HOURS
 *
 * Every outcome is written to the log, including the ones where nothing was
 * sent. "Throttled" and "inside quiet hours" are correct behaviour, not
 * failures, and a log that only recorded successes would make a working rule
 * indistinguishable from a silent one.
 *
 * Nothing here throws into its caller. A notification that cannot be delivered
 * must never fail the transfer that triggered it — the same rule `recordAudit`
 * and `notify` already follow.
 */

// ── Conditions ───────────────────────────────────────────────────────────────

export type EventPayload = Record<string, unknown> & {
  subjectId?: string;
  scopeId?: string;
  actorId?: string;
  actorName?: string;
};

function compare(actual: unknown, op: string, expected: unknown): boolean {
  switch (op) {
    case 'eq':
      return String(actual) === String(expected);
    case 'neq':
      return String(actual) !== String(expected);
    case 'in':
      return Array.isArray(expected) && expected.map(String).includes(String(actual));
    case 'gt':
      return Number(actual) > Number(expected);
    case 'lt':
      return Number(actual) < Number(expected);
    default:
      return false;
  }
}

/** All conditions must hold. An empty list matches everything. */
function conditionsMatch(rule: NotificationRuleDoc, payload: EventPayload): boolean {
  return rule.conditions.every((c) => compare(payload[c.field], c.op, c.value));
}

// ── Scope ────────────────────────────────────────────────────────────────────

async function ancestorChain(nodeId: string | undefined): Promise<string[]> {
  if (!nodeId) return [];
  const rows = await ScopeNodeModel.find().select('parentId').lean<ScopeNodeDoc[]>();
  const byId = new Map(rows.map((r) => [r._id, r]));
  const chain: string[] = [];
  const seen = new Set<string>();
  let cursor: string | undefined = nodeId;
  while (cursor && !seen.has(cursor)) {
    seen.add(cursor);
    chain.push(cursor);
    cursor = byId.get(cursor)?.parentId;
  }
  return chain;
}

/** A scoped rule only fires for events inside its branch of the tree. */
async function scopeMatches(rule: NotificationRuleDoc, payload: EventPayload): Promise<boolean> {
  if (!rule.scopeId) return true;
  const chain = await ancestorChain(payload.scopeId);
  return chain.includes(rule.scopeId);
}

// ── Recipients ───────────────────────────────────────────────────────────────

/** Resolve a rule's recipient specs to concrete, active user ids. */
async function resolveRecipients(rule: NotificationRuleDoc, payload: EventPayload): Promise<string[]> {
  const ids = new Set<string>();

  for (const spec of rule.recipients) {
    if (spec.kind === 'user' && spec.value) {
      ids.add(spec.value);
    } else if (spec.kind === 'requester' && payload.actorId) {
      ids.add(payload.actorId);
    } else if (spec.kind === 'role' && spec.value) {
      const holders = await User.find({ roleId: spec.value, status: 'active' }).select('_id').lean<{ _id: string }[]>();
      for (const holder of holders) ids.add(holder._id);
    }
  }

  return [...ids];
}

// ── Throttle and quiet hours ─────────────────────────────────────────────────

/**
 * Has this rule sent recently enough that this one should be suppressed?
 *
 * Measured from the log rather than from a field on the rule, because the log is
 * the record of what actually went out — and because "once per day" has to
 * survive a restart, which an in-memory timer would not.
 */
async function isThrottled(rule: NotificationRuleDoc): Promise<boolean> {
  if (rule.throttleMinutes <= 0) return false;
  const since = new Date(Date.now() - rule.throttleMinutes * 60_000);
  const recent = await NotificationRuleLog.findOne({
    ruleId: rule._id,
    outcome: 'sent',
    at: { $gte: since },
  }).lean();
  return Boolean(recent);
}

/**
 * Is `now` inside the rule's quiet window?
 *
 * Handles a window that wraps midnight (22:00–07:00), which is the common case
 * and the one a naive `start <= now <= end` gets wrong.
 */
export function inQuietHours(quiet: { enabled: boolean; start: string; end: string }, now = new Date()): boolean {
  if (!quiet.enabled) return false;

  const toMinutes = (hhmm: string) => {
    const [h = '0', m = '0'] = hhmm.split(':');
    return Number(h) * 60 + Number(m);
  };

  const current = now.getHours() * 60 + now.getMinutes();
  const start = toMinutes(quiet.start);
  const end = toMinutes(quiet.end);

  return start <= end ? current >= start && current < end : current >= start || current < end;
}

// ── Firing ───────────────────────────────────────────────────────────────────

async function writeLog(entry: Omit<NotificationRuleLogDoc, '_id'>): Promise<void> {
  try {
    await NotificationRuleLog.create({ ...entry, _id: await nextId('notificationRuleLog', 'NRL') });
  } catch (err) {
    logger.error('Could not write the notification rule log', { err: String(err) });
  }
}

export interface FireResult {
  ruleId: string;
  outcome: NotificationRuleLogDoc['outcome'];
  recipients: string[];
}

/**
 * Run every active rule for an event.
 *
 * Fire-and-forget by contract: callers do not await a delivery decision before
 * completing their own work, and any error is logged rather than propagated.
 */
export async function fireEvent(
  event: NotificationEvent,
  payload: EventPayload,
  title: string,
  body: string,
): Promise<FireResult[]> {
  const results: FireResult[] = [];

  try {
    const rules = await NotificationRule.find({ event, status: 'active' }).lean<NotificationRuleDoc[]>();

    for (const rule of rules) {
      if (!conditionsMatch(rule, payload)) continue;
      if (!(await scopeMatches(rule, payload))) continue;

      const base = {
        ruleId: rule._id,
        ruleName: rule.name,
        event,
        at: new Date(),
        subjectId: payload.subjectId,
        channels: rule.channels,
      };

      const recipients = await resolveRecipients(rule, payload);
      if (recipients.length === 0) {
        await writeLog({ ...base, recipients: [], outcome: 'no_recipients', detail: 'No active user matched the recipients' });
        results.push({ ruleId: rule._id, outcome: 'no_recipients', recipients: [] });
        continue;
      }

      if (await isThrottled(rule)) {
        await writeLog({ ...base, recipients, outcome: 'throttled', detail: `Throttled to one per ${rule.throttleMinutes} minutes` });
        results.push({ ruleId: rule._id, outcome: 'throttled', recipients });
        continue;
      }

      if (inQuietHours(rule.quietHours)) {
        await writeLog({ ...base, recipients, outcome: 'quiet_hours', detail: `Quiet hours ${rule.quietHours.start}–${rule.quietHours.end}` });
        results.push({ ruleId: rule._id, outcome: 'quiet_hours', recipients });
        continue;
      }

      for (const userId of recipients) {
        await notify({ title, body, category: 'Automation', userId });
      }

      await NotificationRule.updateOne(
        { _id: rule._id },
        { $inc: { sentCount: recipients.length }, $set: { lastFiredAt: new Date() } },
      );
      await writeLog({ ...base, recipients, outcome: 'sent' });
      results.push({ ruleId: rule._id, outcome: 'sent', recipients });
    }
  } catch (err) {
    // Never fail the caller's transaction over a notification.
    logger.error('Notification rule evaluation failed', { event, err: String(err) });
  }

  return results;
}

/**
 * Send this rule to its recipients now, ignoring throttle and quiet hours.
 *
 * A test send is somebody asking "does this reach the right people" — applying
 * the suppression rules would make the answer "nothing happened", which is
 * exactly the thing they are trying to rule out. Logged as `test` so it is never
 * confused with a real firing.
 */
export async function testSend(id: string, actorName: string): Promise<FireResult> {
  const rule = await NotificationRule.findById(id).lean<NotificationRuleDoc>();
  if (!rule) throw new Error('Rule not found');

  const recipients = await resolveRecipients(rule, {});
  const base = {
    ruleId: rule._id,
    ruleName: rule.name,
    event: rule.event,
    at: new Date(),
    channels: rule.channels,
  };

  if (recipients.length === 0) {
    await writeLog({ ...base, recipients: [], outcome: 'no_recipients', detail: 'Test send: no active user matched' });
    return { ruleId: rule._id, outcome: 'no_recipients', recipients: [] };
  }

  for (const userId of recipients) {
    await notify({
      title: `[Test] ${rule.name}`,
      body: `Test notification for "${rule.name}", sent by ${actorName}. This is what ${rule.event} would deliver.`,
      category: 'Automation',
      userId,
    });
  }

  await writeLog({ ...base, recipients, outcome: 'test', detail: `Test send by ${actorName}` });
  return { ruleId: rule._id, outcome: 'test', recipients };
}

/** What a rule would say, without sending anything. */
export function previewMessage(rule: { name: string; event: NotificationEvent }): { title: string; body: string } {
  return {
    title: rule.name,
    body: `Triggered by ${rule.event}. The live message carries the record's own details — this preview shows the shape only.`,
  };
}

// ── Reads ────────────────────────────────────────────────────────────────────

export async function toView(doc: NotificationRuleDoc): Promise<NotificationRuleView> {
  const scope = doc.scopeId ? await ScopeNodeModel.findById(doc.scopeId).lean() : null;
  return {
    id: doc._id,
    name: doc.name,
    event: doc.event,
    conditions: doc.conditions,
    channels: doc.channels,
    recipients: doc.recipients,
    throttleMinutes: doc.throttleMinutes,
    quietHours: doc.quietHours,
    escalation: { ...doc.escalation, toRole: doc.escalation.toRole as RoleId | undefined },
    scopeId: doc.scopeId,
    scopeName: scope?.name,
    status: doc.status,
    createdBy: doc.createdBy ?? '',
    createdAt: doc.createdAt?.toISOString() ?? '',
    updatedAt: doc.updatedAt?.toISOString() ?? '',
    sentCount: doc.sentCount ?? 0,
    lastFiredAt: doc.lastFiredAt?.toISOString(),
  };
}

export async function listRules(): Promise<NotificationRuleView[]> {
  const rows = await NotificationRule.find().sort({ event: 1, name: 1 }).lean<NotificationRuleDoc[]>();
  return Promise.all(rows.map(toView));
}

export async function listLog(ruleId?: string, limit = 100) {
  const filter = ruleId ? { ruleId } : {};
  const rows = await NotificationRuleLog.find(filter).sort({ at: -1 }).limit(limit).lean<NotificationRuleLogDoc[]>();
  return rows.map((r) => ({
    id: r._id,
    ruleId: r.ruleId,
    ruleName: r.ruleName,
    event: r.event,
    at: r.at.toISOString(),
    subjectId: r.subjectId,
    recipients: r.recipients,
    channels: r.channels as NotificationChannel[],
    outcome: r.outcome,
    detail: r.detail,
  }));
}
