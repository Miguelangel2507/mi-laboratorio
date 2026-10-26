import { describe, expect, it } from 'vitest';
import type { Asset, MonthClose, Trade } from './db';
import { marketClose, monthEndDate, monthlyReturn, prevMonth, yearResults, yearReturn, type PerfInput } from './performance';

const asset = (id: number, key = 'K' + id): Asset => ({ id, type: 'fund', key, name: key, currency: 'EUR' });
const buy = (id: number, assetId: number, date: string, quantity: number, price: number, side: 'buy' | 'sell' = 'buy'): Trade =>
  ({ id, assetId, date, side, quantity, priceE5: Math.round(price * 1e5) });
const input = (over: Partial<PerfInput> = {}): PerfInput => ({
  assets: [asset(1)], trades: [], closes: [], today: '2026-06-15', currentValueCents: () => 0, ...over,
});
const pct = (x: number | null) => (x === null ? null : Math.round(x * 10000) / 100);

describe('fechas de cierre', () => {
  it('mes anterior y último día, también en año bisiesto y en enero', () => {
    expect(prevMonth('2026-01')).toBe('2025-12');
    expect(prevMonth('2026-03')).toBe('2026-02');
    expect(monthEndDate('2028-02')).toBe('2028-02-29');
    expect(monthEndDate('2026-02')).toBe('2026-02-28');
    expect(monthEndDate('2026-04')).toBe('2026-04-30');
  });
});

