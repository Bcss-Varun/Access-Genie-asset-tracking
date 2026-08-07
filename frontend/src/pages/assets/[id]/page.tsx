import { useState, useEffect } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useNavigate } from 'react-router-dom';
import {
  getWorkOrdersForAsset,
  getActivityForAsset,
  getInsightsForAsset,
  getDocsForAsset,
  getGroupsForAsset,
  allAssetClasses,
} from '@/lib/dataset';
import type { Asset, ActivityEvent, AIInsight, AssetDoc } from '@access-genie/shared';
import { PageHeader, Badge, EmptyState, Avatar } from '@/components/ui/primitives';
import { Button } from '@/components/ui/Button';
import { Dropdown, MenuItem } from '@/components/ui/Dropdown';
import { useToast } from '@/components/providers/ToastProvider';
import { useRegistry } from '@/components/providers/RegistryProvider';
import { SetupChecklist } from '@/components/onboarding/SetupChecklist';
import { useMutate } from '@/api/mutate';
import { maintenanceApi } from '@/api/work-orders';
import { insightsApi } from '@/api/insights';
import { documentsApi } from '@/api/documents';
import { downloadCsv } from '@/api/configuration';
import { UploadDocumentDialog } from '@/components/assets/UploadDocumentDialog';
import { CustodyDialog, RetireDialog, TransferDialog } from '@/components/assets/AssetActionDialogs';
import { ExplainDialog } from '@/components/assets/ExplainDialog';
import { cn, formatMoney, formatDate, relTime, nowMs } from '@/lib/utils';

/** Which modal is open. One key rather than five booleans that can disagree. */
type DialogKey = 'custody' | 'transfer' | 'retire' | 'upload' | 'explain' | null;

// ── token helpers ─────────────────────────────────────────────────────────────
const healthHex = (score: number): string =>
  score > 80 ? '#10b981' : score > 50 ? '#f59e0b' : '#ef4444';

const riskHex = (score: number): string =>
  score < 25 ? '#10b981' : score < 50 ? '#f59e0b' : score < 75 ? '#f97316' : '#ef4444';

const riskBand = (score: number): string =>
  score < 25 ? 'Low' : score < 50 ? 'Medium' : score < 75 ? 'High' : 'Critical';

type Tone = 'slate' | 'primary' | 'emerald' | 'amber' | 'red';

const statusTone = (s: string): Tone =>
  s === 'Active' ? 'emerald'
    : s === 'Maintenance' ? 'amber'
      : s === 'Missing' ? 'red'
        : s === 'Staging' ? 'primary'
          : 'slate';

const healthTone = (h: string): Tone =>
  h === 'Good' ? 'emerald' : h === 'Warning' ? 'amber' : 'red';

const woStatusTone = (s: string): Tone =>
  s === 'Completed' ? 'emerald'
    : s === 'In Progress' ? 'primary'
      : s === 'On Hold' ? 'amber'
        : 'slate';

const priorityTone = (p: string): Tone =>
  p === 'Critical' ? 'red' : p === 'High' ? 'amber' : p === 'Medium' ? 'primary' : 'slate';

const docTone = (t: string): Tone =>
  t === 'Warranty' || t === 'Certificate' ? 'emerald'
    : t === 'Invoice' ? 'amber'
      : t === 'CAD' || t === 'Manual' ? 'primary'
        : 'slate';

// Was `(sizeKb / 1024).toFixed(1) + ' MB'`, which renders every certificate and
// invoice as "0.0 MB" — most attachments are well under half a megabyte.
const fileSize = (sizeKb: number): string =>
  sizeKb >= 1024 ? `${(sizeKb / 1024).toFixed(1)} MB` : `${Math.max(1, Math.round(sizeKb))} KB`;

const docSizeLabel = (docs: AssetDoc[]): string => fileSize(docs.reduce((sum, d) => sum + d.sizeKb, 0));

const severityMeta = (sev: string): { color: string; ring: string; emoji: string } =>
  sev === 'Critical'
    ? { color: '#ef4444', ring: 'border-l-red-500', emoji: '🚨' }
    : sev === 'Warning'
      ? { color: '#f59e0b', ring: 'border-l-amber-500', emoji: '⚠️' }
      : sev === 'Opportunity'
        ? { color: '#10b981', ring: 'border-l-emerald-500', emoji: '💡' }
        : { color: '#6366f1', ring: 'border-l-primary-500', emoji: 'ℹ️' };

const activityMeta = (t: string): { emoji: string; color: string } =>
  t === 'Movement' ? { emoji: '🧭', color: '#6366f1' }
    : t === 'Maintenance' ? { emoji: '🔧', color: '#f59e0b' }
      : t === 'Custody' ? { emoji: '🤝', color: '#8b5cf6' }
        : t === 'Alert' ? { emoji: '🚨', color: '#ef4444' }
          : t === 'Registration' ? { emoji: '🆕', color: '#10b981' }
            : t === 'Telemetry' ? { emoji: '📡', color: '#6366f1' }
              : t === 'Audit' ? { emoji: '🛡️', color: '#64748b' }
                : { emoji: '🔍', color: '#94a3b8' };

const locationPath = (a: Asset): string =>
  [a.location.name, a.location.building, a.location.floor, a.location.zone]
    .filter(Boolean)
    .join(' ▸ ');

const daysUntil = (iso: string): number => Math.round((Date.parse(iso) - nowMs()) / 86_400_000);

const linkCls = (variant: 'primary' | 'secondary' | 'outline' | 'ghost'): string =>
  cn(
    'inline-flex items-center justify-center gap-2 font-medium text-sm px-4 py-2 rounded-lg transition-colors',
    variant === 'primary' && 'bg-primary-600 text-white hover:bg-primary-700 shadow-sm',
    variant === 'secondary' && 'bg-slate-900 text-white hover:bg-slate-800 shadow-sm',
    variant === 'outline' && 'border border-slate-300 text-slate-700 bg-white hover:bg-slate-50',
    // Matches Button's ghost so a link and a button can sit side by side in the
    // same row without one looking heavier than the other.
    variant === 'ghost' && 'text-slate-600 hover:bg-slate-100',
  );

// ── small presentational components ───────────────────────────────────────────
function Sparkline({
  points,
  height,
  color,
  gradientId,
}: {
  points: { label: string; value: number }[];
  height: number;
  color: string;
  gradientId: string;
}) {
  const vals = points.map((p) => p.value);
  const min = Math.min(...vals);
  const max = Math.max(...vals);
  const span = max - min || 1;
  const W = 100;
  const H = height;
  const pad = Math.max(4, H * 0.14);
  const coords = points.map((p, i) => {
    const x = points.length === 1 ? W / 2 : (i / (points.length - 1)) * W;
    const y = H - pad - ((p.value - min) / span) * (H - pad * 2);
    return [x, y] as const;
  });
  const line = coords
    .map(([x, y], i) => `${i === 0 ? 'M' : 'L'}${x.toFixed(2)},${y.toFixed(2)}`)
    .join(' ');
  const area = `${line} L${W},${H} L0,${H} Z`;
  return (
    <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" className="w-full" style={{ height }} aria-hidden>
      <defs>
        <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={color} stopOpacity="0.28" />
          <stop offset="100%" stopColor={color} stopOpacity="0" />
        </linearGradient>
      </defs>
      <path d={area} fill={`url(#${gradientId})`} />
      <path
        d={line}
        fill="none"
        stroke={color}
        strokeWidth={2}
        strokeLinecap="round"
        strokeLinejoin="round"
        vectorEffect="non-scaling-stroke"
      />
      {coords.map(([x, y], i) => (
        <circle key={i} cx={x} cy={y} r={1.6} fill={color} vectorEffect="non-scaling-stroke" />
      ))}
    </svg>
  );
}

