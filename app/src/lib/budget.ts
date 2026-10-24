import type { Budget, Transaction } from './db';
import { periodRange, type PeriodKind } from './dates';
import { summarize } from './stats';

export interface BudgetStatus { limitCents: number; spentCents: number; pct: number; level: 'ok' | 'warn' | 'over' }

const kindOf = (p: Budget['period']): PeriodKind => p;

export function budgetStatus(b: Budget, txs: Transaction[], today: string, toMain: (t: Transaction) => number | null): BudgetStatus {
  const r = periodRange(kindOf(b.period), today);
  const only = (from: string, to: string) =>
    summarize(txs.filter((t) => t.categoryId === b.categoryId), from, to, toMain, today).expense;
  const spent = only(r.from, r.to);
  const carry = b.rollover ? Math.max(0, b.limitCents - only(r.prevFrom, r.prevTo)) : 0;
  const limit = b.limitCents + carry;
  const pct = limit > 0 ? spent / limit : 0;
  return { limitCents: limit, spentCents: spent, pct, level: pct >= 1 ? 'over' : pct >= 0.8 ? 'warn' : 'ok' };
}

export const goalSaved = (g: { contributions: { cents: number }[] }) => g.contributions.reduce((s, c) => s + c.cents, 0);
