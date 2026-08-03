import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { mockInsights, mockModels, getModel } from '@/lib/mock-data';
import { PageHeader, Badge } from '@/components/ui/primitives';
import { cn, relTime, formatMoney } from '@/lib/utils';
import type { AIInsight, InsightType, InsightSeverity } from '@/types/asset';

// ─────────────────────────────────────────────────────────────────────────────
// Which registered model governs each insight type (data → features → model → score)
// ─────────────────────────────────────────────────────────────────────────────
const MODEL_FOR: Record<InsightType, string> = {
  'Predictive Failure': 'MDL-FAIL',
  Utilization: 'MDL-UTIL',
  'Theft/Security': 'MDL-THEFT',
  'Cost Optimization': 'MDL-FORECAST',
  Anomaly: 'MDL-ANOM',
  Lifecycle: 'MDL-HEALTH',
};

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

const LOW_RISK_THRESHOLD = 40;

// ─────────────────────────────────────────────────────────────────────────────
// Deterministic contribution model:
//  • Each driver gets a decreasing raw weight (top driver = strongest signal).
//  • The weakest driver is rendered as counter-evidence the model discounted
//    (negative), giving a genuine two-sided / diverging chart.
//  • Signed contributions are scaled so they sum EXACTLY to the confidence score.
// ─────────────────────────────────────────────────────────────────────────────
type Contribution = { driver: string; value: number; pct: number };

function computeContributions(insight: AIInsight): Contribution[] {
  const ds = insight.drivers;
  const n = ds.length;
  const mags = ds.map((_, i) => n - i); // decreasing: n, n-1, … 1
  const signs = ds.map((_, i) => (n >= 4 && i === n - 1 ? -1 : 1));
  const signedRaw = mags.reduce((s, m, i) => s + signs[i] * m, 0) || 1;
  const scale = insight.confidence / signedRaw;

  const raw = ds.map((d, i) => ({ driver: d, value: signs[i] * mags[i] * scale }));
  // Round to whole points, then absorb rounding drift into the strongest driver
  const rounded = raw.map((r) => ({ ...r, value: Math.round(r.value) }));
  const drift = insight.confidence - rounded.reduce((s, r) => s + r.value, 0);
  rounded[0].value += drift;

  return rounded.map((r) => ({ ...r, pct: r.value }));
}

