import { useState } from 'react';
import { Link } from 'react-router-dom';
import type { Backup } from '@access-genie/shared';
import * as data from '@/lib/dataset';
import { PageHeader, Badge, EmptyState } from '@/components/ui/primitives';
import { Button } from '@/components/ui/Button';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import { useToast } from '@/components/providers/ToastProvider';
import { useMutate } from '@/api/mutate';
import { backupsApi, downloadCsv } from '@/api/configuration';
import { ApiRequestError } from '@/api/client';
import { relTime } from '@/lib/utils';

/**
 * Import, export and backup.
 *
 * Five buttons here raised toasts and did nothing — including "Restore", which
 * is the single worst place in the product for a control that reports success
 * without acting.
 *
 * Export now writes real files from the dataset the browser already holds,
 * which is the same data every screen renders, so an export cannot disagree
 * with what you were looking at. Restore is refused by the server with the
 * command to run instead: overwriting a live database from a web request is not
 * something this platform should be able to do, and saying so is more useful
 * than a spinner.
 */

/** The collections worth offering as their own file, and how to flatten each. */
function tables(): { key: string; label: string; rows: () => Record<string, unknown>[] }[] {
  return [
    {
      key: 'assets',
      label: 'Assets',
      rows: () =>
        data.allAssets.map((a) => ({
          id: a.id,
          name: a.name,
          category: a.category,
          serialNumber: a.serialNumber,
          status: a.status,
          criticality: a.criticality ?? '',
          custodian: a.custodian,
          location: a.location?.name ?? '',
          healthScore: a.healthScore,
          riskScore: a.riskScore ?? '',
          utilization: a.utilization ?? '',
          purchaseDate: a.purchaseDate,
          purchasePrice: a.purchasePrice,
          bookValue: a.bookValue ?? '',
        })),
    },
    {
      key: 'work-orders',
      label: 'Work orders',
      rows: () =>
        data.allWorkOrders.map((w) => ({
          id: w.id,
          title: w.title,
          assetId: w.assetId,
          asset: w.assetName,
          type: w.type,
          status: w.status,
          priority: w.priority,
          assignedTo: w.assignedTo,
          dueDate: w.dueDate,
        })),
    },
    {
      key: 'custody',
      label: 'Custody records',
      rows: () => data.allCustody.map((c) => ({ ...c })),
    },
    {
      key: 'alerts',
      label: 'Alerts',
      rows: () =>
        data.allAlerts.map((a) => ({
          id: a.id,
          title: a.title,
          severity: a.severity,
          type: a.type,
          assetId: a.assetId,
          status: a.status,
          createdAt: a.createdAt,
        })),
    },
    { key: 'certifications', label: 'Certifications', rows: () => data.allCertifications.map((c) => ({ ...c })) },
    { key: 'audit-log', label: 'Audit log', rows: () => data.allAuditLog.map((a) => ({ ...a })) },
  ];
}

/** Every collection, as one JSON document. */
function tenantJson(): string {
  const bundle: Record<string, unknown> = { exportedAt: new Date().toISOString(), observedAt: data.observedAt };
  for (const t of tables()) bundle[t.key] = t.rows();
  return JSON.stringify(bundle, null, 2);
}

