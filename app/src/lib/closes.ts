import type { AppDB, MonthClose } from './db';
import { monthEndDate, monthOf } from './performance';

export interface LegacyClose { month: string; marketCents: number | null; investedCents: number | null; prices?: Record<string, number> }

/**
 * Lee los cierres mensuales del archivo de copia de la app anterior: `monthlyCloses` (total por mes) y/o
 * `snapshots` (precio de cada fondo al cierre de cada mes). null si no trae ninguno de los dos.
 */
export function parseLegacyCloses(x: unknown): LegacyClose[] | null {
  if (!x || typeof x !== 'object') return null;
  const { monthlyCloses, snapshots } = x as { monthlyCloses?: unknown; snapshots?: unknown };
  const hasSnaps = !!snapshots && typeof snapshots === 'object' && !Array.isArray(snapshots);
  if (!Array.isArray(monthlyCloses) && !hasSnaps) return null;
  const byMonth = new Map<string, LegacyClose>();
  const okMonth = (m: unknown): m is string => typeof m === 'string' && /^\d{4}-(0[1-9]|1[0-2])$/.test(m);
  if (Array.isArray(monthlyCloses)) for (const c of monthlyCloses) {
    if (!c || typeof c !== 'object') continue;
    const { month, market, invested } = c as Record<string, unknown>;
    if (!okMonth(month)) continue;
    if (typeof market !== 'number' || !Number.isFinite(market) || market < 0) continue;
    byMonth.set(month, { month, marketCents: Math.round(market * 100), investedCents: typeof invested === 'number' && Number.isFinite(invested) ? Math.round(invested * 100) : null });
  }
  if (hasSnaps) for (const [month, raw] of Object.entries(snapshots as Record<string, unknown>)) {
    if (!okMonth(month) || !raw || typeof raw !== 'object') continue;
    const prices: Record<string, number> = {};
    for (const [k, v] of Object.entries(raw as Record<string, unknown>)) if (typeof v === 'number' && Number.isFinite(v) && v > 0) prices[k] = Math.round(v * 1e5);
    if (Object.keys(prices).length === 0) continue;
    const prev = byMonth.get(month);
    byMonth.set(month, { month, marketCents: prev?.marketCents ?? null, investedCents: prev?.investedCents ?? null, prices });
  }
  return [...byMonth.values()].sort((a, b) => a.month.localeCompare(b.month));
}

export interface LegacyClosesPlan { add: LegacyClose[]; skipped: { month: string; reason: string }[] }

/** Solo meses ya terminados, y nunca se pisa un cierre real (foto de precios) con un total importado. */
export function planLegacyCloses(list: LegacyClose[], existing: MonthClose[], today: string): LegacyClosesPlan {
  const add: LegacyClose[] = [];
  const skipped: { month: string; reason: string }[] = [];
  for (const c of list) {
    const have = existing.find((e) => e.month === c.month);
    if (c.month >= monthOf(today)) skipped.push({ month: c.month, reason: 'mes sin terminar' });
    else if (have && have.source !== 'import') skipped.push({ month: c.month, reason: 'ya tienes un cierre real' });
    else if (have && have.marketCents === (c.marketCents ?? undefined) && JSON.stringify(have.prices) === JSON.stringify(c.prices)) skipped.push({ month: c.month, reason: 'ya importado' });
    else add.push(c);
  }
  return { add, skipped };
}

export async function applyLegacyCloses(d: AppDB, list: LegacyClose[], today: string): Promise<number> {
  return d.transaction('rw', d.monthCloses, async () => {
    const plan = planLegacyCloses(list, await d.monthCloses.toArray(), today);
    for (const c of plan.add) {
      const row: MonthClose = { month: c.month, date: monthEndDate(c.month), source: 'import', ...(c.marketCents != null ? { marketCents: c.marketCents } : {}), ...(c.prices ? { prices: c.prices } : {}), ...(c.investedCents != null ? { investedCents: c.investedCents } : {}) };
      const have = await d.monthCloses.where('month').equals(c.month).first();
      if (have) await d.monthCloses.put({ ...row, id: have.id });
      else await d.monthCloses.add(row);
    }
    return plan.add.length;
  });
}

export interface Snapshot { month: string; date: string; prices: Record<string, number> }

/** Guarda las fotos de precios que manda el servicio. Una foto real sustituye a un total importado de ese mes. */
export async function upsertSnapshots(d: AppDB, snaps: Snapshot[]): Promise<number> {
  return d.transaction('rw', d.monthCloses, async () => {
    let n = 0;
    for (const s of snaps) {
      if (!/^\d{4}-\d{2}$/.test(s.month) || !s.prices || typeof s.prices !== 'object') continue;
      const prices: Record<string, number> = {};
      for (const [k, v] of Object.entries(s.prices)) if (typeof v === 'number' && Number.isFinite(v) && v > 0) prices[k] = Math.round(v);
      if (Object.keys(prices).length === 0) continue;
      const have = await d.monthCloses.where('month').equals(s.month).first();
      if (have?.source === 'worker' && JSON.stringify(have.prices) === JSON.stringify(prices)) continue;
      const row: MonthClose = { month: s.month, date: s.date, source: 'worker', prices };
      if (have) await d.monthCloses.put({ ...row, id: have.id }); else await d.monthCloses.add(row);
      n++;
    }
    return n;
  });
}
