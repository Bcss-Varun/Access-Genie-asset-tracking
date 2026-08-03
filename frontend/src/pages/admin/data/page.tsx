import { allBackups } from '@/lib/dataset';
import { PageHeader, Badge } from '@/components/ui/primitives';
import { Button } from '@/components/ui/Button';
import { useToast } from '@/components/providers/ToastProvider';
import { relTime } from '@/lib/utils';

const backups = allBackups;
export default function DataPage() {
  const { toast } = useToast();

  return (
    <div className="h-full flex flex-col space-y-6">
      <PageHeader
        title="Data Import / Export & Backup"
        subtitle="Bulk data operations, tenant export & point-in-time restore."
        breadcrumb={[{ label: 'Administration' }, { label: 'Data' }]}
      />

      <div className="grid gap-4 lg:grid-cols-3">
        <div className="glass-panel flex flex-col rounded-xl p-5">
          <div className="text-2xl">📥</div>
          <h3 className="mt-2 font-heading font-semibold text-slate-900">Import Data</h3>
          <p className="mt-1 flex-1 text-sm text-slate-500">
            Bulk-load assets, locations & custody records via CSV upload or the REST API.
          </p>
          <div className="mt-4 flex gap-2">
            <Button
              size="sm"
              onClick={() => toast({ title: 'CSV import', description: 'Upload wizard opening — map your columns.', tone: 'info' })}
            >
              Upload CSV
            </Button>
            <Button
              size="sm"
              variant="outline"
              onClick={() => toast({ title: 'API import', description: 'See docs for the bulk ingest endpoint.', tone: 'info' })}
            >
              Via API
            </Button>
          </div>
        </div>

        <div className="glass-panel flex flex-col rounded-xl p-5">
          <div className="text-2xl">📤</div>
          <h3 className="mt-2 font-heading font-semibold text-slate-900">Export Tenant Data</h3>
          <p className="mt-1 flex-1 text-sm text-slate-500">
            Generate a full export of your tenant (assets, work orders, telemetry) as CSV or JSON.
          </p>
          <div className="mt-4 flex gap-2">
            <Button
              size="sm"
              onClick={() => toast({ title: 'Export queued', description: 'CSV export — download link will be emailed.', tone: 'success' })}
            >
              Export CSV
            </Button>
            <Button
              size="sm"
              variant="outline"
              onClick={() => toast({ title: 'Export queued', description: 'JSON export — download link will be emailed.', tone: 'success' })}
            >
              Export JSON
            </Button>
          </div>
        </div>

        <div className="glass-panel flex flex-col rounded-xl p-5">
          <div className="text-2xl">🛡️</div>
          <h3 className="mt-2 font-heading font-semibold text-slate-900">Backups</h3>
          <p className="mt-1 flex-1 text-sm text-slate-500">
            Automated nightly snapshots with 30-day retention. Restore to any point in time.
          </p>
          <div className="mt-4">
            <Button
              size="sm"
              onClick={() => toast({ title: 'Backup started', description: 'On-demand snapshot in progress.', tone: 'success' })}
            >
              Run Backup Now
            </Button>
          </div>
        </div>
      </div>

      <div className="glass-panel rounded-xl overflow-hidden">
        <div className="border-b border-slate-100 px-5 py-3">
          <h3 className="font-heading font-semibold text-slate-900">Recent Backups</h3>
        </div>
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
                    <div className="flex items-center justify-end gap-1">
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => toast({ title: 'Download', description: `Preparing ${b.id} (${b.size}).`, tone: 'info' })}
                      >
                        Download
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => toast({ title: 'Restore', description: `Point-in-time restore from ${b.id} requested.`, tone: 'info' })}
                      >
                        Restore
                      </Button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
