// ─────────────────────────────────────────────────────────────────────────────
// MODULE 3 — Inventory Control
//
// One comparison runs through every tab: what the book says should be here,
// against what the building actually reports. Every screen below is a cut of
// that single fact.
//
//   Does the estate agree with itself?   → Overview
//   Which shelf is the variance on?      → Rooms & Racks ▸ rack monitoring
//   Who has it, and when is it back?     → Check-In / Check-Out
//   Who signed the count off?            → Audits
//   What is still unexplained?           → Exceptions
//
// A tag we can hear but cannot name is an inventory exception, not a separate
// discipline — so unidentified tags queue with everything else rather than
// getting a screen of their own.
// ─────────────────────────────────────────────────────────────────────────────

import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { EmptyState, PageHeader } from '@/components/ui/primitives';
import { Button } from '@/components/ui/Button';
import { useSession } from '@/components/providers/SessionProvider';
import { useToast } from '@/components/providers/ToastProvider';
import { auditsApi, movementsApi } from '@/api/tracking-ops';
import { useMutate } from '@/api/mutate';
import {
  Drawer, Field, LiveStamp, ScopePicker, Tabs, TimelineRail, useFacilityScope, useTabs,
} from '@/components/tracking/shell';
import {
  Chip, ChipFilter, Donut, Meter, Panel, SplitMeter, StatTile, TableShell,
  scoreTone, td, th, type Tone,
} from '@/components/tracking/bits';
import {
  TRACKING_NOW, auditsForFacility, facilityByName, facilityBySlug,
  inventoryExceptions, movementTxns, presenceForFacility, racksForRoom, roomById,
  roomsForFacility, trackingKpis, unknownDetections,
} from '@/lib/tracking-data';
import type {
  AuditMethod, AuditSession, AuditState, ExceptionKind, InventoryException, InventoryRoom,
  MovementDirection, MovementState, MovementTxn, Rack, RackSlot, RackSlotState, UnknownState,
} from '@access-genie/shared';
import { cn, formatDate, formatMoney, relTime } from '@/lib/utils';

const TAB_KEYS = ['rooms', 'movements', 'audits', 'exceptions'] as const;
type TabKey = (typeof TAB_KEYS)[number];

const DEPARTMENTS = ['IT Operations', 'Warehouse', 'Network Engineering', 'Facilities', 'Design', 'Field Operations', 'Infrastructure'] as const;
const MOVE_STATES: MovementState[] = ['Open', 'Returned', 'Overdue', 'Pending Approval', 'Rejected'];

/** A freshly-stamped timestamp reads as "just now", not "0s ago". */
const ago = (iso: string) => (Date.parse(iso) >= TRACKING_NOW() ? 'just now' : relTime(iso));

/**
 * Tag identifiers carry their radio in the prefix. Nobody working a variance
 * queue picks a radio, so we show the identity and drop the technology.
 */
const tagLabel = (id: string) => `Tag ${id.replace(/^(RFID|BLE|UWB|GPS|QR|LORAWAN)[-_]/i, '')}`;

/** Above this, an asset does not leave the building on one person's say-so. */
const APPROVAL_THRESHOLD_INR = 200_000;

const MOVE_TONE: Record<MovementState, Tone> = {
  Open: 'primary', Returned: 'emerald', Overdue: 'red', 'Pending Approval': 'amber', Rejected: 'slate',
};
const AUDIT_TONE: Record<AuditState, Tone> = {
  Scheduled: 'slate', 'In Progress': 'primary', Review: 'amber', Approved: 'emerald', Closed: 'slate',
};
const SEVERITY_TONE: Record<InventoryException['severity'], Tone> = {
  Critical: 'red', High: 'red', Medium: 'amber', Low: 'slate',
};
const SLOT_FILL: Record<RackSlotState, string> = {
  Present: 'bg-health-good', Missing: 'bg-health-critical', Unexpected: 'bg-health-warning', Empty: 'bg-slate-200',
};
const SLOT_TONE: Record<RackSlotState, Tone> = { Present: 'emerald', Missing: 'red', Unexpected: 'amber', Empty: 'slate' };
const SLOT_LABEL: Record<RackSlotState, string> = {
  Present: 'On the shelf', Missing: 'Expected, not detected', Unexpected: 'Detected, not expected', Empty: 'Empty slot',
};

type QueueKind = ExceptionKind | 'Unidentified';
interface QueueRow {
  id: string; kind: QueueKind; title: string; ident: string; room: string; facility: string;
  at: string; severity: InventoryException['severity']; state: string; owner?: string;
  valueInr: number; recommendation: string; suggestion?: string; confidence?: number;
  source: 'exception' | 'unknown';
}

// ── Shared bits ──────────────────────────────────────────────────────────────

/** Expected · detected · unexpected · missing — the four numbers, everywhere. */
function VarianceStats({ expected, detected, unexpected, missing, flat }: {
  expected: number; detected: number; unexpected: number; missing: number; flat?: boolean;
}) {
  const cells = [
    { l: 'Expected', v: expected, c: 'text-slate-900' },
    { l: 'Detected', v: detected, c: 'text-slate-900' },
    { l: 'Unexpected', v: unexpected, c: unexpected ? 'text-amber-600' : 'text-slate-400' },
    { l: 'Missing', v: missing, c: missing ? 'text-health-critical' : 'text-slate-400' },
  ];
  return (
    <div className="grid grid-cols-4 gap-2">
      {cells.map((s) => (
        <div key={s.l} className={cn('rounded-lg p-2', flat ? 'bg-slate-50' : 'border border-slate-200')}>
          <div className={cn('font-heading text-lg font-semibold tabular-nums', s.c)}>{s.v}</div>
          <div className="text-[10px] uppercase tracking-wide text-slate-400">{s.l}</div>
        </div>
      ))}
    </div>
  );
}

const fieldCls = 'mt-1.5 w-full rounded-md bg-slate-100 px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-primary-500';
const labelCls = 'text-[11px] font-semibold uppercase tracking-wide text-slate-500';

function TextField({ id, label, value, onChange, placeholder, type = 'text' }: {
  id: string; label: string; value: string; onChange: (v: string) => void; placeholder?: string; type?: string;
}) {
  return (
    <div>
      <label htmlFor={id} className={labelCls}>{label}</label>
      <input id={id} type={type} value={value} placeholder={placeholder} onChange={(e) => onChange(e.target.value)} className={fieldCls} />
    </div>
  );
}

/** Toggle styled as a pill — used for filters and for the direction switch. */
function PillToggle({ on, onClick, children, className }: {
  on: boolean; onClick: () => void; children: React.ReactNode; className?: string;
}) {
  return (
    <button
      type="button" onClick={onClick} aria-pressed={on}
      className={cn('rounded-full border px-3 py-1 text-xs font-medium transition-colors',
        on ? 'border-primary-600 bg-primary-600 text-white' : 'border-slate-200 bg-white text-slate-600 hover:bg-slate-50', className)}
    >
      {children}
    </button>
  );
}

// ── Rack monitoring ──────────────────────────────────────────────────────────

/**
 * A rack drawn as it stands: 42 slots, bottom to top, coloured by whether the
 * shelf and the record agree. This is the finest grain the module goes to — a
 * room-level variance means nothing until you know which U it sits on.
 */
