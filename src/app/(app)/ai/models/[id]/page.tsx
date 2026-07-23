'use client';

import { use } from 'react';
import Link from 'next/link';
import { getModel } from '@/lib/mock-data';
import type { Model, ModelStatus, FeatureImportance } from '@/types/asset';
import { PageHeader, Badge, EmptyState } from '@/components/ui/primitives';
import { Button } from '@/components/ui/Button';
import { useToast } from '@/components/providers/ToastProvider';
import { relTime } from '@/lib/utils';

// ── token helpers ─────────────────────────────────────────────────────────────
type Tone = 'slate' | 'primary' | 'emerald' | 'amber' | 'red';

const statusTone = (s: ModelStatus): Tone =>
  s === 'Production' ? 'emerald'
    : s === 'Staging' ? 'amber'
      : s === 'Shadow' ? 'primary'
        : 'slate';

const statusHex = (s: ModelStatus): string =>
  s === 'Production' ? '#10b981'
    : s === 'Staging' ? '#f59e0b'
      : s === 'Shadow' ? '#6366f1'
        : '#64748b';

const compactNum = (n: number): string =>
  n >= 1_000_000 ? `${(n / 1_000_000).toFixed(1)}M`
    : n >= 1_000 ? `${Math.round(n / 1_000)}k`
      : `${n}`;

// ── metric tile ────────────────────────────────────────────────────────────────
function MetricTile({ label, value, tone = 'slate' }: { label: string; value: React.ReactNode; tone?: Tone }) {
  const valueColor: Record<Tone, string> = {
    slate: 'text-slate-900', primary: 'text-primary-700', emerald: 'text-emerald-600', amber: 'text-amber-600', red: 'text-health-critical',
  };
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-4">
      <div className="text-xs font-medium text-slate-500 mb-1">{label}</div>
      <div className={`text-xl font-bold font-heading tabular-nums ${valueColor[tone]}`}>{value}</div>
    </div>
  );
}

// ── feature-importance horizontal bar chart (hand-rolled SVG) ──────────────────
function FeatureImportanceChart({ features }: { features: FeatureImportance[] }) {
  const sorted = [...features].sort((a, b) => b.importance - a.importance);
  const max = Math.max(...sorted.map((f) => f.importance), 0.0001);
  const rowH = 34;
  const gap = 10;
  const labelW = 190;
  const barW = 260;
  const valW = 46;
  const W = labelW + barW + valW;
  const H = sorted.length * (rowH + gap) - gap;

  return (
    <div className="overflow-x-auto">
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full" style={{ minWidth: 480, height: H }} role="img" aria-label="Feature importance">
        {sorted.map((f, i) => {
          const y = i * (rowH + gap);
          const w = (f.importance / max) * barW;
          return (
            <g key={f.feature}>
              <text x={labelW - 10} y={y + rowH / 2} textAnchor="end" dominantBaseline="middle" className="fill-slate-600" style={{ fontSize: 12, fontWeight: 500 }}>
                {f.feature}
              </text>
              <rect x={labelW} y={y + 6} width={barW} height={rowH - 12} rx={5} className="fill-slate-100" />
              <rect x={labelW} y={y + 6} width={Math.max(w, 2)} height={rowH - 12} rx={5} fill="#6366f1" />
              <text x={labelW + Math.max(w, 2) + 8} y={y + rowH / 2} dominantBaseline="middle" className="fill-slate-700" style={{ fontSize: 12, fontWeight: 700 }}>
                {(f.importance * 100).toFixed(0)}%
              </text>
            </g>
          );
        })}
      </svg>
    </div>
  );
}

// ── deterministic drift trend from driftPct (~8 periods) ───────────────────────
function driftTrend(driftPct: number): number[] {
  const pts = Array.from({ length: 8 }, (_, i) => {
    const t = i / 7;
    const base = driftPct * (0.6 + 0.4 * t);
    const wobble = Math.sin((i + driftPct) * 1.3) * (driftPct * 0.08);
    return Math.max(0, +(base + wobble).toFixed(2));
  });
  pts[pts.length - 1] = driftPct; // anchor to current value
  return pts;
}

