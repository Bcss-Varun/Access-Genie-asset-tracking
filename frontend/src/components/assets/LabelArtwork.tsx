// ─────────────────────────────────────────────────────────────────────────────
// The label itself — the one component the designer preview, the template
// gallery and the printed sheet all share, so what you approve on screen is
// exactly what comes off the roll.
//
// Two rules hold this together:
//
//  1. Everything is measured in REAL units (mm for the stock, pt for type). CSS
//     honours both on screen and on paper, so the preview is the proof.
//  2. Labels are always dark ink on white stock, set inline rather than through
//     theme tokens. A label printed from dark mode is still printed on paper.
// ─────────────────────────────────────────────────────────────────────────────

import { useMemo } from 'react';
import { LABEL_SIZES } from '@/lib/label-data';
import { shortIdFor } from '@/lib/onboarding';
import type { Asset } from '@access-genie/shared';
import type { LabelFieldKey, LabelMedium, LabelSizeKey } from '@access-genie/shared';

const INK = '#0f172a';
const STOCK = '#ffffff';

/** The subset of a template the artwork actually needs — templates or live edits. */
export interface LabelSpec {
  medium: LabelMedium;
  size: LabelSizeKey;
  fields: LabelFieldKey[];
  showLogo: boolean;
  showBorder: boolean;
}

// ── Deterministic symbology ──────────────────────────────────────────────────
// A real encoder would run Reed-Solomon over the payload. This is a demo, so the
// glyph is generated from a hash of the payload instead: stable across renders
// (no hydration drift), visibly different per asset, honest about being artwork.

