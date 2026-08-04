// ─────────────────────────────────────────────────────────────────────────────
// A real QR encoder — ISO/IEC 18004, byte mode.
//
// The label artwork used to paint a hash-seeded random pattern that looked like
// a QR code and encoded nothing. It was honest about it in a comment, and fine
// while labels were a design mock-up; it is not fine once someone prints one and
// expects a phone to open the asset. A code that cannot be scanned is worse than
// no code, because it is indistinguishable from a working one until it fails in
// the warehouse.
//
// Hand-rolled rather than pulled in: the client ships six runtime dependencies
// and the rendering convention here is hand-built SVG. Versions 1–10 at ECC M
// cover ~270 bytes, far more than the scan URL needs, and the output is verified
// against a third-party decoder in the test script.
//
// The pieces, in the order the spec applies them:
//   1. bitstream    mode + length + payload + terminator + pad
//   2. blocks       split, Reed–Solomon per block, interleave
//   3. placement    function patterns, then data in the zigzag
//   4. masking      all eight, scored by the four penalty rules
// ─────────────────────────────────────────────────────────────────────────────

/** Error-correction level. M ("medium", ~15% recovery) is the sensible default for a printed label. */
export type EccLevel = 'L' | 'M';

/**
 * Per (version, level): EC codewords per block, then the block groups as
 * [blockCount, dataCodewordsPerBlock]. Straight from the standard's tables.
 */
const BLOCKS: Record<EccLevel, Record<number, [number, [number, number][]]>> = {
  L: {
    1: [7, [[1, 19]]],
    2: [10, [[1, 34]]],
    3: [15, [[1, 55]]],
    4: [20, [[1, 80]]],
    5: [26, [[1, 108]]],
    6: [18, [[2, 68]]],
    7: [20, [[2, 78]]],
    8: [24, [[2, 97]]],
    9: [30, [[2, 116]]],
    10: [18, [[2, 68], [2, 69]]],
  },
  M: {
    1: [10, [[1, 16]]],
    2: [16, [[1, 28]]],
    3: [26, [[1, 44]]],
    4: [18, [[2, 32]]],
    5: [24, [[2, 43]]],
    6: [16, [[4, 27]]],
    7: [18, [[4, 31]]],
    8: [22, [[2, 38], [2, 39]]],
    9: [22, [[3, 36], [2, 37]]],
    10: [26, [[4, 43], [1, 44]]],
  },
};

/** Alignment-pattern centre coordinates per version. */
const ALIGNMENT: Record<number, number[]> = {
  1: [],
  2: [6, 18],
  3: [6, 22],
  4: [6, 26],
  5: [6, 30],
  6: [6, 34],
  7: [6, 22, 38],
  8: [6, 24, 42],
  9: [6, 26, 46],
  10: [6, 28, 50],
};

/** Pre-computed 18-bit version information, versions 7–10. */
const VERSION_INFO: Record<number, number> = {
  7: 0x07c94,
  8: 0x085bc,
  9: 0x09a99,
  10: 0x0a4d3,
};

const ECC_BITS: Record<EccLevel, number> = { L: 0b01, M: 0b00 };

// ── GF(256) ──────────────────────────────────────────────────────────────────
// Reed–Solomon works over the field defined by the primitive polynomial 0x11D.
const EXP = new Uint8Array(512);
const LOG = new Uint8Array(256);
(() => {
  let x = 1;
  for (let i = 0; i < 255; i++) {
    EXP[i] = x;
    LOG[x] = i;
    x <<= 1;
    if (x & 0x100) x ^= 0x11d;
  }
  for (let i = 255; i < 512; i++) EXP[i] = EXP[i - 255];
})();

const mul = (a: number, b: number): number => (a === 0 || b === 0 ? 0 : EXP[LOG[a] + LOG[b]]);

/** The generator polynomial for `degree` error-correction codewords. */
function generatorPoly(degree: number): number[] {
  let poly = [1];
  for (let d = 0; d < degree; d++) {
    const next = new Array<number>(poly.length + 1).fill(0);
    for (let i = 0; i < poly.length; i++) {
      // Multiplying by (x + α^d): the x term keeps each coefficient's position
      // in the descending-degree array, the constant term pushes it one along.
      // Swapping these two produces the coefficients in reverse, which still
      // looks like a plausible polynomial and yields entirely wrong parity.
      next[i] ^= poly[i];
      next[i + 1] ^= mul(poly[i], EXP[d]);
    }
    poly = next;
  }
  return poly;
}

