import Dexie, { type Table } from 'dexie';

/** 'invest' = dinero que sale de una cuenta para comprar un activo: no es gasto y no cambia el patrimonio. */
export type Kind = 'expense' | 'income' | 'transfer' | 'invest';

export interface Setting { key: string; value: unknown }
export interface Account {
  id?: number; name: string; initialCents: number; currency: string; color: string; archived: 0 | 1; createdAt: string;
}
export interface Category { id?: number; kind: 'expense' | 'income'; name: string; isDefault: boolean }
export interface Transaction {
  id?: number; date: string; accountId: number; categoryId: number | null; kind: Kind;
  amountCents: number; currency: string; note: string; source: 'manual' | 'import' | 'recurring';
  transferAccountId?: number;
  /** Transferencias entre divisas: importe que llega a la cuenta destino, en su divisa. */
  toAmountCents?: number; importBatchId?: number; recurringId?: number; tradeId?: number;
}
export type AssetType = 'fund' | 'stock' | 'etf' | 'crypto' | 'other' | 'debt';
export interface Asset {
  id?: number; type: AssetType; key: string; name: string; currency: string;
  /** Solo para bienes y deudas: valor fijado a mano (las deudas en positivo). */
  valueCents?: number;
  /** Precio manual por unidad (E5) cuando el activo no está en la hoja. */
  manualPriceE5?: number | null;
}
export interface Trade { id?: number; assetId: number; date: string; side: 'buy' | 'sell'; quantity: number; priceE5: number }
export interface Budget { id?: number; categoryId: number; period: 'week' | 'month' | 'year'; limitCents: number; rollover: boolean }
export interface Goal { id?: number; name: string; targetCents: number; currency: string; contributions: { date: string; cents: number }[] }
export type Frequency = 'daily' | 'weekly' | 'biweekly' | 'monthly' | 'yearly';
export interface Recurring {
  id?: number; kind: Kind; accountId: number; transferAccountId?: number; categoryId: number | null;
  amountCents: number; currency: string; note: string; frequency: Frequency; nextRun: string; anchorDay: number; active: 0 | 1;
}
export interface NetWorthPoint { id?: number; period: 'month' | 'year'; label: string; valueCents: number }
export interface FxRate { base: string; quote: string; rate: number; fetchedAt: string }
export interface ImportBatch { id?: number; createdAt: string; count: number }
export interface PlanItem { id?: number; assetKey: string; name: string; amountCents: number; startMonth: string; active: 0 | 1 }
export interface PlanRun {
  id?: number; itemId: number; month: string; dueDate: string; amountCents: number;
  status: 'pending' | 'confirmed' | 'skipped'; tradeId?: number; txId?: number; confirmedAt?: string;
}
export interface PlanConfig { day: number; accountId: number | null; active: boolean }
export interface Quote { key: string; name: string; priceE5: number | null; priceDate: string | null; fetchedAt: string }

class AppDB extends Dexie {
  settings!: Table<Setting, string>;
  accounts!: Table<Account, number>;
  categories!: Table<Category, number>;
  transactions!: Table<Transaction, number>;
  quotes!: Table<Quote, string>;
  assets!: Table<Asset, number>;
  trades!: Table<Trade, number>;
  budgets!: Table<Budget, number>;
  goals!: Table<Goal, number>;
  recurring!: Table<Recurring, number>;
  netWorth!: Table<NetWorthPoint, number>;
  fxRates!: Table<FxRate, [string, string]>;
  importBatches!: Table<ImportBatch, number>;
  planItems!: Table<PlanItem, number>;
  planRuns!: Table<PlanRun, number>;

  constructor(name = 'mi-patrimonio') {
    super(name);
    this.version(1).stores({
      settings: 'key',
      accounts: '++id, name, archived',
      categories: '++id, kind, &[kind+name]',
      transactions: '++id, date, accountId, categoryId, kind, importBatchId, recurringId, [accountId+date]',
      quotes: '&key, fetchedAt',
    });
    this.version(2).stores({
      assets: '++id, type, &key',
      trades: '++id, assetId, date',
      budgets: '++id, categoryId, period',
      goals: '++id, name',
      recurring: '++id, nextRun, active',
      netWorth: '++id, &[period+label]',
      fxRates: '&[base+quote], fetchedAt',
      importBatches: '++id, createdAt',
    });
    this.version(3).stores({
      planItems: '++id, assetKey, active',
      planRuns: '++id, status, dueDate, &[itemId+month]',
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
