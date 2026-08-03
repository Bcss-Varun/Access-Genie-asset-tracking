import { useMemo, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { allWorkOrders, getWorkOrderDetail, getAssetById } from '@/lib/dataset';
import type {
  WorkOrder,
  WorkOrderStatus,
  WorkOrderPriority,
  WorkOrderType,
  WoChecklistItem,
  WoComment,
} from '@access-genie/shared';
import { PageHeader, Badge, EmptyState, Avatar } from '@/components/ui/primitives';
import { Button } from '@/components/ui/Button';
import { Dropdown, MenuItem } from '@/components/ui/Dropdown';
import { useToast } from '@/components/providers/ToastProvider';
import { cn, formatMoney, relTime, nowMs } from '@/lib/utils';

// ── token helpers ─────────────────────────────────────────────────────────────
type Tone = 'slate' | 'primary' | 'emerald' | 'amber' | 'red';

const statusTone = (s: WorkOrderStatus): Tone =>
  s === 'Completed' ? 'emerald'
    : s === 'In Progress' ? 'primary'
      : s === 'On Hold' ? 'amber'
        : s === 'Assigned' ? 'primary'
          : 'slate';

const priorityTone = (p: WorkOrderPriority): Tone =>
  p === 'Critical' ? 'red' : p === 'High' ? 'amber' : p === 'Medium' ? 'primary' : 'slate';

const typeEmoji = (t: WorkOrderType): string =>
  t === 'Preventive' ? '🛡️' : t === 'Corrective' ? '🔧' : t === 'Predictive' ? '📈' : '🔍';

const categoryEmoji = (c?: string): string =>
  c === 'Compute' ? '💻'
    : c === 'Endpoints' ? '📱'
      : c === 'Network' ? '🌐'
        : c === 'Infrastructure' ? '⚡'
          : c === 'Facilities' ? '🏢'
            : c === 'Sensors' ? '📡'
              : '🖥️';

const initials = (name: string): string => {
  if (!name || name === 'Unassigned') return '—';
  const parts = name.replace(/[^A-Za-z ]/g, '').trim().split(/\s+/);
  return ((parts[0]?.[0] ?? '') + (parts[1]?.[0] ?? '')).toUpperCase() || '—';
};

/** Linear happy-path used by the "Advance" control. On Hold is a side branch. */
const ADVANCE_FLOW: WorkOrderStatus[] = ['New', 'Assigned', 'In Progress', 'Completed'];

// ── small presentational bits ─────────────────────────────────────────────────
function KV({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="min-w-0">
      <dt className="text-xs font-medium uppercase tracking-wide text-slate-500">{label}</dt>
      <dd className="mt-1 text-sm font-medium text-slate-900">{value ?? '—'}</dd>
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

// ═══════════════════════════════════════════════════════════════════════════════
export default function WorkOrderDetailPage() {
  const { id = '' } = useParams();
  const { toast } = useToast();

  const base = useMemo(() => allWorkOrders.find((w) => w.id === id), [id]);
  const detail = useMemo(() => (base ? getWorkOrderDetail(id) : null), [base, id]);

  // ── local (in-session) state — seeded once from the mock record ──────────────
  const [status, setStatus] = useState<WorkOrderStatus>(base?.status ?? 'New');
  const [checklist, setChecklist] = useState<WoChecklistItem[]>(() =>
    detail ? detail.checklist.map((c) => ({ ...c })) : [],
  );
  const [comments, setComments] = useState<WoComment[]>(() =>
    detail ? detail.comments.map((c) => ({ ...c })) : [],
  );
  const [draft, setDraft] = useState('');

  // ── not found ────────────────────────────────────────────────────────────────
  if (!base || !detail) {
    return (
      <div className="h-full flex flex-col space-y-6">
        <PageHeader
          title="Work order not found"
          breadcrumb={[{ label: 'Maintenance', href: '/maintenance' }, { label: id }]}
        />
        <div className="glass-panel rounded-xl">
          <EmptyState
            icon="🔍"
            title="Work order not found"
            description={`No work order matches ${id}. It may have been closed or the link is out of date.`}
            action={
              <Link to="/maintenance">
                <Button variant="primary">← Back to Maintenance</Button>
              </Link>
            }
          />
        </div>
      </div>
    );
  }

  const wo: WorkOrder = { ...base, status };
  const asset = getAssetById(wo.assetId);

  // ── derived ──────────────────────────────────────────────────────────────────
  const doneCount = checklist.filter((c) => c.done).length;
  const progress = checklist.length === 0 ? 0 : Math.round((doneCount / checklist.length) * 100);
  const partsTotal = detail.parts.reduce((sum, p) => sum + p.qty * p.unitCost, 0);
  const laborHours = detail.laborLog.reduce((sum, l) => sum + l.hours, 0);

  const advanceIdx = ADVANCE_FLOW.indexOf(status);
  const nextStatus = advanceIdx >= 0 && advanceIdx < ADVANCE_FLOW.length - 1 ? ADVANCE_FLOW[advanceIdx + 1] : null;

  // ── mutations (event handlers → safe to use notifications) ───────────────────
  const changeStatus = (next: WorkOrderStatus) => {
    setStatus(next);
    toast({ title: `${wo.id} → ${next}`, tone: next === 'Completed' ? 'success' : 'info' });
  };

  const toggleItem = (idx: number) =>
    setChecklist((prev) => prev.map((c, i) => (i === idx ? { ...c, done: !c.done } : c)));

  const addComment = () => {
    const text = draft.trim();
    if (!text) return;
    setComments((prev) => [...prev, { author: 'You', text, at: new Date(nowMs()).toISOString() }]);
    setDraft('');
    toast({ title: 'Comment added', tone: 'success' });
  };

  return (
    <div className="h-full flex flex-col space-y-6">
      {/* ── Header ─────────────────────────────────────────────────────────────── */}
      <PageHeader
        breadcrumb={[{ label: 'Maintenance', href: '/maintenance' }, { label: wo.id }]}
        title={wo.title}
        subtitle={`${wo.id} • ${wo.type} • ${wo.assetName}`}
        actions={
          <div className="flex flex-wrap items-center justify-end gap-2">
            {nextStatus && (
              <Button variant="primary" onClick={() => changeStatus(nextStatus)}>
                Advance to {nextStatus} →
              </Button>
            )}
            {status !== 'Completed' && (
              <Button variant="outline" onClick={() => changeStatus('Completed')}>
                ✓ Complete
              </Button>
            )}
            <Dropdown
              ariaLabel="Change status"
              trigger={({ toggle }) => (
                <Button variant="outline" onClick={toggle}>
                  Status ▾
                </Button>
              )}
            >
              {({ close }) => (
                <>
                  {(['New', 'Assigned', 'In Progress', 'On Hold', 'Completed'] as WorkOrderStatus[]).map((s) => (
                    <MenuItem
                      key={s}
                      icon={s === status ? '✓' : ''}
                      className={s === status ? 'text-primary-600 font-semibold' : ''}
                      onClick={() => {
                        changeStatus(s);
                        close();
                      }}
                    >
                      {s}
                    </MenuItem>
                  ))}
                  {status !== 'On Hold' ? (
                    <MenuItem
                      icon="⏸️"
                      onClick={() => {
                        changeStatus('On Hold');
                        close();
                      }}
                    >
                      Put on hold
                    </MenuItem>
                  ) : (
                    <MenuItem
                      icon="▶️"
                      onClick={() => {
                        changeStatus('In Progress');
                        close();
                      }}
                    >
                      Resume work
                    </MenuItem>
                  )}
                </>
              )}
            </Dropdown>
          </div>
        }
      />

      {/* Chip row */}
      <div className="flex flex-wrap items-center gap-2 -mt-2">
        <Badge tone={statusTone(status)}>{status}</Badge>
        <Badge tone={priorityTone(wo.priority)}>{wo.priority} priority</Badge>
        <Badge tone="slate">
          {typeEmoji(wo.type)} {wo.type}
        </Badge>
        {wo.aiGenerated && <Badge tone="primary">✨ AI-generated</Badge>}
        <Link
          to={`/assets/${wo.assetId}`}
          className="inline-flex items-center gap-1.5 text-sm text-slate-500 hover:text-primary-600 transition-colors ml-1"
        >
          <span>{categoryEmoji(asset?.category)}</span>
          <span className="truncate">{wo.assetName}</span>
          <span className="text-slate-300">↗</span>
        </Link>
      </div>

      {/* ── Two-column body ────────────────────────────────────────────────────── */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* LEFT — main working area */}
        <div className="space-y-6 lg:col-span-2">
          {/* Description */}
          <div className="glass-panel p-6 rounded-xl">
            <SectionTitle>Description</SectionTitle>
            <p className="text-sm text-slate-600 leading-relaxed">{wo.description}</p>
          </div>

          {/* Checklist */}
          <div className="glass-panel p-6 rounded-xl">
            <div className="flex items-center justify-between mb-3">
              <SectionTitle>Checklist</SectionTitle>
              <span className="text-xs font-semibold text-slate-500">
                {doneCount}/{checklist.length} done
              </span>
            </div>
            <div className="h-2 w-full rounded-full bg-slate-200 overflow-hidden">
              <div
                className="h-full rounded-full bg-primary-500 transition-all"
                style={{ width: `${progress}%` }}
              />
            </div>
            <ul className="mt-4 space-y-1">
              {checklist.map((item, idx) => (
                <li key={item.label}>
                  <label className="flex items-start gap-3 rounded-lg px-2 py-2 cursor-pointer hover:bg-slate-50 transition-colors">
                    <input
                      type="checkbox"
                      checked={item.done}
                      onChange={() => toggleItem(idx)}
                      className="mt-0.5 h-4 w-4 rounded border-slate-300 accent-primary-600"
                    />
                    <span
                      className={cn(
                        'text-sm',
                        item.done ? 'text-slate-400 line-through' : 'text-slate-700',
                      )}
                    >
                      {item.label}
                    </span>
                  </label>
                </li>
              ))}
            </ul>
          </div>

          {/* Parts */}
          <div className="glass-panel p-6 rounded-xl">
            <SectionTitle count={detail.parts.length}>Parts</SectionTitle>
            {detail.parts.length === 0 ? (
              <p className="text-sm text-slate-500">No parts recorded for this work order.</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-left text-xs uppercase tracking-wide text-slate-500 border-b border-slate-200">
                      <th className="py-2 pr-3 font-medium">SKU</th>
                      <th className="py-2 pr-3 font-medium">Part</th>
                      <th className="py-2 pr-3 font-medium text-right">Qty</th>
                      <th className="py-2 pr-3 font-medium text-right">Unit</th>
                      <th className="py-2 font-medium text-right">Line total</th>
                    </tr>
                  </thead>
                  <tbody>
                    {detail.parts.map((p) => (
                      <tr key={p.sku} className="border-b border-slate-100">
                        <td className="py-2.5 pr-3 font-mono text-xs text-slate-500">{p.sku}</td>
                        <td className="py-2.5 pr-3 text-slate-800">{p.name}</td>
                        <td className="py-2.5 pr-3 text-right text-slate-700">{p.qty}</td>
                        <td className="py-2.5 pr-3 text-right text-slate-700">{formatMoney(p.unitCost)}</td>
                        <td className="py-2.5 text-right font-semibold text-slate-900">
                          {formatMoney(p.qty * p.unitCost)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot>
                    <tr>
                      <td colSpan={4} className="py-2.5 pr-3 text-right text-sm font-medium text-slate-500">
                        Parts total
                      </td>
                      <td className="py-2.5 text-right text-base font-heading font-bold text-slate-900">
                        {formatMoney(partsTotal)}
                      </td>
                    </tr>
                  </tfoot>
                </table>
              </div>
            )}
          </div>

          {/* Labor log */}
          <div className="glass-panel p-6 rounded-xl">
            <div className="flex items-center justify-between mb-3">
              <SectionTitle count={detail.laborLog.length}>Labor Log</SectionTitle>
              {laborHours > 0 && (
                <span className="text-xs font-semibold text-slate-500">{laborHours}h logged</span>
              )}
            </div>
            {detail.laborLog.length === 0 ? (
              <p className="text-sm text-slate-500">No labor logged yet — hours appear once work begins.</p>
            ) : (
              <ul className="space-y-3">
                {detail.laborLog.map((l, i) => (
                  <li key={i} className="flex items-start gap-3 rounded-lg border border-slate-200 p-3">
                    <Avatar initials={initials(l.tech)} className="w-8 h-8 text-xs shrink-0" />
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-sm font-medium text-slate-800 truncate">{l.tech}</span>
                        <span className="text-xs font-semibold text-slate-500 shrink-0">{l.hours}h</span>
                      </div>
                      <p className="text-xs text-slate-500 mt-0.5">{l.note}</p>
                      <p className="text-[11px] text-slate-400 mt-0.5">{relTime(l.at)}</p>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>

        {/* RIGHT — details + comments */}
        <div className="space-y-6 lg:col-span-1">
          {/* Details card */}
          <div className="glass-panel p-6 rounded-xl">
            <SectionTitle>Details</SectionTitle>
            <div className="flex items-center gap-3 mb-5">
              <Avatar initials={initials(wo.assignedTo)} className="w-10 h-10 text-sm shrink-0" />
              <div className="min-w-0">
                <div className="text-xs uppercase tracking-wide text-slate-500">Assigned to</div>
                <div className="text-sm font-semibold text-slate-900 truncate">{wo.assignedTo}</div>
              </div>
            </div>
            <dl className="grid grid-cols-2 gap-x-4 gap-y-4">
              <KV label="Status" value={<Badge tone={statusTone(status)}>{status}</Badge>} />
              <KV label="Priority" value={<Badge tone={priorityTone(wo.priority)}>{wo.priority}</Badge>} />
              <KV label="Type" value={`${typeEmoji(wo.type)} ${wo.type}`} />
              <KV label="Est. hours" value={`${wo.estimatedHours}h`} />
              <KV label="Created" value={relTime(wo.createdAt)} />
              <KV label="Due" value={relTime(wo.dueDate)} />
            </dl>
            <div className="mt-5 pt-4 border-t border-slate-200">
              <Link
                to={`/assets/${wo.assetId}`}
                className="flex items-center gap-2 text-sm text-slate-700 hover:text-primary-600 transition-colors"
              >
                <span className="text-lg">{categoryEmoji(asset?.category)}</span>
                <div className="min-w-0">
                  <div className="font-medium truncate">{wo.assetName}</div>
                  <div className="text-xs text-slate-400 font-mono">{wo.assetId}</div>
                </div>
                <span className="ml-auto text-slate-300">↗</span>
              </Link>
            </div>
          </div>

          {/* Comments */}
          <div className="glass-panel p-6 rounded-xl">
            <SectionTitle count={comments.length}>Comments</SectionTitle>
            <ul className="space-y-4">
              {comments.map((c, i) => (
                <li key={i} className="flex items-start gap-3">
                  <Avatar
                    initials={c.author === 'AI Engine' ? '✨' : initials(c.author)}
                    className="w-8 h-8 text-xs shrink-0"
                  />
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-medium text-slate-800">{c.author}</span>
                      <span className="text-[11px] text-slate-400">{relTime(c.at)}</span>
                    </div>
                    <p className="text-sm text-slate-600 mt-0.5 break-words">{c.text}</p>
                  </div>
                </li>
              ))}
            </ul>
            <div className="mt-4 pt-4 border-t border-slate-200">
              <textarea
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                placeholder="Add a comment…"
                rows={3}
                className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 placeholder:text-slate-400 focus:border-primary-500 focus:outline-none focus:ring-2 focus:ring-primary-500/30 resize-none"
              />
              <div className="mt-2 flex justify-end">
                <Button variant="primary" size="sm" onClick={addComment} disabled={!draft.trim()}>
                  Comment
                </Button>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
