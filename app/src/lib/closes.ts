import type { AppDB, MonthClose } from './db';
import { monthEndDate, monthOf } from './performance';

export interface LegacyClose { month: string; marketCents: number; investedCents: number | null }

/** Lee los cierres mensuales del archivo de copia de la app anterior (`monthlyCloses`). null si no es de esa app. */
export function parseLegacyCloses(x: unknown): LegacyClose[] | null {
  if (!x || typeof x !== 'object') return null;
  const list = (x as { monthlyCloses?: unknown }).monthlyCloses;
  if (!Array.isArray(list)) return null;
  const out: LegacyClose[] = [];
  for (const c of list) {
    if (!c || typeof c !== 'object') continue;
    const { month, market, invested } = c as Record<string, unknown>;
    if (typeof month !== 'string' || !/^\d{4}-(0[1-9]|1[0-2])$/.test(month)) continue;
    if (typeof market !== 'number' || !Number.isFinite(market) || market < 0) continue;
    out.push({ month, marketCents: Math.round(market * 100), investedCents: typeof invested === 'number' && Number.isFinite(invested) ? Math.round(invested * 100) : null });
  }
  return out.sort((a, b) => a.month.localeCompare(b.month));
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
    else if (have && have.marketCents === c.marketCents) skipped.push({ month: c.month, reason: 'ya importado' });
    else add.push(c);
  }
  return { add, skipped };
}

export async function applyLegacyCloses(d: AppDB, list: LegacyClose[], today: string): Promise<number> {
  return d.transaction('rw', d.monthCloses, async () => {
    const plan = planLegacyCloses(list, await d.monthCloses.toArray(), today);
    for (const c of plan.add) {
      const row: MonthClose = { month: c.month, date: monthEndDate(c.month), source: 'import', marketCents: c.marketCents, ...(c.investedCents != null ? { investedCents: c.investedCents } : {}) };
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
