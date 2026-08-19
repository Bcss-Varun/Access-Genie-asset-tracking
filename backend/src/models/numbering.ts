import { model, Schema } from 'mongoose';
import {
  NUMBERED_ENTITIES,
  SEQUENCE_SCOPES,
  type NumberedEntity,
  type SequenceScope,
} from '@access-genie/shared';
import { baseSchemaPlugin } from '../utils/mongoose.js';

/**
 * How business IDs are shaped.
 *
 * The platform has always minted human-readable IDs from an atomic counter —
 * `AST-1042`, `WO-2051` — with the prefix hard-coded at each of fifty-odd call
 * sites. This makes that shape configuration without moving the generation off
 * the server or weakening the guarantee that made the counter safe.
 *
 * Two invariants carry the design.
 *
 * **At most one active rule per entity and scope.** Uniqueness of the generated
 * ID rests on the counter being atomic *and* on no two rules producing the same
 * string. Enforced with a partial unique index rather than a check in the
 * service, because two concurrent writes can both pass a check and only an index
 * can refuse the second one.
 *
 * **A rule never rewrites what already exists.** It governs the next ID minted
 * and nothing else. Records created before it — or under a previous rule — keep
 * the IDs they were issued, which is the only safe answer when those IDs are
 * printed on labels and quoted in tickets.
 */

export interface NumberingRuleDoc {
  _id: string; // NUM-1
  name: string;
  entity: NumberedEntity;
  prefix: string;
  pattern: string;
  startAt: number;
  sequenceScope: SequenceScope;
  categories: string[];
  scopeId?: string;
  status: 'active' | 'inactive';
  createdBy: string;
  createdAt: Date;
  updatedAt: Date;
}

const numberingRuleSchema = new Schema<NumberingRuleDoc>(
  {
    _id: { type: String, required: true },
    name: { type: String, required: true, trim: true },
    entity: { type: String, required: true, enum: NUMBERED_ENTITIES, index: true },
    prefix: { type: String, required: true, trim: true, uppercase: true },
    pattern: { type: String, required: true, trim: true },
    startAt: { type: Number, required: true, default: 1, min: 0 },
    sequenceScope: { type: String, required: true, enum: SEQUENCE_SCOPES, default: 'global' },
    categories: { type: [String], default: [] },
    scopeId: { type: String, index: true },
    status: { type: String, required: true, enum: ['active', 'inactive'], default: 'inactive', index: true },
    createdBy: { type: String, default: '' },
  },
  { versionKey: false, timestamps: true },
);

numberingRuleSchema.plugin(baseSchemaPlugin);

/*
 * One active rule per entity per scope, enforced by the database.
 *
 * Partial, so any number of `inactive` drafts can sit alongside the live one —
 * an administrator has to be able to prepare a replacement without first
 * switching off the rule currently issuing IDs.
 *
 * `scopeId` is part of the key because a facility-specific rule legitimately
 * coexists with the organisation-wide one; which of them applies is resolved by
 * specificity at generation time, exactly as approval workflows are matched.
 */
numberingRuleSchema.index(
  { entity: 1, scopeId: 1 },
  { unique: true, partialFilterExpression: { status: 'active' } },
);

export const NumberingRule = model<NumberingRuleDoc>('NumberingRule', numberingRuleSchema);
