import { useState } from 'react';
import { PageHeader, Badge, KpiCard } from '@/components/ui/primitives';
import { Button } from '@/components/ui/Button';
import { useToast } from '@/components/providers/ToastProvider';
import { relTime } from '@/lib/utils';

interface ApiKey {
  id: string;
  name: string;
  last4: string;
  scopes: string[];
  created: string;
  lastUsed: string;
}

const daysAgoIso = (d: number) => new Date(Date.parse('2026-07-23T09:00:00.000Z') - d * 86_400_000).toISOString();
const hoursAgoIso = (h: number) => new Date(Date.parse('2026-07-23T09:00:00.000Z') - h * 3_600_000).toISOString();

const initialKeys: ApiKey[] = [
  { id: 'KEY-01', name: 'Production Backend', last4: '9f21', scopes: ['assets:read', 'assets:write', 'workorders:write'], created: daysAgoIso(212), lastUsed: hoursAgoIso(1) },
  { id: 'KEY-02', name: 'BI / Snowflake Export', last4: '4c7a', scopes: ['assets:read', 'telemetry:read'], created: daysAgoIso(96), lastUsed: hoursAgoIso(6) },
  { id: 'KEY-03', name: 'Mobile Scanner App', last4: '0d38', scopes: ['assets:read', 'movement:write'], created: daysAgoIso(48), lastUsed: hoursAgoIso(3) },
  { id: 'KEY-04', name: 'Zapier Automation', last4: 'b512', scopes: ['webhooks:read'], created: daysAgoIso(15), lastUsed: daysAgoIso(2) },
];

export default function ApiKeysPage() {
  const { toast } = useToast();
  const [keys, setKeys] = useState<ApiKey[]>(initialKeys);

  const generate = () => {
    const fake = 'ag_live_7Kd9Q2xR4mZ8pWvA1nL6bce';
    const id = `KEY-0${keys.length + 1}`;
    setKeys((prev) => [
      { id, name: 'New API Key', last4: 'bcde', scopes: ['assets:read'], created: daysAgoIso(0), lastUsed: 'Never' },
      ...prev,
    ]);
    toast({ title: 'API key generated', description: `Copy it now — shown once: ${fake}`, tone: 'success' });
  };

  const revoke = (k: ApiKey) => {
    setKeys((prev) => prev.filter((x) => x.id !== k.id));
    toast({ title: 'Key revoked', description: `${k.name} (ag_live_••••${k.last4}) is now invalid.`, tone: 'error' });
  };

  return (
    <div className="h-full flex flex-col space-y-6">
      <PageHeader
        title="API Keys"
        subtitle="Programmatic access tokens for the Access Genie REST & GraphQL APIs."
        breadcrumb={[{ label: 'Administration' }, { label: 'API Keys' }]}
        actions={<Button onClick={generate}>+ Generate Key</Button>}
      />

      <div className="grid grid-cols-2 gap-4 lg:max-w-md">
        <KpiCard label="Active Keys" value={keys.length} sub="In use across services" tone="primary" accent />
        <KpiCard label="Rotation" value="90d" sub="Recommended cadence" tone="slate" />
      </div>

      <div className="glass-panel rounded-xl overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-100 bg-slate-50/70 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">
                <th className="px-5 py-2.5">Name</th>
                <th className="px-5 py-2.5">Key</th>
                <th className="px-5 py-2.5">Scopes</th>
                <th className="px-5 py-2.5">Created</th>
                <th className="px-5 py-2.5">Last Used</th>
                <th className="px-5 py-2.5 text-right">Actions</th>
              </tr>
            </thead>
            <tbody>
              {keys.map((k) => (
                <tr key={k.id} className="border-b border-slate-100 last:border-0 hover:bg-slate-50/60 transition-colors">
                  <td className="px-5 py-3">
                    <div className="font-medium text-slate-900">{k.name}</div>
                    <div className="text-xs text-slate-400">{k.id}</div>
                  </td>
                  <td className="px-5 py-3">
                    <code className="font-mono text-xs text-slate-600">ag_live_••••{k.last4}</code>
                  </td>
                  <td className="px-5 py-3">
                    <div className="flex flex-wrap gap-1">
                      {k.scopes.map((s) => (
                        <Badge key={s} tone="primary">{s}</Badge>
                      ))}
                    </div>
                  </td>
                  <td className="px-5 py-3 text-slate-600">{relTime(k.created)}</td>
                  <td className="px-5 py-3 text-slate-600">{k.lastUsed === 'Never' ? 'Never' : relTime(k.lastUsed)}</td>
                  <td className="px-5 py-3 text-right">
                    <Button size="sm" variant="ghost" className="text-red-600 hover:bg-red-50" onClick={() => revoke(k)}>
                      Revoke
                    </Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
