import { describe, expect, it } from 'vitest';
import { AppDB, setSetting, type Account, type Transaction } from './db';
import { accountBalance, netWorth } from './domain';
import { summarize } from './stats';
import { computeNetWorth } from './portfolio';
import { confirmRun, dueDateFor, generatePlanRuns, nextStartMonth, reopenRun, skipRun, undoRun } from './plan';
import { exportBackup, restoreBackup, validateBackup } from './backup';
import { transactionsToCsv } from './csvio';
import { nextDate, runRecurring } from './recurring';

let n = 0;
const fresh = () => new AppDB(`plan-${++n}-${Math.random()}`);
const acc = (over: Partial<Account> = {}): Account => ({ name: 'BBVA', initialCents: 100000, currency: 'EUR', color: '', archived: 0, createdAt: '', ...over });
const tx = (p: Partial<Transaction>): Transaction => ({
  date: '2026-10-10', accountId: 1, categoryId: null, kind: 'expense', amountCents: 1000, currency: 'EUR', note: '', source: 'manual', ...p,
});

describe('movimientos con fecha futura', () => {
  const a = { ...acc(), id: 1 };
  it('no cuentan en el saldo hasta su día', () => {
    const t = [tx({ date: '2026-11-01', amountCents: 5000 }), tx({ date: '2026-10-24', amountCents: 2000 })];
    expect(accountBalance(a, t, '2026-10-24')).toBe(100000 - 2000);
    expect(accountBalance(a, t, '2026-11-01')).toBe(100000 - 2000 - 5000);
  });
  it('un ingreso programado tampoco suma antes de tiempo', () => {
    expect(accountBalance(a, [tx({ kind: 'income', date: '2026-11-01', amountCents: 150000 })], '2026-10-31')).toBe(100000);
  });
  it('no cuentan en el patrimonio ni en las estadísticas', () => {
    const t = [tx({ date: '2026-11-01', amountCents: 5000 })];
    expect(netWorth([a], t, 'EUR', '2026-10-24').cents).toBe(100000);
    expect(computeNetWorth({ accounts: [a], txs: t, assets: [], trades: [], quotes: [] }, 'EUR', undefined, '2026-10-24').cents).toBe(100000);
    const s = summarize(t, '2026-10-01', '2026-11-30', (x) => x.amountCents, '2026-10-24');
    expect(s.expense).toBe(0);
  });
  it('una transferencia futura tampoco mueve dinero', () => {
    const b = { ...acc({ name: 'Ahorro', initialCents: 0 }), id: 2 };
    const t = [tx({ kind: 'transfer', transferAccountId: 2, date: '2026-11-01', amountCents: 30000 })];
    expect(accountBalance(a, t, '2026-10-24')).toBe(100000);
    expect(accountBalance(b, t, '2026-10-24')).toBe(0);
    expect(accountBalance(b, t, '2026-11-01')).toBe(30000);
  });
});

describe('recurrentes con inicio futuro', () => {
  it('no generan nada hasta la fecha de inicio y luego siguen cada mes', async () => {
    const d = fresh();
    const a = await d.accounts.add(acc());
    await d.recurring.add({ kind: 'income', accountId: a, categoryId: null, amountCents: 180000, currency: 'EUR', note: 'Nómina', frequency: 'monthly', nextRun: '2026-11-01', anchorDay: 1, active: 1 });
    expect(await runRecurring(d, '2026-10-24')).toBe(0);
    expect(await d.transactions.count()).toBe(0);
    expect(await runRecurring(d, '2026-11-01')).toBe(1);
    expect(await runRecurring(d, '2026-11-01')).toBe(0);
    expect(await runRecurring(d, '2027-01-15')).toBe(2); // 1 dic y 1 ene
    expect((await d.recurring.toArray())[0].nextRun).toBe('2027-02-01');
  });
  it('el día 31 se ajusta a meses cortos y vuelve al 31', () => {
    expect(nextDate('2026-01-31', 'monthly', 31)).toBe('2026-02-28');
    expect(nextDate('2026-02-28', 'monthly', 31)).toBe('2026-03-31');
  });
});

