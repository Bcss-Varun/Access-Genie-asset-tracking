import { Fragment, useState } from 'react';
import { useParams } from 'react-router-dom';
import { AUDIT_TRANSITIONS, type AuditStatus } from '@access-genie/shared';
import { auditCenterApi, useAudit, useAuditFindings, useRefreshAuditCenter } from '@/api/compliance';
import { ApiRequestError } from '@/api/client';
import { useAuth } from '@/api/auth';
import { useMutate } from '@/api/mutate';
import { Badge, EmptyState, ErrorState, PageHeader, TableSkeleton } from '@/components/ui/primitives';
import { Button } from '@/components/ui/Button';
import { relTime } from '@/lib/utils';
import { AUDIT_STATUS_TONE, FINDING_STATUS_TONE, SEVERITY_TONE, formatDateShort } from '@/components/compliance-monitoring/tokens';
import { FindingDialog } from '@/components/compliance-monitoring/FindingDialog';
import { EvidenceDialog } from '@/components/compliance-monitoring/EvidenceDialog';
import { ResolveFindingDialog } from '@/components/compliance-monitoring/ResolveFindingAuditDialog';

/**
 * One audit — its lifecycle, the findings raised against it, and the
 * evidence behind each one. Status only moves forward along
 * `AUDIT_TRANSITIONS`; the server refuses anything else, and the buttons
 * below only ever offer a move it would accept.
 */
