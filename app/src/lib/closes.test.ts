import { describe, expect, it } from 'vitest';
import { AppDB, type MonthClose } from './db';
import { applyLegacyCloses, parseLegacyCloses, planLegacyCloses, upsertSnapshots } from './closes';
import { exportBackup, restoreBackup, validateBackup } from './backup';

const fresh = () => new AppDB(`closes-${Math.random()}`);
const legacy = { monthlyCloses: [
  { month: '2026-02', market: 99.99, invested: 99.99, perFund: {} },
  { month: '2026-09', market: 2455.09, invested: 2519.03, perFund: {} },
  { month: '2026-10', market: 2474.73, invested: 2519.03, perFund: {} },
  { month: 'mal', market: 1 }, { month: '2026-05', market: 'x' }, null,
] };

describe('cierres de la app anterior', () => {
  it('lee los válidos en euros → céntimos, ordenados, y descarta lo raro', () => {
    const l = parseLegacyCloses(legacy)!;
    expect(l.map((c) => c.month)).toEqual(['2026-02', '2026-09', '2026-10']);
    expect(l[1]).toEqual({ month: '2026-09', marketCents: 245509, investedCents: 251903 });
  });
  it('un archivo que no es de esa app no se reconoce', () => {
    expect(parseLegacyCloses({ app: 'mi-patrimonio' })).toBeNull();
    expect(parseLegacyCloses(null)).toBeNull();
  });
  it('no trae el mes en curso ni pisa un cierre real, y no repite', () => {
    const real: MonthClose = { month: '2026-09', date: '2026-09-30', source: 'worker', prices: { A: 1 } };
    const plan = planLegacyCloses(parseLegacyCloses(legacy)!, [real], '2026-10-26');
    expect(plan.add.map((c) => c.month)).toEqual(['2026-02']);
    expect(plan.skipped).toEqual([{ month: '2026-09', reason: 'ya tienes un cierre real' }, { month: '2026-10', reason: 'mes sin terminar' }]);
  });
  it('se importa una vez y la segunda no añade nada', async () => {
    const d = fresh();
    expect(await applyLegacyCloses(d, parseLegacyCloses(legacy)!, '2026-10-26')).toBe(2);
    expect(await applyLegacyCloses(d, parseLegacyCloses(legacy)!, '2026-10-26')).toBe(0);
    expect(await d.monthCloses.count()).toBe(2);
    expect((await d.monthCloses.where('month').equals('2026-02').first())).toMatchObject({ source: 'import', marketCents: 9999, date: '2026-02-28' });
  });
});

describe('fotos de precios del servicio', () => {
  it('guardan los precios válidos y sustituyen a un total importado de ese mes', async () => {
    const d = fresh();
    await applyLegacyCloses(d, parseLegacyCloses(legacy)!, '2026-10-26');
    const n = await upsertSnapshots(d, [{ month: '2026-09', date: '2026-09-30', prices: { A: 1000000.4, B: -3, C: NaN as never, D: 5 } }]);
    expect(n).toBe(1);
    const row = (await d.monthCloses.where('month').equals('2026-09').first())!;
    expect(row).toMatchObject({ source: 'worker', prices: { A: 1000000, D: 5 } });
    expect(row.marketCents).toBeUndefined();
  });
  it('es idempotente y rechaza meses o fotos vacías', async () => {
    const d = fresh();
    const s = { month: '2026-10', date: '2026-10-31', prices: { A: 100 } };
    expect(await upsertSnapshots(d, [s])).toBe(1);
    expect(await upsertSnapshots(d, [s])).toBe(0);
    expect(await upsertSnapshots(d, [{ month: 'x', date: '', prices: { A: 1 } }, { month: '2026-11', date: '', prices: {} }])).toBe(0);
    expect(await d.monthCloses.count()).toBe(1);
  });
});

describe('consultas por origen', () => {
  it('se pueden contar y borrar los cierres por origen (el campo está indexado)', async () => {
    const d = fresh();
    await applyLegacyCloses(d, parseLegacyCloses(legacy)!, '2026-10-26');
    await upsertSnapshots(d, [{ month: '2026-09', date: '2026-09-30', prices: { A: 5 } }]);
    expect(await d.monthCloses.where('source').equals('import').count()).toBe(1);
    expect(await d.monthCloses.where('source').equals('worker').count()).toBe(1);
    await d.monthCloses.where('source').equals('import').delete();
    expect(await d.monthCloses.count()).toBe(1);
  });
});

describe('copia de seguridad con cierres', () => {
  it('los cierres viajan en la copia y una copia antigua sin ellos sigue siendo válida', async () => {
    const d = fresh();
    await applyLegacyCloses(d, parseLegacyCloses(legacy)!, '2026-10-26');
    const b = JSON.parse(JSON.stringify(await exportBackup(d, { includeSheetUrl: false })));
    expect(validateBackup(b)).toEqual([]);
    const e = fresh();
    await restoreBackup(e, b);
    expect(await e.monthCloses.count()).toBe(2);
    delete b.data.monthCloses;
    expect(validateBackup(b)).toEqual([]);
    await restoreBackup(e, b);
    expect(await e.monthCloses.count()).toBe(0);
  });

  it('lee también los precios por fondo y mes (`snapshots`) de la app anterior', async () => {
    const l = parseLegacyCloses({ snapshots: { '2026-06': { IE1: 16.0779, N5546: 143.45525, MAL: -1 }, '2026-13': { A: 1 }, '2026-07': {} } });
    expect(l).toEqual([{ month: '2026-06', marketCents: null, investedCents: null, prices: { IE1: 1607790, N5546: 14345525 } }]);
    const d = new AppDB('snap-legacy');
    await applyLegacyCloses(d, l!, '2026-10-26');
    expect(await d.monthCloses.toArray()).toMatchObject([{ month: '2026-06', source: 'import', date: '2026-06-30', prices: { IE1: 1607790 } }]);
    expect((await d.monthCloses.toArray())[0].marketCents).toBeUndefined();
    await d.delete();
  });
});
