import type { Asset, MonthClose, Trade } from './db';
import { daysInMonth } from './dates';

/** Rendimiento mensual ponderado por flujos (Modified Dietz) de la cartera de inversión. */

export type CloseKind = 'real' | 'imported' | 'estimated';
export interface MonthResult {
  month: string; ret: number | null; kind: CloseKind; startCents: number; endCents: number; flowsCents: number; partial: boolean;
}

export interface PerfInput {
  assets: Asset[];
  trades: Trade[];
  closes: MonthClose[];
  /** Valor actual por activo (con los precios de hoy); se usa para el mes en curso. */
  currentValueCents: (asset: Asset) => number;
  today: string;
}

const TRADED = new Set(['fund', 'stock', 'etf', 'crypto']);
const unitsToCents = (qty: number, priceE5: number) => Math.round((qty * priceE5) / 1000);
export const monthOf = (iso: string) => iso.slice(0, 7);
export const monthEndDate = (month: string) => `${month}-${String(daysInMonth(Number(month.slice(0, 4)), Number(month.slice(5)) - 1)).padStart(2, '0')}`;
export const prevMonth = (month: string) => {
  const [y, m] = month.split('-').map(Number);
  return m === 1 ? `${y - 1}-12` : `${y}-${String(m - 1).padStart(2, '0')}`;
};

const sortTrades = (ts: Trade[]) => [...ts].sort((a, b) => a.date.localeCompare(b.date) || (a.id ?? 0) - (b.id ?? 0));

/** Participaciones que tenías al terminar `date` y precio de tu última operación hasta esa fecha. */
function position(trades: Trade[], date: string): { qty: number; lastPriceE5: number | null } {
  let qty = 0;
  let lastPriceE5: number | null = null;
  for (const t of sortTrades(trades)) {
    if (t.date > date) break;
    qty += t.side === 'buy' ? t.quantity : -t.quantity;
    lastPriceE5 = t.priceE5;
  }
  return { qty: Math.max(0, Math.round(qty * 1e6) / 1e6), lastPriceE5 };
}

function valueAt(input: PerfInput, date: string, snapshotPrices?: Record<string, number>): number {
  let total = 0;
  for (const a of input.assets) {
    if (!TRADED.has(a.type)) continue;
    const { qty, lastPriceE5 } = position(input.trades.filter((t) => t.assetId === a.id), date);
    if (qty <= 0) continue;
    // Con foto de precios se usa el precio del cierre; si ese fondo no venía en la foto, el de tu última compra.
    const price = snapshotPrices?.[a.key] ?? lastPriceE5;
    if (price != null) total += unitsToCents(qty, price);
  }
  return total;
}

/** Lo invertido, neto de ventas, hasta el final de `date`. */
function investedAt(input: PerfInput, date: string): number {
  const traded = new Set(input.assets.filter((a) => TRADED.has(a.type)).map((a) => a.id));
  let net = 0;
  for (const t of input.trades) if (traded.has(t.assetId) && t.date <= date) net += (t.side === 'buy' ? 1 : -1) * unitsToCents(t.quantity, t.priceE5);
  return net;
}

/**
 * Un total importado de otra app solo se acepta si cuadra con tus compras (entre el 90 % y el 125 % de lo invertido):
 * algunos cierres antiguos dejaban fuera fondos sin precio y darían saltos falsos.
 */
const IMPORT_MIN = 0.9;
const IMPORT_MAX = 1.25;
function plausible(input: PerfInput, month: string, cents: number): boolean {
  const inv = investedAt(input, monthEndDate(month));
  return inv > 0 ? cents >= inv * IMPORT_MIN && cents <= inv * IMPORT_MAX : cents === 0;
}

/** Valor de mercado al cierre de un mes: una foto real de precios, o un total importado que cuadra. null si no hay. */
export function marketClose(input: PerfInput, month: string): { cents: number; kind: 'real' | 'imported' } | null {
  const close = input.closes.find((c) => c.month === month);
  if (close?.prices) return { cents: valueAt(input, monthEndDate(month), close.prices), kind: 'real' };
  if (close?.marketCents != null && plausible(input, month, close.marketCents)) return { cents: close.marketCents, kind: 'imported' };
  return null;
}

/** Valor estimado: tus participaciones al precio de tu última compra hasta esa fecha. */
export const estimatedClose = (input: PerfInput, month: string) => valueAt(input, monthEndDate(month));

/**
 * Con datos de mercado en los dos extremos del mes se usan; si falta uno, el mes se estima entero con el precio
 * de tus compras. Mezclar los dos tipos fabricaría subidas y bajadas que no han ocurrido.
 */
export function monthlyReturn(input: PerfInput, month: string): MonthResult {
  const current = month === monthOf(input.today);
  const D = daysInMonth(Number(month.slice(0, 4)), Number(month.slice(5)) - 1);
  const live = () => input.assets.filter((a) => TRADED.has(a.type)).reduce((s, a) => s + input.currentValueCents(a), 0);

  const s = marketClose(input, prevMonth(month));
  const e = current ? { cents: live(), kind: 'real' as const } : marketClose(input, month);
  const market = s !== null && e !== null;
  const startCents = market ? s.cents : estimatedClose(input, prevMonth(month));
  const endCents = market ? e.cents : estimatedClose(input, month);
  const kind: CloseKind = !market ? 'estimated' : s.kind === 'imported' || e.kind === 'imported' ? 'imported' : 'real';

  let flows = 0, weighted = 0;
  const traded = new Set(input.assets.filter((a) => TRADED.has(a.type)).map((a) => a.id));
  for (const t of input.trades) {
    if (!traded.has(t.assetId) || monthOf(t.date) !== month) continue;
    const f = (t.side === 'buy' ? 1 : -1) * unitsToCents(t.quantity, t.priceE5);
    flows += f;
    weighted += f * ((D - Number(t.date.slice(8))) / D);
  }
  const den = startCents + weighted;
  const ret = den > 0 && (startCents > 0 || flows !== 0) ? (endCents - startCents - flows) / den : null;
  return { month, ret, kind, startCents, endCents, flowsCents: flows, partial: current };
}

/** Rentabilidad de un año: los meses con dato encadenados. */
export function yearReturn(results: MonthResult[]): number | null {
  const rs = results.filter((r) => r.ret !== null);
  return rs.length === 0 ? null : rs.reduce((acc, r) => acc * (1 + r.ret!), 1) - 1;
}

export function yearResults(input: PerfInput, year: number): MonthResult[] {
  const out: MonthResult[] = [];
  for (let m = 1; m <= 12; m++) {
    const month = `${year}-${String(m).padStart(2, '0')}`;
    out.push(month > monthOf(input.today) ? { month, ret: null, kind: 'estimated', startCents: 0, endCents: 0, flowsCents: 0, partial: false } : monthlyReturn(input, month));
  }
  return out;
}

export const firstTradeYear = (trades: Trade[]) => (trades.length ? Number(sortTrades(trades)[0].date.slice(0, 4)) : null);
