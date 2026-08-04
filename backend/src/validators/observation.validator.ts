import { z } from 'zod';

/**
 * An observation: one sighting of one asset, by one technology, at one time.
 *
 * The shape is deliberately close to what a reader actually knows. A gateway
 * reports the tag identifier printed on the hardware and the zone it covers —
 * it has no idea what an `AST-…` is — so `tagId` is the normal key and
 * `assetId` is the exception, used by the app's own scan-to-locate.
 */
export const OBSERVATION_SOURCES = ['rfid', 'ble', 'uwb', 'gps', 'qr', 'manual'] as const;

export const observationSchema = z
  .object({
    /** As printed on the tag: EPC, MAC, IMEI, or the QR payload. */
    tagId: z.string().trim().min(1).max(120).optional(),
    /** Direct reference, for a scan made inside the app where the asset is known. */
    assetId: z.string().trim().regex(/^AST-\d+$/, 'Asset IDs look like AST-1042').optional(),

    source: z.enum(OBSERVATION_SOURCES),
    zone: z.string().trim().max(80).optional(),
    facility: z.string().trim().max(80).optional(),
    gatewayId: z.string().trim().max(60).optional(),

    /** Signal strength in dBm, where the technology reports one. */
    rssi: z.number().min(-120).max(0).optional(),
    /** Floor-plan position as a percentage of the plan box — UWB and GPS only. */
    position: z.object({ x: z.number().min(0).max(100), y: z.number().min(0).max(100) }).optional(),
    /** Overrides the per-source default when the reader knows better. */
    confidence: z.number().min(0).max(100).optional(),

    /** When the read happened. Defaults to arrival time; a gateway catching up after a dropout sends its own. */
    at: z.string().datetime({ offset: true }).optional(),
    actor: z.string().trim().max(80).optional(),
  })
  .refine((o) => Boolean(o.tagId || o.assetId), {
    message: 'An observation needs either a tagId or an assetId',
    path: ['tagId'],
  });

/**
 * A gateway sweep. Capped because a single request should stay something the
 * API can process inside a request timeout — a reader with more than this to
 * report is behind, and should send several batches rather than one huge one.
 */
export const observationBatchSchema = z.object({
  observations: z.array(observationSchema).min(1).max(500),
});

export type ObservationInput = z.infer<typeof observationSchema>;
export type ObservationBatchInput = z.infer<typeof observationBatchSchema>;
