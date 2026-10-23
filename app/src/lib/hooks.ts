import { useLiveQuery } from 'dexie-react-hooks';
import { useEffect } from 'react';
import { db, getSetting, seedCategories } from './db';
import { formatMoney } from './money';

export function useSetting<T>(key: string, fallback: T): T | undefined {
  return useLiveQuery(() => getSetting<T>(key, fallback), [key]);
}

export function useInit() {
  useEffect(() => { void seedCategories(); }, []);
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

export { db };
