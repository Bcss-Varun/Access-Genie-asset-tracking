// ─────────────────────────────────────────────────────────────────────────────
// Stage A — Source picker.
//
// "Add Asset" opens this, not a form. The first question becomes "where is this
// coming from?" — which every user can answer instantly, and whose answer
// eliminates most of the typing (docs/21 §21.3.2).
// ─────────────────────────────────────────────────────────────────────────────

import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/Button';
import { Badge } from '@/components/ui/primitives';
import { Note } from './fields';
import { SOURCES, warrantyEndFromTerm, suggestName } from '@/lib/onboarding';
import { ASSET_PO_LINES, SCAN_RESULTS, UNKNOWN_TAG_READS, kindFromTagId } from '@/lib/onboarding-sources';
import type { AssetCategory, ReceivedPoLine, } from '@access-genie/shared';
import { getClassTemplate } from '@/lib/asset-classes';
import { useClassLibrary } from '@/components/providers/ClassLibraryProvider';
import { locationOptions } from '@/lib/onboarding';
import { formatDate, formatMoney, cn } from '@/lib/utils';
import type { RegisteredAsset, RegistrationSeed, SourceKey } from '@access-genie/shared';

/** Resolve a facility (and optionally zone) name back to a scope-tree node id. */
function locationIdFor(facility: string, zone?: string): string | undefined {
  const opts = locationOptions();
  if (zone) {
    const exact = opts.find((o) => o.facility === facility && o.zone === zone);
    if (exact) return exact.id;
  }
  return opts.find((o) => o.facility === facility && !o.building && !o.zone)?.id;
}

const blankSeed = (source: SourceKey, provenance: string): RegistrationSeed => ({
  source, classId: '', name: '', manufacturer: '', model: '', serialNumber: '',
  criticality: 'Medium', category: 'Compute', provenance,
});

function seedFromPo(line: ReceivedPoLine): RegistrationSeed {
  const tpl = getClassTemplate(line.classId);
  return {
    source: 'po',
    classId: line.classId,
    category: line.category as AssetCategory,
    // Deliberately left blank: a PO line spawns several units, so the name has
    // to derive from the serial or they all come out identical.
    name: '',
    manufacturer: line.manufacturer,
    model: line.model,
    serialNumber: '',
    criticality: tpl.defaultCriticality ?? 'Medium',
    provenance: `${line.poRef} · ${line.vendor} · received ${line.receivedAt}`,
    vendor: line.vendor,
    poRef: line.poRef,
    purchasePrice: line.unitCost,
    purchaseDate: line.receivedAt,
    warrantyStart: line.receivedAt,
    warrantyEnd: warrantyEndFromTerm(line.receivedAt, line.warrantyMonths),
    locationId: line.facilityHint ? locationIdFor(line.facilityHint) : undefined,
    quantity: line.quantity - line.registered,
  };
}

// ── Sub-pickers ──────────────────────────────────────────────────────────────

function PoPicker({ onPick }: { onPick: (s: RegistrationSeed) => void }) {
  return (
    <div className="space-y-2">
      {ASSET_PO_LINES.map((line) => {
        const left = line.quantity - line.registered;
        return (
          <button
            key={line.id}
            type="button"
            onClick={() => onPick(seedFromPo(line))}
            className="flex w-full flex-wrap items-center justify-between gap-3 rounded-lg border border-slate-200 px-4 py-3 text-left transition-colors hover:border-primary-300 hover:bg-primary-50/40"
          >
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-sm font-semibold text-slate-900">{line.description}</span>
                <Badge tone="slate">{line.poRef}</Badge>
              </div>
              <p className="mt-0.5 text-xs text-slate-500">
                {line.vendor} · received {line.receivedAt} · {formatMoney(line.unitCost)} per unit · {line.warrantyMonths}-month warranty
              </p>
            </div>
            <div className="shrink-0 text-right">
              <div className="text-sm font-semibold text-slate-900">{left} to register</div>
              <div className="text-[11px] text-slate-400">{line.registered} of {line.quantity} done</div>
            </div>
          </button>
        );
      })}
      <Note tone="primary" icon="💡">
        Everything on the goods receipt carries over — manufacturer, model, cost, vendor, PO reference and warranty
        term. Only the serial number is genuinely new information.
      </Note>
    </div>
  );
}

