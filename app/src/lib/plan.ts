import { getSetting, type AppDB, type PlanConfig, type PlanRun } from './db';
import { addMonths, daysInMonth } from './dates';

export const DEFAULT_PLAN: PlanConfig = { day: 1, accountId: null, active: true };

const pad = (n: number) => String(n).padStart(2, '0');

/** Día de cobro dentro de un mes (AAAA-MM), recortado al último día si el mes es corto. */
export function dueDateFor(month: string, day: number): string {
  const [y, m] = month.split('-').map(Number);
  return `${month}-${pad(Math.min(day, daysInMonth(y, m - 1)))}`;
}

/** Primer mes en el que toca aportar: este mes si el día aún no ha pasado, si no el siguiente. */
export function nextStartMonth(today: string, day: number): string {
  const month = today.slice(0, 7);
  return dueDateFor(month, day) >= today ? month : addMonths(`${month}-01`, 1).slice(0, 7);
}

export function monthsFrom(start: string, end: string): string[] {
  const out: string[] = [];
  for (let m = start, guard = 0; m <= end && guard < 600; m = addMonths(`${m}-01`, 1).slice(0, 7), guard++) out.push(m);
  return out;
}

/** Crea las aportaciones vencidas como «pendientes». Idempotente (índice único fondo+mes). */
export async function generatePlanRuns(d: AppDB, today: string): Promise<number> {
  const cfg = await getSetting<PlanConfig>('plan', DEFAULT_PLAN, d);
  if (!cfg.active) return 0;
  const items = await d.planItems.where('active').equals(1).toArray();
  return d.transaction('rw', d.planRuns, async () => {
    let created = 0;
    for (const it of items) {
      for (const month of monthsFrom(it.startMonth, today.slice(0, 7))) {
        const dueDate = dueDateFor(month, cfg.day);
        if (dueDate > today) continue;
        // Se comprueba antes de crear (en vez de provocar un error de clave duplicada): dentro de la
        // transacción nadie más puede colarse, y así no hay excepciones que el navegador gestione mal.
        const exists = await d.planRuns.where('[itemId+month]').equals([it.id!, month]).count();
        if (exists) continue;
        await d.planRuns.add({ itemId: it.id!, month, dueDate, amountCents: it.amountCents, status: 'pending' });
        created++;
      }
    }
    return created;
  });
}

export interface ConfirmInput { amountCents: number; date: string; priceE5: number; accountId: number }

/**
 * Confirma una aportación: compra participaciones, descuenta el dinero de la cuenta
 * y deja constancia. Todo en una transacción: si algo falla, no queda nada a medias.
 */
export async function confirmRun(d: AppDB, runId: number, input: ConfirmInput, today: string): Promise<void> {
  if (!(input.amountCents > 0)) throw new Error('El importe debe ser mayor que 0.');
  if (!(input.priceE5 > 0)) throw new Error('Indica el precio por participación.');
  if (input.date > today) throw new Error('La fecha no puede ser futura.');
  await d.transaction('rw', [d.planRuns, d.planItems, d.assets, d.trades, d.transactions, d.accounts, d.quotes], async () => {
    const run = await d.planRuns.get(runId);
    if (!run || run.status !== 'pending') throw new Error('Esta aportación ya no está pendiente.');
    const item = await d.planItems.get(run.itemId);
    if (!item) throw new Error('El fondo del plan ya no existe.');
    const account = await d.accounts.get(input.accountId);
    if (!account) throw new Error('Elige la cuenta de la que sale el dinero.');
    if (account.currency !== 'EUR') throw new Error('La cuenta de origen debe estar en EUR.');

    let asset = await d.assets.where('key').equals(item.assetKey).first();
    if (!asset) {
      const id = (await d.assets.add({ type: 'fund', key: item.assetKey, name: item.name, currency: 'EUR', manualPriceE5: null })) as number;
      asset = (await d.assets.get(id))!;
    }
    const quantity = Math.round(((input.amountCents * 1000) / input.priceE5) * 1e6) / 1e6;
    const tradeId = (await d.trades.add({ assetId: asset.id!, date: input.date, side: 'buy', quantity, priceE5: input.priceE5 })) as number;
    const txId = (await d.transactions.add({
      date: input.date, accountId: account.id!, categoryId: null, kind: 'invest', amountCents: input.amountCents,
      currency: 'EUR', note: item.name, source: 'manual', tradeId,
    })) as number;
    // Si la hoja no da precio a este fondo, el que pones aquí pasa a ser su precio manual.
    const q = await d.quotes.get(item.assetKey);
    if (q?.priceE5 == null) await d.assets.update(asset.id!, { manualPriceE5: input.priceE5 });
    await d.planRuns.update(runId, { status: 'confirmed', tradeId, txId, confirmedAt: new Date().toISOString() });
  });
}

export async function undoRun(d: AppDB, runId: number): Promise<void> {
  await d.transaction('rw', [d.planRuns, d.trades, d.transactions], async () => {
    const run = await d.planRuns.get(runId);
    if (!run || run.status !== 'confirmed') throw new Error('Esta aportación no está confirmada.');
    if (run.tradeId) await d.trades.delete(run.tradeId);
    if (run.txId) await d.transactions.delete(run.txId);
    await d.planRuns.update(runId, { status: 'pending', tradeId: undefined, txId: undefined, confirmedAt: undefined });
  });
}

export const skipRun = (d: AppDB, runId: number) => d.planRuns.update(runId, { status: 'skipped' });
export const reopenRun = (d: AppDB, runId: number) => d.planRuns.update(runId, { status: 'pending' });

export const pendingCount = (runs: PlanRun[]) => runs.filter((r) => r.status === 'pending').length;
