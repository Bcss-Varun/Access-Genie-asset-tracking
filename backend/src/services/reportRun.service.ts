import {
  Alert,
  Asset,
  Certification,
  ExportArtifact,
  ExportJob,
  Inspection,
  Part,
  PurchaseOrder,
  Report,
  Supplier,
  WorkOrder,
  nextId,
  type ExportArtifactDoc,
  type ExportJobDoc,
} from '../models/index.js';
import { ApiError } from '../utils/ApiError.js';
import { logger } from '../config/logger.js';

/**
 * Running a report.
 *
 * "Run" used to mean a toast saying the report was queued, and the export
 * centre listed jobs that had never produced a file. A report you cannot read
 * is not a report, so this queries the live estate, renders it, and stores
 * something a browser can actually download.
 *
 * Each category maps to a real query rather than to a formatting template. That
 * is the whole point: the numbers in an exported file and the numbers on the
 * screen come from the same collections, so they cannot drift.
 */

type Row = Record<string, string | number>;

/** RFC 4180 — quote anything containing a delimiter, a quote or a newline. */
function csvCell(value: string | number): string {
  const s = String(value ?? '');
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

function toCsv(rows: Row[]): string {
  if (rows.length === 0) return '';
  const headers = Object.keys(rows[0] as Row);
  const lines = [headers.map(csvCell).join(',')];
  for (const row of rows) lines.push(headers.map((h) => csvCell(row[h] ?? '')).join(','));
  return lines.join('\r\n');
}

const day = (d?: Date | null) => (d ? new Date(d).toISOString().slice(0, 10) : '');

// ── The queries ──────────────────────────────────────────────────────────────
// One per report category. Everything is `.lean()` and shaped into flat rows,
// because a CSV cannot express nesting and a spreadsheet user should not have
// to unpick JSON.

async function assetRows(): Promise<Row[]> {
  const assets = await Asset.find().sort({ _id: 1 }).lean();
  return assets.map((a) => ({
    'Asset ID': a._id,
    Name: a.name,
    Category: a.category,
    'Serial number': a.serialNumber,
    Status: a.status,
    Criticality: a.criticality ?? '',
    Custodian: a.custodian || 'Unassigned',
    Location: a.location?.name ?? '',
    Building: a.location?.building ?? '',
    Health: a.healthScore ?? 0,
    Risk: a.riskScore ?? 0,
    'Utilization %': a.utilization ?? 0,
    'Purchase date': day(a.purchaseDate),
    'Purchase price': a.purchasePrice ?? 0,
    'Book value': a.bookValue ?? 0,
    'Warranty expiry': day(a.warrantyExpiry),
  }));
}

async function financialRows(): Promise<Row[]> {
  const assets = await Asset.find().sort({ purchasePrice: -1 }).lean();
  return assets.map((a) => {
    const price = a.purchasePrice ?? 0;
    const book = a.bookValue ?? 0;
    return {
      'Asset ID': a._id,
      Name: a.name,
      Category: a.category,
      'Purchase date': day(a.purchaseDate),
      'Purchase price': price,
      'Book value': book,
      // Written out rather than left to the reader: a depreciation figure is
      // the number this report exists to produce.
      'Accumulated depreciation': Math.max(0, price - book),
      'Depreciation method': a.depreciationMethod ?? '',
      'Lifecycle stage': a.lifecycleStage ?? '',
      Status: a.status,
    };
  });
}

async function maintenanceRows(): Promise<Row[]> {
  const orders = await WorkOrder.find().sort({ dueDate: 1 }).lean();
  const now = Date.now();
  return orders.map((w) => ({
    'Work order': w._id,
    Title: w.title,
    'Asset ID': w.assetId,
    Asset: w.assetName,
    Type: w.type,
    Priority: w.priority,
    Status: w.status,
    'Assigned to': w.assignedTo || 'Unassigned',
    Due: day(w.dueDate),
    'Days late': w.status === 'Completed' ? 0 : Math.max(0, Math.floor((now - new Date(w.dueDate).getTime()) / 86_400_000)),
    'Estimated hours': w.estimatedHours ?? 0,
    Completed: day(w.completedAt),
  }));
}

async function complianceRows(): Promise<Row[]> {
  const [certs, inspections] = await Promise.all([
    Certification.find().sort({ expiresAt: 1 }).lean(),
    Inspection.find().sort({ dueDate: 1 }).lean(),
  ]);

  // Two collections, one register: a compliance officer asks "what is out of
  // date", not "what is out of date in each of your tables".
  return [
    ...certs.map((c) => ({
      Record: c._id,
      Kind: 'Certification',
      'Asset ID': c.assetId,
      Asset: c.assetName,
      Title: c.name,
      Authority: c.authority,
      Status: c.status,
      Due: day(c.expiresAt),
    })),
    ...inspections.map((i) => ({
      Record: i._id,
      Kind: 'Inspection',
      'Asset ID': i.assetId,
      Asset: i.assetName,
      Title: i.title,
      Authority: i.assignedTo || 'Unassigned',
      Status: i.status,
      Due: day(i.scheduledFor),
    })),
  ];
}

async function utilizationRows(): Promise<Row[]> {
  const assets = await Asset.find().sort({ utilization: -1 }).lean();
  return assets.map((a) => ({
    'Asset ID': a._id,
    Name: a.name,
    Category: a.category,
    Custodian: a.custodian || 'Unassigned',
    Location: a.location?.name ?? '',
    'Utilization %': a.utilization ?? 0,
    Health: a.healthScore ?? 0,
    Status: a.status,
    // The judgement the report is read for, stated rather than implied.
    Verdict: (a.utilization ?? 0) < 25 ? 'Underused — consider redeploying' : (a.utilization ?? 0) > 85 ? 'Near capacity' : 'Normal',
  }));
}

async function inventoryRows(): Promise<Row[]> {
  const [parts, orders, suppliers] = await Promise.all([
    Part.find().sort({ _id: 1 }).lean(),
    PurchaseOrder.find().sort({ _id: 1 }).lean(),
    Supplier.find().select('_id name').lean(),
  ]);

  // Stock already ordered but not yet received is the difference between
  // "reorder now" and "it is already on its way".
  const onOrder = new Map<string, number>();
  for (const po of orders) {
    if (po.status === 'Received' || po.status === 'Cancelled') continue;
    for (const line of po.lines ?? []) onOrder.set(line.sku, (onOrder.get(line.sku) ?? 0) + line.qty);
  }
  const supplierName = new Map(suppliers.map((s) => [s._id, s.name]));

  return parts.map((p) => ({
    SKU: p.sku,
    'Part ID': p._id,
    Name: p.name,
    Category: p.category,
    'ABC class': p.abcClass,
    'On hand': p.onHand ?? 0,
    'Reorder point': p.reorderPoint ?? 0,
    'On order': onOrder.get(p.sku) ?? 0,
    'Unit cost': p.unitCost ?? 0,
    'Stock value': (p.onHand ?? 0) * (p.unitCost ?? 0),
    Supplier: supplierName.get(p.supplierId) ?? p.supplierId,
    'Lead time (days)': p.leadTimeDays ?? 0,
    Verdict:
      (p.onHand ?? 0) > (p.reorderPoint ?? 0)
        ? 'OK'
        : (onOrder.get(p.sku) ?? 0) > 0
          ? 'Below reorder — already on order'
          : 'Reorder',
  }));
}

/**
 * The executive summary — the one report that is a shape, not a list.
 *
 * Emitted as metric/value rows so it still lands in a spreadsheet cleanly.
 */
async function executiveRows(): Promise<Row[]> {
  const [assets, openOrders, openAlerts, certs] = await Promise.all([
    Asset.find().lean(),
    WorkOrder.countDocuments({ status: { $ne: 'Completed' } }),
    Alert.countDocuments({ status: { $ne: 'Resolved' } }),
    Certification.countDocuments({ status: { $in: ['Expired', 'Expiring'] } }),
  ]);

  const total = assets.length;
  const avg = (pick: (a: (typeof assets)[number]) => number) =>
    total === 0 ? 0 : Math.round(assets.reduce((sum, a) => sum + pick(a), 0) / total);

  const value = assets.reduce((sum, a) => sum + (a.bookValue ?? a.purchasePrice ?? 0), 0);
  const byStatus = new Map<string, number>();
  for (const a of assets) byStatus.set(a.status, (byStatus.get(a.status) ?? 0) + 1);

  return [
    { Metric: 'Total assets', Value: total },
    { Metric: 'Book value', Value: Math.round(value) },
    { Metric: 'Average health', Value: avg((a) => a.healthScore ?? 0) },
    { Metric: 'Average risk', Value: avg((a) => a.riskScore ?? 0) },
    { Metric: 'Average utilization %', Value: avg((a) => a.utilization ?? 0) },
    { Metric: 'Open work orders', Value: openOrders },
    { Metric: 'Open alerts', Value: openAlerts },
    { Metric: 'Certificates expired or expiring', Value: certs },
    ...[...byStatus.entries()].sort().map(([status, count]) => ({ Metric: `Assets — ${status}`, Value: count })),
  ];
}

const BUILDERS: Record<string, () => Promise<Row[]>> = {
  Executive: executiveRows,
  Financial: financialRows,
  Maintenance: maintenanceRows,
  Compliance: complianceRows,
  Utilization: utilizationRows,
  Inventory: inventoryRows,
  Asset: assetRows,
  AI: utilizationRows,
};

// ── Running ──────────────────────────────────────────────────────────────────
export interface RunResult {
  job: ExportJobDoc;
  rowCount: number;
}

/**
 * Build a report and store the file.
 *
 * The job is written as `Complete` because by the time it is written the work
 * is done — reporting `Queued` for something already finished would be a lie
 * that the export centre then has to display.
 */
export async function runReport(reportId: string, actor: string, format?: string): Promise<RunResult> {
  const report = await Report.findById(reportId).lean();
  if (!report) throw ApiError.notFound('Report');

  const build = BUILDERS[report.category] ?? assetRows;
  const rows = await build();

  // "Dashboard" is a viewing format, not a file format; anything destined for a
  // download becomes CSV, which every spreadsheet and BI tool reads.
  const requested = (format ?? report.format ?? 'CSV').toUpperCase();
  const body = requested === 'JSON' ? JSON.stringify(rows, null, 2) : toCsv(rows);
  const extension = requested === 'JSON' ? 'json' : 'csv';
  const mime = requested === 'JSON' ? 'application/json' : 'text/csv';

  const id = await nextId('exportJob', 'EXP');
  const at = new Date();
  const slug = report.name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');

  const job = await ExportJob.create({
    _id: id,
    report: report.name,
    format: extension.toUpperCase(),
    requestedBy: actor,
    at,
    status: rows.length === 0 ? 'Empty' : 'Complete',
    sizeKb: Math.max(1, Math.round(Buffer.byteLength(body, 'utf8') / 1024)),
  });

  await ExportArtifact.create({
    _id: id,
    filename: `${slug}-${at.toISOString().slice(0, 10)}.${extension}`,
    mime,
    body,
    rowCount: rows.length,
    createdAt: at,
  });

  await Report.updateOne({ _id: reportId }, { $set: { lastRun: at } });

  logger.info('Report run', { reportId, rows: rows.length, job: id });
  return { job: job.toObject(), rowCount: rows.length };
}

/** Fetch a produced file for download. */
export async function readArtifact(id: string): Promise<ExportArtifactDoc> {
  const artifact = await ExportArtifact.findById(id).lean<ExportArtifactDoc>();
  if (!artifact) {
    // An export row without a file is a job from before it produced one, or one
    // that failed. Say which, rather than 404-ing a row the user can see.
    const job = await ExportJob.findById(id).lean();
    throw job
      ? ApiError.badRequest(`${id} has no file to download — re-run the report to produce one`)
      : ApiError.notFound('Export');
  }
  return artifact;
}
