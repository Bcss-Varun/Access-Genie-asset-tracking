import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import {
  ASSET_CATEGORIES,
  SECTION_DEFS,
  type AddAssetSource,
  type DerivedField,
  type SectionKey,
} from '@access-genie/shared';
import { Button } from '@/components/ui/Button';
import { useToast } from '@/components/providers/ToastProvider';
import { ApiRequestError } from '@/api/client';
import { registrationApi, SECTION_ORDER, type DraftValues, type FormField } from '@/api/registration';
import { useRefreshDataset } from '@/api/dataset';
import { FieldInput, type OptionSource } from './FieldInput';
import { WizardPanel, WizardRail, type WizardStep } from './WizardShell';
import { cn, formatDate, formatRupees } from '@/lib/utils';

/**
 * The add-asset wizard, shared by blank, template and clone.
 *
 * One section per step, ending in a review. Three things shape it:
 *
 *   • **Only the core three are required** — name, category and site — so the
 *     review step is reachable almost immediately and the rest is genuinely
 *     optional. Optional steps say so and Next never blocks on them.
 *   • **The server decides what to ask.** Fields, order and required flags come
 *     from `/registration/form`, so a template author changes this screen
 *     without anyone touching this file.
 *   • **Validation is the server's too**, debounced, so the rule that a
 *     custodian needs an employee ID lives in one place rather than being
 *     restated here and drifting.
 */

interface Props {
  source: AddAssetSource;
  templateId?: string;
  cloneOfId?: string;
  /** Prefill — clone values, or a resumed draft. */
  initialValues?: DraftValues;
  /** Clone only: the identity fields that were deliberately blanked. */
  clearedFields?: { key: string; label: string }[];
  /** Shown above the wizard to say where these values came from. */
  provenance?: React.ReactNode;
}

const REVIEW = '__review__';

