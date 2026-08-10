import { useState } from 'react';
import { Link } from 'react-router-dom';
import { FormDialog } from '@/components/ui/FormDialog';
import { AssetPicker } from '@/components/ui/AssetPicker';
import { Badge } from '@/components/ui/primitives';
import { Button } from '@/components/ui/Button';
import { useToast } from '@/components/providers/ToastProvider';
import { fieldApi, type ScanResult } from '@/api/maintenance';
import { relTime } from '@/lib/utils';

// ─────────────────────────────────────────────────────────────────────────────
// Identify / Scan Asset — the one, unified way to look an asset up in the
// field. RFID, BLE, UWB, QR and GPS are all real tracking technologies this
// platform supports, but a technician never chooses between them: they scan,
// and the system resolves it. A search box stands in for the physical
// scanner — the same abstraction, the same backend call
// (`fieldApi.scan`, see fieldwork.service.ts) a camera or reader would drive.
// ─────────────────────────────────────────────────────────────────────────────

export function ScanAssetDialog({ onClose }: { onClose: () => void }) {
  const { toast } = useToast();
  const [assetId, setAssetId] = useState('');
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<ScanResult | null>(null);

  async function identify() {
    if (!assetId) return;
    setBusy(true);
    try {
      const res = await fieldApi.scan(assetId);
      setResult(res);
    } catch {
      toast({ title: 'Could not identify that asset', tone: 'error' });
    } finally {
      setBusy(false);
    }
  }

  if (result) {
    return (
      <FormDialog
        icon="🔍"
        title={result.asset.name}
        description={`${result.asset.id} · ${result.asset.category}`}
        submitLabel="Done"
        cancelLabel=""
        onSubmit={onClose}
        onCancel={onClose}
      >
        <dl className="space-y-1.5 text-sm">
          <div className="flex justify-between"><dt className="text-slate-500">Status</dt><dd className="font-medium text-slate-800">{result.asset.status}</dd></div>
          <div className="flex justify-between"><dt className="text-slate-500">Current custodian</dt><dd className="font-medium text-slate-800">{result.asset.custodian}</dd></div>
          <div className="flex justify-between"><dt className="text-slate-500">Current location</dt><dd className="font-medium text-slate-800">{result.asset.location}</dd></div>
          {result.presence && (
            <div className="flex justify-between"><dt className="text-slate-500">Last verified</dt><dd className="font-medium text-slate-800">{relTime(result.presence.lastSeen)} · {result.presence.zone}</dd></div>
          )}
          {result.openTasks[0] && (
            <div className="flex justify-between"><dt className="text-slate-500">Related work order</dt><dd className="font-mono text-xs font-medium text-primary-600">{result.openTasks[0].id}</dd></div>
          )}
        </dl>

        <div className="flex flex-wrap gap-2 pt-2">
          {result.actions.map((a) => (
            <Badge key={a.key} tone="slate">{a.label}</Badge>
          ))}
        </div>

        <div className="flex flex-wrap gap-2 pt-1">
          <Link to="/checkinout"><Button size="sm" variant="outline">Go to Check-in / Check-out</Button></Link>
          {result.openTasks[0] && (
            <Link to={`/maintenance/${result.openTasks[0].id}`}><Button size="sm" variant="outline">Open work order</Button></Link>
          )}
        </div>
      </FormDialog>
    );
  }

  return (
    <FormDialog
      icon="🔍"
      title="Identify / Scan Asset"
      description="Look an asset up the way a technician would in the field — the tag technology (RFID, BLE, UWB, QR) is resolved automatically."
      submitLabel={busy ? 'Identifying…' : 'Identify'}
      busy={busy}
      disabled={!assetId}
      onSubmit={() => void identify()}
      onCancel={onClose}
    >
      <AssetPicker value={assetId} onChange={setAssetId} label="Scan / search for an asset" required />
    </FormDialog>
  );
}
