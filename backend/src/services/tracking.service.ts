import type { FilterQuery } from 'mongoose';
import type { ApiMeta, LiveMapPayload } from '@access-genie/shared';
import {
  Activity,
  Asset,
  Gateway,
  Geofence,
  Sensor,
  Zone,
  nextId,
  type GeofenceDoc,
  type SensorDoc,
} from '../models/index.js';
import { ApiError } from '../utils/ApiError.js';
import { csvFilter, escapeRegex, paginate, parsePagination } from '../utils/query.js';
import type { CreateGeofenceInput, CreateSensorInput, SensorListQuery } from '../validators/tracking.validator.js';

/**
 * Everything the live map needs, in one request.
 *
 * The map is the screen users leave open all day; splitting it into four calls
 * would quadruple the poll traffic for no benefit, since none of the four is
 * useful without the others.
 */
export async function getLiveMap(): Promise<LiveMapPayload> {
  const [zones, geofences, assets, byTech, sensorStats] = await Promise.all([
    Zone.find().sort({ name: 1 }).lean(),
    Geofence.find().sort({ name: 1 }).lean(),
    Asset.find({ mapPosition: { $exists: true } })
      .select('name category status healthStatus trackingTech trackingId mapPosition location.zone telemetry.lastPing')
      .lean(),
    Asset.aggregate<{ _id: string | null; count: number }>([
      { $match: { trackingTech: { $exists: true, $ne: null } } },
      { $group: { _id: '$trackingTech', count: { $sum: 1 } } },
      { $sort: { count: -1 } },
    ]),
    Sensor.aggregate<{ _id: string; count: number }>([{ $group: { _id: '$status', count: { $sum: 1 } } }]),
  ]);

  const breaches24h = geofences.reduce((sum, g) => sum + g.breaches24h, 0);

  return {
    zones: zones.map((z) => ({ id: z._id, name: z.name, type: z.type, x: z.x, y: z.y, width: z.width, height: z.height })),
    geofences: geofences.map((g) => ({
      id: g._id,
      name: g.name,
      zoneId: g.zoneId,
      x: g.x,
      y: g.y,
      width: g.width,
      height: g.height,
      rule: g.rule,
      breaches24h: g.breaches24h,
      active: g.active,
      createdAt: g.createdAt.toISOString(),
      updatedAt: g.updatedAt.toISOString(),
    })),
    assets: assets
      // `mapPosition` is optional on the model but required on the payload —
      // filter rather than coerce, so a half-configured asset is simply absent
      // from the map instead of pinned at (0,0).
      .filter((a) => a.mapPosition)
      .map((a) => ({
        id: a._id,
        name: a.name,
        category: a.category,
        status: a.status,
        healthStatus: a.healthStatus,
        trackingTech: a.trackingTech,
        trackingId: a.trackingId,
        mapPosition: a.mapPosition!,
        zone: a.location?.zone,
        lastPing: a.telemetry?.lastPing?.toISOString(),
      })),
    stats: {
      tracked: assets.length,
      online: sensorStats.find((s) => s._id === 'Online')?.count ?? 0,
      byTech: byTech.filter((t) => t._id).map((t) => ({ tech: String(t._id), count: t.count })),
      activeGeofences: geofences.filter((g) => g.active).length,
      breaches24h,
    },
  };
}

// ── Sensors ──────────────────────────────────────────────────────────────────
const SENSOR_SORTABLE = ['name', 'kind', 'status', 'batteryLevel', 'signalStrength', 'lastReading', 'createdAt'];

export async function listSensors(query: SensorListQuery): Promise<{ items: SensorDoc[]; meta: ApiMeta }> {
  const filter: FilterQuery<SensorDoc> = {};

  const kind = csvFilter(query.kind);
  if (kind) filter.kind = kind;

  const status = csvFilter(query.status);
  if (status) filter.status = status;

  if (query.gatewayId) filter.gatewayId = query.gatewayId;
  if (query.facility) filter.facility = query.facility;
  if (query.unassigned) filter.assetId = { $in: [null, undefined] };

  if (query.q) {
    const rx = new RegExp(escapeRegex(query.q), 'i');
    filter.$or = [{ name: rx }, { tagId: rx }, { assetName: rx }, { _id: rx }];
  }

  const pagination = parsePagination(query, SENSOR_SORTABLE, '-lastReading');
  return paginate(Sensor, filter, pagination);
}