describe('plan de inversión mensual', () => {
  async function setup() {
    const d = fresh();
    const bbva = (await d.accounts.add(acc())) as number;
    await setSetting('plan', { day: 1, accountId: bbva, active: true }, d);
    const a = (await d.planItems.add({ assetKey: 'IE00TEST0001', name: 'Fondo A', amountCents: 10000, startMonth: '2026-11', active: 1 })) as number;
    const b = (await d.planItems.add({ assetKey: 'ES0110862010', name: 'Aspe B', amountCents: 5000, startMonth: '2026-11', active: 1 })) as number;
    await d.quotes.put({ key: 'IE00TEST0001', name: 'Fondo A', priceE5: 1000000, priceDate: '2026-11-01', fetchedAt: '' });
    await d.quotes.put({ key: 'ES0110862010', name: 'Aspe B', priceE5: null, priceDate: null, fetchedAt: '' });
    return { d, bbva, a, b };
  }
  it('calcula día y mes de inicio', () => {
    expect(dueDateFor('2026-02', 31)).toBe('2026-02-28');
    expect(nextStartMonth('2026-10-24', 1)).toBe('2026-11');
    expect(nextStartMonth('2026-10-01', 1)).toBe('2026-10');
    expect(nextStartMonth('2026-10-24', 28)).toBe('2026-10');
  });
  it('no crea pendientes antes del día y los crea al llegar, una sola vez', async () => {
    const { d } = await setup();
    expect(await generatePlanRuns(d, '2026-10-24')).toBe(0);
    expect(await generatePlanRuns(d, '2026-11-01')).toBe(2);
    expect(await generatePlanRuns(d, '2026-11-01')).toBe(0);
    expect(await generatePlanRuns(d, '2026-11-20')).toBe(0);
    expect(await generatePlanRuns(d, '2026-12-01')).toBe(2);
    expect(await d.planRuns.where('status').equals('pending').count()).toBe(4);
  });
  it('si el plan está desactivado no genera nada', async () => {
    const { d, bbva } = await setup();
    await setSetting('plan', { day: 1, accountId: bbva, active: false }, d);
    expect(await generatePlanRuns(d, '2026-12-01')).toBe(0);
  });
  it('un pendiente no cuenta en el patrimonio; al confirmar compra y descuenta sin cambiar el total', async () => {
    const { d, bbva } = await setup();
    await generatePlanRuns(d, '2026-11-01');
    const all = async () => computeNetWorth({ accounts: await d.accounts.toArray(), txs: await d.transactions.toArray(), assets: await d.assets.toArray(), trades: await d.trades.toArray(), quotes: await d.quotes.toArray() }, 'EUR', undefined, '2026-11-01');
    expect((await all()).cents).toBe(100000);
    const run = (await d.planRuns.toArray()).find((r) => r.amountCents === 10000)!;
    await confirmRun(d, run.id!, { amountCents: 10000, date: '2026-11-01', priceE5: 1000000, accountId: bbva }, '2026-11-01');
    const r = await all();
    expect(r.accountsCents).toBe(90000);
    expect(r.assetsCents).toBe(10000);
    expect(r.cents).toBe(100000);
    const trade = (await d.trades.toArray())[0];
    expect(trade).toMatchObject({ side: 'buy', quantity: 10, priceE5: 1000000, date: '2026-11-01' });
    expect((await d.transactions.toArray())[0]).toMatchObject({ kind: 'invest', amountCents: 10000, accountId: bbva, tradeId: trade.id });
  });
  it('no cuenta como gasto en estadísticas ni sale en el CSV', async () => {
    const { d, bbva } = await setup();
    await generatePlanRuns(d, '2026-11-01');
    const run = (await d.planRuns.toArray())[0];
    await confirmRun(d, run.id!, { amountCents: run.amountCents, date: '2026-11-01', priceE5: 1000000, accountId: bbva }, '2026-11-01');
    const txs = await d.transactions.toArray();
    expect(summarize(txs, '2026-11-01', '2026-11-30', (t) => t.amountCents, '2026-11-02').expense).toBe(0);
    expect(transactionsToCsv(txs, await d.accounts.toArray(), []).trim().split('\n')).toHaveLength(1);
  });
  it('permite cambiar la fecha, el importe y la cuenta al confirmar', async () => {
    const { d } = await setup();
    const savings = (await d.accounts.add(acc({ name: 'Otra', initialCents: 50000 }))) as number;
    await generatePlanRuns(d, '2026-11-05');
    const run = (await d.planRuns.toArray())[0];
    await confirmRun(d, run.id!, { amountCents: 12000, date: '2026-11-03', priceE5: 1200000, accountId: savings }, '2026-11-05');
    expect((await d.trades.toArray())[0]).toMatchObject({ date: '2026-11-03', quantity: 10, priceE5: 1200000 });
    expect((await d.transactions.toArray())[0]).toMatchObject({ date: '2026-11-03', accountId: savings, amountCents: 12000 });
  });
  it('el fondo sin precio en la hoja (Aspe B) usa el precio manual y lo recuerda', async () => {
    const { d, bbva } = await setup();
    await generatePlanRuns(d, '2026-11-01');
    const run = (await d.planRuns.toArray()).find((r) => r.amountCents === 5000)!;
    await confirmRun(d, run.id!, { amountCents: 5000, date: '2026-11-01', priceE5: 1073739, accountId: bbva }, '2026-11-01');
    const asset = (await d.assets.where('key').equals('ES0110862010').first())!;
    expect(asset.manualPriceE5).toBe(1073739);
    const qty = (await d.trades.toArray())[0].quantity;
    expect(qty).toBe(4.656625); // 50 € / 10,73739
  });
  it('un asset existente se reutiliza y no se duplica', async () => {
    const { d, bbva } = await setup();
    await d.assets.add({ type: 'fund', key: 'IE00TEST0001', name: 'Fondo A', currency: 'EUR' });
    await generatePlanRuns(d, '2026-12-01');
    for (const r of (await d.planRuns.toArray()).filter((x) => x.amountCents === 10000)) {
      await confirmRun(d, r.id!, { amountCents: 10000, date: r.dueDate, priceE5: 1000000, accountId: bbva }, '2026-12-01');
    }
    expect(await d.assets.where('key').equals('IE00TEST0001').count()).toBe(1);
    expect(await d.trades.count()).toBe(2);
  });
  it('rechaza confirmar dos veces, fechas futuras, importes y cuentas no válidas, sin dejar rastro', async () => {
    const { d, bbva } = await setup();
    await generatePlanRuns(d, '2026-11-01');
    const run = (await d.planRuns.toArray())[0];
    const ok = { amountCents: run.amountCents, date: '2026-11-01', priceE5: 1000000, accountId: bbva };
    await expect(confirmRun(d, run.id!, { ...ok, date: '2026-11-09' }, '2026-11-01')).rejects.toThrow(/futura/);
    await expect(confirmRun(d, run.id!, { ...ok, amountCents: 0 }, '2026-11-01')).rejects.toThrow(/importe/);
    await expect(confirmRun(d, run.id!, { ...ok, priceE5: 0 }, '2026-11-01')).rejects.toThrow(/precio/);
    await expect(confirmRun(d, run.id!, { ...ok, accountId: 999 }, '2026-11-01')).rejects.toThrow(/cuenta/);
    const usd = (await d.accounts.add(acc({ currency: 'USD' }))) as number;
    await expect(confirmRun(d, run.id!, { ...ok, accountId: usd }, '2026-11-01')).rejects.toThrow(/EUR/);
    expect(await d.trades.count() + (await d.transactions.count())).toBe(0);
    await confirmRun(d, run.id!, ok, '2026-11-01');
    await expect(confirmRun(d, run.id!, ok, '2026-11-01')).rejects.toThrow(/pendiente/);
    expect(await d.trades.count()).toBe(1);
  });
  it('saltar, reabrir y deshacer', async () => {
    const { d, bbva } = await setup();
    await generatePlanRuns(d, '2026-11-01');
    const [r1, r2] = await d.planRuns.toArray();
    await skipRun(d, r1.id!);
    expect((await d.planRuns.get(r1.id!))!.status).toBe('skipped');
    await reopenRun(d, r1.id!);
    expect((await d.planRuns.get(r1.id!))!.status).toBe('pending');
    await confirmRun(d, r2.id!, { amountCents: r2.amountCents, date: '2026-11-01', priceE5: 1000000, accountId: bbva }, '2026-11-01');
    await undoRun(d, r2.id!);
    expect(await d.trades.count()).toBe(0);
    expect(await d.transactions.count()).toBe(0);
    expect((await d.planRuns.get(r2.id!))!.status).toBe('pending');
  });
});

