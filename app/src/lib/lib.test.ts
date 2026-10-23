import { describe, expect, it } from 'vitest';
import { parseDecimal, toCents, formatMoney } from './money';
import { parseCsv, parseQuotes, sheetCsvUrl } from './sheet';
import { accountBalance, netWorth } from './domain';
import { AppDB, seedCategories, type Account, type Transaction } from './db';

describe('money', () => {
  it('lee decimales en formato español e inglés', () => {
    expect(parseDecimal('12,50')).toBe(12.5);
    expect(parseDecimal('12.50')).toBe(12.5);
    expect(parseDecimal('1.234,56')).toBe(1234.56);
    expect(parseDecimal('abc')).toBeNull();
    expect(parseDecimal('')).toBeNull();
  });
  it('convierte a céntimos sin errores de coma flotante', () => {
    expect(toCents('0,29')).toBe(29);
    expect(toCents('1,005')).toBe(101);
  });
  it('formatea en euros', () => {
    expect(formatMoney(123456, 'EUR')).toContain('1234,56');
  });
});

describe('hoja de precios', () => {
  const csv = [
    '"ISIN","Nombre","VL","Fecha","",""',
    '"IE00BYX5MX67","Fidelity S&P 500","16,9271","2026-10-22","",""',
    '"ES0110862010","Aspe Global FI B","","","",""',
    '"N5546","Horos, Internacional","142,28191","2026-10-22","",""',
    '"","","","","",""',
  ].join('\n');
  it('parsea CSV con comas dentro de comillas', () => {
    expect(parseCsv(csv)[3][1]).toBe('Horos, Internacional');
  });
  it('convierte el VL a E5 y marca las filas manuales', () => {
    const q = parseQuotes(csv);
    expect(q).toHaveLength(3);
    expect(q[0]).toMatchObject({ key: 'IE00BYX5MX67', priceE5: 1692710, priceDate: '2026-10-22' });
    expect(q[1]).toMatchObject({ key: 'ES0110862010', priceE5: null, priceDate: null });
    expect(q[2].priceE5).toBe(14228191);
  });
  it('construye la URL con CORS desde el enlace de compartir', () => {
    expect(sheetCsvUrl('https://docs.google.com/spreadsheets/d/AbC_123-x/edit?usp=sharing'))
      .toBe('https://docs.google.com/spreadsheets/d/AbC_123-x/gviz/tq?tqx=out:csv');
    expect(sheetCsvUrl('https://ejemplo.com/x')).toBeNull();
  });
});

describe('saldos', () => {
  const a: Account = { id: 1, name: 'Nómina', initialCents: 100000, currency: 'EUR', color: 'c', archived: 0, createdAt: '' };
  const b: Account = { id: 2, name: 'Ahorro', initialCents: 0, currency: 'EUR', color: 'c', archived: 0, createdAt: '' };
  const usd: Account = { id: 3, name: 'USD', initialCents: 5000, currency: 'USD', color: 'c', archived: 0, createdAt: '' };
  const tx = (p: Partial<Transaction>): Transaction => ({
    date: '2026-10-01', accountId: 1, categoryId: null, kind: 'expense', amountCents: 0, currency: 'EUR', note: '', source: 'manual', ...p,
  });
  const txs = [
    tx({ amountCents: 2500 }),
    tx({ kind: 'income', amountCents: 10000 }),
    tx({ kind: 'transfer', amountCents: 30000, transferAccountId: 2 }),
    tx({ amountCents: 99999, source: 'import' }),
  ];
  it('gasto resta, ingreso suma, transferencia mueve y lo importado no cuenta', () => {
    expect(accountBalance(a, txs)).toBe(100000 - 2500 + 10000 - 30000);
    expect(accountBalance(b, txs)).toBe(30000);
  });
  it('la transferencia no cambia el patrimonio total', () => {
    const only = [txs[2]];
    expect(netWorth([a, b], only, 'EUR').cents).toBe(100000);
  });
  it('deja fuera las cuentas en otra divisa y lo avisa', () => {
    expect(netWorth([a, usd], [], 'EUR')).toEqual({ cents: 100000, excluded: 1 });
  });
});

describe('base de datos', () => {
  it('siembra 16 categorías de gasto y 7 de ingreso una sola vez', async () => {
    const d = new AppDB('test-seed');
    await seedCategories(d);
    await seedCategories(d);
    expect(await d.categories.where('kind').equals('expense').count()).toBe(16);
    expect(await d.categories.where('kind').equals('income').count()).toBe(7);
  });
});
