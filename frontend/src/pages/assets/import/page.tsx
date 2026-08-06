import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { PageHeader, Badge, EmptyState } from '@/components/ui/primitives';
import { Button } from '@/components/ui/Button';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import { useToast } from '@/components/providers/ToastProvider';
import { assetsApi } from '@/api/assets';
import { useAuth } from '@/api/auth';
import { useRefreshDataset } from '@/api/dataset';
import { ApiRequestError } from '@/api/client';
import { cn } from '@/lib/utils';
import { ASSET_CATEGORIES } from '@access-genie/shared';

// ── Target fields ──────────────────────────────────────────────────────────────
type TargetField = 'name' | 'serialNumber' | 'category' | 'custodian' | 'purchasePrice' | 'status' | 'ignore';

const TARGET_FIELDS: { value: TargetField; label: string }[] = [
  { value: 'name', label: 'Name' },
  { value: 'serialNumber', label: 'Serial Number' },
  { value: 'category', label: 'Category' },
  { value: 'custodian', label: 'Custodian' },
  { value: 'purchasePrice', label: 'Purchase Price' },
  { value: 'status', label: 'Status' },
  { value: 'ignore', label: '— Ignore —' },
];

const KNOWN_CATEGORIES: readonly string[] = ASSET_CATEGORIES;

// ── Sample CSV (raw rows) ──────────────────────────────────────────────────────
const SAMPLE_HEADERS = ['Asset Name', 'Serial', 'Category', 'Custodian', 'Purchase Price', 'Status'];
const SAMPLE_ROWS: string[][] = [
  ['Dell PowerEdge R740 Server', 'SN-SVR-1042', 'Compute', 'IT Ops', '8500', 'Active'],
  ['Cisco Catalyst 9500', 'SN-NET-0077', 'Network', 'Network Team', '12000', 'Active'],
  ['Dell Latitude 7440', 'SN-FK-1042', 'Compute', 'J. Okafor', '1899', 'Staging'],       // duplicate serial
  ['Smart TV — Break Room', 'SN-AV-3310', 'AV Equipment', 'R. Singh', '1200', 'Active'], // unknown category
  ['', 'SN-SEN-9921', 'Sensors', 'Facilities Team', '240', 'Active'],                  // missing name
  ['CRAC Cooling Unit CR-4', 'SN-FAC-5567', 'Facilities', 'K. Novak', '15750', 'Maintenance'],
];

// ── Validation ─────────────────────────────────────────────────────────────────
type RowStatus = 'valid' | 'warning' | 'error';
interface ValidatedRow {
  index: number;
  name: string;
  serialNumber: string;
  category: string;
  status: RowStatus;
  messages: string[];
}

const STEPS = ['Upload', 'Map columns', 'Validate', 'Commit'] as const;

const statusTone = (s: RowStatus) => (s === 'valid' ? 'emerald' : s === 'warning' ? 'amber' : 'red');
const statusIcon = (s: RowStatus) => (s === 'valid' ? '✓' : s === 'warning' ? '!' : '✕');
const statusLabel = (s: RowStatus) => (s === 'valid' ? 'Valid' : s === 'warning' ? 'Warning' : 'Error');

function autoMap(header: string): TargetField {
  const h = header.toLowerCase();
  if (h.includes('name')) return 'name';
  if (h.includes('serial') || h === 'sn') return 'serialNumber';
  if (h.includes('categor')) return 'category';
  if (h.includes('custodian') || h.includes('owner') || h.includes('assignee')) return 'custodian';
  if (h.includes('price') || h.includes('cost') || h.includes('value')) return 'purchasePrice';
  if (h.includes('status') || h.includes('state')) return 'status';
  return 'ignore';
}

