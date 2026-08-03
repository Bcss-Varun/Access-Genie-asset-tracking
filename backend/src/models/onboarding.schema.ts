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
    classId: { type: String, required: true, ref: 'AssetClass' },
    registeredAt: { type: Date, required: true },
    registeredBy: { type: String, required: true },
    activatedAt: Date,

    /** Class-specific attribute values captured at Stage B. */
    attributes: { type: Map, of: Schema.Types.Mixed, default: {} },

    // Place
    department: String,
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
