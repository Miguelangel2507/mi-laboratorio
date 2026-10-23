import type { AppDB, Frequency, Recurring } from './db';
import { addDays, addMonths } from './dates';

export function nextDate(iso: string, f: Frequency, anchorDay: number): string {
  switch (f) {
    case 'daily': return addDays(iso, 1);
    case 'weekly': return addDays(iso, 7);
    case 'biweekly': return addDays(iso, 14);
    case 'monthly': return addMonths(iso, 1, anchorDay);
    case 'yearly': return addMonths(iso, 12, anchorDay);
  }
}

/** Genera los movimientos vencidos hasta hoy. Es idempotente: no duplica un (recurrente, fecha). */
export async function runRecurring(d: AppDB, today: string): Promise<number> {
  let created = 0;
  const list = await d.recurring.where('active').equals(1).toArray();
  for (const r of list) {
    let cursor = r.nextRun, guard = 0;
    while (cursor <= today && guard++ < 1000) {
      await create(d, r, cursor) && created++;
      cursor = nextDate(cursor, r.frequency, r.anchorDay);
    }
    if (cursor !== r.nextRun) await d.recurring.update(r.id!, { nextRun: cursor });
  }
  return created;
}

async function create(d: AppDB, r: Recurring, date: string): Promise<boolean> {
  const exists = await d.transactions.where('accountId').equals(r.accountId)
    .filter((t) => t.recurringId === r.id && t.date === date).count();
  if (exists) return false;
  await d.transactions.add({
    date, accountId: r.accountId, categoryId: r.categoryId, kind: r.kind, amountCents: r.amountCents, currency: r.currency,
    note: r.note, source: 'recurring', recurringId: r.id, ...(r.transferAccountId ? { transferAccountId: r.transferAccountId } : {}),
  });
  return true;
}
