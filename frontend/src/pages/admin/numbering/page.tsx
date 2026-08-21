import { useEffect, useMemo, useState } from 'react';
import {
  ASSET_CATEGORIES,
  NUMBERED_ENTITIES,
  NUMBERED_ENTITY_LABELS,
  SEQUENCE_SCOPES,
  type NumberedEntity,
  type NumberingRule,
  type SequenceScope,
} from '@access-genie/shared';
import { scopeTree } from '@/lib/rbac';
import { ApiRequestError } from '@/api/client';
import { useMutate } from '@/api/mutate';
import {
  numberingApi,
  useNumberingRules,
  NUMBERING_KEY,
  type NumberingPayload,
} from '@/api/admin-rules';
import { useQueryClient } from '@tanstack/react-query';
import { Badge, EmptyState, ErrorState, PageHeader, TableSkeleton } from '@/components/ui/primitives';
import { Button } from '@/components/ui/Button';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import { Field, FieldRow, FormDialog, Select, TextInput } from '@/components/ui/FormDialog';

/**
 * Numbering & ID Rules.
 *
 * The screen configures the shape; the server mints the value. Nothing here
 * builds an ID — even the sample strings under the pattern field come back from
 * `POST /numbering-rules/preview`, because a client-side renderer would be a
 * second implementation of the pattern language and the two would disagree the
 * first time either changed.
 *
 * The rule that governs the list is worth stating on the screen, and is: only
 * one rule per entity can be active in a given scope, and a rule only ever
 * shapes the *next* ID. Records already issued keep what they were given.
 */

const SCOPE_LABELS: Record<SequenceScope, string> = {
  global: 'One sequence for the whole rule',
  facility: 'A separate sequence per facility',
  category: 'A separate sequence per category',
};

/** Facility-and-above nodes, for the scope picker. */
function scopeOptions(): { value: string; label: string }[] {
  const out: { value: string; label: string }[] = [{ value: '', label: 'Everywhere (no location limit)' }];
  const walk = (node: typeof scopeTree, depth: number) => {
    if (depth > 0) out.push({ value: node.id, label: `${'— '.repeat(depth - 1)}${node.name}` });
    if (depth >= 2) return;
    for (const child of node.children ?? []) walk(child, depth + 1);
  };
  walk(scopeTree, 0);
  return out;
}

