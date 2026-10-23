import { describe, expect, it } from 'vitest';
import { AppDB, seedCategories, type Account, type Asset, type Budget, type Quote, type Recurring, type Trade, type Transaction } from './db';
import { convertCents } from './fx';
import { assetView, avgPriceE5, holding, signedValue } from './invest';
import { addDays, addMonths, periodRange } from './dates';
import { health, pctChange, streak, summarize } from './stats';
import { budgetStatus } from './budget';
import { nextDate, runRecurring } from './recurring';
import { BACKUP_TABLES, exportBackup, restoreBackup, validateBackup, wipeAll } from './backup';
import { aiInstructions, commitImport, parseImport, transactionsToCsv, undoImport } from './csvio';

let n = 0;
const fresh = () => new AppDB(`t-${++n}-${Math.random()}`);
const id = (x: Partial<Transaction>): Transaction => ({
  date: '2026-10-10', accountId: 1, categoryId: 1, kind: 'expense', amountCents: 1000, currency: 'EUR', note: '', source: 'manual', ...x,
});

describe('divisas', () => {
  const rates = { EUR: 1, USD: 1.1, GBP: 0.85 };
  it('convierte pasando por el euro', () => {
    expect(convertCents(110, 'USD', 'EUR', rates)).toBe(100);
    expect(convertCents(100, 'EUR', 'USD', rates)).toBe(110);
    expect(convertCents(110, 'USD', 'GBP', rates)).toBe(85);
  });
  it('devuelve null sin tipo y no convierte la misma divisa', () => {
    expect(convertCents(100, 'JPY', 'EUR', rates)).toBeNull();
    expect(convertCents(100, 'EUR', 'EUR')).toBe(100);
  });
});

describe('inversiones: precio medio y ganancia', () => {
  const t = (side: 'buy' | 'sell', quantity: number, price: number, date: string, i: number): Trade =>
    ({ id: i, assetId: 1, date, side, quantity, priceE5: Math.round(price * 1e5) });
  it('precio medio ponderado de dos compras', () => {
    const h = holding([t('buy', 10, 10, '2026-01-01', 1), t('buy', 10, 20, '2026-02-01', 2)]);
    expect(h).toMatchObject({ quantity: 20, costCents: 30000, realizedCents: 0 });
    expect(avgPriceE5(h)).toBe(1500000);
  });
  it('una venta parcial mantiene el precio medio y realiza la ganancia', () => {
    const h = holding([t('buy', 10, 10, '2026-01-01', 1), t('buy', 10, 20, '2026-02-01', 2), t('sell', 5, 30, '2026-03-01', 3)]);
    expect(h.quantity).toBe(15);
    expect(h.costCents).toBe(22500);
    expect(h.realizedCents).toBe(15000 - 7500);
    expect(avgPriceE5(h)).toBe(1500000);
  });
  it('vender todo deja posición y coste a cero, y no se puede vender de más', () => {
    const h = holding([t('buy', 3, 10, '2026-01-01', 1), t('sell', 99, 12, '2026-01-02', 2)]);
    expect(h).toMatchObject({ quantity: 0, costCents: 0, realizedCents: 600 });
  });
  it('fracciones de participación sin errores de coma flotante', () => {
    const h = holding([t('buy', 0.1, 10, '2026-01-01', 1), t('buy', 0.2, 10, '2026-01-02', 2)]);
    expect(h.quantity).toBe(0.3);
  });
  it('valora con el precio de la hoja y calcula P&L', () => {
    const a: Asset = { id: 1, type: 'fund', key: 'X', name: 'X', currency: 'EUR' };
    const q = new Map<string, Quote>([['X', { key: 'X', name: 'X', priceE5: 1200000, priceDate: '2026-10-22', fetchedAt: '' }]]);
    const v = assetView(a, [t('buy', 10, 10, '2026-01-01', 1)], q);
    expect(v).toMatchObject({ valueCents: 12000, costCents: 10000, pnlCents: 2000, noPrice: false });
    expect(v.pnlPct).toBeCloseTo(0.2);
  });
  it('sin precio usa el coste y lo marca; la deuda resta', () => {
    const a: Asset = { id: 1, type: 'fund', key: 'Z', name: 'Z', currency: 'EUR' };
    const v = assetView(a, [t('buy', 10, 10, '2026-01-01', 1)], new Map());
    expect(v).toMatchObject({ noPrice: true, valueCents: 10000, pnlPct: null });
    const debt = assetView({ id: 2, type: 'debt', key: 'd', name: 'Hipoteca', currency: 'EUR', valueCents: 50000 }, [], new Map());
    expect(signedValue(debt)).toBe(-50000);
  });
});

