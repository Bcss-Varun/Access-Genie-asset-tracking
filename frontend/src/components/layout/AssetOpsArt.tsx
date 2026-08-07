/**
 * The illustration on the sign-in panel: an estate under control.
 *
 * Hand-drawn SVG rather than a stock image, for the same reasons the charts are:
 * the project ships no raster art pipeline, a photograph would be the only
 * non-brand element on the screen, and vector stays sharp on every display and
 * weighs nothing.
 *
 * It is meant to be *read*, not just to fill space. Left to right it says what
 * the product does: racked assets, each carrying a tag; one being scanned, with
 * the signal arcs landing on it; and the shelf states resolving to verified. The
 * one amber unit matters — an estate where everything is green is a screensaver,
 * not asset management. What it shows is the product's actual claim: every
 * object identified, located and accounted for.
 *
 * Purely decorative to assistive tech: everything it conveys is already in the
 * heading beside it, so announcing it again would be noise.
 */
export function AssetOpsArt({ className = '' }: { className?: string }) {
  // Drawn once here rather than repeated per shelf — three racks, three levels.
  const RACK_X = [0, 96, 192];
  const SHELF_Y = [96, 148, 200];

  return (
    <svg
      viewBox="0 0 420 260"
      className={className}
      fill="none"
      aria-hidden="true"
      focusable="false"
    >
      <defs>
        {/* Fades the drawing into the panel so it reads as part of the surface
            rather than a sticker pasted onto it. */}
        <linearGradient id="ao-fade" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="white" stopOpacity="0.55" />
          <stop offset="55%" stopColor="white" stopOpacity="1" />
          <stop offset="100%" stopColor="white" stopOpacity="1" />
        </linearGradient>
        <mask id="ao-mask">
          <rect x="0" y="0" width="420" height="260" fill="url(#ao-fade)" />
        </mask>

        <linearGradient id="ao-scan" x1="0" y1="0" x2="1" y2="0">
          <stop offset="0%" stopColor="#818cf8" stopOpacity="0" />
          <stop offset="100%" stopColor="#818cf8" stopOpacity="0.9" />
        </linearGradient>
      </defs>

      <g mask="url(#ao-mask)">
        {/* ── Floor ───────────────────────────────────────────────────────── */}
        <line x1="4" y1="232" x2="416" y2="232" stroke="rgba(255,255,255,0.18)" strokeWidth="1.5" />
        <line x1="4" y1="232" x2="120" y2="232" stroke="#818cf8" strokeOpacity="0.6" strokeWidth="1.5" />

        {/* ── Racking ─────────────────────────────────────────────────────── */}
        {RACK_X.map((x) => (
          <g key={x} transform={`translate(${18 + x} 0)`}>
            {/* uprights */}
            <line x1="0" y1="72" x2="0" y2="232" stroke="rgba(255,255,255,0.28)" strokeWidth="2" />
            <line x1="78" y1="72" x2="78" y2="232" stroke="rgba(255,255,255,0.28)" strokeWidth="2" />
            {/* shelves */}
            {SHELF_Y.map((y) => (
              <line key={y} x1="0" y1={y} x2="78" y2={y} stroke="rgba(255,255,255,0.28)" strokeWidth="2" />
            ))}
            <line x1="0" y1="72" x2="78" y2="72" stroke="rgba(255,255,255,0.28)" strokeWidth="2" />
          </g>
        ))}

        {/* ── Stock, with the tag each unit carries ───────────────────────── */}
        {[
          // rack 1
          { x: 26, y: 74, w: 28, h: 20, tag: true },
          { x: 60, y: 74, w: 24, h: 20, tag: true },
          { x: 26, y: 126, w: 24, h: 20, tag: true },
          { x: 56, y: 126, w: 28, h: 20, tag: false },
          { x: 26, y: 178, w: 34, h: 20, tag: true },
          // rack 2 — the one being scanned
          { x: 122, y: 74, w: 26, h: 20, tag: true },
          { x: 154, y: 74, w: 26, h: 20, tag: true },
          { x: 122, y: 126, w: 32, h: 20, tag: true, focus: true },
          { x: 160, y: 126, w: 20, h: 20, tag: false },
          { x: 122, y: 178, w: 24, h: 20, tag: true },
          { x: 152, y: 178, w: 28, h: 20, tag: true },
          // rack 3
          { x: 218, y: 74, w: 30, h: 20, tag: true },
          { x: 218, y: 126, w: 22, h: 20, tag: true },
          { x: 246, y: 126, w: 26, h: 20, tag: true, warn: true },
          { x: 218, y: 178, w: 30, h: 20, tag: true },
        ].map((b, i) => (
          <g key={i}>
            <rect
              x={b.x}
              y={b.y}
              width={b.w}
              height={b.h}
              rx="2.5"
              fill={b.focus ? 'rgba(129,140,248,0.22)' : 'rgba(255,255,255,0.07)'}
              stroke={
                b.focus ? '#818cf8' : b.warn ? 'rgba(251,191,36,0.75)' : 'rgba(255,255,255,0.35)'
              }
              strokeWidth={b.focus ? 1.6 : 1.2}
            />
            {/* the tag: what makes it an asset rather than a box */}
            {b.tag && (
              <rect
                x={b.x + 3}
                y={b.y + 3}
                width="7"
                height="4.5"
                rx="1"
                fill={b.focus ? '#a5b4fc' : b.warn ? 'rgba(251,191,36,0.9)' : 'rgba(255,255,255,0.5)'}
              />
            )}
          </g>
        ))}

        {/* ── The read in progress ────────────────────────────────────────── */}
        {/* Arcs open toward the highlighted unit, so the direction of the read
            is unambiguous — a symmetrical burst would read as decoration. */}
        <g transform="translate(322 150)">
          {[0, 1, 2].map((i) => (
            <path
              key={i}
              d={`M ${-8 - i * 11} ${-13 - i * 8} A ${16 + i * 13} ${16 + i * 13} 0 0 0 ${-8 - i * 11} ${13 + i * 8}`}
              stroke="url(#ao-scan)"
              strokeWidth="1.8"
              strokeLinecap="round"
              opacity={0.85 - i * 0.22}
            />
          ))}
          {/* handheld reader */}
          <rect x="0" y="-24" width="26" height="46" rx="5" fill="rgba(255,255,255,0.1)" stroke="rgba(255,255,255,0.45)" strokeWidth="1.4" />
          <rect x="4.5" y="-19" width="17" height="13" rx="1.6" fill="#818cf8" fillOpacity="0.55" />
          <rect x="5" y="-1" width="7" height="5" rx="1" fill="rgba(255,255,255,0.4)" />
          <rect x="14" y="-1" width="7" height="5" rx="1" fill="rgba(255,255,255,0.4)" />
          <rect x="5" y="7" width="7" height="5" rx="1" fill="rgba(255,255,255,0.4)" />
          <rect x="14" y="7" width="7" height="5" rx="1" fill="rgba(255,255,255,0.4)" />
        </g>

        {/* ── Verified badge on the scanned unit ──────────────────────────── */}
        <g transform="translate(150 120)">
          <circle cx="0" cy="0" r="9" fill="#0f172a" />
          <circle cx="0" cy="0" r="9" stroke="#34d399" strokeWidth="1.6" />
          <path d="M -4 0.3 L -1.2 3.2 L 4.2 -3" stroke="#34d399" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
        </g>

        {/* ── Counted / total, the number the whole screen is about ─────────
            Sits to the right of the racking rather than above it: overlapping
            the top shelf made both harder to read, and this way the count sits
            beside the thing it counts. */}
        <g transform="translate(286 46)">
          <rect x="0" y="0" width="122" height="32" rx="7" fill="rgba(15,23,42,0.72)" stroke="rgba(255,255,255,0.18)" />
          <circle cx="18" cy="16" r="6.2" stroke="#34d399" strokeWidth="1.6" />
          <path d="M 15.2 16.2 L 17.2 18.2 L 21 14.2" stroke="#34d399" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" />
          <text x="32" y="14" fill="rgba(255,255,255,0.92)" fontSize="10" fontWeight="700" fontFamily="ui-sans-serif, system-ui">
            14 of 15 verified
          </text>
          <text x="32" y="25" fill="rgba(255,255,255,0.5)" fontSize="8" fontFamily="ui-sans-serif, system-ui">
            Hyderabad · cycle count
          </text>
        </g>
      </g>
    </svg>
  );
}
