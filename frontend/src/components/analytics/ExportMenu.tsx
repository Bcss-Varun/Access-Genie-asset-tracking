import { useState } from 'react';
import type { ReportExportFormat } from '@access-genie/shared';
import { Dropdown, MenuItem } from '@/components/ui/Dropdown';
import { Button } from '@/components/ui/Button';
import { useToast } from '@/components/providers/ToastProvider';
import { ApiRequestError } from '@/api/client';

/**
 * Export, wherever a report is shown.
 *
 * There is no Export Centre any more, and this is why there does not need to
 * be one: the file is produced by the same request that produces the numbers,
 * streamed back and saved. The old two-step flow queued a job, listed it, and
 * left rows in that list with no file behind them.
 *
 * The formats are labelled by what the reader will do with them rather than by
 * extension, because "which of CSV, XLSX and PDF do I want" is a question about
 * the next step, not about file types.
 */
const FORMATS: { id: ReportExportFormat; label: string; hint: string }[] = [
  { id: 'csv', label: 'CSV', hint: 'For any spreadsheet or BI tool' },
  { id: 'xlsx', label: 'Excel', hint: 'Formatted workbook' },
  { id: 'pdf', label: 'PDF', hint: 'For sharing and filing' },
  { id: 'json', label: 'JSON', hint: 'For a downstream system' },
];

export function ExportMenu({
  onExport,
  label = 'Export',
  variant = 'outline',
  size = 'sm',
  disabled,
}: {
  onExport: (format: ReportExportFormat) => Promise<void>;
  label?: string;
  variant?: 'primary' | 'outline' | 'ghost';
  size?: 'sm' | 'md';
  disabled?: boolean;
}) {
  const { toast } = useToast();
  const [busy, setBusy] = useState<ReportExportFormat | null>(null);

  const run = async (format: ReportExportFormat, close: () => void) => {
    close();
    setBusy(format);
    try {
      await onExport(format);
      toast({ title: `${format.toUpperCase()} downloaded`, tone: 'success' });
    } catch (err) {
      // The blob response type means an API error arrives as a Blob rather than
      // as parsed JSON, so the message has to be read out of it explicitly —
      // otherwise every failure reads "[object Blob]".
      toast({
        title: 'Could not export',
        description: await describeExportError(err),
        tone: 'error',
      });
    } finally {
      setBusy(null);
    }
  };

  return (
    <Dropdown
      ariaLabel="Export format"
      trigger={({ toggle }) => (
        <Button variant={variant} size={size} onClick={toggle} disabled={disabled || busy !== null}>
          {busy ? `${busy.toUpperCase()}…` : label}
        </Button>
      )}
    >
      {({ close }) => (
        <>
          {FORMATS.map((format) => (
            <MenuItem key={format.id} onClick={() => void run(format.id, close)}>
              <span className="flex flex-col">
                <span className="font-medium">{format.label}</span>
                <span className="text-[11px] text-slate-400">{format.hint}</span>
              </span>
            </MenuItem>
          ))}
        </>
      )}
    </Dropdown>
  );
}

async function describeExportError(err: unknown): Promise<string> {
  if (err instanceof ApiRequestError) return err.message;

  const response = (err as { response?: { data?: unknown } })?.response;
  const data = response?.data;
  if (data instanceof Blob) {
    try {
      const parsed = JSON.parse(await data.text()) as { error?: { message?: string } };
      if (parsed.error?.message) return parsed.error.message;
    } catch {
      // Not JSON — fall through to the generic message.
    }
  }
  return 'The export failed. Please try again.';
}
