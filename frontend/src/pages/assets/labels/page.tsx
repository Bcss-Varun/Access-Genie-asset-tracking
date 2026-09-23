// ─────────────────────────────────────────────────────────────────────────────
// Label & Tag Printing — Asset Management (docs/06 C6, docs/21 §21.3.4).
//
// The module exists because printing a label and binding a tag are the SAME
// event and most systems treat them as two. Here they are one: a print run
// mints the identity tag, binds it to the asset through the registry, and lands
// it in the three-state model — Unlabelled · Bound · Verified. Printing
// binds identity; verification is a separate operator action after scanning.
//
// One page, two tabs, because an operator labelling a rack of servers should
// change what they are looking at, not walk back up the sidebar:
//
//   Print labels — pick assets, pick a size and encoding, see the paper, print.
//   Tag coverage — who has an identity label and who only has a beacon,
//                  searchable by tag ID or asset and filterable by bind date.
// ─────────────────────────────────────────────────────────────────────────────

import { useCallback, useMemo, useRef, useState, useSyncExternalStore } from 'react';
import { Link } from 'react-router-dom';
import { useRegistry } from '@/components/providers/RegistryProvider';
import { useToast } from '@/components/providers/ToastProvider';
import { PageHeader, Badge, EmptyState } from '@/components/ui/primitives';
import { Button } from '@/components/ui/Button';
import { Tabs, useTabs } from '@/components/tracking/shell';
import type { LabelSpec } from '@/components/assets/LabelArtwork';
import { encodeCode128 } from '@/lib/code128';
import { encodeQr } from '@/lib/qr';
import {
  DEFAULT_TEMPLATE_ID, identityStatus, labelTemplates, templateById,
} from '@/lib/label-data';
import { mintTagId, scanUrlFor, takenTagIds } from '@/lib/onboarding';
import { cn, relTime, nowMs } from '@/lib/utils';
import { KIND_FOR_MEDIUM } from '@access-genie/shared';
import type { LabelFieldKey, LabelMedium } from '@access-genie/shared';
import type { RegisteredAsset, TagBinding } from '@access-genie/shared';
import { categoryEmoji } from '@/lib/asset-categories';

// ── Deep-link entry ──────────────────────────────────────────────────────────
// `/assets/labels?ids=AST-1003,AST-1010` is how the registry's bulk bar and the
// Asset 360 overflow menu hand a selection over. The URL is a client-only store,
// so it is read through `useSyncExternalStore` — the server snapshot is the
// stable default and React swaps the real value in during hydration.

const inertStore = () => () => {};
const NO_IDS: string[] = [];
let idsCache: { raw: string; value: string[] } | null = null;

function readLinkedIds(): string[] {
  const raw = new URLSearchParams(window.location.search).get('ids') ?? '';
  if (!idsCache || idsCache.raw !== raw) {
    const value = raw.split(',').map((s) => s.trim()).filter(Boolean);
    idsCache = { raw, value: value.length ? value : NO_IDS };
  }
  return idsCache.value;
}

// ── Chrome ───────────────────────────────────────────────────────────────────

const TAB_KEYS = ['print', 'tags'] as const;
type Tab = (typeof TAB_KEYS)[number];

const th = 'px-4 py-2.5 text-left text-[11px] font-semibold uppercase tracking-wider text-slate-500 select-none whitespace-nowrap';
const td = 'px-4 py-3 align-middle';
const inputCls = 'w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-800 outline-none focus:ring-2 focus:ring-primary-500';

const IDENTITY_TONE = { Verified: 'emerald', Bound: 'amber', Unlabelled: 'red' } as const;

// ── Label artwork ────────────────────────────────────────────────────────────
// The sheet preview draws its own glyphs at screen scale rather than reusing the
// true-millimetre <LabelArtwork>, so the preview reads at a comfortable size on
// screen and still prints one card per label. Deterministic by asset id — a
// cheap FNV-1a hash seeds a small LCG, so there is no hydration drift.

