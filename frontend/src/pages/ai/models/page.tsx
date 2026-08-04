import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { allModels } from '@/lib/dataset';
import type { AiModel, ModelStatus } from '@access-genie/shared';
import { PageHeader, Badge, KpiCard, EmptyState } from '@/components/ui/primitives';
import { Button } from '@/components/ui/Button';
import { FormDialog, Field, FieldRow, Select, TextInput } from '@/components/ui/FormDialog';
import { useMutate } from '@/api/mutate';
import { aiModelsApi } from '@/api/configuration';
import { useSession } from '@/components/providers/SessionProvider';
import { cn, relTime } from '@/lib/utils';

/**
 * Register a model.
 *
 * The registry records models that run elsewhere — this platform does not host
 * training, and the button that used to say so out loud ("not part of this
 * demo") was describing a limitation rather than doing the job the page can
 * genuinely do: keep an accurate inventory of what is in production, whose it
 * is, and when it was last retrained.
 */
function RegisterModelDialog({ onClose }: { onClose: () => void }) {
  const { run, isPending } = useMutate();
  const { session } = useSession();

  const [name, setName] = useState('');
  const [task, setTask] = useState('');
  const [status, setStatus] = useState<ModelStatus>('Staging');
  const [version, setVersion] = useState('v1.0');
  const [accuracy, setAccuracy] = useState('0');
  const [framework, setFramework] = useState('scikit-learn');
  const [owner, setOwner] = useState(session.user.name);
  const [lastTrained, setLastTrained] = useState(new Date().toISOString().slice(0, 10));

  const submit = async () => {
    const ok = await run(
      aiModelsApi.create({
        name: name.trim(),
        task: task.trim(),
        status,
        version: version.trim(),
        accuracy: Number(accuracy) || 0,
        framework: framework.trim(),
        owner: owner.trim(),
        lastTrained: new Date(lastTrained).toISOString(),
      }),
      {
        success: `${name.trim()} registered`,
        successDetail: `${status} · ${version.trim()}`,
        describe: 'register that model',
      },
    );
    if (ok) onClose();
  };

  return (
    <FormDialog
      icon="🧠"
      title="Register a model"
      description="Records a model that runs elsewhere. Training and serving happen outside this platform."
      submitLabel="Register"
      busy={isPending}
      disabled={name.trim().length < 2 || task.trim().length < 2 || owner.trim().length < 2}
      onSubmit={() => void submit()}
      onCancel={onClose}
    >
      <FieldRow>
        <Field label="Model name" required>
          <TextInput autoFocus value={name} onChange={(e) => setName(e.target.value)} placeholder="Failure risk classifier" />
        </Field>
        <Field label="Task" required hint="What it predicts, in words.">
          <TextInput value={task} onChange={(e) => setTask(e.target.value)} placeholder="Predict 30-day failure risk" />
        </Field>
      </FieldRow>

      <FieldRow>
        <Field label="Status">
          <Select
            value={status}
            onChange={(e) => setStatus(e.target.value as ModelStatus)}
            options={['Production', 'Staging', 'Training', 'Retired'].map((v) => ({ value: v, label: v }))}
          />
        </Field>
        <Field label="Version">
          <TextInput value={version} onChange={(e) => setVersion(e.target.value)} placeholder="v1.0" />
        </Field>
      </FieldRow>

      <FieldRow>
        <Field label="Accuracy %" hint="Whatever your evaluation reported. Left at zero if not measured.">
          <TextInput type="number" min={0} max={100} value={accuracy} onChange={(e) => setAccuracy(e.target.value)} />
        </Field>
        <Field label="Last trained" required>
          <TextInput type="date" value={lastTrained} onChange={(e) => setLastTrained(e.target.value)} />
        </Field>
      </FieldRow>

      <FieldRow>
        <Field label="Framework">
          <TextInput value={framework} onChange={(e) => setFramework(e.target.value)} placeholder="scikit-learn" />
        </Field>
        <Field label="Owner" required hint="Who to ask when it drifts.">
          <TextInput value={owner} onChange={(e) => setOwner(e.target.value)} />
        </Field>
      </FieldRow>
    </FormDialog>
  );
}

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

// ── accuracy meter (higher = better, emerald) ─────────────────────────────────
function AccuracyBar({ value }: { value: number }) {
  return (
    <div className="flex items-center gap-2 min-w-[8rem]">
      <div className="h-1.5 flex-1 rounded-full bg-slate-200 overflow-hidden">
        <div
          className="h-full rounded-full bg-emerald-500"
          style={{ width: `${Math.max(0, Math.min(100, value))}%` }}
        />
      </div>
      <span className="text-xs font-semibold text-slate-600 tabular-nums w-9 text-right">{value}%</span>
    </div>
  );
}

// ── drift meter (lower = better; red + retrain hint when > 10) ─────────────────
function DriftBar({ value }: { value: number }) {
  const high = value > 10;
  const color = high ? '#ef4444' : value > 7 ? '#f59e0b' : '#10b981';
  return (
    <div className="min-w-[8rem]">
      <div className="flex items-center gap-2">
        <div className="h-1.5 flex-1 rounded-full bg-slate-200 overflow-hidden">
          <div
            className="h-full rounded-full"
            style={{ width: `${Math.max(0, Math.min(100, value * 3))}%`, backgroundColor: color }}
          />
        </div>
        <span className="text-xs font-semibold tabular-nums w-9 text-right" style={{ color }}>{value}%</span>
      </div>
      {high && (
        <span className="mt-1 inline-flex items-center gap-1 text-[10px] font-semibold text-health-critical">
          ⚠️ retrain
        </span>
      )}
    </div>
  );
}