describe('Modified Dietz', () => {
  it('pondera una aportación a mitad de mes', () => {
    // 1.000 € a final de mes anterior (importado), +500 € el día 16 de un mes de 30 días, 1.600 € al cierre.
    const i = input({
      today: '2026-07-20',
      assets: [asset(1)],
      trades: [buy(1, 1, '2026-02-01', 100, 10), buy(2, 1, '2026-04-16', 50, 10)],
      closes: [{ month: '2026-03', date: '', source: 'import', marketCents: 100000 }, { month: '2026-04', date: '', source: 'import', marketCents: 160000 }],
    });
    const r = monthlyReturn(i, '2026-04');
    expect(r.flowsCents).toBe(50000);
    expect(pct(r.ret)).toBe(8.11); // 100 / (1000 + 500 × 14/30)
    expect(r.kind).toBe('imported');
  });

  it('el mes de la primera compra rinde 0 % si compras y cierras al mismo precio', () => {
    const i = input({ trades: [buy(1, 1, '2026-02-13', 10, 10)] });
    expect(pct(monthlyReturn(i, '2026-02').ret)).toBe(0);
  });

  it('antes de la primera compra no hay dato', () => {
    const i = input({ trades: [buy(1, 1, '2026-02-13', 10, 10)] });
    expect(monthlyReturn(i, '2026-01').ret).toBeNull();
  });

  it('un mes estimado usa el precio de tu última compra hasta ese día', () => {
    // enero: 10 uds a 10 € = 100 €. febrero: +5 uds a 12 € (día 10); cierre estimado 15 × 12 = 180 €.
    const i = input({ trades: [buy(1, 1, '2026-01-05', 10, 10), buy(2, 1, '2026-02-10', 5, 12)], today: '2026-05-01' });
    const r = monthlyReturn(i, '2026-02');
    expect(r).toMatchObject({ startCents: 10000, endCents: 18000, flowsCents: 6000, kind: 'estimated' });
    expect(pct(r.ret)).toBe(14.43); // 20 / (100 + 60 × 18/28)
  });

  const snap = (month: string, prices: Record<string, number>): MonthClose => ({ month, date: monthEndDate(month), source: 'worker', prices });

  it('con fotos de precios al inicio y al final del mes, el valor es participaciones × precio real y se marca real', () => {
    const i = input({ trades: [buy(1, 1, '2026-01-05', 10, 10)], closes: [snap('2026-01', { K1: 1300000 }), snap('2026-02', { K1: 1500000 })], today: '2026-04-01' });
    const r = monthlyReturn(i, '2026-02');
    expect(r).toMatchObject({ kind: 'real', startCents: 13000, endCents: 15000 });
    expect(pct(r.ret)).toBe(15.38); // 20 / 130
  });

  it('si a un fondo le falta precio en la foto, usa el de su última compra', () => {
    const i = input({ assets: [asset(1), asset(2)], trades: [buy(1, 1, '2026-01-05', 10, 10), buy(2, 2, '2026-01-06', 2, 50)],
      closes: [snap('2026-01', { K1: 1300000 }), snap('2026-02', { K1: 1300000 })], today: '2026-04-01' });
    expect(monthlyReturn(i, '2026-02').endCents).toBe(13000 + 10000);
  });

  it('si solo hay foto en un extremo, el mes se estima entero: no se fabrican subidas ni bajadas', () => {
    // foto real de abril a 12 €, mayo sin foto: sin esta regla mayo saldría −8,3 % por comparar 12 € con tu último precio de compra (11 €)
    const i = input({ trades: [buy(1, 1, '2026-03-10', 15, 11)], closes: [snap('2026-04', { K1: 1200000 })], today: '2026-07-01' });
    const may = monthlyReturn(i, '2026-05');
    expect(may.kind).toBe('estimated');
    expect(pct(may.ret)).toBe(0);
    expect(pct(monthlyReturn(i, '2026-04').ret)).toBe(0); // abril tampoco: su inicio (marzo) no tiene foto
  });

  it('las ventas son flujos de salida', () => {
    const i = input({
      trades: [buy(1, 1, '2026-01-05', 10, 10), buy(2, 1, '2026-02-15', 4, 12, 'sell')],
      closes: [], today: '2026-05-01',
    });
    const r = monthlyReturn(i, '2026-02');
    expect(r.flowsCents).toBe(-4800);
    expect(r.endCents).toBe(7200); // 6 uds × 12 €
  });

  it('el mes en curso usa el valor de hoy y se marca parcial', () => {
    const i = input({ trades: [buy(1, 1, '2026-05-10', 10, 10)], today: '2026-06-15', currentValueCents: () => 11000,
      closes: [{ month: '2026-05', date: '', source: 'import', marketCents: 10000 }] });
    const r = monthlyReturn(i, '2026-06');
    expect(r.partial).toBe(true);
    expect(pct(r.ret)).toBe(10);
  });

  it('el valor de las inversiones fuera de fondos (bienes, deudas) no entra', () => {
    const house: Asset = { id: 9, type: 'other', key: 'm:1', name: 'Reloj', currency: 'EUR', valueCents: 99999 };
    const i = input({ assets: [asset(1), house], trades: [buy(1, 1, '2026-01-05', 10, 10)], today: '2026-03-01' });
    expect(monthlyReturn(i, '2026-01').endCents).toBe(10000);
  });
});

