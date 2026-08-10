import { useState } from 'react';
import type { Asset, LifecycleTransition } from '@access-genie/shared';
import { EmptyState } from '@/components/ui/primitives';
import { Button } from '@/components/ui/Button';
import { relTime, formatDate } from '@/lib/utils';
import { ChangeStageDialog } from './ChangeStageDialog';

/**
 * The Lifecycle tab on the asset profile — §13's "Lifecycle Timeline" and
 * "Audit Log" sections, and §14's AI-reserved placeholders, in one place.
 *
 * The structured transition history (reason/comments/approval/documents)
 * lives here rather than in the generic Timeline tab, which only ever shows
 * `Activity`'s free-text description — this reads the governed
 * `LifecycleTransition` rows directly, so it is the one place that can show
 * *why* a stage changed and whether it is still waiting on someone.
 */
export function LifecycleTab({ asset, history }: { asset: Asset; history: LifecycleTransition[] }) {
  const [changingStage, setChangingStage] = useState(false);
  const pending = history.find((t) => t.status === 'Pending');

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-3 rounded-lg border border-slate-200 bg-slate-50 px-4 py-3">
        <div>
          <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">Current stage</div>
          <div className="text-base font-bold text-slate-900">{asset.lifecycleStage}</div>
        </div>
        <Button size="sm" onClick={() => setChangingStage(true)}>
          Change Stage
        </Button>
      </div>

      {pending && (
        <div className="rounded-lg bg-amber-50 px-3 py-2.5 text-sm text-amber-800">
          <strong>Awaiting approval:</strong> {pending.requester} requested a move to{' '}
          <strong>{pending.toStage}</strong> — {pending.reason}
        </div>
      )}

      <div>
        <h3 className="mb-3 text-sm font-bold text-slate-800">Lifecycle timeline</h3>
        {history.length === 0 ? (
          <EmptyState
            icon="🔀"
            title="No stage changes yet"
            description="Every Change Stage request — applied or pending — appears here with who, when and why."
          />
        ) : (
          <ol className="relative ml-3 space-y-6 border-l border-slate-200">
            {history.map((t) => (
              <li key={t.id} className="ml-6">
                <span
                  className="absolute -left-[13px] flex h-6 w-6 items-center justify-center rounded-full text-xs ring-4 ring-background"
                  style={{ backgroundColor: t.status === 'Pending' ? '#f59e0b22' : t.status === 'Rejected' ? '#ef444422' : '#0ea5e922' }}
                >
                  {t.status === 'Pending' ? '⏳' : t.status === 'Rejected' ? '✕' : '🔀'}
                </span>
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-sm font-medium text-slate-800">
                    {t.fromStage} → {t.toStage}
                  </span>
                  <span
                    className="rounded-full px-1.5 py-0.5 text-[10px] font-medium"
                    style={{
                      color: t.status === 'Pending' ? '#b45309' : t.status === 'Rejected' ? '#b91c1c' : '#0369a1',
                      backgroundColor: t.status === 'Pending' ? '#fef3c7' : t.status === 'Rejected' ? '#fee2e2' : '#e0f2fe',
                    }}
                  >
                    {t.status}
                  </span>
                  {t.automated && (
                    <span className="rounded-full bg-slate-100 px-1.5 py-0.5 text-[10px] font-medium text-slate-500">
                      automated
                    </span>
                  )}
                </div>
                <p className="mt-0.5 text-sm text-slate-600">{t.reason}</p>
                {t.comments && <p className="mt-0.5 text-xs text-slate-500">{t.comments}</p>}
                <div className="mt-0.5 text-xs text-slate-500">
                  {t.requester} <span className="text-slate-300">•</span> {relTime(t.requestedAt)}
                  {t.decidedAt && t.decidedAt !== t.requestedAt && (
                    <>
                      {' '}
                      <span className="text-slate-300">•</span> decided {formatDate(t.decidedAt)}
                    </>
                  )}
                </div>
                {t.documentIds.length > 0 && (
                  <div className="mt-1 text-xs text-slate-400">{t.documentIds.length} supporting document(s)</div>
                )}
              </li>
            ))}
          </ol>
        )}
      </div>

      {/* §14 — reserved, not implemented. Architecture (risk score field,
          per-transition automation flag, health/warranty history above) is
          already in place to feed these; the models themselves are not. */}
      <div>
        <h3 className="mb-3 text-sm font-bold text-slate-800">AI Intelligence <span className="font-normal text-slate-400">(reserved)</span></h3>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
          {[
            ['⏳', 'Predict End of Life'],
            ['🔁', 'Recommend Replacement'],
            ['🛠️', 'Predict Maintenance'],
            ['💤', 'Identify Idle Assets'],
            ['↔️', 'Suggest Reassignment'],
            ['⚠️', 'Lifecycle Risk Score'],
          ].map(([emoji, label]) => (
            <div key={label} className="rounded-lg border border-dashed border-slate-200 px-3 py-3 text-center opacity-60">
              <div className="text-lg">{emoji}</div>
              <div className="mt-1 text-xs font-medium text-slate-500">{label}</div>
              <div className="mt-0.5 text-[10px] text-slate-400">Not yet computed</div>
            </div>
          ))}
        </div>
      </div>

      {changingStage && <ChangeStageDialog mode="single" asset={asset} onClose={() => setChangingStage(false)} />}
    </div>
  );
}