function DriftChart({ driftPct }: { driftPct: number }) {
  const values = driftTrend(driftPct);
  const W = 100;
  const H = 40;
  const pad = 6;
  const threshold = 10;
  const max = Math.max(...values, threshold) * 1.15 || 1;
  const coords = values.map((v, i) => {
    const x = (i / (values.length - 1)) * W;
    const y = H - pad - (v / max) * (H - pad * 2);
    return [x, y] as const;
  });
  const line = coords.map(([x, y], i) => `${i === 0 ? 'M' : 'L'}${x.toFixed(2)},${y.toFixed(2)}`).join(' ');
  const area = `${line} L${W},${H} L0,${H} Z`;
  const thresholdY = H - pad - (threshold / max) * (H - pad * 2);
  const high = driftPct > 10;
  const color = high ? '#ef4444' : '#6366f1';

  return (
    <div>
      <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" className="w-full" style={{ height: 120 }} role="img" aria-label="Drift trend over 8 periods">
        <defs>
          <linearGradient id="driftGrad" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={color} stopOpacity="0.25" />
            <stop offset="100%" stopColor={color} stopOpacity="0" />
          </linearGradient>
        </defs>
        {/* retrain threshold line at 10% */}
        <line x1="0" y1={thresholdY} x2={W} y2={thresholdY} stroke="#ef4444" strokeWidth={0.75} strokeDasharray="2 2" vectorEffect="non-scaling-stroke" />
        <path d={area} fill="url(#driftGrad)" />
        <path d={line} fill="none" stroke={color} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" vectorEffect="non-scaling-stroke" />
      </svg>
      <div className="flex justify-between text-[10px] text-slate-400 mt-1">
        <span>8 periods ago</span>
        <span className="text-health-critical">— retrain @ 10%</span>
        <span>now</span>
      </div>
    </div>
  );
}