function Ring({
  value,
  color,
  label,
  size = 140,
}: {
  value: number;
  color: string;
  label: string;
  size?: number;
}) {
  const r = size / 2 - 16;
  const c = 2 * Math.PI * r;
  const offset = c * (1 - Math.max(0, Math.min(100, value)) / 100);
  return (
    <div className="relative" style={{ height: size, width: size }}>
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" strokeWidth={12} className="stroke-slate-200" />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          stroke={color}
          strokeWidth={12}
          strokeLinecap="round"
          strokeDasharray={c}
          strokeDashoffset={offset}
          transform={`rotate(-90 ${size / 2} ${size / 2})`}
          style={{ transition: 'stroke-dashoffset 0.6s ease' }}
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span className="text-4xl font-heading font-bold leading-none" style={{ color }}>
          {value}
        </span>
        <span className="text-[10px] font-medium uppercase tracking-wider text-slate-400 mt-1">{label}</span>
      </div>
    </div>
  );
}

function KV({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="min-w-0">
      <dt className="text-xs font-medium uppercase tracking-wide text-slate-500">{label}</dt>
      <dd className="mt-1 text-sm font-medium text-slate-900 truncate">{value ?? '—'}</dd>
    </div>
  );
}

function TelemetryTile({
  emoji,
  label,
  value,
  warn,
}: {
  emoji: string;
  label: string;
  value: string;
  warn?: boolean;
}) {
  return (
    <div className="rounded-lg border border-slate-200 bg-slate-50 p-3">
      <div className="flex items-center justify-between">
        <span className="text-xs font-medium text-slate-500">{label}</span>
        <span className="text-base leading-none">{emoji}</span>
      </div>
      <div className={cn('mt-2 text-xl font-heading font-bold', warn ? 'text-health-critical' : 'text-slate-900')}>
        {value}
      </div>
    </div>
  );
}

function SectionTitle({ children, count }: { children: React.ReactNode; count?: number }) {
  return (
    <h3 className="font-heading font-bold text-base mb-3 flex items-center gap-2">
      {children}
      {count !== undefined && (
        <span className="text-xs font-medium px-2 py-0.5 bg-primary-500/10 text-primary-600 rounded-full">
          {count}
        </span>
      )}
    </h3>
  );
}

function DimensionBar({ label, value }: { label: string; value: number }) {
  const v = Math.max(0, Math.min(100, Math.round(value)));
  return (
    <div>
      <div className="flex items-center justify-between text-xs mb-1">
        <span className="text-slate-600">{label}</span>
        <span className="font-semibold text-slate-800">{v}</span>
      </div>
      <div className="h-2 w-full rounded-full bg-slate-200 overflow-hidden">
        <div className="h-full rounded-full" style={{ width: `${v}%`, backgroundColor: riskHex(v) }} />
      </div>
    </div>
  );
}

// ── tab registry ──────────────────────────────────────────────────────────────
const TABS = [
  { k: 'overview', label: 'Overview' },
  { k: 'timeline', label: 'Timeline' },
  { k: 'tracking', label: 'Live Tracking' },
  { k: 'health', label: 'Health' },
  { k: 'maintenance', label: 'Maintenance' },
  { k: 'warranty', label: 'Warranty' },
  { k: 'custody', label: 'Ownership & Custody' },
  { k: 'documents', label: 'Documents' },
  { k: 'sensors', label: 'Sensor Data' },
  { k: 'ai', label: 'AI Insights' },
  { k: 'history', label: 'History' },
  { k: 'audit', label: 'Audit Log' },
  { k: 'risk', label: 'Risk' },
  { k: 'financials', label: 'Financials' },
] as const;
type TabKey = (typeof TABS)[number]['k'];

// ── insight card (shared by Overview / AI Insights / Health / Risk) ────────────
function InsightCard({ ins, onAct }: { ins: AIInsight; onAct: (label: string) => void }) {
  const m = severityMeta(ins.severity);
  return (
    <div className={cn('rounded-lg bg-slate-50 border border-slate-200 border-l-4 p-4', m.ring)}>
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-start gap-2 min-w-0">
          <span className="text-lg leading-none">{m.emoji}</span>
          <div className="min-w-0">
            <h4 className="text-sm font-bold text-slate-900">{ins.title}</h4>
            <p className="text-xs text-slate-500 mt-1">{ins.summary}</p>
          </div>
        </div>
        <span
          className="flex-shrink-0 text-[10px] font-medium px-2 py-0.5 rounded-full border"
          style={{ color: m.color, borderColor: `${m.color}40`, backgroundColor: `${m.color}14` }}
        >
          {ins.type}
        </span>
      </div>

      {ins.drivers.length > 0 && (
        <ul className="mt-3 grid sm:grid-cols-2 gap-x-4 gap-y-1">
          {ins.drivers.map((d) => (
            <li key={d} className="flex items-start gap-1.5 text-xs text-slate-600">
              <span className="mt-1 h-1 w-1 flex-shrink-0 rounded-full bg-slate-400" />
              {d}
            </li>
          ))}
        </ul>
      )}

      <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2 min-w-[160px] flex-1">
          <span className="text-[10px] uppercase tracking-wide text-slate-500">Confidence</span>
          <div className="h-1.5 flex-1 rounded-full bg-slate-200 overflow-hidden">
            <div className="h-full rounded-full" style={{ width: `${ins.confidence}%`, backgroundColor: m.color }} />
          </div>
          <span className="text-xs font-semibold">{ins.confidence}%</span>
        </div>
        <div className="flex items-center gap-3">
          {ins.impactInr !== undefined && (
            <span className="text-xs font-semibold text-slate-700">
              {formatMoney(ins.impactInr)}
              {ins.impactLabel && <span className="text-slate-400 font-normal ml-1">{ins.impactLabel}</span>}
            </span>
          )}
          <button onClick={() => onAct(ins.actionLabel)} className="text-xs text-primary-600 font-medium hover:underline">
            {ins.actionLabel} →
          </button>
        </div>
      </div>
    </div>
  );
}

