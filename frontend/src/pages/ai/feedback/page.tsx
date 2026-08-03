import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { allInsights } from '@/lib/dataset';
import { PageHeader, KpiCard, Badge } from '@/components/ui/primitives';
import { Button } from '@/components/ui/Button';
import { useToast } from '@/components/providers/ToastProvider';
import { cn, relTime } from '@/lib/utils';
import type { InsightType, InsightSeverity } from '@access-genie/shared';

const TYPE_EMOJI: Record<InsightType, string> = {
  'Predictive Failure': '🔧',
  Utilization: '📊',
  'Theft/Security': '🔒',
  'Cost Optimization': '💰',
  Anomaly: '🌀',
  Lifecycle: '♻️',
};

const SEV_TONE: Record<InsightSeverity, 'red' | 'amber' | 'emerald' | 'primary'> = {
  Critical: 'red',
  Warning: 'amber',
  Opportunity: 'emerald',
  Info: 'primary',
};

// "Correct label" options a reviewer can assign when disagreeing
const LABEL_OPTIONS = [
  'Confirmed correct',
  'False positive',
  'Severity too high',
  'Severity too low',
  'Wrong asset',
  'Needs more data',
] as const;

type Vote = 'up' | 'down' | null;
interface RowState {
  vote: Vote;
  reason: string;
  label: string;
  submitted: boolean;
}

const emptyRow = (): RowState => ({ vote: null, reason: '', label: LABEL_OPTIONS[0], submitted: false });

