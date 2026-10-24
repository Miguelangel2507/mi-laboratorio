import type { Transaction } from './db';
import { daysBetween, inRange, type Range } from './dates';
import { todayISO } from './domain';

export interface Summary { income: number; expense: number; balance: number; count: number; expenseCount: number; byCategory: Map<number | null, number> }

/** `toMain` convierte cada movimiento a la moneda principal (null si no hay cambio). No cuentan transferencias, inversiones ni lo futuro. */
export function summarize(txs: Transaction[], from: string, to: string, toMain: (t: Transaction) => number | null, today: string = todayISO()): Summary {
  let income = 0, expense = 0, count = 0, expenseCount = 0;
  const byCategory = new Map<number | null, number>();
  for (const t of txs) {
    if (t.kind === 'transfer' || t.kind === 'invest' || t.date > today || !inRange(t.date, from, to)) continue;
    const v = toMain(t);
    if (v === null) continue;
    count++;
    if (t.kind === 'income') income += v;
    else {
      expense += v;
      expenseCount++;
      byCategory.set(t.categoryId, (byCategory.get(t.categoryId) ?? 0) + v);
    }
  }
  return { income, expense, balance: income - expense, count, expenseCount, byCategory };
}

export const pctChange = (cur: number, prev: number) => (prev === 0 ? null : (cur - prev) / Math.abs(prev));

export function health(s: Summary, r: Range, today: string) {
  const total = daysBetween(r.from, r.to) + 1;
  const elapsed = Math.min(total, Math.max(1, daysBetween(r.from, today) + 1));
  const current = inRange(today, r.from, r.to);
  return {
    savingsRate: s.income > 0 ? (s.income - s.expense) / s.income : null,
    avgTicket: s.expenseCount > 0 ? Math.round(s.expense / s.expenseCount) : null,
    dailyAvg: Math.round(s.expense / (current ? elapsed : total)),
    projection: current && total > 1 ? Math.round((s.expense / elapsed) * total) : null,
  };
}

export function streak(txs: Transaction[], today: string): number {
  const days = new Set(txs.map((t) => t.date));
  let d = today, n = 0;
  if (!days.has(d)) d = shift(d, -1);
  while (days.has(d)) { n++; d = shift(d, -1); }
  return n;
}
const shift = (iso: string, n: number) => {
  const d = new Date(`${iso}T12:00:00`); d.setDate(d.getDate() + n);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};
