import { Link } from 'react-router-dom';
import { mockAssets, mockZones, mockSensors } from '@/lib/mock-data';
import { PageHeader, KpiCard } from '@/components/ui/primitives';

// ─────────────────────────────────────────────────────────────────────────────
// Facilities — derived from the scope-tree idea (hardcoded demo list). Each maps
// to a location.name used by the asset graph so we can count assets loosely.
// ─────────────────────────────────────────────────────────────────────────────
type Facility = {
  slug: string;
  name: string;
  locationName: string;
  building: string;
  blurb: string;
  emoji: string;
};

const FACILITIES: Facility[] = [
  {
    slug: 'central-warehouse',
    name: 'Hyderabad Central Warehouse',
    locationName: 'Hyderabad Central Warehouse',
    building: 'Building A · Loading, Staging & Secure Cage',
    blurb: 'Live UWB + RFID grid across dock, storeroom, staging and yard zones.',
    emoji: '🏭',
  },
  {
    slug: 'hq-building',
    name: 'Bengaluru HQ',
    locationName: 'Bengaluru HQ',
    building: 'Floors 1–4 · Offices, Design Studio & IT Storeroom',
    blurb: 'BLE-tracked endpoint fleet with geofenced IT storerooms and custody monitoring.',
    emoji: '🏢',
  },
  {
    slug: 'primary-data-center',
    name: 'Chennai Data Center',
    locationName: 'Chennai Data Center',
    building: 'Server Room Alpha · Restricted',
    blurb: 'Rack-level RFID tracking with thermal and access-restricted geofences.',
    emoji: '🖥️',
  },
];

export default function DigitalTwinIndexPage() {
  const totalZones = mockZones.length;
  const totalAssets = mockAssets.length;
  const liveSensors = mockSensors.filter((s) => s.status !== 'Offline').length;

  const facilityStats = FACILITIES.map((f) => {
    const assets = mockAssets.filter((a) => a.location.name === f.locationName);
    const good = assets.filter(
      (a) => a.healthStatus === 'Good' && a.status !== 'Missing' && a.status !== 'Maintenance',
    ).length;
    const warn = assets.filter(
      (a) => a.healthStatus === 'Warning' && a.status !== 'Missing',
    ).length;
    const crit = assets.length - good - warn;
    return { ...f, assets, good, warn, crit };
  });

  return (
    <div className="h-full flex flex-col space-y-6">
      <PageHeader
        title="Digital Twin"
        subtitle="A live 2D operational model of every facility — zones, assets, sensors and geofences on one canvas."
        breadcrumb={[
          { label: 'Tracking', href: '/tracking' },
          { label: 'Digital Twin' },
        ]}
      />

      {/* KPI row */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <KpiCard label="Facilities" value={FACILITIES.length} sub="Modeled twins" tone="primary" accent />
        <KpiCard label="Zones" value={totalZones} sub="Mapped floor areas" />
        <KpiCard label="Tracked Assets" value={totalAssets} sub="On the RTLS grid" tone="emerald" />
        <KpiCard label="Live Sensors" value={liveSensors} sub={`of ${mockSensors.length} deployed`} tone="primary" />
      </div>

      {/* Facility cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-5">
        {facilityStats.map((f) => (
          <Link
            key={f.slug}
            to={`/twin/${f.slug}`}
            className="group glass-panel rounded-xl p-5 flex flex-col transition-all hover:-translate-y-0.5 hover:shadow-lg hover:border-primary-300"
          >
            <div className="flex items-start justify-between gap-3">
              <div className="flex items-center gap-3 min-w-0">
                <span className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-primary-50 text-2xl">
                  {f.emoji}
                </span>
                <div className="min-w-0">
                  <h3 className="font-heading font-bold text-slate-900 truncate">{f.name}</h3>
                  <p className="text-xs text-slate-500 truncate">{f.building}</p>
                </div>
              </div>
              <span className="text-3xl font-bold font-heading text-slate-900 leading-none">{f.assets.length}</span>
            </div>

            <p className="mt-3 text-sm text-slate-500 flex-1">{f.blurb}</p>

            {/* Health distribution bar */}
            <div className="mt-4">
              <div className="flex h-2 w-full overflow-hidden rounded-full bg-slate-100">
                <div className="h-full bg-health-good" style={{ width: `${(f.good / Math.max(1, f.assets.length)) * 100}%` }} />
                <div className="h-full bg-health-warning" style={{ width: `${(f.warn / Math.max(1, f.assets.length)) * 100}%` }} />
                <div className="h-full bg-health-critical" style={{ width: `${(f.crit / Math.max(1, f.assets.length)) * 100}%` }} />
              </div>
              <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-[11px] text-slate-500">
                <span className="inline-flex items-center gap-1.5"><span className="h-2 w-2 rounded-full bg-health-good" />{f.good} healthy</span>
                <span className="inline-flex items-center gap-1.5"><span className="h-2 w-2 rounded-full bg-health-warning" />{f.warn} warning</span>
                <span className="inline-flex items-center gap-1.5"><span className="h-2 w-2 rounded-full bg-health-critical" />{f.crit} critical</span>
              </div>
            </div>

            <div className="mt-4 flex items-center justify-end border-t border-slate-100 pt-3">
              <span className="text-xs font-semibold text-primary-600 opacity-0 transition-opacity group-hover:opacity-100">
                Open twin →
              </span>
            </div>
          </Link>
        ))}
      </div>
    </div>
  );
}
