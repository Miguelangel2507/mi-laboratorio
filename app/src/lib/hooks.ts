import { useLiveQuery } from 'dexie-react-hooks';
import { useEffect } from 'react';
import { db, getSetting, seedCategories } from './db';
import { convertCents, loadRates, refreshRates } from './fx';
import { formatMoney } from './money';
import { runRecurring } from './recurring';
import { todayISO } from './domain';
import { computeNetWorth } from './portfolio';
import { refreshQuotesIfStale } from './quotes';
import { requestPersistence } from './storage';
import { generatePlanRuns } from './plan';

export function useSetting<T>(key: string, fallback: T): T | undefined {
  return useLiveQuery(() => getSetting<T>(key, fallback), [key]);
}

export function useInit() {
  useEffect(() => {
    void (async () => {
      await seedCategories();
      await runRecurring(db, todayISO());
      await generatePlanRuns(db, todayISO());
      await refreshRates();
      await refreshQuotesIfStale();
      await requestPersistence();
    })();
  }, []);
}

/** Número rojo en el icono de la app (iOS 16.4+ con la app instalada), con las aportaciones por confirmar. */
export function usePendingBadge() {
  const n = useLiveQuery(() => db.planRuns.where('status').equals('pending').count(), []);
  useEffect(() => {
    if (n === undefined) return;
    const nav = navigator as Navigator & { setAppBadge?: (n?: number) => Promise<void>; clearAppBadge?: () => Promise<void> };
    try { void (n > 0 ? nav.setAppBadge?.(n) : nav.clearAppBadge?.()); } catch { /* sin soporte */ }
  }, [n]);
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
