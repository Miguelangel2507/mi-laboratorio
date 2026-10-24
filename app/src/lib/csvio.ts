import type { Account, AppDB, Category, Transaction } from './db';
import { parseCsv } from './sheet';
import { parseDecimal, toCents } from './money';
import { inRange } from './dates';

export const CSV_HEADER = ['Fecha', 'Descripción', 'Categoría', 'Tipo', 'Cuenta', 'Importe'];
export const MAX_IMPORT_ROWS = 2000;

const esc = (s: string) => (/[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s);

/** Las transferencias y las inversiones no se exportan: el CSV solo entiende Gasto e Ingreso. */
export function transactionsToCsv(txs: Transaction[], accounts: Account[], cats: Category[], from?: string, to?: string): string {
  const lines = [CSV_HEADER.join(',')];
  for (const t of [...txs].sort((a, b) => a.date.localeCompare(b.date))) {
    if (t.kind === 'transfer' || t.kind === 'invest') continue;
    if (from && to && !inRange(t.date, from, to)) continue;
    const sign = t.kind === 'expense' ? -1 : 1;
    lines.push([
      t.date, t.note, cats.find((c) => c.id === t.categoryId)?.name ?? '',
      t.kind === 'expense' ? 'Gasto' : 'Ingreso', accounts.find((a) => a.id === t.accountId)?.name ?? '',
      ((sign * t.amountCents) / 100).toFixed(2),
    ].map(esc).join(','));
  }
  return lines.join('\n') + '\n';
}

export const CSV_TEMPLATE = `${CSV_HEADER.join(',')}\n2026-01-15,Supermercado,Comida,Gasto,Nómina,-42.30\n2026-01-31,Salario enero,Nómina,Ingreso,Nómina,1800.00\n`;

export function aiInstructions(cats: Category[], accounts: Account[]): string {
  const ex = cats.filter((c) => c.kind === 'expense').map((c) => c.name).join(', ');
  const inc = cats.filter((c) => c.kind === 'income').map((c) => c.name).join(', ');
  const acc = accounts.map((a) => a.name).join(', ') || '(deja la celda vacía)';
  return `Te paso mis movimientos bancarios (extracto en PDF, Excel o CSV). Devuélveme solo un CSV, sin texto antes ni después, con esta cabecera exacta:
${CSV_HEADER.join(',')}

Reglas:
1. Fecha en formato AAAA-MM-DD.
2. Descripción: el nombre limpio del comercio, sin códigos ni referencias.
3. Tipo: "Gasto" o "Ingreso". Importe con punto decimal, negativo en gastos y positivo en ingresos, sin símbolo de moneda.
4. Categoría de gasto: una de ${ex}. Categoría de ingreso: una de ${inc}. Si dudas, deja la celda vacía.
5. Cuenta: una de ${acc}. Si no lo sabes, déjala vacía.
6. Si un campo lleva comas, ponlo entre comillas dobles.
7. No inventes movimientos ni cambies importes. Salta saldos, totales y cabeceras repetidas.`;
}

export interface ImportRow { line: number; tx: Omit<Transaction, 'id'> | null; error?: string; warning?: string }

const normalizeDate = (s: string): string | null => {
  const t = s.trim();
  let m = t.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (m) return t;
  m = t.match(/^(\d{1,2})[/.-](\d{1,2})[/.-](\d{4})$/);
  return m ? `${m[3]}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}` : null;
};

export function parseImport(text: string, accounts: Account[], cats: Category[], defaultAccountId: number | null): { rows: ImportRow[]; tooMany: boolean } {
  const all = parseCsv(text).filter((r) => r.some((c) => c.trim() !== ''));
  const body = all.slice(1);
  const tooMany = body.length > MAX_IMPORT_ROWS;
  const rows = body.slice(0, MAX_IMPORT_ROWS).map((r, i): ImportRow => {
    const line = i + 2;
    const date = normalizeDate(r[0] ?? '');
    if (!date) return { line, tx: null, error: 'Fecha no válida' };
    const amount = parseDecimal(r[5] ?? '', { dotThousands: false });
    if (amount === null || amount === 0) return { line, tx: null, error: 'Importe no válido' };
    const tipo = (r[3] ?? '').trim().toLowerCase();
    const kind = tipo.startsWith('ing') ? 'income' : tipo.startsWith('gas') ? 'expense' : amount < 0 ? 'expense' : 'income';
    const acc = accounts.find((a) => a.name.toLowerCase() === (r[4] ?? '').trim().toLowerCase())
      ?? accounts.find((a) => a.id === defaultAccountId);
    if (!acc) return { line, tx: null, error: 'Sin cuenta' };
    const catName = (r[2] ?? '').trim().toLowerCase();
    const options = cats.filter((c) => c.kind === kind);
    const cat = options.find((c) => c.name.toLowerCase() === catName);
    return {
      line, warning: cat ? undefined : 'Categoría no reconocida: se usará la última de la lista',
      tx: {
        date, accountId: acc.id!, kind, amountCents: toCents(String(Math.abs(amount)), { dotThousands: false })!, currency: acc.currency,
        note: (r[1] ?? '').trim(), source: 'import', categoryId: (cat ?? options.at(-1))?.id ?? null,
      },
    };
  });
  return { rows, tooMany };
}

export async function commitImport(d: AppDB, txs: Omit<Transaction, 'id'>[]): Promise<number> {
  return d.transaction('rw', d.importBatches, d.transactions, async () => {
    const batchId = (await d.importBatches.add({ createdAt: new Date().toISOString(), count: txs.length })) as number;
    await d.transactions.bulkAdd(txs.map((t) => ({ ...t, importBatchId: batchId })));
    return batchId;
  });
}

export async function undoImport(d: AppDB, batchId: number): Promise<void> {
  await d.transaction('rw', d.importBatches, d.transactions, async () => {
    await d.transactions.where('importBatchId').equals(batchId).delete();
    await d.importBatches.delete(batchId);
  });
}