export default function ModelDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const { toast } = useToast();
  const model: Model | undefined = getModel(id);

  if (!model) {
    return (
      <div className="h-full flex flex-col space-y-6">
        <EmptyState
          title="Model not found"
          description={`No model matches "${id}".`}
          action={
            <Link href="/ai/models">
              <Button variant="primary" size="sm">Back to registry</Button>
            </Link>
          }
        />
      </div>
    );
  }

  const highDrift = model.driftPct > 10;

  const act = (name: string, version: string, tone: 'success' | 'info' = 'success') =>
    toast({
      title: `${name} — ${version}`,
      description: `${model.name} (${model.id}): ${name.toLowerCase()} request submitted.`,
      tone,
    });

  return (
    <div className="h-full flex flex-col space-y-6">
      <PageHeader
        title={model.name}
        subtitle={`${model.task} · ${model.framework}`}
        breadcrumb={[
          { label: 'AI Intelligence', href: '/ai-insights' },
          { label: 'Model Registry', href: '/ai/models' },
          { label: model.name },
        ]}
        actions={
          <>
            <Badge tone={statusTone(model.status)} className="text-sm px-3 py-1">
              <span className="h-1.5 w-1.5 rounded-full" style={{ backgroundColor: statusHex(model.status) }} />
              {model.status}
            </Badge>
            <Badge tone="slate" className="text-sm px-3 py-1 font-mono">{model.version}</Badge>
          </>
        }
      />

      {highDrift && (
        <div className="flex flex-wrap items-center gap-3 rounded-xl border border-red-200 bg-red-50 px-4 py-3">
          <span className="text-sm font-medium text-red-900">
            ⚠️ Population drift at {model.driftPct}% exceeds the 10% retrain threshold.
          </span>
          <Button variant="danger" size="sm" className="ml-auto" onClick={() => act('Retrain scheduled', model.version)}>
            Schedule retrain
          </Button>
        </div>
      )}

      {/* ── Metric tiles ─────────────────────────────────────────────────────────── */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <MetricTile label="Accuracy" value={`${model.accuracy}%`} tone="emerald" />
        <MetricTile label="Drift (PSI)" value={`${model.driftPct}%`} tone={highDrift ? 'red' : 'primary'} />
        <MetricTile label="Predictions / Day" value={compactNum(model.predictionsPerDay)} />
        <MetricTile label="Owner" value={<span className="text-base">{model.owner}</span>} />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* ── Feature importance ─────────────────────────────────────────────────── */}
        <div className="glass-panel rounded-xl p-5">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h3 className="font-bold text-lg font-heading text-slate-800">Feature Importance</h3>
              <p className="text-xs text-slate-500 mt-0.5">Relative contribution to model predictions</p>
            </div>
            <Link href="/ai/explainability" className="text-xs font-medium text-primary-600 hover:underline shrink-0">
              Explainability →
            </Link>
          </div>
          <FeatureImportanceChart features={model.features} />
        </div>

        {/* ── Drift trend ────────────────────────────────────────────────────────── */}
        <div className="glass-panel rounded-xl p-5">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h3 className="font-bold text-lg font-heading text-slate-800">Drift Trend</h3>
              <p className="text-xs text-slate-500 mt-0.5">Population stability index over recent monitoring periods</p>
            </div>
            <span className="text-2xl font-bold font-heading tabular-nums shrink-0" style={{ color: highDrift ? '#ef4444' : '#6366f1' }}>
              {model.driftPct}%
            </span>
          </div>
          <DriftChart driftPct={model.driftPct} />
          <p className="mt-3 text-xs text-slate-500">
            {highDrift
              ? 'Drift is above tolerance — schedule a retrain to restore accuracy.'
              : 'Drift is within tolerance. Continuing to monitor incoming feature distributions.'}
          </p>
        </div>
      </div>

      {/* ── Version history ──────────────────────────────────────────────────────── */}
      <div className="glass-panel rounded-xl overflow-hidden">
        <div className="flex flex-wrap items-center justify-between gap-3 px-5 py-4 border-b border-slate-100">
          <div>
            <h3 className="font-bold text-lg font-heading text-slate-800">Version History</h3>
            <p className="text-xs text-slate-500 mt-0.5">Lineage, promotions and rollbacks for {model.id}</p>
          </div>
          <Link href="/ai/feedback" className="text-xs font-medium text-primary-600 hover:underline">
            Model feedback →
          </Link>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[860px] text-sm">
            <thead>
              <tr className="border-b border-slate-200 bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-500">
                <th className="px-5 py-3 font-semibold">Version</th>
                <th className="px-5 py-3 font-semibold">Trained</th>
                <th className="px-5 py-3 font-semibold">Accuracy</th>
                <th className="px-5 py-3 font-semibold">Status</th>
                <th className="px-5 py-3 font-semibold">Notes</th>
                <th className="px-5 py-3 font-semibold text-right">Actions</th>
              </tr>
            </thead>
            <tbody>
              {model.versions.map((v) => (
                <tr key={v.version} className="border-b border-slate-100 hover:bg-slate-50 transition-colors">
                  <td className="px-5 py-3 font-mono text-xs font-semibold text-slate-700">{v.version}</td>
                  <td className="px-5 py-3 text-slate-500 whitespace-nowrap">{relTime(v.trainedAt)}</td>
                  <td className="px-5 py-3 font-medium text-slate-700 tabular-nums">{v.accuracy}%</td>
                  <td className="px-5 py-3">
                    <Badge tone={statusTone(v.status)}>
                      <span className="h-1.5 w-1.5 rounded-full" style={{ backgroundColor: statusHex(v.status) }} />
                      {v.status}
                    </Badge>
                  </td>
                  <td className="px-5 py-3 text-slate-600 max-w-xs">{v.notes}</td>
                  <td className="px-5 py-3">
                    <div className="flex items-center justify-end gap-2">
                      <Button variant="outline" size="sm" onClick={() => act('Promote', v.version)}>Promote</Button>
                      <Button variant="ghost" size="sm" onClick={() => act('Rollback', v.version, 'info')}>Rollback</Button>
                      <Button variant="ghost" size="sm" onClick={() => act('Retrain', v.version, 'info')}>Retrain</Button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