export default function AssetImportPage() {
  const { toast } = useToast();
  const refreshDataset = useRefreshDataset();
  // Deleting is admin-only on the API; the undo is hidden rather than refused.
  const canDelete = useAuth().can('admin');
  const [step, setStep] = useState(0);
  const [headers, setHeaders] = useState<string[] | null>(null);
  const [rows, setRows] = useState<string[][]>([]);
  const [mapping, setMapping] = useState<TargetField[]>([]);
  const [dragOver, setDragOver] = useState(false);
  const [imported, setImported] = useState<number | null>(null);
  const [importing, setImporting] = useState(false);
  /**
   * IDs the API minted for this run, kept so the whole import can be undone.
   *
   * A bad mapping produces a hundred plausible-looking wrong assets, and
   * "delete them one at a time from the registry" is not a recovery path. The
   * server mints the IDs, so they are collected from the create responses
   * rather than guessed.
   */
  const [importedIds, setImportedIds] = useState<string[]>([]);
  const [confirmUndo, setConfirmUndo] = useState(false);
  const [undoing, setUndoing] = useState(false);

  const loadSample = () => {
    setHeaders(SAMPLE_HEADERS);
    setRows(SAMPLE_ROWS);
    setMapping(SAMPLE_HEADERS.map(autoMap));
    toast({ title: 'Sample CSV loaded', description: `${SAMPLE_ROWS.length} rows parsed`, tone: 'success' });
  };

  const resetAll = () => {
    setStep(0);
    setHeaders(null);
    setRows([]);
    setMapping([]);
    setImported(null);
    setImporting(false);
    setImportedIds([]);
  };

  /**
   * Drop a row before it is committed.
   *
   * Splicing the raw row is what makes this work: `validated` is derived from
   * `rows`, so removing one re-runs the whole validation pass — and a row whose
   * only problem was being a duplicate of the one just deleted goes back to
   * valid on its own.
   */
  const removeRow = (index: number) => setRows((list) => list.filter((_, i) => i !== index));

  /** Drop every row that cannot import, in one go. */
  const removeErrorRows = () => {
    const doomed = new Set(validated.filter((r) => r.status === 'error').map((r) => r.index));
    if (doomed.size === 0) return;
    setRows((list) => list.filter((_, i) => !doomed.has(i)));
    toast({ title: `Removed ${doomed.size} row${doomed.size === 1 ? '' : 's'}`, description: 'Rows with errors were dropped from this import.', tone: 'success' });
  };

  /**
   * Undo the run — delete every asset it created.
   *
   * Sequential, like the import itself, and it keeps going past a failure: an
   * asset that has already picked up an open work order is refused by the API,
   * and stopping there would strand the rest.
   */
  const undoImport = async () => {
    setUndoing(true);
    let removed = 0;
    const failures: string[] = [];

    for (const id of importedIds) {
      try {
        await assetsApi.remove(id);
        removed += 1;
      } catch (err) {
        failures.push(`${id}: ${err instanceof ApiRequestError ? err.message : 'refused'}`);
      }
    }

    await refreshDataset();
    setUndoing(false);
    setConfirmUndo(false);

    if (failures.length === 0) {
      toast({ title: 'Import undone', description: `${removed} asset${removed === 1 ? '' : 's'} deleted.`, tone: 'success' });
      resetAll();
      return;
    }

    // Partial undo: what is left is what could not be deleted, so the button
    // stays and retries only those.
    setImportedIds((ids) => ids.filter((id) => failures.some((f) => f.startsWith(`${id}:`))));
    setImported(failures.length);
    toast({
      title: `Deleted ${removed} of ${removed + failures.length}`,
      description: failures.slice(0, 3).join(' · '),
      tone: 'error',
    });
  };

  // Which target field each source column maps to → column index lookup.
  const colFor = (field: TargetField) => mapping.findIndex((m) => m === field);
  const val = (row: string[], field: TargetField) => {
    const i = colFor(field);
    return i >= 0 ? (row[i] ?? '').trim() : '';
  };

  // ── Validation pass (memoised) ───────────────────────────────────────────────
  const validated: ValidatedRow[] = useMemo(() => {
    if (!headers) return [];
    const seenSerials = new Map<string, number>();
    return rows.map((row, index) => {
      const name = val(row, 'name');
      const serialNumber = val(row, 'serialNumber');
      const category = val(row, 'category');
      const messages: string[] = [];
      let status: RowStatus = 'valid';

      if (!name) {
        messages.push('Missing name');
        status = 'error';
      }
      if (serialNumber) {
        if (seenSerials.has(serialNumber)) {
          messages.push(`Duplicate serial (row ${seenSerials.get(serialNumber)! + 1})`);
          if (status !== 'error') status = 'error';
        } else {
          seenSerials.set(serialNumber, index);
        }
      } else {
        messages.push('Missing serial number');
        if (status !== 'error') status = 'error';
      }
      if (category && !KNOWN_CATEGORIES.includes(category)) {
        messages.push(`Unknown category “${category}”`);
        if (status === 'valid') status = 'warning';
      }
      if (messages.length === 0) messages.push('Ready to import');
      return { index, name, serialNumber, category, status, messages };
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [headers, rows, mapping]);

  const counts = useMemo(() => {
    return validated.reduce(
      (acc, r) => {
        acc[r.status] += 1;
        return acc;
      },
      { valid: 0, warning: 0, error: 0 } as Record<RowStatus, number>,
    );
  }, [validated]);

  const importableCount = counts.valid + counts.warning; // errors excluded

  // ── Step gating ──────────────────────────────────────────────────────────────
  const mappedTargets = mapping.filter((m) => m !== 'ignore');
  const hasName = mappedTargets.includes('name');
  const hasSerial = mappedTargets.includes('serialNumber');
  const canNext = (() => {
    if (step === 0) return !!headers && rows.length > 0;
    if (step === 1) return hasName && hasSerial;
    if (step === 2) return importableCount > 0;
    return false;
  })();

  /**
   * Commit the mapped rows.
   *
   * Rows are posted one at a time rather than as a batch: the API mints an
   * `AST-…` per asset from a counter, and a partial failure has to leave the
   * rows that did import in the registry rather than rolling the file back.
   * The count reported at the end is what actually landed — a wizard that says
   * "142 imported" when 12 were rejected is worse than no wizard.
   */
  const doImport = async () => {
    setImporting(true);
    const importable = validated.filter((r) => r.status !== 'error');
    const createdIds: string[] = [];
    let ok = 0;
    const failures: string[] = [];

    for (const row of importable) {
      const source = rows[row.index];
      const custodian = val(source, 'custodian') || 'Unassigned';
      const price = Number(val(source, 'purchasePrice').replace(/[^0-9.]/g, '')) || 0;
      // An unrecognised category is a warning, not a rejection — the row still
      // describes a real asset, so it lands under the closest known category
      // and can be re-classified afterwards.
      const category = KNOWN_CATEGORIES.includes(row.category) ? row.category : 'Compute';

      try {
        const created = await assetsApi.create({
          name: row.name,
          serialNumber: row.serialNumber,
          category,
          custodian,
          purchasePrice: price,
          purchaseDate: new Date().toISOString().slice(0, 10),
          location: { id: 'LOC-RECEIVING', name: 'Receiving' },
        });
        createdIds.push(created.id);
        ok += 1;
      } catch (err) {
        failures.push(`${row.name || `Row ${row.index + 1}`}: ${err instanceof ApiRequestError ? err.message : 'rejected'}`);
      }
    }

    await refreshDataset();
    setImportedIds(createdIds);
    setImported(ok);
    setImporting(false);

    toast({
      title: failures.length ? `Imported ${ok} of ${importable.length}` : 'Import complete',
      description: failures.length ? failures.slice(0, 3).join(' · ') : `${ok} assets are in the registry`,
      tone: failures.length ? 'error' : 'success',
    });
  };

  const th = 'px-4 py-2.5 text-left font-semibold uppercase tracking-wider text-[11px] text-slate-500';
  const td = 'px-4 py-2.5 text-slate-700';

  return (
    <div className="h-full flex flex-col space-y-6">
      <PageHeader
        title="Bulk Import Assets"
        subtitle="Upload a CSV, map columns, validate, and commit to the registry."
        breadcrumb={[{ label: 'Assets', href: '/assets' }, { label: 'Import' }]}
        actions={
          headers ? (
            <Button variant="outline" onClick={resetAll}>Start over</Button>
          ) : undefined
        }
      />

      {/* Stepper */}
      <div className="glass-panel rounded-xl px-5 py-4">
        <ol className="flex items-center gap-2 sm:gap-4">
          {STEPS.map((label, i) => {
            const state = i < step ? 'done' : i === step ? 'current' : 'upcoming';
            return (
              <li key={label} className="flex items-center gap-2 sm:gap-4 flex-1 last:flex-none">
                <button
                  type="button"
                  disabled={i > step}
                  onClick={() => i < step && setStep(i)}
                  className={cn(
                    'flex items-center gap-2.5 min-w-0',
                    i < step ? 'cursor-pointer' : 'cursor-default',
                  )}
                >
                  <span
                    className={cn(
                      'inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-sm font-bold font-heading transition-colors',
                      state === 'done' && 'bg-primary-600 text-white',
                      state === 'current' && 'bg-primary-50 text-primary-700 ring-2 ring-primary-500',
                      state === 'upcoming' && 'bg-slate-100 text-slate-400',
                    )}
                  >
                    {state === 'done' ? '✓' : i + 1}
                  </span>
                  <span
                    className={cn(
                      'text-sm font-medium truncate hidden sm:inline',
                      state === 'upcoming' ? 'text-slate-400' : 'text-slate-800',
                    )}
                  >
                    {label}
                  </span>
                </button>
                {i < STEPS.length - 1 && (
                  <span className={cn('h-px flex-1 hidden sm:block', i < step ? 'bg-primary-300' : 'bg-slate-200')} />
                )}
              </li>
            );
          })}
        </ol>
      </div>

      {/* Step body */}
      <div className="glass-panel rounded-xl flex-1 overflow-hidden flex flex-col">
        {/* ── STEP 1: Upload ─────────────────────────────────────────────────── */}
        {step === 0 && (
          <div className="p-6 space-y-6 overflow-auto">
            <div
              onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
              onDragLeave={() => setDragOver(false)}
              onDrop={(e) => { e.preventDefault(); setDragOver(false); loadSample(); }}
              onClick={loadSample}
              role="button"
              tabIndex={0}
              onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); loadSample(); } }}
              className={cn(
                'flex flex-col items-center justify-center rounded-xl border-2 border-dashed px-6 py-12 text-center cursor-pointer transition-colors',
                dragOver ? 'border-primary-500 bg-primary-50' : 'border-slate-300 hover:border-primary-400 hover:bg-slate-50',
              )}
            >
              <div className="text-4xl mb-3">📄</div>
              <p className="text-base font-semibold text-slate-800 font-heading">Drop a CSV here or click to browse</p>
              <p className="text-sm text-slate-500 mt-1">Supports .csv up to 5&nbsp;MB · UTF-8 encoded</p>
              <div className="mt-4">
                <Button variant="outline" onClick={(e) => { e.stopPropagation(); loadSample(); }}>Use sample CSV</Button>
              </div>
            </div>

            {!headers ? (
              <EmptyState
                icon="🗂️"
                title="No file loaded yet"
                description="Load the sample CSV to preview how the wizard maps and validates your data before committing it to the registry."
                action={<Button onClick={loadSample}>Load sample CSV</Button>}
              />
            ) : (
              <div>
                <div className="flex items-center justify-between mb-2">
                  <h3 className="text-sm font-semibold text-slate-700 font-heading">Raw preview</h3>
                  <Badge tone="primary">{rows.length} rows · {headers.length} columns</Badge>
                </div>
                <div className="overflow-auto rounded-lg border border-slate-200">
                  <table className="w-full text-left text-sm whitespace-nowrap">
                    <thead className="bg-slate-50 border-b border-slate-200">
                      <tr>
                        <th className={cn(th, 'w-10')}>#</th>
                        {headers.map((h) => <th key={h} className={th}>{h}</th>)}
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {rows.map((row, ri) => (
                        <tr key={ri} className="hover:bg-slate-50">
                          <td className={cn(td, 'text-slate-400 tabular-nums')}>{ri + 1}</td>
                          {row.map((cell, ci) => (
                            <td key={ci} className={cn(td, !cell && 'text-slate-300 italic')}>{cell || 'empty'}</td>
                          ))}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </div>
        )}

        {/* ── STEP 2: Map columns ────────────────────────────────────────────── */}
        {step === 1 && headers && (
          <div className="p-6 space-y-4 overflow-auto">
            <p className="text-sm text-slate-500">
              Match each source column to a target field. Obvious matches are pre-selected. Name and Serial Number are required.
            </p>
            <div className="grid gap-3 sm:grid-cols-2">
              {headers.map((h, ci) => {
                const sample = rows.slice(0, 3).map((r) => r[ci]).filter(Boolean).join(', ');
                return (
                  <div key={h} className="rounded-lg border border-slate-200 p-3 flex items-center gap-3 bg-white">
                    <div className="min-w-0 flex-1">
                      <div className="text-sm font-medium text-slate-800 truncate">{h}</div>
                      <div className="text-xs text-slate-400 truncate">e.g. {sample || '—'}</div>
                    </div>
                    <span className="text-slate-300">→</span>
                    <select
                      value={mapping[ci]}
                      onChange={(e) => {
                        const next = [...mapping];
                        next[ci] = e.target.value as TargetField;
                        setMapping(next);
                      }}
                      className="px-3 py-1.5 bg-slate-100 rounded-md text-sm outline-none focus:ring-2 focus:ring-primary-500"
                    >
                      {TARGET_FIELDS.map((f) => <option key={f.value} value={f.value}>{f.label}</option>)}
                    </select>
                  </div>
                );
              })}
            </div>
            {(!hasName || !hasSerial) && (
              <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-2.5 text-sm text-amber-800">
                {!hasName && !hasSerial ? 'Map both Name and Serial Number to continue.'
                  : !hasName ? 'Map a column to Name to continue.'
                  : 'Map a column to Serial Number to continue.'}
              </div>
            )}
          </div>
        )}

        {/* ── STEP 3: Validate ───────────────────────────────────────────────── */}
        {step === 2 && headers && (
          <div className="p-6 space-y-4 overflow-auto">
            <div className="flex flex-wrap items-center gap-3">
              <Badge tone="emerald">{counts.valid} valid</Badge>
              <Badge tone="amber">{counts.warning} warnings</Badge>
              <Badge tone="red">{counts.error} errors</Badge>
              <span className="text-sm text-slate-500 ml-auto">
                {importableCount} of {validated.length} rows will import · {counts.error} excluded
              </span>
              {counts.error > 0 && (
                <Button size="sm" variant="outline" onClick={removeErrorRows}>
                  Remove {counts.error} error row{counts.error === 1 ? '' : 's'}
                </Button>
              )}
            </div>
            <div className="overflow-auto rounded-lg border border-slate-200">
              <table className="w-full text-left text-sm whitespace-nowrap">
                <thead className="bg-slate-50 border-b border-slate-200">
                  <tr>
                    <th className={cn(th, 'w-10')}>#</th>
                    <th className={th}>Status</th>
                    <th className={th}>Name</th>
                    <th className={th}>Serial</th>
                    <th className={th}>Category</th>
                    <th className={th}>Messages</th>
                    <th className={cn(th, 'w-10')}><span className="sr-only">Remove row</span></th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {validated.map((r) => (
                    <tr key={r.index} className={cn('hover:bg-slate-50', r.status === 'error' && 'bg-red-50/40')}>
                      <td className={cn(td, 'text-slate-400 tabular-nums')}>{r.index + 1}</td>
                      <td className={td}>
                        <Badge tone={statusTone(r.status)}>{statusIcon(r.status)} {statusLabel(r.status)}</Badge>
                      </td>
                      <td className={cn(td, !r.name && 'text-slate-300 italic')}>{r.name || 'missing'}</td>
                      <td className={td}>{r.serialNumber || '—'}</td>
                      <td className={td}>{r.category || '—'}</td>
                      <td className={cn(td, 'text-slate-500')}>{r.messages.join(' · ')}</td>
                      <td className={cn(td, 'text-right')}>
                        {/* Nothing has been written yet at this step, so dropping
                            a row needs no confirmation — it only edits the file. */}
                        <button
                          type="button"
                          onClick={() => removeRow(r.index)}
                          aria-label={`Remove row ${r.index + 1}${r.name ? ` — ${r.name}` : ''}`}
                          title="Remove this row from the import"
                          className="rounded p-1 text-slate-400 transition-colors hover:bg-red-100 hover:text-health-critical"
                        >
                          ✕
                        </button>
                      </td>
                    </tr>
                  ))}
                  {validated.length === 0 && (
                    <tr>
                      <td colSpan={7} className={cn(td, 'py-8 text-center text-slate-400')}>
                        Every row was removed. Go back to re-upload the file, or start over.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* ── STEP 4: Commit ─────────────────────────────────────────────────── */}
        {step === 3 && headers && (
          <div className="p-6 overflow-auto">
            {imported === null ? (
              <div className="max-w-xl mx-auto space-y-5 py-6">
                <div className="text-center">
                  <div className="text-4xl mb-2">🚀</div>
                  <h3 className="text-lg font-semibold text-slate-800 font-heading">Ready to import</h3>
                  <p className="text-sm text-slate-500 mt-1">
                    Review the summary below, then commit the valid rows to the registry.
                  </p>
                </div>
                <div className="rounded-lg border border-slate-200 divide-y divide-slate-100">
                  <div className="flex items-center justify-between px-4 py-3">
                    <span className="text-sm text-slate-600">Rows to import</span>
                    <span className="text-sm font-semibold text-slate-900 tabular-nums">{importableCount}</span>
                  </div>
                  <div className="flex items-center justify-between px-4 py-3">
                    <span className="text-sm text-slate-600">Including warnings</span>
                    <span className="text-sm font-semibold text-amber-600 tabular-nums">{counts.warning}</span>
                  </div>
                  <div className="flex items-center justify-between px-4 py-3">
                    <span className="text-sm text-slate-600">Excluded (errors)</span>
                    <span className="text-sm font-semibold text-health-critical tabular-nums">{counts.error}</span>
                  </div>
                </div>
                {counts.error > 0 && (
                  <p className="text-xs text-slate-400 text-center">
                    {counts.error} row{counts.error === 1 ? '' : 's'} with errors will be skipped and reported.
                  </p>
                )}
                <div className="flex justify-center">
                  <Button onClick={() => void doImport()} disabled={importableCount === 0 || importing}>
                    {importing ? 'Importing…' : `Import ${importableCount} asset${importableCount === 1 ? '' : 's'}`}
                  </Button>
                </div>
              </div>
            ) : (
              <EmptyState
                icon="✅"
                title={`Imported ${imported} asset${imported === 1 ? '' : 's'}`}
                description={
                  counts.error > 0
                    ? `${counts.error} row${counts.error === 1 ? '' : 's'} with errors were excluded from this import.`
                    : 'All valid rows were added to the registry.'
                }
                action={
                  <div className="flex flex-col items-center gap-3">
                    <div className="flex items-center gap-2">
                      <Link to="/assets">
                        <Button>View asset registry</Button>
                      </Link>
                      <Button variant="outline" onClick={resetAll}>Import another file</Button>
                    </div>
                    {/* The escape hatch for a wrong mapping — offered here, while
                        the run is still in front of you, rather than leaving a
                        hundred wrong rows to be picked off the registry later. */}
                    {canDelete && importedIds.length > 0 && (
                      <button
                        type="button"
                        onClick={() => setConfirmUndo(true)}
                        className="rounded-md px-2 py-1 text-xs font-medium text-slate-500 transition-colors hover:bg-red-50 hover:text-health-critical"
                      >
                        Imported the wrong file? Delete {importedIds.length} imported asset
                        {importedIds.length === 1 ? '' : 's'}
                      </button>
                    )}
                  </div>
                }
              />
            )}
          </div>
        )}

        {/* ── Footer nav ─────────────────────────────────────────────────────── */}
        {imported === null && (
          <div className="border-t border-slate-200 px-5 py-3 flex items-center justify-between">
            <Button variant="ghost" disabled={step === 0} onClick={() => setStep((s) => Math.max(0, s - 1))}>
              ← Back
            </Button>
            <span className="text-xs text-slate-400">Step {step + 1} of {STEPS.length}</span>
            {step < STEPS.length - 1 ? (
              <Button disabled={!canNext} onClick={() => setStep((s) => Math.min(STEPS.length - 1, s + 1))}>
                Next →
              </Button>
            ) : (
              <span className="w-[72px]" />
            )}
          </div>
        )}
      </div>

      {confirmUndo && (
        <ConfirmDialog
          title={`Delete ${importedIds.length} imported asset${importedIds.length === 1 ? '' : 's'}?`}
          description={
            <>
              Every asset created by this import is removed from the registry. Assets that already have an open work
              order are refused and will be reported. This cannot be undone.
            </>
          }
          confirmLabel={`Delete ${importedIds.length}`}
          busy={undoing}
          onConfirm={() => void undoImport()}
          onCancel={() => setConfirmUndo(false)}
        />
      )}
    </div>
  );
}
