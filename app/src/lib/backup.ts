import type { AppDB } from './db';

export const BACKUP_TABLES = [
  'settings', 'accounts', 'categories', 'transactions', 'assets', 'trades',
  'budgets', 'goals', 'recurring', 'netWorth', 'importBatches',
] as const;
export type BackupTable = (typeof BACKUP_TABLES)[number];

export const SCHEMA_VERSION = 1;
export interface Backup { app: 'mi-patrimonio'; schemaVersion: number; exportedAt: string; data: Record<BackupTable, Record<string, unknown>[]> }

const REQUIRED: Record<BackupTable, Record<string, 'string' | 'number' | 'boolean' | 'array'>> = {
  settings: { key: 'string' },
  accounts: { name: 'string', initialCents: 'number', currency: 'string' },
  categories: { kind: 'string', name: 'string' },
  transactions: { date: 'string', accountId: 'number', kind: 'string', amountCents: 'number', currency: 'string' },
  assets: { type: 'string', key: 'string', name: 'string' },
  trades: { assetId: 'number', date: 'string', side: 'string', quantity: 'number', priceE5: 'number' },
  budgets: { categoryId: 'number', period: 'string', limitCents: 'number' },
  goals: { name: 'string', targetCents: 'number', contributions: 'array' },
  recurring: { kind: 'string', accountId: 'number', amountCents: 'number', frequency: 'string', nextRun: 'string' },
  netWorth: { period: 'string', label: 'string', valueCents: 'number' },
  importBatches: { createdAt: 'string' },
};

export async function exportBackup(d: AppDB, opts: { includeSheetUrl: boolean }): Promise<Backup> {
  const data = {} as Backup['data'];
  for (const t of BACKUP_TABLES) {
    let rows = (await (d[t] as { toArray(): Promise<unknown[]> }).toArray()) as Record<string, unknown>[];
    if (t === 'settings' && !opts.includeSheetUrl) rows = rows.filter((r) => r.key !== 'sheetUrl');
    data[t] = rows;
  }
  return { app: 'mi-patrimonio', schemaVersion: SCHEMA_VERSION, exportedAt: new Date().toISOString(), data };
}

/** Devuelve la lista de problemas; vacía = válido. No toca la base de datos. */
export function validateBackup(x: unknown): string[] {
  const errs: string[] = [];
  if (!x || typeof x !== 'object') return ['El archivo no es un objeto JSON.'];
  const b = x as Partial<Backup>;
  if (b.app !== 'mi-patrimonio') errs.push('No es una copia de esta app.');
  if (typeof b.schemaVersion !== 'number') errs.push('Falta la versión del archivo.');
  else if (b.schemaVersion > SCHEMA_VERSION) errs.push('La copia es de una versión más nueva de la app.');
  if (!b.data || typeof b.data !== 'object') return [...errs, 'Faltan los datos.'];
  for (const t of BACKUP_TABLES) {
    const rows = (b.data as Record<string, unknown>)[t];
    if (!Array.isArray(rows)) { errs.push(`Falta la tabla ${t}.`); continue; }
    rows.forEach((r, i) => {
      if (!r || typeof r !== 'object') return errs.push(`${t}[${i}] no es un objeto.`);
      for (const [f, type] of Object.entries(REQUIRED[t])) {
        const v = (r as Record<string, unknown>)[f];
        const ok = type === 'array' ? Array.isArray(v) : typeof v === type;
        if (!ok) errs.push(`${t}[${i}].${f} debería ser ${type}.`);
      }
    });
  }
  return errs.slice(0, 20);
}

export function summarizeBackup(b: Backup) {
  return {
    accounts: b.data.accounts.length, transactions: b.data.transactions.length,
    assets: b.data.assets.length, exportedAt: b.exportedAt,
  };
}

/** Sustituye todo en UNA transacción: si algo falla, no cambia nada. */
export async function restoreBackup(d: AppDB, b: Backup): Promise<void> {
  const errs = validateBackup(b);
  if (errs.length) throw new Error(errs[0]);
  const keepSheet = b.data.settings.some((r) => r.key === 'sheetUrl') ? null : await d.settings.get('sheetUrl');
  await d.transaction('rw', BACKUP_TABLES.map((t) => d[t]) as never, async () => {
    for (const t of BACKUP_TABLES) {
      const table = d[t] as unknown as { clear(): Promise<void>; bulkPut(r: unknown[]): Promise<unknown> };
      await table.clear();
      await table.bulkPut(b.data[t]);
    }
    if (keepSheet) await d.settings.put(keepSheet);
  });
}

export async function wipeAll(d: AppDB): Promise<void> {
  await d.transaction('rw', [...BACKUP_TABLES.map((t) => d[t]), d.quotes, d.fxRates] as never, async () => {
    for (const t of [...BACKUP_TABLES, 'quotes', 'fxRates'] as const) await (d[t] as { clear(): Promise<void> }).clear();
  });
}
