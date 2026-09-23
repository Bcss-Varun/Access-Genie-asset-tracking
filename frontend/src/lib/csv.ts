/** Parse UTF-8 CSV with quoted commas, escaped quotes and multiline fields. */
export function parseAssetCsv(text: string): { headers: string[]; rows: string[][] } {
  const records: string[][] = [];
  let row: string[] = [], cell = '', quoted = false, closed = false;
  const pushCell = () => { row.push(cell.trim()); cell = ''; closed = false; };
  const pushRow = () => { pushCell(); if (row.some(Boolean)) records.push(row); row = []; };
  const input = text.replace(/^\uFEFF/, '');
  for (let i = 0; i < input.length; i++) {
    const c = input[i];
    if (quoted) {
      if (c === '"' && input[i + 1] === '"') { cell += '"'; i++; }
      else if (c === '"') { quoted = false; closed = true; }
      else cell += c;
    } else if (c === ',') pushCell();
    else if (c === '\r' || c === '\n') { pushRow(); if (c === '\r' && input[i + 1] === '\n') i++; }
    else if (c === '"' && !cell && !closed) quoted = true;
    else if (c === '"' || (closed && c.trim())) throw new Error('Invalid CSV quoting. Check the source file.');
    else if (!closed) cell += c;
    if (records.length > 10001 || row.length > 64) throw new Error('Use at most 10,000 rows and 64 columns per file.');
  }
  if (quoted) throw new Error('A quoted CSV field is not closed.');
  pushRow();
  const [headers, ...rows] = records;
  if (!headers?.length || !rows.length) throw new Error('Include a header and at least one asset row.');
  if (headers.length > 64 || rows.length > 10000) throw new Error('Use at most 10,000 rows and 64 columns per file.');
  if (headers.some((h) => !h) || new Set(headers.map((h) => h.toLowerCase())).size !== headers.length) throw new Error('Column headers must be nonempty and unique.');
  if (rows.some((r) => r.length !== headers.length)) throw new Error('Every row must have the same number of columns as the header.');
  return { headers, rows };
}
