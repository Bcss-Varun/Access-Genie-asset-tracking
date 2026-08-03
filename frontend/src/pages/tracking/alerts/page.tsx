// ─────────────────────────────────────────────────────────────────────────────
// MODULE 4 — Alerts & Incidents
//
// One action center. Whatever raised the signal — a presence monitor, a zone
// policy, an audit pass, a device heartbeat — it becomes an alert on one
// lifecycle:
//
//   New → Acknowledged → Assigned → In Progress → Resolved → Closed
//                   └──────── Escalated ────────┘
//
// The screen exists to *move work through* that lifecycle, not to display it.
// Every action applies locally first — acknowledging an alert visibly moves it
// out of the New bucket and every count above it changes with it — and is
// persisted behind that, so the colleague sharing the queue sees it too.
//
//   What must a person do next?      → Action queue (breached first, then priority)
//   Which alerts are one event?      → Incidents
//   Why am I being told this?        → Rules & escalation
//   Is the noise getting better?     → Analytics
// ─────────────────────────────────────────────────────────────────────────────

import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { EmptyState, PageHeader } from '@/components/ui/primitives';
import { Button } from '@/components/ui/Button';
import { useSession } from '@/components/providers/SessionProvider';
import { useToast } from '@/components/providers/ToastProvider';
import { automationApi, incidentsApi, trackingAlertsApi, type AlertTransition } from '@/api/tracking-ops';
import { useMutate } from '@/api/mutate';
import {
  Drawer, Field, LiveStamp, ScopePicker, Tabs, TimelineRail, useFacilityScope, useTabs,
} from '@/components/tracking/shell';
import {
  BarStrip, Chip, ChipFilter, Donut, FilterSelect, Meter, Panel, PriorityPill, StatTile,
  TableShell, lifecycleTone, td, th,
} from '@/components/tracking/bits';
import {
  OPEN_ALERT_STATES, PRIORITY_RANK, alertById, alertsForFacility, automationRules,
  facilityBySlug, incidentById, incidents, isOpenAlert, trackingAlerts, trackingKpis,
} from '@/lib/tracking-data';
import type {
  AlertLifecycle, AlertPriority, AutomationRule, Incident, TrackingAlert, TrackingAlertCategory,
} from '@access-genie/shared';
import { nowMs, cn, formatMoney, relTime } from '@/lib/utils';

const TAB_KEYS = ['queue', 'incidents', 'automation', 'analytics'] as const;

  const overdueNow = (a: TrackingAlert) => isOpenAlert(a) && (a.slaBreached || slaMs(a) < 0);

type TabKey = (typeof TAB_KEYS)[number];

/** The queue buckets by lifecycle, plus the two roll-ups people actually ask for. */
type StateFilter = 'all' | 'open' | AlertLifecycle;

const PRIORITIES: readonly ('All' | AlertPriority)[] = ['All', 'P1', 'P2', 'P3', 'P4'];

type AlertAction = 'ack' | 'assign' | 'escalate' | 'resolve';
// Typed as `AlertTransition` rather than `AlertLifecycle`: these four buttons
// are the only lifecycle moves the queue offers, and the API accepts exactly
// that set — so a fifth action cannot be added here without the server agreeing.
const ACTION_STATE: Record<AlertAction, AlertTransition> = {
  ack: 'Acknowledged', assign: 'Assigned', escalate: 'Escalated', resolve: 'Resolved',
};
const ACTION_LABEL: Record<AlertAction, string> = {
  ack: 'Acknowledge', assign: 'Assign to me', escalate: 'Escalate', resolve: 'Resolve',
};
const ACTION_NOTE: Record<AlertAction, string> = {
  ack: 'Acknowledged from the action queue', assign: 'Taken by the current operator',
  escalate: 'Escalated for a faster response', resolve: 'Resolved from the action queue',
};

const CATEGORY_ICON: Record<TrackingAlertCategory, string> = {
  'Missing Asset': '🚩', 'Unauthorized Movement': '🚪', 'Inventory Mismatch': '📋',
  'Unknown Tag': '❓', 'Battery Low': '🔋', 'Gateway Offline': '📡', 'Reader Offline': '📡',
  'Tracking Failure': '📉', 'Duplicate Tag': '👯', 'Asset Removed': '📦', 'Geofence Violation': '⛔',
};

/** Same 00:00 IST anchor the tracking KPIs use, so "today" means one thing. */
const DAY_START = nowMs() - 9 * 3_600_000;
const NOW_ISO = new Date(nowMs()).toISOString();

function dur(ms: number): string {
  const m = Math.max(0, Math.round(ms / 60_000));
  if (m < 60) return `${m}m`;
  const h = Math.floor(m / 60);
  if (h < 24) return m % 60 ? `${h}h ${m % 60}m` : `${h}h`;
  const d = Math.floor(h / 24);
  return h % 24 ? `${d}d ${h % 24}h` : `${d}d`;
}
const mean = (xs: number[]) => (xs.length ? xs.reduce((s, x) => s + x, 0) / xs.length : 0);

const slaMs = (a: TrackingAlert) => Date.parse(a.slaDueAt) - nowMs();
/** Only open work can be overdue — a closed alert missed its target, it is not late. */

const severityTone = (s: Incident['severity']) => (s === 'Sev1' ? 'red' : s === 'Sev2' ? 'amber' : 'slate');
const incidentTone = (s: Incident['state']) =>
  s === 'Open' ? 'red' : s === 'Investigating' ? 'primary' : s === 'Contained' ? 'amber' : s === 'Resolved' ? 'emerald' : 'slate';

function timelineTone(action: string): 'good' | 'warn' | 'bad' | 'info' {
  const s = action.toLowerCase();
  if (s.includes('escalat')) return 'bad';
  if (s.includes('resolv') || s.includes('closed')) return 'good';
  return s.includes('raised') ? 'warn' : 'info';
}

/**
 * Channels are carried inside each rule's `then` sentences, so we read them back
 * out rather than storing them twice — the table and the panel can then never
 * disagree about who gets woken up.
 */
function channelsFor(rule: AutomationRule): string[] {
  const text = rule.then.join(' ').toLowerCase();
  const out: string[] = [];
  if (text.includes('sms')) out.push('SMS');
  if (text.includes('email')) out.push('Email');
  if (text.includes('in-app') || text.includes('notify')) out.push('In-app');
  return out.length ? out : ['In-app'];
}

