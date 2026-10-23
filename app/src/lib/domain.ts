import type { Account, Transaction } from './db';

/** Saldo = inicial + movimientos manuales y recurrentes. Los importados no lo cambian. */
export function accountBalance(account: Account, txs: Transaction[]): number {
  let cents = account.initialCents;
  for (const t of txs) {
    if (t.source === 'import') continue;
    if (t.accountId === account.id) {
      if (t.kind === 'income') cents += t.amountCents;
      else cents -= t.amountCents; // gasto o transferencia saliente
    } else if (t.kind === 'transfer' && t.transferAccountId === account.id) {
      cents += t.toAmountCents ?? t.amountCents;
    }
  }
  return cents;
}

/** Suma de cuentas en la moneda principal. Las de otra divisa se cuentan aparte hasta tener cambio. */
export function netWorth(accounts: Account[], txs: Transaction[], mainCurrency: string) {
  let cents = 0;
  let excluded = 0;
  for (const a of accounts) {
    if (a.archived) continue;
    if (a.currency !== mainCurrency) { excluded++; continue; }
    cents += accountBalance(a, txs);
  }
  return { cents, excluded };
}

export const todayISO = () => {
  const d = new Date();
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
};
