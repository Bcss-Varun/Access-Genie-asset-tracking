import * as data from '@/lib/dataset';
import { formatMoney } from '@/lib/utils';

/**
 * Metric values, computed from the estate.
 *
 * The report viewer used to render these from a hash of the metric's *name* —
 * a stable, plausible number that had nothing to do with the data. Somebody
 * showing that screen to a finance team would have been quoting fiction.
 *
 * So each recognised metric is a real query over the hydrated dataset, and
 * anything not recognised returns `null`. The viewer shows those as "not
 * computed" rather than inventing a figure, which is the honest answer when a
 * report names a measurement this platform does not take.
 */

export interface MetricValue {
  /** Formatted for display. */
  value: string;
  /** Where the number came from, shown under the tile. */
  basis: string;
}

const round = (n: number) => Math.round(n * 10) / 10;

const avg = (values: number[]): number =>
  values.length === 0 ? 0 : values.reduce((sum, v) => sum + v, 0) / values.length;

/**
 * Matched on substrings rather than exact names because report metrics are
 * written by people ("Avg utilization %", "Utilization"), and an exact-match
 * table would silently fall through to "not computed" for a trivial rewording.
 */
const RESOLVERS: { match: (name: string) => boolean; compute: () => MetricValue | null }[] = [
  {
    match: (n) => n.includes('total asset') || (n.includes('asset') && n.includes('count')) || n === 'assets',
    compute: () => ({ value: String(data.allAssets.length), basis: 'Assets in the registry' }),
  },
  {
    match: (n) => n.includes('book value') || n.includes('portfolio value') || n.includes('asset value') || n.includes('tco'),
    compute: () => {
      const total = data.allAssets.reduce((sum, a) => sum + (a.bookValue ?? a.purchasePrice ?? 0), 0);
      return { value: formatMoney(total), basis: `Across ${data.allAssets.length} assets` };
    },
  },
  {
    match: (n) => n.includes('purchase') && (n.includes('value') || n.includes('cost') || n.includes('spend')),
    compute: () => {
      const total = data.allAssets.reduce((sum, a) => sum + (a.purchasePrice ?? 0), 0);
      return { value: formatMoney(total), basis: 'Original purchase price' };
    },
  },
  {
    match: (n) => n.includes('depreciation'),
    compute: () => {
      const total = data.allAssets.reduce((sum, a) => sum + Math.max(0, (a.purchasePrice ?? 0) - (a.bookValue ?? 0)), 0);
      return { value: formatMoney(total), basis: 'Purchase price less book value' };
    },
  },
  {
    match: (n) => n.includes('utilization') || n.includes('utilisation'),
    compute: () => {
      const value = avg(data.allAssets.map((a) => a.utilization ?? 0));
      return { value: `${Math.round(value)}%`, basis: 'Mean across the estate' };
    },
  },
  {
    match: (n) => n.includes('health'),
    compute: () => {
      const value = avg(data.allAssets.map((a) => a.healthScore ?? 0));
      return { value: String(Math.round(value)), basis: 'Mean health score' };
    },
  },
  {
    match: (n) => n.includes('risk'),
    compute: () => {
      const value = avg(data.allAssets.map((a) => a.riskScore ?? 0));
      return { value: String(Math.round(value)), basis: 'Mean risk score' };
    },
  },
  {
    match: (n) => n.includes('open work') || n.includes('work order'),
    compute: () => {
      const open = data.allWorkOrders.filter((w) => w.status !== 'Completed').length;
      return { value: String(open), basis: `${data.allWorkOrders.length} total, open shown` };
    },
  },
  {
    match: (n) => n.includes('overdue'),
    compute: () => {
      const now = Date.now();
      const overdue = data.allWorkOrders.filter((w) => w.status !== 'Completed' && Date.parse(w.dueDate) < now).length;
      return { value: String(overdue), basis: 'Past their due date' };
    },
  },
  {
    match: (n) => n.includes('mttr') || (n.includes('repair') && n.includes('time')),
    compute: () => {
      // Mean time to repair, over orders that actually closed. Reported as "no
      // data" rather than zero when nothing has been completed — zero hours to
      // repair would read as excellent rather than unknown.
      const closed = data.allWorkOrders.filter((w) => w.status === 'Completed' && w.completedAt);
      if (closed.length === 0) return { value: '—', basis: 'No work orders completed yet' };

      const hours = closed.map((w) => (Date.parse(w.completedAt as string) - Date.parse(w.createdAt)) / 3_600_000);
      return { value: `${round(avg(hours))}h`, basis: `Across ${closed.length} completed orders` };
    },
  },
  {
    match: (n) => n.includes('compliance') || n.includes('certification'),
    compute: () => {
      const certs = data.allCertifications;
      if (certs.length === 0) return { value: '—', basis: 'No certificates recorded' };
      const valid = certs.filter((c) => c.status === 'Valid').length;
      return { value: `${Math.round((valid / certs.length) * 100)}%`, basis: `${valid} of ${certs.length} valid` };
    },
  },
  {
    match: (n) => n.includes('alert') || n.includes('incident'),
    compute: () => {
      const open = data.allAlerts.filter((a) => a.status !== 'Resolved').length;
      return { value: String(open), basis: 'Unresolved alerts' };
    },
  },
  {
    match: (n) => n.includes('stock') || n.includes('inventory') || n.includes('parts'),
    compute: () => {
      const value = data.allParts.reduce((sum, p) => sum + p.onHand * p.unitCost, 0);
      return { value: formatMoney(value), basis: `${data.allParts.length} SKUs on hand` };
    },
  },
  {
    match: (n) => n.includes('reorder') || n.includes('stockout'),
    compute: () => {
      const low = data.allParts.filter((p) => p.onHand <= p.reorderPoint).length;
      return { value: String(low), basis: 'At or below reorder point' };
    },
  },
  {
    match: (n) => n.includes('downtime') || n.includes('availability') || n.includes('uptime'),
    compute: () => {
      // "Available" means in service. Staging, missing and end-of-life all
      // count against it — an asset nobody can find is not available.
      const down = data.allAssets.filter((a) => a.status !== 'Active').length;
      const total = data.allAssets.length;
      if (total === 0) return { value: '—', basis: 'No assets registered' };
      return { value: `${Math.round(((total - down) / total) * 100)}%`, basis: `${down} of ${total} unavailable` };
    },
  },
  {
    match: (n) => n.includes('age') || n.includes('lifecycle'),
    compute: () => {
      const dated = data.allAssets.filter((a) => a.purchaseDate);
      if (dated.length === 0) return { value: '—', basis: 'No purchase dates recorded' };
      const years = dated.map((a) => (Date.now() - Date.parse(a.purchaseDate)) / (365 * 86_400_000));
      return { value: `${round(avg(years))}y`, basis: `Mean age of ${dated.length} assets` };
    },
  },
];

/**
 * Compute one named metric, or `null` when this platform does not measure it.
 *
 * Returning null rather than a placeholder number is the point: a report can
 * name anything, and the viewer's job is to say which of those it can actually
 * answer.
 */
export function resolveMetric(name: string): MetricValue | null {
  const normalised = name.trim().toLowerCase();
  return RESOLVERS.find((r) => r.match(normalised))?.compute() ?? null;
}
