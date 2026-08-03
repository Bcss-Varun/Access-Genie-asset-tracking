import { z } from 'zod';
import {
  ASSET_CATEGORIES,
  ASSET_HEALTHS,
  ASSET_STATUSES,
  CRITICALITIES,
  TRACKING_TECHS,
} from '@access-genie/shared';
import { csvString, isoDateString, listQuerySchema } from './common.js';

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
  custodian: z.string().trim().min(2).max(120),
  purchaseDate: isoDateString,
  purchasePrice: z.number().min(0),
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
});

/** Everything is optional on update, but `id` can never be reassigned. */
export const updateAssetSchema = createAssetSchema.omit({ id: true }).partial();

export type AssetListQuery = z.infer<typeof assetListQuerySchema>;
export type CreateAssetInput = z.infer<typeof createAssetSchema>;
export type UpdateAssetInput = z.infer<typeof updateAssetSchema>;
