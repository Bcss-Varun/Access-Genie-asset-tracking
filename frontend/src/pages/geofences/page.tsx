import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { Button } from '@/components/ui/Button';
import { PageHeader, Badge, KpiCard } from '@/components/ui/primitives';
import { mockGeofences, mockAssets, mockZones } from '@/lib/mock-data';
import type { Asset, Geofence, GeofenceRule } from '@/types/asset';
import { cn } from '@/lib/utils';

// ── Rule → visual identity ────────────────────────────────────────────────────
const RULE_STYLE: Record<
  GeofenceRule,
  { color: string; fill: string; tone: 'red' | 'amber' | 'primary' | 'emerald'; label: string }
> = {
  Restricted: { color: '#ef4444', fill: 'rgba(239,68,68,0.10)', tone: 'red', label: 'Restricted' },
  Exit: { color: '#f59e0b', fill: 'rgba(245,158,11,0.10)', tone: 'amber', label: 'Exit' },
  Dwell: { color: '#6366f1', fill: 'rgba(14,165,233,0.10)', tone: 'primary', label: 'Dwell' },
  Entry: { color: '#10b981', fill: 'rgba(16,185,129,0.10)', tone: 'emerald', label: 'Entry' },
};

const RULES: GeofenceRule[] = ['Entry', 'Exit', 'Dwell', 'Restricted'];

// ── Asset marker color by status / health (matches Live Tracking) ─────────────
function markerColor(a: Asset): string {
  if (a.status === 'Missing' || a.status === 'Maintenance' || a.healthStatus === 'Critical') return '#ef4444';
  if (a.healthStatus === 'Warning') return '#f59e0b';
  return '#10b981';
}

type FilterKey = 'All' | GeofenceRule;