const STATUS_FILTERS: (ModelStatus | 'All')[] = ['All', 'Production', 'Staging', 'Shadow', 'Retired'];

export default function ModelRegistryPage() {
  const [registering, setRegistering] = useState(false);
  const [status, setStatus] = useState<ModelStatus | 'All'>('All');

  // ── KPIs ─────────────────────────────────────────────────────────────────────
  const total = allModels.length;
  const inProduction = allModels.filter((m) => m.status === 'Production').length;
  const avgAccuracy = Math.round(
    allModels.reduce((sum, m) => sum + m.accuracy, 0) / (total || 1),
  );
  const needRetrain = allModels.filter((m) => m.driftPct > 10).length;

  // ── filtered rows ──────────────────────────────────────────────────────────────
  const rows = useMemo<AiModel[]>(
    () => allModels.filter((m) => status === 'All' || m.status === status),
    [status],
  );

  return (
    <div className="h-full flex flex-col space-y-6">
      <PageHeader
        title="Model Registry"
        subtitle="Governance for every model powering Access Genie AI — accuracy, drift, lineage and lifecycle."
        breadcrumb={[
          { label: 'AI Intelligence', href: '/ai-insights' },
          { label: 'Model Registry' },
        ]}
        actions={
          <>
            <Link to="/ai/explainability">
              <Button variant="outline" size="md">Explainability</Button>
            </Link>
            <Button variant="primary" size="md" onClick={() => setRegistering(true)}>
              Register model
            </Button>
          </>
        }
      />

      {/* ── KPI row ──────────────────────────────────────────────────────────────── */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <KpiCard label="Total Models" value={total} sub="In registry" accent />
        <KpiCard label="In Production" value={inProduction} sub="Serving live traffic" tone="emerald" />
        <KpiCard label="Avg Accuracy" value={`${avgAccuracy}%`} sub="Across all models" tone="primary" />
        <KpiCard
          label="Need Retrain"
          value={needRetrain}
          sub={needRetrain > 0 ? 'Drift over 10%' : 'All within tolerance'}
          tone={needRetrain > 0 ? 'red' : 'emerald'}
        />
      </div>

      {/* ── Status filter chips ──────────────────────────────────────────────────── */}
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-xs font-semibold uppercase tracking-wide text-slate-400 mr-1">Status</span>
        {STATUS_FILTERS.map((s) => {
          const on = status === s;
          return (
            <button
              key={s}
              onClick={() => setStatus(s)}
              className={cn(
                'px-3 py-1.5 rounded-full text-xs font-medium border transition-colors',
                on
                  ? 'bg-primary-600 text-white border-primary-600'
                  : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-50',
              )}
            >
              {s}
            </button>
          );
        })}
      </div>

      {/* ── Model table ──────────────────────────────────────────────────────────── */}
      <div className="glass-panel rounded-xl overflow-hidden flex-1 min-h-0 flex flex-col">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[860px] text-sm">
            <thead>
              <tr className="border-b border-slate-200 bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-500">
                <th className="px-4 py-3 font-semibold">Model</th>
                <th className="px-4 py-3 font-semibold">Task</th>
                <th className="px-4 py-3 font-semibold">Status</th>
                <th className="px-4 py-3 font-semibold">Accuracy</th>
                <th className="px-4 py-3 font-semibold">Drift</th>
                <th className="px-4 py-3 font-semibold">Owner</th>
                <th className="px-4 py-3 font-semibold">Last Trained</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((m) => (
                <tr key={m.id} className="border-b border-slate-100 transition-colors hover:bg-slate-50">
                  <td className="px-4 py-3">
                    <Link to={`/ai/models/${m.id}`} className="font-medium text-slate-800 hover:text-primary-600">
                      {m.name}
                    </Link>
                    <div className="text-xs text-slate-400 font-mono">{m.id} · {m.version} · {m.framework}</div>
                  </td>
                  <td className="px-4 py-3 text-slate-600">{m.task}</td>
                  <td className="px-4 py-3">
                    <Badge tone={statusTone(m.status)}>
                      <span className="h-1.5 w-1.5 rounded-full" style={{ backgroundColor: statusHex(m.status) }} />
                      {m.status}
                    </Badge>
                  </td>
                  <td className="px-4 py-3"><AccuracyBar value={m.accuracy} /></td>
                  <td className="px-4 py-3"><DriftBar value={m.driftPct} /></td>
                  <td className="px-4 py-3 text-slate-600">{m.owner}</td>
                  <td className="px-4 py-3 text-slate-500 whitespace-nowrap">{relTime(m.lastTrained)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {rows.length === 0 && (
          <EmptyState
            variant="no-results"
            title="No models match"
            description="No models are in this lifecycle stage right now."
            action={
              <Button variant="outline" size="sm" onClick={() => setStatus('All')}>
                Reset filter
              </Button>
            }
          />
        )}
      </div>

      {registering && <RegisterModelDialog onClose={() => setRegistering(false)} />}
    </div>
  );
}
