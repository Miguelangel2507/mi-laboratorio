import { useLiveQuery } from 'dexie-react-hooks';
import { useEffect } from 'react';
import { db, getSetting, seedCategories } from './db';
import { convertCents, loadRates, refreshRates } from './fx';
import { formatMoney } from './money';
import { runRecurring } from './recurring';
import { todayISO } from './domain';
import { computeNetWorth } from './portfolio';
import { refreshQuotesIfStale } from './quotes';

export function useSetting<T>(key: string, fallback: T): T | undefined {
  return useLiveQuery(() => getSetting<T>(key, fallback), [key]);
}

export function useInit() {
  useEffect(() => {
    void (async () => {
      await seedCategories();
      await runRecurring(db, todayISO());
      await refreshRates();
      await refreshQuotesIfStale();
      try { await navigator.storage?.persist?.(); } catch { /* no disponible */ }
    })();
  }, []);
}

export function useTheme() {
  const theme = useSetting<'auto' | 'light' | 'dark'>('theme', 'auto');
  useEffect(() => {
    const el = document.documentElement;
    if (!theme || theme === 'auto') el.removeAttribute('data-theme');
    else el.setAttribute('data-theme', theme);
  }, [theme]);
}

export function useMoney() {
  const hide = useSetting<boolean>('hideBalances', false);
  return (cents: number, currency: string) => (hide ? '•••••' : formatMoney(cents, currency));
}

export function useFx() {
  const main = useSetting<string>('currency', 'EUR') ?? 'EUR';
  const rates = useLiveQuery(() => loadRates(), []);
  return { main, rates, conv: (cents: number, from: string) => convertCents(cents, from, main, rates) };
}

export function useNetWorth() {
  const { main, rates } = useFx();
  const data = useLiveQuery(async () => ({
    accounts: await db.accounts.toArray(), txs: await db.transactions.toArray(), assets: await db.assets.toArray(),
    trades: await db.trades.toArray(), quotes: await db.quotes.toArray(),
  }), []);
  return { main, data, result: data ? computeNetWorth(data, main, rates) : undefined };
}

export { db };
