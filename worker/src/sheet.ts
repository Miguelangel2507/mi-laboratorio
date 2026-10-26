import { localTime, type LocalTime } from './schedule';

export interface SheetPrice { key: string; priceE5: number; date: string }

/** Lector CSV mínimo (comillas dobles, comas dentro de campos). */
export function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [], field = '', quoted = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (quoted) {
      if (c === '"' && text[i + 1] === '"') { field += '"'; i++; }
      else if (c === '"') quoted = false;
      else field += c;
    } else if (c === '"') quoted = true;
    else if (c === ',') { row.push(field); field = ''; }
    else if (c === '\n' || c === '\r') { if (c === '\r' && text[i + 1] === '\n') i++; row.push(field); field = ''; rows.push(row); row = []; }
    else field += c;
  }
  if (field !== '' || row.length) { row.push(field); rows.push(row); }
  return rows;
}

/** «16,9271» (decimal con coma) o «1.234,56». Devuelve null si no es un número positivo. */
export function parseVl(s: string): number | null {
  let t = s.trim().replace(/\s/g, '');
  if (!t) return null;
  if (t.includes(',')) t = t.replace(/\./g, '').replace(',', '.');
  else if (/^[1-9]\d{0,2}(\.\d{3})+$/.test(t)) t = t.replace(/\./g, '');
  if (!/^\d*\.?\d+$/.test(t)) return null;
  const n = Number(t);
  return n > 0 ? n : null;
}

/** Columnas: clave (ISIN o código), nombre, VL, fecha AAAA-MM-DD. Las filas sin precio o sin fecha (precio manual) se omiten. */
export function parseSheetCsv(text: string): SheetPrice[] {
  const out: SheetPrice[] = [];
  for (const r of parseCsv(text).slice(1)) {
    const key = (r[0] ?? '').trim();
    const vl = parseVl(r[2] ?? '');
    const date = (r[3] ?? '').trim();
    if (!key || vl === null || !/^\d{4}-\d{2}-\d{2}$/.test(date)) continue;
    out.push({ key, priceE5: Math.round(vl * 1e5), date });
  }
  return out;
}

/**
 * Del enlace de compartir solo se toma el identificador de la hoja: la dirección que se descarga se construye aquí,
 * siempre en docs.google.com, para que el servicio nunca pida una dirección arbitraria.
 */
export function sheetCsvUrl(input: unknown): string | null {
  if (typeof input !== 'string' || input.length > 400) return null;
  let u: URL;
  try { u = new URL(input.trim()); } catch { return null; }
  if (u.protocol !== 'https:' || u.hostname !== 'docs.google.com') return null;
  const m = u.pathname.match(/^\/spreadsheets\/d\/([\w-]{10,100})(?:\/|$)/);
  if (!m) return null;
  const gid = u.hash.match(/gid=(\d+)/)?.[1] ?? u.searchParams.get('gid');
  return `https://docs.google.com/spreadsheets/d/${m[1]}/gviz/tq?tqx=out:csv${gid && /^\d+$/.test(gid) ? `&gid=${gid}` : ''}`;
}

export interface SnapshotWindow { month: string; date: string; local: LocalTime }

/** Último día del mes en la zona del usuario, de las 21:00 a las 23:59: tres oportunidades horarias de tomar la foto. */
export function snapshotWindow(now: Date, tz: string): SnapshotWindow | null {
  const local = localTime(now, tz);
  if (local.day !== local.lastDay || local.hour < 21) return null;
  return { month: local.date.slice(0, 7), date: local.date, local };
}

export interface Snapshot { month: string; date: string; prices: Record<string, number>; takenAt: string }

/** Solo cuentan los precios con fecha hasta el cierre del mes: un precio de un día posterior no es de este cierre. */
export function buildSnapshot(prices: SheetPrice[], win: { month: string; date: string }, now: Date): Snapshot | null {
  const out: Record<string, number> = {};
  for (const p of prices) if (p.date <= win.date) out[p.key] = p.priceE5;
  return Object.keys(out).length === 0 ? null : { month: win.month, date: win.date, prices: out, takenAt: now.toISOString() };
}