/** Remainder of `data` divided by the generator — the EC codewords. */
function eccFor(data: number[], count: number): number[] {
  const gen = generatorPoly(count);
  const rem = new Array<number>(count).fill(0);

  for (const byte of data) {
    const factor = byte ^ rem[0];
    rem.shift();
    rem.push(0);
    for (let i = 0; i < count; i++) rem[i] ^= mul(gen[i + 1], factor);
  }
  return rem;
}

// ── Bitstream ────────────────────────────────────────────────────────────────

function totalDataCodewords(version: number, ecc: EccLevel): number {
  const [, groups] = BLOCKS[ecc][version];
  return groups.reduce((sum, [blocks, per]) => sum + blocks * per, 0);
}

/** Smallest version that holds `byteLength` bytes at this level. */
function chooseVersion(byteLength: number, ecc: EccLevel): number {
  for (let v = 1; v <= 10; v++) {
    // 4 bits mode + 8 or 16 bits length + the payload itself.
    const headerBits = 4 + (v < 10 ? 8 : 16);
    if (totalDataCodewords(v, ecc) * 8 >= headerBits + byteLength * 8) return v;
  }
  throw new Error(`Payload of ${byteLength} bytes is too long for a version-10 QR code`);
}

function buildCodewords(bytes: number[], version: number, ecc: EccLevel): number[] {
  const capacity = totalDataCodewords(version, ecc);
  const bits: number[] = [];
  const push = (value: number, width: number) => {
    for (let i = width - 1; i >= 0; i--) bits.push((value >> i) & 1);
  };

  push(0b0100, 4); // byte mode
  push(bytes.length, version < 10 ? 8 : 16);
  for (const b of bytes) push(b, 8);

  // Terminator, then pad to a whole byte.
  for (let i = 0; i < 4 && bits.length < capacity * 8; i++) bits.push(0);
  while (bits.length % 8 !== 0) bits.push(0);

  const codewords: number[] = [];
  for (let i = 0; i < bits.length; i += 8) {
    codewords.push(bits.slice(i, i + 8).reduce((acc, bit) => (acc << 1) | bit, 0));
  }
  // The spec's alternating pad bytes.
  const PAD = [0xec, 0x11];
  while (codewords.length < capacity) codewords.push(PAD[(codewords.length - bits.length / 8) % 2]);

  return codewords;
}

/** Split into blocks, compute EC per block, then interleave both sets. */
function interleave(codewords: number[], version: number, ecc: EccLevel): number[] {
  const [ecPerBlock, groups] = BLOCKS[ecc][version];

  const dataBlocks: number[][] = [];
  let offset = 0;
  for (const [blockCount, perBlock] of groups) {
    for (let i = 0; i < blockCount; i++) {
      dataBlocks.push(codewords.slice(offset, offset + perBlock));
      offset += perBlock;
    }
  }
  const ecBlocks = dataBlocks.map((b) => eccFor(b, ecPerBlock));

  const out: number[] = [];
  const widest = Math.max(...dataBlocks.map((b) => b.length));
  for (let i = 0; i < widest; i++) {
    for (const block of dataBlocks) if (i < block.length) out.push(block[i]);
  }
  for (let i = 0; i < ecPerBlock; i++) {
    for (const block of ecBlocks) out.push(block[i]);
  }
  return out;
}

// ── Matrix ───────────────────────────────────────────────────────────────────

type Grid = { on: boolean; fixed: boolean }[][];

function blankGrid(size: number): Grid {
  return Array.from({ length: size }, () =>
    Array.from({ length: size }, () => ({ on: false, fixed: false })),
  );
}

function place(grid: Grid, r: number, c: number, on: boolean, fixed = true): void {
  if (r < 0 || c < 0 || r >= grid.length || c >= grid.length) return;
  grid[r][c] = { on, fixed };
}