function RackColumn({ rack }: { rack: Rack }) {
  const [pinned, setPinned] = useState<number | null>(null);
  const [hovered, setHovered] = useState<number | null>(null);
  const activeU = hovered ?? pinned;
  const active = activeU === null ? null : rack.slots.find((s) => s.u === activeU) ?? null;

  const counts = useMemo(() => {
    const c: Record<RackSlotState, number> = { Present: 0, Missing: 0, Unexpected: 0, Empty: 0 };
    for (const s of rack.slots) c[s.state] += 1;
    return c;
  }, [rack]);

  const label = (s: RackSlot) => `U${s.u} · ${SLOT_LABEL[s.state]}${s.assetName ? ` · ${s.assetName}` : ''}`;
  const variance = counts.Missing + counts.Unexpected;

  return (
    <div className="w-[136px] shrink-0 rounded-lg border border-slate-200 bg-white p-2.5">
      <div className="flex items-center justify-between gap-1.5">
        <span className="truncate text-xs font-semibold text-slate-800">{rack.name}</span>
        <Chip tone={rack.status === 'Verified' ? 'emerald' : rack.status === 'Variance' ? 'amber' : 'slate'}>{rack.status}</Chip>
      </div>

      <div className="mt-2 flex items-stretch gap-1.5">
        <div className="flex w-4 flex-col justify-between text-[8px] leading-none tabular-nums text-slate-300">
          <span>42U</span><span>21U</span><span>1U</span>
        </div>
        <div className="flex-1 space-y-[1px] rounded-[3px] border border-slate-200 bg-slate-50 p-[2px]">
          {rack.slots.map((s) => (
            <button
              key={s.u} type="button" title={label(s)} aria-label={label(s)} aria-pressed={pinned === s.u}
              onMouseEnter={() => setHovered(s.u)} onMouseLeave={() => setHovered(null)}
              onFocus={() => setHovered(s.u)} onBlur={() => setHovered(null)}
              onClick={() => setPinned((p) => (p === s.u ? null : s.u))}
              className={cn('block h-[5px] w-full rounded-[1px] transition-all', SLOT_FILL[s.state],
                activeU === s.u && 'outline outline-1 outline-offset-[1px] outline-primary-500')}
            />
          ))}
        </div>
      </div>

      <div className="mt-2 min-h-[52px] rounded-md bg-slate-50 px-2 py-1.5">
        {active ? (
          <>
            <div className="flex items-center justify-between gap-1">
              <span className="text-[10px] font-semibold tabular-nums text-slate-500">U{active.u}</span>
              <Chip tone={SLOT_TONE[active.state]}>{active.state}</Chip>
            </div>
            <p className="mt-0.5 truncate text-[11px] font-medium text-slate-800">
              {active.assetName ?? (active.state === 'Unexpected' ? 'Unidentified tag' : 'Nothing expected')}
            </p>
            <p className="truncate text-[10px] text-slate-400">
              {active.assetId ?? (active.tagId ? tagLabel(active.tagId) : 'free slot')}
            </p>
          </>
        ) : (
          <p className="text-[11px] leading-tight text-slate-400">Hover a slot to see what occupies it.</p>
        )}
      </div>

      <dl className="mt-2 space-y-1 text-[10px] text-slate-500">
        <div className="flex items-center justify-between gap-2"><dt>Load</dt><dd className="font-medium tabular-nums text-slate-700">{rack.loadPct}%</dd></div>
        <Meter value={rack.loadPct} tone={rack.loadPct > 85 ? 'amber' : 'primary'} height="h-1" />
        <div className="flex items-center justify-between gap-2 pt-0.5">
          <dt>Inlet</dt>
          <dd className={cn('font-medium tabular-nums', rack.inletTempC > 26 ? 'text-amber-600' : 'text-slate-700')}>{rack.inletTempC}°C</dd>
        </div>
        <div className="flex items-center justify-between gap-2">
          <dt>Occupied</dt><dd className="font-medium tabular-nums text-slate-700">{rack.heightU - counts.Empty}/{rack.heightU}U</dd>
        </div>
        <div className="flex items-center justify-between gap-2">
          <dt>Variance</dt>
          <dd className={cn('font-medium tabular-nums', variance ? 'text-health-critical' : 'text-emerald-600')}>{variance}</dd>
        </div>
      </dl>
      <p className="mt-1.5 text-[10px] text-slate-400">Counted {ago(rack.lastVerified)}</p>
    </div>
  );
}

// ── Page ─────────────────────────────────────────────────────────────────────