// ── timeline list (shared by Timeline / Custody / Audit) ───────────────────────
function TimelineList({ events }: { events: ActivityEvent[] }) {
  return (
    <ol className="relative border-l border-slate-200 ml-3 space-y-6">
      {events.map((ev) => {
        const m = activityMeta(ev.type);
        return (
          <li key={ev.id} className="ml-6">
            <span
              className="absolute -left-[13px] flex h-6 w-6 items-center justify-center rounded-full text-xs ring-4 ring-background"
              style={{ backgroundColor: `${m.color}22` }}
            >
              {m.emoji}
            </span>
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-sm font-medium text-slate-800">{ev.description}</span>
              <span
                className="text-[10px] font-medium px-1.5 py-0.5 rounded-full"
                style={{ color: m.color, backgroundColor: `${m.color}14` }}
              >
                {ev.type}
              </span>
            </div>
            <div className="mt-0.5 text-xs text-slate-500">
              {ev.actor} <span className="text-slate-300">•</span> {relTime(ev.timestamp)}
            </div>
          </li>
        );
      })}
    </ol>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// Page
// ═══════════════════════════════════════════════════════════════════════════════
export default function AssetProfilePage() {
  const { id = '' } = useParams();
  // Read through the in-session registry, so an asset registered a minute ago
  // resolves here exactly like one that shipped with the demo data.
  const { getAsset } = useRegistry();
  const asset = getAsset(id);
  const { toast } = useToast();
  const navigate = useNavigate();

  const { run, isPending } = useMutate();

  const [activeTab, setActiveTab] = useState<TabKey>('overview');
  const [timelineFilter, setTimelineFilter] = useState<string>('All');
  const [dialog, setDialog] = useState<DialogKey>(null);
  // Read straight from the hydrated dataset rather than held in local state:
  // `useMutate` re-reads it after every write, so a work order raised here
  // appears because the source of truth changed, not because a setter ran.
  const workOrders = getWorkOrdersForAsset(id);

  // Deep-link: read ?tab= on mount, keep URL in sync on switch (client-only, no Suspense needed).
  useEffect(() => {
    const q = new URLSearchParams(window.location.search).get('tab');
    if (q && TABS.some((t) => t.k === q)) setActiveTab(q as TabKey);
  }, []);

  const goTab = (k: TabKey) => {
    setActiveTab(k);
    const url = new URL(window.location.href);
    url.searchParams.set('tab', k);
    window.history.replaceState(null, '', url.toString());
  };

  const notify = (title: string, tone: 'default' | 'success' | 'info' = 'success') =>
    toast({ title, tone });

  // ── not-found ────────────────────────────────────────────────────────────────
  if (!asset) {
    return (
      <div className="h-full flex flex-col items-center justify-center text-center">
        <div className="glass-panel rounded-xl p-12 max-w-md">
          <div className="text-5xl mb-4">🔍</div>
          <h1 className="text-2xl font-heading font-bold tracking-tight">Asset not found</h1>
          <p className="text-slate-500 mt-2">
            No asset matches <span className="font-mono text-slate-400">{id}</span>. It may have been retired or the
            link is out of date.
          </p>
          <Link to="/assets" className={cn(linkCls('primary'), 'mt-6')}>
            ← Back to Asset Registry
          </Link>
        </div>
      </div>
    );
  }

  // ── derived data ───────────────────────────────────────────────────────────────
  const tel = asset.telemetry;
  const insights = getInsightsForAsset(id);
  const activity = getActivityForAsset(id);
  const docs = getDocsForAsset(id);
  const groups = getGroupsForAsset(id);
  const trend = asset.healthTrend ?? [];
  const taxonomyClass = allAssetClasses.find((c) => c.name === asset.category);

  const custodyEvents = activity.filter((e) => e.type === 'Custody' || e.type === 'Movement');
  const auditEvents = activity.filter((e) => e.type === 'Audit');
  const timelineEvents =
    timelineFilter === 'All' ? activity : activity.filter((e) => e.type === timelineFilter);
  const timelineTypes = ['All', ...Array.from(new Set(activity.map((e) => e.type)))];

  const tiles: { emoji: string; label: string; value: string; warn?: boolean }[] = [];
  if (tel?.temperature !== undefined) tiles.push({ emoji: '🌡️', label: 'Temperature', value: `${tel.temperature}°C` });
  if (tel?.batteryLevel !== undefined)
    tiles.push({ emoji: '🔋', label: 'Battery', value: `${tel.batteryLevel}%`, warn: tel.batteryLevel < 20 });
  if (tel?.vibration !== undefined) tiles.push({ emoji: '📳', label: 'Vibration', value: `${tel.vibration} mm/s` });
  if (tel?.humidity !== undefined) tiles.push({ emoji: '💧', label: 'Humidity', value: `${tel.humidity}%` });

  const retained =
    asset.purchasePrice && asset.bookValue !== undefined
      ? Math.min(100, Math.round((asset.bookValue / asset.purchasePrice) * 100))
      : 0;
  const warrantyDays = asset.warrantyExpiry ? daysUntil(asset.warrantyExpiry) : null;
  const warrantyExpired = warrantyDays !== null && warrantyDays < 0;
  const ageYears = ((nowMs() - Date.parse(asset.purchaseDate)) / (365.25 * 86_400_000)).toFixed(1);
  const risk = asset.riskScore ?? 0;

  const critWeight = { Low: 25, Medium: 50, High: 75, Critical: 95 }[asset.criticality ?? 'Low'] ?? 25;
  const riskDims = [
    { label: 'Failure probability', value: 100 - asset.healthScore },
    { label: 'Business criticality', value: critWeight },
    { label: 'Security / theft exposure', value: asset.status === 'Missing' ? 90 : asset.tags.includes('High Value') ? 55 : 25 },
    { label: 'Compliance / warranty gap', value: warrantyExpired ? 70 : warrantyDays !== null && warrantyDays < 90 ? 45 : 15 },
    { label: 'Financial exposure', value: Math.min(100, Math.round(asset.purchasePrice / 1500)) },
  ];

  /**
   * What has actually changed about this asset.
   *
   * This table used to be five hardcoded rows asserting that Status, Custodian,
   * Location, Lifecycle stage and Criticality each changed from "—" on the
   * purchase date, followed by the fixed line "Registration is the first entry
   * — no edits recorded since." It printed that sentence whether or not edits
   * existed, and it never showed one.
   *
   * The real record is the activity stream: the service writes an entry for
   * every status change, move and custody event, with the actor who made it.
   */
  const historyRows = activity
    .filter((e) => e.type === 'Audit' || e.type === 'Movement' || e.type === 'Custody')
    .map((e) => ({ id: e.id, what: e.description, who: e.actor, ts: e.timestamp, source: e.type }));

  /**
   * Raise a work order against this asset.
   *
   * This used to mint a client-side id (`WO-${5100 + workOrders.length}`) and
   * push it into local state. It looked like it worked — the row appeared on
   * the Maintenance tab, the toast named an id — and it was gone on the next
   * reload, having never reached the API. Worse than a button that does
   * nothing, because nobody thinks to check.
   *
   * The server owns the id and the created/updated timestamps.
   */
  const createWorkOrder = async () => {
    const created = await run(
      maintenanceApi.create({
        title: `Health check — ${asset.name}`,
        assetId: asset.id,
        priority: asset.healthScore < 50 ? 'Critical' : 'Medium',
        type: 'Predictive',
        description: `Raised from the asset profile. Health ${asset.healthScore}, risk ${asset.riskScore ?? 0}.`,
        estimatedHours: 2,
        dueDate: new Date(nowMs() + 3 * 86_400_000).toISOString(),
      }),
      { success: 'Work order created', successDetail: `Against ${asset.id}.`, describe: 'create that work order' },
    );
    if (created) goTab('maintenance');
  };

  const downloadDoc = async (d: AssetDoc) => {
    try {
      await documentsApi.download(d);
    } catch {
      // The metadata row can outlive its bytes — a document seeded before
      // uploads stored files has nothing to send.
      notify(`${d.name} has no stored file to download`, 'info');
    }
  };

  const removeDoc = (d: AssetDoc) =>
    run(documentsApi.remove(d.id), {
      success: `${d.name} removed`,
      describe: 'remove that document',
    });

  /** Act on an insight, or dismiss it. Both were toasts; both are endpoints. */
  const actOnInsight = (insight: AIInsight, label: string) =>
    run(insightsApi.action(insight.id), {
      success: `${label} — recorded`,
      successDetail: `${insight.id} marked as actioned.`,
      describe: 'record that action',
    });

  const closeDialog = () => setDialog(null);

  /**
   * The readings this asset actually has.
   *
   * Two sources, both real: the latest telemetry sample the record carries, and
   * the health-derived trend behind the sparkline. Labelled by origin so the
   * file cannot be mistaken for a raw sensor history — there is no time-series
   * store here, only the last sample and a rollup.
   */
  const exportSensorCsv = () => {
    const rows: Record<string, unknown>[] = [];
    if (tel) {
      const at = tel.lastPing ? formatDate(tel.lastPing) : '';
      if (tel.temperature !== undefined) rows.push({ Source: 'Latest sample', Channel: 'Temperature', Value: tel.temperature, Unit: '°C', At: at });
      if (tel.humidity !== undefined) rows.push({ Source: 'Latest sample', Channel: 'Humidity', Value: tel.humidity, Unit: '%', At: at });
      if (tel.vibration !== undefined) rows.push({ Source: 'Latest sample', Channel: 'Vibration', Value: tel.vibration, Unit: 'mm/s', At: at });
      if (tel.batteryLevel !== undefined) rows.push({ Source: 'Latest sample', Channel: 'Battery', Value: tel.batteryLevel, Unit: '%', At: at });
    }
    for (const p of trend) {
      rows.push({ Source: 'Health rollup', Channel: 'Health score', Value: p.value, Unit: '/100', At: p.label });
    }

    if (downloadCsv(`${asset.id}-readings`, rows) === 0) {
      notify('There are no readings to export for this asset', 'info');
    }
  };

  /**
   * The financial facts this platform actually holds for one asset.
   *
   * Not a TCO report: that needs energy, downtime and operator cost, none of
   * which are collected here. Naming it for what it contains keeps the file
   * from being read as something it is not.
   */
  const exportFinancials = () => {
    // Parts consumption is costed — every WoPart carries a unit cost. Labour is
    // not: hours are logged but no rate is stored anywhere, so it is reported
    // in hours rather than converted at a rate this platform would be inventing.
    const partsCost = workOrders.reduce(
      (sum, wo) => sum + wo.parts.reduce((p, part) => p + part.qty * part.unitCost, 0),
      0,
    );
    const labourHours = workOrders.reduce(
      (sum, wo) => sum + wo.laborLog.reduce((h, entry) => h + entry.hours, 0),
      0,
    );

    downloadCsv(`${asset.id}-financials`, [
      {
        Asset: asset.id,
        Name: asset.name,
        Category: asset.category,
        Purchased: formatDate(asset.purchaseDate),
        'Purchase price': asset.purchasePrice,
        'Book value': asset.bookValue ?? '',
        Depreciation: asset.depreciationMethod ?? '',
        'Age (years)': ageYears,
        'Warranty expiry': asset.warrantyExpiry ? formatDate(asset.warrantyExpiry) : '',
        'Work orders': workOrders.length,
        'Parts cost': partsCost,
        'Labour hours logged': labourHours,
      },
    ]);
  };

  const actions = (
    <>
      <button onClick={() => void createWorkOrder()} disabled={isPending} className={linkCls('primary')}>
        + Create Work Order
      </button>
      <Link to={`/assets/${asset.id}/edit`} className={linkCls('outline')}>
        Edit
      </Link>
      <Dropdown
        ariaLabel="More actions"
        trigger={({ toggle }) => (
          <button onClick={toggle} className={linkCls('outline')}>
            More ▾
          </button>
        )}
      >
        {({ close }) => (
          <>
            <MenuItem onClick={() => { navigate('/tracking'); close(); }}>Locate on Map</MenuItem>
            <MenuItem onClick={() => { setDialog('transfer'); close(); }}>Transfer</MenuItem>
            <MenuItem onClick={() => { setDialog('custody'); close(); }}>Custody</MenuItem>
            <MenuItem onClick={() => { navigate(`/assets/labels?ids=${asset.id}`); close(); }}>Print Label</MenuItem>
            <MenuItem onClick={() => { setDialog('retire'); close(); }}>Retire</MenuItem>
          </>
        )}
      </Dropdown>
    </>
  );

  return (
    <div className="h-full flex flex-col space-y-6">
      {/* ── Header ─────────────────────────────────────────────────────────────── */}
      <PageHeader
        breadcrumb={[
          { label: 'Assets', href: '/assets' },
          { label: 'Registry', href: '/assets' },
          { label: asset.id },
        ]}
        title={asset.name}
        subtitle={`${asset.id} • ${asset.category}${asset.serialNumber ? ` • SN ${asset.serialNumber}` : ''}`}
        actions={<div className="flex items-center gap-2">{actions}</div>}
      />

      {/* Chip row */}
      <div className="flex flex-wrap items-center gap-2 -mt-2">
        {asset.onboarding.state !== 'Active' && (
          <Badge tone={asset.onboarding.state === 'Pending Approval' ? 'amber' : 'primary'}>
            {asset.onboarding.state === 'Pending Approval' ? '⏳ Pending approval' : '📝 Draft — setup incomplete'}
          </Badge>
        )}
        <Badge tone={statusTone(asset.status)}>{asset.status.replace('_', ' ')}</Badge>
        <Badge tone={healthTone(asset.healthStatus)}>
          <span className="h-2 w-2 rounded-full" style={{ backgroundColor: healthHex(asset.healthScore) }} />
          {asset.healthStatus} · {asset.healthScore}
        </Badge>
        <Badge tone={riskBand(risk) === 'Low' ? 'emerald' : riskBand(risk) === 'Critical' ? 'red' : 'amber'}>
          Risk {risk} · {riskBand(risk)}
        </Badge>
        <span className="inline-flex items-center gap-1.5 text-xs text-slate-500 ml-1">
          <Avatar initials={asset.custodian.slice(0, 2).toUpperCase()} className="w-5 h-5 text-[10px]" />
          {asset.custodian}
        </span>
        <span className="text-xs text-slate-400">📍 {locationPath(asset)}</span>
        {tel?.lastPing && (
          <span className="inline-flex items-center gap-1.5 text-xs text-slate-500">
            <span className="inline-flex rounded-full h-2 w-2 bg-health-good" />
            last ping {relTime(tel.lastPing)}
          </span>
        )}
      </div>

      {/* ── Setup checklist — the wizard's Configure stage, in place ──────────────
          Same component the registration flow renders. A user who abandoned the
          wizard finds the identical list waiting here, which is what makes
          "leave any time" a real promise rather than a slogan. */}
      {asset.onboarding.state !== 'Active' && (
        <SetupChecklist
          asset={asset}
          onJump={() => navigate(`/assets/new?resume=${asset.id}`)}
          footer={
            <Link to={`/assets/new?resume=${asset.id}`}>
              <Button>Resume setup →</Button>
            </Link>
          }
        />
      )}

      {/* ── Two-column body ────────────────────────────────────────────────────── */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* LEFT rail */}
        <div className="space-y-6 lg:col-span-1">
          {/* Health gauge */}
          <div className="glass-panel p-6 rounded-xl">
            <div className="flex flex-col items-center">
              <Ring value={asset.healthScore} color={healthHex(asset.healthScore)} label="Health" />
              <div className="mt-5 grid grid-cols-2 gap-3 w-full">
                <div className="rounded-lg border border-slate-200 p-3 text-center">
                  <div className="text-xs text-slate-500">Risk Score</div>
                  <div className="text-2xl font-heading font-bold" style={{ color: riskHex(risk) }}>
                    {asset.riskScore ?? '—'}
                  </div>
                </div>
                <div className="rounded-lg border border-slate-200 p-3 text-center">
                  <div className="text-xs text-slate-500">Criticality</div>
                  <div className="text-2xl font-heading font-bold text-slate-800">{asset.criticality ?? '—'}</div>
                </div>
              </div>
              {asset.utilization !== undefined && (
                <div className="mt-4 w-full">
                  <div className="flex items-center justify-between text-xs mb-1.5">
                    <span className="text-slate-500 font-medium">Utilization</span>
                    <span className="font-semibold">{asset.utilization}%</span>
                  </div>
                  <div className="h-2 w-full rounded-full bg-slate-200 overflow-hidden">
                    <div className="h-full rounded-full bg-primary-500" style={{ width: `${asset.utilization}%` }} />
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* Identity card */}
          <div className="glass-panel p-6 rounded-xl">
            <h3 className="font-heading font-bold text-base mb-4">Identity</h3>
            <dl className="grid grid-cols-2 gap-x-4 gap-y-4">
              <KV label="Manufacturer" value={asset.manufacturer} />
              <KV label="Model" value={asset.model} />
              <KV label="Serial" value={<span className="font-mono">{asset.serialNumber}</span>} />
              <KV label="Custodian" value={asset.custodian} />
              <KV label="Tracking" value={asset.trackingTech} />
              <KV label="Tracking ID" value={asset.trackingId ? <span className="font-mono">{asset.trackingId}</span> : undefined} />
              <KV label="Lifecycle" value={asset.lifecycleStage} />
              {taxonomyClass && <KV label="Class" value={`${taxonomyClass.icon} ${taxonomyClass.name}`} />}
            </dl>
            <div className="mt-4">
              <dt className="text-xs font-medium uppercase tracking-wide text-slate-500">Location</dt>
              <dd className="mt-1 text-sm font-medium text-slate-900">{locationPath(asset)}</dd>
            </div>
            {asset.tags.length > 0 && (
              <div className="mt-5 flex flex-wrap gap-2">
                {asset.tags.map((tag) => (
                  <span
                    key={tag}
                    className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-primary-500/10 text-primary-600 border border-primary-500/20"
                  >
                    {tag}
                  </span>
                ))}
              </div>
            )}
            {groups.length > 0 && (
              <div className="mt-4 pt-4 border-t border-slate-200">
                <dt className="text-xs font-medium uppercase tracking-wide text-slate-500 mb-2">Groups &amp; Kits</dt>
                <div className="space-y-1.5">
                  {groups.map((g) => (
                    <div key={g.id} className="flex items-center gap-2 text-sm">
                      <span className="text-slate-400">
                        {g.type === 'Fleet' ? '💻' : g.type === 'Kit' ? '📦' : '🗂️'}
                      </span>
                      <span className="text-slate-700 truncate">{g.name}</span>
                      <span className="text-[10px] text-slate-400">{g.type}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* Telemetry snapshot */}
          {(tiles.length > 0 || tel?.lastPing) && (
            <div className="glass-panel p-6 rounded-xl">
              <div className="flex items-center justify-between mb-4">
                <h3 className="font-heading font-bold text-base">Live Telemetry</h3>
                {tel?.lastPing && <span className="text-xs text-slate-500">{relTime(tel.lastPing)}</span>}
              </div>
              {tiles.length > 0 ? (
                <div className="grid grid-cols-2 gap-3">
                  {tiles.map((tile) => (
                    <TelemetryTile key={tile.label} {...tile} />
                  ))}
                </div>
              ) : (
                <p className="text-sm text-slate-500">No sensor channels reporting.</p>
              )}
            </div>
          )}
        </div>

        {/* RIGHT — tabbed panel */}
        <div className="lg:col-span-2">
          <div className="glass-panel rounded-xl overflow-hidden">
            {/* Tab bar */}
            <div className="flex overflow-x-auto border-b border-slate-200 px-2">
              {TABS.map((tab) => {
                const active = activeTab === tab.k;
                const badge =
                  tab.k === 'maintenance' ? workOrders.length
                    : tab.k === 'documents' ? docs.length
                      : tab.k === 'ai' ? insights.length
                        : undefined;
                return (
                  <button
                    key={tab.k}
                    onClick={() => goTab(tab.k)}
                    className={cn(
                      'relative px-4 py-3 text-sm font-medium whitespace-nowrap transition-colors',
                      active ? 'text-primary-600' : 'text-slate-500 hover:text-slate-800',
                    )}
                  >
                    {tab.label}
                    {badge !== undefined && badge > 0 && <span className="ml-1.5 text-xs text-slate-400">({badge})</span>}
                    {active && <span className="absolute inset-x-2 -bottom-px h-0.5 rounded-full bg-primary-500" />}
                  </button>
                );
              })}
            </div>

            <div className="p-6">
              {/* ── OVERVIEW ───────────────────────────────────────────────── */}
              {activeTab === 'overview' && (
                <div className="space-y-6">
                  {trend.length > 0 && (
                    <div>
                      <div className="flex items-center justify-between mb-3">
                        <SectionTitle>Health Trend</SectionTitle>
                        <span className="text-xs text-slate-500">
                          {trend[0].label} – {trend[trend.length - 1].label}
                        </span>
                      </div>
                      <Sparkline points={trend} height={72} color={healthHex(asset.healthScore)} gradientId="ov-trend" />
                      <div className="flex justify-between mt-1 text-[10px] text-slate-500">
                        {trend.map((p) => (
                          <span key={p.label}>{p.label}</span>
                        ))}
                      </div>
                    </div>
                  )}

                  <div>
                    <SectionTitle>Key Attributes</SectionTitle>
                    <dl className="grid grid-cols-2 sm:grid-cols-3 gap-x-4 gap-y-4">
                      <KV label="Category" value={asset.category} />
                      <KV label="Status" value={asset.status.replace('_', ' ')} />
                      <KV label="Criticality" value={asset.criticality} />
                      <KV label="Open Work Orders" value={String(workOrders.length)} />
                      <KV label="Utilization" value={asset.utilization !== undefined ? `${asset.utilization}%` : '—'} />
                      <KV label="Purchased" value={formatDate(asset.purchaseDate)} />
                    </dl>
                  </div>

                  {insights.length > 0 ? (
                    <div>
                      <SectionTitle count={insights.length}>AI Insights</SectionTitle>
                      <div className="space-y-4">
                        {insights.map((ins) => (
                          <InsightCard key={ins.id} ins={ins} onAct={(l) => void actOnInsight(ins, l)} />
                        ))}
                      </div>
                    </div>
                  ) : (
                    <EmptyState icon="✅" title="No AI insights" description="This asset is nominal — nothing needs attention." />
                  )}
                </div>
              )}

              {/* ── TIMELINE ───────────────────────────────────────────────── */}
              {activeTab === 'timeline' && (
                <div className="space-y-4">
                  {activity.length > 0 && (
                    <div className="flex flex-wrap gap-1.5">
                      {timelineTypes.map((t) => (
                        <button
                          key={t}
                          onClick={() => setTimelineFilter(t)}
                          className={cn(
                            'px-2.5 py-1 rounded-full text-xs font-medium border transition-colors',
                            timelineFilter === t
                              ? 'bg-primary-600 text-white border-primary-600'
                              : 'border-slate-200 text-slate-600 hover:bg-slate-50',
                          )}
                        >
                          {t}
                        </button>
                      ))}
                    </div>
                  )}
                  {timelineEvents.length > 0 ? (
                    <TimelineList events={timelineEvents} />
                  ) : (
                    <EmptyState
                      icon="📭"
                      title={activity.length === 0 ? 'No recorded activity' : 'No matching events'}
                      description={activity.length === 0 ? 'Events will appear here as this asset moves through its lifecycle.' : 'Try a different event type.'}
                      variant={activity.length === 0 ? 'empty' : 'no-results'}
                    />
                  )}
                </div>
              )}

              {/* ── LIVE TRACKING ──────────────────────────────────────────── */}
              {activeTab === 'tracking' && (
                <div className="space-y-6">
                  {asset.mapPosition ? (
                    <>
                      <div className="relative w-full h-56 rounded-lg border border-slate-200 bg-[repeating-linear-gradient(45deg,#f1f5f9,#f1f5f9_12px,#f8fafc_12px,#f8fafc_24px)] overflow-hidden">
                        <div
                          className="absolute"
                          style={{ left: `${asset.mapPosition.x}%`, top: `${asset.mapPosition.y}%`, transform: 'translate(-50%,-50%)' }}
                        >
                          <span className="relative flex h-4 w-4">
                            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-primary-500 opacity-60" />
                            <span className="relative inline-flex rounded-full h-4 w-4 bg-primary-600 ring-2 ring-white" />
                          </span>
                        </div>
                        <span className="absolute bottom-2 left-3 text-[10px] font-medium text-slate-500">
                          Facility floor-plan · {asset.location.name}
                        </span>
                      </div>
                      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                        <TelemetryTile emoji="📡" label="Tracking Tech" value={asset.trackingTech ?? '—'} />
                        <TelemetryTile
                          emoji="🎯"
                          label="Confidence"
                          value={`${Math.max(60, 100 - Math.round((asset.riskScore ?? 0) / 3))}%`}
                        />
                        <TelemetryTile
                          emoji="🔋"
                          label="Tag Battery"
                          value={tel?.batteryLevel !== undefined ? `${tel.batteryLevel}%` : '—'}
                          warn={tel?.batteryLevel !== undefined && tel.batteryLevel < 20}
                        />
                        <TelemetryTile emoji="🛰️" label="Last Fix" value={tel?.lastPing ? relTime(tel.lastPing) : '—'} />
                      </div>
                      <div className="flex items-center justify-between rounded-lg border border-slate-200 p-4">
                        <div className="min-w-0">
                          <div className="text-sm font-medium text-slate-800">{locationPath(asset)}</div>
                          {/* "Geofence: within bounds" was printed here
                              unconditionally — it said the asset was inside its
                              boundary whether or not any geofence covered it,
                              which is the one thing this line exists to tell
                              you. Containment is evaluated on the tracking
                              workspace against real observations; the honest
                              thing here is the zone, which the record knows. */}
                          <div className="text-xs text-slate-500 mt-0.5">
                            Zone: {asset.location.zone ?? asset.location.building ?? '—'}
                          </div>
                        </div>
                        <div className="flex gap-2 flex-shrink-0">
                          {/* "Ping Tag" raised a toast. Nothing in this platform
                              can command a tag — readers report, they are not
                              addressable — so there is nothing to wire it to. */}
                          <Link to="/tracking" className={cn(linkCls('primary'), 'text-xs px-3 py-1.5 rounded-md')}>
                            Open Live Map
                          </Link>
                        </div>
                      </div>
                    </>
                  ) : (
                    <EmptyState
                      icon="📍"
                      title="No tracking device attached"
                      description="Attach an RFID / BLE / UWB tag to see this asset live on the map."
                      action={
                        <Link to={`/assets/labels?ids=${asset.id}`} className={cn(linkCls('outline'), 'text-xs px-3 py-1.5 rounded-md')}>
                          Print &amp; bind a tag
                        </Link>
                      }
                    />
                  )}
                </div>
              )}

              {/* ── HEALTH ─────────────────────────────────────────────────── */}
              {activeTab === 'health' && (
                <div className="space-y-6">
                  <div className="flex flex-col sm:flex-row items-center gap-6">
                    <Ring value={asset.healthScore} color={healthHex(asset.healthScore)} label="Health" />
                    <div className="flex-1 w-full space-y-3">
                      <div className="flex items-center gap-2">
                        <Badge tone={healthTone(asset.healthStatus)}>{asset.healthStatus}</Badge>
                        <span className="text-sm text-slate-500">
                          {asset.healthScore >= 80
                            ? 'Operating within nominal range.'
                            : asset.healthScore >= 50
                              ? 'Degrading — monitor closely.'
                              : 'Critical — intervention recommended.'}
                        </span>
                      </div>
                      <div className="rounded-lg border border-slate-200 p-3">
                        <div className="text-xs text-slate-500">Estimated remaining useful life</div>
                        <div className="text-lg font-heading font-bold text-slate-800 mt-0.5">
                          {asset.healthScore >= 80 ? '> 12 months' : asset.healthScore >= 50 ? '~3–6 months' : '< 30 days'}
                        </div>
                      </div>
                      {/* The 👍 was removed: nothing stores model feedback, so
                          it thanked the user for something discarded on the
                          spot. Explain now opens the real driver breakdown. */}
                      <div className="flex gap-2">
                        <Button variant="outline" size="sm" onClick={() => setDialog('explain')}>Explain</Button>
                        <Button variant="primary" size="sm" disabled={isPending} onClick={() => void createWorkOrder()}>
                          Create Predictive WO
                        </Button>
                      </div>
                    </div>
                  </div>

                  {trend.length > 0 && (
                    <div>
                      <SectionTitle>Health Trend</SectionTitle>
                      <div className="rounded-lg border border-slate-200 p-4">
                        <Sparkline points={trend} height={140} color={healthHex(asset.healthScore)} gradientId="hl-trend" />
                        <div className="flex justify-between mt-2 text-[10px] text-slate-500">
                          {trend.map((p) => (
                            <span key={p.label}>{p.label}</span>
                          ))}
                        </div>
                      </div>
                    </div>
                  )}

                  <div>
                    <SectionTitle>Contributing Signals</SectionTitle>
                    <div className="space-y-2.5">
                      <DimensionBar label="Vibration deviation" value={tel?.vibration ? Math.min(100, tel.vibration * 40) : 20} />
                      <DimensionBar label="Thermal load" value={tel?.temperature ? Math.min(100, tel.temperature * 1.4) : 30} />
                      <DimensionBar label="Age wear" value={Math.min(100, Number(ageYears) * 14)} />
                      <DimensionBar label="Service overdue risk" value={100 - asset.healthScore} />
                    </div>
                  </div>

                  {insights.filter((i) => i.type === 'Predictive Failure' || i.type === 'Anomaly').length > 0 && (
                    <div className="space-y-4">
                      {insights
                        .filter((i) => i.type === 'Predictive Failure' || i.type === 'Anomaly')
                        .map((ins) => (
                          <InsightCard key={ins.id} ins={ins} onAct={(l) => void actOnInsight(ins, l)} />
                        ))}
                    </div>
                  )}
                </div>
              )}

              {/* ── MAINTENANCE ────────────────────────────────────────────── */}
              {activeTab === 'maintenance' && (
                <div className="space-y-3">
                  {workOrders.length === 0 ? (
                    <EmptyState
                      icon="🧰"
                      title="No work orders"
                      description="Nothing wrench-related on file for this asset yet."
                      action={<Button variant="primary" size="sm" onClick={createWorkOrder}>+ Create Work Order</Button>}
                    />
                  ) : (
                    <>
                      {workOrders.map((wo) => (
                        <div key={wo.id} className="rounded-lg border border-slate-200 p-4 hover:bg-slate-50 transition-colors">
                          <div className="flex items-start justify-between gap-3">
                            <div className="min-w-0">
                              <div className="flex items-center gap-2 flex-wrap">
                                <span className="text-sm font-semibold text-slate-800 truncate">{wo.title}</span>
                                {wo.aiGenerated && (
                                  <span className="text-[10px] font-medium px-1.5 py-0.5 rounded bg-primary-500/10 text-primary-600">
                                    AI
                                  </span>
                                )}
                              </div>
                              <div className="mt-1 text-xs text-slate-500">
                                {wo.id} <span className="text-slate-300">•</span> {wo.type}{' '}
                                <span className="text-slate-300">•</span> {wo.assignedTo}{' '}
                                <span className="text-slate-300">•</span> Due {formatDate(wo.dueDate)}
                              </div>
                            </div>
                            <div className="flex flex-col items-end gap-1.5 flex-shrink-0">
                              <Badge tone={woStatusTone(wo.status)}>{wo.status}</Badge>
                              <Badge tone={priorityTone(wo.priority)}>{wo.priority}</Badge>
                            </div>
                          </div>
                        </div>
                      ))}
                      <div className="pt-2">
                        <Link to="/maintenance" className="text-sm text-primary-600 font-medium hover:underline">
                          View all in Maintenance →
                        </Link>
                      </div>
                    </>
                  )}
                </div>
              )}

              {/* ── WARRANTY & CONTRACTS ───────────────────────────────────── */}
              {activeTab === 'warranty' && (
                <div className="space-y-6">
                  {asset.warrantyExpiry ? (
                    <div
                      className={cn(
                        'rounded-lg border p-5',
                        warrantyExpired ? 'border-red-200 bg-red-50' : 'border-emerald-200 bg-emerald-50',
                      )}
                    >
                      <div className="flex items-center justify-between">
                        <div>
                          <div className="text-xs uppercase tracking-wide text-slate-500">Manufacturer Warranty</div>
                          <div className="text-lg font-heading font-bold text-slate-900 mt-1">
                            {warrantyExpired ? 'Expired' : 'Active'}
                          </div>
                        </div>
                        <div className="text-right">
                          <div className="text-2xl font-heading font-bold" style={{ color: warrantyExpired ? '#ef4444' : '#10b981' }}>
                            {warrantyExpired ? `${Math.abs(warrantyDays!)}d` : `${warrantyDays}d`}
                          </div>
                          <div className="text-xs text-slate-500">{warrantyExpired ? 'past expiry' : 'to expiry'}</div>
                        </div>
                      </div>
                      <div className="mt-4 grid grid-cols-2 gap-4">
                        <KV label="Expiry Date" value={formatDate(asset.warrantyExpiry)} />
                        <KV label="Provider" value={asset.manufacturer ?? '—'} />
                      </div>
                      <div className="mt-4 flex gap-2">
                        {/* "File a Claim" and "Set Reminder" were toasts. There
                            is no claims workflow and no reminder store to write
                            to. What does exist is an alert rule that fires on
                            warranty expiry, and the certification register that
                            tracks renewals — so the buttons point at those
                            rather than pretending to be them. */}
                        <Link to="/alerts/rules" className={cn(linkCls('outline'), 'text-xs px-3 py-1.5 rounded-md')}>
                          Alert me before expiry
                        </Link>
                        <Link to="/compliance/certifications" className={cn(linkCls('ghost'), 'text-xs px-3 py-1.5 rounded-md')}>
                          Track renewal
                        </Link>
                      </div>
                    </div>
                  ) : (
                    <EmptyState icon="📄" title="No warranty on file" description="No warranty or service contract is recorded for this asset." />
                  )}

                  {docs.filter((d) => d.type === 'Warranty' || d.type === 'Certificate').length > 0 && (
                    <div>
                      <SectionTitle>Coverage Documents</SectionTitle>
                      <div className="space-y-2">
                        {docs
                          .filter((d) => d.type === 'Warranty' || d.type === 'Certificate')
                          .map((d) => (
                            <button
                              key={d.id}
                              onClick={() => goTab('documents')}
                              className="w-full flex items-center gap-3 rounded-lg border border-slate-200 p-3 text-left hover:bg-slate-50 transition-colors"
                            >
                              <span className="text-lg">📎</span>
                              <span className="flex-1 text-sm text-slate-700 truncate">{d.name}</span>
                              <Badge tone={docTone(d.type)}>{d.type}</Badge>
                            </button>
                          ))}
                      </div>
                    </div>
                  )}
                </div>
              )}

              {/* ── OWNERSHIP & CUSTODY ────────────────────────────────────── */}
              {activeTab === 'custody' && (
                <div className="space-y-6">
                  <div className="rounded-lg border border-slate-200 p-5 flex items-center gap-4">
                    <Avatar initials={asset.custodian.slice(0, 2).toUpperCase()} className="w-12 h-12 text-base" />
                    <div className="min-w-0">
                      <div className="text-xs uppercase tracking-wide text-slate-500">Current Custodian</div>
                      <div className="text-lg font-heading font-bold text-slate-900">{asset.custodian}</div>
                      <div className="text-xs text-slate-500 mt-0.5">Accountable at {asset.location.name}</div>
                    </div>
                    <div className="ml-auto flex gap-2 flex-shrink-0">
                      <Button variant="outline" size="sm" onClick={() => setDialog('custody')}>Custody</Button>
                      <Button variant="primary" size="sm" onClick={() => setDialog('transfer')}>Transfer</Button>
                    </div>
                  </div>

                  <div>
                    <SectionTitle>Chain of Custody</SectionTitle>
                    {custodyEvents.length > 0 ? (
                      <TimelineList events={custodyEvents} />
                    ) : (
                      <EmptyState icon="🤝" title="No custody events" description="Custody assignments and transfers will appear here." />
                    )}
                  </div>
                </div>
              )}

              {/* ── DOCUMENTS ──────────────────────────────────────────────── */}
              {activeTab === 'documents' && (
                <div className="space-y-3">
                  {docs.length === 0 ? (
                    <EmptyState
                      icon="📁"
                      title="No documents yet"
                      description="Invoices, warranty certificates, manuals and nameplate photos attached to this asset appear here."
                      action={
                        <Button variant="outline" size="sm" onClick={() => setDialog('upload')}>
                          Attach a document
                        </Button>
                      }
                    />
                  ) : (
                    <>
                      <div className="flex items-center justify-between">
                        <span className="text-xs text-slate-500">
                          {docs.length} document{docs.length === 1 ? '' : 's'} · {docSizeLabel(docs)}
                        </span>
                        <Button variant="outline" size="sm" onClick={() => setDialog('upload')}>
                          + Attach
                        </Button>
                      </div>

                      {docs.map((d: AssetDoc) => (
                        <div key={d.id} className="flex items-center gap-3 rounded-lg border border-slate-200 p-3 hover:bg-slate-50 transition-colors">
                          <span className="text-xl flex-shrink-0">
                            {d.type === 'Image' ? '🖼️' : d.type === 'CAD' ? '📐' : d.type === 'Invoice' ? '🧾' : '📄'}
                          </span>
                          <div className="min-w-0 flex-1">
                            <div className="text-sm font-medium text-slate-800 truncate">{d.name}</div>
                            <div className="text-xs text-slate-500 mt-0.5">
                              {fileSize(d.sizeKb)} <span className="text-slate-300">•</span> {d.uploadedBy}{' '}
                              <span className="text-slate-300">•</span> {relTime(d.uploadedAt)}
                            </div>
                          </div>
                          <Badge tone={docTone(d.type)}>{d.type}</Badge>
                          <button
                            onClick={() => void downloadDoc(d)}
                            className="text-xs text-primary-600 font-medium hover:underline flex-shrink-0"
                          >
                            Download
                          </button>
                          <button
                            onClick={() => void removeDoc(d)}
                            disabled={isPending}
                            className="text-xs text-slate-400 hover:text-red-600 flex-shrink-0 disabled:opacity-40"
                            aria-label={`Delete ${d.name}`}
                            title="Delete"
                          >
                            ✕
                          </button>
                        </div>
                      ))}
                    </>
                  )}
                </div>
              )}

              {/* ── SENSOR DATA ────────────────────────────────────────────── */}
              {activeTab === 'sensors' && (
                <div className="space-y-6">
                  {tiles.length > 0 || trend.length > 0 ? (
                    <>
                      <div>
                        <div className="flex items-center justify-between mb-3">
                          <SectionTitle>Current Readings</SectionTitle>
                          {tel?.lastPing && <span className="text-xs text-slate-500">Last sample {relTime(tel.lastPing)}</span>}
                        </div>
                        {tiles.length > 0 ? (
                          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                            {tiles.map((tile) => (
                              <TelemetryTile key={tile.label} {...tile} />
                            ))}
                          </div>
                        ) : (
                          <p className="text-sm text-slate-500">No live channels — showing derived health signal.</p>
                        )}
                      </div>

                      {trend.length > 0 && (
                        <div>
                          <div className="flex items-center justify-between mb-3">
                            <SectionTitle>Health-Derived Signal</SectionTitle>
                            <span className="text-xs text-slate-500">6-month rollup</span>
                          </div>
                          <div className="rounded-lg border border-slate-200 p-4">
                            <Sparkline points={trend} height={160} color={healthHex(asset.healthScore)} gradientId="sn-trend" />
                            <div className="flex justify-between mt-2 text-[10px] text-slate-500">
                              {trend.map((p) => (
                                <span key={p.label}>{p.label}</span>
                              ))}
                            </div>
                          </div>
                        </div>
                      )}

                      <div className="flex gap-2">
                        <Button variant="outline" size="sm" onClick={exportSensorCsv}>Export CSV</Button>
                        {/* Threshold rules are configured against a channel and
                            a comparator, which is the alert-rule editor's whole
                            job. Pointing at it beats a second, narrower editor
                            that writes to the same collection. */}
                        <Link to="/alerts/rules" className={cn(linkCls('ghost'), 'text-xs px-3 py-1.5 rounded-md')}>
                          Set threshold alert
                        </Link>
                      </div>
                    </>
                  ) : (
                    <EmptyState
                      icon="📡"
                      title="No sensors reporting"
                      description="Attach a sensor to stream telemetry for this asset."
                      action={
                        <Link to="/tracking/devices" className={cn(linkCls('outline'), 'text-xs px-3 py-1.5 rounded-md')}>
                          Register a sensor
                        </Link>
                      }
                    />
                  )}
                </div>
              )}

              {/* ── AI INSIGHTS ────────────────────────────────────────────── */}
              {activeTab === 'ai' && (
                <div className="space-y-4">
                  {insights.length > 0 ? (
                    insights.map((ins) => <InsightCard key={ins.id} ins={ins} onAct={(l) => void actOnInsight(ins, l)} />)
                  ) : (
                    <EmptyState icon="✅" title="No AI insights" description="Asset is nominal — the models found nothing that needs attention." />
                  )}
                </div>
              )}

              {/* ── HISTORY (field-level changes) ──────────────────────────── */}
              {activeTab === 'history' && (
                <div className="space-y-3">
                  <p className="text-xs text-slate-500">
                    Recorded changes to this asset — status, location and custody — with who made each one. Distinct
                    from the Audit Log, which records system actions and access.
                  </p>
                  {historyRows.length === 0 ? (
                    <EmptyState
                      icon="📋"
                      title="No changes recorded yet"
                      description="Status changes, moves and custody events appear here as they happen."
                    />
                  ) : (
                    <div className="overflow-x-auto">
                      <table className="w-full text-sm">
                        <thead>
                          <tr className="text-left text-xs uppercase tracking-wide text-slate-500 border-b border-slate-200">
                            <th className="py-2 pr-3 font-medium">Change</th>
                            <th className="py-2 pr-3 font-medium">By</th>
                            <th className="py-2 pr-3 font-medium">Kind</th>
                            <th className="py-2 font-medium">When</th>
                          </tr>
                        </thead>
                        <tbody>
                          {historyRows.map((r) => (
                            <tr key={r.id} className="border-b border-slate-100">
                              <td className="py-2.5 pr-3 text-slate-800">{r.what}</td>
                              <td className="py-2.5 pr-3 text-slate-600">{r.who}</td>
                              <td className="py-2.5 pr-3">
                                <span className="text-[10px] font-medium px-1.5 py-0.5 rounded bg-slate-100 text-slate-600">{r.source}</span>
                              </td>
                              <td className="py-2.5 whitespace-nowrap text-slate-500">{formatDate(r.ts)}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>
              )}

              {/* ── AUDIT LOG (immutable system actions) ───────────────────── */}
              {activeTab === 'audit' && (
                <div className="space-y-4">
                  <div className="flex items-center gap-2 text-xs text-slate-500">
                    <span className="inline-flex items-center gap-1 text-emerald-600 font-medium">🔒 Immutable</span>
                    <span className="text-slate-300">•</span>
                    <span>Tamper-evident record of actions and access. Read-only by design.</span>
                  </div>
                  {auditEvents.length > 0 ? (
                    <TimelineList events={auditEvents} />
                  ) : (
                    <EmptyState
                      icon="🛡️"
                      title="Registration is the first entry"
                      description="No further system actions have been logged against this asset."
                    />
                  )}
                </div>
              )}

              {/* ── RISK ───────────────────────────────────────────────────── */}
              {activeTab === 'risk' && (
                <div className="space-y-6">
                  <div className="flex flex-col sm:flex-row items-center gap-6">
                    <Ring value={risk} color={riskHex(risk)} label="Risk" />
                    <div className="flex-1 w-full space-y-3">
                      <div className="flex items-center gap-2">
                        <Badge tone={riskBand(risk) === 'Low' ? 'emerald' : riskBand(risk) === 'Critical' ? 'red' : 'amber'}>
                          {riskBand(risk)} risk
                        </Badge>
                        <span className="text-sm text-slate-500">Composite of failure, criticality, security &amp; financial exposure.</span>
                      </div>
                      <div className="flex gap-2">
                        {/* "Accept Risk" is gone: nothing stored an acceptance,
                            nothing read one, and no score or report changed as
                            a result. A risk acceptance that vanishes on reload
                            is worse than none — someone believes it is on
                            record. */}
                        <Button variant="outline" size="sm" onClick={() => setDialog('explain')}>Explain</Button>
                      </div>
                    </div>
                  </div>

                  <div>
                    <SectionTitle>Risk Dimensions</SectionTitle>
                    <div className="space-y-2.5">
                      {riskDims.map((d) => (
                        <DimensionBar key={d.label} label={d.label} value={d.value} />
                      ))}
                    </div>
                  </div>

                  {insights.filter((i) => i.type === 'Theft/Security' || i.type === 'Predictive Failure').length > 0 && (
                    <div>
                      <SectionTitle>Top Mitigations</SectionTitle>
                      <div className="space-y-4">
                        {insights
                          .filter((i) => i.type === 'Theft/Security' || i.type === 'Predictive Failure')
                          .map((ins) => (
                            <InsightCard key={ins.id} ins={ins} onAct={(l) => void actOnInsight(ins, l)} />
                          ))}
                      </div>
                    </div>
                  )}
                </div>
              )}

              {/* ── FINANCIALS ─────────────────────────────────────────────── */}
              {activeTab === 'financials' && (
                <div className="space-y-6">
                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
                    <div className="rounded-lg border border-slate-200 p-4">
                      <div className="text-xs text-slate-500">Purchase Price</div>
                      <div className="text-2xl font-heading font-bold mt-1">{formatMoney(asset.purchasePrice)}</div>
                      <div className="text-xs text-slate-400 mt-1">${asset.purchasePrice.toLocaleString()}</div>
                    </div>
                    <div className="rounded-lg border border-slate-200 p-4">
                      <div className="text-xs text-slate-500">Book Value</div>
                      <div className="text-2xl font-heading font-bold mt-1 text-primary-600">
                        {asset.bookValue !== undefined ? formatMoney(asset.bookValue) : '—'}
                      </div>
                      {asset.bookValue !== undefined && (
                        <div className="text-xs text-slate-400 mt-1">${asset.bookValue.toLocaleString()}</div>
                      )}
                    </div>
                    <div className="rounded-lg border border-slate-200 p-4">
                      <div className="text-xs text-slate-500">Asset Age</div>
                      <div className="text-2xl font-heading font-bold mt-1">{ageYears}y</div>
                      <div className="text-xs text-slate-400 mt-1">Since {formatDate(asset.purchaseDate)}</div>
                    </div>
                  </div>

                  {asset.bookValue !== undefined && (
                    <div className="rounded-lg border border-slate-200 p-4">
                      <div className="flex items-center justify-between text-sm mb-2">
                        <span className="font-medium">Value Retained</span>
                        <span className="font-semibold">{retained}%</span>
                      </div>
                      <div className="h-2.5 w-full rounded-full bg-slate-200 overflow-hidden">
                        <div className="h-full rounded-full bg-health-good" style={{ width: `${retained}%` }} />
                      </div>
                      <div className="flex justify-between mt-2 text-xs text-slate-500">
                        <span>Depreciated {formatMoney(asset.purchasePrice - asset.bookValue)}</span>
                        <span>{asset.depreciationMethod ?? '—'}</span>
                      </div>
                    </div>
                  )}

                  <dl className="grid grid-cols-2 gap-x-4 gap-y-4">
                    <KV label="Depreciation Method" value={asset.depreciationMethod} />
                    <KV
                      label="Warranty Expiry"
                      value={
                        asset.warrantyExpiry ? (
                          <span className={warrantyExpired ? 'text-health-critical' : 'text-slate-900'}>
                            {formatDate(asset.warrantyExpiry)}
                            {warrantyExpired && ' (Expired)'}
                          </span>
                        ) : (
                          '—'
                        )
                      }
                    />
                    <KV label="Purchase Date" value={formatDate(asset.purchaseDate)} />
                    <KV label="Lifecycle Stage" value={asset.lifecycleStage} />
                  </dl>

                  {/* "Export to GL" and "Run TCO Report" were toasts. There is
                      no ledger integration to export to, and a total-cost-of-
                      ownership figure needs operating and energy cost this
                      platform does not collect. What it does hold — purchase,
                      book value, depreciation and the maintenance spend against
                      this asset — is exportable, and that is what this does. */}
                  <div className="flex gap-2">
                    <Button variant="outline" size="sm" onClick={exportFinancials}>
                      Export financials (CSV)
                    </Button>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      {dialog === 'custody' && <CustodyDialog asset={asset} onClose={closeDialog} />}
      {dialog === 'transfer' && <TransferDialog asset={asset} onClose={closeDialog} />}
      {dialog === 'retire' && <RetireDialog asset={asset} onClose={closeDialog} />}
      {dialog === 'upload' && <UploadDocumentDialog assetId={asset.id} onClose={closeDialog} />}
      {dialog === 'explain' && (
        <ExplainDialog
          assetId={asset.id}
          stored={{
            healthScore: asset.healthScore,
            utilization: asset.utilization,
            riskScore: asset.riskScore,
          }}
          onClose={closeDialog}
        />
      )}
    </div>
  );
}