export function RegistrationForm({
  source,
  templateId,
  cloneOfId,
  initialValues,
  clearedFields,
  provenance,
}: Props) {
  const navigate = useNavigate();
  const { toast } = useToast();
  const refreshDataset = useRefreshDataset();

  const [values, setValues] = useState<DraftValues>(initialValues ?? {});
  const [step, setStep] = useState(0);
  /** Steps the user has already left — errors only surface once they have. */
  const [visited, setVisited] = useState<Set<string>>(new Set());
  const [submitting, setSubmitting] = useState(false);
  const [submitAttempted, setSubmitAttempted] = useState(false);

  const formQuery = useQuery({
    queryKey: ['registration-form', source, templateId],
    queryFn: () => registrationApi.form(source, templateId),
  });
  const defaultsQuery = useQuery({
    queryKey: ['registration-defaults'],
    queryFn: () => registrationApi.defaults(),
  });

  const fields = useMemo(() => formQuery.data?.fields ?? [], [formQuery.data]);
  const derived = useMemo(() => formQuery.data?.derived ?? [], [formQuery.data]);

  // Seed once the field list and the caller's own site are both known: template
  // defaults first, then the site the user is standing in, then any prefill.
  const seeded = useRef(false);
  useEffect(() => {
    if (seeded.current || !fields.length || defaultsQuery.isLoading) return;
    seeded.current = true;
    const seed: DraftValues = {};
    for (const f of fields) if (f.defaultValue !== undefined) seed[f.key] = f.defaultValue;
    const home = defaultsQuery.data?.location?.id;
    if (home) seed.facilityId = home;
    setValues((v) => ({ ...seed, ...initialValues, ...v }));
  }, [fields, defaultsQuery.isLoading, defaultsQuery.data, initialValues]);

  // ── Server-side validation, debounced ──────────────────────────────────────
  const [validation, setValidation] = useState<Awaited<ReturnType<typeof registrationApi.validate>> | null>(null);
  const validateRef = useRef<ReturnType<typeof setTimeout>>(undefined);

  useEffect(() => {
    if (!fields.length) return;
    clearTimeout(validateRef.current);
    validateRef.current = setTimeout(() => {
      registrationApi
        .validate({ source, templateId, cloneOfId, values })
        .then(setValidation)
        .catch(() => {
          /* a failed check must never block typing; the commit re-checks */
        });
    }, 350);
    return () => clearTimeout(validateRef.current);
  }, [values, fields.length, source, templateId, cloneOfId]);

  const set = (key: string, value: string | number | boolean | null) =>
    setValues((v) => ({ ...v, [key]: value }));

  // ── Steps ──────────────────────────────────────────────────────────────────
  const sections = useMemo(
    () =>
      SECTION_ORDER.map((key) => ({
        key,
        def: SECTION_DEFS[key],
        fields: fields.filter((f) => f.section === key),
      })).filter((s) => s.fields.length > 0),
    [fields],
  );

  const errorsIn = useCallback(
    (key: SectionKey) => validation?.errors.filter((e) => e.section === key) ?? [],
    [validation],
  );

  /**
   * A step earns a tick only if being complete meant something.
   *
   * An optional step with nothing required is "complete" the moment the form
   * loads, so ticking it would mark four untouched steps done and make the rail
   * say the opposite of the truth.
   */
  const stateOf = useCallback(
    (key: SectionKey): WizardStep['state'] => {
      const st = validation?.sections.find((s) => s.key === key);
      if (!st) return 'todo';
      if (st.errors.length > 0 && (submitAttempted || visited.has(key))) return 'error';
      if (st.requiredTotal > 0) return st.requiredFilled === st.requiredTotal ? 'done' : 'todo';
      return st.filled > 0 ? 'done' : 'todo';
    },
    [validation, visited, submitAttempted],
  );

  const steps: WizardStep[] = useMemo(() => {
    const list: WizardStep[] = sections.map((s) => {
      const st = validation?.sections.find((x) => x.key === s.key);
      return {
        key: s.key,
        label: s.def.label,
        description: s.def.description,
        optional: !s.def.alwaysShown && (st?.requiredTotal ?? 0) === 0,
        state: stateOf(s.key),
        hint: st ? `${st.filled} of ${st.total} filled` : undefined,
      };
    });
    list.push({
      key: REVIEW,
      label: 'Review & register',
      description: 'What will be saved. Anything blank can be filled in later.',
      state: validation?.valid ? 'done' : 'todo',
    });
    return list;
  }, [sections, validation, stateOf]);

  const current = steps[step] ?? steps[0];
  const onReview = current?.key === REVIEW;
  const currentSection = onReview ? undefined : sections.find((s) => s.key === current?.key);

  const goto = (index: number) => {
    if (current) setVisited((v) => new Set(v).add(current.key));
    setStep(Math.max(0, Math.min(steps.length - 1, index)));
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  /** Errors show once the step has been left, or once Register was pressed. */
  const errorFor = (key: string) => {
    const err = validation?.errors.find((e) => e.key === key);
    if (!err) return undefined;
    return submitAttempted || visited.has(err.section) ? err.message : undefined;
  };

  // ── Options that come from data rather than the catalogue ──────────────────
  const optionsFor: OptionSource = useCallback(
    (field: FormField) => {
      if (field.key === 'category') return ASSET_CATEGORIES.map((c) => ({ value: c, label: c }));
      if (field.key === 'facilityId') {
        return (defaultsQuery.data?.facilities ?? []).map((f) => ({ value: f.id, label: f.name }));
      }
      return undefined;
    },
    [defaultsQuery.data],
  );

  const clearedKeys = useMemo(() => new Set((clearedFields ?? []).map((c) => c.key)), [clearedFields]);
  const outstanding = validation?.errors.length ?? 0;

  // Named from the form the server actually sent: a template decides its own
  // category, so promising the reader they will be asked for one is wrong on
  // exactly the flow where it matters most.
  const requiredLabels = useMemo(() => fields.filter((f) => f.required).map((f) => f.label.toLowerCase()), [fields]);
  const requiredCount = requiredLabels.length;
  const requiredSummary =
    requiredCount === 0
      ? 'nothing'
      : requiredCount === 1
        ? (requiredLabels[0] as string)
        : requiredCount <= 4
          ? `${requiredLabels.slice(0, -1).join(', ')} and ${requiredLabels.at(-1)}`
          : `${requiredCount} fields`;

  // ── Submit ─────────────────────────────────────────────────────────────────
  const submit = async () => {
    setSubmitAttempted(true);

    // Re-check synchronously: the debounce may not have caught the last
    // keystroke, and committing on a stale "valid" is how a form lies.
    const fresh = await registrationApi.validate({ source, templateId, cloneOfId, values }).catch(() => null);
    if (fresh) setValidation(fresh);
    if (fresh && !fresh.valid) {
      const bad = fresh.errors[0];
      const target = steps.findIndex((s) => s.key === bad?.section);
      if (target >= 0) setStep(target);
      toast({
        title: 'Not ready yet',
        description: `${fresh.errors.length} field${fresh.errors.length === 1 ? '' : 's'} still need attention.`,
        tone: 'error',
      });
      return;
    }

    setSubmitting(true);
    try {
      const asset = await registrationApi.register({ source, templateId, cloneOfId, values });
      // Awaited: the Asset 360 page this navigates to next reads the registry
      // provider, which re-seeds itself from the dataset — landing there before
      // the refetch resolves is how a just-created asset reads as "not found".
      await refreshDataset();
      toast({ title: `${asset.name} registered`, description: `Filed as ${asset.id}.`, tone: 'success' });
      navigate(`/assets/${asset.id}`);
    } catch (err) {
      toast({
        title: 'Could not register this asset',
        description: err instanceof ApiRequestError ? err.message : 'The request failed. Please try again.',
        tone: 'error',
      });
    } finally {
      setSubmitting(false);
    }
  };

  if (formQuery.isLoading) {
    return <div className="rounded-xl border border-slate-200 bg-white p-8 text-sm text-slate-500">Loading the form…</div>;
  }
  if (formQuery.isError) {
    return (
      <div className="rounded-xl border border-health-critical/30 bg-red-50 p-6 text-sm text-slate-700">
        <p className="font-semibold text-health-critical">This form could not be loaded.</p>
        <p className="mt-1 text-slate-600">
          {formQuery.error instanceof ApiRequestError ? formQuery.error.message : 'Something went wrong.'}
        </p>
        <Button variant="outline" className="mt-4" onClick={() => navigate('/assets/new')}>
          Back to sources
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {provenance}

      {clearedFields && clearedFields.length > 0 && (
        <div className="rounded-xl border border-amber-200 bg-amber-50 p-4">
          <p className="text-sm font-semibold text-amber-900">
            {clearedFields.length} field{clearedFields.length === 1 ? '' : 's'} could not be copied
          </p>
          <p className="mt-1 text-xs text-amber-800">
            These identify one physical unit, so they were left empty for you to fill in.
          </p>
          <div className="mt-2.5 flex flex-wrap gap-1.5">
            {clearedFields.map((c) => {
              const filled = !!values[c.key];
              const owner = fields.find((f) => f.key === c.key)?.section;
              return (
                <button
                  key={c.key}
                  type="button"
                  onClick={() => {
                    const target = steps.findIndex((s) => s.key === owner);
                    if (target >= 0) goto(target);
                    setTimeout(() => document.getElementById(`f-${c.key}`)?.focus(), 250);
                  }}
                  className={cn(
                    'rounded-full border px-2.5 py-1 text-xs font-medium transition-colors',
                    filled
                      ? 'border-health-good/40 bg-emerald-50 text-health-good'
                      : 'border-amber-300 bg-white text-amber-900 hover:bg-amber-100',
                  )}
                >
                  {filled ? '✓ ' : ''}
                  {c.label}
                </button>
              );
            })}
          </div>
        </div>
      )}

      <div className="grid gap-6 lg:grid-cols-[15rem_1fr]">
        <WizardRail
          steps={steps}
          current={step}
          onGo={goto}
          footnote={
            <p className="text-xs leading-relaxed text-slate-500">
              Only <span className="font-semibold text-slate-700">{requiredSummary}</span>{' '}
              {requiredCount === 1 ? 'is' : 'are'} required. Skip anything else and fill it in later from the asset's own
              page.
            </p>
          }
        />

        {current && (
          <WizardPanel
            step={current}
            index={step}
            total={steps.length}
            variant={onReview ? 'open' : 'panel'}
            onBack={step > 0 ? () => goto(step - 1) : undefined}
            onNext={step < steps.length - 1 ? () => goto(step + 1) : undefined}
            status={
              onReview ? (
                validation?.valid ? (
                  <span className="font-medium text-health-good">Ready to register.</span>
                ) : (
                  <span className="text-slate-500">
                    {outstanding} field{outstanding === 1 ? '' : 's'} still needed.
                  </span>
                )
              ) : (
                currentSection && (
                  <span className="text-slate-500">
                    {errorsIn(currentSection.key).length > 0 && (submitAttempted || visited.has(currentSection.key))
                      ? `${errorsIn(currentSection.key).length} to fix on this step`
                      : current.optional
                        ? 'Nothing here is required — skip it if it does not apply.'
                        : ''}
                  </span>
                )
              )
            }
            actions={
              onReview ? (
                <>
                  <Button variant="outline" onClick={() => navigate('/assets/new')} disabled={submitting}>
                    Cancel
                  </Button>
                  <Button onClick={() => void submit()} disabled={submitting || validation?.valid !== true}>
                    {submitting ? 'Registering…' : 'Register asset'}
                  </Button>
                </>
              ) : undefined
            }
          >
            {onReview ? (
              <ReviewStep
                sections={sections}
                values={values}
                derived={derived}
                optionsFor={optionsFor}
                onEdit={(key) => goto(steps.findIndex((s) => s.key === key))}
              />
            ) : (
              currentSection && (
                <div className="grid gap-4 sm:grid-cols-2">
                  {currentSection.fields.map((f, i) => (
                    <div
                      key={f.key}
                      className={cn(clearedKeys.has(f.key) && 'rounded-lg ring-2 ring-amber-200 ring-offset-4')}
                    >
                      <FieldInput
                        field={f}
                        value={values[f.key]}
                        error={errorFor(f.key)}
                        onChange={(v) => set(f.key, v)}
                        optionsFor={optionsFor}
                        autoFocus={i === 0 && step === 0 && !initialValues}
                      />
                    </div>
                  ))}
                </div>
              )
            )}
          </WizardPanel>
        )}
      </div>
    </div>
  );
}

/**
 * What will actually be saved — a card per section rather than one long list.
 *
 * Everything the sections asked for came back in one card, which put a purchase
 * price, a floor number and a MAC address in a single column of grey text and
 * made the reader do the grouping the form had already done. A card per section
 * restores it, and the two things the form *did not* ask about get cards of
 * their own: the sections left empty, gathered into one line each rather than
 * repeating "nothing entered", and the numbers the server is about to mint.
 */
function ReviewStep({
  sections,
  values,
  derived,
  optionsFor,
  onEdit,
}: {
  sections: { key: SectionKey; def: { label: string }; fields: FormField[] }[];
  values: DraftValues;
  derived: DerivedField[];
  optionsFor: OptionSource;
  onEdit: (key: SectionKey) => void;
}) {
  const shown = (v: DraftValues[string]) => v !== undefined && v !== null && v !== '' && v !== false;

  const filledIn = sections
    .map((s) => ({ ...s, filled: s.fields.filter((f) => shown(values[f.key])) }))
    .filter((s) => s.filled.length > 0);
  const empty = sections.filter((s) => !s.fields.some((f) => shown(values[f.key])));

  // A tag ID is only minted once a tag type is chosen, so promising one before
  // that would be describing an asset nobody asked for.
  const willBeIssued = derived.filter((d) => d.key !== 'trackingId' || shown(values.trackingTech));

  return (
    <div className="grid items-start gap-4 xl:grid-cols-2">
      {filledIn.map((s) => (
        <ReviewCard key={s.key} title={s.def.label} onEdit={() => onEdit(s.key)}>
          <dl className="divide-y divide-slate-100">
            {s.filled.map((f) => (
              <Row key={f.key} label={f.label} mono={f.identity}>
                {display(f, values[f.key], optionsFor)}
              </Row>
            ))}
          </dl>
        </ReviewCard>
      ))}

      {willBeIssued.length > 0 && (
        <ReviewCard title="Issued for you" tone="muted">
          {/* Not a definition list: the note is a sentence about where the value
              comes from, and it needs the full width rather than a label column. */}
          <div className="divide-y divide-slate-100">
            {willBeIssued.map((d) => (
              <div key={d.key} className="py-2">
                <div className="flex items-baseline gap-4">
                  <span className="text-sm text-slate-500">{d.label}</span>
                  <span
                    className={cn(
                      'ml-auto whitespace-nowrap text-sm font-medium',
                      d.value ? 'font-mono text-slate-900' : 'text-slate-400',
                    )}
                  >
                    {d.value ?? 'On save'}
                  </span>
                </div>
                <p className="mt-0.5 text-[11px] leading-snug text-slate-400">{d.note}</p>
              </div>
            ))}
          </div>
        </ReviewCard>
      )}

      {empty.length > 0 && (
        <ReviewCard title="Left blank" tone="muted">
          <p className="pb-2.5 pt-0.5 text-sm text-slate-500">
            Nothing here is required. You can add it later from the asset's own page.
          </p>
          <div className="flex flex-wrap gap-1.5 pb-1">
            {empty.map((s) => (
              <button
                key={s.key}
                type="button"
                onClick={() => onEdit(s.key)}
                className="rounded-full border border-slate-200 bg-white px-2.5 py-1 text-xs font-medium text-slate-600 transition-colors hover:border-primary-300 hover:text-primary-700"
              >
                + {s.def.label}
              </button>
            ))}
          </div>
        </ReviewCard>
      )}
    </div>
  );
}

function ReviewCard({
  title,
  onEdit,
  tone = 'plain',
  children,
}: {
  title: string;
  onEdit?: () => void;
  tone?: 'plain' | 'muted';
  children: React.ReactNode;
}) {
  return (
    <section
      data-review-card={title}
      className={cn('rounded-xl border border-slate-200', tone === 'muted' ? 'bg-slate-50/60' : 'bg-white')}
    >
      <header className="flex items-center gap-2 border-b border-slate-100 px-5 py-2.5">
        <h3 className="text-xs font-bold uppercase tracking-wider text-slate-500">{title}</h3>
        {onEdit && (
          <button
            type="button"
            onClick={onEdit}
            className="ml-auto text-xs font-medium text-primary-600 transition-colors hover:text-primary-700 hover:underline"
          >
            Edit
          </button>
        )}
      </header>
      <div className="px-5 py-1.5">{children}</div>
    </section>
  );
}

function Row({ label, children, mono }: { label: string; children: React.ReactNode; mono?: boolean }) {
  return (
    <div className="flex items-baseline gap-4 py-2">
      {/* The label takes the slack; the value is capped rather than squeezed,
          which is what turned a two-word answer into one letter per line. */}
      <dt className="min-w-0 flex-1 text-sm text-slate-500">{label}</dt>
      <dd
        className={cn(
          'min-w-0 max-w-[55%] shrink-0 break-words text-right text-sm font-medium text-slate-900',
          mono && 'font-mono',
        )}
      >
        {children}
      </dd>
    </div>
  );
}

/**
 * The value as a person reads it.
 *
 * ₹1,000 rather than 1000, 07 Aug 2026 rather than an ISO string — and
 * "Hyderabad Warehouse" rather than FAC-1. A select stores an id and shows a
 * name, so a review that echoes the stored value is showing the one form of the
 * answer the person never chose.
 */
function display(field: FormField, value: DraftValues[string], optionsFor: OptionSource): string {
  if (value === true) return 'Yes';
  if (field.type === 'money') return formatRupees(Number(value));
  if (field.type === 'date') return formatDate(String(value)) || String(value);
  if (field.type === 'number' && field.unit) return `${value} ${field.unit}`;
  if (field.type === 'select') {
    const match = optionsFor(field)?.find((o) => o.value === value);
    if (match) return match.label;
  }
  return String(value);
}
