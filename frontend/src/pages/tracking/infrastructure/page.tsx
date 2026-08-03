// ─────────────────────────────────────────────────────────────────────────────
// Asset Tracking ▸ Tracking Infrastructure
//
// The administrator's module: the physical estate that makes every other
// tracking screen possible. Four tabs, one per kind of hardware plus the health
// of the whole fleet — because "which device do I need to touch?" is answered
// differently depending on what kind of device it is.
//
//   Tags & Devices     — the flat estate: everything, searchable and bulk-actionable
//   Gateways           — the uplinks, and what goes dark when one does
//   Readers & Anchors  — what does the hearing, and where we cannot hear
//   Tracking Health    — is the fleet holding up, and what is rolling out
//
// This is the ONE screen in the product where the radio is named — an admin
// replacing a reader legitimately needs to know it speaks RFID. Even here the
// device's ROLE leads (Tag / Reader / Gateway / Anchor / Scan Station / Sensor);
// technology is a muted column and a spec line, never a filter, never a tab, and
// never something an operator on Locate or Inventory is asked to understand.
// ─────────────────────────────────────────────────────────────────────────────

import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { PageHeader, EmptyState } from '@/components/ui/primitives';
import { Button } from '@/components/ui/Button';
import { useToast } from '@/components/providers/ToastProvider';
import { devicesApi } from '@/api/tracking-ops';
import { useMutate } from '@/api/mutate';
import { FacilityMap, MapLegend } from '@/components/tracking/FacilityMap';
import { Drawer, Field, LiveStamp, ScopePicker, Tabs, useFacilityScope, useTabs } from '@/components/tracking/shell';
import {
  BarStrip, BatteryPill, Chip, ChipFilter, Donut, FilterSelect, Meter, Panel, StatTile,
  TableShell, deviceTone, scoreTone, td, th,
} from '@/components/tracking/bits';
import {
  TRACKED_FACILITIES, childDevices, coverageCells, deviceById, devicesForFacility,
  firmwareCampaigns, trackingDevices, trackingKpis, zonesForFacility,
} from '@/lib/tracking-data';
import type {
  CoverageCell, DeviceDiagnostic, DeviceRole, DeviceState, FirmwareCampaign, TrackingDevice,
} from '@access-genie/shared';
import { nowMs, cn, formatDate, relTime } from '@/lib/utils';

const TAB_KEYS = ['tags', 'gateways', 'readers', 'health'] as const;
type TabKey = (typeof TAB_KEYS)[number];

const ROLES: readonly DeviceRole[] = ['Tag', 'Reader', 'Gateway', 'Anchor', 'Scan Station', 'Sensor'];
/** Roles other devices report through — the estate's branch nodes. */
const PARENT_ROLES: readonly DeviceRole[] = ['Reader', 'Gateway', 'Anchor'];
/** What each hardware tab is about. A Scan Station is a reader you walk up to. */
const GATEWAY_ROLES: readonly DeviceRole[] = ['Gateway'];
const READER_ROLES: readonly DeviceRole[] = ['Reader', 'Anchor', 'Scan Station'];
const DEVICE_STATES: readonly DeviceState[] = ['Healthy', 'Degraded', 'Offline', 'Maintenance', 'Unprovisioned'];
const TECHNOLOGIES: readonly TrackingDevice['technology'][] = ['RFID', 'BLE', 'UWB', 'GPS', 'QR', 'LoRaWAN'];

const ROLE_ICON: Record<DeviceRole, string> = {
  Tag: '🏷️', Reader: '📡', Gateway: '🛰️', Anchor: '📍', 'Scan Station': '📷', Sensor: '🌡️',
};
/** What a freshly provisioned device ships on, per role. */
const BASELINE_FIRMWARE: Record<DeviceRole, string> = {
  Tag: 'v2.4.1', Reader: 'v4.8.2', Gateway: 'v3.2.0', Anchor: 'v2.4.1', 'Scan Station': 'v3.0.2', Sensor: 'v1.9.4',
};
const DIAG_TONE: Record<DeviceDiagnostic['state'], { dot: string; text: string }> = {
  ok: { dot: 'bg-health-good', text: 'text-slate-700' },
  warn: { dot: 'bg-health-warning', text: 'text-amber-700' },
  bad: { dot: 'bg-health-critical', text: 'text-health-critical' },
};

/** Zone lookup keyed by facility + name — used to size an outage's blast radius. */

const PROVISION_STAMP = new Date(nowMs()).toISOString();
const PAGE_SIZE = 12;
const INPUT = 'mt-1.5 w-full rounded-md border border-slate-200 bg-white px-3 py-2 text-sm text-slate-800 outline-none focus:ring-2 focus:ring-primary-500';
const LABEL = 'text-xs font-medium text-slate-500';
const BULK = 'rounded-md px-2.5 py-1 text-xs font-medium text-primary-700 hover:bg-primary-100';

type SortKey = 'name' | 'role' | 'state' | 'zone' | 'battery' | 'signal' | 'uptime' | 'serves' | 'lastSeen';
type RoleFilter = DeviceRole | 'All';
interface DeviceFlags { rebooting?: boolean; replacement?: boolean; firmwareScheduled?: boolean }

const isLowBattery = (d: TrackingDevice) => typeof d.batteryPct === 'number' && d.batteryPct < 20;
const isBehind = (d: TrackingDevice) => d.firmware !== d.firmwareLatest;
const daysUntil = (iso: string) => Math.round((Date.parse(iso) - nowMs()) / 86_400_000);
const uptimeTone = (p: number) => (p >= 99 ? 'text-emerald-600' : p >= 95 ? 'text-amber-600' : 'text-health-critical');
/** An uncommissioned device has never checked in — "2d ago" would be a lie. */
const seenLabel = (d: TrackingDevice) =>
  (d.state === 'Unprovisioned' && d.uptimePct === 0 ? 'Awaiting first check-in' : relTime(d.lastSeen));

/** Every blind spot gets a sentence a facilities manager can act on and budget. */
function remediation(c: CoverageCell): string {
  if (c.blindSpots === 0) return 'Fully covered — nothing to close.';
  if (c.blindSpots === 1) return 'One additional reader would close this.';
  if (c.blindSpots === 2) return 'Two additional readers would close this.';
  return 'Three readers, or one gateway re-sited toward the far wall, would close this.';
}

/** Declared out here so the header cells keep their identity between renders. */
function SortHead({
  label, active, dir, onSort,
}: { label: string; active: boolean; dir: 'asc' | 'desc'; onSort: () => void }) {
  return (
    <th
      className={cn(th, 'cursor-pointer hover:text-slate-800')}
      aria-sort={active ? (dir === 'asc' ? 'ascending' : 'descending') : 'none'}
      tabIndex={0}
      onClick={onSort}
      onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onSort(); } }}
    >
      <span className="inline-flex items-center gap-1">
        {label}{active && <span className="text-primary-500">{dir === 'asc' ? '▲' : '▼'}</span>}
      </span>
    </th>
  );
}

function SignalMeter({ pct }: { pct?: number }) {
  if (pct === undefined) return <span className="text-xs text-slate-400">—</span>;
  return (
    <span className="inline-flex items-center gap-2">
      <span className="block w-14"><Meter value={pct} tone={scoreTone(pct, 70, 45)} /></span>
      <span className="text-xs tabular-nums text-slate-500">{pct}%</span>
    </span>
  );
}

