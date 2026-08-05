import { z } from 'zod';
import {
  GATEWAY_KINDS,
  GATEWAY_STATUSES,
  GEOFENCE_RULES,
  SENSOR_KINDS,
  SENSOR_STATUSES,
} from '@access-genie/shared';
import { csvString, isoDateString, listQuerySchema } from './common.js';

// ── Sensors / devices ────────────────────────────────────────────────────────
export const sensorListQuerySchema = listQuerySchema.extend({
  kind: csvString,
  status: csvString,
  gatewayId: z.string().trim().optional(),
  facility: z.string().trim().optional(),
  /** `?unassigned=true` → registered devices not yet bonded to an asset. */
  unassigned: z.coerce.boolean().optional(),
});

export const createSensorSchema = z.object({
  name: z.string().trim().min(2).max(120),
  kind: z.enum(SENSOR_KINDS),
  assetId: z.string().trim().optional(),
  status: z.enum(SENSOR_STATUSES).default('Online'),
  batteryLevel: z.number().int().min(0).max(100).optional(),
  signalStrength: z.number().int().min(0).max(100).default(100),
  firmwareVersion: z.string().trim().max(20).default('1.0.0'),
  gatewayId: z.string().trim().min(1),
  zone: z.string().trim().optional(),
  tagId: z.string().trim().max(64).optional(),
  facility: z.string().trim().optional(),
  lastReading: isoDateString.optional(),
});

export const updateSensorSchema = createSensorSchema.partial();

// ── Gateways ─────────────────────────────────────────────────────────────────
/**
 * Edge infrastructure — the readers and anchors sensors report through.
 *
 * This collection was read-only, which made the whole tracking chain a dead end
 * on a fresh deployment: a sensor requires a gateway, tag binding during asset
 * registration picks from sensor stock, and there was no way to create the
 * first gateway. Three screens that looked functional and could never be used.
 */
export const createGatewaySchema = z.object({
  name: z.string().trim().min(2).max(120),
  kind: z.enum(GATEWAY_KINDS),
  status: z.enum(GATEWAY_STATUSES).default('Online'),
  location: z.string().trim().min(2).max(160),
  firmwareVersion: z.string().trim().min(1).max(20).default('1.0.0'),
  uptimePct: z.coerce.number().min(0).max(100).default(100),
  // Optional: plenty of gateways are on DHCP and the address is not stable
  // enough to be worth recording.
  ip: z.string().trim().max(45).optional(),
});

export const updateGatewaySchema = createGatewaySchema.partial();

// ── Geofences ────────────────────────────────────────────────────────────────
const percent = z.number().min(0).max(100);

export const createGeofenceSchema = z
  .object({
    name: z.string().trim().min(2).max(80),
    zoneId: z.string().trim().optional(),
    x: percent,
    y: percent,
    width: percent.refine((v) => v > 0, 'Width must be greater than 0'),
    height: percent.refine((v) => v > 0, 'Height must be greater than 0'),
    rule: z.enum(GEOFENCE_RULES),
    active: z.boolean().default(true),
  })
  // A fence that runs off the edge of the floor plan would silently clip on
  // render, so reject it at the door instead.
  .refine((v) => v.x + v.width <= 100, { message: 'Geofence extends past the right edge of the map', path: ['width'] })
  .refine((v) => v.y + v.height <= 100, { message: 'Geofence extends past the bottom edge of the map', path: ['height'] });

export const updateGeofenceSchema = z.object({
  name: z.string().trim().min(2).max(80).optional(),
  zoneId: z.string().trim().optional(),
  x: percent.optional(),
  y: percent.optional(),
  width: percent.optional(),
  height: percent.optional(),
  rule: z.enum(GEOFENCE_RULES).optional(),
  active: z.boolean().optional(),
});

export type SensorListQuery = z.infer<typeof sensorListQuerySchema>;
export type CreateSensorInput = z.infer<typeof createSensorSchema>;
export type CreateGeofenceInput = z.infer<typeof createGeofenceSchema>;