// ─────────────────────────────────────────────────────────────────────────────
// Diverging contribution chart (hand-rolled SVG, light theme)
// ─────────────────────────────────────────────────────────────────────────────
function ContributionChart({
  contributions,
  positiveColor,
}: {
  contributions: Contribution[];
  positiveColor: string;
}) {
  const maxAbs = Math.max(...contributions.map((c) => Math.abs(c.value)), 1);
  const rowH = 34;
  const gap = 10;
  const H = contributions.length * (rowH + gap);
  const W = 100; // viewBox units
  const axisX = 42; // center axis position (leaves room for left/negative bars)
  const rightW = W - axisX - 2;
  const leftW = axisX - 2;

  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="w-full" style={{ height: H * 3 }} role="img" aria-label="Driver contribution chart">
      {/* center axis */}
      <line x1={axisX} y1={0} x2={axisX} y2={H} stroke="#cbd5e1" strokeWidth={0.4} />
      {contributions.map((c, i) => {
        const y = i * (rowH + gap);
        const barH = 12;
        const barY = y + (rowH - barH) / 2;
        const positive = c.value >= 0;
        const len = (Math.abs(c.value) / maxAbs) * (positive ? rightW : leftW);
        const x = positive ? axisX : axisX - len;
        const fill = positive ? positiveColor : '#10b981';
        return (
          <g key={i}>
            <rect x={x} y={barY} width={Math.max(len, 0.6)} height={barH} rx={2} fill={fill} />
            {/* value label */}
            <text
              x={positive ? Math.min(x + len + 1.5, W - 6) : Math.max(x - 1.5, 2)}
              y={barY + barH / 2 + 2.6}
              fontSize={5.5}
              fontWeight={700}
              fill={positive ? '#334155' : '#047857'}
              textAnchor={positive ? 'start' : 'end'}
            >
              {positive ? '+' : ''}
              {c.value}
            </text>
            {/* driver label above the bar */}
            <text x={2} y={y + 6.5} fontSize={5} fill="#64748b">
              {c.driver.length > 46 ? c.driver.slice(0, 45) + '…' : c.driver}
            </text>
          </g>
        );
      })}
    </svg>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Feature-importance bars for the governing model
// ─────────────────────────────────────────────────────────────────────────────
function FeatureImportanceList({ features }: { features: { feature: string; importance: number }[] }) {
  const max = Math.max(...features.map((f) => f.importance), 0.01);
  return (
    <div className="space-y-2.5">
      {features.map((f) => (
        <div key={f.feature}>
          <div className="flex items-center justify-between text-xs mb-1">
            <span className="font-medium text-slate-700">{f.feature}</span>
            <span className="tabular-nums text-slate-400">{Math.round(f.importance * 100)}%</span>
          </div>
          <div className="h-2 rounded-full bg-slate-100 overflow-hidden">
            <div
              className="h-full rounded-full bg-primary-500"
              style={{ width: `${(f.importance / max) * 100}%` }}
            />
          </div>
        </div>
      ))}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Page
// ─────────────────────────────────────────────────────────────────────────────
export default function ExplainabilityPage() {
  const [selectedId, setSelectedId] = useState<string>(mockInsights[0].id);
  const insight = mockInsights.find((i) => i.id === selectedId) ?? mockInsights[0];

  const contributions = useMemo(() => computeContributions(insight), [insight]);
  const model = getModel(MODEL_FOR[insight.type]) ?? mockModels[0];

  const positiveColor = insight.severity === 'Opportunity' ? '#f59e0b' : '#ef4444';

  // Counterfactual: which top positive drivers, if resolved, drop this below LOW risk
  const counterfactual = useMemo(() => {
    const positives = contributions.filter((c) => c.value > 0).sort((a, b) => b.value - a.value);
    const removed: Contribution[] = [];
    let score = insight.confidence;
    for (const c of positives) {
      if (score < LOW_RISK_THRESHOLD) break;
      removed.push(c);
      score -= c.value;
    }
    return { removed, score: Math.max(score, 0) };
  }, [contributions, insight.confidence]);

  const sevTone = SEV_TONE[insight.severity];
  const scoreLabel = insight.severity === 'Opportunity' ? 'Opportunity score' : 'Risk / confidence score';

  return (
    <div className="h-full flex flex-col space-y-6">
      <PageHeader
        title="Explainability"
        subtitle="Open the model up — see exactly why each asset was scored the way it was."
        breadcrumb={[
          { label: 'AI Intelligence', href: '/ai-insights' },
          { label: 'Explainability' },
        ]}
      />

      {/* Insight picker */}
      <div className="glass-panel rounded-xl p-4 flex flex-col sm:flex-row sm:items-center gap-3">
        <label htmlFor="insight-select" className="text-xs font-semibold uppercase tracking-wider text-slate-500 shrink-0">
          Explain a prediction
        </label>
        <select
          id="insight-select"
          value={selectedId}
          onChange={(e) => setSelectedId(e.target.value)}
          className="flex-1 rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-800 focus:outline-none focus:ring-2 focus:ring-primary-500"
        >
          {mockInsights.map((i) => (
            <option key={i.id} value={i.id}>
              {TYPE_EMOJI[i.type]} {i.title}
            </option>
          ))}
        </select>
        <div className="flex items-center gap-2 shrink-0">
          <Badge tone={sevTone}>{insight.severity}</Badge>
          <Badge tone="slate">{TYPE_EMOJI[insight.type]} {insight.type}</Badge>
        </div>
      </div>

      {/* Headline */}
      <div className="glass-panel rounded-xl p-6">
        <div className="flex flex-col lg:flex-row lg:items-start gap-6">
          <div className="flex-1 min-w-0">
            <h2 className="text-xl font-heading font-bold leading-snug text-slate-900">{insight.title}</h2>
            <p className="mt-1.5 text-sm text-slate-500">{insight.summary}</p>
            <div className="mt-3 flex flex-wrap items-center gap-3 text-xs">
              {insight.assetId && insight.assetName && (
                <Link
                  to={`/assets/${insight.assetId}`}
                  className="inline-flex items-center gap-1.5 font-medium px-2.5 py-1 rounded-full bg-slate-100 border border-slate-200 hover:border-primary-500/50 text-slate-700 transition-colors"
                >
                  {insight.assetName} <span className="text-slate-400">→</span>
                </Link>
              )}
              <span className="text-slate-400">Scored {relTime(insight.createdAt)}</span>
              {insight.impactInr !== undefined && (
                <span className="font-semibold text-slate-700">
                  {formatMoney(insight.impactInr)}
                  {insight.impactLabel ? ` · ${insight.impactLabel}` : ''}
                </span>
              )}
            </div>
          </div>
          {/* Score dial */}
          <div className="rounded-xl border border-slate-200 bg-slate-50 p-4 w-full lg:w-56 shrink-0 text-center">
            <div className="text-xs font-medium text-slate-500">{scoreLabel}</div>
            <div
              className={cn(
                'text-5xl font-heading font-bold mt-1 tabular-nums',
                insight.severity === 'Opportunity' ? 'text-amber-500' : 'text-health-critical',
              )}
            >
              {insight.confidence}
              <span className="text-2xl text-slate-400">%</span>
            </div>
            <div className="mt-2 h-2 rounded-full bg-slate-200 overflow-hidden">
              <div
                className={cn('h-full rounded-full', insight.severity === 'Opportunity' ? 'bg-amber-500' : 'bg-health-critical')}
                style={{ width: `${insight.confidence}%` }}
              />
            </div>
            <div className="mt-1.5 text-[11px] text-slate-400">
              {insight.confidence >= 80 ? 'High' : insight.confidence >= 60 ? 'Moderate' : 'Low'} model confidence
            </div>
          </div>
        </div>
      </div>

      {/* Contribution chart + plain-language explanation */}
      <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
        <div className="xl:col-span-2 glass-panel rounded-xl p-6">
          <h3 className="text-base font-semibold text-slate-800 mb-1">Why the model scored it this way</h3>
          <p className="text-xs text-slate-500 mb-4">
            Each factor&rsquo;s signed contribution to the score. Bars to the right pushed the score up;
            green bars are counter-evidence the model weighed down. The contributions sum to{' '}
            <span className="font-semibold text-slate-700">{insight.confidence}%</span>.
          </p>
          <ContributionChart contributions={contributions} positiveColor={positiveColor} />
          <div className="mt-4 flex items-center gap-4 text-[11px] text-slate-500">
            <span className="inline-flex items-center gap-1.5">
              <span className="h-2.5 w-2.5 rounded-sm" style={{ background: positiveColor }} /> Raises the score
            </span>
            <span className="inline-flex items-center gap-1.5">
              <span className="h-2.5 w-2.5 rounded-sm bg-emerald-500" /> Lowers the score
            </span>
          </div>
        </div>

        <div className="glass-panel rounded-xl p-6">
          <h3 className="text-base font-semibold text-slate-800 mb-3">In plain language</h3>
          <p className="text-sm text-slate-600 leading-relaxed">
            The <span className="font-semibold text-slate-800">{model.name}</span> model scored{' '}
            <span className="font-semibold text-slate-800">{insight.assetName ?? 'this asset'}</span> at{' '}
            <span className="font-semibold text-slate-800">{insight.confidence}%</span>, driven mainly by{' '}
            <span className="font-semibold text-slate-800">
              &ldquo;{contributions[0]?.driver}&rdquo;
            </span>
            {contributions[1] && (
              <>
                {' '}and{' '}
                <span className="font-semibold text-slate-800">&ldquo;{contributions[1].driver}&rdquo;</span>
              </>
            )}
            . Together the top factors account for{' '}
            <span className="font-semibold text-slate-800">
              {Math.round(
                (contributions.filter((c) => c.value > 0).slice(0, 2).reduce((s, c) => s + c.value, 0) /
                  insight.confidence) *
                  100,
              )}
              %
            </span>{' '}
            of the score.
          </p>
          <div className="mt-4 pt-4 border-t border-slate-200">
            <div className="text-xs font-semibold text-slate-500 mb-1">Recommended action</div>
            <p className="text-sm text-slate-600">{insight.recommendedAction}</p>
          </div>
        </div>
      </div>

      {/* Counterfactual + Governing model */}
      <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
        {/* Counterfactual */}
        <div className="glass-panel rounded-xl p-6">
          <h3 className="text-base font-semibold text-slate-800 mb-1">Counterfactual — what would change the verdict</h3>
          <p className="text-xs text-slate-500 mb-4">
            The smallest set of factors that, if resolved, flips this to <span className="font-semibold">low risk</span>.
          </p>
          {counterfactual.removed.length === 0 ? (
            <div className="rounded-lg border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-800">
              Already below the low-risk threshold — no intervention needed to clear this signal.
            </div>
          ) : (
            <>
              <div className="rounded-lg border border-emerald-200 bg-emerald-50 p-4">
                <div className="text-sm font-semibold text-emerald-900 mb-2">
                  This would drop to low risk (~{counterfactual.score}%) if:
                </div>
                <ul className="space-y-1.5">
                  {counterfactual.removed.map((c) => (
                    <li key={c.driver} className="flex items-start gap-2 text-sm text-emerald-800">
                      <span className="mt-0.5 shrink-0">✓</span>
                      <span>
                        {c.driver} <span className="text-emerald-600/80">(&minus;{c.value} pts)</span>
                      </span>
                    </li>
                  ))}
                </ul>
              </div>
              <div className="mt-3 flex items-center gap-3 text-xs text-slate-500">
                <span className="inline-flex items-center gap-1">
                  <span className="font-heading font-bold text-health-critical text-sm">{insight.confidence}%</span> now
                </span>
                <span className="text-slate-300">→</span>
                <span className="inline-flex items-center gap-1">
                  <span className="font-heading font-bold text-health-good text-sm">{counterfactual.score}%</span> after
                </span>
              </div>
            </>
          )}
        </div>

        {/* Governing model feature importances */}
        <div className="glass-panel rounded-xl p-6">
          <div className="flex items-start justify-between gap-3 mb-1">
            <h3 className="text-base font-semibold text-slate-800">Governing model</h3>
            <Badge tone={model.status === 'Production' ? 'emerald' : 'amber'}>{model.status}</Badge>
          </div>
          <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-slate-500 mb-4">
            <span className="font-semibold text-slate-700">{model.name}</span>
            <span>{model.version}</span>
            <span>{model.framework}</span>
            <span>{model.accuracy}% acc</span>
            <span>drift {model.driftPct}%</span>
          </div>
          <div className="text-xs font-semibold uppercase tracking-wider text-slate-500 mb-2">
            Global feature importance
          </div>
          <FeatureImportanceList features={model.features} />
          <p className="mt-4 text-[11px] text-slate-400">
            Global importances reflect the model overall; the contribution chart above is local to this one prediction.
          </p>
        </div>
      </div>

      {/* Provenance */}
      <div className="glass-panel rounded-xl p-6">
        <h3 className="text-base font-semibold text-slate-800 mb-4">Provenance — how this score was produced</h3>
        <div className="grid grid-cols-1 sm:grid-cols-4 gap-3">
          {[
            { label: 'Data', desc: 'Telemetry, RTLS pings, maintenance & custody logs streamed from the asset.' },
            { label: 'Features', desc: `Engineered signals — ${model.features.slice(0, 2).map((f) => f.feature.toLowerCase()).join(', ')} and more.` },
            { label: 'Model', desc: `${model.name} ${model.version} (${model.framework}), retrained ${relTime(model.lastTrained)}.` },
            { label: 'Score', desc: `${insight.confidence}% ${insight.severity.toLowerCase()} signal with the drivers shown above.` },
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
          Every score is fully traceable end-to-end — from the raw sensor reading to the engineered feature, the model
          version that ran, and the factors it weighed. That audit trail is what makes Access Genie AI explainable by design.
        </p>
      </div>
    </div>
  );
}
