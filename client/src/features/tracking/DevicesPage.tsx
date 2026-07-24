import { useState } from 'react';
import { Link } from 'react-router-dom';
import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { SENSOR_KINDS } from '@access-genie/shared';
import { Badge, EmptyState, ErrorState, KpiCard, PageHeader, TableSkeleton } from '@/components/ui/primitives';
import { Button } from '@/components/ui/Button';
import { ApiRequestError } from '@/lib/api-client';
import { useDebounced } from '@/lib/useDebounced';
import { relTime } from '@/lib/format';
import type { Tone } from '@/lib/tone';
import { trackingApi } from './tracking-api';
import { assetsApi } from '@/features/assets/assets-api';

const STATUS_TONE: Record<string, Tone> = { Online: 'emerald', Offline: 'red', 'Low Battery': 'amber' };

export function DevicesPage() {
  const [searchInput, setSearchInput] = useState('');
  const [kind, setKind] = useState('');
  const [registering, setRegistering] = useState(false);
  const search = useDebounced(searchInput, 300);

  const filters = { limit: 50, ...(search ? { q: search } : {}), ...(kind ? { kind } : {}) };

  const { data, isPending, error, refetch } = useQuery({
    queryKey: ['sensors', filters],
    queryFn: () => trackingApi.sensors(filters),
    placeholderData: keepPreviousData,
  });

  const online = data?.items.filter((s) => s.status === 'Online').length ?? 0;
  const lowBattery = data?.items.filter((s) => s.status === 'Low Battery').length ?? 0;

  return (
    <div className="space-y-6">
      <PageHeader
        title="Tag & Device Registry"
        subtitle="Every RFID tag, BLE beacon, UWB tag, GPS tracker and QR label bonded to an asset."
        breadcrumb={[{ label: 'Real-Time Tracking' }, { label: 'Devices' }]}
        actions={
          <Button size="sm" onClick={() => setRegistering((open) => !open)}>
            {registering ? 'Close' : '➕ Register device'}
          </Button>
        }
      />

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <KpiCard label="Devices" value={data?.meta.total ?? '—'} tone="primary" accent />
        <KpiCard label="Online" value={online} tone="emerald" />
        <KpiCard label="Low battery" value={lowBattery} tone={lowBattery > 0 ? 'amber' : 'emerald'} />
        <KpiCard label="Technologies" value={new Set(data?.items.map((s) => s.kind)).size || '—'} />
      </div>

      {registering && <RegisterDeviceForm onDone={() => setRegistering(false)} />}

      <div className="glass-panel p-3 flex flex-wrap items-center gap-2">
        <input
          type="search"
          value={searchInput}
          onChange={(e) => setSearchInput(e.target.value)}
          placeholder="Search device name or tag ID…"
          aria-label="Search devices"
          className="flex-1 min-w-[220px] rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none focus:border-primary-500 focus:ring-2 focus:ring-primary-100"
        />
        <select
          value={kind}
          onChange={(e) => setKind(e.target.value)}
          aria-label="Filter by device kind"
          className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-600 outline-none focus:border-primary-500"
        >
          <option value="">All kinds</option>
          {SENSOR_KINDS.map((k) => (
            <option key={k} value={k}>
              {k}
            </option>
          ))}
        </select>
      </div>

      {error ? (
        <ErrorState title="Could not load devices" description={error instanceof ApiRequestError ? error.message : undefined} onRetry={() => void refetch()} />
      ) : isPending ? (
        <TableSkeleton rows={8} columns={5} />
      ) : data.items.length === 0 ? (
        <div className="glass-panel">
          <EmptyState variant="no-results" title="No devices match" />
        </div>
      ) : (
        <div className="glass-panel overflow-hidden overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-200 bg-slate-50/60">
                {['Device', 'Kind', 'Bonded asset', 'Status', 'Signal', 'Last reading'].map((heading) => (
                  <th key={heading} className="px-4 py-2.5 text-left text-[11px] font-semibold uppercase tracking-wide text-slate-500 whitespace-nowrap">
                    {heading}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {data.items.map((sensor) => (
                <tr key={sensor.id} className="hover:bg-slate-50 transition-colors">
                  <td className="px-4 py-3">
                    <span className="block font-medium text-slate-800">{sensor.name}</span>
                    {sensor.tagId && <span className="block text-[11px] font-mono text-slate-400">{sensor.tagId}</span>}
                  </td>
                  <td className="px-4 py-3 text-slate-600 whitespace-nowrap">{sensor.kind}</td>
                  <td className="px-4 py-3">
                    {sensor.assetId ? (
                      <Link to={`/assets/${sensor.assetId}`} className="text-primary-600 hover:text-primary-700">
                        {sensor.assetName ?? sensor.assetId}
                      </Link>
                    ) : (
                      <span className="text-slate-300">Unassigned</span>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    <Badge tone={STATUS_TONE[sensor.status] ?? 'slate'}>{sensor.status}</Badge>
                    {sensor.batteryLevel !== undefined && <span className="block text-[11px] text-slate-400 mt-1">{sensor.batteryLevel}% battery</span>}
                  </td>
                  <td className="px-4 py-3 text-slate-600 tabular-nums">{sensor.signalStrength}%</td>
                  <td className="px-4 py-3 text-slate-500 whitespace-nowrap">{relTime(sensor.lastReading)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function RegisterDeviceForm({ onDone }: { onDone: () => void }) {
  const queryClient = useQueryClient();
  const [form, setForm] = useState({ name: '', kind: 'RFID Tag', tagId: '', gatewayId: '', assetId: '', zone: '' });
  const [formError, setFormError] = useState<string | null>(null);

  const { data: gateways } = useQuery({ queryKey: ['gateways'], queryFn: trackingApi.gateways });
  const { data: assets } = useQuery({ queryKey: ['assets', { limit: 200 }], queryFn: () => assetsApi.list({ limit: 200, sort: 'name' }) });

  const create = useMutation({
    mutationFn: trackingApi.registerSensor,
    onSuccess: async () => {
      // Bonding writes to the asset too, so both caches are stale.
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['sensors'] }),
        queryClient.invalidateQueries({ queryKey: ['assets'] }),
        queryClient.invalidateQueries({ queryKey: ['tracking'] }),
      ]);
      onDone();
    },
    onError: (err) => setFormError(err instanceof ApiRequestError ? err.message : 'Could not register the device.'),
  });

  const inputClass =
    'w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none transition focus:border-primary-500 focus:ring-2 focus:ring-primary-100';

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        setFormError(null);
        create.mutate({
          name: form.name.trim(),
          kind: form.kind,
          gatewayId: form.gatewayId,
          ...(form.tagId.trim() ? { tagId: form.tagId.trim() } : {}),
          ...(form.assetId ? { assetId: form.assetId } : {}),
          ...(form.zone.trim() ? { zone: form.zone.trim() } : {}),
        });
      }}
      className="glass-panel p-5 grid gap-4 sm:grid-cols-2"
      noValidate
    >
      <div>
        <label className="block text-sm font-medium text-slate-700 mb-1.5">Device name</label>
        <input required value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} className={inputClass} placeholder="R760 Server RFID Tag" />
      </div>

      <div>
        <label className="block text-sm font-medium text-slate-700 mb-1.5">Kind</label>
        <select value={form.kind} onChange={(e) => setForm({ ...form, kind: e.target.value })} className={inputClass}>
          {SENSOR_KINDS.map((k) => (
            <option key={k} value={k}>
              {k}
            </option>
          ))}
        </select>
      </div>

      <div>
        <label className="block text-sm font-medium text-slate-700 mb-1.5">Tag ID</label>
        <input value={form.tagId} onChange={(e) => setForm({ ...form, tagId: e.target.value })} className={inputClass} placeholder="RFID-E28011606015" />
        <p className="text-[11px] text-slate-400 mt-1">Bonding a tag ID also stamps it onto the asset.</p>
      </div>

      <div>
        <label className="block text-sm font-medium text-slate-700 mb-1.5">Gateway</label>
        <select required value={form.gatewayId} onChange={(e) => setForm({ ...form, gatewayId: e.target.value })} className={inputClass}>
          <option value="">Select a gateway…</option>
          {gateways?.map((gateway) => (
            <option key={gateway.id} value={gateway.id}>
              {gateway.id} — {gateway.name}
            </option>
          ))}
        </select>
      </div>

      <div>
        <label className="block text-sm font-medium text-slate-700 mb-1.5">Bond to asset</label>
        <select value={form.assetId} onChange={(e) => setForm({ ...form, assetId: e.target.value })} className={inputClass}>
          <option value="">Leave unassigned</option>
          {assets?.items.map((asset) => (
            <option key={asset.id} value={asset.id}>
              {asset.id} — {asset.name}
            </option>
          ))}
        </select>
      </div>

      <div>
        <label className="block text-sm font-medium text-slate-700 mb-1.5">Zone</label>
        <input value={form.zone} onChange={(e) => setForm({ ...form, zone: e.target.value })} className={inputClass} placeholder="Server Room Alpha" />
      </div>

      {formError && (
        <p role="alert" className="sm:col-span-2 text-sm text-health-critical bg-red-50 border border-red-200 rounded-lg px-3 py-2">
          {formError}
        </p>
      )}

      <div className="sm:col-span-2 flex items-center gap-2">
        <Button type="submit" disabled={create.isPending}>
          {create.isPending ? 'Registering…' : 'Register device'}
        </Button>
        <Button type="button" variant="secondary" onClick={onDone}>
          Cancel
        </Button>
      </div>
    </form>
  );
}
