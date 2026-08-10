import { Schema } from 'mongoose';
import {
  BINDING_STATES,
  DOC_TYPES,
  OWNERSHIPS,
  REGISTRATION_STATES,
  SENSOR_KINDS,
  SOURCE_KEYS,
  TAG_ROLES,
  TRACKING_INTENTS,
} from '@access-genie/shared';

/**
 * The registration record that travels with an asset.
 *
 * This is embedded in the asset rather than kept in its own collection because
 * it is never read without it: "commit early, enrich forever" means an asset
 * created at Stage B is a real record from that moment, and its readiness gates,
 * tag bindings and commercial terms are facets of that same object, not
 * separate entities with their own lifecycle.
 *
 * Embedding also makes activation atomic: the gate checks and the state change
 * are one document write, so an asset can never be half-activated.
 */

const tagBindingSchema = new Schema(
  {
    id: { type: String, required: true },
    tagId: { type: String, required: true },
    kind: { type: String, required: true, enum: SENSOR_KINDS },
    role: { type: String, required: true, enum: TAG_ROLES },
    state: { type: String, required: true, enum: BINDING_STATES, default: 'Bound' },
    boundAt: { type: Date, required: true },
    verifiedAt: Date,
    /** Set when this binding replaced a damaged tag — keeps the trail unbroken. */
    replacedTagId: String,
    /** Retired bindings are kept, never deleted, so a tag swap stays auditable. */
    retiredAt: Date,
  },
  { _id: false },
);

const commercialSchema = new Schema(
  {
    ownership: { type: String, required: true, enum: OWNERSHIPS, default: 'Owned' },
    purchaseDate: Date,
    commissionDate: Date,
    purchasePrice: { type: Number, min: 0 },
    vendor: String,
    poRef: String,
    warrantyStart: Date,
    warrantyEnd: Date,
    amcEnd: Date,
    /** Leased assets: who owns it, and when it goes back. */
    lessor: String,
    returnDate: Date,
    depreciationMethod: String,
    usefulLifeYears: { type: Number, min: 1, max: 40 },
  },
  { _id: false },
);

const onboardingDocSchema = new Schema(
  {
    id: { type: String, required: true },
    name: { type: String, required: true },
    type: { type: String, required: true, enum: DOC_TYPES },
    sizeKb: { type: Number, min: 0 },
    addedAt: Date,
  },
  { _id: false },
);

export const onboardingSchema = new Schema(
  {
    state: { type: String, required: true, enum: REGISTRATION_STATES, default: 'Draft' },
    source: { type: String, required: true, enum: SOURCE_KEYS, default: 'blank' },
    /**
     * Optional, and stored as `''` when absent.
     *
     * A blank registration genuinely has no class — the whole premise of that
     * source is that nobody has decided what the thing is yet. Requiring one
     * here made "add the asset now, classify it later" impossible, which is the
     * single most common way a legacy asset enters the register.
     */
    classId: { type: String, default: '' },
    registeredAt: { type: Date, required: true },
    registeredBy: { type: String, required: true },
    activatedAt: Date,

    /** Class-specific attribute values captured at Stage B. */
    attributes: { type: Map, of: Schema.Types.Mixed, default: {} },

    /** The template this asset was registered from, when it came from one. */
    templateId: { type: String, ref: 'AssetTemplate' },
    /** The asset this one was cloned from — kept so provenance survives. */
    clonedFromId: { type: String, ref: 'Asset' },

    /**
     * Your own inventory sticker, distinct from the manufacturer's serial and
     * from a tracking tag. Uniqueness is enforced by a partial index on the
     * asset (see models/Asset.ts) so any number of assets may have none.
     */
    assetTag: { type: String, trim: true, default: '' },

    // Place
    department: String,
    /**
     * Who holds it, as an employee number.
     *
     * The old flow could only assign to a registered platform user, which meant
     * the majority of custodians — people who never sign in — could not be
     * recorded at all. Custodian is now free text and this is the identifier
     * that makes it resolvable; it is required whenever a custodian is named.
     */
    custodianEmployeeId: { type: String, trim: true, default: '' },
    locationConfirmed: { type: Boolean, default: false },

    // Track
    trackingIntent: { type: String, required: true, enum: TRACKING_INTENTS, default: 'pending' },
    bindings: { type: [tagBindingSchema], default: [] },

    // Protect — a null profile with `monitoringDecided` set means "none, by policy".
    monitoringProfileId: { type: String, default: null },
    monitoringDecided: { type: Boolean, default: false },
    /** True when someone overrode the class profile for this asset alone. */
    monitoringOverridden: { type: Boolean, default: false },

    // Maintain
    maintenancePlan: { type: String, enum: ['class-default', 'run-to-failure', null], default: null },

    /**
     * Support contract, if there is one.
     *
     * Gated behind `hasContract` because most assets have no contract at all —
     * asking every registration for a provider and an expiry produced a section
     * that was empty on the majority of records.
     */
    maintenance: {
      type: new Schema(
        {
          hasContract: { type: Boolean, default: false },
          provider: String,
          reference: String,
        },
        { _id: false },
      ),
      default: () => ({ hasContract: false }),
    },

    // Commercial + documents
    commercial: { type: commercialSchema, default: () => ({ ownership: 'Owned' }) },
    documents: { type: [onboardingDocSchema], default: [] },

    /** Recorded when the registrant declared a fuzzy match "not a duplicate". */
    duplicateAck: String,
    /** Voided registrations keep their stream but drop out of the registry. */
    voidedAt: Date,
  },
  { _id: false },
);
