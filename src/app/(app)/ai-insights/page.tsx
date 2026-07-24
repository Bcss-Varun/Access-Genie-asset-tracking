"use client";

import { useState } from "react";
import Link from "next/link";
import { mockInsights, mockAssets, getAssetById } from "@/lib/mock-data";
import { PageHeader, KpiCard } from "@/components/ui/primitives";
import type { AIInsight, InsightSeverity, InsightType } from "@/types/asset";

// ─────────────────────────────────────────────────────────────────────────────
// Helpers (module scope → deterministic, no hydration drift)
// ─────────────────────────────────────────────────────────────────────────────
const NOW = Date.parse("2026-07-23T09:00:00.000Z");

function relTime(iso: string): string {
  const diff = NOW - Date.parse(iso);
  const mins = Math.max(0, Math.round(diff / 60_000));
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.round(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.round(hrs / 24);
  return `${days}d ago`;
}

function fmtUsd(n: number): string {
  if (n >= 1_000_000) return `$${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) {
    const k = n / 1_000;
    return `$${Number.isInteger(k) ? k : k.toFixed(1)}k`;
  }
  return `$${n}`;
}

function catEmoji(cat?: string): string {
  return cat === 'Endpoints' ? '📱' : cat === 'Compute' ? '💻' : cat === 'Network' ? '🌐' : cat === 'Sensors' ? '📡' : cat === 'Infrastructure' ? '⚡' : '⚙️';
}

const TYPE_META: Record<InsightType, string> = {
  "Predictive Failure": "🔧",
  Utilization: "📊",
  "Theft/Security": "🔒",
  "Cost Optimization": "💰",
  Anomaly: "🌀",
  Lifecycle: "♻️",
};

type SevMeta = {
  accent: string;
  dot: string;
  pill: string;
  glow: string;
  impactColor: string;
};

const SEV: Record<InsightSeverity, SevMeta> = {
  Critical: {
    accent: "bg-health-critical",
    dot: "bg-health-critical",
    pill: "bg-red-100 text-red-800 border-red-200 dark:bg-red-500/10 dark:text-red-400 dark:border-red-500/20",
    glow: "from-red-500/20",
    impactColor: "text-health-critical",
  },
  Warning: {
    accent: "bg-health-warning",
    dot: "bg-health-warning",
    pill: "bg-amber-100 text-amber-800 border-amber-200 dark:bg-amber-500/10 dark:text-amber-400 dark:border-amber-500/20",
    glow: "from-amber-500/20",
    impactColor: "text-health-warning",
  },
  Opportunity: {
    accent: "bg-health-good",
    dot: "bg-health-good",
    pill: "bg-emerald-100 text-emerald-800 border-emerald-200 dark:bg-emerald-500/10 dark:text-emerald-400 dark:border-emerald-500/20",
    glow: "from-emerald-500/20",
    impactColor: "text-health-good",
  },
  Info: {
    accent: "bg-primary-500",
    dot: "bg-primary-500",
    pill: "bg-primary-100 text-primary-900 border-primary-100 dark:bg-primary-500/10 dark:text-primary-500 dark:border-primary-500/20",
    glow: "from-primary-500/20",
    impactColor: "text-primary-500",
  },
};

const SEV_RANK: Record<InsightSeverity, number> = { Critical: 0, Warning: 1, Opportunity: 2, Info: 3 };

const TYPE_OPTIONS: (InsightType | "all")[] = [
  "all",
  "Predictive Failure",
  "Utilization",
  "Theft/Security",
  "Cost Optimization",
  "Anomaly",
  "Lifecycle",
];
const SEV_OPTIONS: (InsightSeverity | "all")[] = ["all", "Critical", "Warning", "Opportunity", "Info"];

// ─────────────────────────────────────────────────────────────────────────────
// Hand-rolled confidence ring (no chart library)
// ─────────────────────────────────────────────────────────────────────────────
function ConfidenceRing({ value }: { value: number }) {
  const r = 20;
  const c = 2 * Math.PI * r;
  const offset = c * (1 - value / 100);
  const color = "text-primary-500";
  return (
    <div className="relative h-14 w-14 shrink-0">
      <svg viewBox="0 0 48 48" className="h-14 w-14 -rotate-90">
        <circle cx="24" cy="24" r={r} className="stroke-slate-200 dark:stroke-slate-700" strokeWidth="4" fill="none" />
        <circle
          cx="24"
          cy="24"
          r={r}
          className={color}
          stroke="currentColor"
          strokeWidth="4"
          fill="none"
          strokeLinecap="round"
          strokeDasharray={c}
          strokeDashoffset={offset}
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span className="text-sm font-bold font-heading leading-none tabular-nums">{value}</span>
        <span className="text-[9px] text-slate-400 leading-none mt-0.5">conf</span>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Page
// ─────────────────────────────────────────────────────────────────────────────
export default function AIInsightsPage() {
  const [insights, setInsights] = useState<AIInsight[]>(mockInsights);
  const [selectedType, setSelectedType] = useState<InsightType | "all">("all");
  const [selectedSeverity, setSelectedSeverity] = useState<InsightSeverity | "all">("all");
  const [confidenceMin, setConfidenceMin] = useState(0);
  const [sortBy, setSortBy] = useState<"severity" | "impact">("severity");
  const [feedback, setFeedback] = useState<Record<string, "up" | "down" | null>>({});
  const [actioned, setActioned] = useState<Record<string, boolean>>({});

  // ── Derived KPIs (some live off state so dismissing updates the numbers) ────
  const atRiskCount = new Set(
    insights.filter((i) => (i.severity === "Critical" || i.severity === "Warning") && i.assetId).map((i) => i.assetId),
  ).size;
  const predictedFailures = insights.filter((i) => i.type === "Predictive Failure" || i.type === "Lifecycle").length;
  const idleAssets = mockAssets.filter((a) => (a.utilization ?? 100) < 20).length;
  const savings = insights.reduce((s, i) => s + (i.impactUsd ?? 0), 0);

  const kpis: { label: string; value: string | number; sub: string; tone: "slate" | "emerald" | "amber" | "red" | "primary" }[] = [
    { label: "Assets at Risk", value: atRiskCount, sub: "Critical + warning", tone: "red" },
    { label: "Predicted Failures", value: predictedFailures, sub: "Next 30 days", tone: "amber" },
    { label: "Idle Assets", value: idleAssets, sub: "Under 20% used", tone: "slate" },
    { label: "Savings Identified", value: fmtUsd(savings), sub: "If all actioned", tone: "emerald" },
  ];

  // ── Filter + sort ───────────────────────────────────────────────────────────
  const visible = insights
    .filter((i) => selectedType === "all" || i.type === selectedType)
    .filter((i) => selectedSeverity === "all" || i.severity === selectedSeverity)
    .filter((i) => i.confidence >= confidenceMin)
    .sort((a, b) => {
      if (sortBy === "impact") return (b.impactUsd ?? 0) - (a.impactUsd ?? 0);
      const d = SEV_RANK[a.severity] - SEV_RANK[b.severity];
      return d !== 0 ? d : b.confidence - a.confidence;
    });

  const resetFilters = () => {
    setSelectedType("all");
    setSelectedSeverity("all");
    setConfidenceMin(0);
  };

  const chipClass = (active: boolean) =>
    `px-3 py-1.5 rounded-full text-xs font-medium border transition-colors ${
      active
        ? "bg-primary-600 text-white border-primary-600"
        : "bg-slate-100 dark:bg-slate-800/60 text-slate-600 dark:text-slate-300 border-slate-200 dark:border-slate-700 hover:border-primary-500/50"
    }`;

  return (
    <div className="h-full flex flex-col space-y-6">
      <PageHeader
        title="AI Insights"
        subtitle="Ranked, explainable recommendations across your asset graph."
      />

      {/* KPI row */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {kpis.map((k) => (
          <KpiCard key={k.label} label={k.label} value={k.value} sub={k.sub} tone={k.tone} />
        ))}
      </div>

      {/* Controls */}
      <div className="glass-panel rounded-xl p-4 space-y-3">
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-xs font-semibold uppercase tracking-wider text-slate-500 mr-1">Type</span>
          {TYPE_OPTIONS.map((t) => (
            <button key={t} onClick={() => setSelectedType(t)} className={chipClass(selectedType === t)}>
              {t === "all" ? "All" : t}
            </button>
          ))}
        </div>
        <div className="flex flex-wrap items-center gap-x-6 gap-y-3 pt-1 border-t border-slate-200 dark:border-slate-800">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-xs font-semibold uppercase tracking-wider text-slate-500 mr-1">Severity</span>
            {SEV_OPTIONS.map((s) => (
              <button key={s} onClick={() => setSelectedSeverity(s)} className={chipClass(selectedSeverity === s)}>
                {s === "all" ? "All" : s}
              </button>
            ))}
          </div>
          <div className="flex items-center gap-3">
            <span className="text-xs font-semibold uppercase tracking-wider text-slate-500">Min confidence</span>
            <input
              type="range"
              min={0}
              max={100}
              value={confidenceMin}
              onChange={(e) => setConfidenceMin(Number(e.target.value))}
              className="w-36 accent-primary-600 cursor-pointer"
            />
            <span className="text-sm font-bold font-heading w-10 tabular-nums">{confidenceMin}%</span>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-xs font-semibold uppercase tracking-wider text-slate-500">Sort</span>
            <div className="inline-flex rounded-lg border border-slate-200 dark:border-slate-700 overflow-hidden text-xs font-medium">
              <button
                onClick={() => setSortBy("severity")}
                className={
                  sortBy === "severity"
                    ? "px-3 py-1.5 bg-primary-600 text-white"
                    : "px-3 py-1.5 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
                }
              >
                Severity
              </button>
              <button
                onClick={() => setSortBy("impact")}
                className={
                  sortBy === "impact"
                    ? "px-3 py-1.5 bg-primary-600 text-white"
                    : "px-3 py-1.5 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
                }
              >
                Impact
              </button>
            </div>
          </div>
          <div className="ml-auto text-xs text-slate-400">
            Showing {visible.length} of {insights.length}
          </div>
        </div>
      </div>

      {/* Insight cards */}
      {visible.length === 0 ? (
        <div className="glass-panel rounded-xl p-12 text-center">
          <div className="text-4xl mb-3">{insights.length === 0 ? "🎉" : "🔍"}</div>
          <h3 className="text-lg font-heading font-bold">
            {insights.length === 0 ? "You're all caught up" : "No insights match your filters"}
          </h3>
          <p className="text-sm text-slate-500 mt-1 max-w-md mx-auto">
            {insights.length === 0
              ? "Every insight has been actioned or dismissed. The model keeps scanning your asset graph for new signals."
              : "Try lowering the confidence threshold or clearing the type and severity filters."}
          </p>
          {insights.length > 0 && (
            <button
              onClick={resetFilters}
              className="mt-4 px-4 py-2 bg-primary-600 text-white rounded-lg text-sm font-medium hover:bg-primary-700 transition-colors"
            >
              Reset filters
            </button>
          )}
        </div>
      ) : (
        <div className="grid grid-cols-1 xl:grid-cols-2 gap-5">
          {visible.map((ins) => {
            const sev = SEV[ins.severity];
            const isActioned = !!actioned[ins.id];
            return (
              <article
                key={ins.id}
                className={`glass-panel rounded-xl relative overflow-hidden p-5 ${
                  isActioned ? "ring-1 ring-health-good/40" : ""
                }`}
              >
                {/* Left severity accent bar */}
                <div className={`absolute left-0 top-0 h-full w-1.5 ${sev.accent}`} />

                <div className="relative">
                  {/* Card header */}
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="inline-flex items-center gap-1 text-xs font-medium px-2 py-0.5 rounded-md bg-slate-100 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300">
                        <span>{TYPE_META[ins.type]}</span>
                        {ins.type}
                      </span>
                      <span
                        className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium border ${sev.pill}`}
                      >
                        <span className={`h-1.5 w-1.5 rounded-full ${sev.dot}`} />
                        {ins.severity}
                      </span>
                      <span className="text-xs text-slate-400">{relTime(ins.createdAt)}</span>
                      {isActioned && <span className="text-xs font-medium text-health-good">✓ Actioned</span>}
                    </div>
                    <ConfidenceRing value={ins.confidence} />
                  </div>

                  {/* Title + summary */}
                  <h3 className="mt-3 text-lg font-heading font-bold leading-snug">{ins.title}</h3>
                  <p className="mt-1 text-sm text-slate-500">{ins.summary}</p>

                  {/* Asset link + impact */}
                  <div className="mt-3 flex flex-wrap items-center gap-3">
                    {ins.assetId && ins.assetName && (
                      <Link
                        href={`/assets/${ins.assetId}`}
                        className="inline-flex items-center gap-1.5 text-xs font-medium px-2.5 py-1 rounded-full bg-slate-100 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700 hover:border-primary-500/50 text-slate-700 dark:text-slate-200 transition-colors"
                      >
                        <span>{catEmoji(getAssetById(ins.assetId)?.category)}</span>
                        <span>{ins.assetName}</span>
                        <span className="text-slate-400">→</span>
                      </Link>
                    )}
                    {ins.impactUsd !== undefined && (
                      <div className="flex items-baseline gap-2">
                        <span className={`text-xl font-heading font-bold ${sev.impactColor}`}>
                          {fmtUsd(ins.impactUsd)}
                        </span>
                        {ins.impactLabel && <span className="text-xs text-slate-400">{ins.impactLabel}</span>}
                      </div>
                    )}
                  </div>

                  {/* Explainable-AI drivers */}
                  <div className="mt-4 rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/40 p-3">
                    <div className="flex items-center gap-1.5 mb-2">
                      <span className="text-xs">💡</span>
                      <span className="text-[11px] font-semibold uppercase tracking-wider text-slate-500">
                        Why this? · Explainable AI
                      </span>
                    </div>
                    <div className="flex flex-wrap gap-1.5">
                      {ins.drivers.map((d, idx) => (
                        <span
                          key={idx}
                          className="inline-flex items-center gap-1 text-xs px-2 py-1 rounded-md bg-white dark:bg-slate-900/60 border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300"
                        >
                          <span className="text-primary-500">✓</span>
                          {d}
                        </span>
                      ))}
                    </div>
                  </div>

                  {/* Recommended action */}
                  <div className="mt-3 flex items-start gap-2 text-sm">
                    <span className="text-primary-500 shrink-0 mt-0.5">➜</span>
                    <p className="text-slate-600 dark:text-slate-300">
                      <span className="font-semibold">Recommended:</span> {ins.recommendedAction}
                    </p>
                  </div>

                  {/* Action row */}
                  <div className="mt-4 flex items-center justify-between gap-3 pt-4 border-t border-slate-200 dark:border-slate-800">
                    <button
                      onClick={() => setActioned((a) => ({ ...a, [ins.id]: true }))}
                      disabled={isActioned}
                      className={
                        isActioned
                          ? "px-4 py-2 rounded-lg text-sm font-medium bg-health-good/15 text-health-good border border-health-good/30 cursor-default"
                          : "px-4 py-2 bg-primary-600 text-white rounded-lg text-sm font-medium hover:bg-primary-700 transition-colors"
                      }
                    >
                      {isActioned ? "✓ Queued" : ins.actionLabel}
                    </button>
                    <div className="flex items-center gap-2">
                      <span className="text-xs text-slate-400 hidden sm:inline">Helpful?</span>
                      <button
                        onClick={() =>
                          setFeedback((f) => ({ ...f, [ins.id]: f[ins.id] === "up" ? null : "up" }))
                        }
                        aria-label="Helpful"
                        className={`h-8 w-8 flex items-center justify-center rounded-lg border text-sm transition-colors ${
                          feedback[ins.id] === "up"
                            ? "bg-health-good/15 border-health-good/40"
                            : "border-slate-200 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800"
                        }`}
                      >
                        👍
                      </button>
                      <button
                        onClick={() =>
                          setFeedback((f) => ({ ...f, [ins.id]: f[ins.id] === "down" ? null : "down" }))
                        }
                        aria-label="Not helpful"
                        className={`h-8 w-8 flex items-center justify-center rounded-lg border text-sm transition-colors ${
                          feedback[ins.id] === "down"
                            ? "bg-health-critical/15 border-health-critical/40"
                            : "border-slate-200 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800"
                        }`}
                      >
                        👎
                      </button>
                      <button
                        onClick={() => setInsights((prev) => prev.filter((x) => x.id !== ins.id))}
                        className="px-3 py-1.5 text-sm font-medium text-slate-500 hover:text-slate-800 dark:hover:text-slate-200 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
                      >
                        Dismiss
                      </button>
                    </div>
                  </div>
                </div>
              </article>
            );
          })}
        </div>
      )}
    </div>
  );
}
