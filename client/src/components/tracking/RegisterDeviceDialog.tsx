// ─────────────────────────────────────────────────────────────────────────────
// RegisterDeviceDialog — onboards a tracking device (RFID / BLE / UWB / GPS /
// QR / LoRaWAN) onto the RTLS grid. In-session only: the parent holds the
// device list in state and this dialog hands back a fully-formed Sensor.
// ─────────────────────────────────────────────────────────────────────────────

import { useMemo, useState } from 'react';
import { Button } from '@/components/ui/Button';
import { mockAssets, mockGateways, nextSensorId, TAG_ID_PREFIX } from '@/lib/mock-data';
import type { Sensor, SensorKind } from '@/types/asset';
import { cn, DEMO_NOW } from '@/lib/utils';

/** Passive tags carry no cell, so the battery field is hidden for these kinds. */
const PASSIVE_KINDS: SensorKind[] = ['RFID Tag', 'QR Label'];

const KINDS: { kind: SensorKind; blurb: string }[] = [
  { kind: 'RFID Tag', blurb: 'Passive UHF label read by dock and room portals' },
  { kind: 'BLE Beacon', blurb: 'Battery beacon for room-level presence' },
  { kind: 'UWB Tag', blurb: 'Sub-metre precision against anchor clusters' },
  { kind: 'GPS Tracker', blurb: 'Outdoor and in-transit tracking over LTE' },
  { kind: 'QR Label', blurb: 'Printed code scanned at kiosks and by mobile' },
  { kind: 'LoRaWAN Sensor', blurb: 'Long-range low-power contact and door sensors' },
  { kind: 'Environmental', blurb: 'Temperature, humidity and airflow probes' },
];

const inputCls =
  'w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-800 placeholder:text-slate-400 focus:border-primary-500 focus:outline-none focus:ring-2 focus:ring-primary-500/30 transition-colors';
const labelCls = 'block text-xs font-semibold uppercase tracking-wide text-slate-500 mb-1.5';

/** Suggest the next tag id for a kind, following that technology's convention. */
function suggestTagId(kind: SensorKind, existing: Sensor[]): string {
  const prefix = TAG_ID_PREFIX[kind] ?? 'TAG-';
  const n = existing.filter((s) => s.kind === kind).length + 1;
  const seq = String(9000 + n);
  return `${prefix}${seq}`;
}

/**
 * Mounted only while open (the parent guards with `{registerOpen && …}`), so
 * every open starts from a clean form — no reset effect needed.
 */