export default function InventoryControlPage() {
  // Derived per render: the dataset is fetched, so a value computed once at
  // module scope would never see a refetch.
  const NOW_ISO = new Date(TRACKING_NOW()).toISOString();
    const DUE_DEFAULT = new Date(TRACKING_NOW() + 3 * 86_400_000).toISOString().slice(0, 10);

  const { toast } = useToast();
  const { run } = useMutate();
  const { session } = useSession();
  const [scope, setScope] = useFacilityScope();
  const [tab, setTab] = useTabs<TabKey>(TAB_KEYS, 'rooms');

  // In-session state. Nothing persists, but everything a person does here stays
  // visible for the rest of the session — the screen never lies back to them.
  const [roomPatch, setRoomPatch] = useState<Record<string, { lastVerified?: string; autoVerify?: boolean }>>({});
  const [roomId, setRoomId] = useState<string | null>(null);
  const [roomQuery, setRoomQuery] = useState('');
  const [varianceOnly, setVarianceOnly] = useState(false);

  const [txnPatch, setTxnPatch] = useState<Record<string, Partial<MovementTxn>>>({});
  const [extraTxns, setExtraTxns] = useState<MovementTxn[]>([]);
  const [moveFilter, setMoveFilter] = useState<MovementState | 'all'>('all');
  const [direction, setDirection] = useState<MovementDirection>('Out');
  const [assetQuery, setAssetQuery] = useState('');
  const [assetId, setAssetId] = useState<string | null>(null);
  const [person, setPerson] = useState('');
  const [dept, setDept] = useState<string>(DEPARTMENTS[0]);
  const [purpose, setPurpose] = useState('');
  const [dueBack, setDueBack] = useState(DUE_DEFAULT);

  const [auditPatch, setAuditPatch] = useState<Record<string, Partial<AuditSession>>>({});
  const [extraAudits, setExtraAudits] = useState<AuditSession[]>([]);
  const [auditId, setAuditId] = useState<string | null>(null);
  const [auditScope, setAuditScope] = useState('');
  const [auditMethod, setAuditMethod] = useState<AuditMethod>('Automatic');

  const [excPatch, setExcPatch] = useState<Record<string, { state: InventoryException['state']; owner?: string }>>({});
  const [unkPatch, setUnkPatch] = useState<Record<string, UnknownState>>({});
  const [queueKind, setQueueKind] = useState<QueueKind | 'all'>('all');
  const [showCleared, setShowCleared] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());

  // Deep links from the Dashboard and the retired routes land on a row, not a page.
  useEffect(() => {
    const p = new URLSearchParams(window.location.search);
    const r = p.get('room');
    const s = p.get('state');
    // Seeding state in an effect is deliberate: the query string can only be
    // read after mount, so the link seeds state exactly once.
    if (r && roomById(r)) {
      setRoomId(r);
      if (!p.get('tab')) setTab('rooms');
    }
    if (s && (MOVE_STATES as string[]).includes(s)) setMoveFilter(s as MovementState);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const facility = scope === 'all' ? null : facilityBySlug(scope) ?? null;
  const kpis = useMemo(() => trackingKpis(scope), [scope]);

  const rooms = useMemo<InventoryRoom[]>(() => roomsForFacility(scope).map((r) => {
    const p = roomPatch[r.id];
    return p ? { ...r, lastVerified: p.lastVerified ?? r.lastVerified, autoVerify: p.autoVerify ?? r.autoVerify } : r;
  }), [scope, roomPatch]);

  const txns = useMemo<MovementTxn[]>(() => {
    const inScope = (t: MovementTxn) => !facility || t.location.startsWith(facility.short) || t.location.includes(facility.name);
    // Patches apply to what was raised in this session too, so approving a
    // release you just requested actually moves it.
    return [...extraTxns, ...movementTxns].map((t) => ({ ...t, ...txnPatch[t.id] })).filter(inScope);
  }, [facility, txnPatch, extraTxns]);

  const audits = useMemo<AuditSession[]>(() => [
    ...extraAudits.filter((a) => !facility || a.facility === facility.name),
    ...auditsForFacility(scope),
  ].map((a) => ({ ...a, ...auditPatch[a.id] })), [scope, facility, auditPatch, extraAudits]);

  /** Exceptions and unidentified tags, normalised into one worklist. */
  const queue = useMemo<QueueRow[]>(() => {
    const fromExceptions: QueueRow[] = inventoryExceptions
      .filter((e) => !facility || e.facility === facility.name)
      .map((e) => {
        const p = excPatch[e.id];
        return {
          id: e.id, kind: e.kind, source: 'exception',
          title: e.assetName ?? (e.tagId ? tagLabel(e.tagId) : 'Unnamed item'),
          ident: e.assetId ?? (e.tagId ? tagLabel(e.tagId) : '—'),
          room: e.expectedRoom && e.expectedRoom !== e.room ? `${e.room} · expected in ${e.expectedRoom}` : e.room,
          facility: e.facility, at: e.detectedAt, severity: e.severity,
          state: p?.state ?? e.state, owner: p?.owner ?? e.owner,
          valueInr: e.valueInr, recommendation: e.recommendation,
        };
      });

    const fromUnknown: QueueRow[] = unknownDetections
      .filter((u) => !facility || u.facility === facility.name)
      .map((u) => {
        const state = unkPatch[u.id] ?? u.state;
        return {
          id: u.id, kind: 'Unidentified', source: 'unknown',
          title: tagLabel(u.tagId), ident: `${u.seenCount.toLocaleString('en-IN')} detections`,
          room: u.zone, facility: u.facility, at: u.lastSeen,
          severity: state === 'Investigating' ? 'High' : state === 'New' ? 'Medium' : 'Low',
          state: state === 'New' || state === 'Investigating' ? 'Open' : state,
          valueInr: 0, recommendation: u.reason,
          suggestion: u.suggestion, confidence: u.suggestionConfidence,
        };
      });

    return [...fromExceptions, ...fromUnknown].sort((a, b) => Date.parse(b.at) - Date.parse(a.at));
  }, [facility, excPatch, unkPatch]);

  const isCleared = (r: QueueRow) => ['Resolved', 'Registered', 'Ignored', 'Matched'].includes(r.state);
  const liveQueue = useMemo(() => queue.filter((r) => showCleared || !isCleared(r)), [queue, showCleared]);
  const filteredQueue = useMemo(
    () => (queueKind === 'all' ? liveQueue : liveQueue.filter((r) => r.kind === queueKind)), [liveQueue, queueKind],
  );
  const kindCounts = useMemo(() => {
    const c = new Map<QueueKind, number>();
    for (const r of liveQueue) c.set(r.kind, (c.get(r.kind) ?? 0) + 1);
    return c;
  }, [liveQueue]);

  const openQueue = queue.filter((r) => !isCleared(r));
  const unidentifiedCount = openQueue.filter((r) => r.kind === 'Unidentified').length;
  const unverifiedValue = openQueue.reduce((s, r) => s + r.valueInr, 0);

  const openOut = txns.filter((t) => t.state === 'Open').length;
  const overdue = txns.filter((t) => t.state === 'Overdue').length;
  const pendingApproval = txns.filter((t) => t.state === 'Pending Approval').length;
  const awaitingSignOff = audits.filter((a) => a.state === 'Review').length;
  const attention = rooms.filter((r) => r.missing > 0 || r.unexpected > 0);

  const room = roomId ? rooms.find((r) => r.id === roomId) ?? null : null;
  const roomRacks = useMemo(() => (room ? racksForRoom(room.id) : []), [room]);
  const audit = auditId ? audits.find((a) => a.id === auditId) ?? null : null;
  const roomExceptions = room ? queue.filter((q) => q.room.startsWith(room.name) && !isCleared(q)) : [];

  // ── Actions ─────────────────────────────────────────────────────────────────

  const verifyRoom = (r: InventoryRoom) => {
    setRoomPatch((p) => ({ ...p, [r.id]: { ...p[r.id], lastVerified: NOW_ISO } }));
    toast({
      title: `${r.name} re-counted`,
      description: `${r.detected} of ${r.expected} confirmed${r.missing ? ` · ${r.missing} still unaccounted for` : ' · no variance'}`,
      tone: r.missing ? 'info' : 'success',
    });
  };

  const toggleAutoVerify = (r: InventoryRoom) => {
    const next = !r.autoVerify;
    setRoomPatch((p) => ({ ...p, [r.id]: { ...p[r.id], autoVerify: next } }));
    toast({
      title: next ? 'Continuous verification on' : 'Continuous verification off',
      description: next ? `${r.name} will re-count itself and raise a variance without waiting for a person`
        : `${r.name} will only be counted when someone asks for it`,
      tone: next ? 'success' : 'default',
    });
  };

  const candidates = useMemo(() => {
    const q = assetQuery.trim().toLowerCase();
    return presenceForFacility(scope)
      .filter((p) => (direction === 'Out' ? p.custody === 'In Place' : p.custody === 'Checked Out'))
      .filter((p) => !q || `${p.assetName} ${p.assetId} ${p.zone}`.toLowerCase().includes(q))
      .slice(0, 6);
  }, [scope, direction, assetQuery]);

  const pickedAsset = useMemo(
    () => (assetId ? presenceForFacility(scope).find((p) => p.assetId === assetId) ?? null : null), [assetId, scope],
  );
  const gateVerified = pickedAsset?.state === 'Online' || pickedAsset?.state === 'In Transit';

  const decideMovement = (t: MovementTxn, approve: boolean) => {
    setTxnPatch((p) => ({ ...p, [t.id]: { ...p[t.id], state: approve ? 'Open' : 'Rejected', approver: session.user.name } }));
    toast({
      title: approve ? 'Check-out approved' : 'Check-out rejected',
      description: `${t.assetName} · ${t.person}`, tone: approve ? 'success' : 'error',
    });
  };

  const submitMovement = async () => {
    if (!pickedAsset || !person.trim() || !purpose.trim()) return;
    const short = facilityByName(pickedAsset.facility)?.short ?? pickedAsset.facility;
    const needsApproval = direction === 'Out' && pickedAsset.valueInr >= APPROVAL_THRESHOLD_INR;
    const due = Date.parse(`${dueBack}T09:00:00.000Z`);

    const txn = await run(
      movementsApi.create({
        assetId: pickedAsset.assetId,
        assetName: pickedAsset.assetName,
        direction,
        person: person.trim(),
        department: dept,
        purpose: purpose.trim(),
        location: `${short} · ${pickedAsset.zone}`,
        dueBack: direction === 'Out' && !Number.isNaN(due) ? new Date(due).toISOString() : undefined,
      }),
      { describe: `check that asset ${direction === 'Out' ? 'out' : 'in'}`, refreshTracking: true },
    );

    if (!txn) return;

    // Approval and gate verification are decided here rather than sent: the
    // threshold is a policy the screen knows, and `verified` is a claim only
    // the estate can make — so the record is corrected in a follow-up write
    // rather than trusting the browser for either.
    const state = direction === 'In' ? 'Returned' : needsApproval ? 'Pending Approval' : 'Open';
    if (state !== txn.state || gateVerified !== txn.verified) {
      await run(movementsApi.update(txn.id, { state, verified: gateVerified }), {
        describe: 'record that movement',
        refreshTracking: true,
      });
    }

    setExtraTxns((prev) => [{ ...txn, state, verified: gateVerified }, ...prev]);
    setAssetId(null); setAssetQuery(''); setPerson(''); setPurpose('');
    toast({
      title: direction === 'Out' ? (needsApproval ? 'Check-out sent for approval' : 'Asset checked out') : 'Asset checked in',
      description: needsApproval
        ? `${pickedAsset.assetName} is above ${formatMoney(APPROVAL_THRESHOLD_INR)} — a manager must release it`
        : `${pickedAsset.assetName} · ${person.trim()}${gateVerified ? ' · presence confirmed at the gate' : ' · not confirmed at the gate'}`,
      tone: needsApproval ? 'info' : 'success',
    });
  };

  /**
   * Sign off — or reject — a variance.
   *
   * This is the moment an audit becomes evidence, so it is the one action on
   * this screen that must not be local: an approval nobody can produce later is
   * worse than no approval at all.
   */
  const signOff = async (a: AuditSession, approve: boolean) => {
    const previous = auditPatch;
    const patch = approve
      ? { state: 'Approved' as const, approver: session.user.name, approvedAt: NOW_ISO }
      : { state: 'In Progress' as const, progress: 0, detected: 0, note: 'Variance rejected — a full re-count was requested' };

    setAuditPatch((p) => ({ ...p, [a.id]: patch }));

    // `approvedAt` is stamped by the server — a client clock has no standing on
    // a compliance record.
    const { approvedAt: _stamped, ...body } = patch as Record<string, unknown>;

    await run(auditsApi.update(a.id, body), {
      success: approve ? 'Variance approved' : 'Re-count requested',
      successDetail: approve
        ? `${a.name} signed off by ${session.user.name} · ${a.missing} missing, ${a.unexpected} unexpected accepted`
        : `${a.name} has been sent back to ${a.owner}`,
      describe: approve ? 'approve that variance' : 'request a re-count',
      rollback: () => setAuditPatch(previous),
      refreshTracking: true,
    });
  };

  const startAudit = async () => {
    const target = rooms.find((r) => r.name === auditScope);
    if (!target) return;
    // A room that counts itself has already finished by the time you ask; a
    // person has to be sent for the other two.
    const automatic = auditMethod === 'Automatic';

    const audit = await run(
      auditsApi.start({
        name: `${auditMethod} count — ${target.name}`,
        scope: target.name,
        facility: target.facility,
        method: auditMethod,
        expected: target.expected,
        dueInDays: 1,
      }),
      { describe: 'start that audit', refreshTracking: true },
    );

    if (!audit) return;

    // An automatic count is already done: the room reported what it holds, so
    // the session goes straight to Review with the variance attached.
    if (automatic) {
      await run(
        auditsApi.update(audit.id, {
          state: 'Review',
          detected: target.detected,
          unexpected: target.unexpected,
          missing: target.missing,
          progress: 100,
          note: 'Counted by the room itself — variance ready for sign-off',
        }),
        { describe: 'record that count', refreshTracking: true },
      );
    }

    setExtraAudits((prev) => [{
      ...audit,
      state: automatic ? 'Review' : 'Scheduled',
      detected: automatic ? target.detected : 0,
      unexpected: automatic ? target.unexpected : 0,
      missing: automatic ? target.missing : 0,
      progress: automatic ? 100 : 0,
      note: automatic ? 'Counted by the room itself — variance ready for sign-off' : undefined,
    }, ...prev]);

    setAuditScope('');
    toast({
      title: automatic ? 'Count complete' : 'Audit scheduled',
      description: automatic
        ? `${target.name} counted itself — ${target.missing + target.unexpected} variances ready for sign-off`
        : `${target.name} queued for a ${auditMethod.toLowerCase()} count within 24 hours`,
      tone: 'success',
    });
  };

  const patchException = (r: QueueRow, action: 'Assign' | 'Resolve') => setExcPatch((p) => ({
    ...p,
    [r.id]: action === 'Assign'
      ? { state: 'Assigned', owner: session.user.name }
      : { state: 'Resolved', owner: p[r.id]?.owner ?? r.owner ?? session.user.name },
  }));

  const workException = (r: QueueRow, action: 'Assign' | 'Resolve') => {
    patchException(r, action);
    toast({
      title: action === 'Assign' ? `Assigned to ${session.user.name}` : 'Exception resolved',
      description: `${r.kind} · ${r.title}`, tone: action === 'Assign' ? 'info' : 'success',
    });
  };

  const workUnknown = (r: QueueRow, state: UnknownState) => {
    setUnkPatch((p) => ({ ...p, [r.id]: state }));
    toast({
      title: state === 'Matched' ? 'Match accepted' : state === 'Registered' ? 'Tag registered' : 'Detection ignored',
      description: state === 'Matched' && r.suggestion ? r.suggestion : `${r.title} · ${r.room}`,
      tone: state === 'Ignored' ? 'default' : 'success',
    });
  };

  const bulk = (action: 'Assign' | 'Resolve') => {
    const rows = filteredQueue.filter((r) => selected.has(r.id));
    for (const r of rows) {
      if (r.source === 'exception') patchException(r, action);
      // A tag we cannot name has nobody to assign it to — taking it on means
      // opening an investigation instead.
      else setUnkPatch((p) => ({ ...p, [r.id]: action === 'Assign' ? 'Investigating' : 'Ignored' }));
    }
    setSelected(new Set());
    toast({ title: `${action} · ${rows.length} items`, description: `Worked by ${session.user.name}`, tone: 'success' });
  };

  // ── Derived views ───────────────────────────────────────────────────────────

  const visibleRooms = useMemo(() => {
    const q = roomQuery.trim().toLowerCase();
    return rooms
      .filter((r) => !varianceOnly || r.missing > 0 || r.unexpected > 0)
      .filter((r) => !q || `${r.name} ${r.facility} ${r.custodian} ${r.kind}`.toLowerCase().includes(q))
      .slice().sort((a, b) => a.accuracy - b.accuracy || b.missing - a.missing);
  }, [rooms, roomQuery, varianceOnly]);

  const visibleTxns = useMemo(
    () => txns.filter((t) => moveFilter === 'all' || t.state === moveFilter)
      .slice().sort((a, b) => Date.parse(b.at) - Date.parse(a.at)),
    [txns, moveFilter],
  );

  const auditTimeline = (a: AuditSession) => {
    const items: { at: string; title: string; detail?: string; actor?: string; tone?: 'good' | 'warn' | 'bad' | 'info' }[] = [
      { at: ago(a.startedAt), title: 'Audit opened', detail: `${a.method} count of ${a.scope}`, actor: a.owner },
    ];
    if (a.progress > 0) items.push({ at: ago(a.startedAt), title: 'Counting under way', detail: `${a.detected} of ${a.expected} counted (${a.progress}%)`, tone: 'info' });
    if (a.progress === 100) items.push({
      at: ago(a.startedAt), title: 'Count complete — variance raised',
      detail: `${a.missing} missing · ${a.unexpected} unexpected`, tone: a.missing + a.unexpected ? 'warn' : 'good',
    });
    if (a.approvedAt) items.push({ at: ago(a.approvedAt), title: 'Variance signed off', actor: a.approver, tone: 'good' });
    else items.push({ at: relTime(a.dueAt), title: 'Sign-off due', detail: formatDate(a.dueAt), tone: 'warn' });
    if (a.state === 'Closed') items.push({ at: ago(a.dueAt), title: 'Audit closed', tone: 'good' });
    return items;
  };

  const TABS = [
    { key: 'rooms' as const, label: 'Rooms & Racks', count: attention.length, tone: 'amber' as const },
    { key: 'movements' as const, label: 'Check-In / Check-Out', count: overdue, tone: 'red' as const },
    { key: 'audits' as const, label: 'Audits', count: awaitingSignOff, tone: 'amber' as const },
    { key: 'exceptions' as const, label: 'Exceptions', count: openQueue.length, tone: 'red' as const },
  ];

  return (
    <div className="space-y-5 pb-4">
      <PageHeader
        title="Inventory Control"
        subtitle="Expected against detected — the book and the building, reconciled."
        breadcrumb={[{ label: 'Asset Tracking', href: '/tracking' }, { label: 'Inventory Tracking' }]}
        actions={
          <>
            <LiveStamp />
            <ScopePicker value={scope} onChange={setScope} />
            <Button variant="outline" onClick={() => toast({ title: 'Variance report queued', description: `${rooms.length} rooms · ${openQueue.length} open exceptions → Export Center`, tone: 'success' })}>
              Export variance
            </Button>
          </>
        }
      />

      {/* ── KPI strip — every number opens the tab that acts on it ────────────── */}
      <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
        <StatTile
          label="Inventory accuracy" value={`${kpis.inventoryAccuracy}%`} meter={kpis.inventoryAccuracy}
          tone={scoreTone(kpis.inventoryAccuracy, 99, 97)}
          onClick={() => { setVarianceOnly(attention.length > 0); setTab('rooms'); }}
        />
        <StatTile
          label="Rooms reconciled" value={`${kpis.roomsVerified}/${kpis.roomsTotal}`}
          tone={kpis.roomsVerified === kpis.roomsTotal ? 'emerald' : 'amber'}
          sub={attention.length ? `${attention.length} with a variance` : 'every room agrees'}
          onClick={() => { setVarianceOnly(attention.length > 0); setTab('rooms'); }}
        />
        <StatTile
          label="Open exceptions" value={openQueue.length} tone={openQueue.length ? 'red' : 'emerald'}
          sub={`${formatMoney(unverifiedValue)} unverified`}
          onClick={() => { setQueueKind('all'); setTab('exceptions'); }}
        />
        <StatTile
          label="Unidentified tags" value={unidentifiedCount} tone={unidentifiedCount ? 'amber' : 'emerald'}
          sub="heard but not named" onClick={() => { setQueueKind('Unidentified'); setTab('exceptions'); }}
        />
        <StatTile
          label="Checked out" value={openOut} tone="primary"
          sub={pendingApproval ? `${pendingApproval} awaiting approval` : 'all releases approved'}
          onClick={() => { setMoveFilter('Open'); setTab('movements'); }}
        />
        <StatTile
          label="Overdue returns" value={overdue} tone={overdue ? 'red' : 'emerald'}
          sub={overdue ? 'past their due-back date' : 'nothing late'}
          onClick={() => { setMoveFilter('Overdue'); setTab('movements'); }}
        />
      </div>

      <Tabs tabs={TABS} value={tab} onChange={setTab} />

      {/* ══ ROOMS & RACKS ══════════════════════════════════════════════════════ */}
      {tab === 'rooms' && (
        <Panel padded={false}>
          <div className="flex flex-wrap items-center gap-2 border-b border-slate-200 p-3">
            <input
              value={roomQuery} onChange={(e) => setRoomQuery(e.target.value)}
              placeholder="Filter by room, custodian, facility…" aria-label="Filter rooms"
              className="w-64 max-w-full rounded-md bg-slate-100 px-3 py-1.5 text-sm outline-none focus:ring-2 focus:ring-primary-500"
            />
            <PillToggle on={varianceOnly} onClick={() => setVarianceOnly((v) => !v)}>Only rooms with a variance</PillToggle>
            <span className="ml-auto text-xs text-slate-400">{visibleRooms.length} of {rooms.length} rooms</span>
          </div>

          {visibleRooms.length === 0 ? (
            <EmptyState
              variant="no-results" title="No rooms match" description="Try a different search or clear the variance filter."
              action={<Button variant="outline" onClick={() => { setRoomQuery(''); setVarianceOnly(false); }}>Clear filters</Button>}
            />
          ) : (
            <TableShell>
              <thead className="sticky top-0 z-10 border-b border-slate-200 bg-slate-50">
                <tr>
                  {['Room', 'Facility', 'Kind', 'Expected vs detected', 'Accuracy', 'Unexpected', 'Missing', 'Last verified', 'Verification', 'Custodian']
                    .map((h) => <th key={h} className={cn(th, h === 'Expected vs detected' && 'w-52')}>{h}</th>)}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {visibleRooms.map((r) => (
                  <tr
                    key={r.id} onClick={() => setRoomId(r.id)}
                    className={cn('cursor-pointer transition-colors hover:bg-slate-50', roomId === r.id && 'bg-primary-50/50')}
                  >
                    <td className={td}>
                      <div className="font-medium text-slate-900">{r.name}</div>
                      <div className="text-xs text-slate-400">{r.id}{r.rackCount ? ` · ${r.rackCount} racks` : ''}</div>
                    </td>
                    <td className={cn(td, 'text-slate-600')}>{r.facility}</td>
                    <td className={cn(td, 'text-slate-600')}>{r.kind}</td>
                    <td className={td}>
                      <div className="flex items-center gap-2">
                        <span className="w-16 shrink-0 text-xs tabular-nums text-slate-500">{r.detected}/{r.expected}</span>
                        <SplitMeter matched={r.detected - r.unexpected} missing={r.missing} unexpected={r.unexpected} total={r.expected} />
                      </div>
                    </td>
                    <td className={cn(td, 'font-semibold tabular-nums',
                      r.accuracy >= 99.5 ? 'text-emerald-600' : r.accuracy >= 98 ? 'text-amber-600' : 'text-health-critical')}>
                      {r.accuracy}%
                    </td>
                    <td className={td}>{r.unexpected ? <Chip tone="amber">{r.unexpected}</Chip> : <span className="text-slate-300">—</span>}</td>
                    <td className={td}>{r.missing ? <Chip tone="red">{r.missing}</Chip> : <span className="text-slate-300">—</span>}</td>
                    <td className={cn(td, 'text-xs text-slate-500')}>{ago(r.lastVerified)}</td>
                    <td className={td}><Chip tone={r.autoVerify ? 'emerald' : 'slate'} dot>{r.autoVerify ? 'Continuous' : 'On demand'}</Chip></td>
                    <td className={cn(td, 'text-slate-600')}>{r.custodian}</td>
                  </tr>
                ))}
              </tbody>
            </TableShell>
          )}
        </Panel>
      )}

      {/* ══ CHECK-IN / CHECK-OUT ═══════════════════════════════════════════════ */}
      {tab === 'movements' && (
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-[minmax(0,360px)_minmax(0,1fr)]">
          <Panel
            title={direction === 'Out' ? 'Check out an asset' : 'Check an asset back in'}
            subtitle="Custody changes hands here, and the gate confirms it"
          >
            <div className="flex gap-1.5">
              {(['Out', 'In'] as const).map((d) => (
                <button
                  key={d} type="button" aria-pressed={direction === d}
                  onClick={() => { setDirection(d); setAssetId(null); setAssetQuery(''); }}
                  className={cn('flex-1 rounded-lg border px-3 py-2 text-sm font-medium transition-colors',
                    direction === d ? 'border-primary-600 bg-primary-600 text-white' : 'border-slate-200 bg-white text-slate-600 hover:bg-slate-50')}
                >
                  {d === 'Out' ? '🎫 Check out' : '↩️ Check in'}
                </button>
              ))}
            </div>

            <div className="mt-3.5">
              <label htmlFor="asset-picker" className={labelCls}>Asset</label>
              {pickedAsset ? (
                <div className="mt-1.5 rounded-lg border border-primary-200 bg-primary-50/60 p-2.5">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <div className="truncate text-sm font-medium text-slate-900">{pickedAsset.assetName}</div>
                      <div className="text-xs text-slate-500">{pickedAsset.assetId} · {pickedAsset.zone}</div>
                    </div>
                    <button type="button" onClick={() => setAssetId(null)} aria-label="Clear selected asset" className="text-slate-400 hover:text-slate-700">✕</button>
                  </div>
                  {/* Paperwork is only worth as much as the gate that confirms it. */}
                  <div className="mt-2 flex flex-wrap items-center gap-2">
                    <Chip tone={gateVerified ? 'emerald' : 'amber'} dot>
                      {gateVerified ? 'Presence verified at the gate' : 'Not confirmed at the gate'}
                    </Chip>
                    <span className="text-[11px] text-slate-500">seen {relTime(pickedAsset.lastSeen)}</span>
                  </div>
                  {pickedAsset.valueInr >= APPROVAL_THRESHOLD_INR && direction === 'Out' && (
                    <p className="mt-2 text-[11px] text-amber-700">
                      {formatMoney(pickedAsset.valueInr)} — above the {formatMoney(APPROVAL_THRESHOLD_INR)} release limit, so this needs a manager&apos;s approval.
                    </p>
                  )}
                </div>
              ) : (
                <>
                  <input
                    id="asset-picker" value={assetQuery} onChange={(e) => setAssetQuery(e.target.value)}
                    placeholder={direction === 'Out' ? 'Search assets in place…' : 'Search assets currently out…'} className={fieldCls}
                  />
                  <ul className="mt-1.5 space-y-1">
                    {candidates.length === 0 && (
                      <li className="rounded-md bg-slate-50 px-2.5 py-2 text-xs text-slate-400">Nothing matches in this scope.</li>
                    )}
                    {candidates.map((c) => (
                      <li key={c.assetId}>
                        <button
                          type="button" onClick={() => setAssetId(c.assetId)}
                          className="flex w-full items-center justify-between gap-2 rounded-md border border-slate-200 px-2.5 py-1.5 text-left transition-colors hover:border-primary-200 hover:bg-primary-50"
                        >
                          <span className="min-w-0">
                            <span className="block truncate text-xs font-medium text-slate-800">{c.assetName}</span>
                            <span className="block truncate text-[11px] text-slate-400">{c.assetId} · {c.zone}</span>
                          </span>
                          <span className={cn('h-1.5 w-1.5 shrink-0 rounded-full', c.state === 'Online' ? 'bg-health-good' : 'bg-slate-300')} aria-hidden />
                        </button>
                      </li>
                    ))}
                  </ul>
                </>
              )}
            </div>

            <div className="mt-3.5 space-y-3">
              <TextField id="mv-person" label={direction === 'Out' ? 'Issued to' : 'Returned by'} value={person} onChange={setPerson} placeholder="Name or team" />
              <div>
                <label htmlFor="mv-dept" className={labelCls}>Department</label>
                <select id="mv-dept" value={dept} onChange={(e) => setDept(e.target.value)} className={fieldCls}>
                  {DEPARTMENTS.map((d) => <option key={d} value={d}>{d}</option>)}
                </select>
              </div>
              <TextField
                id="mv-purpose" label="Purpose" value={purpose} onChange={setPurpose}
                placeholder={direction === 'Out' ? 'Why is it leaving?' : 'Condition on return'}
              />
              {direction === 'Out' && <TextField id="mv-due" label="Due back" type="date" value={dueBack} onChange={setDueBack} />}
            </div>

            <Button className="mt-4 w-full" disabled={!pickedAsset || !person.trim() || !purpose.trim()} onClick={() => void submitMovement()}>
              {direction === 'Out' ? 'Release asset' : 'Confirm return'}
            </Button>
          </Panel>

          <Panel padded={false} title="Movement log" subtitle={`${visibleTxns.length} transactions in this scope`}>
            <div className="border-b border-slate-200 p-3">
              <ChipFilter
                value={moveFilter} onChange={setMoveFilter}
                options={[
                  { key: 'all' as const, label: 'All', count: txns.length },
                  { key: 'Open' as const, label: 'Open', count: openOut, tone: 'primary' as const },
                  { key: 'Overdue' as const, label: 'Overdue', count: overdue, tone: 'red' as const },
                  { key: 'Pending Approval' as const, label: 'Pending approval', count: pendingApproval, tone: 'amber' as const },
                  { key: 'Returned' as const, label: 'Returned', count: txns.filter((t) => t.state === 'Returned').length, tone: 'emerald' as const },
                  { key: 'Rejected' as const, label: 'Rejected', count: txns.filter((t) => t.state === 'Rejected').length, tone: 'slate' as const },
                ]}
              />
            </div>
            {visibleTxns.length === 0 ? (
              <EmptyState variant="no-results" title="No transactions here" description="Change the filter, or check something out to get started." />
            ) : (
              <TableShell>
                <thead className="sticky top-0 z-10 border-b border-slate-200 bg-slate-50">
                  <tr>
                    {['Asset', 'Direction', 'Person', 'Department', 'When', 'Due back', 'State', 'Gate'].map((h) => <th key={h} className={th}>{h}</th>)}
                    <th className={cn(th, 'text-right')}>Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {visibleTxns.map((t) => (
                    <tr key={t.id} className={cn('transition-colors hover:bg-slate-50', t.state === 'Overdue' && 'bg-red-50/70 hover:bg-red-50')}>
                      <td className={td}>
                        <div className="flex items-center gap-2">
                          {t.state === 'Overdue' && <span className="h-8 w-0.5 shrink-0 rounded-full bg-health-critical" aria-hidden />}
                          <div className="min-w-0">
                            <div className="truncate font-medium text-slate-900">{t.assetName}</div>
                            <div className="truncate text-xs text-slate-400">{t.assetId} · {t.purpose}</div>
                          </div>
                        </div>
                      </td>
                      <td className={td}><Chip tone={t.direction === 'Out' ? 'primary' : 'emerald'}>{t.direction === 'Out' ? '↗ Out' : '↙ In'}</Chip></td>
                      <td className={cn(td, 'text-slate-700')}>{t.person}</td>
                      <td className={cn(td, 'text-slate-600')}>{t.department}</td>
                      <td className={cn(td, 'text-xs text-slate-500')}>{ago(t.at)}</td>
                      <td className={cn(td, 'text-xs')}>
                        {t.dueBack
                          ? <span className={cn(t.state === 'Overdue' ? 'font-semibold text-health-critical' : 'text-slate-500')}>{relTime(t.dueBack)}</span>
                          : <span className="text-slate-300">—</span>}
                      </td>
                      <td className={td}><Chip tone={MOVE_TONE[t.state]} dot>{t.state}</Chip></td>
                      <td className={td}>{t.verified ? <Chip tone="emerald">Confirmed</Chip> : <Chip tone="slate">Paperwork only</Chip>}</td>
                      <td className={cn(td, 'text-right')}>
                        {t.state === 'Pending Approval' ? (
                          <span className="inline-flex gap-1.5">
                            <Button size="sm" onClick={() => decideMovement(t, true)}>Approve</Button>
                            <Button size="sm" variant="outline" onClick={() => decideMovement(t, false)}>Reject</Button>
                          </span>
                        ) : t.state === 'Overdue' ? (
                          <Button size="sm" variant="outline"
                            onClick={() => toast({ title: 'Return chased', description: `${t.person} has been reminded about ${t.assetName}`, tone: 'info' })}>
                            Chase return
                          </Button>
                        ) : (
                          <Link to={`/tracking?asset=${t.assetId}`} className="text-xs font-medium text-slate-400 hover:text-primary-600">Locate →</Link>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </TableShell>
            )}
          </Panel>
        </div>
      )}

      {/* ══ AUDITS ═════════════════════════════════════════════════════════════ */}
      {tab === 'audits' && (
        <div className="space-y-4">
          <Panel title="Start an audit" subtitle="Pick what to count and how it should be counted">
            <div className="flex flex-wrap items-end gap-3">
              <div className="min-w-[220px] flex-1">
                <label htmlFor="aud-scope" className={labelCls}>Scope</label>
                <select id="aud-scope" value={auditScope} onChange={(e) => setAuditScope(e.target.value)} className={fieldCls}>
                  <option value="">Choose a room…</option>
                  {rooms.map((r) => <option key={r.id} value={r.name}>{r.name} — {r.facility} ({r.expected} expected)</option>)}
                </select>
              </div>
              <div>
                <span className={labelCls}>Method</span>
                {/* Method is a way of working, never a technology: the room counts
                    itself, a person walks it, or a person counts by eye. */}
                <div className="mt-1.5 flex gap-1.5">
                  {(['Automatic', 'Assisted', 'Manual'] as AuditMethod[]).map((m) => (
                    <button
                      key={m} type="button" onClick={() => setAuditMethod(m)} aria-pressed={auditMethod === m}
                      title={m === 'Automatic' ? 'The room counts itself' : m === 'Assisted' ? 'A walk-through with a handheld' : 'Eyes and a clipboard'}
                      className={cn('rounded-lg border px-3 py-2 text-sm font-medium transition-colors',
                        auditMethod === m ? 'border-primary-600 bg-primary-600 text-white' : 'border-slate-200 bg-white text-slate-600 hover:bg-slate-50')}
                    >
                      {m}
                    </button>
                  ))}
                </div>
              </div>
              <Button disabled={!auditScope} onClick={() => void startAudit()}>📋 Start count</Button>
            </div>
          </Panel>

          <Panel padded={false} title="Audit sessions" subtitle={`${audits.length} in this scope · ${awaitingSignOff} awaiting sign-off`}>
            {audits.length === 0 ? (
              <EmptyState icon="📋" title="No audits in this scope" description="Start one above to open a count." />
            ) : (
              <TableShell>
                <thead className="sticky top-0 z-10 border-b border-slate-200 bg-slate-50">
                  <tr>
                    {['Audit', 'Scope', 'Method', 'State', 'Progress', 'Expected', 'Detected', 'Unexpected', 'Missing', 'Owner', 'Approver', 'Due']
                      .map((h) => <th key={h} className={cn(th, h === 'Progress' && 'w-40')}>{h}</th>)}
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {audits.map((a) => (
                    <tr
                      key={a.id} onClick={() => setAuditId(a.id)}
                      className={cn('cursor-pointer transition-colors hover:bg-slate-50', auditId === a.id && 'bg-primary-50/50')}
                    >
                      <td className={td}>
                        <div className="font-medium text-slate-900">{a.name}</div>
                        <div className="text-xs text-slate-400">{a.id} · opened {ago(a.startedAt)}</div>
                      </td>
                      <td className={cn(td, 'text-slate-600')}>{a.scope}</td>
                      <td className={cn(td, 'text-slate-600')}>{a.method}</td>
                      <td className={td}><Chip tone={AUDIT_TONE[a.state]} dot>{a.state}</Chip></td>
                      <td className={td}>
                        <div className="flex items-center gap-2">
                          <Meter value={a.progress} tone={a.progress === 100 ? 'emerald' : 'primary'} />
                          <span className="w-9 shrink-0 text-right text-xs tabular-nums text-slate-500">{a.progress}%</span>
                        </div>
                      </td>
                      <td className={cn(td, 'tabular-nums text-slate-700')}>{a.expected}</td>
                      <td className={cn(td, 'tabular-nums text-slate-700')}>{a.detected}</td>
                      <td className={cn(td, 'tabular-nums')}>{a.unexpected ? <span className="font-semibold text-amber-600">{a.unexpected}</span> : <span className="text-slate-300">—</span>}</td>
                      <td className={cn(td, 'tabular-nums')}>{a.missing ? <span className="font-semibold text-health-critical">{a.missing}</span> : <span className="text-slate-300">—</span>}</td>
                      <td className={cn(td, 'text-slate-600')}>{a.owner}</td>
                      <td className={cn(td, 'text-slate-600')}>{a.approver ?? <span className="text-slate-300">Unsigned</span>}</td>
                      <td className={cn(td, 'text-xs text-slate-500')}>{formatDate(a.dueAt)}</td>
                    </tr>
                  ))}
                </tbody>
              </TableShell>
            )}
          </Panel>
        </div>
      )}

      {/* ══ EXCEPTIONS ═════════════════════════════════════════════════════════ */}
      {tab === 'exceptions' && (
        <Panel
          padded={false} title="Exception queue"
          subtitle="Every unexplained difference between the book and the building, including tags we cannot name"
        >
          <div className="flex flex-wrap items-center gap-2 border-b border-slate-200 p-3">
            <ChipFilter
              value={queueKind} onChange={setQueueKind}
              options={[
                { key: 'all' as const, label: 'All', count: liveQueue.length },
                ...[...kindCounts.entries()].map(([k, c]) => ({
                  key: k, label: k, count: c,
                  tone: (k === 'Missing' || k === 'Ghost' ? 'red' : k === 'Unidentified' || k === 'Unexpected' ? 'amber' : 'slate') as Tone,
                })),
              ]}
            />
            <PillToggle on={showCleared} onClick={() => setShowCleared((v) => !v)} className="ml-auto">Show cleared</PillToggle>
          </div>

          {selected.size > 0 && (
            <div className="flex items-center gap-3 border-b border-primary-100 bg-primary-50 px-4 py-2 text-sm">
              <span className="font-medium text-primary-700">{selected.size} selected</span>
              {(['Assign', 'Resolve'] as const).map((a) => (
                <button key={a} onClick={() => bulk(a)} className="rounded-md px-2.5 py-1 text-xs font-medium text-primary-700 hover:bg-primary-100">
                  {a === 'Assign' ? 'Assign to me' : 'Resolve'}
                </button>
              ))}
              <button onClick={() => setSelected(new Set())} className="ml-auto text-xs text-slate-500 hover:text-slate-800">Clear</button>
            </div>
          )}

          {filteredQueue.length === 0 ? (
            <EmptyState icon="✅" title="Nothing in the queue" description="Every detection in this scope matches a record." />
          ) : (
            <TableShell>
              <thead className="sticky top-0 z-10 border-b border-slate-200 bg-slate-50">
                <tr>
                  <th className={cn(th, 'w-10')}>
                    <input
                      type="checkbox" aria-label="Select all exceptions" className="accent-primary-600"
                      checked={filteredQueue.every((r) => selected.has(r.id))}
                      onChange={(e) => setSelected(e.target.checked ? new Set(filteredQueue.map((r) => r.id)) : new Set())}
                    />
                  </th>
                  {['Item', 'Where', 'Detected', 'Severity', 'State', 'Value'].map((h) => <th key={h} className={th}>{h}</th>)}
                  <th className={cn(th, 'min-w-[240px]')}>Recommendation</th>
                  <th className={cn(th, 'text-right')}>Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filteredQueue.map((r) => (
                  <tr key={r.id} className={cn('transition-colors hover:bg-slate-50', isCleared(r) && 'opacity-55')}>
                    <td className={td}>
                      <input
                        type="checkbox" aria-label={`Select ${r.title}`} className="accent-primary-600" checked={selected.has(r.id)}
                        onChange={() => setSelected((prev) => {
                          const n = new Set(prev);
                          if (n.has(r.id)) n.delete(r.id); else n.add(r.id);
                          return n;
                        })}
                      />
                    </td>
                    <td className={td}>
                      <div className="flex flex-wrap items-center gap-1.5">
                        <Chip tone={r.kind === 'Unidentified' ? 'amber' : r.kind === 'Missing' || r.kind === 'Ghost' ? 'red' : 'slate'}>{r.kind}</Chip>
                        <span className="font-medium text-slate-900">{r.title}</span>
                      </div>
                      <div className="mt-0.5 text-xs text-slate-400">{r.id} · {r.ident}</div>
                    </td>
                    <td className={td}>
                      <div className="text-slate-700">{r.room}</div>
                      <div className="text-xs text-slate-400">{r.facility}</div>
                    </td>
                    <td className={cn(td, 'text-xs text-slate-500')}>{ago(r.at)}</td>
                    <td className={td}><Chip tone={SEVERITY_TONE[r.severity]}>{r.severity}</Chip></td>
                    <td className={td}>
                      <div className="text-sm text-slate-700">{r.state}</div>
                      {r.owner && <div className="text-xs text-slate-400">{r.owner}</div>}
                    </td>
                    <td className={cn(td, 'tabular-nums text-slate-700')}>{r.valueInr ? formatMoney(r.valueInr) : <span className="text-slate-300">—</span>}</td>
                    <td className={cn(td, 'max-w-[300px]')}>
                      <p className="whitespace-normal text-xs text-primary-700">→ {r.recommendation}</p>
                      {r.suggestion && (
                        <div className="mt-1.5 rounded-md bg-slate-50 px-2 py-1.5">
                          <p className="whitespace-normal text-[11px] text-slate-600">Best match: {r.suggestion}</p>
                          {r.confidence !== undefined && (
                            <div className="mt-1 flex items-center gap-2">
                              <Meter value={r.confidence} tone={scoreTone(r.confidence, 85, 60)} height="h-1" className="w-16" />
                              <span className="text-[10px] tabular-nums text-slate-500">{r.confidence}% confidence</span>
                            </div>
                          )}
                        </div>
                      )}
                    </td>
                    <td className={cn(td, 'text-right')}>
                      {isCleared(r) ? (
                        <span className="text-xs text-slate-300">Cleared</span>
                      ) : r.source === 'unknown' ? (
                        <span className="inline-flex flex-wrap justify-end gap-1.5">
                          {r.suggestion && <Button size="sm" onClick={() => workUnknown(r, 'Matched')}>Accept match</Button>}
                          <Button size="sm" variant="outline" onClick={() => workUnknown(r, 'Registered')}>Register</Button>
                          <Button size="sm" variant="ghost" onClick={() => workUnknown(r, 'Ignored')}>Ignore</Button>
                        </span>
                      ) : (
                        <span className="inline-flex flex-wrap justify-end gap-1.5">
                          <Button size="sm" variant="outline" onClick={() => workException(r, 'Assign')}>Assign</Button>
                          <Button size="sm" onClick={() => workException(r, 'Resolve')}>Resolve</Button>
                        </span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </TableShell>
          )}
        </Panel>
      )}

      {/* ── Room detail ─────────────────────────────────────────────────────── */}
      <Drawer
        open={!!room} onClose={() => setRoomId(null)} width="max-w-3xl"
        title={room?.name ?? ''}
        subtitle={room ? `${room.facility} · ${room.kind} · ${room.custodian}` : undefined}
        eyebrow={room && (
          <>
            <Chip tone="slate">{room.id}</Chip>
            <Chip tone={room.autoVerify ? 'emerald' : 'slate'} dot>{room.autoVerify ? 'Continuous verification' : 'Verified on demand'}</Chip>
            {room.missing > 0 && <Chip tone="red">{room.missing} missing</Chip>}
            {room.unexpected > 0 && <Chip tone="amber">{room.unexpected} unexpected</Chip>}
          </>
        )}
        footer={room && (
          <>
            <Button onClick={() => verifyRoom(room)}>✅ Verify now</Button>
            <Button
              variant="outline"
              onClick={() => {
                setAuditScope(room.name); setRoomId(null); setTab('audits');
                toast({ title: 'Audit scope set', description: `${room.name} is ready to count`, tone: 'info' });
              }}
            >
              📋 Start an audit here
            </Button>
            <Button variant="ghost" aria-pressed={room.autoVerify} onClick={() => toggleAutoVerify(room)}>
              {room.autoVerify ? 'Turn continuous verification off' : 'Turn continuous verification on'}
            </Button>
          </>
        )}
      >
        {room && (
          <>
            <div className="flex items-center gap-4">
              <Donut value={Math.round(room.accuracy)} label="accuracy" />
              <div className="min-w-0 flex-1">
                <SplitMeter matched={room.detected - room.unexpected} missing={room.missing} unexpected={room.unexpected} total={room.expected} />
                <div className="mt-3">
                  <VarianceStats expected={room.expected} detected={room.detected} unexpected={room.unexpected} missing={room.missing} />
                </div>
              </div>
            </div>

            <dl className="mt-4 divide-y divide-slate-100 border-t border-slate-100">
              <Field label="Last verified">{ago(room.lastVerified)}</Field>
              <Field label="Custodian">{room.custodian}</Field>
              <Field label="Verification">{room.autoVerify ? 'Continuous — the room re-counts itself' : 'On demand — someone has to ask'}</Field>
              <Field label="Racks monitored">{roomRacks.length || '—'}</Field>
            </dl>

            {roomRacks.length > 0 && (
              <section className="mt-5">
                <div className="flex items-end justify-between gap-2">
                  <h3 className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">Rack monitoring</h3>
                  <span className="text-[11px] text-slate-400">{roomRacks.length} racks · 42U each · hover a slot</span>
                </div>
                <div className="mt-2 flex gap-2 overflow-x-auto pb-1">
                  {roomRacks.map((k) => <RackColumn key={k.id} rack={k} />)}
                </div>
                <div className="mt-2.5 flex flex-wrap gap-x-4 gap-y-1.5 text-[11px] text-slate-500">
                  {(Object.keys(SLOT_LABEL) as RackSlotState[]).map((s) => (
                    <span key={s} className="inline-flex items-center gap-1.5">
                      <span className={cn('h-2.5 w-2.5 rounded-full', SLOT_FILL[s])} />{SLOT_LABEL[s]}
                    </span>
                  ))}
                </div>
              </section>
            )}

            <section className="mt-5">
              <h3 className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">Open exceptions here</h3>
              {roomExceptions.length === 0 ? (
                <p className="mt-2 rounded-lg bg-slate-50 px-3 py-2.5 text-xs text-slate-500">Nothing unexplained in this room.</p>
              ) : (
                <ul className="mt-2 space-y-2">
                  {roomExceptions.map((q) => (
                    <li key={q.id} className="rounded-lg border border-slate-200 p-2.5">
                      <div className="flex flex-wrap items-center gap-1.5">
                        <Chip tone={SEVERITY_TONE[q.severity]}>{q.kind}</Chip>
                        <span className="text-sm font-medium text-slate-800">{q.title}</span>
                      </div>
                      <p className="mt-1 text-xs text-primary-700">→ {q.recommendation}</p>
                    </li>
                  ))}
                </ul>
              )}
            </section>
          </>
        )}
      </Drawer>

      {/* ── Audit detail & sign-off ─────────────────────────────────────────── */}
      <Drawer
        open={!!audit} onClose={() => setAuditId(null)}
        title={audit?.name ?? ''}
        subtitle={audit ? `${audit.facility} · ${audit.scope} · owned by ${audit.owner}` : undefined}
        eyebrow={audit && (
          <>
            <Chip tone="slate">{audit.id}</Chip>
            <Chip tone={AUDIT_TONE[audit.state]} dot>{audit.state}</Chip>
            <Chip tone="primary">{audit.method} count</Chip>
          </>
        )}
        footer={audit && (audit.state === 'Review' ? (
          <>
            <Button onClick={() => void signOff(audit, true)}>✅ Approve variance</Button>
            <Button variant="outline" onClick={() => void signOff(audit, false)}>↩️ Reject and re-count</Button>
          </>
        ) : (
          <>
            <span className="text-xs text-slate-500">
              {audit.approvedAt ? `Signed off by ${audit.approver} ${ago(audit.approvedAt)}` : 'Sign-off opens once the count reaches 100%'}
            </span>
            <Button
              variant="outline" className="ml-auto"
              onClick={() => toast({ title: 'Audit report queued', description: `${audit.name} → Export Center`, tone: 'success' })}
            >
              Export report
            </Button>
          </>
        ))}
      >
        {audit && (
          <>
            <div className="rounded-lg border border-slate-200 p-3">
              <div className="flex items-center justify-between gap-2">
                <span className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">Variance</span>
                <span className="text-xs tabular-nums text-slate-500">{audit.detected} of {audit.expected} counted</span>
              </div>
              <div className="mt-2">
                <SplitMeter
                  matched={Math.max(0, audit.detected - audit.unexpected)}
                  missing={audit.missing} unexpected={audit.unexpected} total={audit.expected}
                />
              </div>
              <div className="mt-3">
                <VarianceStats expected={audit.expected} detected={audit.detected} unexpected={audit.unexpected} missing={audit.missing} flat />
              </div>
            </div>

            <dl className="mt-4 divide-y divide-slate-100 border-t border-slate-100">
              <Field label="Progress">
                <span className="inline-flex items-center gap-2">
                  <Meter value={audit.progress} tone={audit.progress === 100 ? 'emerald' : 'primary'} className="w-24" />
                  <span className="tabular-nums">{audit.progress}%</span>
                </span>
              </Field>
              <Field label="Method">{audit.method}</Field>
              <Field label="Owner">{audit.owner}</Field>
              <Field label="Approver">{audit.approver ?? 'Not signed off'}</Field>
              <Field label="Due">{formatDate(audit.dueAt)} · {relTime(audit.dueAt)}</Field>
              {audit.note && <Field label="Note">{audit.note}</Field>}
            </dl>

            {audit.state === 'Review' && (
              <div className="mt-4 rounded-lg border border-amber-200 bg-amber-50 p-3">
                <p className="text-sm font-medium text-amber-900">This count needs a signature.</p>
                <p className="mt-0.5 text-xs text-amber-800">
                  Approving accepts {audit.missing} missing and {audit.unexpected} unexpected units against the book and
                  stamps your name on the record. Rejecting sends it back to {audit.owner} for a full re-count.
                </p>
              </div>
            )}

            <section className="mt-5">
              <h3 className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">Lifecycle</h3>
              <div className="mt-2.5"><TimelineRail items={auditTimeline(audit)} /></div>
            </section>
          </>
        )}
      </Drawer>
    </div>
  );
}
