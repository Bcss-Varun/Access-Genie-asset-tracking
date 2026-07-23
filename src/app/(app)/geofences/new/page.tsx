'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/Button';
import { PageHeader, Badge } from '@/components/ui/primitives';
import { useToast } from '@/components/providers/ToastProvider';
import { mockZones, mockAssets } from '@/lib/mock-data';
import type { Asset, GeofenceRule } from '@/types/asset';
import { cn } from '@/lib/utils';

// ── Rule → visual identity (shared with the list view) ────────────────────────
const RULE_STYLE: Record<
  GeofenceRule,
  { color: string; fill: string; tone: 'red' | 'amber' | 'primary' | 'emerald'; label: string; hint: string }
> = {
  Entry: { color: '#10b981', fill: 'rgba(16,185,129,0.12)', tone: 'emerald', label: 'Entry', hint: 'Alert when an asset enters this area.' },
  Exit: { color: '#f59e0b', fill: 'rgba(245,158,11,0.12)', tone: 'amber', label: 'Exit', hint: 'Alert when an asset leaves this area.' },
  Dwell: { color: '#6366f1', fill: 'rgba(14,165,233,0.12)', tone: 'primary', label: 'Dwell', hint: 'Alert when an asset stays longer than the threshold.' },
  Restricted: { color: '#ef4444', fill: 'rgba(239,68,68,0.12)', tone: 'red', label: 'Restricted', hint: 'Alert on any presence in this no-entry area.' },
};

const RULES: GeofenceRule[] = ['Entry', 'Exit', 'Dwell', 'Restricted'];

const ALERT_CHANNELS = [
  { key: 'inApp', label: 'In-app notification' },
  { key: 'email', label: 'Email' },
  { key: 'sms', label: 'SMS' },
  { key: 'webhook', label: 'Webhook / SIEM' },
];

function markerColor(a: Asset): string {
  if (a.status === 'Missing' || a.status === 'Maintenance' || a.healthStatus === 'Critical') return '#ef4444';
  if (a.healthStatus === 'Warning') return '#f59e0b';
  return '#10b981';
}