function SlaCell({ alert }: { alert: TrackingAlert }) {
  if (!isOpenAlert(alert)) {
    return (
      <span className={cn('text-xs font-medium', alert.slaBreached ? 'text-health-critical' : 'text-slate-400')}>
        {alert.slaBreached ? 'Target missed' : 'Met'}
      </span>
    );
  }
  const left = slaMs(alert);
  if (overdueNow(alert)) return <span className="text-xs font-semibold tabular-nums text-health-critical">Overdue by {dur(-left)}</span>;
  return (
    <span className={cn('text-xs tabular-nums', left < 2 * 3_600_000 ? 'font-medium text-amber-600' : 'text-slate-500')}>
      {dur(left)} left
    </span>
  );
}

/** The fields an operator may change in-session. Everything else stays as authored. */
type AlertPatch = Partial<Pick<TrackingAlert, 'state' | 'assignee' | 'ackAt' | 'resolvedAt' | 'incidentId' | 'timeline'>>;

export default function TrackingAlertsPage() {
  // Derived per render: the dataset is fetched, so a value computed once at
  // module scope would never see a refetch.
    const STATE_FILTERS: StateFilter[] = ['all', 'open', ...OPEN_ALERT_STATES, 'Resolved', 'Closed'];

  const { session } = useSession();
  const { toast } = useToast();
  const { run } = useMutate();
  const [scope, setScope] = useFacilityScope();
  const [tab, setTab] = useTabs<TabKey>(TAB_KEYS, 'queue');

  const [patches, setPatches] = useState<Record<string, AlertPatch>>({});
  const [incidentStates, setIncidentStates] = useState<Record<string, Incident['state']>>({});
  const [createdIncidents, setCreatedIncidents] = useState<Incident[]>([]);
  const [ruleOverrides, setRuleOverrides] = useState<Record<string, boolean>>({});

  const [stateFilter, setStateFilter] = useState<StateFilter>('open');
  const [category, setCategory] = useState('All');
  const [priority, setPriority] = useState<string>('All');
  const [overdueOnly, setOverdueOnly] = useState(false);
  const [search, setSearch] = useState('');
  const [selected, setSelected] = useState<Set<string>>(new Set());

  const [openAlertId, setOpenAlertId] = useState<string | null>(null);
  const [openIncidentId, setOpenIncidentId] = useState<string | null>(null);
  const [openRuleId, setOpenRuleId] = useState<string | null>(null);

  // Deep links from the Dashboard and the retired routes land here. The query
  // string is read after mount, never during render, so the server and the
  // first client render always agree — which is exactly why this one effect
  // has to set state.
  useEffect(() => {
    const p = new URLSearchParams(window.location.search);
    const a = p.get('alert');
    if (a && alertById(a)) setOpenAlertId(a);
    const i = p.get('incident');
    if (i && incidentById(i)) { setOpenIncidentId(i); if (!p.get('tab')) setTab('incidents'); }
    const s = p.get('state');
    if (s && (STATE_FILTERS as string[]).includes(s)) setStateFilter(s as StateFilter);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── Live data: authored alerts with this session's edits laid over the top ──

  const allAlerts = useMemo(() => trackingAlerts.map((a) => ({ ...a, ...patches[a.id] })), [patches]);
  const liveById = useMemo(() => new Map(allAlerts.map((a) => [a.id, a])), [allAlerts]);
  const scoped = useMemo(() => {
    const ids = new Set(alertsForFacility(scope).map((a) => a.id));
    return allAlerts.filter((a) => ids.has(a.id));
  }, [allAlerts, scope]);

  const facilityName = useMemo(() => (scope === 'all' ? null : facilityBySlug(scope)?.name ?? null), [scope]);
  const allIncidents = useMemo(
    () => [...createdIncidents, ...incidents].map((i) => ({ ...i, state: incidentStates[i.id] ?? i.state })),
    [createdIncidents, incidentStates],
  );
  const scopedIncidents = useMemo(
    () => allIncidents.filter((i) => !facilityName || i.facility === facilityName),
    [allIncidents, facilityName],
  );
  const openIncidents = scopedIncidents.filter((i) => i.state !== 'Resolved' && i.state !== 'Closed');

  const openAlerts = useMemo(() => scoped.filter(isOpenAlert), [scoped]);
  const overdueAlerts = openAlerts.filter(overdueNow);
  const p1Alerts = openAlerts.filter((a) => a.priority === 'P1');
  const resolvedAlerts = scoped.filter((a) => a.state === 'Resolved');
  const resolvedToday = scoped.filter((a) => a.resolvedAt && Date.parse(a.resolvedAt) >= DAY_START);

  const ackDurations = useMemo(
    () => scoped.flatMap((a) => (a.ackAt ? [Date.parse(a.ackAt) - Date.parse(a.raisedAt)] : [])), [scoped]);
  const resolveDurations = useMemo(
    () => scoped.flatMap((a) => (a.resolvedAt ? [Date.parse(a.resolvedAt) - Date.parse(a.raisedAt)] : [])), [scoped]);

  // The authored baseline, so the strip can show what this session cleared.
  const baseline = useMemo(() => trackingKpis(scope), [scope]);
  const cleared = Math.max(0, baseline.openAlerts - openAlerts.length);

  // ── Queue filtering ────────────────────────────────────────────────────────

  const categories = useMemo(() => ['All', ...Array.from(new Set(scoped.map((a) => a.category))).sort()], [scoped]);

  const base = useMemo(() => {
    const q = search.trim().toLowerCase();
    return scoped.filter((a) => {
      if (category !== 'All' && a.category !== category) return false;
      if (priority !== 'All' && a.priority !== priority) return false;
      if (overdueOnly && !overdueNow(a)) return false;
      const hay = `${a.id} ${a.title} ${a.summary} ${a.assetName ?? ''} ${a.location} ${a.source} ${a.assignee ?? ''} ${a.team}`;
      return !q || hay.toLowerCase().includes(q);
    });
  }, [scoped, search, category, priority, overdueOnly]);

  const stateCounts = useMemo(() => {
    const out: Record<string, number> = {};
    for (const f of STATE_FILTERS) {
      out[f] = f === 'all' ? base.length
        : f === 'open' ? base.filter(isOpenAlert).length
          : base.filter((a) => a.state === f).length;
    }
    return out;
  }, [base]);

  const rows = useMemo(() => {
    const list = base.filter((a) =>
      stateFilter === 'all' ? true : stateFilter === 'open' ? isOpenAlert(a) : a.state === stateFilter);
    return list.sort((a, b) => {
      const ao = overdueNow(a), bo = overdueNow(b);
      if (ao !== bo) return ao ? -1 : 1;
      const pr = PRIORITY_RANK[a.priority] - PRIORITY_RANK[b.priority];
      return pr !== 0 ? pr : Date.parse(a.raisedAt) - Date.parse(b.raisedAt);
    });
  }, [base, stateFilter]);

  const allRowsSelected = rows.length > 0 && rows.every((r) => selected.has(r.id));
  const toggleRow = (id: string) => setSelected((prev) => {
    const n = new Set(prev);
    if (n.has(id)) n.delete(id); else n.add(id);
    return n;
  });
  const toggleAllRows = () => setSelected((prev) => {
    const n = new Set(prev);
    rows.forEach((r) => (allRowsSelected ? n.delete(r.id) : n.add(r.id)));
    return n;
  });

  const focusQueue = (o: { state?: StateFilter; priority?: string; category?: string; overdue?: boolean; q?: string }) => {
    setTab('queue');
    setStateFilter(o.state ?? 'open');
    setPriority(o.priority ?? 'All');
    setCategory(o.category ?? 'All');
    setOverdueOnly(o.overdue ?? false);
    setSearch(o.q ?? '');
    setOpenAlertId(null);
    setOpenRuleId(null);
  };

  // ── Lifecycle actions ──────────────────────────────────────────────────────
  // Optimistic, then persisted: an operator clearing a night's backlog should
  // not wait for a round trip per alert. The local patch is what the screen
  // renders; the write behind it is what the colleague on the same queue sees.

  const act = async (ids: string[], action: AlertAction) => {
    const actor = session.user.name;
    const state = ACTION_STATE[action];
    const targets = ids
      .flatMap((id) => { const a = liveById.get(id); return a ? [a] : []; })
      .filter((a) => a.state !== state)
      .filter((a) => action === 'resolve' || (a.state !== 'Resolved' && a.state !== 'Closed'));

    if (targets.length === 0) {
      toast({ title: 'Nothing to change', description: `Everything selected is already ${state.toLowerCase()} or closed.`, tone: 'info' });
      return;
    }

    const previous = patches;
    setPatches((prev) => {
      const next = { ...prev };
      for (const a of targets) {
        next[a.id] = {
          ...next[a.id],
          state,
          assignee: action === 'assign' ? actor : a.assignee,
          ackAt: action === 'ack' ? a.ackAt ?? NOW_ISO : a.ackAt,
          resolvedAt: action === 'resolve' ? NOW_ISO : a.resolvedAt,
          timeline: [...a.timeline, { at: NOW_ISO, actor, action: state, note: ACTION_NOTE[action] }],
        };
      }
      return next;
    });

    const ids4 = targets.slice(0, 4).map((a) => a.id).join(', ');
    await run(trackingAlertsApi.transitionMany(targets.map((a) => a.id), state, ACTION_NOTE[action]), {
      success: `${targets.length} alert${targets.length > 1 ? 's' : ''} ${state.toLowerCase()}`,
      successDetail: action === 'assign' ? `Now owned by ${actor}` : ids4 + (targets.length > 4 ? ` +${targets.length - 4} more` : ''),
      describe: `${ACTION_LABEL[action].toLowerCase()} ${targets.length > 1 ? 'those alerts' : 'that alert'}`,
      rollback: () => setPatches(previous),
      refreshTracking: true,
    });
  };

  /** Several alerts that are really one event become an incident with a commander. */
  const createIncidentFromSelection = async () => {
    const chosen = Array.from(selected).flatMap((id) => { const a = liveById.get(id); return a ? [a] : []; });
    // An alert belongs to one narrative. Silently re-pointing an alert that is
    // already part of INC-4401 would rewrite that investigation's evidence, so
    // linked alerts are left where they are and the operator is told.
    const picked = chosen.filter((a) => !a.incidentId);
    const alreadyLinked = chosen.length - picked.length;
    if (picked.length === 0) {
      toast({
        title: 'Nothing to link',
        description: alreadyLinked
          ? `${alreadyLinked} of the selected alerts already belong to an incident — unlink them first`
          : 'Select the alerts that are one event',
        tone: 'info',
      });
      return;
    }
    const rank = Math.min(...picked.map((a) => PRIORITY_RANK[a.priority]));
    const severity = rank === 0 ? 'Sev1' : rank === 1 ? 'Sev2' : 'Sev3';

    // The incident id comes back from the server: it is the handle every linked
    // alert, every audit row and every later handover refers to, so guessing it
    // from a local counter would mint the same id twice on two operators'
    // screens and point the two investigations at each other.
    const incident = await run(
      incidentsApi.open({
        title: `${picked[0].category} — ${picked.length} linked alert${picked.length > 1 ? 's' : ''}`,
        severity,
        facility: picked[0].facility,
        alertIds: picked.map((a) => a.id),
        commander: session.user.name,
        summary: `Opened from the action queue by ${session.user.name}. ${picked.length} alerts were judged to be one event and now share a single narrative and a single owner.`,
        nextAction: 'Confirm containment, then work each linked alert to resolution',
      }),
      { describe: 'open that incident', refreshTracking: true },
    );

    if (!incident) return;

    setCreatedIncidents((prev) => [incident, ...prev]);
    setPatches((prev) => {
      const next = { ...prev };
      for (const a of picked) next[a.id] = { ...next[a.id], incidentId: incident.id };
      return next;
    });
    setSelected(new Set());
    setTab('incidents');
    setOpenIncidentId(incident.id);
    toast({
      title: `${incident.id} opened`,
      description: `${picked.length} alerts linked · ${severity} · commander ${session.user.name}`
        + (alreadyLinked ? ` · ${alreadyLinked} left on their existing incident` : ''),
      tone: 'success',
    });
  };

  const moveIncident = async (id: string, state: Incident['state']) => {
    const previous = incidentStates;
    setIncidentStates((prev) => ({ ...prev, [id]: state }));

    await run(incidentsApi.setState(id, state), {
      success: `${id} marked ${state.toLowerCase()}`,
      successDetail: state === 'Contained'
        ? 'Spread stopped — linked alerts stay open until each is worked'
        : 'Narrative closed for this event',
      describe: `move ${id}`,
      rollback: () => setIncidentStates(previous),
      refreshTracking: true,
    });
  };

  const ruleEnabled = (r: AutomationRule) => ruleOverrides[r.id] ?? r.enabled;
  const toggleRule = async (r: AutomationRule) => {
    const next = !ruleEnabled(r);
    const previous = ruleOverrides;
    setRuleOverrides((prev) => ({ ...prev, [r.id]: next }));

    await run(automationApi.toggle(r.id, next), {
      success: next ? `${r.name} enabled` : `${r.name} paused`,
      successDetail: next
        ? `Matches now raise ${r.priority} to ${r.assignTeam}`
        : 'Matching signals will stop raising alerts',
      describe: `${next ? 'enable' : 'pause'} that rule`,
      rollback: () => setRuleOverrides(previous),
      refreshTracking: true,
    });
  };

  // ── Analytics, derived from the alerts in scope — nothing invented ─────────

  const categoryStats = useMemo(() => {
    const m = new Map<TrackingAlertCategory, { open: number; done: number }>();
    for (const a of scoped) {
      const e = m.get(a.category) ?? { open: 0, done: 0 };
      if (isOpenAlert(a)) e.open += 1; else e.done += 1;
      m.set(a.category, e);
    }
    return Array.from(m, ([key, v]) => ({ key, ...v, total: v.open + v.done }))
      .sort((a, b) => b.total - a.total || a.key.localeCompare(b.key));
  }, [scoped]);

  const sourceStats = useMemo(() => {
    const m = new Map<string, number>();
    for (const a of scoped) m.set(a.source, (m.get(a.source) ?? 0) + 1);
    return Array.from(m, ([key, count]) => ({ key, count }))
      .sort((a, b) => b.count - a.count || a.key.localeCompare(b.key)).slice(0, 5);
  }, [scoped]);

  // Compliance is only meaningful once the response window has actually elapsed.
  const elapsed = scoped.filter((a) => Date.parse(a.slaDueAt) <= nowMs());
  const onTarget = elapsed.filter((a) => !a.slaBreached).length;
  const slaCompliance = elapsed.length ? Math.round((onTarget / elapsed.length) * 100) : 100;

  const firedToday = automationRules.reduce((s, r) => s + r.firedToday, 0);
  const suppressedToday = automationRules.reduce((s, r) => s + r.suppressedToday, 0);

  const drawerAlert = openAlertId ? liveById.get(openAlertId) ?? null : null;
  const drawerIncident = openIncidentId ? allIncidents.find((i) => i.id === openIncidentId) ?? null : null;
  // An incident narrative only moves forward: offering "Contain" on something
  // already closed would toast a change that never happened.
  const incidentSettled = drawerIncident?.state === 'Resolved' || drawerIncident?.state === 'Closed';
  const drawerRule = openRuleId ? automationRules.find((r) => r.id === openRuleId) ?? null : null;

  return (
    <div className="space-y-5 pb-4">
      <PageHeader
        title="Alerts & Incidents"
        subtitle="One queue, one lifecycle. Everything the estate raises ends here and leaves through a person."
        breadcrumb={[{ label: 'Asset Tracking', href: '/tracking' }, { label: 'Alerts & Incidents' }]}
        actions={
          <>
            <LiveStamp />
            <ScopePicker value={scope} onChange={setScope} />
            <Button variant="outline" onClick={() => toast({ title: 'Alert digest queued', description: `${openAlerts.length} open alerts → Export Center`, tone: 'success' })}>
              Export digest
            </Button>
          </>
        }
      />

      {/* ── KPI strip — every tile drills into the view that acts on it ──────── */}
      <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
        <StatTile
          label="Open" value={openAlerts.length} tone={p1Alerts.length ? 'red' : openAlerts.length ? 'amber' : 'emerald'}
          sub={cleared > 0 ? `${cleared} cleared` : `of ${scoped.length} raised in scope`}
          active={tab === 'queue' && stateFilter === 'open' && !overdueOnly && priority === 'All'}
          onClick={() => focusQueue({ state: 'open' })}
        />
        <StatTile
          label="Critical (P1)" value={p1Alerts.length} tone={p1Alerts.length ? 'red' : 'emerald'}
          sub={p1Alerts.length ? 'need a decision now' : 'nothing critical open'}
          onClick={() => focusQueue({ state: 'open', priority: 'P1' })}
        />
        <StatTile
          label="Response overdue" value={overdueAlerts.length} tone={overdueAlerts.length ? 'red' : 'emerald'}
          sub="past their response target" active={overdueOnly}
          onClick={() => focusQueue({ state: 'open', overdue: true })}
        />
        <StatTile
          label="Open incidents" value={openIncidents.length} tone={openIncidents.length ? 'amber' : 'emerald'}
          sub={`${formatMoney(openIncidents.reduce((s, i) => s + i.valueAtRiskInr, 0))} at risk`}
          onClick={() => { setTab('incidents'); setOpenIncidentId(null); }}
        />
        {/* Counts every resolved alert in scope, because that is what clicking it
            shows. The since-midnight figure is the sub-line rather than the value —
            a tile whose number disagrees with the list it opens is worse than no tile. */}
        <StatTile
          label="Resolved" value={resolvedAlerts.length} tone="emerald"
          sub={`${resolvedToday.length} since 00:00 IST`}
          onClick={() => focusQueue({ state: 'Resolved' })}
        />
        <StatTile
          label="Mean time to ack" value={ackDurations.length ? dur(mean(ackDurations)) : '—'}
          sub={`across ${ackDurations.length} acknowledged`} onClick={() => setTab('analytics')}
        />
      </div>

      <Tabs
        tabs={[
          { key: 'queue', label: 'Action queue', count: openAlerts.length, tone: overdueAlerts.length ? 'red' : 'amber' },
          { key: 'incidents', label: 'Incidents', count: openIncidents.length, tone: 'amber' },
          { key: 'automation', label: 'Rules & escalation' },
          { key: 'analytics', label: 'Analytics' },
        ]}
        value={tab}
        onChange={setTab}
      />

      {/* ══ ACTION QUEUE ═══════════════════════════════════════════════════════ */}
      {tab === 'queue' && (
        <Panel
          title="Action queue"
          subtitle="Breached response targets first, then priority, then age — worked top down."
          padded={false}
          actions={<span className="text-xs tabular-nums text-slate-400">{rows.length} of {scoped.length}</span>}
        >
          <div className="space-y-3 border-b border-slate-200 p-3">
            <ChipFilter<StateFilter>
              value={stateFilter}
              onChange={setStateFilter}
              options={STATE_FILTERS.map((f) => ({
                key: f,
                label: f === 'all' ? 'All' : f === 'open' ? 'Open' : f,
                count: stateCounts[f] ?? 0,
                tone: f === 'all' || f === 'open' ? undefined : lifecycleTone[f],
              }))}
            />
            <div className="flex flex-wrap items-center gap-2">
              <input
                value={search} onChange={(e) => setSearch(e.target.value)}
                placeholder="Search title, asset, location, owner…" aria-label="Search alerts"
                className="w-64 max-w-full rounded-md bg-slate-100 px-3 py-1.5 text-sm outline-none focus:ring-2 focus:ring-primary-500"
              />
              <FilterSelect value={category} onChange={setCategory} options={categories} label="All categories" />
              <FilterSelect value={priority} onChange={setPriority} options={PRIORITIES} label="All priorities" />
              <button
                type="button" onClick={() => setOverdueOnly((v) => !v)} aria-pressed={overdueOnly}
                className={cn('rounded-md border px-3 py-1.5 text-xs font-medium transition-colors',
                  overdueOnly ? 'border-health-critical bg-red-50 text-health-critical' : 'border-slate-200 text-slate-500 hover:bg-slate-50')}
              >
                ⏱ Overdue only
              </button>
              {(search || category !== 'All' || priority !== 'All' || overdueOnly || stateFilter !== 'open') && (
                <button type="button" onClick={() => focusQueue({})} className="text-xs font-medium text-slate-400 hover:text-primary-700">Reset</button>
              )}
            </div>
          </div>

          {selected.size > 0 && (
            <div className="flex flex-wrap items-center gap-2 border-b border-primary-100 bg-primary-50 px-4 py-2 text-sm">
              <span className="font-medium text-primary-700">{selected.size} selected</span>
              <div className="flex flex-wrap items-center gap-1">
                {(Object.keys(ACTION_LABEL) as AlertAction[]).map((a) => (
                  <button key={a} type="button" onClick={() => void act(Array.from(selected), a)}
                    className="rounded-md px-2.5 py-1 text-xs font-medium text-primary-700 hover:bg-primary-100">
                    {ACTION_LABEL[a]}
                  </button>
                ))}
                <span className="mx-1 h-4 w-px bg-primary-200" aria-hidden />
                <button type="button" onClick={() => void createIncidentFromSelection()}
                  className="rounded-md border border-primary-200 bg-white px-2.5 py-1 text-xs font-semibold text-primary-700 hover:bg-primary-50">
                  🧭 Create incident from selected
                </button>
              </div>
              <button type="button" onClick={() => setSelected(new Set())} className="ml-auto text-xs text-slate-500 hover:text-slate-800">Clear</button>
            </div>
          )}

          {rows.length === 0 ? (
            <EmptyState
              variant="no-results" title="Nothing in this bucket"
              description="No alert in this scope matches the filters you have set."
              action={<Button variant="outline" onClick={() => focusQueue({ state: 'all' })}>Show every alert</Button>}
            />
          ) : (
            <TableShell>
              <thead className="border-b border-slate-200 bg-slate-50">
                <tr>
                  <th className="w-10 px-4 py-2.5">
                    <input type="checkbox" checked={allRowsSelected} onChange={toggleAllRows}
                      aria-label="Select every alert in view" className="accent-primary-600" />
                  </th>
                  <th className={th}>Pri</th>
                  <th className={th}>Category</th>
                  <th className={th}>Alert</th>
                  <th className={th}>State</th>
                  <th className={th}>Owner</th>
                  <th className={th}>Raised</th>
                  <th className={th}>Response target</th>
                  <th className={cn(th, 'text-right')}>Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {rows.map((a) => (
                  <tr key={a.id} onClick={() => setOpenAlertId(a.id)}
                    className={cn('cursor-pointer transition-colors hover:bg-slate-50', selected.has(a.id) && 'bg-primary-50/40')}>
                    <td className={td} onClick={(e) => e.stopPropagation()}>
                      <input type="checkbox" checked={selected.has(a.id)} onChange={() => toggleRow(a.id)}
                        aria-label={`Select ${a.id}`} className="accent-primary-600" />
                    </td>
                    <td className={td}><PriorityPill priority={a.priority} /></td>
                    <td className={cn(td, 'whitespace-nowrap text-xs text-slate-600')}>
                      <span className="mr-1.5" aria-hidden>{CATEGORY_ICON[a.category]}</span>{a.category}
                    </td>
                    <td className={cn(td, 'max-w-[26rem]')}>
                      <div className="flex items-center gap-2">
                        <span className="truncate text-sm font-medium text-slate-900">{a.title}</span>
                        {a.incidentId && <Chip tone="slate">{a.incidentId}</Chip>}
                      </div>
                      <p className="mt-0.5 truncate text-xs text-slate-500">
                        {a.assetName ? `${a.assetName} · ` : ''}{a.facility} · {a.location}
                      </p>
                    </td>
                    <td className={td}><Chip tone={lifecycleTone[a.state]} dot>{a.state}</Chip></td>
                    <td className={cn(td, 'whitespace-nowrap')}>
                      <div className="text-xs font-medium text-slate-700">{a.assignee ?? 'Unassigned'}</div>
                      <div className="text-[11px] text-slate-400">{a.team}</div>
                    </td>
                    <td className={cn(td, 'whitespace-nowrap text-xs tabular-nums text-slate-500')}>{relTime(a.raisedAt)}</td>
                    <td className={cn(td, 'whitespace-nowrap')}><SlaCell alert={a} /></td>
                    <td className={cn(td, 'text-right')} onClick={(e) => e.stopPropagation()}>
                      <button type="button" onClick={() => setOpenAlertId(a.id)} aria-label={`Open ${a.id}`}
                        className="text-xs font-semibold text-slate-400 hover:text-primary-600">Open →</button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </TableShell>
          )}
        </Panel>
      )}

      {/* ══ INCIDENTS ══════════════════════════════════════════════════════════ */}
      {tab === 'incidents' && (
        <Panel
          title="Incidents"
          subtitle="Alerts that are really one event, with one narrative and one commander."
          actions={<span className="text-xs tabular-nums text-slate-400">{openIncidents.length} open of {scopedIncidents.length}</span>}
        >
          {scopedIncidents.length === 0 ? (
            <EmptyState
              icon="🧭" title="No incidents in this scope"
              description="Select alerts in the action queue and group them when they turn out to be one event."
              action={<Button variant="outline" onClick={() => focusQueue({ state: 'open' })}>Go to the action queue</Button>}
            />
          ) : (
            <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
              {scopedIncidents.map((i) => (
                <button key={i.id} type="button" onClick={() => setOpenIncidentId(i.id)}
                  className="rounded-xl border border-slate-200 p-4 text-left transition-colors hover:border-primary-200 hover:bg-slate-50">
                  <div className="flex flex-wrap items-center gap-1.5">
                    <Chip tone={severityTone(i.severity)}>{i.severity}</Chip>
                    <Chip tone={incidentTone(i.state)} dot>{i.state}</Chip>
                    <span className="ml-auto text-[11px] tabular-nums text-slate-400">{i.id} · {relTime(i.openedAt)}</span>
                  </div>
                  <h3 className="mt-2 font-heading text-sm font-semibold text-slate-900">{i.title}</h3>
                  <p className="mt-1 line-clamp-2 text-xs text-slate-500">{i.summary}</p>
                  <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1 text-[11px] text-slate-500">
                    <span><span className="font-semibold tabular-nums text-slate-700">{i.alertIds.length}</span> linked alerts</span>
                    <span><span className="font-semibold tabular-nums text-slate-700">{i.assetsAffected}</span> assets affected</span>
                    <span><span className="font-semibold text-slate-700">{formatMoney(i.valueAtRiskInr)}</span> at risk</span>
                  </div>
                  <p className="mt-2 truncate text-xs text-primary-700">→ {i.nextAction}</p>
                  <p className="mt-1 text-[11px] text-slate-400">Commander {i.commander} · {i.facility}</p>
                </button>
              ))}
            </div>
          )}
        </Panel>
      )}

      {/* ══ RULES & ESCALATION ═════════════════════════════════════════════════ */}
      {tab === 'automation' && (
        <Panel
          title="Rules & escalation"
          subtitle="Every alert on this screen was raised by one of these sentences."
          padded={false}
          actions={<span className="text-xs tabular-nums text-slate-400">{automationRules.filter(ruleEnabled).length} of {automationRules.length} enabled</span>}
        >
          {/* Suppression is the number nobody asks for and everybody needs: it is
              the difference between a queue you read and a queue you ignore. */}
          <p className="border-b border-slate-200 bg-primary-50/50 px-4 py-2.5 text-xs text-primary-900">
            <span className="font-semibold tabular-nums">{suppressedToday}</span> duplicate signals were folded into alerts that were
            already open today. Without suppression this queue would have grown by{' '}
            <span className="font-semibold tabular-nums">{firedToday + suppressedToday}</span> rows instead of{' '}
            <span className="font-semibold tabular-nums">{firedToday}</span> — that ratio is what keeps people reading it.
          </p>
          <TableShell>
            <thead className="border-b border-slate-200 bg-slate-50">
              <tr>
                <th className={th}>Rule</th>
                <th className={th}>When…</th>
                <th className={th}>Then…</th>
                <th className={th}>Raises</th>
                <th className={th}>Escalates after</th>
                <th className={cn(th, 'text-right')}>Fired</th>
                <th className={cn(th, 'text-right')}>Suppressed</th>
                <th className={cn(th, 'text-right')}>Enabled</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {automationRules.map((r) => {
                const on = ruleEnabled(r);
                return (
                  <tr key={r.id} onClick={() => setOpenRuleId(r.id)}
                    className={cn('cursor-pointer align-top transition-colors hover:bg-slate-50', !on && 'opacity-55')}>
                    <td className={cn(td, 'max-w-[16rem]')}>
                      <div className="text-sm font-medium text-slate-900">{r.name}</div>
                      <div className="mt-0.5 text-[11px] text-slate-400"><span aria-hidden>{CATEGORY_ICON[r.category]}</span> {r.category}</div>
                    </td>
                    <td className={cn(td, 'max-w-[18rem] text-xs text-slate-600')}>{r.when}</td>
                    <td className={cn(td, 'max-w-[18rem]')}>
                      <div className="flex flex-wrap gap-1">{r.then.map((t) => <Chip key={t} tone="slate">{t}</Chip>)}</div>
                    </td>
                    <td className={td}>
                      <PriorityPill priority={r.priority} />
                      <div className="mt-1 text-[11px] text-slate-400">{r.assignTeam}</div>
                    </td>
                    <td className={cn(td, 'whitespace-nowrap text-xs tabular-nums text-slate-600')}>{dur(r.escalateAfterMin * 60_000)}</td>
                    <td className={cn(td, 'text-right text-sm font-semibold tabular-nums text-slate-800')}>{r.firedToday}</td>
                    <td className={cn(td, 'text-right text-sm font-semibold tabular-nums')}>
                      <span className={r.suppressedToday ? 'text-emerald-600' : 'text-slate-300'}>{r.suppressedToday}</span>
                    </td>
                    <td className={cn(td, 'text-right')} onClick={(e) => e.stopPropagation()}>
                      <button
                        type="button" role="switch" aria-checked={on} onClick={() => void toggleRule(r)}
                        aria-label={`${on ? 'Pause' : 'Enable'} ${r.name}`}
                        className={cn('relative inline-flex h-5 w-9 shrink-0 items-center rounded-full transition-colors', on ? 'bg-primary-600' : 'bg-slate-300')}
                      >
                        <span className={cn('inline-block h-3.5 w-3.5 rounded-full bg-white transition-transform', on ? 'translate-x-[18px]' : 'translate-x-[3px]')} />
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </TableShell>
        </Panel>
      )}

      {/* ══ ANALYTICS ══════════════════════════════════════════════════════════ */}
      {tab === 'analytics' && (
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
          <Panel title="Alert volume by category" subtitle="Every bar is clickable — the queue is the answer to the chart." className="lg:col-span-2">
            {categoryStats.length === 0 ? (
              <EmptyState variant="no-results" title="No alerts in this scope" description="Nothing has been raised here — widen the facility scope to compare." />
            ) : (
              <>
                <ul className="space-y-2.5">
                  {categoryStats.map((c) => (
                    <li key={c.key}>
                      <button type="button" onClick={() => focusQueue({ state: 'all', category: c.key })} className="group block w-full text-left">
                        <div className="flex items-baseline justify-between gap-2">
                          <span className="truncate text-xs font-medium text-slate-700 group-hover:text-primary-700">
                            <span className="mr-1.5" aria-hidden>{CATEGORY_ICON[c.key]}</span>{c.key}
                          </span>
                          <span className="shrink-0 text-[11px] tabular-nums text-slate-400">{c.open} open / {c.total}</span>
                        </div>
                        <div className="mt-1.5 flex h-2.5 w-full overflow-hidden rounded-full bg-slate-100">
                          <div className="bg-primary-500" style={{ width: `${(c.open / categoryStats[0].total) * 100}%` }} />
                          <div className="bg-slate-300" style={{ width: `${(c.done / categoryStats[0].total) * 100}%` }} />
                        </div>
                      </button>
                    </li>
                  ))}
                </ul>
                <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-[11px] text-slate-500">
                  <span className="inline-flex items-center gap-1.5"><span className="h-2 w-2 rounded-full bg-primary-500" />Open</span>
                  <span className="inline-flex items-center gap-1.5"><span className="h-2 w-2 rounded-full bg-slate-300" />Resolved or closed</span>
                </div>
              </>
            )}
          </Panel>

          <Panel title="Response performance" subtitle="Measured from raised to acted on.">
            <div className="flex items-center gap-4">
              <Donut value={slaCompliance} label="on target" />
              <p className="min-w-0 flex-1 text-xs text-slate-500">
                <span className="font-semibold tabular-nums text-slate-800">{onTarget}</span> of{' '}
                <span className="tabular-nums">{elapsed.length}</span> alerts whose response window has elapsed were answered in time.
              </p>
            </div>
            <dl className="mt-4 grid grid-cols-2 gap-3 border-t border-slate-100 pt-3">
              <div>
                <dt className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">Time to acknowledge</dt>
                <dd className="mt-0.5 font-heading text-xl font-semibold tabular-nums text-slate-900">
                  {ackDurations.length ? dur(mean(ackDurations)) : '—'}
                  <span className="ml-1.5 text-[11px] font-medium text-slate-400">n={ackDurations.length}</span>
                </dd>
              </div>
              <div>
                <dt className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">Time to resolve</dt>
                <dd className="mt-0.5 font-heading text-xl font-semibold tabular-nums text-slate-900">
                  {resolveDurations.length ? dur(mean(resolveDurations)) : '—'}
                  <span className="ml-1.5 text-[11px] font-medium text-slate-400">n={resolveDurations.length}</span>
                </dd>
              </div>
            </dl>
            <div className="mt-4 border-t border-slate-100 pt-3">
              <BarStrip
                items={[
                  { label: 'Open', value: openAlerts.length, tone: 'primary' },
                  { label: 'Resolved', value: scoped.filter((a) => a.state === 'Resolved').length, tone: 'emerald' },
                  { label: 'Closed', value: scoped.filter((a) => a.state === 'Closed').length, tone: 'slate' },
                ]}
              />
            </div>
          </Panel>

          <Panel title="Noisiest sources" subtitle="What is generating the work — tune the rule, not the queue." className="lg:col-span-3">
            {sourceStats.length === 0 ? (
              <EmptyState variant="no-results" title="No alerts in this scope" description="Nothing has been raised here — widen the facility scope to compare." />
            ) : (
              <ul className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
                {sourceStats.map((s) => (
                  <li key={s.key}>
                    <button type="button" onClick={() => focusQueue({ state: 'all', q: s.key })} className="group block w-full text-left">
                      <div className="flex items-baseline justify-between gap-2">
                        <span className="text-xs font-medium text-slate-700 group-hover:text-primary-700">{s.key}</span>
                        <span className="text-[11px] tabular-nums text-slate-400">
                          {s.count} · {Math.round((s.count / (scoped.length || 1)) * 100)}%
                        </span>
                      </div>
                      <Meter value={(s.count / sourceStats[0].count) * 100} tone="primary" className="mt-1.5" />
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </Panel>
        </div>
      )}

      {/* ── Alert drawer ─────────────────────────────────────────────────────── */}
      <Drawer
        open={drawerAlert !== null}
        onClose={() => setOpenAlertId(null)}
        width="max-w-2xl"
        title={drawerAlert?.title ?? ''}
        subtitle={drawerAlert && `${drawerAlert.id} · raised ${relTime(drawerAlert.raisedAt)} by ${drawerAlert.source}`}
        eyebrow={drawerAlert && (
          <>
            <PriorityPill priority={drawerAlert.priority} />
            <Chip tone="slate">{CATEGORY_ICON[drawerAlert.category]} {drawerAlert.category}</Chip>
            <Chip tone={lifecycleTone[drawerAlert.state]} dot>{drawerAlert.state}</Chip>
            {overdueNow(drawerAlert) && <Chip tone="red">Response overdue</Chip>}
          </>
        )}
        footer={drawerAlert && (
          <>
            {(Object.keys(ACTION_LABEL) as AlertAction[]).map((a) => (
              <Button key={a} size="sm" variant={a === 'resolve' ? 'primary' : 'outline'} onClick={() => void act([drawerAlert.id], a)}>
                {ACTION_LABEL[a]}
              </Button>
            ))}
            <span className="ml-auto text-[11px] text-slate-400">{drawerAlert.team}</span>
          </>
        )}
      >
        {drawerAlert && (
          <div className="space-y-5">
            <p className="text-sm text-slate-700">{drawerAlert.summary}</p>

            <div className="rounded-lg border border-primary-100 bg-primary-50 p-3">
              <div className="text-[11px] font-semibold uppercase tracking-wide text-primary-700">Recommended next step</div>
              <p className="mt-1 text-sm text-primary-900">{drawerAlert.recommendation}</p>
              <Button
                size="sm" className="mt-2.5"
                onClick={() => toast({ title: drawerAlert.recommendationAction, description: `${drawerAlert.id} · ${drawerAlert.location}`, tone: 'info' })}
              >
                {drawerAlert.recommendationAction}
              </Button>
            </div>

            <dl className="divide-y divide-slate-100 border-y border-slate-100">
              {drawerAlert.assetName && (
                <Field label="Asset">
                  {drawerAlert.assetId ? (
                    <Link to={`/tracking?asset=${drawerAlert.assetId}`} className="font-medium text-primary-600 hover:text-primary-700">
                      {drawerAlert.assetName} →
                    </Link>
                  ) : drawerAlert.assetName}
                </Field>
              )}
              {drawerAlert.deviceId && (
                <Field label="Device">
                  <Link to={`/tracking/infrastructure?tab=tags&device=${drawerAlert.deviceId}`} className="font-medium text-primary-600 hover:text-primary-700">
                    {drawerAlert.deviceId} →
                  </Link>
                </Field>
              )}
              <Field label="Location">{drawerAlert.facility} · {drawerAlert.location}</Field>
              <Field label="Response target"><SlaCell alert={drawerAlert} /></Field>
              <Field label="Assignee">{drawerAlert.assignee ?? <span className="text-slate-400">Unassigned</span>}</Field>
              <Field label="Team">{drawerAlert.team}</Field>
              {drawerAlert.valueAtRiskInr !== undefined && (
                <Field label="Value at risk"><span className="font-semibold tabular-nums">{formatMoney(drawerAlert.valueAtRiskInr)}</span></Field>
              )}
              <Field label="Linked incident">
                {drawerAlert.incidentId ? (
                  <button
                    type="button"
                    onClick={() => { setOpenIncidentId(drawerAlert.incidentId ?? null); setOpenAlertId(null); setTab('incidents'); }}
                    className="font-medium text-primary-600 hover:text-primary-700"
                  >
                    {drawerAlert.incidentId} →
                  </button>
                ) : <span className="text-slate-400">None</span>}
              </Field>
            </dl>

            <div>
              <div className="mb-2.5 text-[11px] font-semibold uppercase tracking-wide text-slate-500">History</div>
              <TimelineRail
                items={drawerAlert.timeline.map((t) => ({
                  at: relTime(t.at), title: t.action, detail: t.note, actor: t.actor, tone: timelineTone(t.action),
                }))}
              />
            </div>
          </div>
        )}
      </Drawer>

      {/* ── Incident drawer ──────────────────────────────────────────────────── */}
      <Drawer
        open={drawerIncident !== null}
        onClose={() => setOpenIncidentId(null)}
        width="max-w-2xl"
        title={drawerIncident?.title ?? ''}
        subtitle={drawerIncident && `Opened ${relTime(drawerIncident.openedAt)} · commander ${drawerIncident.commander}`}
        eyebrow={drawerIncident && (
          <>
            <Chip tone={severityTone(drawerIncident.severity)}>{drawerIncident.severity}</Chip>
            <Chip tone={incidentTone(drawerIncident.state)} dot>{drawerIncident.state}</Chip>
            <Chip tone="slate">{drawerIncident.id}</Chip>
          </>
        )}
        footer={drawerIncident && (
          <>
            <Button
              size="sm" variant="outline" disabled={incidentSettled || drawerIncident.state === 'Contained'}
              onClick={() => void moveIncident(drawerIncident.id, 'Contained')}
            >
              Contain
            </Button>
            <Button size="sm" variant="outline" disabled={incidentSettled} onClick={() => void moveIncident(drawerIncident.id, 'Resolved')}>
              Resolve
            </Button>
            <Button size="sm" disabled={drawerIncident.state === 'Closed'} onClick={() => void moveIncident(drawerIncident.id, 'Closed')}>
              Close incident
            </Button>
            <span className="ml-auto text-[11px] text-slate-400">{drawerIncident.facility}</span>
          </>
        )}
      >
        {drawerIncident && (
          <div className="space-y-5">
            <p className="text-sm text-slate-700">{drawerIncident.summary}</p>

            <div className="rounded-lg border border-primary-100 bg-primary-50 p-3">
              <div className="text-[11px] font-semibold uppercase tracking-wide text-primary-700">Next action</div>
              <p className="mt-1 text-sm text-primary-900">{drawerIncident.nextAction}</p>
            </div>

            <dl className="divide-y divide-slate-100 border-y border-slate-100">
              <Field label="Facility">{drawerIncident.facility}</Field>
              <Field label="Assets affected"><span className="tabular-nums">{drawerIncident.assetsAffected}</span></Field>
              <Field label="Value at risk"><span className="font-semibold tabular-nums">{formatMoney(drawerIncident.valueAtRiskInr)}</span></Field>
              <Field label="Commander">{drawerIncident.commander}</Field>
              {drawerIncident.resolvedAt && <Field label="Resolved">{relTime(drawerIncident.resolvedAt)}</Field>}
            </dl>

            <div>
              <div className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-slate-500">
                Linked alerts · {drawerIncident.alertIds.length}
              </div>
              {drawerIncident.alertIds.length === 0 ? (
                <p className="text-xs text-slate-400">No alerts are attached to this incident.</p>
              ) : (
                <ul className="divide-y divide-slate-100 rounded-lg border border-slate-200">
                  {drawerIncident.alertIds.map((id) => {
                    const a = liveById.get(id);
                    if (!a) return null;
                    return (
                      <li key={id}>
                        <button
                          type="button"
                          onClick={() => { setOpenIncidentId(null); setOpenAlertId(id); }}
                          className="flex w-full items-start gap-2.5 px-3 py-2.5 text-left transition-colors hover:bg-slate-50"
                        >
                          <span className="mt-0.5 shrink-0"><PriorityPill priority={a.priority} /></span>
                          <span className="min-w-0 flex-1">
                            <span className="block truncate text-sm font-medium text-slate-900">{a.title}</span>
                            <span className="mt-0.5 block truncate text-xs text-slate-500">
                              {a.state} · {a.assignee ?? 'unassigned'} · raised {relTime(a.raisedAt)}
                            </span>
                          </span>
                          {overdueNow(a) && <Chip tone="red">Overdue</Chip>}
                        </button>
                      </li>
                    );
                  })}
                </ul>
              )}
            </div>
          </div>
        )}
      </Drawer>

      {/* ── Rule drawer ──────────────────────────────────────────────────────── */}
      <Drawer
        open={drawerRule !== null}
        onClose={() => setOpenRuleId(null)}
        title={drawerRule?.name ?? ''}
        subtitle={drawerRule?.id}
        eyebrow={drawerRule && (
          <>
            <Chip tone="slate">{CATEGORY_ICON[drawerRule.category]} {drawerRule.category}</Chip>
            <PriorityPill priority={drawerRule.priority} />
            <Chip tone={ruleEnabled(drawerRule) ? 'emerald' : 'slate'} dot>{ruleEnabled(drawerRule) ? 'Enabled' : 'Paused'}</Chip>
          </>
        )}
        footer={drawerRule && (
          <>
            <Button size="sm" variant={ruleEnabled(drawerRule) ? 'outline' : 'primary'} onClick={() => void toggleRule(drawerRule)}>
              {ruleEnabled(drawerRule) ? 'Pause rule' : 'Enable rule'}
            </Button>
            <Button size="sm" variant="outline" onClick={() => { setOpenRuleId(null); focusQueue({ state: 'all', category: drawerRule.category }); }}>
              See the alerts it raised
            </Button>
          </>
        )}
      >
        {drawerRule && (
          <div className="space-y-5">
            <div className="rounded-lg border border-slate-200 p-3">
              <div className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">When</div>
              <p className="mt-1 text-sm text-slate-800">{drawerRule.when}</p>
              <div className="mt-3 text-[11px] font-semibold uppercase tracking-wide text-slate-500">Then</div>
              <ul className="mt-1.5 space-y-1.5">
                {drawerRule.then.map((t) => (
                  <li key={t} className="flex items-start gap-2 text-sm text-slate-800">
                    <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-primary-500" aria-hidden />
                    {t}
                  </li>
                ))}
              </ul>
            </div>

            <dl className="divide-y divide-slate-100 border-y border-slate-100">
              <Field label="Raises">{drawerRule.priority} to {drawerRule.assignTeam}</Field>
              <Field label="Escalates after">{dur(drawerRule.escalateAfterMin * 60_000)} without resolution</Field>
              <Field label="Notification channels">
                <span className="inline-flex flex-wrap justify-end gap-1">
                  {channelsFor(drawerRule).map((c) => <Chip key={c} tone="primary">{c}</Chip>)}
                </span>
              </Field>
              <Field label="Fired today"><span className="tabular-nums">{drawerRule.firedToday}</span></Field>
              <Field label="Suppressed today">
                <span className="font-semibold tabular-nums text-emerald-600">{drawerRule.suppressedToday}</span>
              </Field>
            </dl>
          </div>
        )}
      </Drawer>
    </div>
  );
}