export default function GeofencesPage() {
  const [filter, setFilter] = useState<FilterKey>('All');
  const [hoveredId, setHoveredId] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  // Active toggles — seeded from mock data, mutated in-session.
  const [activeMap, setActiveMap] = useState<Record<string, boolean>>(() =>
    Object.fromEntries(mockGeofences.map((g) => [g.id, g.active])),
  );

  const activeId = hoveredId ?? selectedId;

  const isActive = (g: Geofence) => activeMap[g.id];

  // ── KPIs ─────────────────────────────────────────────────────────────────
  const total = mockGeofences.length;
  const activeCount = mockGeofences.filter((g) => activeMap[g.id]).length;
  const breaches24h = mockGeofences.reduce((s, g) => s + g.breaches24h, 0);
  const restrictedCount = mockGeofences.filter((g) => g.rule === 'Restricted').length;

  const filtered = useMemo(
    () => mockGeofences.filter((g) => filter === 'All' || g.rule === filter),
    [filter],
  );

  const filterChips: { key: FilterKey; label: string; count: number }[] = [
    { key: 'All', label: 'All', count: total },
    ...RULES.map((r) => ({
      key: r,
      label: RULE_STYLE[r].label,
      count: mockGeofences.filter((g) => g.rule === r).length,
    })),
  ];

  const markers = mockAssets.filter((a) => a.mapPosition);

  return (
    <div className="h-full flex flex-col space-y-6">
      <PageHeader
        title="Geofences"
        subtitle="Virtual boundaries with entry, exit, dwell & restriction rules across the facility floor-plan."
        breadcrumb={[{ label: 'Tracking', href: '/tracking' }, { label: 'Geofences' }]}
        actions={
          <Link to="/geofences/new">
            <Button>
              <span className="text-base leading-none">＋</span> New Geofence
            </Button>
          </Link>
        }
      />

      {/* ── KPI row ────────────────────────────────────────────────────────── */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <KpiCard label="Total Geofences" value={total} sub="Defined boundaries" tone="primary" accent />
        <KpiCard label="Active" value={activeCount} sub={`${total - activeCount} paused`} tone="emerald" />
        <KpiCard
          label="Breaches (24h)"
          value={breaches24h}
          sub="Across all zones"
          tone={breaches24h > 0 ? 'amber' : 'slate'}
        />
        <KpiCard label="Restricted Zones" value={restrictedCount} sub="No-entry policies" tone="red" />
      </div>

      {/* ── Split view: map + list ─────────────────────────────────────────── */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 flex-1 min-h-0">
        {/* LEFT — facility map */}
        <div className="glass-panel rounded-xl p-5 flex flex-col">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h3 className="text-base font-semibold text-slate-800">Facility Floor-Plan</h3>
              <p className="text-xs text-slate-500 mt-0.5">
                Hyderabad Central Warehouse · Building A · {filtered.length} of {total} geofences shown
              </p>
            </div>
          </div>

          <div className="relative w-full rounded-lg overflow-hidden border border-slate-200 bg-slate-50">
            <svg viewBox="0 0 100 100" className="w-full h-auto block" role="img" aria-label="Facility geofence map">
              <defs>
                <pattern id="gfGrid" width="5" height="5" patternUnits="userSpaceOnUse">
                  <path d="M 5 0 L 0 0 0 5" fill="none" stroke="rgba(100,116,139,0.14)" strokeWidth="0.15" />
                </pattern>
              </defs>

              {/* Backdrop */}
              <rect x="0" y="0" width="100" height="100" fill="#ffffff" />
              <rect x="0" y="0" width="100" height="100" fill="url(#gfGrid)" />
              <rect x="0.5" y="0.5" width="99" height="99" rx="2" fill="none" stroke="rgba(100,116,139,0.22)" strokeWidth="0.3" />

              {/* Faint zone outlines for orientation */}
              {mockZones.map((z) => (
                <rect
                  key={z.id}
                  x={z.x}
                  y={z.y}
                  width={z.width}
                  height={z.height}
                  rx="1.5"
                  fill="none"
                  stroke="rgba(100,116,139,0.16)"
                  strokeWidth="0.3"
                  strokeDasharray="1 1"
                />
              ))}

              {/* Geofence rectangles */}
              {filtered.map((g) => {
                const style = RULE_STYLE[g.rule];
                const active = isActive(g);
                const focused = g.id === activeId;
                const dim = activeId != null && !focused;
                return (
                  <g
                    key={g.id}
                    className="cursor-pointer transition-opacity duration-200"
                    opacity={dim ? 0.35 : 1}
                    onMouseEnter={() => setHoveredId(g.id)}
                    onMouseLeave={() => setHoveredId(null)}
                    onClick={() => setSelectedId((prev) => (prev === g.id ? null : g.id))}
                  >
                    <rect
                      x={g.x}
                      y={g.y}
                      width={g.width}
                      height={g.height}
                      rx="1.5"
                      fill={active ? style.fill : 'rgba(148,163,184,0.06)'}
                      stroke={active ? style.color : 'rgba(148,163,184,0.55)'}
                      strokeWidth={focused ? 0.9 : 0.5}
                      strokeDasharray={active ? undefined : '1.4 1.2'}
                    />
                    {/* Name label */}
                    <text
                      x={g.x + 2}
                      y={g.y + 4.2}
                      fontSize="2.3"
                      fontWeight="700"
                      fill={active ? style.color : 'rgba(100,116,139,0.85)'}
                      className="font-heading select-none pointer-events-none"
                    >
                      {g.name}
                    </text>
                    {/* Breach badge (top-right of rect) */}
                    {g.breaches24h > 0 && (
                      <g className="pointer-events-none">
                        <circle cx={g.x + g.width - 2.6} cy={g.y + 2.8} r="2" fill={style.color} />
                        <text
                          x={g.x + g.width - 2.6}
                          y={g.y + 3.6}
                          fontSize="2.1"
                          fontWeight="700"
                          textAnchor="middle"
                          fill="#ffffff"
                          className="select-none"
                        >
                          {g.breaches24h}
                        </text>
                      </g>
                    )}
                  </g>
                );
              })}

              {/* Asset dots */}
              {markers.map((a) => {
                const p = a.mapPosition!;
                const c = markerColor(a);
                return (
                  <g key={a.id} className="pointer-events-none">
                    <circle cx={p.x} cy={p.y} r="2.2" fill={c} opacity="0.2" />
                    <circle cx={p.x} cy={p.y} r="1.5" fill={c} stroke="#ffffff" strokeWidth="0.5" />
                  </g>
                );
              })}
            </svg>
          </div>

          {/* Legend */}
          <div className="mt-4 flex flex-wrap items-center gap-x-5 gap-y-2 text-[11px] text-slate-500">
            <span className="font-semibold uppercase tracking-wide text-slate-400">Rules</span>
            {RULES.map((r) => (
              <span key={r} className="inline-flex items-center gap-1.5">
                <span
                  className="h-2.5 w-2.5 rounded-sm border"
                  style={{ backgroundColor: RULE_STYLE[r].fill, borderColor: RULE_STYLE[r].color }}
                />
                {RULE_STYLE[r].label}
              </span>
            ))}
          </div>
        </div>

        {/* RIGHT — geofence list */}
        <div className="glass-panel rounded-xl p-5 flex flex-col min-h-0">
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-base font-semibold text-slate-800">Geofences</h3>
            <span className="text-xs font-medium px-2 py-1 bg-primary-50 text-primary-700 rounded-full">
              {filtered.length} shown
            </span>
          </div>

          {/* Filter chips */}
          <div className="flex flex-wrap gap-2 mb-4">
            {filterChips.map((c) => {
              const on = filter === c.key;
              return (
                <button
                  key={c.key}
                  onClick={() => setFilter(c.key)}
                  className={cn(
                    'px-3 py-1 rounded-full text-xs font-medium border transition-colors',
                    on
                      ? 'bg-primary-600 text-white border-primary-600'
                      : 'bg-slate-100 text-slate-600 border-transparent hover:bg-slate-200',
                  )}
                >
                  {c.label}
                  <span className={cn('ml-1.5', on ? 'text-primary-100' : 'text-slate-400')}>{c.count}</span>
                </button>
              );
            })}
          </div>

          <div className="flex-1 min-h-0 overflow-y-auto pr-1 -mr-1 space-y-2">
            {filtered.map((g) => {
              const style = RULE_STYLE[g.rule];
              const focused = g.id === activeId;
              const active = isActive(g);
              const zone = mockZones.find((z) => z.id === g.zoneId);
              return (
                <div
                  key={g.id}
                  onMouseEnter={() => setHoveredId(g.id)}
                  onMouseLeave={() => setHoveredId(null)}
                  onClick={() => setSelectedId((prev) => (prev === g.id ? null : g.id))}
                  className={cn(
                    'group rounded-lg border p-3 cursor-pointer transition-colors',
                    focused ? 'border-primary-500/60 bg-primary-50/50' : 'border-slate-200 hover:bg-slate-50',
                  )}
                >
                  <div className="flex items-center gap-3">
                    <span
                      className="h-8 w-8 shrink-0 rounded-md border"
                      style={{ backgroundColor: style.fill, borderColor: style.color }}
                      aria-hidden
                    />
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <span className="truncate text-sm font-semibold text-slate-900">{g.name}</span>
                        <Badge tone={style.tone}>{g.rule}</Badge>
                      </div>
                      <div className="mt-0.5 text-xs text-slate-500 truncate">
                        {zone ? zone.name : 'Custom area'} · {g.id}
                      </div>
                    </div>

                    <div className="flex items-center gap-3 shrink-0">
                      <div className="text-right">
                        <div
                          className={cn(
                            'text-sm font-bold font-heading',
                            g.breaches24h > 0 ? 'text-amber-600' : 'text-slate-400',
                          )}
                        >
                          {g.breaches24h}
                        </div>
                        <div className="text-[10px] uppercase tracking-wide text-slate-400">breaches</div>
                      </div>

                      {/* Active toggle */}
                      <button
                        type="button"
                        role="switch"
                        aria-checked={active}
                        aria-label={`Toggle ${g.name}`}
                        onClick={(e) => {
                          e.stopPropagation();
                          setActiveMap((m) => ({ ...m, [g.id]: !m[g.id] }));
                        }}
                        className={cn(
                          'relative h-5 w-9 shrink-0 rounded-full transition-colors',
                          active ? 'bg-primary-600' : 'bg-slate-300',
                        )}
                      >
                        <span
                          className={cn(
                            'absolute top-0.5 h-4 w-4 rounded-full bg-white shadow transition-transform',
                            active ? 'translate-x-4' : 'translate-x-0.5',
                          )}
                        />
                      </button>
                    </div>
                  </div>
                </div>
              );
            })}

            {filtered.length === 0 && (
              <div className="flex h-32 items-center justify-center text-sm text-slate-400">
                No geofences match this rule.
              </div>
            )}
          </div>

          <div className="mt-3 border-t border-slate-100 pt-3">
            <Link
              to="/geofences/new"
              className="text-sm font-medium text-primary-600 hover:underline inline-flex items-center gap-1"
            >
              ＋ Create a new geofence
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}