/** Finders, separators, timing, alignment, the dark module, and format reserves. */
function drawFunctionPatterns(grid: Grid, version: number): void {
  const size = grid.length;

  const finder = (top: number, left: number) => {
    for (let r = -1; r <= 7; r++) {
      for (let c = -1; c <= 7; c++) {
        const inner = r >= 0 && r <= 6 && c >= 0 && c <= 6;
        const ring = r === 0 || r === 6 || c === 0 || c === 6;
        const core = r >= 2 && r <= 4 && c >= 2 && c <= 4;
        place(grid, top + r, left + c, inner && (ring || core));
      }
    }
  };
  finder(0, 0);
  finder(0, size - 7);
  finder(size - 7, 0);

  // Timing patterns.
  for (let i = 8; i < size - 8; i++) {
    place(grid, 6, i, i % 2 === 0);
    place(grid, i, 6, i % 2 === 0);
  }

  // Alignment patterns, skipping the three that would collide with finders.
  const centres = ALIGNMENT[version];
  for (const r of centres) {
    for (const c of centres) {
      const nearFinder =
        (r === 6 && c === 6) || (r === 6 && c === size - 7) || (r === size - 7 && c === 6);
      if (nearFinder) continue;
      for (let dr = -2; dr <= 2; dr++) {
        for (let dc = -2; dc <= 2; dc++) {
          const edge = Math.max(Math.abs(dr), Math.abs(dc));
          place(grid, r + dr, c + dc, edge !== 1);
        }
      }
    }
  }

  // Reserve the format areas; the real bits are written after masking.
  // Index 6 is skipped in both directions: row 6 and column 6 are the timing
  // patterns, which cross the format band and must survive it. Clearing them
  // here leaves two stray light modules that break the timing reference.
  for (let i = 0; i < 9; i++) {
    if (i === 6) continue;
    place(grid, 8, i, false);
    place(grid, i, 8, false);
  }
  for (let i = 0; i < 8; i++) {
    place(grid, 8, size - 1 - i, false);
    place(grid, size - 1 - i, 8, false);
  }

  // The always-dark module. Re-asserted at the end of `writeFormat` too, which
  // is where it actually has to win: the second format copy writes eight bits up
  // this column and the last of them lands right here, so the spec's ordering
  // has the dark module overwrite it.
  place(grid, size - 8, 8, true);

  // Version information blocks, 7 and up.
  if (version >= 7) {
    const info = VERSION_INFO[version];
    for (let i = 0; i < 18; i++) {
      const bit = ((info >> i) & 1) === 1;
      place(grid, Math.floor(i / 3), size - 11 + (i % 3), bit);
      place(grid, size - 11 + (i % 3), Math.floor(i / 3), bit);
    }
  }
}

/** Lay the codeword bits along the spec's upward/downward zigzag. */
function placeData(grid: Grid, codewords: number[]): void {
  const size = grid.length;
  let bitIndex = 0;
  const nextBit = (): boolean => {
    const byte = codewords[bitIndex >> 3];
    const bit = byte === undefined ? 0 : (byte >> (7 - (bitIndex & 7))) & 1;
    bitIndex++;
    return bit === 1;
  };

  let upward = true;
  for (let right = size - 1; right >= 1; right -= 2) {
    // Column 6 is the vertical timing pattern and is skipped entirely.
    const rightCol = right <= 6 ? right - 1 : right;
    for (let step = 0; step < size; step++) {
      const row = upward ? size - 1 - step : step;
      for (const col of [rightCol, rightCol - 1]) {
        if (col < 0) continue;
        if (grid[row][col].fixed) continue;
        grid[row][col] = { on: nextBit(), fixed: false };
      }
    }
    upward = !upward;
  }
}

const MASKS: ((r: number, c: number) => boolean)[] = [
  (r, c) => (r + c) % 2 === 0,
  (r) => r % 2 === 0,
  (_r, c) => c % 3 === 0,
  (r, c) => (r + c) % 3 === 0,
  (r, c) => (Math.floor(r / 2) + Math.floor(c / 3)) % 2 === 0,
  (r, c) => ((r * c) % 2) + ((r * c) % 3) === 0,
  (r, c) => (((r * c) % 2) + ((r * c) % 3)) % 2 === 0,
  (r, c) => (((r + c) % 2) + ((r * c) % 3)) % 2 === 0,
];