function hashOf(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
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

/** A QR finder eye — three of these anchor the corners of the matrix. */
function FinderEye({ cell, ox, oy }: { cell: number; ox: number; oy: number }) {
  return (
    <g transform={`translate(${ox} ${oy})`}>
      <rect x={0} y={0} width={cell * 7} height={cell * 7} fill={INK} />
      <rect x={cell} y={cell} width={cell * 5} height={cell * 5} fill={STOCK} />
      <rect x={cell * 2} y={cell * 2} width={cell * 3} height={cell * 3} fill={INK} />
    </g>
  );
}

/** Matrix symbologies (QR, Data Matrix) — N×N modules with corner finders. */
function MatrixCode({ payload, modules, finders }: { payload: string; modules: number; finders: boolean }) {
  const cell = 100 / modules;
  const cells = useMemo(() => {
    const rng = makeRng(hashOf(payload));
    const isFinder = (r: number, c: number) =>
      finders && ((r < 7 && c < 7) || (r < 7 && c >= modules - 7) || (r >= modules - 7 && c < 7));
    const out: React.ReactNode[] = [];
    for (let r = 0; r < modules; r++) {
      for (let c = 0; c < modules; c++) {
        if (isFinder(r, c)) continue;
        // Data Matrix carries a solid L-shaped finder on two edges instead.
        if (!finders && (c === 0 || r === modules - 1)) {
          out.push(<rect key={`l-${r}-${c}`} x={c * cell} y={r * cell} width={cell} height={cell} fill={INK} />);
          continue;
        }
        if (!finders && (r === 0 || c === modules - 1) && (r + c) % 2 === 0) {
          out.push(<rect key={`t-${r}-${c}`} x={c * cell} y={r * cell} width={cell} height={cell} fill={INK} />);
          continue;
        }
        if (rng() > 0.5) {
          out.push(<rect key={`${r}-${c}`} x={c * cell} y={r * cell} width={cell} height={cell} fill={INK} />);
        }
      }
    }
    return out;
  }, [payload, modules, finders, cell]);

  return (
    <>
      <rect x={0} y={0} width={100} height={100} fill={STOCK} />
      {cells}
      {finders && (
        <>
          <FinderEye cell={cell} ox={0} oy={0} />
          <FinderEye cell={cell} ox={cell * (modules - 7)} oy={0} />
          <FinderEye cell={cell} ox={0} oy={cell * (modules - 7)} />
        </>
      )}
    </>
  );
}

/** Code-128-style bars — variable width, quiet zones, human-readable strip. */
function BarcodeCode({ payload }: { payload: string }) {
  const bars = useMemo(() => {
    const rng = makeRng(hashOf(payload));
    const out: { x: number; w: number }[] = [];
    let x = 6;
    while (x < 94) {
      const w = 0.9 + rng() * 2.2;
      if (rng() > 0.42) out.push({ x, w });
      x += w + 0.5;
    }
    return out;
  }, [payload]);

  return (
    <>
      <rect x={0} y={0} width={100} height={100} fill={STOCK} />
      {bars.map((b, i) => (
        <rect key={i} x={b.x} y={14} width={b.w} height={58} fill={INK} />
      ))}
      <text x={50} y={88} textAnchor="middle" fontSize={13} fontFamily="ui-monospace, monospace" fill={INK}>
        {payload.slice(-12)}
      </text>
    </>
  );
}

/** RFID / NFC — antenna coil and chip. Silicon, not print, so it looks like it. */
function InlayCode({ payload, nfc }: { payload: string; nfc: boolean }) {
  const turns = 3 + (hashOf(payload) % 3);
  const rings = Array.from({ length: turns }, (_, i) => 42 - i * 8);
  return (
    <>
      <rect x={0} y={0} width={100} height={100} fill={STOCK} />
      {rings.map((r, i) => (
        <rect
          key={i}
          x={50 - r}
          y={50 - r}
          width={r * 2}
          height={r * 2}
          rx={nfc ? r : 5}
          fill="none"
          stroke={INK}
          strokeWidth={2.2}
          opacity={0.5 + i * 0.14}
        />
      ))}
      <rect x={43} y={43} width={14} height={14} rx={2} fill={INK} />
      <rect x={46.5} y={46.5} width={7} height={7} rx={1} fill={STOCK} />
      {!nfc && (
        <>
          <rect x={49} y={6} width={2} height={9} fill={INK} />
          <rect x={49} y={85} width={2} height={9} fill={INK} />
        </>
      )}
      <text x={50} y={97} textAnchor="middle" fontSize={11} fontWeight={700} fontFamily="ui-sans-serif" fill={INK}>
        {nfc ? 'NFC' : 'UHF'}
      </text>
    </>
  );
}

export function CodeGlyph({ payload, medium, mm }: { payload: string; medium: LabelMedium; mm: number }) {
  const body =
    medium === 'Barcode' ? <BarcodeCode payload={payload} />
      : medium === 'RFID' ? <InlayCode payload={payload} nfc={false} />
        : medium === 'NFC' ? <InlayCode payload={payload} nfc />
          : medium === 'DataMatrix' ? <MatrixCode payload={payload} modules={16} finders={false} />
            : <MatrixCode payload={payload} modules={21} finders />;

  return (
    <svg
      viewBox="0 0 100 100"
      width={`${mm}mm`}
      height={`${mm}mm`}
      shapeRendering={medium === 'RFID' || medium === 'NFC' ? 'auto' : 'crispEdges'}
      role="img"
      aria-label={`${medium} code encoding ${payload}`}
      style={{ display: 'block', flexShrink: 0 }}
    >
      {body}
    </svg>
  );
}

// ── Field values ─────────────────────────────────────────────────────────────

export function fieldValue(key: LabelFieldKey, asset: Asset, tagId?: string): string {
  switch (key) {
    case 'name': return asset.name;
    case 'serial': return `SN ${asset.serialNumber}`;
    case 'category': return asset.category;
    case 'custodian': return asset.custodian;
    case 'location': return asset.location.zone
      ? `${asset.location.name} · ${asset.location.zone}`
      : asset.location.name;
    case 'criticality': return asset.criticality ? `${asset.criticality} criticality` : '';
    case 'tagId': return tagId ?? 'Tag pending';
    case 'scanUrl': return `accessgenie.app/a/${shortIdFor(asset.id)}`;
    case 'owner': return 'Access Genie Technologies Pvt Ltd';
    default: return '';
  }
}

/** What the code resolves to when scanned — the short URL contract in docs/10. */
export const scanPayload = (asset: Asset, tagId?: string): string =>
  tagId ?? `https://accessgenie.app/a/${shortIdFor(asset.id)}`;

// ── The label ────────────────────────────────────────────────────────────────

export function LabelArtwork({
  asset, spec, tagId, className,
}: {
  asset: Asset;
  spec: LabelSpec;
  /** The tag this label carries, when one is already bound. */
  tagId?: string;
  className?: string;
}) {
  const s = LABEL_SIZES[spec.size];
  const pad = Math.max(1, s.heightMm * 0.07);

  // Over-stuffing is the most common label mistake, so the artwork simply stops
  // at what fits rather than letting text spill off the stock.
  const lines = spec.fields
    .slice(0, s.fits)
    .map((f) => ({ key: f, value: fieldValue(f, asset, tagId) }))
    .filter((l) => l.value);

  return (
    <div
      className={className}
      style={{
        width: `${s.widthMm}mm`,
        height: `${s.heightMm}mm`,
        background: STOCK,
        color: INK,
        border: spec.showBorder ? `0.25mm solid ${INK}` : '0.25mm solid #e2e8f0',
        borderRadius: '1mm',
        padding: `${pad}mm`,
        display: 'flex',
        alignItems: 'center',
        gap: `${pad}mm`,
        overflow: 'hidden',
        breakInside: 'avoid',
        fontFamily: 'ui-sans-serif, system-ui, sans-serif',
      }}
    >
      <CodeGlyph payload={scanPayload(asset, tagId)} medium={spec.medium} mm={s.codeMm} />

      <div style={{ minWidth: 0, flex: 1, lineHeight: 1.18 }}>
        {spec.showLogo && (
          <div
            style={{
              fontSize: `${s.bodyPt * 0.92}pt`,
              fontWeight: 700,
              letterSpacing: '0.06em',
              textTransform: 'uppercase',
              opacity: 0.55,
              marginBottom: '0.4mm',
              whiteSpace: 'nowrap',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
            }}
          >
            ◆ Access Genie
          </div>
        )}

        <div
          style={{
            fontSize: `${s.idPt}pt`,
            fontWeight: 700,
            fontFamily: 'ui-monospace, SFMono-Regular, monospace',
            letterSpacing: '-0.01em',
            whiteSpace: 'nowrap',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
          }}
        >
          {asset.id}
        </div>

        {lines.map((l) => (
          <div
            key={l.key}
            style={{
              fontSize: `${s.bodyPt}pt`,
              marginTop: '0.35mm',
              opacity: l.key === 'name' ? 0.95 : 0.72,
              fontWeight: l.key === 'name' ? 600 : 400,
              fontFamily: l.key === 'tagId' || l.key === 'scanUrl'
                ? 'ui-monospace, SFMono-Regular, monospace'
                : undefined,
              whiteSpace: 'nowrap',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
            }}
          >
            {l.value}
          </div>
        ))}
      </div>
    </div>
  );
}
