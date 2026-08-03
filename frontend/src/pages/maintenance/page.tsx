import { maintenanceApi } from '@/api/work-orders';
import { useMutate } from '@/api/mutate';
import { useState } from 'react';
import { Link } from 'react-router-dom';
import { PageHeader, KpiCard } from "@/components/ui/primitives";
import { allWorkOrders, allAssets, getAssetById } from "@/lib/dataset";
import { nowMs } from '@/lib/utils';
import type {
  WorkOrder,
  WorkOrderStatus,
  WorkOrderPriority,
  WorkOrderType,
} from "@access-genie/shared";

// ─────────────────────────────────────────────────────────────────────────────
// Constants & helpers (module scope → stable identity, no re-creation on render)
// ─────────────────────────────────────────────────────────────────────────────

/** Fixed demo "now" so overdue math + relative times are deterministic (no
 *  Date.now() at render → no SSR/client hydration drift). Anchored to today. */
const REF_NOW = nowMs();

const STATUS_ORDER: WorkOrderStatus[] = [
  "New",
  "Assigned",
  "In Progress",
  "On Hold",
  "Completed",
];
const PRIORITIES: WorkOrderPriority[] = ["Critical", "High", "Medium", "Low"];
const TYPES: WorkOrderType[] = [
  "Preventive",
  "Corrective",
  "Predictive",
  "Inspection",
];
const PRIORITY_RANK: Record<WorkOrderPriority, number> = {
  Critical: 4,
  High: 3,
  Medium: 2,
  Low: 1,
};

const MONTHS = [
  "Jan", "Feb", "Mar", "Apr", "May", "Jun",
  "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
];

/** Deterministic (UTC-based) date format — avoids timezone hydration mismatch. */
function fmtDate(iso: string): string {
  const d = new Date(iso);
  return `${MONTHS[d.getUTCMonth()]} ${d.getUTCDate()}, ${d.getUTCFullYear()}`;
}

function dueInfo(iso: string, status: WorkOrderStatus): { overdue: boolean; text: string } {
  if (status === "Completed") return { overdue: false, text: "Completed" };
  const diff = Date.parse(iso) - REF_NOW; // >0 future, <0 past
  const abs = Math.abs(diff);
  let rel: string;
  if (abs < 3_600_000) rel = `${Math.max(1, Math.round(abs / 60_000))}m`;
  else if (abs < 86_400_000) rel = `${Math.round(abs / 3_600_000)}h`;
  else rel = `${Math.round(abs / 86_400_000)}d`;
  return diff < 0
    ? { overdue: true, text: `Overdue ${rel}` }
    : { overdue: false, text: `Due in ${rel}` };
}

function initials(name: string): string {
  if (!name || name === "Unassigned") return "—";
  const parts = name.replace(/[^A-Za-z ]/g, "").trim().split(/\s+/);
  return ((parts[0]?.[0] ?? "") + (parts[1]?.[0] ?? "")).toUpperCase() || "—";
}

function categoryEmoji(assetId: string): string {
  const c = getAssetById(assetId)?.category;
  return c === 'Endpoints' ? '📱' : c === 'Compute' ? '💻' : c === 'Network' ? '🌐' : '⚙️';
}

function typeEmoji(t: WorkOrderType): string {
  return t === "Preventive"
    ? "🛡️"
    : t === "Corrective"
    ? "🔧"
    : t === "Predictive"
    ? "📈"
    : "🔍";
}

function priorityBorder(p: WorkOrderPriority): string {
  return p === "Critical"
    ? "border-l-health-critical"
    : p === "High"
    ? "border-l-amber-500"
    : p === "Medium"
    ? "border-l-primary-500"
    : "border-l-slate-400";
}

function priorityPill(p: WorkOrderPriority): string {
  switch (p) {
    case "Critical":
      return "bg-red-100 text-red-800 border-red-200 dark:bg-health-critical/10 dark:text-red-400 dark:border-red-500/25";
    case "High":
      return "bg-amber-100 text-amber-800 border-amber-200 dark:bg-amber-500/10 dark:text-amber-400 dark:border-amber-500/25";
    case "Medium":
      return "bg-primary-50 text-primary-700 border-primary-100 dark:bg-primary-500/10 dark:text-primary-300 dark:border-primary-500/25";
    default:
      return "bg-slate-100 text-slate-700 border-slate-200 dark:bg-slate-500/10 dark:text-slate-400 dark:border-slate-500/25";
  }
}