/** The three stock sizes on offer, and how each renders on screen. */
const STOCK_SIZES = [
  { label: 'Small', key: 'sm' as const, card: 'p-3', code: 96, name: 'text-[11px]', meta: 'text-[9px]' },
  { label: 'Medium', key: 'md' as const, card: 'p-4', code: 128, name: 'text-sm', meta: 'text-[10px]' },
  { label: 'Large', key: 'lg' as const, card: 'p-5', code: 168, name: 'text-base', meta: 'text-xs' },
];

/** The three encodings on offer. */
const ENCODINGS: LabelMedium[] = ['QR', 'Barcode', 'RFID'];

/** What can be shown under the asset ID. */
const SHOW_ON_LABEL: { key: LabelFieldKey; label: string }[] = [
  { key: 'name', label: 'Asset name' },
  { key: 'custodian', label: 'Custodian' },
  { key: 'location', label: 'Location' },
];

function CodeGlyph({ id, format, px }: { id: string; format: LabelMedium; px: number }) {
  const payload = scanUrlFor(id);
  const matrix = useMemo(() => encodeQr(payload, 'M'), [payload]);
  const barcode = useMemo(() => encodeCode128(payload), [payload]);
  if (format === 'RFID') {
    return <div className="max-w-44 rounded-lg border border-amber-200 bg-amber-50 p-3 text-xs text-amber-900" role="status">
      RFID needs a configured hardware encoder to write this asset URL to a physical tag.
    </div>;
  }
  if (format === 'Barcode') {
    return <svg viewBox={`0 0 ${barcode.modules} 100`} width={px * 1.45} height={px * 0.62} shapeRendering="crispEdges" role="img" aria-label={`Barcode code encoding ${payload}`}>
      <rect width={barcode.modules} height="100" fill="white" />
      {barcode.bars.map((bar, index) => <rect key={index} x={bar.x} y="8" width={bar.width} height="72" fill="#0f172a" />)}
      <text x={barcode.modules / 2} y="94" textAnchor="middle" fontSize="8" fontFamily="ui-monospace, monospace" fill="#0f172a">{payload}</text>
    </svg>;
  }
  const unit = 100 / (matrix.length + 8);
  return <svg viewBox="0 0 100 100" width={px} height={px} shapeRendering="crispEdges" role="img" aria-label={`QR code encoding ${payload}`}>
    <rect width="100" height="100" fill="white" />
    {matrix.flatMap((row, r) => row.map((on, c) => on ? <rect key={`${r}-${c}`} x={(c + 4) * unit} y={(r + 4) * unit} width={unit + 0.02} height={unit + 0.02} fill="#0f172a" /> : null))}
  </svg>;
}

