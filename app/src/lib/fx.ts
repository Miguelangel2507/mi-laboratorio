import { db, type AppDB } from './db';

/** Tipos respecto al euro: rates['USD'] = 1.08 significa 1 EUR = 1,08 USD. EUR = 1. */
export type Rates = Record<string, number>;

export function convertCents(cents: number, from: string, to: string, rates?: Rates): number | null {
  if (from === to) return cents;
  const a = from === 'EUR' ? 1 : rates?.[from];
  const b = to === 'EUR' ? 1 : rates?.[to];
  if (!a || !b) return null;
  return Math.round((cents / a) * b);
}

export async function loadRates(d: AppDB = db): Promise<Rates> {
  const rows = await d.fxRates.toArray();
  const r: Rates = { EUR: 1 };
  for (const x of rows) r[x.quote] = x.rate;
  return r;
}

/** Tipos del BCE vía Frankfurter. Como mucho una vez al día; sin conexión se queda con los guardados. */
export async function refreshRates(d: AppDB = db, force = false): Promise<boolean> {
  const last = await d.fxRates.orderBy('fetchedAt').last();
  if (!force && last && Date.now() - new Date(last.fetchedAt).getTime() < 864e5) return false;
  try {
    const res = await fetch('https://api.frankfurter.dev/v1/latest?base=EUR');
    if (!res.ok) return false;
    const j = (await res.json()) as { rates: Rates };
    const fetchedAt = new Date().toISOString();
    await d.fxRates.bulkPut(Object.entries(j.rates).map(([quote, rate]) => ({ base: 'EUR', quote, rate, fetchedAt })));
    return true;
  } catch {
    return false;
  }
}