export default function FeedbackPage() {
  const { toast } = useToast();
  const [rows, setRows] = useState<Record<string, RowState>>(() =>
    Object.fromEntries(allInsights.map((i) => [i.id, emptyRow()])),
  );

  const update = (id: string, patch: Partial<RowState>) =>
    setRows((prev) => ({ ...prev, [id]: { ...prev[id], ...patch } }));

  const submit = (id: string) => {
    const row = rows[id];
    const insight = allInsights.find((i) => i.id === id);
    if (!row.vote) {
      toast({ title: 'Pick a verdict first', description: 'Agree or disagree before submitting.', tone: 'error' });
      return;
    }
    update(id, { submitted: true });
    toast({
      title: row.vote === 'up' ? 'Feedback recorded — agreed 👍' : 'Feedback recorded — flagged 👎',
      description: `${insight?.assetName ?? 'Prediction'} · label: ${row.label}. Queued for the next retraining run.`,
      tone: 'success',
    });
  };

  // ── KPIs (partly live off review state) ─────────────────────────────────────
  const submittedRows = Object.values(rows).filter((r) => r.submitted);
  const reviewedThisSession = submittedRows.length;
  const agreedThisSession = submittedRows.filter((r) => r.vote === 'up').length;
  const pending = allInsights.length - reviewedThisSession;

  const kpis = useMemo(() => {
    // baseline demo history + this session's reviews
    const baseReviewed = 1284;
    const baseAgreed = 1102;
    const totalReviewed = baseReviewed + reviewedThisSession;
    const totalAgreed = baseAgreed + agreedThisSession;
    const agreeRate = Math.round((totalAgreed / totalReviewed) * 100);
    return { totalReviewed, agreeRate };
  }, [reviewedThisSession, agreedThisSession]);

  return (
    <div className="h-full flex flex-col space-y-6">
      <PageHeader
        title="Feedback"
        subtitle="Human-in-the-loop review — your verdicts teach the models and steer the next retrain."
        breadcrumb={[
          { label: 'AI Intelligence', href: '/ai-insights' },
          { label: 'Feedback' },
        ]}
      />

      {/* KPI row */}
      <div className="grid grid-cols-2 xl:grid-cols-4 gap-4">
        <KpiCard label="Predictions reviewed" value={kpis.totalReviewed.toLocaleString()} sub="All-time, human-verified" tone="primary" />
        <KpiCard label="Agree rate" value={`${kpis.agreeRate}%`} sub="Reviewer agrees with model" tone="emerald" />
        <KpiCard label="Pending review" value={pending} sub={`${allInsights.length} in this queue`} tone="amber" />
        <KpiCard label="Improvements shipped" value={14} sub="Retrains from feedback" tone="slate" />
      </div>

      {/* Review queue */}
      <div className="glass-panel rounded-xl overflow-hidden">
        <div className="px-5 py-4 border-b border-slate-200 flex items-center justify-between">
          <div>
            <h3 className="text-base font-heading font-bold text-slate-900">Review queue</h3>
            <p className="text-xs text-slate-500 mt-0.5">Recent AI predictions awaiting a human verdict.</p>
          </div>
          <Badge tone="primary">{pending} pending</Badge>
        </div>

        <ul className="divide-y divide-slate-200">
          {allInsights.map((ins) => {
            const row = rows[ins.id];
            return (
              <li key={ins.id} className={cn('p-5 transition-colors', row.submitted && 'bg-emerald-50/40')}>
                <div className="flex flex-col lg:flex-row lg:items-start gap-4">
                  {/* Left: prediction summary */}
                  <div className="flex-1 min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <Badge tone="slate">{TYPE_EMOJI[ins.type]} {ins.type}</Badge>
                      <Badge tone={SEV_TONE[ins.severity]}>{ins.severity}</Badge>
                      <span className="text-xs text-slate-400">{ins.confidence}% conf · {relTime(ins.createdAt)}</span>
                      {row.submitted && (
                        <span className="text-xs font-medium text-health-good">✓ Reviewed</span>
                      )}
                    </div>
                    <h4 className="mt-2 text-sm font-semibold text-slate-900 leading-snug">{ins.title}</h4>
                    <p className="mt-1 text-xs text-slate-500">{ins.summary}</p>
                    <div className="mt-2 flex flex-wrap items-center gap-3 text-xs">
                      {ins.assetId && ins.assetName && (
                        <Link to={`/assets/${ins.assetId}`} className="font-medium text-primary-600 hover:text-primary-700">
                          {ins.assetName} →
                        </Link>
                      )}
                      <Link
                        to="/ai/explainability"
                        className="text-slate-400 hover:text-slate-600 inline-flex items-center gap-1"
                      >
                        🧮 Why this score?
                      </Link>
                    </div>
                  </div>

                  {/* Right: feedback controls */}
                  <div className="lg:w-80 shrink-0 space-y-3">
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() => update(ins.id, { vote: row.vote === 'up' ? null : 'up' })}
                        aria-pressed={row.vote === 'up'}
                        className={cn(
                          'flex-1 inline-flex items-center justify-center gap-1.5 rounded-lg border px-3 py-2 text-sm font-medium transition-colors',
                          row.vote === 'up'
                            ? 'bg-health-good/15 border-health-good/40 text-emerald-700'
                            : 'border-slate-200 text-slate-600 hover:bg-slate-50',
                        )}
                      >
                        👍 Agree
                      </button>
                      <button
                        type="button"
                        onClick={() => update(ins.id, { vote: row.vote === 'down' ? null : 'down' })}
                        aria-pressed={row.vote === 'down'}
                        className={cn(
                          'flex-1 inline-flex items-center justify-center gap-1.5 rounded-lg border px-3 py-2 text-sm font-medium transition-colors',
                          row.vote === 'down'
                            ? 'bg-health-critical/15 border-health-critical/40 text-red-700'
                            : 'border-slate-200 text-slate-600 hover:bg-slate-50',
                        )}
                      >
                        👎 Disagree
                      </button>
                    </div>

                    <div>
                      <label className="block text-[11px] font-semibold uppercase tracking-wider text-slate-500 mb-1">
                        Correct label
                      </label>
                      <select
                        value={row.label}
                        onChange={(e) => update(ins.id, { label: e.target.value })}
                        className="w-full rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-sm text-slate-800 focus:outline-none focus:ring-2 focus:ring-primary-500"
                      >
                        {LABEL_OPTIONS.map((l) => (
                          <option key={l} value={l}>{l}</option>
                        ))}
                      </select>
                    </div>

                    <input
                      type="text"
                      value={row.reason}
                      onChange={(e) => update(ins.id, { reason: e.target.value })}
                      placeholder="Add a reason (optional)…"
                      className="w-full rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-sm text-slate-800 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-primary-500"
                    />

                    <Button
                      variant={row.submitted ? 'outline' : 'primary'}
                      size="sm"
                      className="w-full"
                      onClick={() => submit(ins.id)}
                    >
                      {row.submitted ? '✓ Submitted — update' : 'Submit feedback'}
                    </Button>
                  </div>
                </div>
              </li>
            );
          })}
        </ul>
      </div>

      {/* Feedback → retraining explanation */}
      <div className="glass-panel rounded-xl p-6">
        <h3 className="text-base font-semibold text-slate-800 mb-4">How feedback becomes a better model</h3>
        <div className="grid grid-cols-1 sm:grid-cols-4 gap-3">
          {[
            { label: 'You review', desc: 'Agree, disagree, and assign the correct label — capturing ground truth the sensors cannot.' },
            { label: 'Label store', desc: 'Verdicts land in a versioned label set, tied back to the exact prediction and features.' },
            { label: 'Retrain', desc: 'The next scheduled run learns from confirmed and corrected cases, then validates in shadow.' },
            { label: 'Ship', desc: 'If the candidate beats production on held-out data, it is promoted — and the loop repeats.' },
          ].map((step, i, arr) => (
            <div key={step.label} className="relative rounded-lg border border-slate-200 bg-slate-50 p-4">
              <div className="text-xs font-semibold uppercase tracking-wider text-slate-400 mb-1">Step {i + 1}</div>
              <div className="text-sm font-semibold text-slate-800">{step.label}</div>
              <p className="mt-1 text-xs text-slate-500 leading-relaxed">{step.desc}</p>
              {i < arr.length - 1 && (
                <span className="hidden sm:block absolute top-1/2 -right-2.5 text-slate-300 text-lg leading-none -translate-y-1/2">
                  ›
                </span>
              )}
            </div>
          ))}
        </div>
        <p className="mt-4 text-[11px] text-slate-400">
          Every verdict is auditable and reversible. Human feedback is weighted alongside telemetry so the models
          stay aligned with how your teams actually operate — closing the loop between AI and the people it serves.
        </p>
      </div>
    </div>
  );
}
