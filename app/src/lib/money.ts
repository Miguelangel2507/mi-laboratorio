/** Interpreta "12,50", "12.50" o "1.234,56". Devuelve null si no es un número. */
export function parseDecimal(input: string): number | null {
  let s = input.trim().replace(/\s/g, '');
  if (!s) return null;
  if (s.includes(',')) s = s.replace(/\./g, '').replace(',', '.');
  if (!/^-?\d*\.?\d+$/.test(s)) return null;
  return Number(s);
}

/** Céntimos redondeados "half up" sin pasar por coma flotante (1,005 a 101). */
export function toCents(input: string): number | null {
  const n = parseDecimal(input);
  if (n === null) return null;
  const neg = n < 0;
  const [int, frac = ''] = Math.abs(n).toFixed(10).replace(/0+$/, '').split('.');
  const cents = Number(int) * 100 + Number((frac + '00').slice(0, 2)) + (Number(frac[2] ?? 0) >= 5 ? 1 : 0);
  return neg ? -cents : cents;
}

export function formatMoney(cents: number, currency: string, locale = 'es-ES'): string {
  return new Intl.NumberFormat(locale, { style: 'currency', currency }).format(cents / 100);
}
