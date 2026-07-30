'use client';

// ─────────────────────────────────────────────────────────────────────────────
// Stage D — Activate.
//
// This replaces the unconditional "Review & Register" step. A review screen that
// every user clicks through every time is theatre — it trains people to skim. So
// the review appears ONLY when the registration triggers an approval: above the
// capitalisation threshold, or on a Critical asset.
//
// Activation is a distinct event from registration because it is what actually
// arms the organisation: PM schedules generate, depreciation starts, monitoring
// rules arm, the SLA clock starts (docs/21 §21.3.5).
// ─────────────────────────────────────────────────────────────────────────────

import { useState } from 'react';
import { useRegistry } from '@/components/providers/RegistryProvider';
import { useToast } from '@/components/providers/ToastProvider';
import { Button } from '@/components/ui/Button';
import { Badge } from '@/components/ui/primitives';
import { Note } from './fields';
import { evaluateGates, readiness, approvalReason, requiredGates, deriveCommercial, locationPath } from '@/lib/onboarding';
import { getClassTemplate, getMonitoringProfile } from '@/lib/asset-classes';
import { formatMoney } from '@/lib/utils';
import type { RegisteredAsset } from '@/types/onboarding';

function ReviewRow({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex items-baseline justify-between gap-4 py-1.5">
      <dt className="shrink-0 text-xs font-medium uppercase tracking-wide text-slate-400">{label}</dt>
      <dd className="min-w-0 text-right text-sm text-slate-800">{value}</dd>
    </div>
  );
}