export default function AdminNumberingPage() {
  const query = useNumberingRules();
  const [editing, setEditing] = useState<NumberingRule | null>(null);
  const [creating, setCreating] = useState(false);
  const [deleting, setDeleting] = useState<NumberingRule | null>(null);
  const { run, isPending } = useMutate();
  const cache = useQueryClient();

  const refresh = () => cache.invalidateQueries({ queryKey: NUMBERING_KEY });

  const confirmDelete = async () => {
    if (!deleting) return;
    const ok = await run(numberingApi.remove(deleting.id), {
      success: `${deleting.name} deleted`,
      describe: 'delete that rule',
    });
    if (ok) {
      setDeleting(null);
      void refresh();
    }
  };

  const toggle = (rule: NumberingRule) =>
    void run(numberingApi.update(rule.id, { status: rule.status === 'active' ? 'inactive' : 'active' }), {
      success: rule.status === 'active' ? `${rule.name} deactivated` : `${rule.name} is now issuing IDs`,
      describe: 'change that rule',
    }).then((ok) => ok && refresh());

  if (query.isError) {
    return (
      <div className="space-y-6">
        <PageHeader title="Numbering & ID Rules" subtitle="How the platform generates business IDs." />
        <ErrorState
          title="Could not load numbering rules"
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
        title="Numbering & ID Rules"
        subtitle="How asset tags, work orders and transfer references are generated. IDs are minted by the server, never by this screen."
        breadcrumb={[{ label: 'Administration', href: '/admin/users' }, { label: 'Numbering & ID Rules' }]}
        actions={<Button onClick={() => setCreating(true)}>+ New rule</Button>}
      />

      <p className="rounded-lg bg-slate-50 px-4 py-2.5 text-xs text-slate-600">
        One rule per record type can be active in a given location. A rule shapes the <strong>next</strong> ID it
        issues — records already created keep the IDs they were given.
      </p>

      {query.isLoading ? (
        <TableSkeleton rows={4} columns={6} />
      ) : rules.length === 0 ? (
        <EmptyState
          title="No numbering rules yet"
          description="Without a rule, IDs use the built-in sequence — AST-1, WO-2 and so on. Add a rule to shape them, for example LAP-HYD-00001."
          action={<Button onClick={() => setCreating(true)}>Create the first rule</Button>}
        />
      ) : (
        <div className="glass-panel rounded-xl overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-y border-slate-100 bg-slate-50/70 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">
                  <th className="px-5 py-2.5">Rule</th>
                  <th className="px-5 py-2.5">Applies to</th>
                  <th className="px-5 py-2.5">Pattern</th>
                  <th className="px-5 py-2.5">Next ID</th>
                  <th className="px-5 py-2.5 text-right">Issued</th>
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
                        {rule.categories.length > 0 && ` · ${rule.categories.join(', ')}`}
                      </span>
                    </td>
                    <td className="px-5 py-3 text-slate-700">{NUMBERED_ENTITY_LABELS[rule.entity]}</td>
                    <td className="px-5 py-3">
                      <code className="rounded bg-slate-100 px-1.5 py-0.5 text-xs text-slate-700">{rule.pattern}</code>
                    </td>
                    <td className="px-5 py-3">
                      <code className="text-xs font-semibold text-primary-700">{rule.preview}</code>
                    </td>
                    <td className="px-5 py-3 text-right tabular-nums text-slate-600">{rule.issued}</td>
                    <td className="px-5 py-3">
                      <Badge tone={rule.status === 'active' ? 'emerald' : 'slate'}>{rule.status}</Badge>
                    </td>
                    <td className="px-5 py-3 text-right">
                      <div className="flex items-center justify-end gap-1.5">
                        <Button variant="ghost" size="sm" disabled={isPending} onClick={() => toggle(rule)}>
                          {rule.status === 'active' ? 'Deactivate' : 'Activate'}
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
      )}

      {(creating || editing) && (
        <NumberingDialog
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
          description="IDs already issued keep their values. New records fall back to the built-in sequence unless another rule covers them."
          confirmLabel="Delete"
          busy={isPending}
          onConfirm={() => { void confirmDelete(); }}
          onCancel={() => setDeleting(null)}
        />
      )}
    </div>
  );
}

function NumberingDialog({ existing, onClose }: { existing?: NumberingRule; onClose: () => void }) {
  const { run, isPending } = useMutate();

  const [name, setName] = useState(existing?.name ?? '');
  const [entity, setEntity] = useState<NumberedEntity>(existing?.entity ?? 'asset');
  const [prefix, setPrefix] = useState(existing?.prefix ?? 'AST');
  const [pattern, setPattern] = useState(existing?.pattern ?? '{PREFIX}-{FACILITY}-{SEQ:5}');
  const [startAt, setStartAt] = useState(existing?.startAt ?? 1);
  const [sequenceScope, setSequenceScope] = useState<SequenceScope>(existing?.sequenceScope ?? 'global');
  const [scopeId, setScopeId] = useState(existing?.scopeId ?? '');
  const [category, setCategory] = useState(existing?.categories[0] ?? '');
  const [status, setStatus] = useState<'active' | 'inactive'>(existing?.status ?? 'inactive');

  const [samples, setSamples] = useState<string[]>([]);
  const [previewError, setPreviewError] = useState<string | null>(null);

  const scopes = useMemo(scopeOptions, []);

  /*
   * The preview comes from the server on every change to the shape.
   *
   * Debounced because it is a request per keystroke otherwise, and guarded by a
   * cancellation flag so a slow earlier response cannot land after a faster
   * later one and show samples for a pattern nobody is looking at any more.
   */
  useEffect(() => {
    let cancelled = false;
    const timer = setTimeout(() => {
      numberingApi
        .preview({ prefix, pattern, startAt, sequenceScope, category: category || undefined, scopeId: scopeId || undefined })
        .then((res) => {
          if (cancelled) return;
          setSamples(res.samples);
          setPreviewError(null);
        })
        .catch((err: unknown) => {
          if (cancelled) return;
          setSamples([]);
          setPreviewError(err instanceof ApiRequestError ? err.message : 'That pattern could not be rendered.');
        });
    }, 300);

    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [prefix, pattern, startAt, sequenceScope, category, scopeId]);

  const submit = async () => {
    const body: NumberingPayload = {
      name: name.trim(),
      entity,
      prefix: prefix.trim().toUpperCase(),
      pattern: pattern.trim(),
      startAt,
      sequenceScope,
      categories: category ? [category] : [],
      scopeId: scopeId || undefined,
      status,
    };

    const ok = await run(existing ? numberingApi.update(existing.id, body) : numberingApi.create(body), {
      success: existing ? 'Rule saved' : `${body.name} created`,
      successDetail: status === 'active' ? `Next ID: ${samples[0] ?? '—'}` : 'Saved as inactive',
      describe: existing ? 'save that rule' : 'create that rule',
    });
    if (ok) onClose();
  };

  const valid = name.trim().length >= 2 && prefix.trim().length >= 1 && /\{SEQ(:\d+)?\}/.test(pattern);

  return (
    <FormDialog
      icon="🔢"
      title={existing ? `Edit ${existing.name}` : 'New numbering rule'}
      description="The server renders these samples — they are exactly what the next IDs will be."
      submitLabel={existing ? 'Save' : 'Create'}
      width="lg"
      busy={isPending}
      disabled={!valid}
      onSubmit={() => void submit()}
      onCancel={onClose}
    >
      <FieldRow>
        <Field label="Rule name" required>
          <TextInput autoFocus value={name} onChange={(e) => setName(e.target.value)} placeholder="Laptop tags, Hyderabad" />
        </Field>
        <Field label="Applies to" required>
          <Select
            value={entity}
            onChange={(e) => setEntity(e.target.value as NumberedEntity)}
            options={NUMBERED_ENTITIES.map((v) => ({ value: v, label: NUMBERED_ENTITY_LABELS[v] }))}
          />
        </Field>
      </FieldRow>

      <FieldRow>
        <Field label="Prefix" required hint="Fills the {PREFIX} token.">
          <TextInput value={prefix} onChange={(e) => setPrefix(e.target.value.toUpperCase())} placeholder="LAP" />
        </Field>
        <Field label="Start at" hint="Where a new sequence begins. Does not renumber anything already issued.">
          <TextInput type="number" min={0} value={startAt} onChange={(e) => setStartAt(Number(e.target.value))} />
        </Field>
      </FieldRow>

      <Field
        label="Pattern"
        required
        hint="Tokens: {PREFIX} {CATEGORY} {FACILITY} {YYYY} {YY} {MM} {SEQ} — pad with {SEQ:5}. Anything else is literal."
      >
        <TextInput value={pattern} onChange={(e) => setPattern(e.target.value)} placeholder="{PREFIX}-{FACILITY}-{SEQ:5}" />
      </Field>

      <div className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2.5">
        <div className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">Next three IDs</div>
        {previewError ? (
          <p className="mt-1 text-xs text-amber-700">{previewError}</p>
        ) : samples.length > 0 ? (
          <div className="mt-1 flex flex-wrap gap-2">
            {samples.map((s) => (
              <code key={s} className="rounded bg-white px-2 py-1 text-xs font-semibold text-primary-700 ring-1 ring-slate-200">
                {s}
              </code>
            ))}
          </div>
        ) : (
          <p className="mt-1 text-xs text-slate-400">Rendering…</p>
        )}
      </div>

      <FieldRow>
        <Field label="Sequence" hint={SCOPE_LABELS[sequenceScope]}>
          <Select
            value={sequenceScope}
            onChange={(e) => setSequenceScope(e.target.value as SequenceScope)}
            options={SEQUENCE_SCOPES.map((v) => ({ value: v, label: SCOPE_LABELS[v] }))}
          />
        </Field>
        <Field label="Location" hint="Limits the rule to a branch of the hierarchy.">
          <Select value={scopeId} onChange={(e) => setScopeId(e.target.value)} options={scopes} />
        </Field>
      </FieldRow>

      <FieldRow>
        <Field label="Category" hint="Optional. Limits the rule to one asset category.">
          <Select
            value={category}
            onChange={(e) => setCategory(e.target.value)}
            options={[{ value: '', label: 'All categories' }, ...ASSET_CATEGORIES.map((c) => ({ value: c, label: c }))]}
          />
        </Field>
        <Field label="Status" hint="Only one rule per record type can be active in a location.">
          <Select
            value={status}
            onChange={(e) => setStatus(e.target.value as 'active' | 'inactive')}
            options={[
              { value: 'inactive', label: 'Inactive — saved, issues nothing' },
              { value: 'active', label: 'Active — issues the next IDs' },
            ]}
          />
        </Field>
      </FieldRow>
    </FormDialog>
  );
}