describe('cierres importados de otra app', () => {
  const imp = (month: string, cents: number): MonthClose => ({ month, date: '', source: 'import', marketCents: cents });
  const snap = (month: string, prices: Record<string, number>): MonthClose => ({ month, date: monthEndDate(month), source: 'worker', prices });
  // 10 uds a 10 € el día 1 de febrero, marzo y abril: lo invertido al final de cada mes es 100, 200 y 300 €.
  const base = (closes: MonthClose[]) => input({
    today: '2026-09-20', closes,
    trades: [buy(1, 1, '2026-02-01', 10, 10), buy(2, 1, '2026-03-01', 10, 10), buy(3, 1, '2026-04-01', 10, 10)],
  });

  it('se usan cuando están el mes anterior y el propio y cuadran con tus compras', () => {
    const i = base([imp('2026-02', 10000), imp('2026-03', 20500)]);
    expect(monthlyReturn(i, '2026-03').kind).toBe('imported');
    expect(pct(monthlyReturn(i, '2026-03').ret)).toBe(2.54); // (205 − 100 − 100) / (100 + 100 × 30/31)
  });
  it('si falta uno de los dos extremos se ignoran y el mes se estima con tus compras', () => {
    const r = monthlyReturn(base([imp('2026-03', 5)]), '2026-03');
    expect(r.kind).toBe('estimated');
    expect(r.endCents).toBe(20000);
    expect(pct(r.ret)).toBe(0);
  });
  it('un total que no cuadra con lo invertido (cierre incompleto de otra app) se descarta', () => {
    // 2.500 € con solo 100 € invertidos, y 150 € con 300 € invertidos (faltan fondos): ninguno es creíble
    expect(marketClose(base([imp('2026-02', 250000)]), '2026-02')).toBeNull();
    expect(marketClose(base([imp('2026-04', 15000)]), '2026-04')).toBeNull();
    expect(marketClose(base([imp('2026-04', 27500)]), '2026-04')).toEqual({ cents: 27500, kind: 'imported' }); // −8 %: sí
    const r = monthlyReturn(base([imp('2026-02', 10000), imp('2026-03', 5000), imp('2026-04', 30000)]), '2026-04');
    expect(r.kind).toBe('estimated'); // marzo descartado: el mes se estima
  });
  it('el mes de transición (inicio importado, fin con foto real) se calcula con ambos', () => {
    const i = base([imp('2026-02', 10000), snap('2026-03', { K1: 1100000 })]);
    const r = monthlyReturn(i, '2026-03');
    expect(r).toMatchObject({ kind: 'imported', startCents: 10000, endCents: 22000 });
    expect(pct(r.ret)).toBe(10.16); // 20 / (100 + 100 × 30/31)
  });
  it('real → sin foto: ese mes se estima, sin saltos falsos', () => {
    const i = base([snap('2026-03', { K1: 1100000 })]);
    const apr = monthlyReturn(i, '2026-04');
    expect(apr.kind).toBe('estimated');
    expect(apr.startCents).toBe(20000); // no usa los 220 de la foto
    expect(pct(apr.ret)).toBe(0);
  });
  it('mes en curso: con una foto real al inicio se calcula con el valor de hoy; sin ella, estimado', () => {
    const withStart = { ...base([snap('2026-08', { K1: 1000000 })]), today: '2026-09-20', currentValueCents: () => 31500 };
    const r = monthlyReturn(withStart, '2026-09');
    expect(r).toMatchObject({ kind: 'real', partial: true, startCents: 30000, endCents: 31500 });
    expect(pct(r.ret)).toBe(5);
    const without = { ...base([]), currentValueCents: () => 31500 };
    expect(monthlyReturn(without, '2026-09')).toMatchObject({ kind: 'estimated', partial: true, endCents: 30000 });
  });
  it('un total importado nunca se usa con el mes sin compras todavía salvo que sea cero', () => {
    expect(marketClose(base([imp('2026-01', 5000)]), '2026-01')).toBeNull();
    expect(marketClose(base([imp('2026-01', 0)]), '2026-01')).toEqual({ cents: 0, kind: 'imported' });
  });
});

describe('año', () => {
  it('encadena los meses con dato, deja vacíos los sin dato y los futuros', () => {
    const i = input({ trades: [buy(1, 1, '2026-02-01', 10, 10), buy(2, 1, '2026-03-01', 0.0001, 11)], today: '2026-04-10' });
    const res = yearResults(i, 2026);
    expect(res).toHaveLength(12);
    expect(res[0].ret).toBeNull(); // enero
    expect(res[11].ret).toBeNull(); // diciembre (futuro)
    const manual = res.filter((r) => r.ret !== null).reduce((a, r) => a * (1 + r.ret!), 1) - 1;
    expect(yearReturn(res)).toBeCloseTo(manual, 12);
  });
  it('sin ningún dato no hay rentabilidad', () => {
    expect(yearReturn(yearResults(input(), 2026))).toBeNull();
  });
});