export function ActivatePanel({
  asset, onDone,
}: {
  asset: RegisteredAsset;
  onDone: () => void;
}) {
  const { setState } = useRegistry();
  const { toast } = useToast();
  const [reviewing, setReviewing] = useState(false);

  const tpl = getClassTemplate(asset.onboarding.classId);
  const gates = evaluateGates(asset, tpl);
  const { met, total, ready } = readiness(gates);
  const approval = approvalReason(asset, tpl);
  const gaps = requiredGates(gates).filter((g) => g.state !== 'met');
  const d = deriveCommercial(asset.onboarding.commercial);
  const profile = getMonitoringProfile(asset.onboarding.monitoringProfileId);

  const activate = () => {
    setState(asset.id, 'Active');
    toast({
      title: 'Asset activated',
      description: 'PM schedule generated · depreciation started · monitoring armed',
      tone: 'success',
    });
    onDone();
  };

  const submit = () => {
    setState(asset.id, 'Pending Approval');
    toast({ title: 'Submitted for approval', description: approval ?? '', tone: 'info' });
    onDone();
  };

  // Already in service — resuming here is harmless, but activation is done.
  if (asset.onboarding.state === 'Active') {
    return (
      <section className="glass-panel rounded-xl border-l-4 border-l-emerald-400 p-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="font-heading text-base font-bold text-slate-900">In service</h2>
            <p className="mt-0.5 text-sm text-slate-500">
              Activated{asset.onboarding.activatedAt ? ` — ${asset.onboarding.activatedAt.slice(0, 10)}` : ''}. Edits
              here are ordinary changes to a live asset, each written to its timeline.
            </p>
          </div>
          <Button variant="outline" onClick={onDone}>Open Asset 360</Button>
        </div>
      </section>
    );
  }

  if (asset.onboarding.state === 'Pending Approval') {
    return (
      <section className="glass-panel rounded-xl border-l-4 border-l-amber-400 p-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="font-heading text-base font-bold text-slate-900">Pending approval</h2>
            <p className="mt-0.5 text-sm text-slate-500">{approval}</p>
          </div>
          <div className="flex items-center gap-2">
            <Button variant="outline" onClick={onDone}>Open Asset 360</Button>
            <Button onClick={activate}>Approve (demo)</Button>
          </div>
        </div>
      </section>
    );
  }

  return (
    <section className="glass-panel rounded-xl p-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0">
          <h2 className="font-heading text-base font-bold text-slate-900">
            {ready ? 'Ready to activate' : 'Not yet fit for service'}
          </h2>
          <p className="mt-0.5 text-sm text-slate-500">
            {ready
              ? 'Activation starts the PM schedule, depreciation, monitoring and the SLA clock.'
              : `${met} of ${total} gates met. The asset is real and usable — it just isn't operational yet.`}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Button variant="outline" onClick={onDone}>Save &amp; exit</Button>
          {ready && approval && <Button onClick={() => setReviewing((r) => !r)}>Review &amp; submit →</Button>}
          {ready && !approval && <Button onClick={activate}>Activate asset</Button>}
          {!ready && <Button disabled>Activate asset</Button>}
        </div>
      </div>

      {!ready && (
        <div className="mt-4 space-y-2">
          <Note icon="🧩">
            <span className="font-semibold">Leaving now is safe.</span> The draft keeps its ID and its URL, appears in
            the registry under <em>Setup incomplete</em>, and the open gates become tasks. Nothing is lost.
          </Note>
          <ul className="space-y-1">
            {gaps.map((g) => (
              <li key={g.key} className="flex items-center gap-2 text-xs text-slate-600">
                <span className="text-slate-300">•</span>
                <span className="font-semibold text-slate-700">{g.label}</span>
                <span className="text-slate-500">— {g.detail}</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {ready && approval && !reviewing && (
        <div className="mt-4">
          <Note tone="amber" icon="✋">
            <span className="font-semibold">This one earns a review.</span> {approval} — every other path activates
            without one, which is what keeps the review meaningful.
          </Note>
        </div>
      )}

      {/* The only review screen in the flow. */}
      {reviewing && (
        <div className="mt-5 rounded-xl border border-slate-200 bg-white p-5">
          <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
            <h3 className="font-heading text-sm font-bold text-slate-900">Review before submitting</h3>
            <Badge tone="amber">Approval required</Badge>
          </div>

          <dl className="divide-y divide-slate-100">
            <ReviewRow label="Asset" value={<span className="font-semibold">{asset.name}</span>} />
            <ReviewRow label="Identifier" value={<span className="font-mono text-xs">{asset.id} · SN {asset.serialNumber || '—'}</span>} />
            <ReviewRow label="Class / criticality" value={`${asset.category} · ${asset.criticality}`} />
            <ReviewRow label="Location" value={locationPath(asset)} />
            <ReviewRow label="Owner" value={`${asset.custodian || '—'}${asset.onboarding.department ? ` · ${asset.onboarding.department}` : ''}`} />
            <ReviewRow
              label="Tracking"
              value={
                asset.onboarding.trackingIntent === 'not-tracked'
                  ? 'Not tracked — by policy'
                  : asset.onboarding.bindings.filter((b) => !b.retiredAt).map((b) => `${b.tagId} (${b.state})`).join(', ') || 'None'
              }
            />
            <ReviewRow label="Monitoring" value={profile ? `${profile.name}${asset.onboarding.monitoringOverridden ? ' — customised' : ' — inherited'}` : 'None — by policy'} />
            <ReviewRow label="Maintenance" value={asset.onboarding.maintenancePlan === 'run-to-failure' ? 'Run to failure' : (tpl.pmPlan ?? 'Class default')} />
            <ReviewRow label="Purchase" value={asset.onboarding.commercial.purchasePrice ? `${formatMoney(asset.onboarding.commercial.purchasePrice)} · ${asset.onboarding.commercial.vendor ?? '—'}` : '—'} />
            <ReviewRow
              label="Warranty"
              value={d.warrantyStatus === 'Unknown' ? 'Unknown' : `${d.warrantyStatus}${d.warrantyRemainingDays !== null && d.warrantyRemainingDays >= 0 ? ` · ${d.warrantyRemainingDays} days left` : ''}`}
            />
            <ReviewRow label="Documents" value={asset.onboarding.documents.length ? `${asset.onboarding.documents.length} on file` : 'None'} />
          </dl>

          <div className="mt-4 flex flex-wrap items-center justify-end gap-2">
            <Button variant="ghost" onClick={() => setReviewing(false)}>Back</Button>
            <Button onClick={submit}>Submit for approval</Button>
          </div>
        </div>
      )}
    </section>
  );
}