export default function TrackingInfrastructurePage() {
  // Derived per render: the dataset is fetched, so a value computed once at
  // module scope would never see a refetch.
  const ZONE_INDEX = new Map(
    TRACKED_FACILITIES.flatMap((f) => zonesForFacility(f.name)).map((z) => [`${z.facility}::${z.name}`, z]),
  );

  const { toast } = useToast();
  const { run } = useMutate();
  const [scope, setScope] = useFacilityScope();
  const [tab, setTab] = useTabs(TAB_KEYS, 'tags');

  // ── In-session state: provisioning, per-device flags, campaign control ──────
  const [added, setAdded] = useState<TrackingDevice[]>([]);
  const [flags, setFlags] = useState<Record<string, DeviceFlags>>({});
  const [campaigns, setCampaigns] = useState<FirmwareCampaign[]>(firmwareCampaigns);
  const [openId, setOpenId] = useState<string | null>(null);
  const [provisioning, setProvisioning] = useState(false);

  // ── Estate table controls ──────────────────────────────────────────────────
  const [roleFilter, setRoleFilter] = useState<RoleFilter>('All');
  const [stateFilter, setStateFilter] = useState('All');
  const [query, setQuery] = useState('');
  const [lowBatteryOnly, setLowBatteryOnly] = useState(false);
  const [sortKey, setSortKey] = useState<SortKey>('name');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('asc');
  const [page, setPage] = useState(0);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [planSlug, setPlanSlug] = useState(TRACKED_FACILITIES[0].slug);
  const [form, setForm] = useState({
    role: 'Reader' as DeviceRole, name: '', facility: TRACKED_FACILITIES[0].name,
    zone: '', technology: 'RFID' as TrackingDevice['technology'], parentId: '',
  });

  // Deep links from the Dashboard, the alert worklist and the retired
  // /sensors/:id and /gateways/:id routes land here. The URL can only be read
  // after mount, so this effect is the one sanctioned place we seed state from
  // it — reading it during render would break hydration.
  // Seeding state in an effect is deliberate here: mount-only seed from the URL.
  useEffect(() => {
    const p = new URLSearchParams(window.location.search);
    const d = p.get('device');
    if (d) {
      // A retired route can carry an id this estate never knew. Fall back to
      // searching for it rather than opening an empty panel.
      if (deviceById(d)) setOpenId(d); else setQuery(d);
      if (!p.get('tab')) setTab('tags');
    }
    const s = p.get('state');
    if (s && (DEVICE_STATES as readonly string[]).includes(s)) setStateFilter(s);
    if (p.get('battery') === 'low') setLowBatteryOnly(true);
  }, [setTab]);

  const facilityName = useMemo(() => TRACKED_FACILITIES.find((f) => f.slug === scope)?.name ?? null, [scope]);
  const kpis = useMemo(() => trackingKpis(scope), [scope]);

  /** The estate in scope — session-provisioned devices sit at the top. */
  const fleet = useMemo(() => {
    const mine = added.filter((d) => !facilityName || d.facility === facilityName);
    return [...mine, ...devicesForFacility(scope)];
  }, [added, facilityName, scope]);

  const resolve = (id: string) => added.find((d) => d.id === id) ?? deviceById(id);
  const kidsOf = (id: string) => [...added.filter((d) => d.parentId === id), ...childDevices(id)];

  const counts = useMemo(() => ({
    total: fleet.length,
    healthy: fleet.filter((d) => d.state === 'Healthy').length,
    degraded: fleet.filter((d) => d.state === 'Degraded').length,
    offline: fleet.filter((d) => d.state === 'Offline').length,
    unprovisioned: fleet.filter((d) => d.state === 'Unprovisioned').length,
    lowBattery: fleet.filter(isLowBattery).length,
    behind: fleet.filter(isBehind).length,
  }), [fleet]);
  const healthPct = counts.total ? Math.round((counts.healthy / counts.total) * 100) : 100;
  /**
   * Tags come and go with the assets they are stuck to. The Dashboard's
   * headline infrastructure figure counts only the fixed estate, so we show
   * that number here too rather than let the two screens disagree.
   */
  const fixedHealth = useMemo(() => {
    const fixed = fleet.filter((d) => d.role !== 'Tag');
    return fixed.length ? Math.round((fixed.filter((d) => d.state === 'Healthy').length / fixed.length) * 100) : 100;
  }, [fleet]);

  const cells = useMemo(
    () => coverageCells.filter((c) => !facilityName || c.facility === facilityName).slice().sort((a, b) => a.coverage - b.coverage),
    [facilityName],
  );

  // ── Needs attention: outages first, then batteries, then version drift ──────
  const attention = useMemo(() => {
    const live = fleet.filter((d) => d.state !== 'Offline');
    return [
      ...fleet.filter((d) => d.state === 'Offline')
        .map((d) => ({ d, why: `Last heard ${relTime(d.lastSeen)} — everything it covers is unverifiable`, tone: 'red' as const })),
      ...live.filter(isLowBattery).slice().sort((a, b) => (a.batteryPct ?? 0) - (b.batteryPct ?? 0))
        .map((d) => ({ d, why: `Battery ${d.batteryPct}% — swap it before it goes quiet`, tone: 'amber' as const })),
      ...live.filter((d) => !isLowBattery(d) && isBehind(d))
        .map((d) => ({ d, why: `Running ${d.firmware}; ${d.firmwareLatest} is available`, tone: 'slate' as const })),
    ];
  }, [fleet]);

  const uptimeBands = useMemo(() => {
    const band = (lo: number, hi: number) => fleet.filter((d) => d.uptimePct >= lo && d.uptimePct < hi).length;
    return [
      { label: '99.5% and above', count: band(99.5, 101), tone: 'emerald' as const },
      { label: '98 – 99.5%', count: band(98, 99.5), tone: 'emerald' as const },
      { label: '95 – 98%', count: band(95, 98), tone: 'amber' as const },
      { label: 'Below 95%', count: band(0, 95), tone: 'red' as const },
    ];
  }, [fleet]);

  const replacements = useMemo(
    () => fleet.filter((d) => d.replaceBy || flags[d.id]?.replacement).slice()
      .sort((a, b) => Date.parse(a.replaceBy ?? PROVISION_STAMP) - Date.parse(b.replaceBy ?? PROVISION_STAMP)),
    [fleet, flags],
  );

  // ── Estate table ───────────────────────────────────────────────────────────
  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    const rows = fleet.filter((d) => {
      if (roleFilter !== 'All' && d.role !== roleFilter) return false;
      if (stateFilter !== 'All' && d.state !== stateFilter) return false;
      if (lowBatteryOnly && !isLowBattery(d)) return false;
      if (q && !`${d.name} ${d.id} ${d.zone} ${d.facility} ${d.assetName ?? ''} ${d.ip ?? ''}`.toLowerCase().includes(q)) return false;
      return true;
    });
    const dir = sortDir === 'asc' ? 1 : -1;
    rows.sort((a, b) => {
      let av: string | number = '', bv: string | number = '';
      if (sortKey === 'name') { av = a.name; bv = b.name; }
      else if (sortKey === 'role') { av = a.role; bv = b.role; }
      else if (sortKey === 'state') { av = a.state; bv = b.state; }
      else if (sortKey === 'zone') { av = `${a.facility} ${a.zone}`; bv = `${b.facility} ${b.zone}`; }
      else if (sortKey === 'battery') { av = a.batteryPct ?? 999; bv = b.batteryPct ?? 999; }
      else if (sortKey === 'signal') { av = a.signalPct ?? -1; bv = b.signalPct ?? -1; }
      else if (sortKey === 'uptime') { av = a.uptimePct; bv = b.uptimePct; }
      else if (sortKey === 'serves') { av = a.serves; bv = b.serves; }
      else { av = Date.parse(a.lastSeen); bv = Date.parse(b.lastSeen); }
      return typeof av === 'number' ? (av - (bv as number)) * dir : String(av).localeCompare(String(bv)) * dir;
    });
    return rows;
  }, [fleet, roleFilter, stateFilter, lowBatteryOnly, query, sortKey, sortDir]);

  const pageCount = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  /** Clamped rather than reset in an effect, so a shrinking list never lands on a blank page. */
  const safePage = Math.min(page, pageCount - 1);
  const pageRows = filtered.slice(safePage * PAGE_SIZE, safePage * PAGE_SIZE + PAGE_SIZE);

  const toggleSort = (k: SortKey) => {
    if (sortKey === k) setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'));
    else { setSortKey(k); setSortDir('asc'); }
  };
  const allOnPage = pageRows.length > 0 && pageRows.every((r) => selected.has(r.id));
  const toggleAll = () => setSelected((prev) => {
    const n = new Set(prev);
    pageRows.forEach((r) => (allOnPage ? n.delete(r.id) : n.add(r.id)));
    return n;
  });
  const toggleRow = (id: string) => setSelected((prev) => {
    const n = new Set(prev);
    if (n.has(id)) n.delete(id); else n.add(id);
    return n;
  });

  // ── Topology ───────────────────────────────────────────────────────────────
  const topology = useMemo(() => (facilityName ? TRACKED_FACILITIES.filter((f) => f.name === facilityName) : TRACKED_FACILITIES)
    .map((f) => ({
      facility: f,
      parents: fleet.filter((d) => d.facility === f.name && PARENT_ROLES.includes(d.role)),
      orphans: fleet.filter((d) => d.facility === f.name && !PARENT_ROLES.includes(d.role) && !d.parentId).length,
    }))
    .filter((g) => g.parents.length > 0 || g.orphans > 0), [fleet, facilityName]);
  const parentCards = useMemo(() => topology.flatMap((g) => g.parents), [topology]);
  const gatewayCards = useMemo(() => parentCards.filter((d) => GATEWAY_ROLES.includes(d.role)), [parentCards]);
  const readerCards = useMemo(() => parentCards.filter((d) => READER_ROLES.includes(d.role)), [parentCards]);
  const offlineGateways = gatewayCards.filter((d) => d.state === 'Offline').length;

  const mapSlug = scope === 'all' ? planSlug : scope;
  const mapFacility = TRACKED_FACILITIES.find((f) => f.slug === mapSlug) ?? TRACKED_FACILITIES[0];
  const mapZones = useMemo(() => zonesForFacility(mapFacility.name), [mapFacility.name]);

  // ── Actions ────────────────────────────────────────────────────────────────
  // Applied locally first so the operator sees the effect immediately, then
  // persisted. A rejected write rolls the local flag back and says why — which
  // matters most here, because a device someone believes they queued for
  // replacement is a device nobody replaces.
  const setFlag = (ids: string[], patch: DeviceFlags) => setFlags((prev) => {
    const next = { ...prev };
    ids.forEach((id) => { next[id] = { ...next[id], ...patch }; });
    return next;
  });
  const plural = (n: number) => `${n} device${n === 1 ? '' : 's'}`;

  const reboot = async (ids: string[]) => {
    setFlag(ids, { rebooting: true });
    // A rebooting device is in Maintenance, not Healthy: it is about to stop
    // answering, and the coverage view should say so rather than report a gap
    // as a fault.
    await run(devicesApi.bulkUpdate(ids, { state: 'Maintenance' }), {
      success: 'Reboot queued',
      successDetail: `${plural(ids.length)} will drop for roughly 40 seconds`,
      describe: 'queue that reboot',
      rollback: () => setFlag(ids, { rebooting: false }),
      refreshTracking: true,
    });
  };
  const scheduleFirmware = async (ids: string[]) => {
    setFlag(ids, { firmwareScheduled: true });
    await run(devicesApi.bulkUpdate(ids, { state: 'Maintenance' }), {
      success: 'Firmware scheduled',
      successDetail: `${plural(ids.length)} added to the 01:00 window tonight`,
      describe: 'schedule that firmware',
      rollback: () => setFlag(ids, { firmwareScheduled: false }),
      refreshTracking: true,
    });
  };
  const markReplacement = async (ids: string[]) => {
    setFlag(ids, { replacement: true });
    // `replaceBy` is what the replacement queue reads, so marking a device is
    // setting that date rather than raising a flag the server never sees.
    await run(devicesApi.bulkUpdate(ids, { replaceBy: new Date().toISOString() }), {
      success: 'Marked for replacement',
      successDetail: `${plural(ids.length)} added to the replacement queue`,
      describe: 'mark those for replacement',
      rollback: () => setFlag(ids, { replacement: false }),
      refreshTracking: true,
    });
  };
  const runDiagnostics = (d: TrackingDevice) =>
    toast({ title: `Diagnostics running on ${d.name}`, description: 'Results land on this panel in about a minute', tone: 'info' });
  const exportRows = (n: number) =>
    toast({ title: 'Export started', description: `${plural(n)} → CSV in the Export Center`, tone: 'success' });
  const bulk = (fn: (ids: string[]) => void | Promise<void>) => { void fn([...selected]); setSelected(new Set()); };
  const setCampaign = (id: string, patch: Partial<FirmwareCampaign>) =>
    setCampaigns((prev) => prev.map((c) => (c.id === id ? { ...c, ...patch } : c)));

  /** Pause/resume a rollout. The state is the campaign's, so it is persisted. */
  const moveCampaign = async (c: FirmwareCampaign, state: FirmwareCampaign['state']) => {
    const previous = c.state;
    setCampaign(c.id, { state });
    await run(devicesApi.setCampaignState(c.id, state), {
      success: state === 'Paused' ? `${c.name} paused` : `${c.name} resumed`,
      successDetail: state === 'Paused'
        ? 'In-flight devices will finish; the rest hold'
        : 'Resuming from the last confirmed device',
      describe: `${state === 'Paused' ? 'pause' : 'resume'} that rollout`,
      rollback: () => setCampaign(c.id, { state: previous }),
      refreshTracking: true,
    });
  };
  const showEstate = (patch?: { role?: RoleFilter; state?: string; battery?: boolean; q?: string }) => {
    setRoleFilter(patch?.role ?? 'All');
    setStateFilter(patch?.state ?? 'All');
    setLowBatteryOnly(patch?.battery ?? false);
    setQuery(patch?.q ?? '');
    setPage(0);
    setTab('tags');
  };

  const zoneOptions = useMemo(() => zonesForFacility(form.facility), [form.facility]);
  const parentOptions = useMemo(
    () => [...added, ...trackingDevices].filter((d) => d.facility === form.facility && PARENT_ROLES.includes(d.role)),
    [added, form.facility],
  );

  /** Open the form already pointed at the building you are looking at. */
  const openProvision = () => {
    if (facilityName && form.facility !== facilityName) {
      setForm((f) => ({ ...f, facility: facilityName, zone: '', parentId: '' }));
    }
    setProvisioning(true);
  };

  const submitProvision = async () => {
    const zone = form.zone || zoneOptions[0]?.name || '';
    const name = form.name.trim() || `${zone} ${form.role}`;

    // The device id is the server's — it is stamped on hardware and quoted in
    // every later ticket, so a client-side `DEV-NEW-01` would be a label nobody
    // else could resolve.
    const device = await run(
      devicesApi.provision({
        name,
        role: form.role,
        technology: form.technology,
        facility: form.facility,
        zone,
        firmware: BASELINE_FIRMWARE[form.role],
      }),
      { describe: 'provision that device', refreshTracking: true },
    );

    if (!device) return;

    setAdded((prev) => [device, ...prev]);
    setProvisioning(false);
    setForm((f) => ({ ...f, name: '', parentId: '' }));
    // Follow the device into its building — otherwise the scope filter hides
    // the thing we just told the operator we created.
    const targetSlug = TRACKED_FACILITIES.find((f) => f.name === device.facility)?.slug;
    if (scope !== 'all' && targetSlug && targetSlug !== scope) setScope(targetSlug);
    showEstate();
    setOpenId(device.id);
    toast({ title: `${name} provisioned`, description: 'It will turn Healthy after its first check-in', tone: 'success' });
  };

  const open = openId ? resolve(openId) : undefined;
  const openParent = open?.parentId ? resolve(open.parentId) : undefined;
  const openKids = open ? kidsOf(open.id) : [];
  const openFlags = open ? flags[open.id] ?? {} : {};

  const sortHead = (k: SortKey, label: string) => (
    <SortHead label={label} active={sortKey === k} dir={sortDir} onSort={() => toggleSort(k)} />
  );

  const tabs: { key: TabKey; label: string; count?: number; tone?: 'red' | 'amber' | 'slate' }[] = [
    { key: 'tags', label: 'Tags & Devices', count: counts.total, tone: 'slate' },
    { key: 'gateways', label: 'Gateways', count: offlineGateways, tone: 'red' },
    { key: 'readers', label: 'Readers & Anchors', count: cells.filter((c) => c.blindSpots > 0).length, tone: 'amber' },
    { key: 'health', label: 'Tracking Health', count: counts.offline + counts.lowBattery, tone: counts.offline ? 'red' : 'amber' },
  ];

  /**
   * One card per branch node — the same markup for a gateway and for a reader,
   * because the question is identical: what goes dark if this one does?
   */
  const parentGrid = (list: TrackingDevice[], emptyTitle: string, emptyBody: string) => (
    <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
      {list.length === 0 ? (
        <div className="xl:col-span-2">
          <Panel><EmptyState icon="🛰️" title={emptyTitle} description={emptyBody} /></Panel>
        </div>
      ) : list.map((p) => {
        const kids = kidsOf(p.id);
        const zone = ZONE_INDEX.get(`${p.facility}::${p.zone}`);
        const offlineKids = kids.filter((k) => k.state === 'Offline').length;
        return (
          <Panel key={p.id} title={p.name} subtitle={`${p.role} · ${p.facility} ▸ ${p.zone}`}
            actions={<Chip tone={deviceTone[p.state]} dot>{p.state}</Chip>}>
            {p.state === 'Offline' && (
              <div className="mb-3 rounded-lg border border-red-200 bg-red-50 px-3 py-2.5">
                <p className="text-sm font-semibold text-health-critical">
                  {zone ? `${zone.expected.toLocaleString('en-IN')} assets in ${p.zone} became unverifiable` : 'This zone became unverifiable'}
                </p>
                <p className="mt-0.5 text-xs text-red-700">
                  {kids.length} device{kids.length === 1 ? '' : 's'} lost their uplink when it stopped reporting {relTime(p.lastSeen)}.
                  Until it is back, nothing here can be confirmed present — only remembered.
                </p>
              </div>
            )}

            <div className="flex flex-wrap items-baseline gap-x-6 gap-y-1 text-xs text-slate-500">
              <span>Uptime <span className={cn('font-heading text-base font-semibold tabular-nums', uptimeTone(p.uptimePct))}>{p.uptimePct}%</span></span>
              <span>Assets depending <span className="font-heading text-base font-semibold tabular-nums text-slate-900">{p.serves}</span></span>
              <span>Reporting through <span className="font-heading text-base font-semibold tabular-nums text-slate-900">{kids.length}</span></span>
            </div>

            <div className="mt-3 flex items-center justify-between gap-2">
              <span className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">Children</span>
              {offlineKids > 0 && <span className="text-[11px] text-health-critical">{offlineKids} of them are silent too</span>}
            </div>
            {kids.length === 0 ? (
              <p className="mt-2 text-xs text-slate-400">Nothing reports through this device yet.</p>
            ) : (
              <ul className="mt-2 flex flex-wrap gap-1.5">
                {kids.slice(0, 12).map((k) => (
                  <li key={k.id}>
                    <button type="button" onClick={() => setOpenId(k.id)} title={`${k.name} · ${k.state}`}
                      className="inline-flex items-center gap-1.5 rounded-full border border-slate-200 bg-white px-2 py-0.5 text-[11px] text-slate-600 transition-colors hover:border-primary-200 hover:bg-primary-50 hover:text-primary-700">
                      <span className={cn('h-1.5 w-1.5 rounded-full', k.state === 'Healthy' ? 'bg-health-good'
                        : k.state === 'Degraded' ? 'bg-health-warning' : k.state === 'Offline' ? 'bg-health-critical' : 'bg-slate-400')} />
                      {k.id}
                    </button>
                  </li>
                ))}
                {kids.length > 12 && <li className="inline-flex items-center px-1 text-[11px] text-slate-400">+{kids.length - 12} more</li>}
              </ul>
            )}

            <div className="mt-3 flex flex-wrap gap-2">
              <Button size="sm" variant="outline" onClick={() => setOpenId(p.id)}>Open device</Button>
              {p.state === 'Offline' && zone && (
                <Link to={`/tracking/geofences?zone=${zone.id}`}>
                  <Button size="sm" variant="ghost">See the affected assets →</Button>
                </Link>
              )}
            </div>
          </Panel>
        );
      })}
    </div>
  );

  return (
    <div className="space-y-5 pb-4">
      <PageHeader
        title="Tracking Infrastructure"
        subtitle="The physical estate behind every location on this platform — and what it takes to keep it honest."
        breadcrumb={[{ label: 'Asset Tracking', href: '/tracking' }, { label: 'Tracking Infrastructure' }]}
        actions={
          <>
            <LiveStamp />
            <ScopePicker value={scope} onChange={(v) => { setScope(v); setPage(0); }} />
            <Button onClick={openProvision}>+ Provision device</Button>
          </>
        }
      />

      {/* ── KPI strip — each tile lands on the list that can act on it ────────── */}
      <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
        <StatTile label="Devices" value={counts.total} icon="🧩" sub={`${counts.unprovisioned} awaiting provisioning`} onClick={() => showEstate()} />
        <StatTile label="Healthy" value={`${healthPct}%`} tone={scoreTone(healthPct, 95, 85)} meter={healthPct} onClick={() => showEstate({ state: 'Healthy' })} />
        <StatTile label="Offline" value={counts.offline} tone={counts.offline ? 'red' : 'emerald'}
          sub={counts.offline ? 'not reporting' : 'everything is reporting'} onClick={() => showEstate({ state: 'Offline' })} />
        <StatTile label="Degraded" value={counts.degraded} tone={counts.degraded ? 'amber' : 'emerald'}
          sub="working, but not to spec" onClick={() => showEstate({ state: 'Degraded' })} />
        <StatTile label="Average coverage" value={`${kpis.coverage}%`} tone={scoreTone(kpis.coverage, 90, 80)} meter={kpis.coverage} onClick={() => setTab('readers')} />
        <StatTile label="Low battery" value={counts.lowBattery} tone={counts.lowBattery ? 'amber' : 'emerald'}
          sub="under 20% — swap due" onClick={() => showEstate({ battery: true })} />
      </div>

      <Tabs tabs={tabs} value={tab} onChange={setTab} />

      {/* ═══ Tracking Health ════════════════════════════════════════════════ */}
      {tab === 'health' && (
        <div className="space-y-4">
          <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
            <Panel title="Fleet health" subtitle={`${counts.healthy} of ${counts.total} devices are fully healthy`}>
              <div className="flex items-center gap-4">
                <Donut value={healthPct} label="healthy" />
                <div className="min-w-0 flex-1">
                  <BarStrip items={[
                    { label: 'Healthy', value: counts.healthy, tone: 'emerald' },
                    { label: 'Degraded', value: counts.degraded, tone: 'amber' },
                    { label: 'Offline', value: counts.offline, tone: 'red' },
                    { label: 'Unprovisioned', value: counts.unprovisioned, tone: 'slate' },
                  ]} />
                </div>
              </div>
              <p className="mt-4 text-xs text-slate-500">
                Unprovisioned devices are grey, not red — hardware that has never been commissioned is a
                gap in the rollout, not a failure in the field. Counting only the fixed estate — readers,
                gateways, anchors, scan stations and sensors — health is{' '}
                <span className="font-semibold tabular-nums text-slate-700">{fixedHealth}%</span>.
              </p>
            </Panel>

            <Panel
              className="lg:col-span-2" padded={false} title="Needs attention"
              subtitle={`${counts.offline} offline · ${counts.lowBattery} low battery · ${counts.behind} behind on firmware`}
              actions={<button type="button" onClick={() => showEstate()} className="text-xs font-semibold text-primary-600 hover:text-primary-700">Open the estate →</button>}
            >
              {attention.length === 0 ? (
                <EmptyState icon="✅" title="Nothing needs a technician" description="Every device in this scope is reporting, charged and current." />
              ) : (
                <>
                  <ul className="divide-y divide-slate-100">
                    {attention.slice(0, 9).map(({ d, why, tone }) => (
                      <li key={d.id}>
                        <button type="button" onClick={() => setOpenId(d.id)} className="flex w-full items-start gap-3 px-4 py-2.5 text-left transition-colors hover:bg-slate-50">
                          <span className="mt-0.5 shrink-0 text-base" aria-hidden>{ROLE_ICON[d.role]}</span>
                          <span className="min-w-0 flex-1">
                            <span className="flex flex-wrap items-center gap-x-2 gap-y-1">
                              <span className="truncate text-sm font-medium text-slate-900">{d.name}</span>
                              <Chip tone={deviceTone[d.state]} dot>{d.state}</Chip>
                              {flags[d.id]?.replacement && <Chip tone="primary">Replacement queued</Chip>}
                            </span>
                            <span className="mt-0.5 block truncate text-xs text-slate-500">{d.role} · {d.facility} ▸ {d.zone}</span>
                            <span className={cn('mt-1 block truncate text-xs',
                              tone === 'red' ? 'text-health-critical' : tone === 'amber' ? 'text-amber-700' : 'text-slate-500')}>{why}</span>
                          </span>
                          <span className="mt-1 shrink-0 text-xs font-medium text-slate-300">Open</span>
                        </button>
                      </li>
                    ))}
                  </ul>
                  {attention.length > 9 && (
                    <div className="border-t border-slate-100 px-4 py-2.5 text-xs text-slate-500">
                      {attention.length - 9} more need attention —{' '}
                      <button type="button" onClick={() => showEstate()} className="font-semibold text-primary-600 hover:text-primary-700">see them in the estate table</button>
                    </div>
                  )}
                </>
              )}
            </Panel>
          </div>

          <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
            <Panel title="Uptime distribution" subtitle="Where the fleet sits against its availability target of 99.5%">
              <ul className="space-y-3">
                {uptimeBands.map((b) => (
                  <li key={b.label}>
                    <button type="button" onClick={() => { setSortKey('uptime'); setSortDir('asc'); showEstate(); }} className="block w-full text-left">
                      <div className="flex items-baseline justify-between gap-3">
                        <span className="text-xs font-medium text-slate-700">{b.label}</span>
                        <span className="text-xs tabular-nums text-slate-400">{b.count} devices</span>
                      </div>
                      <div className="mt-1.5"><Meter value={counts.total ? (b.count / counts.total) * 100 : 0} tone={b.tone} /></div>
                    </button>
                  </li>
                ))}
              </ul>
              <p className="mt-4 text-xs text-slate-500">
                Anything below 95% is producing false gaps on the floor-plan long before it fails outright.
              </p>
            </Panel>

            <Panel padded={false} title="Replacement queue"
              subtitle={replacements.length ? `${replacements.length} devices reaching end of serviceable life` : 'Nothing due for replacement'}>
              {replacements.length === 0 ? (
                <EmptyState icon="🧰" title="No replacements due" description="Nothing in this scope has hit its predicted end of life." />
              ) : (
                <ul className="divide-y divide-slate-100">
                  {replacements.slice(0, 8).map((d) => {
                    const days = d.replaceBy ? daysUntil(d.replaceBy) : null;
                    return (
                      <li key={d.id}>
                        <button type="button" onClick={() => setOpenId(d.id)} className="flex w-full items-center gap-3 px-4 py-2.5 text-left transition-colors hover:bg-slate-50">
                          <span className="shrink-0 text-base" aria-hidden>{ROLE_ICON[d.role]}</span>
                          <span className="min-w-0 flex-1">
                            <span className="block truncate text-sm font-medium text-slate-900">{d.name}</span>
                            <span className="block truncate text-xs text-slate-500">{d.role} · {d.zone}</span>
                          </span>
                          {days === null ? <Chip tone="primary">Flagged by you</Chip> : (
                            <span className="shrink-0 text-right">
                              <span className={cn('block text-xs font-semibold tabular-nums',
                                days <= 7 ? 'text-health-critical' : days <= 30 ? 'text-amber-600' : 'text-slate-600')}>{days} days</span>
                              <span className="block text-[11px] text-slate-400">{formatDate(d.replaceBy ?? '')}</span>
                            </span>
                          )}
                        </button>
                      </li>
                    );
                  })}
                </ul>
              )}
            </Panel>
          </div>
        </div>
      )}

      {/* ═══ Tags & Devices ═════════════════════════════════════════════════ */}
      {/* The flat estate: every tag, reader, gateway and anchor in one table,
          because "find me DEV-0412" should never require knowing its role. */}
      {tab === 'tags' && (
        <div className="space-y-3">
          <ChipFilter
            value={roleFilter} onChange={(v) => { setRoleFilter(v); setPage(0); }}
            options={[
              { key: 'All' as RoleFilter, label: 'All roles', count: fleet.length },
              ...ROLES.map((r) => ({ key: r as RoleFilter, label: r, count: fleet.filter((d) => d.role === r).length })),
            ]}
          />

          <div className="glass-panel flex flex-col overflow-hidden">
            <div className="flex flex-wrap items-center gap-2 border-b border-slate-200 p-3">
              <input
                value={query} onChange={(e) => { setQuery(e.target.value); setPage(0); }} aria-label="Search the device estate"
                placeholder="Search by device, id, zone, bound asset or IP…"
                className="w-72 max-w-full rounded-md bg-slate-100 px-3 py-1.5 text-sm outline-none focus:ring-2 focus:ring-primary-500"
              />
              <FilterSelect label="All states" value={stateFilter} onChange={(v) => { setStateFilter(v); setPage(0); }} options={['All', ...DEVICE_STATES]} />
              <button
                type="button" aria-pressed={lowBatteryOnly} onClick={() => { setLowBatteryOnly((v) => !v); setPage(0); }}
                className={cn('rounded-md border px-3 py-1.5 text-xs font-medium transition-colors',
                  lowBatteryOnly ? 'border-amber-300 bg-amber-50 text-amber-700' : 'border-slate-200 bg-white text-slate-600 hover:bg-slate-50')}
              >
                🔋 Battery under 20% <span className="tabular-nums text-slate-400">{counts.lowBattery}</span>
              </button>
              <div className="ml-auto flex items-center gap-2">
                <span className="text-xs text-slate-400">{filtered.length} of {fleet.length}</span>
                <Button size="sm" variant="outline" onClick={() => exportRows(filtered.length)}>Export</Button>
              </div>
            </div>

            {selected.size > 0 && (
              <div className="flex flex-wrap items-center gap-3 border-b border-primary-100 bg-primary-50 px-4 py-2 text-sm">
                <span className="font-medium text-primary-700">{selected.size} selected</span>
                <div className="flex flex-wrap items-center gap-1.5">
                  <button type="button" onClick={() => bulk(reboot)} className={BULK}>Reboot</button>
                  <button type="button" onClick={() => bulk(scheduleFirmware)} className={BULK}>Schedule firmware</button>
                  <button type="button" onClick={() => bulk(markReplacement)} className={BULK}>Mark for replacement</button>
                  <button type="button" onClick={() => bulk((ids) => exportRows(ids.length))} className={BULK}>Export</button>
                </div>
                <button type="button" onClick={() => setSelected(new Set())} className="ml-auto text-xs text-slate-500 hover:text-slate-800">Clear</button>
              </div>
            )}

            <TableShell>
              <thead className="sticky top-0 z-10 border-b border-slate-200 bg-slate-50">
                <tr>
                  <th className="w-10 px-4 py-2.5">
                    <input type="checkbox" checked={allOnPage} onChange={toggleAll} aria-label="Select all on this page" className="accent-primary-600" />
                  </th>
                  {sortHead('name', 'Device')}
                  {sortHead('role', 'Role')}
                  {sortHead('state', 'State')}
                  {sortHead('zone', 'Facility / zone')}
                  <th className={th} title="Recorded for the administrator only — nobody outside this screen picks a radio.">Technology</th>
                  {sortHead('battery', 'Battery')}
                  {sortHead('signal', 'Signal')}
                  <th className={th}>Firmware</th>
                  {sortHead('serves', 'Serves')}
                  {sortHead('lastSeen', 'Last seen')}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {pageRows.map((d) => (
                  <tr key={d.id} onClick={() => setOpenId(d.id)}
                    className={cn('cursor-pointer transition-colors hover:bg-slate-50', selected.has(d.id) && 'bg-primary-50/40')}>
                    <td className={td} onClick={(e) => e.stopPropagation()}>
                      <input type="checkbox" checked={selected.has(d.id)} onChange={() => toggleRow(d.id)} aria-label={`Select ${d.name}`} className="accent-primary-600" />
                    </td>
                    <td className={td}>
                      <div className="flex items-center gap-2.5">
                        <span className="text-base" aria-hidden>{ROLE_ICON[d.role]}</span>
                        <div className="min-w-0">
                          <div className="flex flex-wrap items-center gap-1.5">
                            <button type="button" onClick={(e) => { e.stopPropagation(); setOpenId(d.id); }}
                              className="truncate text-left text-sm font-medium text-slate-900 hover:text-primary-600">{d.name}</button>
                            {flags[d.id]?.rebooting && <Chip tone="primary">Reboot queued</Chip>}
                            {flags[d.id]?.replacement && <Chip tone="amber">Replace</Chip>}
                          </div>
                          <div className="text-xs text-slate-400">{d.id}</div>
                        </div>
                      </div>
                    </td>
                    <td className={cn(td, 'text-sm text-slate-600')}>{d.role}</td>
                    <td className={td}><Chip tone={deviceTone[d.state]} dot>{d.state}</Chip></td>
                    <td className={td}>
                      <div className="text-sm text-slate-700">{d.zone}</div>
                      <div className="text-xs text-slate-400">{d.facility}</div>
                    </td>
                    {/* Secondary by design: the radio is a spec, not a workflow. */}
                    <td className={cn(td, 'text-xs text-slate-400')}>{d.technology}</td>
                    <td className={td}><BatteryPill pct={d.batteryPct} /></td>
                    <td className={td}><SignalMeter pct={d.signalPct} /></td>
                    <td className={td}>
                      <div className="flex items-center gap-1.5">
                        <span className="text-xs tabular-nums text-slate-600">{d.firmware}</span>
                        {isBehind(d) && <Chip tone="amber" title={`${d.firmwareLatest} is available`}>Update</Chip>}
                        {flags[d.id]?.firmwareScheduled && <Chip tone="primary">Scheduled</Chip>}
                      </div>
                    </td>
                    <td className={cn(td, 'text-sm tabular-nums text-slate-600')}>{d.serves || '—'}</td>
                    <td className={cn(td, 'text-xs text-slate-400')}>{seenLabel(d)}</td>
                  </tr>
                ))}
              </tbody>
            </TableShell>

            {pageRows.length === 0 && (
              <EmptyState variant="no-results" title="No devices match these filters" description="Try a different role, state or search term."
                action={<Button variant="outline" onClick={() => showEstate()}>Clear filters</Button>} />
            )}

            {filtered.length > 0 && (
              <div className="flex items-center justify-between border-t border-slate-200 px-4 py-2.5 text-sm text-slate-500">
                <span className="tabular-nums">Showing {safePage * PAGE_SIZE + 1}–{Math.min((safePage + 1) * PAGE_SIZE, filtered.length)} of {filtered.length}</span>
                <div className="flex items-center gap-1">
                  <button type="button" disabled={safePage === 0} onClick={() => setPage(safePage - 1)} className="rounded-md border border-slate-200 px-3 py-1 text-xs hover:bg-slate-50 disabled:opacity-40">← Prev</button>
                  <span className="px-2 text-xs tabular-nums">Page {safePage + 1} of {pageCount}</span>
                  <button type="button" disabled={safePage >= pageCount - 1} onClick={() => setPage(safePage + 1)} className="rounded-md border border-slate-200 px-3 py-1 text-xs hover:bg-slate-50 disabled:opacity-40">Next →</button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ═══ Gateways ═══════════════════════════════════════════════════════ */}
      {/* Nothing on this platform fails alone; a gateway is the single point
          whose silence takes a whole zone with it, so its blast radius is
          spelled out in assets rather than left as a topology diagram. */}
      {tab === 'gateways' && (
        <div className="space-y-4">
          {parentGrid(
            gatewayCards,
            'No gateways in this scope',
            'Gateways appear here once provisioned. Readers and anchors live on the next tab.',
          )}


          <Panel title="Estate topology" subtitle="Facility ▸ parent ▸ what reports through it">
            {topology.length === 0 ? (
              <EmptyState icon="🗺️" title="Nothing to draw" description="No devices are registered in this scope." />
            ) : (
              <ul className="space-y-5">
                {topology.map((g) => (
                  <li key={g.facility.slug}>
                    <div className="flex items-center gap-2">
                      <span aria-hidden>{g.facility.emoji}</span>
                      <span className="font-heading text-sm font-semibold text-slate-800">{g.facility.name}</span>
                      <span className="text-xs text-slate-400">{g.parents.length} parents</span>
                    </div>
                    <ul className="mt-2 space-y-2 border-l border-slate-200 pl-4">
                      {g.parents.map((p) => {
                        const kids = kidsOf(p.id);
                        return (
                          <li key={p.id} className="relative">
                            <span className="absolute -left-4 top-2.5 h-px w-3 bg-slate-200" aria-hidden />
                            <button type="button" onClick={() => setOpenId(p.id)} className="inline-flex flex-wrap items-center gap-2 text-left">
                              <span aria-hidden>{ROLE_ICON[p.role]}</span>
                              <span className="text-sm font-medium text-slate-800 hover:text-primary-600">{p.name}</span>
                              <Chip tone={deviceTone[p.state]}>{p.role}</Chip>
                              <span className="text-xs text-slate-400">{kids.length} reporting · {p.uptimePct}% uptime</span>
                            </button>
                            {kids.length > 0 && (
                              <div className="mt-1 flex flex-wrap gap-x-3 border-l border-dashed border-slate-200 pl-3">
                                {ROLES.filter((r) => kids.some((k) => k.role === r)).map((r) => (
                                  <span key={r} className="text-[11px] text-slate-500">{kids.filter((k) => k.role === r).length}× {r}</span>
                                ))}
                              </div>
                            )}
                          </li>
                        );
                      })}
                      {g.orphans > 0 && (
                        <li className="text-xs text-slate-400">{g.orphans} device{g.orphans === 1 ? '' : 's'} report directly to the platform with no parent.</li>
                      )}
                    </ul>
                  </li>
                ))}
              </ul>
            )}
          </Panel>
        </div>
      )}

      {/* ═══ Readers & Anchors ══════════════════════════════════════════════ */}
      {/* What actually does the hearing — and, directly underneath, the zones
          where it is not hearing well enough. The two belong on one screen:
          a blind spot is a statement about the readers covering it. */}
      {tab === 'readers' && (
        <div className="space-y-4">
          {parentGrid(
            readerCards,
            'No readers or anchors in this scope',
            'Readers, anchors and scan stations appear here once provisioned.',
          )}
          <Panel
            title={`${mapFacility.name} — where we can hear`}
            subtitle={`${mapZones.length} zones · ${mapFacility.coverage}% average coverage`}
            actions={<Link to={`/tracking/twin/${mapFacility.slug}`}><Button size="sm" variant="outline">🏢 Open Digital Twin</Button></Link>}
          >
            {scope === 'all' && (
              <div className="mb-3">
                <ChipFilter value={planSlug} onChange={setPlanSlug} options={TRACKED_FACILITIES.map((f) => ({ key: f.slug, label: f.short }))} />
              </div>
            )}
            <FacilityMap zones={mapZones} mode="coverage" ariaLabel={`${mapFacility.name} coverage plan`} />
            <div className="mt-3"><MapLegend mode="coverage" /></div>
          </Panel>

          <Panel padded={false} title="Coverage by zone" subtitle="Worst first — this is the order the coverage budget should be spent in">
            {cells.length === 0 ? (
              <EmptyState icon="📡" title="No zones in this scope" description="Pick a different facility to see its coverage." />
            ) : (
              <TableShell>
                <thead className="border-b border-slate-200 bg-slate-50">
                  <tr>
                    {['Zone', 'Coverage', 'Devices', 'Blind spots', 'Assets at risk', 'What would fix it'].map((h) => (
                      <th key={h} className={th}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {cells.map((c) => (
                    <tr key={c.zoneId} className="transition-colors hover:bg-slate-50">
                      <td className={td}>
                        <Link to={`/tracking/geofences?zone=${c.zoneId}`} className="text-sm font-medium text-slate-900 hover:text-primary-600">{c.zone}</Link>
                        <div className="text-xs text-slate-400">{c.facility}</div>
                      </td>
                      <td className={td}>
                        <div className="flex items-center gap-2">
                          <span className="block w-20"><Meter value={c.coverage} tone={scoreTone(c.coverage, 90, 80)} /></span>
                          <span className={cn('text-xs font-semibold tabular-nums',
                            c.coverage >= 90 ? 'text-emerald-600' : c.coverage >= 80 ? 'text-amber-600' : 'text-health-critical')}>{c.coverage}%</span>
                        </div>
                      </td>
                      <td className={td}>
                        <button type="button" onClick={() => showEstate({ q: c.zone })} className="text-sm tabular-nums text-slate-700 hover:text-primary-600">{c.devices}</button>
                      </td>
                      <td className={td}>
                        {c.blindSpots === 0 ? <Chip tone="emerald">None</Chip> : <Chip tone={c.blindSpots >= 3 ? 'red' : 'amber'}>{c.blindSpots}</Chip>}
                      </td>
                      <td className={cn(td, 'text-sm tabular-nums text-slate-700')}>{c.assetsAtRisk.toLocaleString('en-IN')}</td>
                      <td className={cn(td, 'max-w-[22rem] text-xs text-slate-500')}>{remediation(c)}</td>
                    </tr>
                  ))}
                </tbody>
              </TableShell>
            )}
          </Panel>
        </div>
      )}

      {/* ═══ Tracking Health ▸ what is rolling out ═════════════════════════ */}
      {tab === 'health' && (
        <Panel
          padded={false} title="Firmware campaigns"
          subtitle={`${counts.behind} devices in this scope are not on their latest firmware. A paused campaign is usually waiting on a device that cannot be reached.`}
          actions={<Button size="sm" onClick={openProvision}>+ Provision device</Button>}
        >
          {campaigns.length === 0 ? (
            <EmptyState icon="📦" title="No campaigns" description="Nothing is being rolled out right now." />
          ) : (
            <TableShell>
              <thead className="border-b border-slate-200 bg-slate-50">
                <tr>
                  {['Campaign', 'Target', 'Version', 'Progress', 'Failures', 'State', 'Window', 'Owner'].map((h) => (
                    <th key={h} className={th}>{h}</th>
                  ))}
                  <th className={cn(th, 'text-right')}>Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {campaigns.map((c) => (
                  <tr key={c.id} className="transition-colors hover:bg-slate-50">
                    <td className={td}>
                      <div className="text-sm font-medium text-slate-900">{c.name}</div>
                      <div className="text-xs text-slate-400">{c.id}</div>
                    </td>
                    <td className={td}>
                      <button type="button" onClick={() => showEstate({ role: c.targetRole })} className="inline-flex items-center gap-1.5 text-sm text-slate-700 hover:text-primary-600">
                        <span aria-hidden>{ROLE_ICON[c.targetRole]}</span>{c.targetRole}
                      </button>
                    </td>
                    <td className={cn(td, 'text-xs tabular-nums text-slate-500')}>{c.fromVersion} → <span className="font-semibold text-slate-700">{c.toVersion}</span></td>
                    <td className={td}>
                      <div className="flex items-center gap-2">
                        <span className="block w-20"><Meter value={c.total ? (c.done / c.total) * 100 : 0} tone={c.state === 'Complete' ? 'emerald' : 'primary'} /></span>
                        <span className="text-xs tabular-nums text-slate-500">{c.done}/{c.total}</span>
                      </div>
                    </td>
                    <td className={td}>{c.failed === 0 ? <span className="text-xs text-slate-400">None</span> : <Chip tone="red">{c.failed} failed</Chip>}</td>
                    <td className={td}>
                      <Chip dot tone={c.state === 'Complete' ? 'emerald' : c.state === 'Running' ? 'primary' : c.state === 'Paused' ? 'amber' : 'slate'}>{c.state}</Chip>
                    </td>
                    <td className={cn(td, 'max-w-[16rem] text-xs text-slate-500')}>{c.window}</td>
                    <td className={cn(td, 'text-sm text-slate-600')}>{c.owner}</td>
                    <td className={cn(td, 'whitespace-nowrap text-right')}>
                      {c.state === 'Running' && (
                        <button type="button" className="rounded-md px-2 py-1 text-xs font-medium text-slate-600 hover:bg-slate-100"
                          onClick={() => void moveCampaign(c, 'Paused')}>
                          Pause
                        </button>
                      )}
                      {(c.state === 'Paused' || c.state === 'Scheduled') && (
                        <button type="button" className="rounded-md px-2 py-1 text-xs font-medium text-primary-700 hover:bg-primary-50"
                          onClick={() => void moveCampaign(c, 'Running')}>
                          Resume
                        </button>
                      )}
                      {c.failed > 0 && (
                        <button type="button" className="rounded-md px-2 py-1 text-xs font-medium text-health-critical hover:bg-red-50"
                          onClick={() => { setCampaign(c.id, { done: c.done + c.failed, failed: 0 }); toast({ title: 'Retrying failed devices', description: `${plural(c.failed)} re-queued`, tone: 'info' }); }}>
                          Retry failed
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </TableShell>
          )}
        </Panel>
      )}

      {/* ── Device drawer ─────────────────────────────────────────────────────── */}
      <Drawer
        open={!!open}
        onClose={() => setOpenId(null)}
        title={open?.name ?? ''}
        subtitle={open ? `${open.id} · ${open.facility} ▸ ${open.zone}` : undefined}
        eyebrow={open && (
          <>
            <Chip tone={deviceTone[open.state]} dot>{open.state}</Chip>
            <Chip tone="slate">{ROLE_ICON[open.role]} {open.role}</Chip>
            {openFlags.replacement && <Chip tone="amber">Replacement queued</Chip>}
            {openFlags.rebooting && <Chip tone="primary">Reboot queued</Chip>}
          </>
        )}
        footer={open && (
          <>
            <Button size="sm" variant="outline" onClick={() => void reboot([open.id])}>↻ Reboot</Button>
            <Button size="sm" variant="outline" onClick={() => runDiagnostics(open)}>🩺 Run diagnostics</Button>
            <Button size="sm" variant="outline" onClick={() => void scheduleFirmware([open.id])}>⬆ Schedule firmware</Button>
            <Button size="sm" variant="danger" className="ml-auto" onClick={() => void markReplacement([open.id])}>Mark for replacement</Button>
          </>
        )}
      >
        {open && (
          <div className="space-y-5">
            <section>
              <h3 className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">Identity</h3>
              <dl className="mt-1 divide-y divide-slate-100">
                <Field label="Device id"><span className="tabular-nums">{open.id}</span></Field>
                <Field label="Role">{ROLE_ICON[open.role]} {open.role}</Field>
                <Field label="Facility">{open.facility}</Field>
                <Field label="Zone">{open.zone}</Field>
                {/* The one place the radio is stated outright — as a spec line. */}
                <Field label="Technology"><span className="text-slate-500">{open.technology}</span></Field>
                <Field label="Reports through">
                  {openParent ? (
                    <button type="button" onClick={() => setOpenId(openParent.id)} className="font-medium text-primary-600 hover:text-primary-700">{openParent.name}</button>
                  ) : <span className="text-slate-400">Directly to the platform</span>}
                </Field>
                {openKids.length > 0 && (
                  <Field label="Serving">
                    <button type="button" onClick={() => { setOpenId(null); setTab(open.role === 'Gateway' ? 'gateways' : 'readers'); }} className="font-medium text-primary-600 hover:text-primary-700">
                      {openKids.length} devices report through this one →
                    </button>
                  </Field>
                )}
                {open.assetId && (
                  <Field label="Bound asset">
                    <Link to={`/assets/${open.assetId}`} className="font-medium text-primary-600 hover:text-primary-700">{open.assetName ?? open.assetId}</Link>
                  </Field>
                )}
              </dl>
            </section>

            <section>
              <h3 className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">Condition</h3>
              <div className="mt-2 grid grid-cols-3 gap-2">
                <div className="rounded-lg border border-slate-200 p-2.5">
                  <div className="text-[11px] text-slate-500">Uptime</div>
                  <div className={cn('font-heading text-lg font-semibold tabular-nums', uptimeTone(open.uptimePct))}>{open.uptimePct}%</div>
                </div>
                <div className="rounded-lg border border-slate-200 p-2.5">
                  <div className="text-[11px] text-slate-500">Battery</div>
                  <div className="mt-1.5"><BatteryPill pct={open.batteryPct} /></div>
                </div>
                <div className="rounded-lg border border-slate-200 p-2.5">
                  <div className="text-[11px] text-slate-500">Signal</div>
                  <div className="mt-1.5"><SignalMeter pct={open.signalPct} /></div>
                </div>
              </div>

              <dl className="mt-2 divide-y divide-slate-100">
                <Field label="Firmware">
                  <span className="inline-flex items-center gap-2">
                    <span className="tabular-nums">{open.firmware}</span>
                    {isBehind(open) ? (
                      <>
                        <span className="text-slate-400">→ {open.firmwareLatest}</span>
                        <button type="button" onClick={() => void scheduleFirmware([open.id])}
                          className="rounded-md border border-primary-200 bg-primary-50 px-2 py-0.5 text-[11px] font-semibold text-primary-700 hover:bg-primary-100">Upgrade</button>
                      </>
                    ) : <Chip tone="emerald">Current</Chip>}
                  </span>
                </Field>
                <Field label="Serves">{open.serves ? `${open.serves} assets` : <span className="text-slate-400">Nothing bound</span>}</Field>
                <Field label="Last seen">{seenLabel(open)}</Field>
                <Field label="Installed">{formatDate(open.installedAt)}</Field>
                <Field label="Replace by">
                  {open.replaceBy ? (
                    <span className={cn('tabular-nums', daysUntil(open.replaceBy) <= 7 ? 'text-health-critical' : daysUntil(open.replaceBy) <= 30 ? 'text-amber-600' : 'text-slate-700')}>
                      {formatDate(open.replaceBy)} · {daysUntil(open.replaceBy)} days
                    </span>
                  ) : <span className="text-slate-400">No end-of-life prediction</span>}
                </Field>
                <Field label="Address">{open.ip ? <span className="tabular-nums text-slate-600">{open.ip}</span> : <span className="text-slate-400">Not networked</span>}</Field>
              </dl>
            </section>

            <section>
              <h3 className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">Diagnostics</h3>
              <ul className="mt-2 space-y-1.5">
                {open.diagnostics.map((x) => (
                  <li key={x.label} className="flex items-start justify-between gap-3 rounded-lg border border-slate-200 px-3 py-2">
                    <span className="flex items-center gap-2">
                      <span className={cn('h-2 w-2 shrink-0 rounded-full', DIAG_TONE[x.state].dot)} aria-hidden />
                      <span className="text-xs font-medium text-slate-600">{x.label}</span>
                    </span>
                    <span className={cn('text-right text-xs font-medium', DIAG_TONE[x.state].text)}>{x.value}</span>
                  </li>
                ))}
              </ul>
            </section>
          </div>
        )}
      </Drawer>

      {/* ── Provisioning drawer ───────────────────────────────────────────────── */}
      <Drawer
        open={provisioning}
        onClose={() => setProvisioning(false)}
        title="Provision a device"
        subtitle="Role first. The radio is the last thing you pick, and only because the installer needs it."
        width="max-w-lg"
        footer={
          <>
            <Button variant="outline" onClick={() => setProvisioning(false)}>Cancel</Button>
            <Button className="ml-auto" onClick={() => void submitProvision()} disabled={zoneOptions.length === 0}>Add to the estate</Button>
          </>
        }
      >
        <div className="space-y-4">
          <div>
            <span className={LABEL}>What does it do?</span>
            <div className="mt-1.5 grid grid-cols-3 gap-1.5">
              {ROLES.map((r) => (
                <button key={r} type="button" aria-pressed={form.role === r} onClick={() => setForm((f) => ({ ...f, role: r }))}
                  className={cn('rounded-lg border px-2 py-2 text-xs font-medium transition-colors',
                    form.role === r ? 'border-primary-600 bg-primary-50 text-primary-700' : 'border-slate-200 bg-white text-slate-600 hover:bg-slate-50')}>
                  <span className="block text-base" aria-hidden>{ROLE_ICON[r]}</span>{r}
                </button>
              ))}
            </div>
          </div>

          <div>
            <label htmlFor="prov-name" className={LABEL}>Name</label>
            <input id="prov-name" value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
              placeholder={`${form.zone || zoneOptions[0]?.name || 'Zone'} ${form.role}`} className={INPUT} />
            <p className="mt-1 text-[11px] text-slate-400">Leave it blank and we will name it after its zone and role.</p>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label htmlFor="prov-facility" className={LABEL}>Facility</label>
              <select id="prov-facility" value={form.facility} className={INPUT}
                onChange={(e) => setForm((f) => ({ ...f, facility: e.target.value, zone: '', parentId: '' }))}>
                {TRACKED_FACILITIES.map((f) => <option key={f.slug} value={f.name}>{f.name}</option>)}
              </select>
            </div>
            <div>
              <label htmlFor="prov-zone" className={LABEL}>Zone</label>
              <select id="prov-zone" value={form.zone || zoneOptions[0]?.name || ''} className={INPUT}
                onChange={(e) => setForm((f) => ({ ...f, zone: e.target.value }))}>
                {zoneOptions.map((z) => <option key={z.id} value={z.name}>{z.name}</option>)}
              </select>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label htmlFor="prov-tech" className={LABEL}>Technology</label>
              <select id="prov-tech" value={form.technology} className={INPUT}
                onChange={(e) => setForm((f) => ({ ...f, technology: e.target.value as TrackingDevice['technology'] }))}>
                {TECHNOLOGIES.map((t) => <option key={t} value={t}>{t}</option>)}
              </select>
              <p className="mt-1 text-[11px] text-slate-400">Recorded for the installer. It never reaches an operator&apos;s screen.</p>
            </div>
            <div>
              <label htmlFor="prov-parent" className={LABEL}>Reports through</label>
              <select id="prov-parent" value={form.parentId} className={INPUT}
                onChange={(e) => setForm((f) => ({ ...f, parentId: e.target.value }))}>
                <option value="">Directly to the platform</option>
                {parentOptions.map((p) => <option key={p.id} value={p.id}>{p.name} ({p.role})</option>)}
              </select>
            </div>
          </div>

          <div className="rounded-lg border border-slate-200 bg-slate-50 p-3">
            <span className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">What happens next</span>
            <p className="mt-1 text-xs text-slate-600">
              It joins the estate as <span className="font-medium text-slate-800">Unprovisioned</span> on firmware{' '}
              <span className="tabular-nums">{BASELINE_FIRMWARE[form.role]}</span>, and turns Healthy after its first
              check-in from site. Nothing counts it toward coverage until then.
            </p>
          </div>
        </div>
      </Drawer>
    </div>
  );
}
