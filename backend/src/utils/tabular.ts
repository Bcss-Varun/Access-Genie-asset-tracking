import { deflateRawSync } from 'node:zlib';

/**
 * Turning report rows into a file somebody can open.
 *
 * Three formats, no dependencies. CSV is trivial; the other two are not, and it
 * is worth saying why they are hand-rolled rather than pulled from npm.
 *
 * An `.xlsx` is a ZIP of five small XML parts, and a PDF is a handful of
 * objects and a cross-reference table. Both are written here in a few hundred
 * lines that do exactly one thing each — lay out a table — against a spec that
 * has not moved in fifteen years. Adding two transitive dependency trees to a
 * deployment for that is the larger risk, not the smaller one.
 *
 * What these deliberately are not: a spreadsheet engine or a typesetter. There
 * are no formulas, no styles beyond a bold header, no images and no fonts
 * beyond the base-14 Helvetica every reader ships with. A report is a grid of
 * values, and that is what comes out.
 */

export type Cell = string | number | null | undefined;

export interface Sheet {
  title: string;
  headers: string[];
  rows: Cell[][];
  /** Rendered above the grid — what the report is, and what it was run over. */
  caption?: string;
  /** Rendered under the caption, one line each: filters, scope, generated-at. */
  meta?: string[];
}

const text = (value: Cell): string => (value === null || value === undefined ? '' : String(value));

// ─────────────────────────────────────────────────────────────────────────────
// CSV
// ─────────────────────────────────────────────────────────────────────────────

/** RFC 4180 — quote anything holding a delimiter, a quote or a newline. */
function csvCell(value: Cell): string {
  const s = text(value);
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

/**
 * A CSV of the grid.
 *
 * The caption and meta lines are emitted as leading comment-ish rows rather
 * than dropped: a file that says which facility and which date range produced
 * it is the difference between evidence and a column of numbers. They are
 * single-cell rows, so a spreadsheet still parses the grid beneath them.
 */
export function toCsv(sheet: Sheet): string {
  const lines: string[] = [];
  if (sheet.caption) lines.push(csvCell(sheet.caption));
  for (const line of sheet.meta ?? []) lines.push(csvCell(line));
  if (lines.length > 0) lines.push('');

  lines.push(sheet.headers.map(csvCell).join(','));
  for (const row of sheet.rows) lines.push(row.map(csvCell).join(','));
  return lines.join('\r\n');
}

// ─────────────────────────────────────────────────────────────────────────────
// XLSX
// ─────────────────────────────────────────────────────────────────────────────

const xmlEscape = (value: string): string =>
  value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    // Control characters are not legal in XML 1.0 and make Excel refuse the
    // whole file rather than skip the cell.
    // eslint-disable-next-line no-control-regex
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, '');

/** `A`, `B`, … `AA` — the column letter for a zero-based index. */
function columnName(index: number): string {
  let name = '';
  let n = index;
  while (n >= 0) {
    name = String.fromCharCode(65 + (n % 26)) + name;
    n = Math.floor(n / 26) - 1;
  }
  return name;
}

/**
 * One cell.
 *
 * Numbers are written as numbers so Excel can sum them; everything else goes
 * out as an inline string, which avoids a shared-strings part without changing
 * what the reader sees.
 */
function xlsxCell(reference: string, value: Cell, style: number): string {
  const s = style > 0 ? ` s="${style}"` : '';
  if (typeof value === 'number' && Number.isFinite(value)) {
    return `<c r="${reference}"${s}><v>${value}</v></c>`;
  }
  const body = xmlEscape(text(value));
  if (body === '') return `<c r="${reference}"${s}/>`;
  return `<c r="${reference}"${s} t="inlineStr"><is><t xml:space="preserve">${body}</t></is></c>`;
}

