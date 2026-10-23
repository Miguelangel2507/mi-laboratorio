const p = (n: number) => String(n).padStart(2, '0');
const toISO = (d: Date) => `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
const parse = (iso: string) => new Date(`${iso}T12:00:00`);

export const addDays = (iso: string, n: number) => { const d = parse(iso); d.setDate(d.getDate() + n); return toISO(d); };
export const daysInMonth = (y: number, m0: number) => new Date(y, m0 + 1, 0).getDate();
export const daysBetween = (a: string, b: string) => Math.round((parse(b).getTime() - parse(a).getTime()) / 864e5);

export function addMonths(iso: string, n: number, anchorDay?: number) {
  const d = parse(iso);
  const day = anchorDay ?? d.getDate();
  const first = new Date(d.getFullYear(), d.getMonth() + n, 1, 12);
  first.setDate(Math.min(day, daysInMonth(first.getFullYear(), first.getMonth())));
  return toISO(first);
}

export type PeriodKind = 'day' | 'week' | 'month' | 'year';
export interface Range { from: string; to: string; prevFrom: string; prevTo: string }

/** Semana de lunes a domingo. `to` es inclusivo. */
export function periodRange(kind: PeriodKind, anchor: string): Range {
  const d = parse(anchor);
  if (kind === 'day') return { from: anchor, to: anchor, prevFrom: addDays(anchor, -1), prevTo: addDays(anchor, -1) };
  if (kind === 'week') {
    const from = addDays(anchor, -((d.getDay() + 6) % 7));
    return { from, to: addDays(from, 6), prevFrom: addDays(from, -7), prevTo: addDays(from, -1) };
  }
  if (kind === 'month') {
    const from = `${d.getFullYear()}-${p(d.getMonth() + 1)}-01`;
    const to = `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(daysInMonth(d.getFullYear(), d.getMonth()))}`;
    const prev = addMonths(from, -1);
    return { from, to, prevFrom: prev, prevTo: addDays(from, -1) };
  }
  const y = d.getFullYear();
  return { from: `${y}-01-01`, to: `${y}-12-31`, prevFrom: `${y - 1}-01-01`, prevTo: `${y - 1}-12-31` };
}

export const inRange = (date: string, from: string, to: string) => date >= from && date <= to;
export const monthLabel = (iso: string) => iso.slice(0, 7);
