import type { NumberedEntity, NumberingRule as NumberingRuleView } from '@access-genie/shared';
import {
  Counter,
  NumberingRule,
  ScopeNodeModel,
  nextId,
  type NumberingRuleDoc,
  type ScopeNodeDoc,
} from '../models/index.js';
import { ApiError } from '../utils/ApiError.js';
import { logger } from '../config/logger.js';

/**
 * ID generation, driven by configuration rather than by fifty hard-coded
 * prefixes.
 *
 * `mintId` is the entry point every creating service calls. If an active rule
 * governs the entity it renders that rule's pattern; if none does, it falls
 * straight through to the original `nextId`, so a deployment that configures
 * nothing behaves exactly as it did before this file existed. That fallback is
 * what makes the feature additive against fifty-three existing call sites
 * instead of a migration of all of them.
 *
 * **Concurrency.** The number itself still comes from `Counter.findOneAndUpdate`
 * with `$inc`, which is atomic in MongoDB: two simultaneous creates take two
 * different numbers, never the same one twice. Nothing here reads-then-writes,
 * because that is precisely the pattern that produces duplicates under load.
 *
 * The counter *key* encodes the rule and the sequence scope, so a per-facility
 * rule keeps one run of numbers per site. Sharing a key across scopes would make
 * `HYD-00001` and `PUN-00001` fight over the same counter; keying them apart is
 * what lets both be a legitimate first number.
 */

// ── Codes ────────────────────────────────────────────────────────────────────

/**
 * A short code for a name — `Hyderabad warehouse` → `HYD`, `Laptops` → `LAP`.
 *
 * Derived rather than stored because the alternative is a code field on every
 * facility and every category that somebody has to keep in step with the name.
 * Deriving it means the code follows the rename, and the pattern token is
 * documented as doing exactly this so nobody expects a stable external key from
 * it.
 */
export function shortCode(name: string | undefined, fallback = 'GEN'): string {
  const letters = (name ?? '').toUpperCase().replace(/[^A-Z0-9]/g, '');
  return letters.slice(0, 3) || fallback;
}

// ── Rule matching ────────────────────────────────────────────────────────────

/** Every ancestor of a node, nearest first, including the node itself. */
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

export interface MintContext {
  /** Where the record sits, for `{FACILITY}` and for facility-scoped rules. */
  scopeId?: string;
  facilityName?: string;
  /** The record's category, for `{CATEGORY}` and for category-limited rules. */
  category?: string;
}

/**
 * The rule governing this entity here, or null.
 *
 * Most specific wins, the same order approval workflows use: a rule scoped to
 * the nearest ancestor beats one scoped further up, which beats an unscoped one.
 * A rule limited to particular categories only applies when the record is in one
 * of them.
 */
export async function resolveRule(
  entity: NumberedEntity,
  context: MintContext = {},
): Promise<NumberingRuleDoc | null> {
  const candidates = await NumberingRule.find({ entity, status: 'active' }).lean<NumberingRuleDoc[]>();
  if (candidates.length === 0) return null;

  const applies = (rule: NumberingRuleDoc) =>
    rule.categories.length === 0 || (context.category ? rule.categories.includes(context.category) : false);

  const chain = await ancestorChain(context.scopeId);
  for (const nodeId of chain) {
    const match = candidates.find((r) => r.scopeId === nodeId && applies(r));
    if (match) return match;
  }
  return candidates.find((r) => !r.scopeId && applies(r)) ?? null;
}

// ── Rendering ────────────────────────────────────────────────────────────────

/** The counter key for a rule and the scope its sequence runs within. */
function counterKey(rule: NumberingRuleDoc, context: MintContext): string {
  switch (rule.sequenceScope) {
    case 'facility':
      return `num:${rule._id}:${context.scopeId ?? 'unscoped'}`;
    case 'category':
      return `num:${rule._id}:${context.category ?? 'uncategorised'}`;
    default:
      return `num:${rule._id}`;
  }
}

/**
 * Fill a pattern's tokens. `seq` is already reserved by the caller.
 *
 * Unknown `{...}` tokens are left standing rather than blanked, so a typo shows
 * up in the preview as itself instead of silently vanishing into an ID that then
 * gets printed on a label.
 */
export function renderPattern(pattern: string, rule: NumberingRuleDoc, context: MintContext, seq: number): string {
  const now = new Date();
  return pattern.replace(/\{(PREFIX|CATEGORY|FACILITY|YYYY|YY|MM|SEQ)(?::(\d+))?\}/g, (_match, token, width) => {
    switch (token) {
      case 'PREFIX':
        return rule.prefix;
      case 'CATEGORY':
        return shortCode(context.category, 'GEN');
      case 'FACILITY':
        return shortCode(context.facilityName, 'ORG');
      case 'YYYY':
        return String(now.getFullYear());
      case 'YY':
        return String(now.getFullYear()).slice(-2);
      case 'MM':
        return String(now.getMonth() + 1).padStart(2, '0');
      case 'SEQ':
        return width ? String(seq).padStart(Number(width), '0') : String(seq);
      default:
        return _match;
    }
  });
}