/**
 * Register a device and bond it to an asset.
 *
 * Bonding is a two-sided write: the sensor records the asset, and the asset
 * records the tag ID and technology, so a registry search for an EPC finds the
 * asset without going through the device collection.
 */
export async function createSensor(input: CreateSensorInput, actor: string): Promise<SensorDoc> {
  const gateway = await Gateway.findById(input.gatewayId).lean();
  if (!gateway) throw ApiError.badRequest(`Gateway ${input.gatewayId} does not exist`);

  let assetName: string | undefined;
  if (input.assetId) {
    const asset = await Asset.findById(input.assetId);
    if (!asset) throw ApiError.badRequest(`Asset ${input.assetId} does not exist`);
    assetName = asset.name;
  }

  const id = await nextId('sensor', 'SEN');

  const sensor = await Sensor.create({
    ...input,
    _id: id,
    assetName,
    lastReading: input.lastReading ? new Date(input.lastReading) : new Date(),
  });

  if (input.assetId && input.tagId) {
    await Asset.findByIdAndUpdate(input.assetId, {
      $set: { trackingId: input.tagId, trackingTech: sensorKindToTech(input.kind) },
    });
    await Activity.create({
      assetId: input.assetId,
      type: 'Registration',
      description: `${input.kind} ${input.tagId} bonded to this asset`,
      actor,
      timestamp: new Date(),
    });
  }

  await Gateway.findByIdAndUpdate(input.gatewayId, { $inc: { connectedDevices: 1 } });

  return sensor.toObject();
}

/** Device kind → the tracking technology recorded on the asset. */
function sensorKindToTech(kind: CreateSensorInput['kind']) {
  const map = {
    'RFID Tag': 'RFID',
    'BLE Beacon': 'BLE',
    'UWB Tag': 'UWB',
    'GPS Tracker': 'GPS',
    'QR Label': 'QR',
    'LoRaWAN Sensor': 'LoRaWAN',
    Environmental: 'BLE',
  } as const;
  return map[kind];
}

export async function getSensor(id: string): Promise<SensorDoc> {
  const sensor = await Sensor.findById(id).lean<SensorDoc>();
  if (!sensor) throw ApiError.notFound('Device');
  return sensor;
}

export async function deleteSensor(id: string): Promise<void> {
  const sensor = await Sensor.findByIdAndDelete(id);
  if (!sensor) throw ApiError.notFound('Device');
  await Gateway.findByIdAndUpdate(sensor.gatewayId, { $inc: { connectedDevices: -1 } });
}

// ── Geofences ────────────────────────────────────────────────────────────────
export async function listGeofences(): Promise<GeofenceDoc[]> {
  return Geofence.find().sort({ name: 1 }).lean();
}

export async function createGeofence(input: CreateGeofenceInput): Promise<GeofenceDoc> {
  const id = await nextId('geofence', 'GF');
  const geofence = await Geofence.create({ ...input, _id: id, breaches24h: 0 });
  return geofence.toObject();
}

export async function updateGeofence(id: string, input: Partial<CreateGeofenceInput>): Promise<GeofenceDoc> {
  const geofence = await Geofence.findByIdAndUpdate(id, { $set: input }, { new: true, runValidators: true }).lean<GeofenceDoc>();
  if (!geofence) throw ApiError.notFound('Geofence');
  return geofence;
}

export async function deleteGeofence(id: string): Promise<void> {
  const result = await Geofence.findByIdAndDelete(id);
  if (!result) throw ApiError.notFound('Geofence');
}

// ── Movement ─────────────────────────────────────────────────────────────────
/**
 * Reconstruct an asset's movement trail from its activity stream. A dedicated
 * time-series store is the right home for this at scale (docs/12); replaying
 * the event stream is the correct behaviour at this one's.
 */
export async function getMovementTrail(assetId: string) {
  const asset = await Asset.findById(assetId).lean();
  if (!asset) throw ApiError.notFound('Asset');

  const movements = await Activity.find({ assetId, type: 'Movement' }).sort({ timestamp: 1 }).limit(200).lean();

  return {
    assetId,
    assetName: asset.name,
    currentPosition: asset.mapPosition,
    points: movements.map((m) => ({ timestamp: m.timestamp.toISOString(), label: m.description, actor: m.actor })),
  };
}