function sheetXml(sheet: Sheet): string {
  const lines: string[] = [];
  let rowNumber = 1;

  const emit = (values: Cell[], style: number) => {
    const cells = values.map((value, i) => xlsxCell(`${columnName(i)}${rowNumber}`, value, style)).join('');
    lines.push(`<row r="${rowNumber}">${cells}</row>`);
    rowNumber += 1;
  };

  if (sheet.caption) emit([sheet.caption], 1);
  for (const line of sheet.meta ?? []) emit([line], 0);
  if (sheet.caption || (sheet.meta ?? []).length > 0) rowNumber += 1; // one blank row

  emit(sheet.headers, 1);
  for (const row of sheet.rows) emit(row, 0);

  // Column widths sized from the content, capped so one long custodian name
  // does not produce a column nobody can see past.
  const widths = sheet.headers
    .map((header, i) => {
      const longest = sheet.rows.reduce((max, row) => Math.max(max, text(row[i]).length), header.length);
      return `<col min="${i + 1}" max="${i + 1}" width="${Math.min(48, Math.max(10, longest + 3))}" customWidth="1"/>`;
    })
    .join('');

  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><cols>${widths}</cols><sheetData>${lines.join('')}</sheetData></worksheet>`;
}

/** Style 1 is bold — the only styling this writer offers, and all a grid needs. */
const STYLES_XML = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><fonts count="2"><font><sz val="11"/><name val="Calibri"/></font><font><b/><sz val="11"/><name val="Calibri"/></font></fonts><fills count="1"><fill><patternFill patternType="none"/></fill></fills><borders count="1"><border/></borders><cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs><cellXfs count="2"><xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/><xf numFmtId="0" fontId="1" fillId="0" borderId="0" xfId="0" applyFont="1"/></cellXfs><cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles></styleSheet>`;

/** Excel refuses a sheet name over 31 characters or holding `[]:*?/\`. */
const safeSheetName = (title: string) => (title.replace(/[[\]:*?/\\]/g, ' ').trim() || 'Report').slice(0, 31);

export function toXlsx(sheet: Sheet): Buffer {
  const name = xmlEscape(safeSheetName(sheet.title));

  return zip([
    {
      name: '[Content_Types].xml',
      body: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/><Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/></Types>`,
    },
    {
      name: '_rels/.rels',
      body: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>`,
    },
    {
      name: 'xl/workbook.xml',
      body: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets><sheet name="${name}" sheetId="1" r:id="rId1"/></sheets></workbook>`,
    },
    {
      name: 'xl/_rels/workbook.xml.rels',
      body: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/><Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>`,
    },
    { name: 'xl/styles.xml', body: STYLES_XML },
    { name: 'xl/worksheets/sheet1.xml', body: sheetXml(sheet) },
  ]);
}

// ── ZIP ──────────────────────────────────────────────────────────────────────

const CRC_TABLE = (() => {
  const table = new Int32Array(256);
  for (let i = 0; i < 256; i += 1) {
    let c = i;
    for (let k = 0; k < 8; k += 1) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[i] = c;
  }
  return table;
})();

function crc32(buffer: Buffer): number {
  let crc = -1;
  for (const byte of buffer) crc = (crc >>> 8) ^ (CRC_TABLE[(crc ^ byte) & 0xff] as number);
  return (crc ^ -1) >>> 0;
}

/**
 * A ZIP archive of small text parts — enough of the format for an OOXML package.
 *
 * Deflate rather than store, because an XML sheet compresses to roughly a tenth
 * of its size and the parts are generated, not streamed. No ZIP64: a report
 * that needs a 4GB spreadsheet needs a warehouse, not a download.
 */
function zip(entries: { name: string; body: string }[]): Buffer {
  const locals: Buffer[] = [];
  const central: Buffer[] = [];
  let offset = 0;

  // A fixed DOS timestamp. Real clock values make otherwise identical exports
  // differ byte for byte, which is a nuisance to diff and buys nothing.
  const DOS_TIME = 0;
  const DOS_DATE = 0x2100; // 1 Jan 1980

  for (const entry of entries) {
    const name = Buffer.from(entry.name, 'utf8');
    const raw = Buffer.from(entry.body, 'utf8');
    const deflated = deflateRawSync(raw);
    const crc = crc32(raw);

    const header = Buffer.alloc(30);
    header.writeUInt32LE(0x04034b50, 0);
    header.writeUInt16LE(20, 4); // version needed
    header.writeUInt16LE(0, 6); // flags
    header.writeUInt16LE(8, 8); // deflate
    header.writeUInt16LE(DOS_TIME, 10);
    header.writeUInt16LE(DOS_DATE, 12);
    header.writeUInt32LE(crc, 14);
    header.writeUInt32LE(deflated.length, 18);
    header.writeUInt32LE(raw.length, 22);
    header.writeUInt16LE(name.length, 26);
    header.writeUInt16LE(0, 28);

    locals.push(header, name, deflated);

    const directory = Buffer.alloc(46);
    directory.writeUInt32LE(0x02014b50, 0);
    directory.writeUInt16LE(20, 4); // version made by
    directory.writeUInt16LE(20, 6); // version needed
    directory.writeUInt16LE(0, 8);
    directory.writeUInt16LE(8, 10);
    directory.writeUInt16LE(DOS_TIME, 12);
    directory.writeUInt16LE(DOS_DATE, 14);
    directory.writeUInt32LE(crc, 16);
    directory.writeUInt32LE(deflated.length, 20);
    directory.writeUInt32LE(raw.length, 24);
    directory.writeUInt16LE(name.length, 28);
    directory.writeUInt32LE(0, 38); // external attributes
    directory.writeUInt32LE(offset, 42);

    central.push(directory, name);
    offset += header.length + name.length + deflated.length;
  }

  const directoryBuffer = Buffer.concat(central);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(entries.length, 8);
  end.writeUInt16LE(entries.length, 10);
  end.writeUInt32LE(directoryBuffer.length, 12);
  end.writeUInt32LE(offset, 16);

  return Buffer.concat([...locals, directoryBuffer, end]);
}

// ─────────────────────────────────────────────────────────────────────────────
// PDF
// ─────────────────────────────────────────────────────────────────────────────

const PAGE = { width: 842, height: 595, margin: 40 }; // A4 landscape, points
const ROW_HEIGHT = 16;
const FONT_SIZE = 9;
const HEADER_SIZE = 10;

/**
 * The punctuation this codebase actually writes that Latin-1 does not hold.
 *
 * WinAnsi *does* encode all of these, in the 0x80-0x9F range Latin-1 leaves to
 * control codes — so mapping them is the difference between a dash and a `?` in
 * every description and caption the product produces.
 */
const WINANSI: Record<string, string> = {
  '–': '\x96', // en dash
  '—': '\x97', // em dash
  '‘': '\x91',
  '’': '\x92',
  '“': '\x93',
  '”': '\x94',
  '•': '\x95', // bullet
  '…': '\x85', // ellipsis
  '€': '\x80', // euro
  '™': '\x99', // trademark
};

/** Map to WinAnsi, then escape the three characters that end a PDF string. */
const pdfString = (value: string): string =>
  value
    .replace(/[–—‘’“”•…€™]/g, (c) => WINANSI[c] as string)
    // Anything still outside the encoding would render as a different glyph
    // rather than as nothing, which is worse than admitting it was dropped.
    .replace(/[^\x20-\x7E\x80-\xFF]/g, '?')
    .replace(/\\/g, '\\\\')
    .replace(/\(/g, '\\(')
    .replace(/\)/g, '\\)');

/**
 * Helvetica is roughly 0.5em per character averaged over mixed text. Good
 * enough to decide where to truncate a cell; this is a table, not a galley.
 */
const textWidth = (value: string, size: number) => value.length * size * 0.5;

function truncate(value: string, size: number, maxWidth: number): string {
  if (textWidth(value, size) <= maxWidth) return value;
  const budget = Math.max(1, Math.floor(maxWidth / (size * 0.5)) - 1);
  return `${value.slice(0, budget)}…`.replace('…', '...');
}

/**
 * A table as a PDF.
 *
 * Column widths are proportional to the widest content in each column, so a
 * "Category" column does not get the same space as a facility name. Rows
 * paginate; the header repeats on every page, because a page of numbers with no
 * column titles is not a report.
 */
export function toPdf(sheet: Sheet): Buffer {
  const usable = PAGE.width - PAGE.margin * 2;
  const columns = sheet.headers.length;

  // Natural width per column, then scaled to fit the page.
  const natural = sheet.headers.map((header, i) => {
    const longest = sheet.rows.reduce((max, row) => Math.max(max, text(row[i]).length), header.length);
    return Math.min(40, Math.max(8, longest)) * FONT_SIZE * 0.5 + 12;
  });
  const naturalTotal = natural.reduce((sum, w) => sum + w, 0) || 1;
  const widths = natural.map((w) => (w / naturalTotal) * usable);

  const captionLines = [sheet.caption ?? sheet.title, ...(sheet.meta ?? [])];
  const headerBlock = 22 + captionLines.length * 13;
  const firstPageRows = Math.max(1, Math.floor((PAGE.height - PAGE.margin * 2 - headerBlock - ROW_HEIGHT) / ROW_HEIGHT));
  const laterPageRows = Math.max(1, Math.floor((PAGE.height - PAGE.margin * 2 - ROW_HEIGHT - 8) / ROW_HEIGHT));

  const pages: Cell[][][] = [];
  let index = 0;
  while (index < sheet.rows.length || pages.length === 0) {
    const capacity = pages.length === 0 ? firstPageRows : laterPageRows;
    pages.push(sheet.rows.slice(index, index + capacity));
    index += capacity;
    if (index >= sheet.rows.length) break;
  }

  const streams = pages.map((rows, pageIndex) => {
    const out: string[] = [];
    let y = PAGE.height - PAGE.margin;

    if (pageIndex === 0) {
      out.push(`BT /F2 15 Tf ${PAGE.margin} ${y - 12} Td (${pdfString(sheet.caption ?? sheet.title)}) Tj ET`);
      y -= 28;
      for (const line of sheet.meta ?? []) {
        out.push(`BT /F1 9 Tf 0.4 0.45 0.5 rg ${PAGE.margin} ${y} Td (${pdfString(line)}) Tj ET`);
        out.push('0 0 0 rg');
        y -= 13;
      }
      y -= 8;
    }

    // Header band.
    out.push(`0.94 0.95 0.97 rg ${PAGE.margin} ${y - ROW_HEIGHT + 4} ${usable} ${ROW_HEIGHT} re f`);
    out.push('0 0 0 rg');
    let x = PAGE.margin;
    sheet.headers.forEach((header, i) => {
      const width = widths[i] as number;
      out.push(`BT /F2 ${HEADER_SIZE} Tf ${x + 4} ${y - ROW_HEIGHT + 9} Td (${pdfString(truncate(header, HEADER_SIZE, width - 8))}) Tj ET`);
      x += width;
    });
    y -= ROW_HEIGHT;

    // Body.
    rows.forEach((row, rowIndex) => {
      if (rowIndex % 2 === 1) {
        out.push(`0.975 0.98 0.99 rg ${PAGE.margin} ${y - ROW_HEIGHT + 4} ${usable} ${ROW_HEIGHT} re f`);
        out.push('0 0 0 rg');
      }
      let cursor = PAGE.margin;
      row.forEach((cell, i) => {
        const width = widths[i] as number;
        const value = typeof cell === 'number' ? formatNumber(cell) : text(cell);
        const clipped = truncate(value, FONT_SIZE, width - 8);
        // Numbers right-align, which is the only way a column of figures reads
        // as a column of figures.
        const tx = typeof cell === 'number' ? cursor + width - 4 - textWidth(clipped, FONT_SIZE) : cursor + 4;
        out.push(`BT /F1 ${FONT_SIZE} Tf ${tx.toFixed(1)} ${y - ROW_HEIGHT + 9} Td (${pdfString(clipped)}) Tj ET`);
        cursor += width;
      });
      y -= ROW_HEIGHT;
    });

    out.push(
      `BT /F1 8 Tf 0.5 0.55 0.6 rg ${PAGE.width - PAGE.margin - 90} ${PAGE.margin - 12} Td (Page ${pageIndex + 1} of ${pages.length}) Tj ET`,
    );

    return out.join('\n');
  });

  return assemblePdf(streams, columns);
}

function formatNumber(value: number): string {
  if (Number.isInteger(value)) return value.toLocaleString('en-IN');
  return value.toLocaleString('en-IN', { minimumFractionDigits: 1, maximumFractionDigits: 2 });
}

/**
 * Objects, then the cross-reference table.
 *
 * Byte offsets in the xref must be exact, so the body is built as a list of
 * buffers and measured as it is concatenated rather than being estimated.
 */
function assemblePdf(streams: string[], _columns: number): Buffer {
  const objects: string[] = [];
  const pageCount = streams.length;

  // 1 catalog, 2 pages, 3 font F1, 4 font F2, then page/content pairs.
  const firstPageObject = 5;
  const pageIds = streams.map((_, i) => firstPageObject + i * 2);

  objects.push('<< /Type /Catalog /Pages 2 0 R >>');
  objects.push(`<< /Type /Pages /Count ${pageCount} /Kids [${pageIds.map((id) => `${id} 0 R`).join(' ')}] >>`);
  objects.push('<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>');
  objects.push('<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold /Encoding /WinAnsiEncoding >>');

  streams.forEach((stream, i) => {
    const contentId = pageIds[i]! + 1;
    objects.push(
      `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${PAGE.width} ${PAGE.height}] /Resources << /Font << /F1 3 0 R /F2 4 0 R >> >> /Contents ${contentId} 0 R >>`,
    );
    objects.push(`<< /Length ${Buffer.byteLength(stream, 'latin1')} >>\nstream\n${stream}\nendstream`);
  });

  const chunks: Buffer[] = [Buffer.from('%PDF-1.4\n%\xE2\xE3\xCF\xD3\n', 'latin1')];
  const offsets: number[] = [];
  let position = chunks[0]!.length;

  objects.forEach((body, i) => {
    offsets.push(position);
    const chunk = Buffer.from(`${i + 1} 0 obj\n${body}\nendobj\n`, 'latin1');
    chunks.push(chunk);
    position += chunk.length;
  });

  const xref = [
    'xref',
    `0 ${objects.length + 1}`,
    '0000000000 65535 f ',
    ...offsets.map((o) => `${String(o).padStart(10, '0')} 00000 n `),
    '',
  ].join('\n');

  chunks.push(
    Buffer.from(`${xref}trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${position}\n%%EOF\n`, 'latin1'),
  );

  return Buffer.concat(chunks);
}
