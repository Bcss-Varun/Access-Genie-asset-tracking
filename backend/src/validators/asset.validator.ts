import { z } from 'zod';
import {
  ASSET_CATEGORIES,
  ASSET_HEALTHS,
  ASSET_STATUSES,
  BINDING_STATES,
  CRITICALITIES,
  DOC_TYPES,
  OWNERSHIPS,
  REGISTRATION_STATES,
  SENSOR_KINDS,
  SOURCE_KEYS,
  TAG_ROLES,
  TRACKING_INTENTS,
  TRACKING_TECHS,
} from '@access-genie/shared';
import { blankToUndefined, csvString, isoDateString, listQuerySchema } from './common.js';

export const assetListQuerySchema = listQuerySchema.extend({
  status: csvString,
  category: csvString,
  health: csvString,
  criticality: csvString,
  trackingTech: csvString,
  facility: z.string().trim().optional(),
  /** `?tracked=true` → only assets bonded to a physical tag. */
  tracked: z.coerce.boolean().optional(),
});

const locationSchema = z.object({
  id: z.string().trim().min(1),
  name: z.string().trim().min(1),
  building: z.string().trim().optional(),
  floor: z.string().trim().optional(),
  zone: z.string().trim().optional(),
  coordinates: z.object({ lat: z.number(), lng: z.number() }).optional(),
});

const telemetrySchema = z.object({
  temperature: z.number().optional(),
  humidity: z.number().min(0).max(100).optional(),
  vibration: z.number().min(0).optional(),
  batteryLevel: z.number().min(0).max(100).optional(),
  lastPing: isoDateString,
});

/**
 * The registration record, validated as strictly as the asset it hangs off:
 * this is what decides whether an asset may be activated, so a mistyped gate
 * or binding state has to fail here rather than silently weaken the policy.
 */
const tagBindingSchema = z.object({
  id: z.string().trim().min(1),
  tagId: z.string().trim().min(1).max(64),
  kind: z.enum(SENSOR_KINDS),
  role: z.enum(TAG_ROLES),
  state: z.enum(BINDING_STATES),
  boundAt: isoDateString,
  verifiedAt: isoDateString.optional(),
  replacedTagId: z.string().trim().max(64).optional(),
  retiredAt: isoDateString.optional(),
});

const commercialSchema = z.object({
  ownership: z.enum(OWNERSHIPS),
  purchaseDate: isoDateString.optional(),
  commissionDate: isoDateString.optional(),
  purchasePrice: z.number().min(0).optional(),
  vendor: z.string().trim().max(120).optional(),
  poRef: z.string().trim().max(60).optional(),
  warrantyStart: isoDateString.optional(),
  warrantyEnd: isoDateString.optional(),
  amcEnd: isoDateString.optional(),
  lessor: z.string().trim().max(120).optional(),
  returnDate: isoDateString.optional(),
  depreciationMethod: z.string().trim().max(80).optional(),
  usefulLifeYears: z.number().int().min(1).max(40).optional(),
});

const onboardingInputSchema = z.object({
  state: z.enum(REGISTRATION_STATES),
  source: z.enum(SOURCE_KEYS),
  classId: z.string().trim().min(1),
  registeredAt: isoDateString,
  registeredBy: z.string().trim().min(1).max(120),
  activatedAt: isoDateString.optional(),
  attributes: z.record(z.string(), z.union([z.string(), z.boolean()])).default({}),
  department: z.string().trim().max(120).optional(),
  locationConfirmed: z.boolean().default(false),
  trackingIntent: z.enum(TRACKING_INTENTS),
  bindings: z.array(tagBindingSchema).max(20).default([]),
  monitoringProfileId: z.string().trim().max(60).nullable().default(null),
  monitoringDecided: z.boolean().default(false),
  monitoringOverridden: z.boolean().default(false),
  maintenancePlan: z.enum(['class-default', 'run-to-failure']).nullable().default(null),
  commercial: commercialSchema,
  documents: z
    .array(
      z.object({
        id: z.string().trim().min(1),
        name: z.string().trim().min(1).max(200),
        type: z.enum(DOC_TYPES),
        sizeKb: z.number().min(0).optional(),
        addedAt: isoDateString.optional(),
      }),
    )
    .max(50)
    .default([]),
  duplicateAck: isoDateString.optional(),
  voidedAt: isoDateString.optional(),
});

export const createAssetSchema = z.object({
  /** Optional — omit it and the server mints the next `AST-…` from the counter. */
  id: z.string().trim().regex(/^AST-\d+$/, 'Asset IDs look like AST-1042').optional(),
  name: z.string().trim().min(2).max(120),
  category: z.enum(ASSET_CATEGORIES),
  serialNumber: z.string().trim().min(2).max(64),
  status: z.enum(ASSET_STATUSES).default('Active'),
  healthScore: z.number().int().min(0).max(100).default(100),
  healthStatus: z.enum(ASSET_HEALTHS).optional(), // derived server-side
  location: locationSchema,
  /**
   * Both of these are optional on create, and that is the point of the
   * registration flow rather than an oversight.
   *
   * "Commit early, enrich forever" (docs/21) means an asset becomes a real
   * record the moment it has an identity — before anyone has decided who holds
   * it or dug the invoice out. Requiring a custodian and a purchase date here
   * made every registration from a blank source fail validation, because the
   * flow sends what it honestly has: nothing.
   *
   * They stay required on the *stored* document, so nothing downstream has to
   * handle a missing value: an unclaimed asset is explicitly `Unassigned`, and
   * an undated one is dated from its registration. The Configure cards
   * overwrite both as soon as the real answers arrive.
   */
  custodian: blankToUndefined(z.string().trim().min(2).max(120).optional()),
  purchaseDate: blankToUndefined(isoDateString.optional()),
  purchasePrice: z.number().min(0).default(0),
  tags: z.array(z.string().trim().min(1)).max(20).default([]),
  telemetry: telemetrySchema.optional(),

  manufacturer: z.string().trim().max(80).optional(),
  model: z.string().trim().max(80).optional(),
  criticality: z.enum(CRITICALITIES).optional(),
  riskScore: z.number().int().min(0).max(100).optional(),
  utilization: z.number().int().min(0).max(100).optional(),
  bookValue: z.number().min(0).optional(),
  depreciationMethod: z.string().trim().max(80).optional(),
  warrantyExpiry: isoDateString.optional(),
  trackingTech: z.enum(TRACKING_TECHS).optional(),
  trackingId: z.string().trim().max(64).optional(),
  lifecycleStage: z.string().trim().max(60).optional(),
  mapPosition: z.object({ x: z.number().min(0).max(100), y: z.number().min(0).max(100) }).optional(),
  healthTrend: z.array(z.object({ label: z.string(), value: z.number() })).max(24).optional(),
  onboarding: onboardingInputSchema.optional(),
});

/** Everything is optional on update, but `id` can never be reassigned. */
export const updateAssetSchema = createAssetSchema.omit({ id: true }).partial();

export type AssetListQuery = z.infer<typeof assetListQuerySchema>;
export type CreateAssetInput = z.infer<typeof createAssetSchema>;
export type UpdateAssetInput = z.infer<typeof updateAssetSchema>;