function TemplatePicker({ onPick }: { onPick: (s: RegistrationSeed) => void }) {
  const { classes } = useClassLibrary();
  return (
    <div className="grid gap-2 sm:grid-cols-2">
      {classes.map((cls) => {
        const tpl = getClassTemplate(cls.id);
        return (
          <button
            key={cls.id}
            type="button"
            onClick={() =>
              onPick({
                ...blankSeed('template', `Asset class template · ${cls.name}`),
                classId: cls.id,
                category: cls.name as RegistrationSeed['category'],
                criticality: tpl.defaultCriticality ?? 'Medium',
              })
            }
            className="rounded-lg border border-slate-200 px-4 py-3 text-left transition-colors hover:border-primary-300 hover:bg-primary-50/40"
          >
            <div className="flex items-center gap-2">
              <span className="text-lg leading-none">{cls.icon}</span>
              <span className="text-sm font-semibold text-slate-900">{cls.name}</span>
            </div>
            <p className="mt-1 text-[11px] leading-relaxed text-slate-500">
              {cls.attributes.length} attributes · {tpl.activationGates.length} activation gates ·{' '}
              {tpl.trackingExpected ? 'tracking expected' : 'tracking optional'}
            </p>
          </button>
        );
      })}
    </div>
  );
}

function ClonePicker({ assets, onPick }: { assets: RegisteredAsset[]; onPick: (s: RegistrationSeed) => void }) {
  const [q, setQ] = useState('');
  const rows = assets
    .filter((a) => !a.onboarding.voidedAt)
    .filter((a) => `${a.name} ${a.id} ${a.manufacturer ?? ''} ${a.model ?? ''}`.toLowerCase().includes(q.toLowerCase()))
    .slice(0, 6);

  return (
    <div className="space-y-2">
      <input
        className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm shadow-sm placeholder:text-slate-400 focus:border-primary-500 focus:outline-none focus:ring-2 focus:ring-primary-500/30"
        value={q}
        onChange={(e) => setQ(e.target.value)}
        placeholder="Search assets to clone…"
        aria-label="Search assets to clone"
      />
      {rows.map((a) => (
        <button
          key={a.id}
          type="button"
          onClick={() =>
            onPick({
              source: 'clone',
              classId: a.onboarding.classId,
              category: a.category,
              name: a.name,
              manufacturer: a.manufacturer ?? '',
              model: a.model ?? '',
              serialNumber: '',
              criticality: a.criticality ?? 'Medium',
              provenance: `Cloned from ${a.id} — ${a.name}`,
              vendor: a.onboarding.commercial.vendor,
              purchasePrice: a.purchasePrice,
              custodian: a.custodian,
              department: a.onboarding.department,
            })
          }
          className="flex w-full items-center justify-between gap-3 rounded-lg border border-slate-200 px-4 py-2.5 text-left transition-colors hover:border-primary-300 hover:bg-primary-50/40"
        >
          <div className="min-w-0">
            <div className="truncate text-sm font-semibold text-slate-900">{a.name}</div>
            <div className="text-xs text-slate-500">{a.id} · {a.category} · {a.custodian}</div>
          </div>
          <span className="shrink-0 text-xs font-medium text-primary-600">Clone →</span>
        </button>
      ))}
      <Note icon="ℹ️">Everything copies except serial number, tag binding and location — the three things that are unique to the physical unit.</Note>
    </div>
  );
}

function ScanPicker({ onPick }: { onPick: (s: RegistrationSeed) => void }) {
  const [scanning, setScanning] = useState(false);
  const [idx, setIdx] = useState(0);

  const runScan = () => {
    setScanning(true);
    // Simulated handheld read — barcode, then nameplate OCR, then gateway fix.
    window.setTimeout(() => {
      const hit = SCAN_RESULTS[idx % SCAN_RESULTS.length];
      setIdx((i) => i + 1);
      setScanning(false);
      const tpl = getClassTemplate(hit.classId);
      onPick({
        source: 'scan',
        classId: hit.classId,
        category: hit.category as AssetCategory,
        name: suggestName(hit.manufacturer, hit.model, hit.serial),
        manufacturer: hit.manufacturer,
        model: hit.model,
        serialNumber: hit.serial,
        criticality: tpl.defaultCriticality ?? 'Medium',
        provenance: `Scanned at ${hit.facility} ▸ ${hit.zone} · nameplate OCR ${hit.confidence}% confident`,
        locationId: locationIdFor(hit.facility, hit.zone),
      });
    }, 900);
  };

  return (
    <div className="space-y-3">
      <div className="flex flex-col items-center rounded-xl border border-dashed border-slate-300 bg-slate-50 px-6 py-8 text-center">
        <div className={cn('text-4xl transition-transform', scanning && 'animate-pulse')}>{scanning ? '📡' : '📷'}</div>
        <p className="mt-3 text-sm font-semibold text-slate-800">
          {scanning ? 'Reading barcode and nameplate…' : 'Point the handheld at the serial barcode'}
        </p>
        <p className="mt-1 max-w-sm text-xs text-slate-500">
          Serial comes from the barcode, make and model from nameplate OCR, and the location from whichever gateway
          saw the scan. The technician confirms; they don&apos;t type.
        </p>
        <Button className="mt-4" onClick={runScan} disabled={scanning}>
          {scanning ? 'Scanning…' : 'Simulate scan'}
        </Button>
      </div>
      <Note tone="primary" icon="⏱">
        This is the highest-volume real-world path. Target is under 45 seconds from scan to a committed asset — if a
        technician can&apos;t register from the dock, the data goes into a spreadsheet instead.
      </Note>
    </div>
  );
}

