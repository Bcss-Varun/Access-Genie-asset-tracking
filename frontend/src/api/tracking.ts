import type { Gateway, Geofence, LiveMapPayload, Sensor } from '@access-genie/shared';
import { apiDelete, apiGet, apiList, apiPatch, apiPost } from '@/api/client';

export interface SensorFilters {
  page?: number;
  limit?: number;
  sort?: string;
  q?: string;
  kind?: string;
  status?: string;
  gatewayId?: string;
  unassigned?: boolean;
}

export const trackingApi = {
  /** Zones, geofences, positions and stats for the live map — one request. */
  live: () => apiGet<LiveMapPayload>('/tracking/live'),

  sensors: (filters: SensorFilters = {}) => apiList<Sensor>('/tracking/sensors', filters as Record<string, unknown>),
  sensor: (id: string) => apiGet<Sensor>(`/tracking/sensors/${id}`),
  registerSensor: (input: Record<string, unknown>) => apiPost<Sensor>('/tracking/sensors', input),
  removeSensor: (id: string) => apiDelete(`/tracking/sensors/${id}`),

  gateways: () => apiGet<Gateway[]>('/tracking/gateways'),

  geofences: () => apiGet<Geofence[]>('/tracking/geofences'),
  createGeofence: (input: Record<string, unknown>) => apiPost<Geofence>('/tracking/geofences', input),
  updateGeofence: (id: string, input: Record<string, unknown>) => apiPatch<Geofence>(`/tracking/geofences/${id}`, input),
  removeGeofence: (id: string) => apiDelete(`/tracking/geofences/${id}`),
};