export function RegisterDeviceDialog({
  devices,
  onClose,
  onRegister,
}: {
  devices: Sensor[];
  onClose: () => void;
  onRegister: (device: Sensor) => void;
}) {
  const [kind, setKind] = useState<SensorKind>('BLE Beacon');
  const [name, setName] = useState('');
  const [tagId, setTagId] = useState(() => suggestTagId('BLE Beacon', devices));
  const [assetId, setAssetId] = useState('');
  const [gatewayId, setGatewayId] = useState('GW-02');
  const [zone, setZone] = useState('');
  const [firmware, setFirmware] = useState('v3.2.0');
  const [battery, setBattery] = useState('100');
  const [touched, setTouched] = useState(false);

  const passive = PASSIVE_KINDS.includes(kind);

  // Changing the technology re-suggests a matching tag id and firmware line.
  const pickKind = (k: SensorKind) => {
    setKind(k);
    setTagId(suggestTagId(k, devices));
    setFirmware(
      k === 'RFID Tag' ? 'v1.6.3'
        : k === 'UWB Tag' ? 'v2.4.1'
          : k === 'GPS Tracker' ? 'v5.1.0'
            : k === 'QR Label' ? 'n/a'
              : k === 'BLE Beacon' ? 'v3.2.0'
                : 'v1.9.4',
    );
  };

  const gateway = mockGateways.find((g) => g.id === gatewayId);
  const facility = gateway?.location.split(' · ')[0] ?? 'Unassigned';

  const duplicateTag = useMemo(
    () => devices.some((d) => d.tagId?.toLowerCase() === tagId.trim().toLowerCase()),
    [devices, tagId],
  );
  const nameError = !name.trim() ? 'Give the device a recognisable name.' : '';
  const tagError = !tagId.trim() ? 'A tag identifier is required.' : duplicateTag ? 'That tag id is already registered.' : '';
  const valid = !nameError && !tagError;

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    setTouched(true);
    if (!valid) return;

    const asset = mockAssets.find((a) => a.id === assetId);
    const batteryNum = Number(battery);
    const device: Sensor = {
      id: nextSensorId(devices),
      name: name.trim(),
      kind,
      assetId: asset?.id,
      assetName: asset?.name,
      status: !passive && Number.isFinite(batteryNum) && batteryNum < 20 ? 'Low Battery' : 'Online',
      batteryLevel: passive ? undefined : Math.max(0, Math.min(100, Number.isFinite(batteryNum) ? batteryNum : 100)),
      signalStrength: passive ? 100 : 90,
      firmwareVersion: firmware.trim() || 'n/a',
      gatewayId,
      zone: zone.trim() || gateway?.location.split(' · ')[1] || undefined,
      tagId: tagId.trim(),
      facility,
      // Stamp on the demo clock, not the wall clock — every other timestamp in
      // the app is anchored to DEMO_NOW, so a real `new Date()` would render the
      // brand-new device as reporting from the future.
      lastReading: new Date(DEMO_NOW).toISOString(),
      registeredInSession: true,
    };
    onRegister(device);
  };

  return (
    <div className="fixed inset-0 z-[95] flex items-start justify-center overflow-y-auto p-4 py-[6vh]" role="dialog" aria-modal="true" aria-label="Register a tracking device">
      <div className="absolute inset-0 bg-slate-900/40 backdrop-blur-sm" onClick={onClose} />

      <form
        onSubmit={submit}
        className="relative w-full max-w-2xl rounded-2xl border border-slate-200 bg-white shadow-2xl"
      >
        {/* Header */}
        <div className="flex items-start justify-between gap-4 border-b border-slate-100 px-6 py-4">
          <div>
            <h2 className="font-heading text-lg font-bold text-slate-900">Register tracking device</h2>
            <p className="mt-0.5 text-sm text-slate-500">
              Onboard a tag, beacon or sensor and bond it to an asset and gateway.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="rounded-lg px-2 py-1 text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-700"
          >
            ✕
          </button>
        </div>

        <div className="space-y-5 px-6 py-5">
          {/* Technology picker */}
          <div>
            <span className={labelCls}>Tracking technology</span>
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
              {KINDS.map(({ kind: k, blurb }) => {
                const on = kind === k;
                return (
                  <button
                    key={k}
                    type="button"
                    onClick={() => pickKind(k)}
                    aria-pressed={on}
                    className={cn(
                      'rounded-lg border px-3 py-2 text-left transition-colors',
                      on
                        ? 'border-primary-500 bg-primary-50 ring-2 ring-primary-500/25'
                        : 'border-slate-200 hover:bg-slate-50',
                    )}
                  >
                    <span className={cn('block text-sm font-semibold', on ? 'text-primary-700' : 'text-slate-800')}>{k}</span>
                    <span className="mt-0.5 block text-[11px] leading-snug text-slate-500">{blurb}</span>
                  </button>
                );
              })}
            </div>
          </div>

          <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
            <div>
              <label className={labelCls} htmlFor="rd-name">Device name</label>
              <input
                id="rd-name"
                className={inputCls}
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="e.g. Rack 44 Thermal Probe"
              />
              {touched && nameError && <p className="mt-1 text-xs text-health-critical">{nameError}</p>}
            </div>

            <div>
              <label className={labelCls} htmlFor="rd-tag">Tag identifier</label>
              <input
                id="rd-tag"
                className={cn(inputCls, 'font-mono text-xs')}
                value={tagId}
                onChange={(e) => setTagId(e.target.value)}
                placeholder="EPC / MAC / IMEI / QR payload"
              />
              {touched && tagError ? (
                <p className="mt-1 text-xs text-health-critical">{tagError}</p>
              ) : (
                <p className="mt-1 text-xs text-slate-400">Pre-filled to the {kind} convention — edit to match the physical tag.</p>
              )}
            </div>

            <div>
              <label className={labelCls} htmlFor="rd-asset">Bond to asset</label>
              <select id="rd-asset" className={inputCls} value={assetId} onChange={(e) => setAssetId(e.target.value)}>
                <option value="">Leave unassigned (spare stock)</option>
                {mockAssets.map((a) => (
                  <option key={a.id} value={a.id}>{a.name} · {a.id}</option>
                ))}
              </select>
            </div>

            <div>
              <label className={labelCls} htmlFor="rd-gw">Reporting gateway</label>
              <select id="rd-gw" className={inputCls} value={gatewayId} onChange={(e) => setGatewayId(e.target.value)}>
                {mockGateways.map((g) => (
                  <option key={g.id} value={g.id}>{g.id} — {g.name}</option>
                ))}
              </select>
              <p className="mt-1 text-xs text-slate-400">Facility: {facility}</p>
            </div>

            <div>
              <label className={labelCls} htmlFor="rd-zone">Zone</label>
              <input
                id="rd-zone"
                className={inputCls}
                value={zone}
                onChange={(e) => setZone(e.target.value)}
                placeholder={gateway?.location.split(' · ')[1] ?? 'e.g. Server Room Alpha'}
              />
            </div>

            <div>
              <label className={labelCls} htmlFor="rd-fw">Firmware</label>
              <input id="rd-fw" className={inputCls} value={firmware} onChange={(e) => setFirmware(e.target.value)} />
            </div>

            {!passive && (
              <div>
                <label className={labelCls} htmlFor="rd-batt">Battery level (%)</label>
                <input
                  id="rd-batt"
                  type="number"
                  min={0}
                  max={100}
                  className={inputCls}
                  value={battery}
                  onChange={(e) => setBattery(e.target.value)}
                />
                <p className="mt-1 text-xs text-slate-400">Below 20% the device registers as Low Battery.</p>
              </div>
            )}
          </div>

          {passive && (
            <p className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-500">
              {kind} is a passive tag — no battery to track. It reports whenever a reader or scan station sees it.
            </p>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end gap-2 border-t border-slate-100 px-6 py-4">
          <Button type="button" variant="outline" onClick={onClose}>Cancel</Button>
          <Button type="submit" variant="primary">Register device</Button>
        </div>
      </form>
    </div>
  );
}
