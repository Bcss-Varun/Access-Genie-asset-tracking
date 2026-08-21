import { useMemo, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import {
  NOTIFICATION_CHANNELS,
  NOTIFICATION_EVENTS,
  NOTIFICATION_EVENT_LABELS,
  ROLES,
  type NotificationChannel,
  type NotificationEvent,
  type NotificationRule,
  type RoleId,
} from '@access-genie/shared';
import { scopeTree } from '@/lib/rbac';
import { ApiRequestError } from '@/api/client';
import { useMutate } from '@/api/mutate';
import {
  notificationRulesApi,
  useNotificationLog,
  useNotificationRules,
  NOTIFICATION_RULES_KEY,
  type NotificationRulePayload,
} from '@/api/admin-rules';
import { Badge, EmptyState, ErrorState, PageHeader, TableSkeleton } from '@/components/ui/primitives';
import { Button } from '@/components/ui/Button';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import { CheckField, Field, FieldRow, FormDialog, Select, TextInput } from '@/components/ui/FormDialog';
import { cn, relTime } from '@/lib/utils';

/**
 * Notification Rules.
 *
 * Two views of one feature: the rules, and the log of what they actually did.
 * The log is not a nicety — a rules screen on its own can only show intent, and
 * intent is indistinguishable from a rule that has never fired. It records the
 * outcomes where nothing was sent too, because "throttled" and "inside quiet
 * hours" are the rule working, not failing.
 *
 * `Test send` delivers to the real recipients immediately, deliberately
 * bypassing throttle and quiet hours: somebody pressing it is asking "does this
 * reach the right people", and applying the suppression rules would answer
 * "nothing happened" — the very thing they are trying to rule out.
 */

const CHANNEL_LABELS: Record<NotificationChannel, string> = {
  in_app: 'In-app',
  email: 'Email',
  webhook: 'Webhook',
};

const OUTCOME_TONE: Record<string, 'emerald' | 'amber' | 'slate' | 'red' | 'primary'> = {
  sent: 'emerald',
  test: 'primary',
  throttled: 'amber',
  quiet_hours: 'amber',
  no_recipients: 'red',
};

const OUTCOME_LABEL: Record<string, string> = {
  sent: 'Sent',
  test: 'Test send',
  throttled: 'Throttled',
  quiet_hours: 'Quiet hours',
  no_recipients: 'No recipients',
};

function scopeOptions(): { value: string; label: string }[] {
  const out: { value: string; label: string }[] = [{ value: '', label: 'Everywhere' }];
  const walk = (node: typeof scopeTree, depth: number) => {
    if (depth > 0) out.push({ value: node.id, label: `${'— '.repeat(depth - 1)}${node.name}` });
    if (depth >= 2) return;
    for (const child of node.children ?? []) walk(child, depth + 1);
  };
  walk(scopeTree, 0);
  return out;
}

/** Minutes → the phrase an administrator actually thinks in. */
function throttleLabel(minutes: number): string {
  if (minutes <= 0) return 'Every time';
  if (minutes >= 1440 && minutes % 1440 === 0) return `Once per ${minutes / 1440} day${minutes === 1440 ? '' : 's'}`;
  if (minutes >= 60 && minutes % 60 === 0) return `Once per ${minutes / 60} hour${minutes === 60 ? '' : 's'}`;
  return `Once per ${minutes} min`;
}

const THROTTLE_CHOICES = [0, 15, 60, 240, 1440, 10080];

export default function AdminNotificationRulesPage() {
  const [tab, setTab] = useState<'rules' | 'log'>('rules');
  const query = useNotificationRules();
  const log = useNotificationLog();
  const cache = useQueryClient();
  const { run, isPending } = useMutate();

  const [creating, setCreating] = useState(false);
  const [editing, setEditing] = useState<NotificationRule | null>(null);
  const [deleting, setDeleting] = useState<NotificationRule | null>(null);

  const refresh = () => cache.invalidateQueries({ queryKey: NOTIFICATION_RULES_KEY });

  const toggle = (rule: NotificationRule) =>
    void run(notificationRulesApi.update(rule.id, { status: rule.status === 'active' ? 'inactive' : 'active' }), {
      success: rule.status === 'active' ? `${rule.name} paused` : `${rule.name} is now live`,
      describe: 'change that rule',
    }).then((ok) => ok && refresh());

  const testSend = (rule: NotificationRule) =>
    void run(notificationRulesApi.test(rule.id), {
      success: `Test sent for ${rule.name}`,
      successDetail: 'Delivered to the rule’s real recipients, bypassing throttle and quiet hours.',
      describe: 'send that test',
    }).then((ok) => ok && refresh());

  const confirmDelete = async () => {
    if (!deleting) return;
    const ok = await run(notificationRulesApi.remove(deleting.id), {
      success: `${deleting.name} deleted`,
      describe: 'delete that rule',
    });
    if (ok) {
      setDeleting(null);
      void refresh();
    }
  };

  if (query.isError) {
    return (
      <div className="space-y-6">
        <PageHeader title="Notification Rules" subtitle="When the platform tells people things." />
        <ErrorState
          title="Could not load notification rules"
          description={query.error instanceof ApiRequestError ? query.error.message : 'The request failed.'}
          onRetry={() => void query.refetch()}
        />
      </div>
    );
  }

  const rules = query.data ?? [];

  return (
    <div className="h-full flex flex-col space-y-6">
      <PageHeader
        title="Notification Rules"
        subtitle="Which application events tell whom, over which channel — and the record of what was actually delivered."
        breadcrumb={[{ label: 'Administration', href: '/admin/users' }, { label: 'Notification Rules' }]}
        actions={tab === 'rules' ? <Button onClick={() => setCreating(true)}>+ New rule</Button> : undefined}
      />

      <div className="flex items-center gap-1 border-b border-slate-200">
        {(['rules', 'log'] as const).map((key) => (
          <button
            key={key}
            type="button"
            onClick={() => setTab(key)}
            aria-current={tab === key}
            className={cn(
              '-mb-px border-b-2 px-4 py-2 text-sm font-medium transition-colors',
              tab === key ? 'border-primary-600 text-primary-700' : 'border-transparent text-slate-500 hover:text-slate-700',
            )}
          >
            {key === 'rules' ? `Rules (${rules.length})` : 'Delivery log'}
          </button>
        ))}
      </div>

      {tab === 'rules' &&
        (query.isLoading ? (
          <TableSkeleton rows={4} columns={6} />
        ) : rules.length === 0 ? (
          <EmptyState
            title="No notification rules yet"
            description="A rule links an application event — an approval raised, a transfer requested — to the people who should hear about it."
            action={<Button onClick={() => setCreating(true)}>Create the first rule</Button>}
          />
        ) : (
          <div className="glass-panel rounded-xl overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-y border-slate-100 bg-slate-50/70 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">
                    <th className="px-5 py-2.5">Rule</th>
                    <th className="px-5 py-2.5">Event</th>
                    <th className="px-5 py-2.5">Recipients</th>
                    <th className="px-5 py-2.5">Channels</th>
                    <th className="px-5 py-2.5">Throttle</th>
                    <th className="px-5 py-2.5 text-right">Sent</th>
                    <th className="px-5 py-2.5">Status</th>
                    <th className="px-5 py-2.5 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {rules.map((rule) => (
                    <tr key={rule.id} className="border-b border-slate-100 last:border-0 hover:bg-slate-50/60">
                      <td className="px-5 py-3">
                        <span className="block font-medium text-slate-800">{rule.name}</span>
                        <span className="block text-xs text-slate-400">
                          {rule.scopeName ?? 'Everywhere'}
                          {rule.quietHours.enabled && ` · quiet ${rule.quietHours.start}–${rule.quietHours.end}`}
                          {rule.escalation.enabled && ` · escalates after ${rule.escalation.afterHours}h`}
                        </span>
                      </td>
                      <td className="px-5 py-3 text-slate-700">{NOTIFICATION_EVENT_LABELS[rule.event]}</td>
                      <td className="px-5 py-3 text-slate-600">
                        {rule.recipients
                          .map((r) =>
                            r.kind === 'role'
                              ? (ROLES[r.value as RoleId]?.name ?? r.value)
                              : r.kind === 'requester'
                                ? 'The requester'
                                : r.value,
                          )
                          .join(', ')}
                      </td>
                      <td className="px-5 py-3">
                        <div className="flex flex-wrap gap-1">
                          {rule.channels.map((c) => (
                            <Badge key={c} tone="slate">
                              {CHANNEL_LABELS[c]}
                            </Badge>
                          ))}
                        </div>
                      </td>
                      <td className="px-5 py-3 text-slate-600">{throttleLabel(rule.throttleMinutes)}</td>
                      <td className="px-5 py-3 text-right tabular-nums text-slate-600">
                        {rule.sentCount}
                        {rule.lastFiredAt && (
                          <span className="block text-[11px] text-slate-400">{relTime(rule.lastFiredAt)}</span>
                        )}
                      </td>
                      <td className="px-5 py-3">
                        <Badge tone={rule.status === 'active' ? 'emerald' : 'slate'}>{rule.status}</Badge>
                      </td>
                      <td className="px-5 py-3 text-right">
                        <div className="flex items-center justify-end gap-1.5">
                          <Button variant="outline" size="sm" disabled={isPending} onClick={() => testSend(rule)}>
                            Test send
                          </Button>
                          <Button variant="ghost" size="sm" disabled={isPending} onClick={() => toggle(rule)}>
                            {rule.status === 'active' ? 'Pause' : 'Activate'}
                          </Button>
                          <Button variant="ghost" size="sm" onClick={() => setEditing(rule)}>
                            Edit
                          </Button>
                          <Button variant="ghost" size="sm" className="text-health-critical" onClick={() => setDeleting(rule)}>
                            Delete
                          </Button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        ))}

      {tab === 'log' &&
        (log.isLoading ? (
          <TableSkeleton rows={6} columns={5} />
        ) : (log.data ?? []).length === 0 ? (
          <EmptyState
            title="Nothing delivered yet"
            description="This fills in as rules fire. Suppressed sends are recorded too, so a throttled rule is visibly working rather than silently absent."
          />
        ) : (
          <div className="glass-panel rounded-xl overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-y border-slate-100 bg-slate-50/70 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">
                    <th className="px-5 py-2.5">When</th>
                    <th className="px-5 py-2.5">Rule</th>
                    <th className="px-5 py-2.5">Event</th>
                    <th className="px-5 py-2.5">Outcome</th>
                    <th className="px-5 py-2.5 text-right">Recipients</th>
                    <th className="px-5 py-2.5">Detail</th>
                  </tr>
                </thead>
                <tbody>
                  {(log.data ?? []).map((entry) => (
                    <tr key={entry.id} className="border-b border-slate-100 last:border-0">
                      <td className="px-5 py-3 text-slate-500">{relTime(entry.at)}</td>
                      <td className="px-5 py-3 font-medium text-slate-800">{entry.ruleName}</td>
                      <td className="px-5 py-3 text-slate-600">{NOTIFICATION_EVENT_LABELS[entry.event] ?? entry.event}</td>
                      <td className="px-5 py-3">
                        <Badge tone={OUTCOME_TONE[entry.outcome] ?? 'slate'}>
                          {OUTCOME_LABEL[entry.outcome] ?? entry.outcome}
                        </Badge>
                      </td>
                      <td className="px-5 py-3 text-right tabular-nums text-slate-600">{entry.recipients.length}</td>
                      <td className="px-5 py-3 text-xs text-slate-400">{entry.detail || '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        ))}

      {(creating || editing) && (
        <RuleDialog
          existing={editing ?? undefined}
          onClose={() => {
            setCreating(false);
            setEditing(null);
            void refresh();
          }}
        />
      )}

      {deleting && (
        <ConfirmDialog
          title={`Delete ${deleting.name}?`}
          description="The delivery log is kept — deleting the rule does not erase the record of what it already sent."
          confirmLabel="Delete"
          busy={isPending}
          onConfirm={() => { void confirmDelete(); }}
          onCancel={() => setDeleting(null)}
        />
      )}
    </div>
  );
}

function RuleDialog({ existing, onClose }: { existing?: NotificationRule; onClose: () => void }) {
  const { run, isPending } = useMutate();

  const [name, setName] = useState(existing?.name ?? '');
  const [event, setEvent] = useState<NotificationEvent>(existing?.event ?? 'approval.requested');
  const [channels, setChannels] = useState<NotificationChannel[]>(existing?.channels ?? ['in_app']);
  const [role, setRole] = useState<string>(
    existing?.recipients.find((r) => r.kind === 'role')?.value ?? 'facility_manager',
  );
  const [alsoRequester, setAlsoRequester] = useState(Boolean(existing?.recipients.some((r) => r.kind === 'requester')));
  const [throttleMinutes, setThrottle] = useState(existing?.throttleMinutes ?? 0);
  const [quietEnabled, setQuietEnabled] = useState(existing?.quietHours.enabled ?? false);
  const [quietStart, setQuietStart] = useState(existing?.quietHours.start ?? '22:00');
  const [quietEnd, setQuietEnd] = useState(existing?.quietHours.end ?? '07:00');
  const [escEnabled, setEscEnabled] = useState(existing?.escalation.enabled ?? false);
  const [escHours, setEscHours] = useState(existing?.escalation.afterHours ?? 24);
  const [escRole, setEscRole] = useState<string>(existing?.escalation.toRole ?? 'org_admin');
  const [scopeId, setScopeId] = useState(existing?.scopeId ?? '');
  const [status, setStatus] = useState<'active' | 'inactive'>(existing?.status ?? 'inactive');

  const scopes = useMemo(scopeOptions, []);

  const toggleChannel = (c: NotificationChannel) =>
    setChannels((prev) => (prev.includes(c) ? prev.filter((x) => x !== c) : [...prev, c]));

  const submit = async () => {
    const body: NotificationRulePayload = {
      name: name.trim(),
      event,
      conditions: existing?.conditions ?? [],
      channels,
      recipients: [
        { kind: 'role' as const, value: role },
        ...(alsoRequester ? [{ kind: 'requester' as const }] : []),
      ],
      throttleMinutes,
      quietHours: { enabled: quietEnabled, start: quietStart, end: quietEnd },
      escalation: { enabled: escEnabled, afterHours: escHours, toRole: escRole as RoleId },
      scopeId: scopeId || undefined,
      status,
    };

    const ok = await run(existing ? notificationRulesApi.update(existing.id, body) : notificationRulesApi.create(body), {
      success: existing ? 'Rule saved' : `${body.name} created`,
      successDetail: status === 'active' ? 'Live — it will fire on the next matching event.' : 'Saved as inactive.',
      describe: existing ? 'save that rule' : 'create that rule',
    });
    if (ok) onClose();
  };

  const valid = name.trim().length >= 2 && channels.length > 0;

  return (
    <FormDialog
      icon="🔔"
      title={existing ? `Edit ${existing.name}` : 'New notification rule'}
      description="Event → condition → channel → recipient → throttle → quiet hours."
      submitLabel={existing ? 'Save' : 'Create'}
      width="lg"
      busy={isPending}
      disabled={!valid}
      onSubmit={() => void submit()}
      onCancel={onClose}
    >
      <FieldRow>
        <Field label="Rule name" required>
          <TextInput autoFocus value={name} onChange={(e) => setName(e.target.value)} placeholder="Approval waiting on a manager" />
        </Field>
        <Field label="Event" required hint="Only events the application actually raises.">
          <Select
            value={event}
            onChange={(e) => setEvent(e.target.value as NotificationEvent)}
            options={NOTIFICATION_EVENTS.map((v) => ({ value: v, label: NOTIFICATION_EVENT_LABELS[v] }))}
          />
        </Field>
      </FieldRow>

      <Field label="Channels" required hint="At least one. A rule with none tells nobody — use Inactive for that.">
        <div className="flex flex-wrap gap-2">
          {NOTIFICATION_CHANNELS.map((c) => (
            <button
              key={c}
              type="button"
              onClick={() => toggleChannel(c)}
              aria-pressed={channels.includes(c)}
              className={cn(
                'rounded-full border px-3 py-1.5 text-xs font-medium transition-colors',
                channels.includes(c)
                  ? 'border-primary-400 bg-primary-600 text-white'
                  : 'border-slate-200 bg-white text-slate-600 hover:bg-slate-50',
              )}
            >
              {CHANNEL_LABELS[c]}
            </button>
          ))}
        </div>
      </Field>

      <FieldRow>
        <Field label="Send to role" required>
          <Select
            value={role}
            onChange={(e) => setRole(e.target.value)}
            options={Object.values(ROLES).map((r) => ({ value: r.id, label: r.name }))}
          />
        </Field>
        <Field label="Throttle" hint="How often this rule may send, at most.">
          <Select
            value={String(throttleMinutes)}
            onChange={(e) => setThrottle(Number(e.target.value))}
            options={THROTTLE_CHOICES.map((m) => ({ value: String(m), label: throttleLabel(m) }))}
          />
        </Field>
      </FieldRow>

      <CheckField
        label="Also notify whoever triggered the event"
        checked={alsoRequester}
        onChange={setAlsoRequester}
      />

      <FieldRow>
        <Field label="Location" hint="Limits the rule to a branch of the hierarchy.">
          <Select value={scopeId} onChange={(e) => setScopeId(e.target.value)} options={scopes} />
        </Field>
        <Field label="Status">
          <Select
            value={status}
            onChange={(e) => setStatus(e.target.value as 'active' | 'inactive')}
            options={[
              { value: 'inactive', label: 'Inactive — saved, never fires' },
              { value: 'active', label: 'Active — fires on matching events' },
            ]}
          />
        </Field>
      </FieldRow>

      <CheckField
        label="Quiet hours — hold delivery overnight"
        checked={quietEnabled}
        onChange={setQuietEnabled}
      />
      {quietEnabled && (
        <FieldRow>
          <Field label="Quiet from">
            <TextInput type="time" value={quietStart} onChange={(e) => setQuietStart(e.target.value)} />
          </Field>
          <Field label="Quiet until" hint="A window may cross midnight.">
            <TextInput type="time" value={quietEnd} onChange={(e) => setQuietEnd(e.target.value)} />
          </Field>
        </FieldRow>
      )}

      <CheckField label="Escalate if nobody acts" checked={escEnabled} onChange={setEscEnabled} />
      {escEnabled && (
        <FieldRow>
          <Field label="After (hours)">
            <TextInput type="number" min={1} value={escHours} onChange={(e) => setEscHours(Number(e.target.value))} />
          </Field>
          <Field label="Escalate to">
            <Select
              value={escRole}
              onChange={(e) => setEscRole(e.target.value)}
              options={Object.values(ROLES).map((r) => ({ value: r.id, label: r.name }))}
            />
          </Field>
        </FieldRow>
      )}
    </FormDialog>
  );
}
