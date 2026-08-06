import { model, Schema } from 'mongoose';
import { baseSchemaPlugin } from '../utils/mongoose.js';

/**
 * One row per day: what the estate's derived scores were.
 *
 * Almost every trend on the dashboard is computed rather than remembered —
 * book value on a past date is arithmetic, and work orders, alerts and
 * movements all carry their own timestamps. Two figures are not like that.
 * Health, utilization and risk are *materialised*: `metrics.service.ts`
 * recomputes them from the estate's current state and overwrites the previous
 * answer, so yesterday's fleet health is not recoverable from anything. It has
 * to be written down as it passes or it is gone.
 *
 * Hence this, and only this. It is deliberately tiny — five numbers a day for
 * the whole estate — because a snapshot table is a liability that grows
 * forever, and the only rows worth paying for are the ones nothing else can
 * reconstruct.
 *
 * The id is the UTC date, which makes the daily write an idempotent upsert:
 * running the pass twenty times a day leaves one row, and the last one wins.
 */
export interface MetricSnapshotDoc {
  _id: string; // 2026-08-05
  at: Date;
  assetCount: number;
  avgHealth: number;
  avgUtilization: number;
  avgRisk: number;
  /** Portfolio book value that day, so the figure survives a change of method. */
  bookValue: number;
}

const metricSnapshotSchema = new Schema<MetricSnapshotDoc>(
  {
    _id: { type: String, required: true },
    at: { type: Date, required: true, index: true },
    assetCount: { type: Number, required: true, min: 0 },
    avgHealth: { type: Number, required: true, min: 0, max: 100 },
    avgUtilization: { type: Number, required: true, min: 0, max: 100 },
    avgRisk: { type: Number, required: true, min: 0, max: 100 },
    bookValue: { type: Number, required: true, min: 0 },
  },
  { versionKey: false },
);

metricSnapshotSchema.plugin(baseSchemaPlugin);

export const MetricSnapshot = model<MetricSnapshotDoc>('MetricSnapshot', metricSnapshotSchema);