/** The standard's four penalty rules — lower is better. */
function penalty(grid: Grid): number {
  const size = grid.length;
  const at = (r: number, c: number) => grid[r][c].on;
  let score = 0;

  // Rule 1 — runs of five or more.
  for (let i = 0; i < size; i++) {
    for (const rowwise of [true, false]) {
      let run = 1;
      for (let j = 1; j < size; j++) {
        const prev = rowwise ? at(i, j - 1) : at(j - 1, i);
        const cur = rowwise ? at(i, j) : at(j, i);
        if (cur === prev) {
          run++;
        } else {
          if (run >= 5) score += run - 2;
          run = 1;
        }
      }
      if (run >= 5) score += run - 2;
    }
  }

  // Rule 2 — 2×2 blocks of one colour.
  for (let r = 0; r < size - 1; r++) {
    for (let c = 0; c < size - 1; c++) {
      const v = at(r, c);
      if (v === at(r, c + 1) && v === at(r + 1, c) && v === at(r + 1, c + 1)) score += 3;
    }
  }

  // Rule 3 — the finder-like 1:1:3:1:1 sequence.
  const PATTERNS = [
    [true, false, true, true, true, false, true, false, false, false, false],
    [false, false, false, false, true, false, true, true, true, false, true],
  ];
  for (let i = 0; i < size; i++) {
    for (let j = 0; j <= size - 11; j++) {
      for (const pattern of PATTERNS) {
        if (pattern.every((v, k) => at(i, j + k) === v)) score += 40;
        if (pattern.every((v, k) => at(j + k, i) === v)) score += 40;
      }
    }
  }

  // Rule 4 — deviation from a 50/50 light/dark split.
  let dark = 0;
  for (let r = 0; r < size; r++) for (let c = 0; c < size; c++) if (at(r, c)) dark++;
  const percent = (dark * 100) / (size * size);
  score += Math.floor(Math.abs(percent - 50) / 5) * 10;

  return score;
}

function writeFormat(grid: Grid, ecc: EccLevel, mask: number): void {
  const size = grid.length;
  const data = (ECC_BITS[ecc] << 3) | mask;

  // 15-bit BCH(15,5), then the spec's fixed XOR mask.
  let bch = data << 10;
  for (let i = 4; i >= 0; i--) {
    if ((bch >> (i + 10)) & 1) bch ^= 0b10100110111 << i;
  }
  const bits = ((data << 10) | bch) ^ 0b101010000010010;

  for (let i = 0; i < 15; i++) {
    // Most-significant bit first: position 0 in each copy carries bit 14.
    const on = ((bits >> (14 - i)) & 1) === 1;
    // Copy one: around the top-left finder.
    if (i < 6) place(grid, 8, i, on);
    else if (i === 6) place(grid, 8, 7, on);
    else if (i === 7) place(grid, 8, 8, on);
    else if (i === 8) place(grid, 7, 8, on);
    else place(grid, 14 - i, 8, on);

    // Copy two: the first seven run up from the bottom-left finder, the
    // remaining eight run right from the top-right one. The split is at seven,
    // not eight — the module the eighth would occupy is the always-dark one.
    if (i < 7) place(grid, size - 1 - i, 8, on);
    else place(grid, 8, size - 15 + i, on);
  }

  place(grid, size - 8, 8, true);
}

/**
 * Encode `text` as a QR matrix. `true` is a dark module.
 *
 * Throws if the payload will not fit a version-10 symbol, which is a bug in the
 * caller rather than something to render as an unscannable square.
 */
/** Encode with a forced mask. Exists so the encoder can be diffed mask-by-mask against a reference. */
export function encodeQrWithMask(text: string, ecc: EccLevel, mask: number): boolean[][] {
  const bytes = Array.from(new TextEncoder().encode(text));
  const version = chooseVersion(bytes.length, ecc);
  const size = version * 4 + 17;
  const codewords = interleave(buildCodewords(bytes, version, ecc), version, ecc);
  const grid = blankGrid(size);
  drawFunctionPatterns(grid, version);
  placeData(grid, codewords);
  for (let r = 0; r < size; r++) {
    for (let c = 0; c < size; c++) {
      if (!grid[r][c].fixed && MASKS[mask](r, c)) grid[r][c].on = !grid[r][c].on;
    }
  }
  writeFormat(grid, ecc, mask);
  return grid.map((row) => row.map((cell) => cell.on));
}

export function encodeQr(text: string, ecc: EccLevel = 'M'): boolean[][] {
  const bytes = Array.from(new TextEncoder().encode(text));
  const version = chooseVersion(bytes.length, ecc);
  const size = version * 4 + 17;

  const codewords = interleave(buildCodewords(bytes, version, ecc), version, ecc);

  let best: Grid | null = null;
  let bestScore = Infinity;

  for (let mask = 0; mask < 8; mask++) {
    const grid = blankGrid(size);
    drawFunctionPatterns(grid, version);
    placeData(grid, codewords);

    for (let r = 0; r < size; r++) {
      for (let c = 0; c < size; c++) {
        if (!grid[r][c].fixed && MASKS[mask](r, c)) grid[r][c].on = !grid[r][c].on;
      }
    }
    writeFormat(grid, ecc, mask);

    const score = penalty(grid);
    if (score < bestScore) {
      bestScore = score;
      best = grid;
    }
  }

  return best!.map((row) => row.map((cell) => cell.on));
}