describe('copia con el plan', () => {
  it('guarda y restaura plan, fondos y aportaciones', async () => {
    const d = fresh();
    const a = (await d.accounts.add(acc())) as number;
    await d.planItems.add({ assetKey: 'X', name: 'X', amountCents: 100, startMonth: '2026-11', active: 1 });
    await generatePlanRuns(d, '2026-11-01');
    const b = await exportBackup(d, { includeSheetUrl: false });
    expect(validateBackup(b)).toEqual([]);
    const e = fresh();
    await restoreBackup(e, JSON.parse(JSON.stringify(b)));
    expect(await e.planItems.count()).toBe(1);
    expect(await e.accounts.get(a)).toBeTruthy();
  });
  it('una copia antigua sin plan se restaura igualmente', async () => {
    const d = fresh();
    await d.accounts.add(acc());
    const b = JSON.parse(JSON.stringify(await exportBackup(d, { includeSheetUrl: false })));
    delete b.data.planItems; delete b.data.planRuns; b.schemaVersion = 1;
    expect(validateBackup(b)).toEqual([]);
    const e = fresh();
    await e.planItems.add({ assetKey: 'Z', name: 'Z', amountCents: 1, startMonth: '2026-11', active: 1 });
    await restoreBackup(e, b);
    expect(await e.accounts.count()).toBe(1);
    expect(await e.planItems.count()).toBe(0);
  });
});