export default function AuditDetailPage() {
  const { id } = useParams<{ id: string }>();
  const { can } = useAuth();
  const { run, isPending } = useMutate();
  const refresh = useRefreshAuditCenter();

  const [addingFinding, setAddingFinding] = useState(false);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [evidenceFor, setEvidenceFor] = useState<string | null>(null);
  const [resolvingFor, setResolvingFor] = useState<string | null>(null);

  const audit = useAudit(id);
  const findings = useAuditFindings(id);
  const canWrite = can('compliance');

  if (audit.error) {
    return (
      <div className="glass-panel">
        <ErrorState
          title="Could not load this audit"
          description={audit.error instanceof ApiRequestError ? audit.error.message : 'The request failed.'}
          requestId={audit.error instanceof ApiRequestError ? audit.error.requestId : undefined}
          onRetry={() => void audit.refetch()}
        />
      </div>
    );
  }

  if (audit.isLoading || !audit.data) return <TableSkeleton rows={6} columns={4} />;

  const record = audit.data;
  const nextStatuses = AUDIT_TRANSITIONS[record.status];
  const findingItems = findings.data?.items ?? [];

  const transition = async (status: AuditStatus) => {
    await run(auditCenterApi.transition(record.id, status), {
      success: `Audit moved to ${status}`,
      successDetail: record.name,
      describe: 'change that status',
      refresh,
    });
  };

  const activeFinding = evidenceFor ? findingItems.find((f) => f.id === evidenceFor) : undefined;
  const resolvingFinding = resolvingFor ? findingItems.find((f) => f.id === resolvingFor) : undefined;

  return (
    <div className="flex h-full flex-col space-y-5">
      <PageHeader
        title={record.name}
        subtitle={record.summary}
        breadcrumb={[{ label: 'Security & Compliance' }, { label: 'Audit Center', href: '/audit' }, { label: record.id }]}
        actions={
          canWrite && (
            <div className="flex items-center gap-2">
              {nextStatuses.map((status) => (
                <Button key={status} variant={status === 'Closed' ? 'outline' : 'primary'} disabled={isPending} onClick={() => void transition(status)}>
                  {status} →
                </Button>
              ))}
              <Button variant="outline" onClick={() => setAddingFinding(true)}>
                + Raise finding
              </Button>
            </div>
          )
        }
      />

      <div className="glass-panel grid grid-cols-2 gap-4 p-5 sm:grid-cols-4">
        <div>
          <div className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">Status</div>
          <Badge tone={AUDIT_STATUS_TONE[record.status]} className="mt-1.5">
            {record.status}
          </Badge>
        </div>
        <div>
          <div className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">Type</div>
          <div className="mt-1.5 text-sm text-slate-700">{record.type}</div>
        </div>
        <div>
          <div className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">Facility</div>
          <div className="mt-1.5 text-sm text-slate-700">{record.scopeId}</div>
        </div>
        <div>
          <div className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">Lead auditor</div>
          <div className="mt-1.5 text-sm text-slate-700">{record.leadAuditor}</div>
        </div>
        <div>
          <div className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">Start date</div>
          <div className="mt-1.5 text-sm text-slate-700">{formatDateShort(record.startDate)}</div>
        </div>
        <div>
          <div className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">Due date</div>
          <div className="mt-1.5 text-sm text-slate-700">{formatDateShort(record.dueDate)}</div>
        </div>
        <div>
          <div className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">Findings</div>
          <div className="mt-1.5 text-sm text-slate-700">
            {record.openFindingsCount} open / {record.findingsCount} total
          </div>
        </div>
        <div>
          <div className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">Opened by</div>
          <div className="mt-1.5 text-sm text-slate-700">{record.createdBy}</div>
        </div>
      </div>

      <div className="min-h-0 flex-1">
        <h2 className="mb-2 font-heading text-sm font-bold text-slate-900">Findings</h2>

        {findings.isLoading && findingItems.length === 0 ? (
          <TableSkeleton rows={4} columns={5} />
        ) : findingItems.length === 0 ? (
          <div className="glass-panel">
            <EmptyState icon="📌" title="No findings raised yet" description="Raise one against an asset or the audit generally." />
          </div>
        ) : (
          <div className="glass-panel overflow-hidden">
            <table className="w-full min-w-[860px] text-left text-sm">
              <thead className="border-b border-slate-200 bg-slate-50 text-xs font-semibold uppercase tracking-wider text-slate-500">
                <tr>
                  <th className="px-5 py-3">Finding</th>
                  <th className="px-5 py-3">Asset</th>
                  <th className="px-5 py-3">Severity</th>
                  <th className="px-5 py-3">Status</th>
                  <th className="px-5 py-3">Evidence</th>
                  <th className="px-5 py-3">Raised</th>
                  <th className="px-5 py-3 text-right">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {findingItems.map((finding) => (
                  <Fragment key={finding.id}>
                    <tr className="cursor-pointer hover:bg-slate-50" onClick={() => setExpanded((c) => (c === finding.id ? null : finding.id))}>
                      <td className="px-5 py-3">
                        <div className="font-medium text-slate-900">{finding.title}</div>
                        <div className="font-mono text-[11px] text-slate-400">{finding.id}</div>
                      </td>
                      <td className="px-5 py-3 text-slate-600">{finding.assetName ?? '—'}</td>
                      <td className="px-5 py-3">
                        <Badge tone={SEVERITY_TONE[finding.severity]}>{finding.severity}</Badge>
                      </td>
                      <td className="px-5 py-3">
                        <Badge tone={FINDING_STATUS_TONE[finding.status]}>{finding.status}</Badge>
                      </td>
                      <td className="px-5 py-3 text-slate-500">{finding.evidence.length}</td>
                      <td className="px-5 py-3 whitespace-nowrap text-slate-500">{relTime(finding.createdAt)}</td>
                      <td className="px-5 py-3 text-right whitespace-nowrap" onClick={(e) => e.stopPropagation()}>
                        {canWrite && (
                          <div className="flex items-center justify-end gap-3">
                            <button type="button" onClick={() => setEvidenceFor(finding.id)} className="text-xs font-medium text-slate-500 hover:text-slate-700">
                              + Evidence
                            </button>
                            {(finding.status === 'Open' || finding.status === 'In Progress') && (
                              <button type="button" onClick={() => setResolvingFor(finding.id)} className="text-xs font-medium text-primary-600 hover:text-primary-700">
                                Close →
                              </button>
                            )}
                          </div>
                        )}
                      </td>
                    </tr>
                    {expanded === finding.id && (
                      <tr className="bg-slate-50/70">
                        <td colSpan={7} className="px-5 py-4">
                          <p className="text-sm text-slate-700">{finding.description}</p>
                          {finding.correctiveAction && (
                            <p className="mt-2 text-sm text-slate-600">
                              <span className="font-semibold text-slate-500">Corrective action: </span>
                              {finding.correctiveAction}
                            </p>
                          )}
                          {finding.evidence.length > 0 && (
                            <div className="mt-3">
                              <div className="text-xs font-semibold uppercase tracking-wide text-slate-400">Evidence</div>
                              <ul className="mt-1.5 space-y-1.5">
                                {finding.evidence.map((e) => (
                                  <li key={e.id} className="text-sm text-slate-600">
                                    <span className="font-medium text-slate-800">{e.label}</span>
                                    {e.note && <span> — {e.note}</span>}
                                    {e.url && (
                                      <a href={e.url} target="_blank" rel="noreferrer" className="ml-1 text-primary-600 hover:text-primary-700">
                                        link
                                      </a>
                                    )}
                                    <span className="ml-2 text-xs text-slate-400">
                                      {e.uploadedBy} · {relTime(e.uploadedAt)}
                                    </span>
                                  </li>
                                ))}
                              </ul>
                            </div>
                          )}
                          {finding.resolvedAt && (
                            <p className="mt-2 text-xs text-slate-400">
                              {finding.status} by {finding.resolvedBy} · {relTime(finding.resolvedAt)}
                            </p>
                          )}
                        </td>
                      </tr>
                    )}
                  </Fragment>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {addingFinding && id && <FindingDialog auditId={id} onClose={() => setAddingFinding(false)} />}
      {activeFinding && id && <EvidenceDialog auditId={id} finding={activeFinding} onClose={() => setEvidenceFor(null)} />}
      {resolvingFinding && id && <ResolveFindingDialog auditId={id} finding={resolvingFinding} onClose={() => setResolvingFor(null)} />}
    </div>
  );
}