describe('fechas y periodos', () => {
  it('la semana va de lunes a domingo', () => {
    expect(periodRange('week', '2026-10-22')).toMatchObject({ from: '2026-10-19', to: '2026-10-25', prevFrom: '2026-10-12', prevTo: '2026-10-18' });
  });
  it('mes y año', () => {
    expect(periodRange('month', '2026-02-10')).toMatchObject({ from: '2026-02-01', to: '2026-02-28', prevFrom: '2026-01-01', prevTo: '2026-01-31' });
    expect(periodRange('year', '2026-06-01').to).toBe('2026-12-31');
  });
  it('sumar meses respeta el día ancla (31 de enero a 28 de febrero y de vuelta al 31)', () => {
    expect(addMonths('2026-01-31', 1, 31)).toBe('2026-02-28');
    expect(addMonths('2026-02-28', 1, 31)).toBe('2026-03-31');
    expect(addDays('2026-12-31', 1)).toBe('2027-01-01');
  });
});

describe('estadísticas', () => {
  const txs = [
    id({ kind: 'income', amountCents: 200000, categoryId: 9 }),
    id({ amountCents: 5000, categoryId: 1 }), id({ amountCents: 15000, categoryId: 2, date: '2026-10-12' }),
    id({ kind: 'transfer', amountCents: 99999, categoryId: null }),
    id({ amountCents: 7000, date: '2026-09-10' }),
  ];
  const conv = (t: Transaction) => t.amountCents;
  it('suma ingresos y gastos, ignora transferencias y agrupa por categoría', () => {
    const s = summarize(txs, '2026-10-01', '2026-10-31', conv);
    expect(s).toMatchObject({ income: 200000, expense: 20000, balance: 180000, expenseCount: 2 });
    expect(s.byCategory.get(2)).toBe(15000);
  });
  it('cambio frente al periodo anterior', () => {
    expect(pctChange(20000, 7000)).toBeCloseTo(1.857, 2);
    expect(pctChange(5, 0)).toBeNull();
  });
  it('salud del periodo: ahorro, ticket medio y proyección', () => {
    const r = periodRange('month', '2026-10-10');
    const s = summarize(txs, r.from, r.to, conv);
    const h = health(s, r, '2026-10-10');
    expect(h.savingsRate).toBeCloseTo(0.9);
    expect(h.avgTicket).toBe(10000);
    expect(h.projection).toBe(Math.round((20000 / 10) * 31));
  });
  it('racha de días seguidos apuntando', () => {
    const days = ['2026-10-22', '2026-10-21', '2026-10-20', '2026-10-18'].map((date) => id({ date }));
    expect(streak(days, '2026-10-22')).toBe(3);
    expect(streak(days, '2026-10-23')).toBe(3);
    expect(streak(days, '2026-10-25')).toBe(0);
  });
});

describe('presupuestos', () => {
  const b: Budget = { categoryId: 1, period: 'month', limitCents: 10000, rollover: false };
  const conv = (t: Transaction) => t.amountCents;
  it('niveles al 80 % y al 100 %', () => {
    const at = (c: number) => budgetStatus(b, [id({ amountCents: c })], '2026-10-15', conv).level;
    expect([at(7999), at(8000), at(10000)]).toEqual(['ok', 'warn', 'over']);
  });
  it('lo que sobra del mes anterior se acumula', () => {
    const txs = [id({ amountCents: 4000, date: '2026-09-10' }), id({ amountCents: 1000 })];
    const s = budgetStatus({ ...b, rollover: true }, txs, '2026-10-15', conv);
    expect(s.limitCents).toBe(16000);
  });
});

describe('recurrentes', () => {
  it('calcula la siguiente fecha según la frecuencia', () => {
    expect(nextDate('2026-10-10', 'weekly', 10)).toBe('2026-10-17');
    expect(nextDate('2026-10-10', 'biweekly', 10)).toBe('2026-10-24');
    expect(nextDate('2026-10-10', 'yearly', 10)).toBe('2027-10-10');
  });
  it('genera lo vencido una sola vez aunque se ejecute dos veces', async () => {
    const d = fresh();
    const a = await d.accounts.add({ name: 'A', initialCents: 0, currency: 'EUR', color: '', archived: 0, createdAt: '' });
    const r: Recurring = { kind: 'expense', accountId: a, categoryId: null, amountCents: 999, currency: 'EUR', note: 'Gym', frequency: 'monthly', nextRun: '2026-08-31', anchorDay: 31, active: 1 };
    const rid = await d.recurring.add(r);
    expect(await runRecurring(d, '2026-10-22')).toBe(2); // 31 ago, 30 sep
    expect(await runRecurring(d, '2026-10-22')).toBe(0);
    expect((await d.recurring.get(rid))!.nextRun).toBe('2026-10-31');
    expect((await d.transactions.toArray()).map((t) => t.date)).toEqual(['2026-08-31', '2026-09-30']);
  });
});

