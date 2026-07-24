'use client';

import { useMemo, useState } from 'react';
import { mockAssets } from '@/lib/mock-data';
import type { Asset } from '@/types/asset';
import { PageHeader, Badge, EmptyState } from '@/components/ui/primitives';
import { Button } from '@/components/ui/Button';
import { useToast } from '@/components/providers/ToastProvider';
import { cn } from '@/lib/utils';

// ─────────────────────────────────────────────────────────────────────────────
// Deterministic pseudo-random helpers (NO Math.random / Date.now → no hydration
// drift). A cheap FNV-1a hash of the asset id seeds a small LCG.
// ─────────────────────────────────────────────────────────────────────────────
function hashId(id: string): number {
  let h = 2166136261;
  for (let i = 0; i < id.length; i++) {
    h ^= id.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}
function makeRng(seed: number): () => number {
  let s = seed >>> 0 || 1;
  return () => {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

type LabelFormat = 'QR' | 'Barcode' | 'RFID';
type LabelSize = 'Small' | 'Medium' | 'Large';

const SIZE_SPEC: Record<LabelSize, { card: string; code: number; name: string; meta: string }> = {
  Small: { card: 'p-3', code: 96, name: 'text-[11px]', meta: 'text-[9px]' },
  Medium: { card: 'p-4', code: 128, name: 'text-sm', meta: 'text-[10px]' },
  Large: { card: 'p-5', code: 168, name: 'text-base', meta: 'text-xs' },
};

const categoryEmoji = (c: Asset['category']) =>
  c === 'Endpoints' ? '📱' : c === 'Compute' ? '💻' : c === 'Network' ? '🌐' : c === 'Sensors' ? '📡' : c === 'Infrastructure' ? '⚡' : '⚙️';

// ── The hand-rolled "code" glyph (QR / Barcode / RFID) — deterministic by id ──
function CodeGlyph({ id, format, px }: { id: string; format: LabelFormat; px: number }) {
  const rng = useMemo(() => makeRng(hashId(id)), [id]);

  const svg = useMemo(() => {
    if (format === 'Barcode') {
      // 1D-style barcode: deterministic variable-width bars.
      const bars: { x: number; w: number }[] = [];
      let x = 0;
      const total = 100;
      while (x < total) {
        const w = 1 + Math.floor(rng() * 3);
        const dark = rng() > 0.42;
        if (dark) bars.push({ x, w });
        x += w;
      }
      return (
        <svg viewBox="0 0 100 100" width={px} height={px} shapeRendering="crispEdges" role="img" aria-label={`Barcode for ${id}`}>
          <rect x="0" y="0" width="100" height="100" fill="#ffffff" />
          {bars.map((b, i) => (
            <rect key={i} x={b.x} y="8" width={b.w} height="72" fill="#0f172a" />
          ))}
        </svg>
      );
    }

    if (format === 'RFID') {
      // RFID-encoded: a stylized antenna/chip motif (visual only).
      const coils = 4 + (hashId(id) % 3);
      const rings = Array.from({ length: coils }, (_, i) => 44 - i * 9);
      return (
        <svg viewBox="0 0 100 100" width={px} height={px} role="img" aria-label={`RFID tag for ${id}`}>
          <rect x="0" y="0" width="100" height="100" fill="#ffffff" />
          {rings.map((r, i) => (
            <rect
              key={i}
              x={50 - r}
              y={50 - r}
              width={r * 2}
              height={r * 2}
              rx="6"
              fill="none"
              stroke="#0f172a"
              strokeWidth={2}
              opacity={0.55 + i * 0.12}
            />
          ))}
          {/* chip */}
          <rect x="42" y="42" width="16" height="16" rx="2" fill="#0f172a" />
          <rect x="46" y="46" width="8" height="8" rx="1" fill="#ffffff" />
          {/* lead */}
          <rect x="49" y="4" width="2" height="10" fill="#0f172a" />
          <rect x="49" y="86" width="2" height="10" fill="#0f172a" />
        </svg>
      );
    }

    // QR / DataMatrix look: N×N matrix with three finder patterns.
    const N = 21;
    const cell = 100 / N;
    const finder = (r: number, c: number) =>
      // 7×7 finder eyes in the three corners
      (r < 7 && c < 7) || (r < 7 && c >= N - 7) || (r >= N - 7 && c < 7);
    const rects: React.ReactNode[] = [];
    for (let r = 0; r < N; r++) {
      for (let c = 0; c < N; c++) {
        if (finder(r, c)) continue;
        if (rng() > 0.5) {
          rects.push(<rect key={`${r}-${c}`} x={c * cell} y={r * cell} width={cell} height={cell} fill="#0f172a" />);
        }
      }
    }
    const FinderEye = ({ ox, oy }: { ox: number; oy: number }) => (
      <g transform={`translate(${ox} ${oy})`}>
        <rect x={0} y={0} width={cell * 7} height={cell * 7} fill="#0f172a" />
        <rect x={cell} y={cell} width={cell * 5} height={cell * 5} fill="#ffffff" />
        <rect x={cell * 2} y={cell * 2} width={cell * 3} height={cell * 3} fill="#0f172a" />
      </g>
    );
    return (
      <svg viewBox="0 0 100 100" width={px} height={px} shapeRendering="crispEdges" role="img" aria-label={`QR code for ${id}`}>
        <rect x="0" y="0" width="100" height="100" fill="#ffffff" />
        {rects}
        <FinderEye ox={0} oy={0} />
        <FinderEye ox={cell * (N - 7)} oy={0} />
        <FinderEye ox={0} oy={cell * (N - 7)} />
      </svg>
    );
  }, [id, format, px, rng]);

  return <div className="rounded-md border border-slate-200 bg-white p-1.5">{svg}</div>;
}

export default function LabelPrintingPage() {
  const { toast } = useToast();

  const [search, setSearch] = useState('');
  const [selected, setSelected] = useState<Set<string>>(new Set(['AST-1001', 'AST-1003', 'AST-1008']));
  const [size, setSize] = useState<LabelSize>('Medium');
  const [format, setFormat] = useState<LabelFormat>('QR');
  const [showName, setShowName] = useState(true);
  const [showCustodian, setShowCustodian] = useState(true);
  const [showLocation, setShowLocation] = useState(true);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return mockAssets;
    return mockAssets.filter((a) => `${a.name} ${a.id} ${a.category} ${a.custodian}`.toLowerCase().includes(q));
  }, [search]);

  const selectedAssets = useMemo(() => mockAssets.filter((a) => selected.has(a.id)), [selected]);

  const toggle = (id: string) =>
    setSelected((prev) => {
      const n = new Set(prev);
      n.has(id) ? n.delete(id) : n.add(id);
      return n;
    });
  const selectAllFiltered = () => setSelected((prev) => new Set([...prev, ...filtered.map((a) => a.id)]));
  const clearAll = () => setSelected(new Set());

  const spec = SIZE_SPEC[size];

  const handlePrint = () => {
    if (typeof window !== 'undefined' && selectedAssets.length > 0) window.print();
  };

  const formatButtons: LabelFormat[] = ['QR', 'Barcode', 'RFID'];

  return (
    <div className="h-full flex flex-col space-y-6">
      {/* Print-only styling: hide the app chrome, show only the label sheet. */}
      <style>{`
        @media print {
          body { background: #ffffff !important; }
          .no-print { display: none !important; }
          .print-sheet { position: static !important; }
          .print-card { break-inside: avoid; }
        }
      `}</style>

      <div className="no-print">
        <PageHeader
          title="Label Printing"
          subtitle="Generate scannable QR, barcode, or RFID-encoded labels for your assets."
          breadcrumb={[{ label: 'Assets' }, { label: 'Labels' }]}
          actions={
            <>
              <Button variant="outline" onClick={() => toast({ title: 'Preparing PDF', description: `${selectedAssets.length} labels queued for export`, tone: 'info' })}>
                Download PDF
              </Button>
              <Button onClick={handlePrint} disabled={selectedAssets.length === 0}>
                🖨 Print {selectedAssets.length > 0 ? `(${selectedAssets.length})` : ''}
              </Button>
            </>
          }
        />
      </div>

      <div className="flex-1 grid grid-cols-1 lg:grid-cols-[minmax(300px,360px)_1fr] gap-6 min-h-0">
        {/* ── Left: picker + controls ─────────────────────────────────────── */}
        <div className="no-print flex flex-col gap-4 min-h-0">
          {/* Asset picker */}
          <div className="glass-panel rounded-xl flex flex-col min-h-0 flex-1">
            <div className="p-3 border-b border-slate-200 space-y-2">
              <div className="flex items-center justify-between">
                <h2 className="text-sm font-heading font-semibold text-slate-800">Assets</h2>
                <Badge tone={selected.size > 0 ? 'primary' : 'slate'}>{selected.size} selected</Badge>
              </div>
              <input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search assets…"
                className="w-full px-3 py-1.5 bg-slate-100 rounded-md text-sm outline-none focus:ring-2 focus:ring-primary-500"
              />
              <div className="flex items-center gap-2 text-xs">
                <button onClick={selectAllFiltered} className="font-medium text-primary-600 hover:text-primary-700">
                  Select all filtered
                </button>
                <span className="text-slate-300">·</span>
                <button onClick={clearAll} className="font-medium text-slate-500 hover:text-slate-800">
                  Clear
                </button>
                <span className="ml-auto text-slate-400">{filtered.length} shown</span>
              </div>
            </div>
            <div className="flex-1 overflow-auto p-2 space-y-0.5">
              {filtered.map((a) => (
                <label
                  key={a.id}
                  className={cn(
                    'flex items-center gap-3 rounded-lg px-2.5 py-2 cursor-pointer transition-colors',
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
                  <span className="text-base shrink-0">{categoryEmoji(a.category)}</span>
                  <span className="min-w-0 flex-1">
                    <span className="block text-sm font-medium text-slate-800 truncate">{a.name}</span>
                    <span className="block text-[11px] text-slate-400">{a.id}</span>
                  </span>
                </label>
              ))}
              {filtered.length === 0 && <div className="px-3 py-6 text-center text-sm text-slate-400">No assets match “{search}”.</div>}
            </div>
          </div>

          {/* Controls */}
          <div className="glass-panel rounded-xl p-4 space-y-4">
            <div>
              <div className="text-xs font-semibold uppercase tracking-wide text-slate-400 mb-1.5">Label size</div>
              <div className="grid grid-cols-3 gap-1.5">
                {(['Small', 'Medium', 'Large'] as LabelSize[]).map((s) => (
                  <button
                    key={s}
                    onClick={() => setSize(s)}
                    className={cn(
                      'rounded-md border px-2 py-1.5 text-xs font-medium transition-colors',
                      size === s ? 'border-primary-300 bg-primary-50 text-primary-700' : 'border-slate-200 text-slate-500 hover:bg-slate-50',
                    )}
                  >
                    {s}
                  </button>
                ))}
              </div>
            </div>

            <div>
              <div className="text-xs font-semibold uppercase tracking-wide text-slate-400 mb-1.5">Encoding format</div>
              <div className="inline-flex w-full rounded-md border border-slate-200 p-0.5">
                {formatButtons.map((f) => (
                  <button
                    key={f}
                    onClick={() => setFormat(f)}
                    className={cn(
                      'flex-1 rounded px-2 py-1.5 text-xs font-medium transition-colors',
                      format === f ? 'bg-slate-900 text-white shadow-sm' : 'text-slate-500 hover:text-slate-800',
                    )}
                  >
                    {f}
                  </button>
                ))}
              </div>
            </div>

            <div>
              <div className="text-xs font-semibold uppercase tracking-wide text-slate-400 mb-1.5">Show on label</div>
              <div className="space-y-1.5">
                {[
                  { label: 'Asset name', v: showName, set: setShowName },
                  { label: 'Custodian', v: showCustodian, set: setShowCustodian },
                  { label: 'Location', v: showLocation, set: setShowLocation },
                ].map((row) => (
                  <label key={row.label} className="flex items-center gap-2.5 text-sm text-slate-600 cursor-pointer">
                    <input type="checkbox" checked={row.v} onChange={(e) => row.set(e.target.checked)} className="accent-primary-600" />
                    {row.label}
                  </label>
                ))}
              </div>
            </div>
          </div>
        </div>

        {/* ── Right: print-friendly label sheet ───────────────────────────── */}
        <div className="glass-panel rounded-xl flex flex-col min-h-0 print:border-0 print:shadow-none">
          <div className="no-print flex items-center justify-between border-b border-slate-200 px-4 py-3">
            <div>
              <h2 className="text-sm font-heading font-semibold text-slate-800">Label sheet preview</h2>
              <p className="text-xs text-slate-400">
                {selectedAssets.length} {format} label{selectedAssets.length === 1 ? '' : 's'} · {size}
              </p>
            </div>
            <span className="text-[11px] text-slate-400 italic">Colors and margins optimize automatically on print.</span>
          </div>

          <div className="flex-1 overflow-auto p-4 print:overflow-visible print:p-0">
            {selectedAssets.length === 0 ? (
              <EmptyState
                icon="🏷️"
                title="No assets selected"
                description="Pick one or more assets from the list to generate printable labels."
              />
            ) : (
              <div className="print-sheet flex flex-wrap gap-3 print:gap-2">
                {selectedAssets.map((a) => (
                  <div
                    key={a.id}
                    className={cn('print-card glass-panel rounded-lg flex items-center gap-3 shrink-0 print:border-slate-300 print:shadow-none', spec.card)}
                    style={{ width: spec.code + 150 }}
                  >
                    <CodeGlyph id={a.id} format={format} px={spec.code} />
                    <div className="min-w-0 flex-1">
                      <div className={cn('font-mono font-semibold text-slate-900', spec.meta)}>{a.id}</div>
                      {showName && <div className={cn('font-heading font-semibold text-slate-800 leading-tight mt-0.5 line-clamp-2', spec.name)}>{a.name}</div>}
                      <div className="mt-1 space-y-0.5">
                        {showCustodian && <div className={cn('text-slate-500 truncate', spec.meta)}>👤 {a.custodian}</div>}
                        {showLocation && <div className={cn('text-slate-500 truncate', spec.meta)}>📍 {a.location.name}{a.location.zone ? ` · ${a.location.zone}` : ''}</div>}
                      </div>
                      <div className={cn('mt-1 uppercase tracking-wider text-slate-400', spec.meta)}>{format} · {a.trackingTech ?? 'Tag'}</div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