export default function LabelPrintingPage() {
  const { assets, addBinding, verifyBinding } = useRegistry();
  const { toast } = useToast();
  const [tab, setTab] = useTabs<Tab>(TAB_KEYS, 'print');

  const identity = useCallback((a: RegisteredAsset) => identityStatus(a), []);

  /** Assets carrying a beacon but no printed identity — the module's real job. */
  const unlabelled = useMemo(
    () => assets.filter((a) => identity(a).state === 'Unlabelled'),
    [assets, identity],
  );
  // ── Selection ──────────────────────────────────────────────────────────────
  const linkedIds = useSyncExternalStore(inertStore, readLinkedIds, () => NO_IDS);
  const [chosen, setChosen] = useState<Set<string> | null>(null);

  const selected = useMemo(() => {
    if (chosen) return chosen;
    // A deep link wins; otherwise the assets that actually need a label are
    // preselected, because an empty sheet answers nobody's question.
    if (linkedIds.length) return new Set(linkedIds);
    return new Set(unlabelled.map((a) => a.id));
  }, [chosen, linkedIds, unlabelled]);

  const selectedAssets = useMemo(
    () => assets.filter((a) => selected.has(a.id)),
    [assets, selected],
  );

  const toggle = (id: string) =>
    setChosen(() => {
      const n = new Set(selected);
      if (n.has(id)) n.delete(id); else n.add(id);
      return n;
    });

  const selectOnly = (ids: string[]) => setChosen(new Set(ids));

  // ── Label spec ─────────────────────────────────────────────────────────────
  // The IT standard is the starting point; the three controls below fork a
  // working spec off it rather than mutating the shared built-in.
  const template = templateById(DEFAULT_TEMPLATE_ID) ?? labelTemplates[0];

  const [draft, setDraft] = useState<LabelSpec | null>(null);
  // Nobody has registered a template yet in a brand-new org — this route no
  // longer requires one to render (see RequireLabelWorkspace), so fall back to
  // a plain default rather than reading fields off `undefined`.
  const spec: LabelSpec = draft ?? (template
    ? {
      medium: template.medium,
      size: template.size,
      fields: template.fields,
      showLogo: template.showLogo,
      showBorder: template.showBorder,
    }
    : { medium: 'QR', size: 'md', fields: ['name', 'serial', 'tagId'], showLogo: true, showBorder: false });

  const editSpec = (patch: Partial<LabelSpec>) => setDraft({ ...spec, ...patch });
  const [search, setSearch] = useState('');

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return assets;
    return assets.filter((a) =>
      `${a.name} ${a.id} ${a.category} ${a.custodian} ${a.serialNumber}`.toLowerCase().includes(q));
  }, [assets, search]);

  /** How the sheet preview draws — falls back to Medium for template-only stocks. */
  const drawSpec = STOCK_SIZES.find((s) => s.key === spec.size) ?? STOCK_SIZES[1];
  const printLock = useRef(false);
  const [printing, setPrinting] = useState(false);

  // ── Printing ───────────────────────────────────────────────────────────────

  const taken = useMemo(() => takenTagIds(assets), [assets]);

  // Binding is durable before opening the browser dialog. Printing does not
  // prove a physical label was produced or scanned.
  const runPrint = async () => {
    if (printLock.current || !selectedAssets.length || spec.medium === 'RFID') return;
    printLock.current = true; setPrinting(true);
    const mint = new Set(taken);
    try {
      for (const asset of selectedAssets) {
        if (identity(asset).binding) continue;
        const kind = KIND_FOR_MEDIUM[spec.medium];
        const tagId = mintTagId(kind, mint); mint.add(tagId);
        const saved = await addBinding(asset.id, {
          id: `TB-${asset.id}-${asset.onboarding.bindings.length + 1}`, tagId, kind,
          role: 'identity', state: 'Bound', boundAt: new Date(nowMs()).toISOString(),
        });
        if (!saved) return;
      }
      // Allow the persisted tag IDs to render before the print snapshot.
      await new Promise<void>((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => resolve())));
      window.print();
      toast({ title: 'Print dialog opened', description: 'Tags saved. Verify each label after printing and scanning.', tone: 'info' });
    } finally { printLock.current = false; setPrinting(false); }
  };

  // ── Tag coverage ───────────────────────────────────────────────────────────
  // Three filters that stack: identity state, free text, and the window the tag
  // was bound in. Text matches the tag ID as well as the asset, because the thing
  // an operator has in hand is usually the label, not the asset name.
  const [coverageFilter, setCoverageFilter] = useState<'all' | 'Unlabelled' | 'Bound' | 'Verified'>('all');
  const [tagSearch, setTagSearch] = useState('');
  const [boundFrom, setBoundFrom] = useState('');
  const [boundTo, setBoundTo] = useState('');

  const dateFiltered = !!(boundFrom || boundTo);

  const coverageRows = useMemo(() => {
    const q = tagSearch.trim().toLowerCase();
    // Dates come out of <input type="date"> as YYYY-MM-DD, and every boundAt is an
    // ISO string, so a plain prefix comparison is both correct and timezone-proof.
    const from = boundFrom || null;
    const to = boundTo || null;

    return assets
      .map((a) => ({ asset: a, status: identity(a) }))
      .filter((r) => coverageFilter === 'all' || r.status.state === coverageFilter)
      .filter((r) => {
        if (!q) return true;
        const tags = [r.status.binding, ...r.status.otherTags]
          .filter(Boolean)
          .map((b) => `${b!.tagId} ${b!.kind}`)
          .join(' ');
        return `${r.asset.name} ${r.asset.id} ${r.asset.category} ${r.asset.custodian} ${r.asset.serialNumber} ${tags}`
          .toLowerCase()
          .includes(q);
      })
      .filter((r) => {
        if (!from && !to) return true;
        // An asset with no tag has no bind date, so a date filter excludes it.
        const day = r.status.binding?.boundAt.slice(0, 10);
        if (!day) return false;
        if (from && day < from) return false;
        if (to && day > to) return false;
        return true;
      });
  }, [assets, identity, coverageFilter, tagSearch, boundFrom, boundTo]);

  const clearCoverageFilters = () => {
    setCoverageFilter('all');
    setTagSearch('');
    setBoundFrom('');
    setBoundTo('');
  };

  const markVerified = async (asset: RegisteredAsset, binding: TagBinding) => {
    if (!await verifyBinding(asset.id, binding.id)) return;
    toast({ title: 'Tag marked verified', description: `${binding.tagId} · ${asset.name}`, tone: 'success' });
  };

  const labelAndPrint = (ids: string[]) => {
    selectOnly(ids);
    setTab('print');
  };

  // ── Render ─────────────────────────────────────────────────────────────────

  return (
    <div className="flex h-full flex-col space-y-6">
      <style>{`
        @media print {
          @page { margin: 8mm; }
          body { background: #ffffff !important; }
          body #root, body #root > div, #main, #main > div { height: auto !important; overflow: visible !important; }
          .app-sidebar, .app-header, .app-skip { display: none !important; }
          #main { padding: 0 !important; }
          .no-print { display: none !important; }
          .print-plain { border: 0 !important; box-shadow: none !important; background: transparent !important; padding: 0 !important; }
          .print-sheet { position: static !important; }
          .print-card { break-inside: avoid; }
        }
      `}</style>

      <div className="no-print space-y-5">
        <PageHeader
          title="Label Printing"
          subtitle="Print scannable QR and Code 128 labels. RFID requires a configured hardware encoder."
          breadcrumb={[{ label: 'Assets', href: '/assets' }, { label: 'Labels' }]}
          actions={
            <>
              {/*
                The browser's own print dialog, which offers "Save as PDF" on
                every platform. There is no PDF library here, and shipping one
                to reproduce a layout the print stylesheet already renders
                correctly would be a worse file from more code.
              */}
              <Button
                variant="outline"
                disabled={!selectedAssets.length || printing || spec.medium === 'RFID'}
                onClick={() => void runPrint()}
              >
                Save as PDF
              </Button>
              <Button onClick={() => void runPrint()} disabled={!selectedAssets.length || printing || spec.medium === 'RFID'}>
                🖨 Print {selectedAssets.length > 0 ? `(${selectedAssets.length})` : ''}
              </Button>
            </>
          }
        />

        <Tabs<Tab>
          value={tab}
          onChange={setTab}
          tabs={[
            { key: 'print', label: 'Print labels', count: selected.size },
            { key: 'tags', label: 'Tag coverage', count: unlabelled.length, tone: 'amber' },
          ]}
        />
      </div>

      {/* ══ Print labels ═══════════════════════════════════════════════════ */}
      {tab === 'print' && (
        <div className="grid min-h-0 flex-1 grid-cols-1 gap-6 lg:grid-cols-[minmax(300px,360px)_1fr]">
          {/* ── Left: picker + controls ─────────────────────────────────────── */}
          <div className="no-print flex min-h-0 flex-col gap-4">
            {/* Asset picker */}
            <div className="glass-panel flex min-h-0 flex-1 flex-col rounded-xl">
              <div className="space-y-2 border-b border-slate-200 p-3">
                <div className="flex items-center justify-between">
                  <h2 className="font-heading text-sm font-semibold text-slate-800">Assets</h2>
                  <Badge tone={selected.size > 0 ? 'primary' : 'slate'}>{selected.size} selected</Badge>
                </div>
                <input
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Search assets…"
                  aria-label="Search assets"
                  className="w-full rounded-md bg-slate-100 px-3 py-1.5 text-sm outline-none focus:ring-2 focus:ring-primary-500"
                />
                <div className="flex items-center gap-2 text-xs">
                  <button
                    onClick={() => selectOnly([...new Set([...selected, ...filtered.map((a) => a.id)])])}
                    className="font-medium text-primary-600 hover:text-primary-700"
                  >
                    Select all filtered
                  </button>
                  <span className="text-slate-300">·</span>
                  <button onClick={() => selectOnly([])} className="font-medium text-slate-500 hover:text-slate-800">
                    Clear
                  </button>
                  <span className="ml-auto text-slate-400">{filtered.length} shown</span>
                </div>
              </div>

              <div className="min-h-0 flex-1 space-y-0.5 overflow-auto p-2">
                {filtered.map((a) => (
                  <label
                    key={a.id}
                    className={cn(
                      'flex cursor-pointer items-center gap-3 rounded-lg px-2.5 py-2 transition-colors',
                      selected.has(a.id) ? 'bg-primary-50' : 'hover:bg-slate-50',
                    )}
                  >
                    <input
                      type="checkbox"
                      checked={selected.has(a.id)}
                      onChange={() => toggle(a.id)}
                      className="accent-primary-600"
                      aria-label={`Select ${a.name}`}
                    />
                    <span className="shrink-0 text-base">{categoryEmoji(a.category)}</span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-medium text-slate-800">{a.name}</span>
                      <span className="block text-[11px] text-slate-400">{a.id}</span>
                    </span>
                  </label>
                ))}
                {filtered.length === 0 && (
                  <div className="px-3 py-6 text-center text-sm text-slate-400">No assets match “{search}”.</div>
                )}
              </div>
            </div>

            {/* Controls */}
            <div className="glass-panel space-y-4 rounded-xl p-4">
              <div>
                <div className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-slate-400">Label size</div>
                <div className="grid grid-cols-3 gap-1.5">
                  {STOCK_SIZES.map((s) => (
                    <button
                      key={s.key}
                      onClick={() => editSpec({ size: s.key })}
                      className={cn(
                        'rounded-md border px-2 py-1.5 text-xs font-medium transition-colors',
                        spec.size === s.key
                          ? 'border-primary-300 bg-primary-50 text-primary-700'
                          : 'border-slate-200 text-slate-500 hover:bg-slate-50',
                      )}
                    >
                      {s.label}
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <div className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-slate-400">Encoding format</div>
                <div className="inline-flex w-full rounded-md border border-slate-200 p-0.5">
                  {ENCODINGS.map((f) => (
                    <button
                      key={f}
                      onClick={() => editSpec({ medium: f })}
                      className={cn(
                        'flex-1 rounded px-2 py-1.5 text-xs font-medium transition-colors',
                        spec.medium === f ? 'bg-slate-900 text-white shadow-sm' : 'text-slate-500 hover:text-slate-800',
                      )}
                    >
                      {f}
                    </button>
                  ))}
                </div>
                {spec.medium === 'RFID' && (
                  <p className="mt-2 rounded-md bg-amber-50 px-3 py-2 text-xs text-amber-900" role="status">
                    RFID tags cannot be produced by a browser or paper printer. Configure a compatible RFID encoder before creating these labels.
                  </p>
                )}
              </div>

              <div>
                <div className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-slate-400">Show on label</div>
                <div className="space-y-1.5">
                  {SHOW_ON_LABEL.map((row) => (
                    <label key={row.key} className="flex cursor-pointer items-center gap-2.5 text-sm text-slate-600">
                      <input
                        type="checkbox"
                        checked={spec.fields.includes(row.key)}
                        onChange={(e) =>
                          editSpec({
                            fields: e.target.checked
                              ? [...spec.fields, row.key]
                              : spec.fields.filter((k) => k !== row.key),
                          })
                        }
                        className="accent-primary-600"
                      />
                      {row.label}
                    </label>
                  ))}
                </div>
              </div>
            </div>
          </div>

          {/* ── Right: print-friendly label sheet ───────────────────────────── */}
          <div className="glass-panel print-plain flex min-h-0 flex-col rounded-xl print:border-0 print:shadow-none">
            <div className="no-print flex items-center justify-between border-b border-slate-200 px-4 py-3">
              <div>
                <h2 className="font-heading text-sm font-semibold text-slate-800">Label sheet preview</h2>
                <p className="text-xs text-slate-400">
                  {selectedAssets.length} {spec.medium} label{selectedAssets.length === 1 ? '' : 's'} · {drawSpec.label}
                </p>
              </div>
              <span className="text-[11px] italic text-slate-400">Colors and margins optimize automatically on print.</span>
            </div>

            <div className="min-h-0 flex-1 overflow-auto p-4 print:overflow-visible print:p-0">
              {selectedAssets.length === 0 ? (
                <EmptyState
                  icon="🏷️"
                  title="No assets selected"
                  description="Pick one or more assets from the list to generate printable labels."
                />
              ) : (
                <div className="label-sheet print-sheet flex flex-wrap gap-3 print:gap-2">
                  {selectedAssets.map((a) => (
                    <div
                      key={a.id}
                      className={cn(
                        'print-card glass-panel flex shrink-0 items-center gap-3 rounded-lg print:border-slate-300 print:shadow-none',
                        drawSpec.card,
                      )}
                      style={{ width: drawSpec.code + 150 }}
                    >
                      <CodeGlyph id={a.id} format={spec.medium} px={drawSpec.code} />
                      <div className="min-w-0 flex-1">
                        <div className={cn('font-mono font-semibold text-slate-900', drawSpec.meta)}>{a.id}</div>
                        {spec.fields.includes('name') && (
                          <div className={cn('mt-0.5 line-clamp-2 font-heading font-semibold leading-tight text-slate-800', drawSpec.name)}>
                            {a.name}
                          </div>
                        )}
                        <div className="mt-1 space-y-0.5">
                          {spec.fields.includes('custodian') && (
                            <div className={cn('truncate text-slate-500', drawSpec.meta)}>👤 {a.custodian}</div>
                          )}
                          {spec.fields.includes('location') && (
                            <div className={cn('truncate text-slate-500', drawSpec.meta)}>
                              📍 {a.location.name}{a.location.zone ? ` · ${a.location.zone}` : ''}
                            </div>
                          )}
                        </div>
                        <div className={cn('mt-1 uppercase tracking-wider text-slate-400', drawSpec.meta)}>
                          {spec.medium} · {a.trackingTech ?? 'Tag'}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      )}
      {/* ══ Tag coverage ═══════════════════════════════════════════════════ */}
      {tab === 'tags' && (
        <div className="no-print space-y-4">
          <div className="glass-panel rounded-xl p-4">
            {/* Search + bind-date window */}
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-[1fr_auto]">
              <label className="block">
                <span className="mb-1 block text-[11px] font-semibold uppercase tracking-wide text-slate-500">
                  Search
                </span>
                <input
                  value={tagSearch}
                  onChange={(e) => setTagSearch(e.target.value)}
                  placeholder="Tag ID, asset name, asset ID, serial or custodian…"
                  aria-label="Search tags and assets"
                  className={inputCls}
                />
              </label>

              <div>
                <span className="mb-1 block text-[11px] font-semibold uppercase tracking-wide text-slate-500">
                  Bound between
                </span>
                <div className="flex items-center gap-2">
                  <input
                    type="date"
                    value={boundFrom}
                    max={boundTo || undefined}
                    onChange={(e) => setBoundFrom(e.target.value)}
                    aria-label="Bound from"
                    className={cn(inputCls, 'w-auto')}
                  />
                  <span className="text-xs text-slate-400">to</span>
                  <input
                    type="date"
                    value={boundTo}
                    min={boundFrom || undefined}
                    onChange={(e) => setBoundTo(e.target.value)}
                    aria-label="Bound to"
                    className={cn(inputCls, 'w-auto')}
                  />
                </div>
              </div>
            </div>

            <div className="mt-3 flex flex-wrap items-center gap-1.5">
              {(['all', 'Unlabelled', 'Bound', 'Verified'] as const).map((f) => (
                <button
                  key={f}
                  onClick={() => setCoverageFilter(f)}
                  className={cn(
                    'rounded-full border px-3 py-1 text-xs font-medium transition-colors',
                    coverageFilter === f
                      ? 'border-primary-300 bg-primary-50 text-primary-700'
                      : 'border-slate-200 text-slate-500 hover:bg-slate-50',
                  )}
                >
                  {f === 'all' ? `All ${assets.length}` : f}
                  {f !== 'all' && (
                    <span className="ml-1.5 tabular-nums text-slate-400">
                      {assets.filter((a) => identity(a).state === f).length}
                    </span>
                  )}
                </button>
              ))}
              {unlabelled.length > 0 && (
                <Button size="sm" className="ml-auto" onClick={() => labelAndPrint(unlabelled.map((a) => a.id))}>
                  Label all {unlabelled.length} unlabelled
                </Button>
              )}
            </div>

            <div className="mt-2 flex flex-wrap items-center gap-2 text-xs text-slate-500">
              <span className="tabular-nums">
                {coverageRows.length} of {assets.length} shown
              </span>
              {dateFiltered && (
                <span className="text-slate-400">
                  · assets with no tag are hidden while a date range is set
                </span>
              )}
              {(tagSearch || dateFiltered || coverageFilter !== 'all') && (
                <button onClick={clearCoverageFilters} className="ml-auto font-medium text-primary-600 hover:text-primary-700">
                  Reset filters
                </button>
              )}
            </div>
          </div>

          <div className="glass-panel overflow-hidden rounded-xl">
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead className="border-b border-slate-200 bg-slate-50">
                  <tr>
                    <th className={th}>Asset</th>
                    <th className={th}>Identity label</th>
                    <th className={th}>Tag ID</th>
                    <th className={th}>Bound</th>
                    <th className={th}>Other tags</th>
                    <th className={th} />
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {coverageRows.map(({ asset, status }) => (
                    <tr key={asset.id} className="transition-colors hover:bg-slate-50">
                      <td className={td}>
                        <Link to={`/assets/${asset.id}`} className="flex items-center gap-2.5 group">
                          <span className="text-base">{categoryEmoji(asset.category)}</span>
                          <span className="min-w-0">
                            <span className="block truncate font-medium text-slate-800 group-hover:text-primary-600">{asset.name}</span>
                            <span className="block font-mono text-[11px] text-slate-400">{asset.id}</span>
                          </span>
                        </Link>
                      </td>
                      <td className={td}>
                        <Badge tone={IDENTITY_TONE[status.state]}>{status.state}</Badge>
                        {status.state === 'Bound' && (
                          <div className="mt-0.5 text-[11px] text-amber-700">Awaiting scan verification</div>
                        )}
                      </td>
                      <td className={cn(td, 'font-mono text-[13px] text-slate-700')}>
                        {status.binding?.tagId ?? <span className="font-sans text-slate-400">—</span>}
                        {status.binding && <div className="font-sans text-[11px] text-slate-400">{status.binding.kind}</div>}
                      </td>
                      <td className={cn(td, 'whitespace-nowrap text-slate-500')}>
                        {status.binding ? relTime(status.binding.boundAt) : '—'}
                      </td>
                      <td className={cn(td, 'text-slate-500')}>
                        {status.otherTags.length
                          ? status.otherTags.map((b) => b.kind).join(', ')
                          : <span className="text-slate-400">None</span>}
                      </td>
                      <td className={cn(td, 'text-right')}>
                        <div className="flex justify-end gap-1.5">
                          {status.state === 'Bound' && status.binding && (
                            <Button size="sm" variant="outline" onClick={() => markVerified(asset, status.binding!)}>
                              Mark verified
                            </Button>
                          )}
                          <Button size="sm" variant={status.state === 'Unlabelled' ? 'primary' : 'ghost'} onClick={() => labelAndPrint([asset.id])}>
                            {status.state === 'Unlabelled' ? 'Print & bind' : 'Reprint'}
                          </Button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {!coverageRows.length && (
              <EmptyState
                icon="🔍"
                title="No tags match these filters"
                description="Try a different search term, widen the bind-date range, or reset the filters."
                action={<Button variant="outline" onClick={clearCoverageFilters}>Reset filters</Button>}
                variant="no-results"
              />
            )}
          </div>
        </div>
      )}
    </div>
  );
}