function AdoptPicker({ onPick }: { onPick: (s: RegistrationSeed) => void }) {
  return (
    <div className="space-y-2">
      {UNKNOWN_TAG_READS.map((t) => {
        const kind = kindFromTagId(t.tagId);
        return (
        <button
          key={t.tagId}
          type="button"
          onClick={() =>
            onPick({
              ...blankSeed('adopt', `Adopting unknown tag ${t.tagId} — first seen ${t.firstSeen} in ${t.zone}`),
              locationId: locationIdFor(t.facility, t.zone),
              preboundTag: { tagId: t.tagId, kind },
            })
          }
          className="flex w-full flex-wrap items-center justify-between gap-3 rounded-lg border border-amber-200 bg-amber-50/60 px-4 py-3 text-left transition-colors hover:border-amber-300 hover:bg-amber-50"
        >
          <div className="min-w-0">
            <div className="font-mono text-sm font-semibold text-slate-900">{t.tagId}</div>
            <p className="mt-0.5 text-xs text-slate-600">
              {kind} · {t.facility} ▸ {t.zone} · {t.seenCount} reads · first seen {formatDate(t.firstSeen)}
            </p>
          </div>
          <span className="shrink-0 text-xs font-medium text-amber-700">Adopt →</span>
        </button>
        );
      })}
      <Note tone="amber" icon="👻">
        These tags are reporting with no asset behind them. Adopting turns a data-integrity alert into a
        one-click registration with the tag already bound and the location already known.
      </Note>
    </div>
  );
}

// ── Picker shell ─────────────────────────────────────────────────────────────

export function SourcePicker({
  assets, onPick,
}: {
  assets: RegisteredAsset[];
  onPick: (seed: RegistrationSeed) => void;
}) {
  const navigate = useNavigate();
  const [open, setOpen] = useState<SourceKey | null>(null);

  const choose = (key: SourceKey, href?: string) => {
    if (href) { navigate(href); return; }
    if (key === 'blank') {
      onPick(blankSeed('blank', 'Blank registration — nothing pre-filled'));
      return;
    }
    setOpen((cur) => (cur === key ? null : key));
  };

  return (
    <div className="space-y-5">
      <div className="glass-panel rounded-xl p-6">
        <h2 className="font-heading text-base font-bold text-slate-900">Where is this asset coming from?</h2>
        <p className="mt-0.5 text-sm text-slate-500">
          Pick a source and most of the record fills itself in. This is one click, and often the last time you type
          anything the business already knows.
        </p>

        <div className="mt-5 grid gap-2.5 sm:grid-cols-2 lg:grid-cols-4">
          {SOURCES.map((s) => {
            const active = open === s.key;
            return (
              <button
                key={s.key}
                type="button"
                onClick={() => choose(s.key, s.href)}
                aria-expanded={s.href ? undefined : active}
                className={cn(
                  'flex h-full flex-col rounded-xl border p-4 text-left transition-colors',
                  active
                    ? 'border-primary-500 bg-primary-50 ring-2 ring-primary-500/25'
                    : 'border-slate-200 hover:border-primary-300 hover:bg-slate-50',
                )}
              >
                <span className="text-xl leading-none">{s.icon}</span>
                <span className={cn('mt-2 text-sm font-semibold', active ? 'text-primary-700' : 'text-slate-900')}>
                  {s.label}
                </span>
                <span className="mt-1 flex-1 text-[11px] leading-relaxed text-slate-500">{s.blurb}</span>
                <span className="mt-2 text-[10px] font-semibold uppercase tracking-wide text-slate-400">
                  {s.prefills}
                </span>
              </button>
            );
          })}
        </div>
      </div>

      {open && (
        <div className="glass-panel rounded-xl p-6">
          <h3 className="mb-4 font-heading text-sm font-bold text-slate-900">
            {SOURCES.find((s) => s.key === open)?.label}
          </h3>
          {open === 'po' && <PoPicker onPick={onPick} />}
          {open === 'template' && <TemplatePicker onPick={onPick} />}
          {open === 'clone' && <ClonePicker assets={assets} onPick={onPick} />}
          {open === 'scan' && <ScanPicker onPick={onPick} />}
          {open === 'adopt' && <AdoptPicker onPick={onPick} />}
        </div>
      )}
    </div>
  );
}