describe('copia de seguridad JSON', () => {
  async function seeded() {
    const d = fresh();
    await seedCategories(d);
    const a = await d.accounts.add({ name: 'Nómina', initialCents: 500, currency: 'EUR', color: '', archived: 0, createdAt: '' });
    await d.transactions.add(id({ accountId: a }));
    await d.settings.put({ key: 'sheetUrl', value: 'https://docs.google.com/spreadsheets/d/SECRETO' });
    await d.settings.put({ key: 'currency', value: 'EUR' });
    return d;
  }
  it('exportar y restaurar reproduce los datos exactos', async () => {
    const d = await seeded();
    const b = await exportBackup(d, { includeSheetUrl: true });
    expect(validateBackup(b)).toEqual([]);
    const e = fresh();
    await e.accounts.add({ name: 'basura', initialCents: 1, currency: 'EUR', color: '', archived: 0, createdAt: '' });
    await restoreBackup(e, JSON.parse(JSON.stringify(b)));
    for (const t of BACKUP_TABLES) expect(await e[t].toArray()).toEqual(await d[t].toArray());
  });
  it('puede excluir el enlace de la hoja', async () => {
    const b = await exportBackup(await seeded(), { includeSheetUrl: false });
    expect(JSON.stringify(b)).not.toContain('SECRETO');
  });
  it('rechaza archivos inválidos sin tocar nada', async () => {
    const d = await seeded();
    const b = await exportBackup(d, { includeSheetUrl: true });
    expect(validateBackup({})).not.toEqual([]);
    expect(validateBackup({ ...b, schemaVersion: 99 })[0]).toMatch(/más nueva/);
    const bad = JSON.parse(JSON.stringify(b));
    bad.data.transactions[0].amountCents = 'mucho';
    expect(validateBackup(bad)[0]).toMatch(/amountCents/);
    await expect(restoreBackup(d, bad)).rejects.toThrow();
    expect(await d.accounts.count()).toBe(1);
  });
  it('restaurar con fallo a mitad no deja la base a medias', async () => {
    const d = await seeded();
    const b = JSON.parse(JSON.stringify(await exportBackup(d, { includeSheetUrl: true })));
    b.data.categories = [...b.data.categories, b.data.categories[0]]; // id duplicado no falla con put; forzamos un fallo real con clave única
    b.data.categories.push({ kind: 'expense', name: b.data.categories[1].name, id: 9999 }); // viola &[kind+name]
    await expect(restoreBackup(d, b)).rejects.toBeTruthy();
    expect(await d.accounts.count()).toBe(1);
    expect(await d.categories.count()).toBe(23);
  });
  it('borrar todo vacía las tablas', async () => {
    const d = await seeded();
    await wipeAll(d);
    expect(await d.transactions.count() + (await d.accounts.count())).toBe(0);
  });
});

