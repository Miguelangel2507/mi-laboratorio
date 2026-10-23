import Dexie, { type Table } from 'dexie';

export type Kind = 'expense' | 'income' | 'transfer';

export interface Setting { key: string; value: unknown }
export interface Account {
  id?: number; name: string; initialCents: number; currency: string; color: string; archived: 0 | 1; createdAt: string;
}
export interface Category { id?: number; kind: 'expense' | 'income'; name: string; isDefault: boolean }
export interface Transaction {
  id?: number; date: string; accountId: number; categoryId: number | null; kind: Kind;
  amountCents: number; currency: string; note: string; source: 'manual' | 'import' | 'recurring';
  transferAccountId?: number; importBatchId?: number; recurringId?: number;
}
export interface Quote { key: string; name: string; priceE5: number | null; priceDate: string | null; fetchedAt: string }

class AppDB extends Dexie {
  settings!: Table<Setting, string>;
  accounts!: Table<Account, number>;
  categories!: Table<Category, number>;
  transactions!: Table<Transaction, number>;
  quotes!: Table<Quote, string>;

  constructor(name = 'mi-patrimonio') {
    super(name);
    this.version(1).stores({
      settings: 'key',
      accounts: '++id, name, archived',
      categories: '++id, kind, &[kind+name]',
      transactions: '++id, date, accountId, categoryId, kind, importBatchId, recurringId, [accountId+date]',
      quotes: '&key, fetchedAt',
    });
  }
}

export const db = new AppDB();

export const DEFAULT_EXPENSE = [
  'Comida', 'Restaurantes', 'Transporte', 'Coche', 'Hogar', 'Suministros', 'Compras', 'Ropa',
  'Ocio', 'Viajes', 'Salud', 'Educación', 'Suscripciones', 'Regalos', 'Mascotas', 'Otros gastos',
];
export const DEFAULT_INCOME = [
  'Nómina', 'Autónomo', 'Inversiones', 'Intereses', 'Reembolsos', 'Regalos recibidos', 'Otros ingresos',
];

export async function seedCategories(d: AppDB = db) {
  if ((await d.categories.count()) > 0) return;
  await d.categories.bulkAdd([
    ...DEFAULT_EXPENSE.map((name) => ({ kind: 'expense' as const, name, isDefault: true })),
    ...DEFAULT_INCOME.map((name) => ({ kind: 'income' as const, name, isDefault: true })),
  ]);
}

export async function getSetting<T>(key: string, fallback: T, d: AppDB = db): Promise<T> {
  const s = await d.settings.get(key);
  return (s?.value as T) ?? fallback;
}
export const setSetting = (key: string, value: unknown, d: AppDB = db) => d.settings.put({ key, value });

export { AppDB };
