import { allApiKeys } from '@/lib/dataset';
import type { ApiKey } from '@access-genie/shared';
import { useState } from 'react';
import { PageHeader, Badge, KpiCard } from '@/components/ui/primitives';
import { Button } from '@/components/ui/Button';
import { useToast } from '@/components/providers/ToastProvider';
import { relTime } from '@/lib/utils';
import { apiKeysApi } from '@/api/platform';
import { useMutate } from '@/api/mutate';

/**
 * Keys are issued and revoked by the server.
 *
 * This screen used to invent a key-shaped string in the browser and show it in
 * a toast — a credential that could not have authenticated anything, next to a
 * "Revoke" button that only removed a table row. The real secret is minted
 * server-side, returned exactly once on create, and stored only as its last
 * four characters.
 */
const orgKeys = () => allApiKeys.filter((k) => k.scope === 'organization' && !k.revokedAt);

export default function ApiKeysPage() {
  const { toast } = useToast();
  const { run, isPending } = useMutate();
  const [keys, setKeys] = useState<ApiKey[]>(orgKeys);

  const generate = async () => {
    const issued = await run(
      apiKeysApi.create({ name: 'New API Key', scope: 'organization', scopes: ['assets:read'] }),
      { describe: 'generate that key' },
    );
    if (!issued) return;

    setKeys((prev) => [issued, ...prev]);
    // Deliberately not a `success` toast from `run`: this one has to stay long
    // enough to copy, and it is the only time the secret is ever readable.
    toast({
      title: 'API key generated',
      description: `Copy it now — it is shown once: ${issued.secret}`,
      tone: 'success',
    });
  };

  const revoke = async (k: ApiKey) => {
    const previous = keys;
    setKeys((prev) => prev.filter((x) => x.id !== k.id));

    await run(apiKeysApi.revoke(k.id), {
      success: 'Key revoked',
      successDetail: `${k.name} (ag_live_••••${k.last4}) is now invalid.`,
      describe: 'revoke that key',
      rollback: () => setKeys(previous),
    });
  };

  return (
    <div className="h-full flex flex-col space-y-6">
      <PageHeader
        title="API Keys"
        subtitle="Programmatic access tokens for the Access Genie REST & GraphQL APIs."
        breadcrumb={[{ label: 'Administration' }, { label: 'API Keys' }]}
        actions={<Button onClick={generate} disabled={isPending}>+ Generate Key</Button>}
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
                  <td className="px-5 py-3 text-slate-600">{relTime(k.createdAt)}</td>
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
