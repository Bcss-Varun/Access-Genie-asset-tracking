import { PageHeader, Badge, EmptyState } from '@/components/ui/primitives';
import { Button } from '@/components/ui/Button';
import { SettingsNav } from '@/components/settings/SettingsNav';
import { useToast } from '@/components/providers/ToastProvider';
import { relTime } from '@/lib/utils';

interface Token {
  id: string;
  name: string;
  masked: string;
  scopes: string[];
  created: string;
  lastUsed: string | null;
}

const TOKENS: Token[] = [
  { id: 'T-1', name: 'CI/CD Pipeline', masked: 'agk_live_••••••••7f3a', scopes: ['assets:read', 'assets:write'], created: '2026-06-01T09:00:00.000Z', lastUsed: '2026-07-23T07:10:00.000Z' },
  { id: 'T-2', name: 'Grafana Exporter', masked: 'agk_live_••••••••1c9d', scopes: ['telemetry:read', 'analytics:read'], created: '2026-04-14T12:30:00.000Z', lastUsed: '2026-07-22T23:45:00.000Z' },
  { id: 'T-3', name: 'Mobile Scanner App', masked: 'agk_live_••••••••b204', scopes: ['assets:read', 'movement:write'], created: '2026-02-20T08:15:00.000Z', lastUsed: '2026-07-21T16:02:00.000Z' },
  { id: 'T-4', name: 'Legacy Import Script', masked: 'agk_live_••••••••9e51', scopes: ['inventory:write'], created: '2025-11-03T10:45:00.000Z', lastUsed: null },
];

const th = 'px-4 py-3 text-left font-semibold uppercase tracking-wider text-[11px] text-slate-500';
const td = 'px-4 py-3.5';

export default function ApiTokensSettingsPage() {
  const { toast } = useToast();

  const onGenerate = () =>
    toast({ title: 'Token generated', description: 'Copy it now — it will not be shown again.', tone: 'success' });

  return (
    <div className="h-full flex flex-col space-y-6">
      <PageHeader
        title="API Tokens"
        subtitle="Personal access tokens for scripting and integrations against the Access Genie API."
        breadcrumb={[{ label: 'Settings', href: '/settings/profile' }, { label: 'API Tokens' }]}
        actions={<Button variant="primary" onClick={onGenerate}>Generate token</Button>}
      />

      <SettingsNav />

      <div className="glass-panel rounded-xl overflow-hidden flex-1 min-h-0 flex flex-col">
        {TOKENS.length === 0 ? (
          <EmptyState icon="🔑" title="No tokens yet" description="Generate a token to start using the API." action={<Button variant="primary" onClick={onGenerate}>Generate token</Button>} />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[820px] text-sm">
              <thead className="bg-slate-50 border-b border-slate-200">
                <tr>
                  <th className={th}>Name</th>
                  <th className={th}>Token</th>
                  <th className={th}>Scopes</th>
                  <th className={th}>Created</th>
                  <th className={th}>Last used</th>
                  <th className={th}></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {TOKENS.map((t) => (
                  <tr key={t.id} className="hover:bg-slate-50 transition-colors">
                    <td className={td}>
                      <div className="font-medium text-slate-800">{t.name}</div>
                      <div className="text-xs text-slate-400">{t.id}</div>
                    </td>
                    <td className={td}>
                      <span className="font-mono text-xs text-slate-600">{t.masked}</span>
                    </td>
                    <td className={td}>
                      <div className="flex flex-wrap gap-1">
                        {t.scopes.map((s) => <Badge key={s} tone="slate">{s}</Badge>)}
                      </div>
                    </td>
                    <td className={td + ' text-slate-500 whitespace-nowrap'}>{relTime(t.created)}</td>
                    <td className={td + ' whitespace-nowrap'}>
                      {t.lastUsed ? <span className="text-slate-500">{relTime(t.lastUsed)}</span> : <span className="text-slate-400">Never</span>}
                    </td>
                    <td className={td + ' text-right'}>
                      <Button variant="ghost" size="sm" onClick={() => toast({ title: 'Token revoked', description: `“${t.name}” can no longer access the API.`, tone: 'success' })}>Revoke</Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