/**
 * Reserve the next number for a rule. Atomic — see the note at the top.
 *
 * `startAt` is honoured by seeding the counter the first time it is touched:
 * `$inc` on a missing document starts from 1, so a rule starting at 1000 needs
 * the offset applied on creation rather than added on every read (which would
 * shift the whole run every time somebody edited the rule).
 */
async function reserve(rule: NumberingRuleDoc, context: MintContext): Promise<number> {
  const key = counterKey(rule, context);
  const existing = await Counter.findById(key).lean();

  if (!existing && rule.startAt > 1) {
    // Seed to one below the start, so the first `$inc` lands exactly on it.
    await Counter.updateOne({ _id: key }, { $setOnInsert: { seq: rule.startAt - 1 } }, { upsert: true });
  }

  const counter = await Counter.findByIdAndUpdate(
    key,
    { $inc: { seq: 1 } },
    { new: true, upsert: true, setDefaultsOnInsert: true },
  ).lean();

  return counter?.seq ?? rule.startAt;
}

/**
 * The ID for a new record of this entity.
 *
 * `legacyName`/`legacyPrefix` are the arguments the original `nextId` took, and
 * are used verbatim when no rule applies — so a caller passes what it always
 * passed and gains configurability without changing behaviour by default.
 */
export async function mintId(
  entity: NumberedEntity,
  legacyName: string,
  legacyPrefix: string,
  context: MintContext = {},
): Promise<string> {
  const rule = await resolveRule(entity, context);
  if (!rule) return nextId(legacyName, legacyPrefix);

  try {
    const seq = await reserve(rule, context);
    return renderPattern(rule.pattern, rule, context, seq);
  } catch (err) {
    // A broken rule must not stop somebody registering an asset. Falling back
    // keeps the create working and leaves a loud trace of the rule that failed.
    logger.error('Numbering rule failed; falling back to the default sequence', {
      ruleId: rule._id,
      entity,
      err: String(err),
    });
    return nextId(legacyName, legacyPrefix);
  }
}

// ── Reads ────────────────────────────────────────────────────────────────────

/** How many IDs a rule has issued, across all its sequences. */
async function issuedCount(rule: NumberingRuleDoc): Promise<number> {
  const rows = await Counter.find({ _id: new RegExp(`^num:${rule._id}(:|$)`) }).lean();
  return rows.reduce((total, row) => total + Math.max(0, row.seq - (rule.startAt - 1)), 0);
}

/**
 * What the next ID would look like, without consuming a number.
 *
 * Reads the counter rather than incrementing it — a preview that burned a
 * sequence value every time somebody opened the screen would leave gaps in the
 * numbering that nobody could account for.
 */
export async function previewNext(rule: NumberingRuleDoc, context: MintContext = {}): Promise<string> {
  const key = counterKey(rule, context);
  const counter = await Counter.findById(key).lean();
  const seq = counter ? counter.seq + 1 : Math.max(1, rule.startAt);
  return renderPattern(rule.pattern, rule, context, seq);
}

export async function toView(doc: NumberingRuleDoc): Promise<NumberingRuleView> {
  const scope = doc.scopeId ? await ScopeNodeModel.findById(doc.scopeId).lean() : null;
  const context: MintContext = {
    scopeId: doc.scopeId,
    facilityName: scope?.name,
    category: doc.categories[0],
  };

  return {
    id: doc._id,
    name: doc.name,
    entity: doc.entity,
    prefix: doc.prefix,
    pattern: doc.pattern,
    startAt: doc.startAt,
    sequenceScope: doc.sequenceScope,
    categories: doc.categories,
    scopeId: doc.scopeId,
    scopeName: scope?.name,
    status: doc.status,
    createdBy: doc.createdBy ?? '',
    createdAt: doc.createdAt?.toISOString() ?? '',
    updatedAt: doc.updatedAt?.toISOString() ?? '',
    preview: await previewNext(doc, context),
    issued: await issuedCount(doc),
  };
}

export async function listRules(): Promise<NumberingRuleView[]> {
  const rows = await NumberingRule.find().sort({ entity: 1, name: 1 }).lean<NumberingRuleDoc[]>();
  return Promise.all(rows.map(toView));
}

/**
 * Activating a rule is the one edit that can collide, because the unique index
 * only permits one active rule per entity and scope. Turned into a readable
 * conflict rather than a raw duplicate-key error.
 */
export function describeDuplicate(entity: string): ApiError {
  return ApiError.conflict(
    `Another numbering rule for ${entity} is already active in this scope. Deactivate it first — only one rule can issue IDs for a given entity and location.`,
  );
}
