import { useState } from 'react';
import type { ApiKey } from '@access-genie/shared';
import { allApiKeys } from '@/lib/dataset';
import { PageHeader, Badge, EmptyState } from '@/components/ui/primitives';
import { Button } from '@/components/ui/Button';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import { FormDialog, Field, TextInput } from '@/components/ui/FormDialog';
import { SettingsNav } from '@/components/settings/SettingsNav';
import { useToast } from '@/components/providers/ToastProvider';
import { useMutate } from '@/api/mutate';
import { apiKeysApi, type IssuedApiKey } from '@/api/platform';
import { relTime } from '@/lib/utils';

/**
 * Personal access tokens.
 *
 * Generating one used to raise "copy it now — it will not be shown again" over
 * a token that was never minted. It is minted server-side now, and the secret
 * genuinely is shown exactly once: only its last four characters are stored, so
 * there is nothing to show a second time.
 */

const th = 'px-4 py-3 text-left font-semibold uppercase tracking-wider text-[11px] text-slate-500';
const td = 'px-4 py-3.5';

/** What a personal token may do. Kept short — a token should hold the least it needs. */
const SCOPE_OPTIONS = [
  'assets:read',
  'assets:write',
  'tracking:read',
  'tracking:write',
  'maintenance:read',
  'maintenance:write',
  'inventory:read',
  'analytics:read',
];

function GenerateDialog({ onIssued, onClose }: { onIssued: (key: IssuedApiKey) => void; onClose: () => void }) {
  const { run, isPending } = useMutate();
  const [name, setName] = useState('');
  const [scopes, setScopes] = useState<string[]>(['assets:read']);

  const toggle = (scope: string) =>
    setScopes((prev) => (prev.includes(scope) ? prev.filter((s) => s !== scope) : [...prev, scope]));

  const submit = async () => {
    const issued = await run(apiKeysApi.create({ name: name.trim(), scope: 'personal', scopes }), {
      describe: 'generate that token',
    });
    if (!issued) return;
    onIssued(issued);
    onClose();
  };

  return (
    <FormDialog
      icon="🔑"
      title="Generate a personal token"
      description="It acts as you, limited to the scopes you pick. The secret is shown once and never stored."
      submitLabel="Generate"
      busy={isPending}
      disabled={name.trim().length < 1 || scopes.length === 0}
      onSubmit={() => void submit()}
      onCancel={onClose}
    >
      <Field label="What is it for" required hint="A name you will recognise in six months.">
        <TextInput autoFocus value={name} onChange={(e) => setName(e.target.value)} placeholder="Nightly stock sync script" />
      </Field>

      <Field label={`Scopes — ${scopes.length} selected`} required>
        <div className="grid grid-cols-1 gap-1.5 rounded-lg border border-slate-200 p-3 sm:grid-cols-2">
          {SCOPE_OPTIONS.map((scope) => (
            <label key={scope} className="flex cursor-pointer items-center gap-2 text-sm text-slate-700">
              <input
                type="checkbox"
                checked={scopes.includes(scope)}
                onChange={() => toggle(scope)}
                className="h-4 w-4 rounded border-slate-300 text-primary-600 focus:ring-primary-500/30"
              />
              <code className="font-mono text-xs">{scope}</code>
            </label>
          ))}
        </div>
      </Field>
    </FormDialog>
  );
}

export default function ApiTokensSettingsPage() {
  const { toast } = useToast();
  const { run, isPending } = useMutate();

  // Read inside the component so a refetch after issuing is picked up.
  const TOKENS = allApiKeys.filter((k) => k.scope === 'personal');

  const [generating, setGenerating] = useState(false);
  const [issued, setIssued] = useState<IssuedApiKey | null>(null);
  const [revoking, setRevoking] = useState<ApiKey | null>(null);

  const onGenerate = () => setGenerating(true);

  const revoke = async () => {
    if (!revoking) return;
    await run(apiKeysApi.revoke(revoking.id), {
      success: 'Token revoked',
      successDetail: `“${revoking.name}” can no longer access the API.`,
      describe: 'revoke that token',
    });
    setRevoking(null);
  };

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
                      <span className="font-mono text-xs text-slate-600">{`agk_••••••••${t.last4}`}</span>
                    </td>
                    <td className={td}>
                      <div className="flex flex-wrap gap-1">
                        {t.scopes.map((s) => <Badge key={s} tone="slate">{s}</Badge>)}
                      </div>
                    </td>
                    <td className={td + ' text-slate-500 whitespace-nowrap'}>{relTime(t.createdAt)}</td>
                    <td className={td + ' whitespace-nowrap'}>
                      {t.lastUsed ? <span className="text-slate-500">{relTime(t.lastUsed)}</span> : <span className="text-slate-400">Never</span>}
                    </td>
                    <td className={td + ' text-right'}>
                      <Button variant="ghost" size="sm" onClick={() => setRevoking(t)}>Revoke</Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {generating && <GenerateDialog onIssued={setIssued} onClose={() => setGenerating(false)} />}

      {/*
        Shown once, and only once — the server keeps the last four characters
        and nothing else, so there is no second chance to reveal it.
      */}
      {issued && (
        <FormDialog
          icon="🔑"
          title="Copy your token now"
          description="This is the only time it will be shown. Store it somewhere safe before closing."
          submitLabel="I have copied it"
          cancelLabel="Close"
          onSubmit={() => setIssued(null)}
          onCancel={() => setIssued(null)}
        >
          <Field label={issued.name}>
            <div className="flex gap-2">
              <TextInput readOnly value={issued.secret} className="font-mono text-xs" onFocus={(e) => e.currentTarget.select()} />
              <button
                type="button"
                onClick={() => {
                  void navigator.clipboard.writeText(issued.secret);
                  toast({ title: 'Copied', description: 'The token is on your clipboard.', tone: 'success' });
                }}
                className="shrink-0 rounded-lg border border-slate-300 px-3 text-sm font-medium text-slate-600 hover:bg-slate-50"
              >
                Copy
              </button>
            </div>
          </Field>
          <p className="text-xs text-slate-500">
            Send it as <code className="font-mono">Authorization: Bearer &lt;token&gt;</code>. Scopes:{' '}
            {issued.scopes.join(', ')}.
          </p>
        </FormDialog>
      )}

      {revoking && (
        <ConfirmDialog
          title={`Revoke “${revoking.name}”?`}
          description="Anything using this token stops working immediately. The record is kept so the audit log still resolves."
          confirmLabel="Revoke"
          busy={isPending}
          onConfirm={() => void revoke()}
          onCancel={() => setRevoking(null)}
        />
      )}
    </div>
  );
}
