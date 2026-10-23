import { parseDecimal } from './money';

export interface ParsedQuote {
  key: string;
  name: string;
  /** Precio con 5 decimales (VL × 100 000). null = hay que ponerlo a mano. */
  priceE5: number | null;
  priceDate: string | null;
}

/** Lector CSV mínimo (comillas dobles, comas y saltos de línea dentro de campos). */
export function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = '';
  let quoted = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (quoted) {
      if (c === '"' && text[i + 1] === '"') { field += '"'; i++; }
      else if (c === '"') quoted = false;
      else field += c;
    } else if (c === '"') quoted = true;
    else if (c === ',') { row.push(field); field = ''; }
    else if (c === '\n' || c === '\r') {
      if (c === '\r' && text[i + 1] === '\n') i++;
      row.push(field); field = '';
      rows.push(row); row = [];
    } else field += c;
  }
  if (field !== '' || row.length) { row.push(field); rows.push(row); }
  return rows;
}

/** Columnas esperadas: clave (ISIN o código), nombre, VL, fecha. Ignora el resto. */
export function parseQuotes(csv: string): ParsedQuote[] {
  const rows = parseCsv(csv).slice(1);
  const out: ParsedQuote[] = [];
  for (const r of rows) {
    const key = (r[0] ?? '').trim();
    if (!key) continue;
    const vl = parseDecimal(r[2] ?? '');
    const date = (r[3] ?? '').trim();
    const valid = vl !== null && vl > 0 && /^\d{4}-\d{2}-\d{2}$/.test(date);
    out.push({
      key,
      name: (r[1] ?? '').trim() || key,
      priceE5: valid ? Math.round(vl * 1e5) : null,
      priceDate: valid ? date : null,
    });
  }
  return out;
}

/** Acepta el enlace de compartir de Google Sheets y devuelve la URL de CSV con CORS. */
export function sheetCsvUrl(input: string): string | null {
  const s = input.trim();
  if (/[?&]tqx=out:csv/.test(s) || /output=csv/.test(s)) return s;
  const m = s.match(/^https:\/\/docs\.google\.com\/spreadsheets\/d\/([\w-]+)/);
  if (!m) return null;
  const gid = s.match(/[#&?]gid=(\d+)/)?.[1];
  return `https://docs.google.com/spreadsheets/d/${m[1]}/gviz/tq?tqx=out:csv${gid ? `&gid=${gid}` : ''}`;
}

export async function fetchQuotes(url: string): Promise<ParsedQuote[]> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`La hoja respondió ${res.status}`);
  const text = await res.text();
  if (text.trimStart().startsWith('<')) throw new Error('La hoja no es pública o el enlace no es válido');
  return parseQuotes(text);
}