export default function NewGeofencePage() {
  const router = useRouter();
  const { toast } = useToast();

  const [name, setName] = useState('');
  const [zoneId, setZoneId] = useState<string>(mockZones[0]?.id ?? '');
  const [rule, setRule] = useState<GeofenceRule>('Restricted');
  const [dwellMinutes, setDwellMinutes] = useState(30);
  const [active, setActive] = useState(true);
  const [channels, setChannels] = useState<Record<string, boolean>>({ inApp: true, email: true });

  const zone = useMemo(() => mockZones.find((z) => z.id === zoneId), [zoneId]);
  const style = RULE_STYLE[rule];
  const markers = mockAssets.filter((a) => a.mapPosition);

  const canCreate = name.trim().length > 0 && !!zone;

  function handleCreate() {
    if (!canCreate) {
      toast({ title: 'Name required', description: 'Give the geofence a name and pick a target zone.', tone: 'error' });
      return;
    }
    toast({
      title: 'Geofence created',
      description: `${name.trim()} · ${rule} rule on ${zone!.name}${active ? '' : ' (paused)'}.`,
      tone: 'success',
    });
    router.push('/geofences');
  }

  return (
    <div className="h-full flex flex-col space-y-6">
      <PageHeader
        title="New Geofence"
        subtitle="Draw a virtual boundary over a zone and choose how it should alert."
        breadcrumb={[
          { label: 'Tracking', href: '/tracking' },
          { label: 'Geofences', href: '/geofences' },
          { label: 'New' },
        ]}
        actions={
          <div className="flex items-center gap-2">
            <Link href="/geofences">
              <Button variant="outline">Cancel</Button>
            </Link>
            <Button onClick={handleCreate} disabled={!canCreate}>
              Create geofence
            </Button>
          </div>
        }
      />

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 flex-1 min-h-0">
        {/* LEFT — map with live preview */}
        <div className="glass-panel rounded-xl p-5 flex flex-col">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h3 className="text-base font-semibold text-slate-800">Live Preview</h3>
              <p className="text-xs text-slate-500 mt-0.5">Pick a zone to seed the boundary rectangle.</p>
            </div>
            <Badge tone={style.tone}>{rule}</Badge>
          </div>

          <div className="relative w-full rounded-lg overflow-hidden border border-slate-200 bg-slate-50">
            <svg viewBox="0 0 100 100" className="w-full h-auto block" role="img" aria-label="Geofence editor map">
              <defs>
                <pattern id="editGrid" width="5" height="5" patternUnits="userSpaceOnUse">
                  <path d="M 5 0 L 0 0 0 5" fill="none" stroke="rgba(100,116,139,0.14)" strokeWidth="0.15" />
                </pattern>
              </defs>

              <rect x="0" y="0" width="100" height="100" fill="#ffffff" />
              <rect x="0" y="0" width="100" height="100" fill="url(#editGrid)" />
              <rect x="0.5" y="0.5" width="99" height="99" rx="2" fill="none" stroke="rgba(100,116,139,0.22)" strokeWidth="0.3" />

              {/* All zones — clickable to seed the geofence */}
              {mockZones.map((z) => {
                const selected = z.id === zoneId;
                return (
                  <g
                    key={z.id}
                    className="cursor-pointer transition-opacity duration-200"
                    opacity={selected ? 1 : 0.7}
                    onClick={() => setZoneId(z.id)}
                  >
                    <rect
                      x={z.x}
                      y={z.y}
                      width={z.width}
                      height={z.height}
                      rx="1.5"
                      fill="rgba(148,163,184,0.06)"
                      stroke="rgba(100,116,139,0.3)"
                      strokeWidth="0.3"
                      strokeDasharray="1 1"
                    />
                    <text
                      x={z.x + 2}
                      y={z.y + 4}
                      fontSize="2.2"
                      fontWeight="600"
                      fill="rgba(100,116,139,0.8)"
                      className="font-heading select-none pointer-events-none"
                    >
                      {z.name}
                    </text>
                  </g>
                );
              })}

              {/* Live geofence preview over the selected zone */}
              {zone && (
                <g className="pointer-events-none">
                  <rect
                    x={zone.x}
                    y={zone.y}
                    width={zone.width}
                    height={zone.height}
                    rx="1.5"
                    fill={active ? style.fill : 'rgba(148,163,184,0.1)'}
                    stroke={style.color}
                    strokeWidth="0.9"
                    strokeDasharray={active ? undefined : '1.4 1.2'}
                  >
                    <animate attributeName="opacity" values="0.6;1;0.6" dur="2.4s" repeatCount="indefinite" />
                  </rect>
                  <text
                    x={zone.x + 2}
                    y={zone.y + 4.2}
                    fontSize="2.4"
                    fontWeight="700"
                    fill={style.color}
                    className="font-heading select-none"
                  >
                    {name.trim() || 'New geofence'}
                  </text>
                </g>
              )}

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

          <p className="mt-4 text-xs text-slate-500">{style.hint}</p>
        </div>

        {/* RIGHT — configuration form */}
        <div className="glass-panel rounded-xl p-5 flex flex-col min-h-0 overflow-y-auto">
          <h3 className="text-base font-semibold text-slate-800 mb-4">Configuration</h3>

          <div className="space-y-5">
            {/* Name */}
            <div>
              <label htmlFor="gf-name" className="block text-sm font-medium text-slate-700 mb-1.5">
                Geofence name
              </label>
              <input
                id="gf-name"
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="e.g. Restricted Data Center"
                className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 placeholder:text-slate-400 focus:border-primary-500 focus:outline-none focus:ring-2 focus:ring-primary-500/30"
              />
            </div>

            {/* Target zone */}
            <div>
              <label htmlFor="gf-zone" className="block text-sm font-medium text-slate-700 mb-1.5">
                Target zone
              </label>
              <select
                id="gf-zone"
                value={zoneId}
                onChange={(e) => setZoneId(e.target.value)}
                className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 focus:border-primary-500 focus:outline-none focus:ring-2 focus:ring-primary-500/30"
              >
                {mockZones.map((z) => (
                  <option key={z.id} value={z.id}>
                    {z.name}
                  </option>
                ))}
              </select>
              <p className="mt-1 text-xs text-slate-400">
                Seeds the rectangle from the zone bounds — click a zone on the map too.
              </p>
            </div>

            {/* Rule */}
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1.5">Rule type</label>
              <div className="grid grid-cols-2 gap-2">
                {RULES.map((r) => {
                  const rs = RULE_STYLE[r];
                  const on = rule === r;
                  return (
                    <button
                      key={r}
                      type="button"
                      onClick={() => setRule(r)}
                      className={cn(
                        'flex items-center gap-2 rounded-lg border px-3 py-2 text-sm font-medium transition-colors',
                        on ? 'bg-white shadow-sm' : 'border-slate-200 bg-white hover:bg-slate-50',
                      )}
                      style={on ? { borderColor: rs.color } : undefined}
                    >
                      <span className="h-3 w-3 rounded-sm" style={{ backgroundColor: rs.color }} />
                      <span className="text-slate-800">{rs.label}</span>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Dwell threshold (conditional) */}
            {rule === 'Dwell' && (
              <div>
                <label htmlFor="gf-dwell" className="block text-sm font-medium text-slate-700 mb-1.5">
                  Dwell-time threshold
                </label>
                <div className="flex items-center gap-3">
                  <input
                    id="gf-dwell"
                    type="range"
                    min={5}
                    max={240}
                    step={5}
                    value={dwellMinutes}
                    onChange={(e) => setDwellMinutes(Number(e.target.value))}
                    className="flex-1 accent-primary-600"
                  />
                  <span className="w-20 shrink-0 text-right text-sm font-semibold text-slate-800">
                    {dwellMinutes} min
                  </span>
                </div>
                <p className="mt-1 text-xs text-slate-400">
                  Fire an alert once an asset dwells beyond this duration.
                </p>
              </div>
            )}

            {/* Alert channels */}
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1.5">Alert channels</label>
              <div className="grid grid-cols-2 gap-2">
                {ALERT_CHANNELS.map((ch) => {
                  const on = !!channels[ch.key];
                  return (
                    <label
                      key={ch.key}
                      className={cn(
                        'flex items-center gap-2 rounded-lg border px-3 py-2 text-sm cursor-pointer transition-colors',
                        on ? 'border-primary-500 bg-primary-50/60' : 'border-slate-200 bg-white hover:bg-slate-50',
                      )}
                    >
                      <input
                        type="checkbox"
                        checked={on}
                        onChange={() => setChannels((c) => ({ ...c, [ch.key]: !c[ch.key] }))}
                        className="h-4 w-4 rounded border-slate-300 accent-primary-600"
                      />
                      <span className="text-slate-700">{ch.label}</span>
                    </label>
                  );
                })}
              </div>
            </div>

            {/* Active toggle */}
            <div className="flex items-center justify-between rounded-lg border border-slate-200 bg-white px-3 py-3">
              <div>
                <div className="text-sm font-medium text-slate-800">Active on create</div>
                <div className="text-xs text-slate-400">Start monitoring immediately.</div>
              </div>
              <button
                type="button"
                role="switch"
                aria-checked={active}
                aria-label="Active on create"
                onClick={() => setActive((v) => !v)}
                className={cn(
                  'relative h-6 w-11 shrink-0 rounded-full transition-colors',
                  active ? 'bg-primary-600' : 'bg-slate-300',
                )}
              >
                <span
                  className={cn(
                    'absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition-transform',
                    active ? 'translate-x-5' : 'translate-x-0.5',
                  )}
                />
              </button>
            </div>
          </div>

          <div className="mt-6 flex items-center justify-end gap-2 border-t border-slate-100 pt-4">
            <Link href="/geofences">
              <Button variant="outline">Cancel</Button>
            </Link>
            <Button onClick={handleCreate} disabled={!canCreate}>
              Create geofence
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
