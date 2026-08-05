import { useQuery } from '@tanstack/react-query';
import { FormDialog } from '@/components/ui/FormDialog';
import { intelligenceApi } from '@/api/intelligence';
import { cn } from '@/lib/utils';

/**
 * Why this asset scores what it scores.
 *
 * There were three "Explain" buttons on the asset profile — on the health
 * panel, the insight card and the risk breakdown — and all three raised a toast
 * saying an explanation had been opened. The explanation existed the whole
 * time: `computeMetrics` records a `drivers` list for exactly this, and
 * `/intelligence/explain/:id` returns it.
 *
 * The scores shown here are recomputed from current data at request time, so
 * they can differ from the stored ones if the estate has changed since the last
 * recompute. That difference is worth showing rather than hiding — it is the
 * signal that a recompute is due.
 */

const band = (n: number, invert = false): string => {
  const good = invert ? n < 25 : n > 80;
  const bad = invert ? n >= 60 : n < 50;
  return good ? 'text-emerald-600' : bad ? 'text-red-600' : 'text-amber-600';
};

export function ExplainDialog({
  assetId,
  stored,
  onClose,
}: {
  assetId: string;
  /** What the asset record currently says, to compare against the live figure. */
  stored?: { healthScore?: number; utilization?: number; riskScore?: number };
  onClose: () => void;
}) {
  const { data, isLoading, error } = useQuery({
    queryKey: ['explain', assetId],
    queryFn: () => intelligenceApi.explain(assetId),
  });

  const rows = data
    ? [
        { label: 'Health', value: data.healthScore, was: stored?.healthScore, suffix: `/100 · ${data.healthStatus}` },
        { label: 'Utilization', value: data.utilization, was: stored?.utilization, suffix: '%' },
        { label: 'Risk', value: data.riskScore, was: stored?.riskScore, suffix: '/100', invert: true },
      ]
    : [];

  return (
    <FormDialog
      icon="🔍"
      title={`How ${assetId} is scored`}
      description="Recomputed from current work orders, schedules, presence and custody — not stored values."
      submitLabel="Close"
      cancelLabel=""
      onSubmit={onClose}
      onCancel={onClose}
    >
      {isLoading && <p className="text-sm text-slate-500">Recomputing…</p>}

      {error && (
        <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">
          Could not compute an explanation for this asset.
        </p>
      )}

      {data && (
        <>
          <div className="grid grid-cols-3 gap-3">
            {rows.map((r) => (
              <div key={r.label} className="rounded-lg border border-slate-200 p-3 text-center">
                <div className="text-xs font-medium uppercase tracking-wide text-slate-500">{r.label}</div>
                <div className={cn('mt-1 text-2xl font-semibold tabular-nums', band(r.value, r.invert))}>
                  {r.value}
                </div>
                <div className="text-[11px] text-slate-400">{r.suffix}</div>
                {r.was !== undefined && r.was !== r.value && (
                  <div className="mt-1 text-[11px] text-amber-600" title="The stored value is stale — run a recompute">
                    stored: {r.was}
                  </div>
                )}
              </div>
            ))}
          </div>

          <div>
            <h4 className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">What moved the numbers</h4>
            {data.drivers.length > 0 ? (
              <ul className="space-y-1.5">
                {data.drivers.map((d, i) => (
                  <li key={i} className="flex gap-2 rounded-lg bg-slate-50 px-3 py-2 text-sm text-slate-700">
                    <span className="text-slate-400">•</span>
                    <span>{d}</span>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="rounded-lg bg-emerald-50 px-3 py-2 text-sm text-emerald-800">
                Nothing is pulling this asset's scores down — no open corrective work, no overdue PM, and it is being
                seen where it is expected.
              </p>
            )}
          </div>
        </>
      )}
    </FormDialog>
  );
}
