import type { Request, Response } from 'express';
import { asyncHandler } from '../utils/asyncHandler.js';
import { sendData } from '../utils/response.js';
import * as service from '../services/observation.service.js';
import type { ObservationBatchInput, ObservationInput } from '../validators/observation.validator.js';

/**
 * Observation intake.
 *
 * Not audited the way configuration changes are: a busy estate produces
 * thousands of reads an hour, and writing an audit row per sighting would bury
 * the record of who changed *policy* — which is what the audit log is for —
 * under machine noise. The observations are themselves the record, and the
 * tracking event feed is the human-readable view of them.
 */

export const record = asyncHandler(async (req: Request, res: Response) => {
  const result = await service.recordObservation(req.body as ObservationInput);
  // 202: the sighting was taken, but an unrecognised tag is not a failure —
  // it is logged as an unknown detection and the caller is told why.
  sendData(res, result, result.accepted ? 201 : 202);
});

export const recordBatch = asyncHandler(async (req: Request, res: Response) => {
  const { observations } = req.body as ObservationBatchInput;
  const results = await service.recordObservations(observations);

  sendData(res, {
    accepted: results.filter((r) => r.accepted).length,
    unknown: results.filter((r) => !r.accepted).length,
    results,
  }, 201);
});

/** The places a reader may report — derived from the location hierarchy. */
export const zones = asyncHandler(async (_req: Request, res: Response) => {
  sendData(res, await service.observableZones());
});
