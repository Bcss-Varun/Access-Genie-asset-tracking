import { useEffect } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import type { AddAssetSource } from '@access-genie/shared';
import { PageHeader } from '@/components/ui/primitives';
import { Button } from '@/components/ui/Button';
import { registrationApi } from '@/api/registration';
import { SourcePicker } from '@/components/registration/SourcePicker';
import { TemplateChooser } from '@/components/registration/TemplateChooser';
import { CloneChooser } from '@/components/registration/CloneChooser';
import { RegistrationForm } from '@/components/registration/RegistrationForm';

/**
 * Add Asset.
 *
 * One route, three steps, all of them in the URL: `?source=`, plus `?templateId=`
 * or `?cloneOf=` once one is chosen. Keeping the step in the query string rather
 * than in component state means the back button works the way people expect —
 * back out of a form to the chooser, back out of the chooser to the sources —
 * and a half-started registration can be linked to a colleague.
 */
export default function NewAssetPage() {
  const [params, setParams] = useSearchParams();
  const navigate = useNavigate();

  const source = (params.get('source') ?? '') as AddAssetSource | '';
  const templateId = params.get('templateId') ?? undefined;
  const cloneOf = params.get('cloneOf') ?? undefined;

  // Bulk import is a screen of its own; the card here is a signpost to it.
  useEffect(() => {
    if (source === 'import') navigate('/assets/import', { replace: true });
  }, [source, navigate]);

  const subtitle =
    source === 'blank'
      ? 'Only the name, category and site are required. Everything else can wait.'
      : source === 'template'
        ? 'Answer the fields this kind of asset actually needs.'
        : source === 'clone'
          ? 'Copy an existing asset, then fill in what makes this one different.'
          : 'Pick how this asset reached you. It changes what you are asked, not what you get.';

  return (
    <div className="flex h-full flex-col space-y-6">
      <PageHeader
        title="Add Asset"
        subtitle={subtitle}
        breadcrumb={[{ label: 'Asset Registry', href: '/assets' }, { label: 'Add Asset' }]}
        actions={
          source ? (
            <Button variant="outline" onClick={() => setParams({})}>
              ← Change source
            </Button>
          ) : undefined
        }
      />

      {!source && <SourcePicker />}

      {source === 'blank' && <RegistrationForm source="blank" />}

      {source === 'template' &&
        (templateId ? (
          <RegistrationForm source="template" templateId={templateId} />
        ) : (
          <TemplateChooser onPick={(id) => setParams({ source: 'template', templateId: id })} />
        ))}

      {source === 'clone' &&
        (cloneOf ? (
          <CloneStep cloneOf={cloneOf} />
        ) : (
          <CloneChooser onPick={(id) => setParams({ source: 'clone', cloneOf: id })} />
        ))}
    </div>
  );
}

/**
 * The clone form, once a source asset is chosen.
 *
 * Split out because the prefill has to be fetched before the form mounts —
 * `RegistrationForm` seeds itself once, so handing it values that arrive later
 * would leave the fields empty.
 */
function CloneStep({ cloneOf }: { cloneOf: string }) {
  const [, setParams] = useSearchParams();
  const { data, isLoading, isError } = useQuery({
    queryKey: ['clone-source', cloneOf],
    queryFn: () => registrationApi.cloneSource(cloneOf),
  });

  if (isLoading) {
    return <div className="rounded-xl border border-slate-200 bg-white p-8 text-sm text-slate-500">Copying the asset…</div>;
  }
  if (isError || !data) {
    return (
      <div className="rounded-xl border border-health-critical/30 bg-red-50 p-6 text-sm text-slate-700">
        <p className="font-semibold text-health-critical">That asset could not be copied.</p>
        <p className="mt-1 text-slate-600">It may have been retired since you opened this page.</p>
        <Button variant="outline" className="mt-4" onClick={() => setParams({ source: 'clone' })}>
          Pick another asset
        </Button>
      </div>
    );
  }

  return (
    <RegistrationForm
      source="clone"
      cloneOfId={cloneOf}
      initialValues={data.values}
      clearedFields={data.clearedFields}
      provenance={
        <div className="flex flex-wrap items-center gap-2 rounded-xl border border-slate-200 bg-slate-50/70 px-4 py-3 text-sm">
          <span className="text-slate-500">Copied from</span>
          <span className="font-medium text-slate-800">{data.sourceName}</span>
          <span className="font-mono text-xs text-slate-400">{data.sourceId}</span>
          <button
            type="button"
            onClick={() => setParams({ source: 'clone' })}
            className="ml-auto text-xs font-medium text-primary-600 hover:underline"
          >
            Choose a different asset
          </button>
        </div>
      }
    />
  );
}