function statusPill(s: WorkOrderStatus): string {
  switch (s) {
    case "Completed":
      return "bg-emerald-100 text-emerald-800 border-emerald-200 dark:bg-emerald-500/10 dark:text-emerald-400 dark:border-emerald-500/20";
    case "In Progress":
      return "bg-amber-100 text-amber-800 border-amber-200 dark:bg-amber-500/10 dark:text-amber-400 dark:border-amber-500/20";
    case "Assigned":
      return "bg-primary-50 text-primary-700 border-primary-100 dark:bg-primary-500/10 dark:text-primary-300 dark:border-primary-500/20";
    case "On Hold":
      return "bg-slate-100 text-slate-700 border-slate-200 dark:bg-slate-500/10 dark:text-slate-300 dark:border-slate-500/20";
    default:
      return "bg-slate-100 text-slate-700 border-slate-200 dark:bg-slate-500/10 dark:text-slate-400 dark:border-slate-500/20";
  }
}

function statusDot(s: WorkOrderStatus): string {
  return s === "Completed"
    ? "bg-health-good"
    : s === "In Progress"
    ? "bg-amber-500"
    : s === "Assigned"
    ? "bg-primary-500"
    : s === "On Hold"
    ? "bg-slate-400"
    : "bg-slate-400";
}

type SortKey = "id" | "title" | "asset" | "status" | "priority" | "type" | "assignedTo" | "due";

const HEADERS: { key: SortKey; label: string }[] = [
  { key: "title", label: "Work Order" },
  { key: "asset", label: "Asset" },
  { key: "status", label: "Status" },
  { key: "priority", label: "Priority" },
  { key: "assignedTo", label: "Assigned To" },
  { key: "due", label: "Due" },
];

// ─────────────────────────────────────────────────────────────────────────────