export default function DataPage() {
  const { toast } = useToast();
  const { run, isPending } = useMutate();
  const [restoring, setRestoring] = useState<Backup | null>(null);
  const [busy, setBusy] = useState(false);

  const backups = data.allBackups;
  const today = new Date().toISOString().slice(0, 10);

  const exportCsvBundle = () => {
    // One file per collection: a single CSV cannot hold seven different shapes,
    // and a zip would need a library to build something a browser then has to
    // unpack anyway.
    let files = 0;
    let rows = 0;
    for (const t of tables()) {
      const written = downloadCsv(`${t.key}-${today}.csv`, t.rows());
      if (written > 0) {
        files++;
        rows += written;
      }
    }
    toast({
      title: files > 0 ? `${files} file${files === 1 ? '' : 's'} downloaded` : 'Nothing to export',
      description: files > 0 ? `${rows} rows across ${files} collections.` : 'There is no data in this tenant yet.',
      tone: files > 0 ? 'success' : 'info',
    });
  };

  const exportJson = () => {
    const blob = new Blob([tenantJson()], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = `tenant-export-${today}.json`;
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1_000);

    toast({ title: 'Tenant export downloaded', description: 'Every collection, as one JSON document.', tone: 'success' });
  };

  const runBackup = () =>
    void run(backupsApi.create(), {
      success: 'Snapshot recorded',
      successDetail: 'Listed below with the size of the estate at this moment.',
      describe: 'record that snapshot',
    });

  /**
   * Not routed through `useMutate`: the server always refuses, and the refusal
   * carries the command to run. Swallowing it into "Could not restore" would
   * throw away the only useful part of the response.
   */
  const requestRestore = async () => {
    if (!restoring) return;
    setBusy(true);
    try {
      await backupsApi.restore(restoring.id);
      toast({ title: 'Restore started', description: restoring.id, tone: 'success' });
    } catch (err) {
      toast({
        title: 'Restore must be run on the server',
        description: err instanceof ApiRequestError ? err.message : 'The request failed.',
        tone: 'info',
      });
    } finally {
      setBusy(false);
      setRestoring(null);
    }
  };

  return (
    <div className="h-full flex flex-col space-y-6">
      <PageHeader
        title="Data Import / Export & Backup"
        subtitle="Bulk data operations, tenant export & snapshots."
        breadcrumb={[{ label: 'Administration' }, { label: 'Data' }]}
      />

      <div className="grid gap-4 lg:grid-cols-3">
        <div className="glass-panel flex flex-col rounded-xl p-5">
          <div className="text-2xl">📥</div>
          <h3 className="mt-2 font-heading font-semibold text-slate-900">Import assets</h3>
          <p className="mt-1 flex-1 text-sm text-slate-500">
            Paste or upload a CSV, map the columns, review what will be created, then commit. Rows with errors are shown
            before anything is written.
          </p>
          <div className="mt-4 flex gap-2">
            <Link to="/assets/import">
              <Button size="sm">Open importer</Button>
            </Link>
          </div>
        </div>

        <div className="glass-panel flex flex-col rounded-xl p-5">
          <div className="text-2xl">📤</div>
          <h3 className="mt-2 font-heading font-semibold text-slate-900">Export tenant data</h3>
          <p className="mt-1 flex-1 text-sm text-slate-500">
            Downloads immediately from what this session holds — the same records every screen is rendering, so the
            export cannot disagree with the display.
          </p>
          <div className="mt-4 flex gap-2">
            <Button size="sm" onClick={exportCsvBundle}>
              CSV per table
            </Button>
            <Button size="sm" variant="outline" onClick={exportJson}>
              One JSON file
            </Button>
          </div>
        </div>

        <div className="glass-panel flex flex-col rounded-xl p-5">
          <div className="text-2xl">🛡️</div>
          <h3 className="mt-2 font-heading font-semibold text-slate-900">Snapshots</h3>
          <p className="mt-1 flex-1 text-sm text-slate-500">
            Records a point in time with the size of the estate at that moment. Restoring one is done against the
            database, not from here.
          </p>
          <div className="mt-4">
            <Button size="sm" disabled={isPending} onClick={runBackup}>
              {isPending ? 'Recording…' : 'Take snapshot'}
            </Button>
          </div>
        </div>
      </div>

      <div className="glass-panel rounded-xl overflow-hidden">
        <div className="border-b border-slate-100 px-5 py-3">
          <h3 className="font-heading font-semibold text-slate-900">Snapshots</h3>
        </div>

        {backups.length === 0 ? (
          <EmptyState
            icon="🛡️"
            title="No snapshots yet"
            description="Take one before a bulk import or a migration, so there is a marked point to compare against."
            action={<Button onClick={runBackup} disabled={isPending}>Take snapshot</Button>}
          />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-100 bg-slate-50/70 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">
                  <th className="px-5 py-2.5">Snapshot</th>
                  <th className="px-5 py-2.5">Created</th>
                  <th className="px-5 py-2.5 text-right">Size</th>
                  <th className="px-5 py-2.5">Status</th>
                  <th className="px-5 py-2.5 text-right">Actions</th>
                </tr>
              </thead>
              <tbody>
                {backups.map((b) => (
                  <tr key={b.id} className="border-b border-slate-100 last:border-0 hover:bg-slate-50/60 transition-colors">
                    <td className="px-5 py-3 font-mono text-xs text-slate-700">{b.id}</td>
                    <td className="px-5 py-3 text-slate-600">{relTime(b.when)}</td>
                    <td className="px-5 py-3 text-right tabular-nums text-slate-700">{b.size}</td>
                    <td className="px-5 py-3">
                      <Badge tone="emerald">{b.status}</Badge>
                    </td>
                    <td className="px-5 py-3 text-right">
                      <Button size="sm" variant="ghost" onClick={() => setRestoring(b)}>
                        Restore
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {restoring && (
        <ConfirmDialog
          title={`Restore from ${restoring.id}?`}
          description="A restore replaces every collection in the database. The platform will not do that from a web request — it will tell you the command to run instead."
          confirmLabel="Show me the command"
          busy={busy}
          onConfirm={() => void requestRestore()}
          onCancel={() => setRestoring(null)}
        />
      )}
    </div>
  );
}