describe('CSV de movimientos', () => {
  const accs: Account[] = [{ id: 1, name: 'Nómina', initialCents: 0, currency: 'EUR', color: '', archived: 0, createdAt: '' }];
  const cats = [{ id: 1, kind: 'expense' as const, name: 'Comida', isDefault: true }, { id: 2, kind: 'expense' as const, name: 'Otros gastos', isDefault: true }, { id: 3, kind: 'income' as const, name: 'Nómina', isDefault: true }];
  it('exporta con comillas y signo, sin transferencias', () => {
    const csv = transactionsToCsv([
      id({ note: 'Cena, con "amigos"', amountCents: 2340 }), id({ kind: 'transfer' }), id({ kind: 'income', categoryId: 3, amountCents: 100000, note: 'Sueldo' }),
    ], accs, cats);
    expect(csv.split('\n')[0]).toBe('Fecha,Descripción,Categoría,Tipo,Cuenta,Importe');
    expect(csv).toContain('"Cena, con ""amigos""",Comida,Gasto,Nómina,-23.40');
    expect(csv).toContain('Sueldo,Nómina,Ingreso,Nómina,1000.00');
    expect(csv.trim().split('\n')).toHaveLength(3);
  });
  it('importa, avisa de lo raro y rechaza lo inválido', () => {
    const text = 'Fecha,Descripción,Categoría,Tipo,Cuenta,Importe\n2026-01-15,Super,Comida,Gasto,Nómina,-42.30\n31/01/2026,Salario,Nómina,Ingreso,,1800,00\n2026-02-01,Raro,Inventada,Gasto,Nómina,5\nmal,x,x,x,x,1\n2026-02-02,Cero,Comida,Gasto,Nómina,0';
    const { rows } = parseImport(text.replace('1800,00', '"1800,00"'), accs, cats, 1);
    expect(rows[0].tx).toMatchObject({ date: '2026-01-15', kind: 'expense', amountCents: 4230, categoryId: 1 });
    expect(rows[1].tx).toMatchObject({ date: '2026-01-31', kind: 'income', amountCents: 180000, accountId: 1 });
    expect(rows[2].warning).toMatch(/no reconocida/);
    expect(rows[2].tx?.categoryId).toBe(2);
    expect(rows[3].error).toBe('Fecha no válida');
    expect(rows[4].error).toBe('Importe no válido');
  });
  it('avisa si hay más de 2.000 filas', () => {
    const body = Array.from({ length: 2001 }, () => '2026-01-01,x,Comida,Gasto,Nómina,-1').join('\n');
    const r = parseImport(`h\n${body}`, accs, cats, 1);
    expect(r.tooMany).toBe(true);
    expect(r.rows).toHaveLength(2000);
  });
  it('importar no cambia el saldo y se deshace entero', async () => {
    const d = fresh();
    const a = await d.accounts.add({ name: 'A', initialCents: 1000, currency: 'EUR', color: '', archived: 0, createdAt: '' });
    const batch = await commitImport(d, [id({ accountId: a, source: 'import' }), id({ accountId: a, source: 'import' })]);
    expect(await d.transactions.where('importBatchId').equals(batch).count()).toBe(2);
    await undoImport(d, batch);
    expect(await d.transactions.count()).toBe(0);
    expect(await d.importBatches.count()).toBe(0);
  });
  it('las instrucciones para la IA llevan tus categorías y cuentas', () => {
    expect(aiInstructions(cats, accs)).toContain('Comida, Otros gastos');
    expect(aiInstructions(cats, accs)).toContain('Nómina');
  });
});

import { computeNetWorth } from './portfolio';
describe('patrimonio completo', () => {
  const acc = (id: number, cur: string, c: number): Account => ({ id, name: 'a' + id, initialCents: c, currency: cur, color: '', archived: 0, createdAt: '' });
  const q: Quote = { key: 'F', name: 'F', priceE5: 1200000, priceDate: '2026-10-22', fetchedAt: '' };
  const assets: Asset[] = [
    { id: 1, type: 'fund', key: 'F', name: 'Fondo', currency: 'EUR' },
    { id: 2, type: 'other', key: 'm:1', name: 'Reloj', currency: 'EUR', valueCents: 100000 },
    { id: 3, type: 'debt', key: 'm:2', name: 'Préstamo', currency: 'EUR', valueCents: 30000 },
  ];
  const trades: Trade[] = [{ id: 1, assetId: 1, date: '2026-01-01', side: 'buy', quantity: 10, priceE5: 1000000 }];
  it('suma cuentas, inversiones y bienes y resta deudas', () => {
    const r = computeNetWorth({ accounts: [acc(1, 'EUR', 50000)], txs: [], assets, trades, quotes: [q] }, 'EUR');
    expect(r).toMatchObject({ accountsCents: 50000, assetsCents: 12000 + 100000 - 30000, cents: 50000 + 82000, excluded: 0 });
  });
  it('convierte divisas y avisa de lo que no puede convertir', () => {
    const r = computeNetWorth({ accounts: [acc(1, 'USD', 11000), acc(2, 'JPY', 5)], txs: [], assets: [], trades: [], quotes: [] }, 'EUR', { EUR: 1, USD: 1.1 });
    expect(r).toMatchObject({ cents: 10000, excluded: 1 });
  });
  it('ignora cuentas archivadas', () => {
    const arch = { ...acc(1, 'EUR', 999), archived: 1 as const };
    expect(computeNetWorth({ accounts: [arch], txs: [], assets: [], trades: [], quotes: [] }, 'EUR').cents).toBe(0);
  });
});