export default function MaintenancePage() {
  // Copy mock data into state so in-session mock CRUD works.
  const [workOrders, setWorkOrders] = useState<WorkOrder[]>(() =>
    allWorkOrders.map((wo) => ({ ...wo }))
  );
  const [view, setView] = useState<"board" | "list">("board");
  const [priorityFilter, setPriorityFilter] = useState<"All" | WorkOrderPriority>("All");
  const [typeFilter, setTypeFilter] = useState<"All" | WorkOrderType>("All");
  const [sortKey, setSortKey] = useState<SortKey>("due");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("asc");
  const [woCounter, setWoCounter] = useState(5013);
  const { run } = useMutate();

  // ── Mutations ──────────────────────────────────────────────────────────────
  function moveStatus(id: string, dir: 1 | -1) {
    const wo = workOrders.find((w) => w.id === id);
    if (!wo) return;

    const idx = STATUS_ORDER.indexOf(wo.status);
    const next = STATUS_ORDER[Math.min(STATUS_ORDER.length - 1, Math.max(0, idx + dir))];
    if (next === wo.status) return;

    setWorkOrders((prev) => prev.map((w) => (w.id === id ? { ...w, status: next } : w)));

    // The API validates the transition against its own state machine, so an
    // illegal move is refused there and rolled back here.
    void run(maintenanceApi.changeStatus(id, next), {
      success: `Work order ${next.toLowerCase()}`,
      successDetail: `${wo.id} — ${wo.title}`,
      describe: 'change that status',
      rollback: () => setWorkOrders((prev) => prev.map((w) => (w.id === id ? { ...w, status: wo.status } : w))),
    });
  }

  function handleCreate() {
    const asset = allAssets[woCounter % allAssets.length];
    const newWo: WorkOrder = {
      id: `WO-${woCounter}`,
      title: "New maintenance request",
      assetId: asset.id,
      assetName: asset.name,
      status: "New",
      priority: "Medium",
      type: "Corrective",
      assignedTo: "Unassigned",
      createdAt: new Date(REF_NOW).toISOString(),
      dueDate: new Date(REF_NOW + 3 * 86_400_000).toISOString(),
      description: "Manually created work order — assign a technician and set the priority.",
      estimatedHours: 2,
      aiGenerated: false,
      updatedAt: new Date(nowMs()).toISOString(),
      // A work order starts with an empty execution record, not without one.
      checklist: [],
      parts: [],
      laborLog: [],
      comments: [],
    };
    setWorkOrders((prev) => [newWo, ...prev]);
    setWoCounter((c) => c + 1);

    // The server mints the real id; drop the provisional row in favour of it.
    const { id: _provisional, ...body } = newWo;
    void run(maintenanceApi.create(body as unknown as Record<string, unknown>), {
      success: 'Work order raised',
      describe: 'raise that work order',
      rollback: () => setWorkOrders((prev) => prev.filter((w) => w.id !== newWo.id)),
    }).then((saved) => {
      if (saved) setWorkOrders((prev) => prev.map((w) => (w.id === newWo.id ? saved : w)));
    });
    // Clear filters so the freshly created card is visible immediately.
    setPriorityFilter("All");
    setTypeFilter("All");
  }

  function toggleSort(key: SortKey) {
    if (key === sortKey) setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    else {
      setSortKey(key);
      setSortDir("asc");
    }
  }

  // ── Derived data ───────────────────────────────────────────────────────────
  const open = workOrders.filter((w) => w.status !== "Completed").length;
  const overdue = workOrders.filter(
    (w) => w.status !== "Completed" && Date.parse(w.dueDate) < REF_NOW
  ).length;
  const aiGen = workOrders.filter((w) => w.aiGenerated).length;
  const completed = workOrders.filter((w) => w.status === "Completed").length;

  const filtered = workOrders.filter(
    (w) =>
      (priorityFilter === "All" || w.priority === priorityFilter) &&
      (typeFilter === "All" || w.type === typeFilter)
  );

  const kpis: {
    label: string;
    value: string | number;
    sub: string;
    tone: "slate" | "emerald" | "amber" | "red" | "primary";
    accent?: boolean;
  }[] = [
    { label: "Open Work Orders", value: open, sub: `${workOrders.length} total`, tone: "slate", accent: true },
    {
      label: "Overdue",
      value: overdue,
      sub: overdue > 0 ? "Needs attention" : "On schedule",
      tone: overdue > 0 ? "red" : "emerald",
    },
    { label: "AI-Generated", value: aiGen, sub: "Predictive engine", tone: "primary" },
    { label: "Completed", value: completed, sub: "This session", tone: "emerald" },
  ];

  const priorityOptions: ("All" | WorkOrderPriority)[] = ["All", ...PRIORITIES];
  const typeOptions: ("All" | WorkOrderType)[] = ["All", ...TYPES];
  const filtersActive = priorityFilter !== "All" || typeFilter !== "All";

  const chipCls = (active: boolean) =>
    `px-3 py-1 rounded-full text-xs font-medium border transition-colors ${
      active
        ? "bg-primary-600 text-white border-primary-600 shadow-sm"
        : "bg-transparent text-slate-500 border-slate-200 dark:border-slate-700 hover:border-primary-500/50 hover:text-slate-700 dark:hover:text-slate-200"
    }`;

  // List-view sorting
  const sorted = [...filtered].sort((a, b) => {
    let av: string | number;
    let bv: string | number;
    switch (sortKey) {
      case "priority":
        av = PRIORITY_RANK[a.priority];
        bv = PRIORITY_RANK[b.priority];
        break;
      case "status":
        av = STATUS_ORDER.indexOf(a.status);
        bv = STATUS_ORDER.indexOf(b.status);
        break;
      case "due":
        av = Date.parse(a.dueDate);
        bv = Date.parse(b.dueDate);
        break;
      case "asset":
        av = a.assetName.toLowerCase();
        bv = b.assetName.toLowerCase();
        break;
      case "title":
        av = a.title.toLowerCase();
        bv = b.title.toLowerCase();
        break;
      case "assignedTo":
        av = a.assignedTo.toLowerCase();
        bv = b.assignedTo.toLowerCase();
        break;
      default:
        av = a.id;
        bv = b.id;
    }
    if (av < bv) return sortDir === "asc" ? -1 : 1;
    if (av > bv) return sortDir === "asc" ? 1 : -1;
    return 0;
  });

  // ── Render ─────────────────────────────────────────────────────────────────
  return (
    <div className="h-full flex flex-col space-y-6">
      {/* Header */}
      <PageHeader
        title="Maintenance"
        subtitle="Predictive & preventive work-order pipeline across all facilities."
        actions={
          <div className="flex items-center gap-3">
            {/* View toggle */}
            <div className="inline-flex items-center rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-100/60 dark:bg-slate-900/60 p-0.5 text-sm font-medium">
              {(["board", "list"] as const).map((v) => (
                <button
                  key={v}
                  onClick={() => setView(v)}
                  className={`px-3 py-1.5 rounded-md transition-colors capitalize ${
                    view === v
                      ? "bg-primary-600 text-white shadow-sm"
                      : "text-slate-500 hover:text-slate-700 dark:hover:text-slate-200"
                  }`}
                >
                  {v}
                </button>
              ))}
            </div>
            <button
              onClick={handleCreate}
              className="px-4 py-2 bg-primary-600 text-white rounded-lg text-sm font-medium hover:bg-primary-700 transition-colors shadow-sm whitespace-nowrap"
            >
              + Create Work Order
            </button>
          </div>
        }
      />

      {/* KPI row */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {kpis.map((k) => (
          <KpiCard key={k.label} label={k.label} value={k.value} sub={k.sub} tone={k.tone} accent={k.accent} />
        ))}
      </div>

      {/* Filters */}
      <div className="flex flex-wrap items-center gap-x-6 gap-y-3">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-[11px] font-semibold uppercase tracking-wider text-slate-500 mr-1">
            Priority
          </span>
          {priorityOptions.map((p) => (
            <button key={p} onClick={() => setPriorityFilter(p)} className={chipCls(priorityFilter === p)}>
              {p}
            </button>
          ))}
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-[11px] font-semibold uppercase tracking-wider text-slate-500 mr-1">
            Type
          </span>
          {typeOptions.map((t) => (
            <button key={t} onClick={() => setTypeFilter(t)} className={chipCls(typeFilter === t)}>
              {t}
            </button>
          ))}
        </div>
        <div className="flex items-center gap-3 ml-auto text-sm">
          {filtersActive && (
            <button
              onClick={() => {
                setPriorityFilter("All");
                setTypeFilter("All");
              }}
              className="text-primary-500 hover:text-primary-400 font-medium text-xs"
            >
              Clear filters
            </button>
          )}
          <span className="text-slate-500 font-medium">
            {filtered.length} of {workOrders.length}
          </span>
        </div>
      </div>

      {/* Content */}
      {view === "board" ? (
        <div className="flex-1 min-h-0 overflow-x-auto pb-1">
          <div className="flex gap-4 h-full">
            {STATUS_ORDER.map((status) => {
              const items = filtered.filter((w) => w.status === status);
              return (
                <div
                  key={status}
                  className="flex-1 min-w-[15.5rem] flex flex-col rounded-xl bg-slate-100/40 dark:bg-slate-900/40 border border-slate-200 dark:border-slate-800/80"
                >
                  {/* Column header */}
                  <div className="flex items-center justify-between px-3 py-2.5 border-b border-slate-200 dark:border-slate-800">
                    <div className="flex items-center gap-2">
                      <span className={`h-2 w-2 rounded-full ${statusDot(status)}`} />
                      <span className="text-sm font-semibold">{status}</span>
                    </div>
                    <span className="text-xs font-medium text-slate-500 bg-white dark:bg-slate-800 rounded-full px-2 py-0.5">
                      {items.length}
                    </span>
                  </div>

                  {/* Column body */}
                  <div className="flex-1 overflow-y-auto p-2 space-y-2">
                    {items.length === 0 && (
                      <div className="text-xs text-slate-400 text-center py-10 border border-dashed border-slate-200 dark:border-slate-800 rounded-lg">
                        No work orders
                      </div>
                    )}
                    {items.map((wo) => {
                      const due = dueInfo(wo.dueDate, wo.status);
                      return (
                        <div
                          key={wo.id}
                          className={`group rounded-lg bg-white dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700/70 border-l-4 ${priorityBorder(
                            wo.priority
                          )} p-3 shadow-sm hover:shadow-md hover:-translate-y-0.5 hover:border-primary-500/40 transition-all`}
                        >
                          <div className="flex items-start justify-between gap-2">
                            <span className="font-mono text-[10px] text-slate-400">{wo.id}</span>
                            {wo.status !== "Completed" ? (
                              <button
                                onClick={() => moveStatus(wo.id, 1)}
                                title="Advance status"
                                className="h-6 w-6 grid place-items-center rounded-md text-slate-400 hover:text-white hover:bg-primary-600 transition-colors shrink-0"
                              >
                                →
                              </button>
                            ) : (
                              <button
                                onClick={() => moveStatus(wo.id, -1)}
                                title="Reopen"
                                className="h-6 w-6 grid place-items-center rounded-md text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 transition-colors shrink-0"
                              >
                                ↩
                              </button>
                            )}
                          </div>

                          <h4 className="mt-1 text-sm font-medium leading-snug line-clamp-2">
                            {wo.title}
                          </h4>

                          <Link
                            to={`/assets/${wo.assetId}`}
                            className="mt-1.5 flex items-center gap-1 text-xs text-slate-500 hover:text-primary-500 transition-colors"
                          >
                            <span>{categoryEmoji(wo.assetId)}</span>
                            <span className="truncate">{wo.assetName}</span>
                          </Link>

                          <div className="mt-2 flex flex-wrap items-center gap-1.5">
                            <span
                              className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-medium border ${priorityPill(
                                wo.priority
                              )}`}
                            >
                              {wo.priority}
                            </span>
                            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] font-medium bg-slate-100 dark:bg-slate-700/60 text-slate-600 dark:text-slate-300 border border-slate-200 dark:border-slate-600/60">
                              {typeEmoji(wo.type)} {wo.type}
                            </span>
                            {wo.aiGenerated && (
                              <span className="inline-flex items-center gap-0.5 px-2 py-0.5 rounded-full text-[10px] font-semibold bg-primary-500/10 text-primary-500 border border-primary-500/20">
                                ✨ AI
                              </span>
                            )}
                          </div>

                          <div className="mt-3 flex items-center justify-between border-t border-slate-100 dark:border-slate-700/50 pt-2">
                            <div className="flex items-center gap-1.5 min-w-0">
                              <span className="h-5 w-5 shrink-0 grid place-items-center rounded-full bg-slate-200 dark:bg-slate-700 text-[9px] font-semibold text-slate-600 dark:text-slate-300">
                                {initials(wo.assignedTo)}
                              </span>
                              <span className="text-[11px] text-slate-500 truncate">
                                {wo.assignedTo}
                              </span>
                            </div>
                            <span
                              className={`text-[11px] font-medium whitespace-nowrap ${
                                due.overdue ? "text-health-critical" : "text-slate-400"
                              }`}
                            >
                              {due.text}
                            </span>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      ) : (
        <div className="glass-panel rounded-xl flex-1 min-h-0 overflow-hidden flex flex-col">
          <div className="flex-1 overflow-auto">
            <table className="w-full text-left text-sm whitespace-nowrap">
              <thead className="bg-slate-50 dark:bg-slate-900/80 sticky top-0 z-10 border-b border-slate-200 dark:border-slate-800 text-slate-500 font-semibold uppercase tracking-wider text-xs">
                <tr>
                  {HEADERS.map((h) => (
                    <th
                      key={h.key}
                      onClick={() => toggleSort(h.key)}
                      className="px-6 py-4 cursor-pointer select-none hover:text-slate-700 dark:hover:text-slate-200 transition-colors"
                    >
                      <span className="inline-flex items-center gap-1">
                        {h.label}
                        <span className="text-[9px] text-primary-500">
                          {sortKey === h.key ? (sortDir === "asc" ? "▲" : "▼") : ""}
                        </span>
                      </span>
                    </th>
                  ))}
                  <th className="px-6 py-4 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800/50">
                {sorted.map((wo) => {
                  const due = dueInfo(wo.dueDate, wo.status);
                  return (
                    <tr
                      key={wo.id}
                      className="hover:bg-slate-50 dark:hover:bg-slate-800/30 transition-colors"
                    >
                      <td className="px-6 py-4">
                        <div className="font-medium text-slate-900 dark:text-white">{wo.title}</div>
                        <div className="flex items-center gap-2">
                          <span className="font-mono text-[11px] text-slate-400">{wo.id}</span>
                          {wo.aiGenerated && (
                            <span className="text-[10px] text-primary-500 font-medium">
                              AI-generated
                            </span>
                          )}
                        </div>
                      </td>
                      <td className="px-6 py-4">
                        <Link
                          to={`/assets/${wo.assetId}`}
                          className="inline-flex items-center gap-1.5 text-slate-600 dark:text-slate-300 hover:text-primary-500 transition-colors"
                        >
                          <span>{categoryEmoji(wo.assetId)}</span>
                          {wo.assetName}
                        </Link>
                      </td>
                      <td className="px-6 py-4">
                        <span
                          className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium border ${statusPill(
                            wo.status
                          )}`}
                        >
                          {wo.status}
                        </span>
                      </td>
                      <td className="px-6 py-4">
                        <span
                          className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium border ${priorityPill(
                            wo.priority
                          )}`}
                        >
                          {wo.priority}
                        </span>
                      </td>
                      <td className="px-6 py-4 text-slate-600 dark:text-slate-400">{wo.assignedTo}</td>
                      <td className="px-6 py-4">
                        <span
                          className={
                            due.overdue ? "text-health-critical font-medium" : "text-slate-500"
                          }
                        >
                          {fmtDate(wo.dueDate)}
                        </span>
                      </td>
                      <td className="px-6 py-4 text-right">
                        {wo.status !== "Completed" ? (
                          <button
                            onClick={() => moveStatus(wo.id, 1)}
                            className="text-primary-500 hover:text-primary-400 text-xs font-medium"
                          >
                            Advance →
                          </button>
                        ) : (
                          <span className="text-xs text-slate-400">Done ✓</span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          {sorted.length === 0 && (
            <div className="p-10 text-center text-slate-400 text-sm">
              No work orders match the current filters.
            </div>
          )}
        </div>
      )}
    </div>
  );
}
